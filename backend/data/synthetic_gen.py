"""
AEGIS — Synthetic Transaction Data Generator
Generates a realistic financial transaction dataset with:
- Normal/clean transactions
- Shell company layering patterns (3-12 hop chains)
- Circular fund loops (money returns to origin)
- Velocity micro-burst patterns
- Dormant account reactivation
- Threshold-split transactions (just below ₹2L)
"""

import numpy as np
import pandas as pd
import random
import json
from datetime import datetime, timedelta
from pathlib import Path

np.random.seed(42)
random.seed(42)

# ── Constants ──────────────────────────────────────────────────────────────────
NUM_ACCOUNTS      = 500
NUM_TRANSACTIONS  = 8000
NUM_SHELL_RINGS   = 12
THRESHOLD_INR     = 200_000   # ₹2 lakh — the AML trigger threshold
FRAUD_RATIO       = 0.18      # 18% of transactions are suspicious

OUTPUT_DIR = Path(__file__).parent
OUTPUT_CSV = OUTPUT_DIR / "sample_transactions.csv"
OUTPUT_GRAPH = OUTPUT_DIR / "transaction_graph.json"


# ── Account universe ───────────────────────────────────────────────────────────
def generate_accounts(n: int) -> dict:
    """Generate account metadata."""
    account_types = ["SAVINGS", "CURRENT", "NRO", "SHELL", "DORMANT"]
    type_weights  = [0.50, 0.25, 0.08, 0.10, 0.07]
    accounts = {}
    for i in range(n):
        acc_id = f"ACC_{i:04d}"
        acc_type = random.choices(account_types, type_weights)[0]
        accounts[acc_id] = {
            "id":           acc_id,
            "type":         acc_type,
            "is_shell":     acc_type == "SHELL",
            "is_dormant":   acc_type == "DORMANT",
            "watchlisted":  random.random() < 0.04,
            "avg_txn_amt":  np.random.lognormal(10.5, 1.2),   # mean ~₹36k
            "open_date":    datetime(2018, 1, 1) + timedelta(days=random.randint(0, 2000)),
            "last_active":  None,
            "kyc_risk":     random.choices(["LOW", "MEDIUM", "HIGH"], [0.6, 0.3, 0.1])[0],
        }
    return accounts


# ── Shell ring topology ────────────────────────────────────────────────────────
def build_shell_rings(accounts: dict) -> list:
    """Build 3-12 hop shell chains and circular loops."""
    shell_ids = [a for a, d in accounts.items() if d["is_shell"]]
    rings = []
    for _ in range(NUM_SHELL_RINGS):
        hop_count = random.randint(3, 8)
        ring_nodes = random.sample(shell_ids, min(hop_count, len(shell_ids)))
        # Close the loop — last node sends back to first
        ring_nodes.append(ring_nodes[0])
        rings.append(ring_nodes)
    return rings


# ── Transaction generators ─────────────────────────────────────────────────────
def make_txn(txn_id: str, sender: str, receiver: str,
             amount: float, ts: datetime,
             label: int, fraud_type: str = "CLEAN") -> dict:
    return {
        "txn_id":         txn_id,
        "sender_id":      sender,
        "receiver_id":    receiver,
        "amount_inr":     round(amount, 2),
        "timestamp":      ts.isoformat(),
        "label":          label,           # 0 = clean, 1 = suspicious
        "fraud_type":     fraud_type,
    }


def generate_clean_transactions(accounts: dict, n: int, start_ts: datetime) -> list:
    acc_list = list(accounts.keys())
    txns = []
    for i in range(n):
        sender   = random.choice(acc_list)
        receiver = random.choice([a for a in acc_list if a != sender])
        amt      = max(100, np.random.lognormal(10.5, 1.5))
        ts       = start_ts + timedelta(seconds=random.randint(0, 180 * 86400))
        txns.append(make_txn(f"TXN_{i:06d}", sender, receiver, amt, ts, 0, "CLEAN"))
    return txns


def generate_shell_layering(accounts: dict, rings: list, n: int, start_ts: datetime, id_offset: int) -> list:
    """Generate shell-chain transactions — spread across time to evade velocity rules."""
    txns = []
    for i in range(n):
        ring = random.choice(rings)
        base_amt = random.uniform(500_000, 5_000_000)
        base_ts  = start_ts + timedelta(seconds=random.randint(0, 170 * 86400))
        for hop_idx in range(len(ring) - 1):
            # Small amount variation per hop to look natural
            amt = base_amt * random.uniform(0.92, 1.02)
            # Spread hops across hours
            ts  = base_ts + timedelta(hours=random.uniform(1, 48) * hop_idx)
            txn_id = f"TXN_{id_offset + i * 20 + hop_idx:06d}"
            txns.append(make_txn(txn_id, ring[hop_idx], ring[hop_idx + 1],
                                 amt, ts, 1, "SHELL_LAYERING"))
    return txns


