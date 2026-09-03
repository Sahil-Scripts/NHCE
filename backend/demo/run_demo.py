"""
AEGIS -- Batch Demo Runner
Simulates a stream of live transactions running through the AEGIS pipeline.
Displays real-time metrics, detection counts, and generates sample STR reports.
"""

import sys
import time
import random
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pandas as pd
import numpy as np

from data.synthetic_gen import generate_dataset
from core.features import engineer_features
from core.scorer import AEGISScorer
from core.graph_engine import GraphEngine
from core.temporal import TemporalEngine
from core.bayesian import BayesianBeliefEngine
from core.planner import EvidencePlanner
from core.decision import DecisionEngine
from core.entropy import ENTROPY_THRESHOLD, entropy_loop_status


def run_batch_demo(num_txns: int = 5):
    print("=" * 70)
    print("  AEGIS -- Autonomous Financial Crime Batch Demonstration")
    print("=" * 70)

    data_dir = Path(__file__).parent.parent / "data"
    csv_path = data_dir / "sample_transactions.csv"
    acc_path = data_dir / "accounts.csv"

    if not csv_path.exists():
        print("[*] Generating synthetic dataset...")
        generate_dataset()

    df = pd.read_csv(csv_path)
    acc_df = pd.read_csv(acc_path) if acc_path.exists() else None

    # Load Graph & Scorer
    print("[*] Initializing Graph Intelligence Engine...")
    graph_engine = GraphEngine()
    graph_engine.load_transactions(df, acc_df)

    print("[*] Loading Scorer & Decision Engine...")
    try:
        scorer = AEGISScorer()
    except Exception:
        print("[!] Model not found. Training a quick lightweight model...")
        from train import train
        train()
        scorer = AEGISScorer()

    temporal_engine = TemporalEngine(df)
    decision_engine = DecisionEngine()

    # Pick sample transactions: suspicious & clean
    suspicious_samples = df[df["label"] == 1].sample(min(3, len(df[df["label"] == 1])), random_state=42)
    clean_samples = df[df["label"] == 0].sample(max(1, num_txns - len(suspicious_samples)), random_state=42)
    sample_txns = pd.concat([suspicious_samples, clean_samples]).sample(frac=1, random_state=42)

    stats = {"processed": 0, "blocked": 0, "approved": 0, "str_generated": 0}

    print(f"\nProcessing {len(sample_txns)} transactions through AEGIS autonomous reasoning loop...\n")

    for i, (_, row) in enumerate(sample_txns.iterrows(), 1):
        txn_id = row["txn_id"]
        sender = row["sender_id"]
        receiver = row["receiver_id"]
        amt = row["amount_inr"]
        true_label = row["label"]

        print(f"\n--- [Case {i}/{len(sample_txns)}] Transaction: {txn_id} ---")
        print(f"Flow: {sender} -> {receiver} | Amount: INR {amt:,.2f} | Ground Truth: {'SUSPICIOUS' if true_label == 1 else 'CLEAN'}")

        # Stage A: Initial XGBoost scoring
        feat_dict = engineer_features(row.to_frame().T, acc_df).iloc[0].to_dict()
        xgb_res = scorer.score(feat_dict)
        p_current = xgb_res["risk_prior"]
        print(f"[Stage A] Risk Prior P0(fraud) = {p_current:.4f} (Threshold: {scorer.threshold})")

        if not xgb_res["is_high_risk"]:
            print(" -> Low initial risk. Transaction APPROVED without deep investigation.")
            stats["approved"] += 1
            stats["processed"] += 1
            continue

        print(" -> High risk detected! Entering autonomous investigation loop...")
        bayes = BayesianBeliefEngine(p_prior=p_current)
        planner = EvidencePlanner(p_fraud_initial=p_current)
        graph_res = {}
        temp_res = {}

        for step in range(5):
            ent_status = entropy_loop_status(p_current, step)
            print(f" [Stage B Loop {step+1}] P(fraud) = {p_current:.4f} | Entropy = {ent_status['entropy']:.4f} bits | Confident: {ent_status['is_confident']}")
            if ent_status["is_confident"] or ent_status["forced"]:
                break

            next_src = planner.next_source()
            if not next_src:
                break

            src_id = next_src["source_id"]
            print(f" [Stage C] Planner selected: {src_id} (Utility: {next_src['utility']:.2f})")

            if src_id == "graph_traversal":
                graph_res = graph_engine.analyze(sender)
                updates = bayes.update_from_graph(graph_res)
                p_current = bayes.p_fraud
                print(f" [Stage D: Graph] Cycles={graph_res['is_circular']} | ShellChain={graph_res['shell_chain_length']} hops | Risk={graph_res['graph_risk_score']}/10")
            elif src_id == "temporal_analysis":
                temp_res = temporal_engine.analyze(txn_id)
                updates = bayes.update_from_temporal(temp_res)
                p_current = bayes.p_fraud
                print(f" [Stage D: Temporal] Burst={temp_res['velocity_burst']} | Dormancy={temp_res['dormant_reactivation']} | RoundTrip={temp_res['round_trip_detected']}")
            else:
                updates = bayes.update_from_features(feat_dict)
                p_current = bayes.p_fraud

            planner.mark_queried(src_id, "Completed", p_current)

        # Stage E: Final Decision
        report = decision_engine.decide(
            txn_id=txn_id,
            p_fraud=p_current,
            txn_data=row.to_dict(),
            belief_summary=bayes.summary(),
            graph_result=graph_res,
            temporal_result=temp_res,
            planner_summary=planner.get_plan_summary(),
            xgb_result=xgb_res
        )

        outcome = report["decision"]["outcome"]
        stats["processed"] += 1
        if outcome == "BLOCK":
            stats["blocked"] += 1
            stats["str_generated"] += 1
            print(f"[Stage E] Final Decision: *** {outcome} *** (P(fraud) = {p_current:.4f})")
            print(f"Report ID: {report['report_id']} generated under reports/")
        else:
            stats["approved"] += 1
            print(f"[Stage E] Final Decision: {outcome} (P(fraud) = {p_current:.4f})")

        time.sleep(0.3)

    print("\n" + "=" * 70)
    print("  BATCH DEMONSTRATION SUMMARY")
    print("=" * 70)
    print(f"Total Transactions Processed : {stats['processed']}")
    print(f"Blocked (STR Generated)      : {stats['blocked']}")
    print(f"Approved (Clean Flow)        : {stats['approved']}")
    print("=" * 70)


if __name__ == "__main__":
    run_batch_demo()
