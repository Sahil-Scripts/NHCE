"""
AEGIS — Stage A Verification
Demonstrates Feature Engineering & XGBoost Sigmoid Normalization
across all 5 transaction archetypes:
1. CLEAN
2. THRESHOLD_SPLIT (Structuring below INR 2L)
3. VELOCITY_BURST (Rapid micro-transactions)
4. DORMANT_REACTIVATION (Sudden high-value transfer on dormant account)
5. SHELL_LAYERING (Disguised hop in multi-tier shell chain)
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from core.features import extract_transaction_features
from core.scorer import AEGISScorer

def test_stage_a():
    df = pd.read_csv("backend/data/sample_transactions.csv")
    acc_df = pd.read_csv("backend/data/accounts.csv")
    scorer = AEGISScorer()

    print("=" * 70)
    print("  AEGIS -- STAGE A: FEATURE EXTRACTION & XGBOOST PRIOR EVALUATION")
    print("  Mathematical Rule: P0(fraud) = sigmoid(f(x)) in [0, 1]")
    print(f"  Investigation Loop Threshold: P0 >= {scorer.threshold}")
    print("=" * 70)

    patterns = ["CLEAN", "THRESHOLD_SPLIT", "VELOCITY_BURST", "DORMANT_REACTIVATION", "SHELL_LAYERING"]

    for pattern in patterns:
        sample = df[df["fraud_type"] == pattern].iloc[-1]
        feat = extract_transaction_features(df, sample["txn_id"], acc_df)
        res = scorer.score(feat)
        p0 = res["risk_prior"]

        print(f"\n[Pattern Archetype: {pattern}]")
        print(f"  Txn ID   : {sample['txn_id']}")
        print(f"  Parties  : {sample['sender_id']} -> {sample['receiver_id']}")
        print(f"  Amount   : INR {sample['amount_inr']:>12,.2f}")
        print(f"  Stage A  : P0(fraud) = {p0:.4f} (Raw margin: {res['raw_score']:.3f})")
        
        if res["is_high_risk"]:
            status = "ENTERS STAGE B (INVESTIGATION LOOP)"
        elif p0 >= 0.40:
            status = "ELEVATED (MONITORED)"
        else:
            status = "CLEARED (NO INVESTIGATION)"
            
        print(f"  Action   : {status}")
        print("  Key Influential Factors:")
        for f in res["top_features"][:3]:
            print(f"    - {f['feature']:<26} (model importance: {f['importance']:.4f})")

    print("\n" + "=" * 70)
    print("Stage A Complete: Fast-path clearing clean traffic & feeding priors to Stage B.")
    print("=" * 70)

if __name__ == "__main__":
    test_stage_a()
