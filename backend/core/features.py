"""
AEGIS — Feature Engineering Pipeline
Generates 40+ features from raw transaction data for XGBoost scoring.
"""

import numpy as np
import pandas as pd
from pathlib import Path


def engineer_features(df: pd.DataFrame, accounts_df: pd.DataFrame = None) -> pd.DataFrame:
    """
    Takes raw transaction DataFrame and returns a feature matrix.
    All features are computed per-transaction using window lookbacks.
    """
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="ISO8601")
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Load account metadata if available
    acc_meta = {}
    if accounts_df is not None:
        for _, row in accounts_df.iterrows():
            acc_meta[row["id"]] = row.to_dict()

    features = []
    # Pre-compute sender-grouped stats for efficiency
    sender_groups = df.groupby("sender_id")
    sender_stats = sender_groups["amount_inr"].agg(["mean", "std", "count"]).rename(
        columns={"mean": "sender_mean_amt", "std": "sender_std_amt", "count": "sender_txn_count"}
    )
    df = df.join(sender_stats, on="sender_id")
    df["sender_std_amt"] = df["sender_std_amt"].fillna(0)

    for idx, row in df.iterrows():
        f = _compute_row_features(df, row, idx, acc_meta)
        features.append(f)

    feat_df = pd.DataFrame(features, index=df.index)
    return feat_df