def generate_threshold_splits(accounts: dict, n: int, start_ts: datetime, id_offset: int) -> list:
    """Structuring — split transactions just below ₹2L threshold."""
    acc_list  = [a for a, d in accounts.items() if not d["is_shell"]]
    shell_ids = [a for a, d in accounts.items() if d["is_shell"]]
    txns = []
    for i in range(n):
        sender   = random.choice(acc_list)
        receiver = random.choice(shell_ids) if shell_ids else random.choice(acc_list)
        # Split into 2-4 transactions just below threshold
        num_splits = random.randint(2, 4)
        total_amt  = random.uniform(400_000, 2_000_000)
        base_ts    = start_ts + timedelta(seconds=random.randint(0, 170 * 86400))
        for j in range(num_splits):
            split_amt = min(total_amt / num_splits, THRESHOLD_INR - random.uniform(100, 5000))
            ts = base_ts + timedelta(minutes=random.randint(5, 45) * j)
            txn_id = f"TXN_{id_offset + i * 5 + j:06d}"
            txns.append(make_txn(txn_id, sender, receiver, split_amt, ts, 1, "THRESHOLD_SPLIT"))
    return txns


def generate_velocity_bursts(accounts: dict, n: int, start_ts: datetime, id_offset: int) -> list:
    """Micro-burst: many small transactions in a very short window."""
    acc_list = list(accounts.keys())
    txns = []
    for i in range(n):
        sender   = random.choice(acc_list)
        receivers = random.sample([a for a in acc_list if a != sender], random.randint(5, 15))
        base_ts  = start_ts + timedelta(seconds=random.randint(0, 170 * 86400))
        for j, receiver in enumerate(receivers):
            amt    = random.uniform(5_000, 50_000)
            ts     = base_ts + timedelta(minutes=random.randint(0, 30))
            txn_id = f"TXN_{id_offset + i * 20 + j:06d}"
            txns.append(make_txn(txn_id, sender, receiver, amt, ts, 1, "VELOCITY_BURST"))
    return txns


def generate_dormant_reactivation(accounts: dict, n: int, start_ts: datetime, id_offset: int) -> list:
    """Dormant accounts suddenly reactivate with large transactions."""
    dormant_ids = [a for a, d in accounts.items() if d["is_dormant"]]
    if not dormant_ids:
        return []
    acc_list = list(accounts.keys())
    txns = []
    for i in range(n):
        sender   = random.choice(dormant_ids)
        receiver = random.choice([a for a in acc_list if a != sender])
        amt      = random.uniform(500_000, 3_000_000)
        # Late in the dataset (post-dormancy)
        ts       = start_ts + timedelta(days=random.randint(120, 180))
        txn_id   = f"TXN_{id_offset + i:06d}"
        txns.append(make_txn(txn_id, sender, receiver, amt, ts, 1, "DORMANT_REACTIVATION"))
    return txns


# ── Main generator ─────────────────────────────────────────────────────────────
def generate_dataset() -> pd.DataFrame:
    print("[AEGIS] Generating synthetic transaction dataset...")
    accounts = generate_accounts(NUM_ACCOUNTS)
    rings    = build_shell_rings(accounts)
    start_ts = datetime(2025, 1, 1)

    # Budget fraud transactions
    n_fraud      = int(NUM_TRANSACTIONS * FRAUD_RATIO)
    n_clean      = NUM_TRANSACTIONS - n_fraud
    n_shell      = int(n_fraud * 0.35)
    n_threshold  = int(n_fraud * 0.25)
    n_velocity   = int(n_fraud * 0.20)
    n_dormant    = int(n_fraud * 0.20)

    txns = []
    txns += generate_clean_transactions(accounts, n_clean, start_ts)
    txns += generate_shell_layering(accounts, rings, n_shell // 10, start_ts, 10000)
    txns += generate_threshold_splits(accounts, n_threshold // 3, start_ts, 20000)
    txns += generate_velocity_bursts(accounts, n_velocity // 15, start_ts, 30000)
    txns += generate_dormant_reactivation(accounts, n_dormant, start_ts, 40000)

    df = pd.DataFrame(txns).drop_duplicates(subset="txn_id")
    df["timestamp"] = pd.to_datetime(df["timestamp"], format="ISO8601")
    df = df.sort_values("timestamp").reset_index(drop=True)

    # Save account metadata for graph engine
    acc_df = pd.DataFrame(accounts.values())
    acc_df["open_date"] = acc_df["open_date"].astype(str)
    acc_df.to_csv(OUTPUT_DIR / "accounts.csv", index=False)

    # Save ring topology for graph engine
    with open(OUTPUT_GRAPH, "w") as f:
        json.dump({"rings": rings, "account_count": NUM_ACCOUNTS}, f, indent=2)

    df.to_csv(OUTPUT_CSV, index=False)
    n_fraud_actual = df["label"].sum()
    print(f"  [OK] {len(df):,} transactions generated")
    print(f"  [OK] {n_fraud_actual:,} suspicious ({n_fraud_actual/len(df)*100:.1f}%)")
    print(f"  [OK] {NUM_ACCOUNTS} accounts ({sum(1 for a in accounts.values() if a['is_shell'])} shell, "
          f"{sum(1 for a in accounts.values() if a['is_dormant'])} dormant)")
    print(f"  [OK] {len(rings)} shell rings with 3-8 hops")
    print(f"  [OK] Saved to {OUTPUT_CSV}")
    return df, accounts, rings


if __name__ == "__main__":
    generate_dataset()
