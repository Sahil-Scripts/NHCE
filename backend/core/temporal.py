"""
AEGIS — Temporal Pattern Engine (Stage D)
Detects time-based fraud signals:
  - Velocity micro-bursts (many txns in a very short window)
  - Dormant account reactivation
  - Time-windowed round-trip flows (funds leave and return < 24h)
  - Timed threshold-split patterns
"""

import numpy as np
import pandas as pd
from datetime import timedelta


# Configurable thresholds
VELOCITY_BURST_WINDOW_MINUTES = 30
VELOCITY_BURST_COUNT_THRESHOLD = 5
DORMANCY_THRESHOLD_DAYS = 90
ROUND_TRIP_WINDOW_HOURS = 24
SPLIT_WINDOW_MINUTES = 120


class TemporalEngine:
    """Detects temporal fraud patterns from transaction history."""

    def __init__(self, df: pd.DataFrame):
        self.df = df.copy()
        self.df["timestamp"] = pd.to_datetime(self.df["timestamp"], format="ISO8601")
        self.df = self.df.sort_values("timestamp")

    def analyze(self, txn_id: str) -> dict:
        """
        Analyze temporal patterns for a specific transaction.

        Returns:
            {
              "velocity_burst": bool,
              "velocity_burst_count": int,
              "velocity_burst_window_min": int,
              "dormant_reactivation": bool,
              "dormancy_days": float,
              "round_trip_detected": bool,
              "round_trip_hours": float,
              "threshold_split_pattern": bool,
              "split_count": int,
              "split_window_minutes": int,
              "temporal_risk_score": float,  # [0, 10]
              "anomalies": list
            }
        """
        row = self.df[self.df["txn_id"] == txn_id]
        if row.empty:
            return self._empty_result(txn_id)
        row = row.iloc[0]
        sender   = row["sender_id"]
        receiver = row["receiver_id"]
        ts       = row["timestamp"]
        amount   = row["amount_inr"]

        sender_history = self.df[
            (self.df["sender_id"] == sender) &
            (self.df["timestamp"] < ts)
        ].sort_values("timestamp")

        result = {
            "txn_id":                   txn_id,
            "velocity_burst":           False,
            "velocity_burst_count":     0,
            "velocity_burst_window_min": VELOCITY_BURST_WINDOW_MINUTES,
            "dormant_reactivation":     False,
            "dormancy_days":            0.0,
            "round_trip_detected":      False,
            "round_trip_hours":         0.0,
            "threshold_split_pattern":  False,
            "split_count":              0,
            "split_window_minutes":     SPLIT_WINDOW_MINUTES,
            "temporal_risk_score":      0.0,
            "anomalies":                [],
        }

        # 1. Velocity burst detection
        burst_window_start = ts - timedelta(minutes=VELOCITY_BURST_WINDOW_MINUTES)
        burst_txns = sender_history[sender_history["timestamp"] >= burst_window_start]
        burst_count = len(burst_txns)
        if burst_count >= VELOCITY_BURST_COUNT_THRESHOLD:
            result["velocity_burst"]       = True
            result["velocity_burst_count"] = burst_count
            result["anomalies"].append(
                f"VELOCITY BURST: {burst_count} txns in {VELOCITY_BURST_WINDOW_MINUTES}min"
            )

        # 2. Dormant account reactivation
        if len(sender_history) > 0:
            last_txn = sender_history["timestamp"].max()
            dormancy_days = (ts - last_txn).total_seconds() / 86400
            result["dormancy_days"] = round(dormancy_days, 1)
            if dormancy_days > DORMANCY_THRESHOLD_DAYS and amount > 50_000:
                result["dormant_reactivation"] = True
                result["anomalies"].append(
                    f"DORMANT REACTIVATION: {dormancy_days:.0f} days idle, "
                    f"then ₹{amount:,.0f}"
                )
        else:
            result["dormancy_days"] = 999.0

        # 3. Round-trip detection — did money sent to receiver come back?
        rtrip_window_end   = ts + timedelta(hours=ROUND_TRIP_WINDOW_HOURS)
        return_txns = self.df[
            (self.df["sender_id"] == receiver) &
            (self.df["receiver_id"] == sender) &
            (self.df["timestamp"] > ts) &
            (self.df["timestamp"] <= rtrip_window_end)
        ]
        if not return_txns.empty:
            earliest_return = return_txns["timestamp"].min()
            round_trip_h    = (earliest_return - ts).total_seconds() / 3600
            result["round_trip_detected"] = True
            result["round_trip_hours"]    = round(round_trip_h, 2)
            result["anomalies"].append(
                f"ROUND-TRIP: funds returned in {round_trip_h:.1f}h"
            )

        # 4. Threshold split pattern — multiple txns just below ₹2L in short window
        split_window_start = ts - timedelta(minutes=SPLIT_WINDOW_MINUTES)
        split_txns = sender_history[
            (sender_history["timestamp"] >= split_window_start) &
            (sender_history["amount_inr"] >= 150_000) &
            (sender_history["amount_inr"] < 200_000)
        ]
        split_count = len(split_txns)
        if split_count >= 2 or (split_count >= 1 and 150_000 <= amount < 200_000):
            result["threshold_split_pattern"] = True
            result["split_count"]             = split_count + (1 if 150_000 <= amount < 200_000 else 0)
            result["anomalies"].append(
                f"THRESHOLD STRUCTURING: {result['split_count']} near-₹2L txns "
                f"in {SPLIT_WINDOW_MINUTES}min"
            )

        # 5. Composite temporal risk score [0–10]
        risk = 0.0
        risk += min(burst_count * 0.4, 3.0) if result["velocity_burst"] else 0.0
        risk += 2.5 if result["dormant_reactivation"] else 0.0
        risk += 3.0 if result["round_trip_detected"] else 0.0
        risk += min(result["split_count"] * 0.8, 2.0) if result["threshold_split_pattern"] else 0.0
        result["temporal_risk_score"] = round(min(risk, 10.0), 2)

        return result

    def _empty_result(self, txn_id: str) -> dict:
        return {
            "txn_id": txn_id, "velocity_burst": False, "velocity_burst_count": 0,
            "velocity_burst_window_min": VELOCITY_BURST_WINDOW_MINUTES,
            "dormant_reactivation": False, "dormancy_days": 0.0,
            "round_trip_detected": False, "round_trip_hours": 0.0,
            "threshold_split_pattern": False, "split_count": 0,
            "split_window_minutes": SPLIT_WINDOW_MINUTES,
            "temporal_risk_score": 0.0, "anomalies": [],
        }