def extract_transaction_features(df: pd.DataFrame, txn_id: str, accounts_df: pd.DataFrame = None) -> dict:
    """Extract full feature vector for a specific transaction against the historical dataset."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="ISO8601")
    df = df.sort_values("timestamp").reset_index(drop=True)

    match = df[df["txn_id"] == txn_id]
    if match.empty:
        raise ValueError(f"Transaction {txn_id} not found in dataset")
    row = match.iloc[0]
    idx = match.index[0]

    acc_meta = {}
    if accounts_df is not None:
        for _, acc_row in accounts_df.iterrows():
            acc_meta[acc_row["id"]] = acc_row.to_dict()

    sender_mean = df[df["sender_id"] == row["sender_id"]]["amount_inr"].mean()
    sender_std  = df[df["sender_id"] == row["sender_id"]]["amount_inr"].std()
    row_with_stats = row.copy()
    row_with_stats["sender_mean_amt"] = sender_mean if pd.notnull(sender_mean) else row["amount_inr"]
    row_with_stats["sender_std_amt"]  = sender_std if pd.notnull(sender_std) else 1.0

    return _compute_row_features(df, row_with_stats, idx, acc_meta)


def _compute_row_features(df: pd.DataFrame, row: pd.Series, idx: int, acc_meta: dict) -> dict:
    """Compute all features for a single transaction."""
    ts         = row["timestamp"]
    sender     = row["sender_id"]
    receiver   = row["receiver_id"]
    amount     = row["amount_inr"]

    # ── Window masks ──────────────────────────────────────────────────────────
    sender_mask = df["sender_id"] == sender
    past_mask   = df["timestamp"] < ts
    past_sender = df[sender_mask & past_mask]

    w1h  = ts - pd.Timedelta(hours=1)
    w6h  = ts - pd.Timedelta(hours=6)
    w24h = ts - pd.Timedelta(hours=24)
    w7d  = ts - pd.Timedelta(days=7)
    w30d = ts - pd.Timedelta(days=30)

    past_1h  = past_sender[past_sender["timestamp"] >= w1h]
    past_6h  = past_sender[past_sender["timestamp"] >= w6h]
    past_24h = past_sender[past_sender["timestamp"] >= w24h]
    past_7d  = past_sender[past_sender["timestamp"] >= w7d]
    past_30d = past_sender[past_sender["timestamp"] >= w30d]

    # ── Account metadata ──────────────────────────────────────────────────────
    sender_meta   = acc_meta.get(sender, {})
    receiver_meta = acc_meta.get(receiver, {})

    sender_mean   = row.get("sender_mean_amt", amount)
    sender_std    = row.get("sender_std_amt", 1.0)
    if sender_std < 1:
        sender_std = 1.0

    # ── 1. Amount features ────────────────────────────────────────────────────
    amount_zscore       = (amount - sender_mean) / sender_std
    amount_log          = np.log1p(amount)
    below_threshold     = float(amount < 200_000)
    near_threshold      = float(180_000 <= amount <= 199_999)
    amount_pct_of_mean  = amount / max(sender_mean, 1)
    amount_bucket       = int(np.log10(max(amount, 1)))

    # ── 2. Velocity features ──────────────────────────────────────────────────
    velocity_1h   = len(past_1h)
    velocity_6h   = len(past_6h)
    velocity_24h  = len(past_24h)
    velocity_7d   = len(past_7d)
    velocity_30d  = len(past_30d)
    velocity_ratio_1h_24h = velocity_1h / max(velocity_24h, 1)
    velocity_ratio_6h_7d  = velocity_6h  / max(velocity_7d, 1)
    amt_velocity_1h  = past_1h["amount_inr"].sum() if len(past_1h) > 0 else 0
    amt_velocity_24h = past_24h["amount_inr"].sum() if len(past_24h) > 0 else 0

    # ── 3. Dormancy features ──────────────────────────────────────────────────
    if len(past_sender) > 0:
        last_txn_time = past_sender["timestamp"].max()
        dormancy_days = (ts - last_txn_time).total_seconds() / 86400
    else:
        dormancy_days = 999.0   # No history → effectively dormant
    is_dormant_reactivation = float(dormancy_days > 90 and amount > 100_000)

    # ── 4. Threshold-split features ───────────────────────────────────────────
    # Count how many recent txns by this sender are just below threshold
    split_candidates = past_24h[
        (past_24h["amount_inr"] >= 150_000) &
        (past_24h["amount_inr"] < 200_000)
    ]
    threshold_split_count = len(split_candidates)
    threshold_split_score = threshold_split_count * near_threshold

    # ── 5. Receiver features ──────────────────────────────────────────────────
    recv_mask    = df["receiver_id"] == receiver
    recv_incoming = df[recv_mask & past_mask]
    receiver_in_count_24h = len(recv_incoming[recv_incoming["timestamp"] >= w24h])
    receiver_in_amt_24h   = recv_incoming[recv_incoming["timestamp"] >= w24h]["amount_inr"].sum()

    # ── 6. Sender-receiver relationship ──────────────────────────────────────
    pair_mask = sender_mask & (df["receiver_id"] == receiver) & past_mask
    pair_count_30d  = len(df[pair_mask & (df["timestamp"] >= w30d)])
    pair_total_30d  = df[pair_mask & (df["timestamp"] >= w30d)]["amount_inr"].sum()
    is_new_counterparty = float(pair_count_30d == 0)

    # ── 7. Account-type features ──────────────────────────────────────────────
    is_sender_shell      = float(sender_meta.get("is_shell", False))
    is_receiver_shell    = float(receiver_meta.get("is_shell", False))
    is_sender_dormant    = float(sender_meta.get("is_dormant", False))
    is_receiver_dormant  = float(receiver_meta.get("is_dormant", False))
    sender_watchlisted   = float(sender_meta.get("watchlisted", False))
    receiver_watchlisted = float(receiver_meta.get("watchlisted", False))
    kyc_risk_map = {"LOW": 0, "MEDIUM": 1, "HIGH": 2}
    sender_kyc_risk   = kyc_risk_map.get(sender_meta.get("kyc_risk", "LOW"), 0)
    receiver_kyc_risk = kyc_risk_map.get(receiver_meta.get("kyc_risk", "LOW"), 0)

    # ── 8. Time features ──────────────────────────────────────────────────────
    hour_of_day   = ts.hour
    day_of_week   = ts.dayofweek
    is_weekend    = float(day_of_week >= 5)
    is_night_txn  = float(hour_of_day < 6 or hour_of_day >= 22)

    # ── 9. Network diversity ──────────────────────────────────────────────────
    unique_receivers_24h = df[sender_mask & past_mask & (df["timestamp"] >= w24h)]["receiver_id"].nunique()
    unique_receivers_7d  = df[sender_mask & past_mask & (df["timestamp"] >= w7d)]["receiver_id"].nunique()
    fan_out_ratio = unique_receivers_24h / max(velocity_24h, 1)

    # ── 10. Composite risk signals ────────────────────────────────────────────
    structuring_score = (
        near_threshold * 2.0 +
        threshold_split_count * 0.5 +
        float(velocity_1h > 3) * 1.5
    )
    shell_risk_score = (
        is_sender_shell * 3.0 +
        is_receiver_shell * 2.5 +
        sender_watchlisted * 4.0 +
        receiver_watchlisted * 3.5
    )
    velocity_risk_score = (
        float(velocity_1h > 5) * 2.0 +
        float(velocity_6h > 15) * 1.5 +
        float(amt_velocity_1h > 1_000_000) * 2.5
    )

    return {
        # Amount
        "amount_inr":              amount,
        "amount_log":              amount_log,
        "amount_zscore":           amount_zscore,
        "amount_pct_of_mean":      amount_pct_of_mean,
        "amount_bucket":           amount_bucket,
        "below_threshold":         below_threshold,
        "near_threshold":          near_threshold,
        # Velocity
        "velocity_1h":             velocity_1h,
        "velocity_6h":             velocity_6h,
        "velocity_24h":            velocity_24h,
        "velocity_7d":             velocity_7d,
        "velocity_30d":            velocity_30d,
        "velocity_ratio_1h_24h":   velocity_ratio_1h_24h,
        "velocity_ratio_6h_7d":    velocity_ratio_6h_7d,
        "amt_velocity_1h":         amt_velocity_1h,
        "amt_velocity_24h":        amt_velocity_24h,
        # Dormancy
        "dormancy_days":           dormancy_days,
        "is_dormant_reactivation": is_dormant_reactivation,
        # Structuring
        "threshold_split_count":   threshold_split_count,
        "threshold_split_score":   threshold_split_score,
        "structuring_score":       structuring_score,
        # Receiver
        "receiver_in_count_24h":   receiver_in_count_24h,
        "receiver_in_amt_24h":     receiver_in_amt_24h,
        # Pair
        "pair_count_30d":          pair_count_30d,
        "pair_total_30d":          pair_total_30d,
        "is_new_counterparty":     is_new_counterparty,
        # Account types
        "is_sender_shell":         is_sender_shell,
        "is_receiver_shell":       is_receiver_shell,
        "is_sender_dormant":       is_sender_dormant,
        "is_receiver_dormant":     is_receiver_dormant,
        "sender_watchlisted":      sender_watchlisted,
        "receiver_watchlisted":    receiver_watchlisted,
        "sender_kyc_risk":         sender_kyc_risk,
        "receiver_kyc_risk":       receiver_kyc_risk,
        # Time
        "hour_of_day":             hour_of_day,
        "day_of_week":             day_of_week,
        "is_weekend":              is_weekend,
        "is_night_txn":            is_night_txn,
        # Network
        "unique_receivers_24h":    unique_receivers_24h,
        "unique_receivers_7d":     unique_receivers_7d,
        "fan_out_ratio":           fan_out_ratio,
        # Composite
        "shell_risk_score":        shell_risk_score,
        "velocity_risk_score":     velocity_risk_score,
    }


FEATURE_COLUMNS = [
    "amount_inr", "amount_log", "amount_zscore", "amount_pct_of_mean",
    "amount_bucket", "below_threshold", "near_threshold",
    "velocity_1h", "velocity_6h", "velocity_24h", "velocity_7d", "velocity_30d",
    "velocity_ratio_1h_24h", "velocity_ratio_6h_7d",
    "amt_velocity_1h", "amt_velocity_24h",
    "dormancy_days", "is_dormant_reactivation",
    "threshold_split_count", "threshold_split_score", "structuring_score",
    "receiver_in_count_24h", "receiver_in_amt_24h",
    "pair_count_30d", "pair_total_30d", "is_new_counterparty",
    "is_sender_shell", "is_receiver_shell",
    "is_sender_dormant", "is_receiver_dormant",
    "sender_watchlisted", "receiver_watchlisted",
    "sender_kyc_risk", "receiver_kyc_risk",
    "hour_of_day", "day_of_week", "is_weekend", "is_night_txn",
    "unique_receivers_24h", "unique_receivers_7d", "fan_out_ratio",
    "shell_risk_score", "velocity_risk_score",
]
