"""
AEGIS — Stage D Verification & Deep Dive
Demonstrates Graph Intelligence & Temporal Pattern Matching:
1. NetworkX BFS/DFS graph traversal
2. Circular loop & shell chain detection
3. Temporal velocity burst & dormancy analysis
4. How Stage D findings feed Bayesian updates
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from core.graph_engine import GraphEngine
from core.temporal import TemporalEngine
from core.bayesian import BayesianBeliefEngine

def test_stage_d():
    print("=" * 70)
    print("  AEGIS -- STAGE D: GRAPH INTELLIGENCE & TEMPORAL PATTERNS")
    print("  Detects: Multi-hop Shell Chains, Circular Loops & Time-Delta Anomalies")
    print("=" * 70)

    # Load dataset & accounts
    df = pd.read_csv("backend/data/sample_transactions.csv")
    acc_df = pd.read_csv("backend/data/accounts.csv")

    # 1. Initialize Engines
    print("\n--- Part 1: Loading In-Memory Graph & Temporal History ---")
    graph_engine = GraphEngine()
    graph_engine.load_transactions(df, acc_df)
    temporal_engine = TemporalEngine(df)

    # 2. Test Graph Intelligence on a Shell Layering Account
    print("\n--- Part 2: Graph Intelligence (BFS/DFS Traversal) ---")
    shell_txns = df[df["fraud_type"] == "SHELL_LAYERING"]
    target_account = shell_txns.iloc[0]["sender_id"]
    print(f"  Target Account for Graph Audit : {target_account}")
    
    graph_res = graph_engine.analyze(target_account, max_hops=8)
    print(f"  Max Reachable Hop Depth        : {graph_res['hop_depth']} hops")
    print(f"  Accounts in Subgraph Network   : {graph_res['reachable_accounts']}")
    print(f"  Watchlisted Entities in Range  : {graph_res['reachable_watchlisted']}")
    print(f"  Total Money Flow in Subgraph   : INR {graph_res['total_flow_amount']:,.2f}")
    print(f"  Circular Fund Loop Detected    : {'YES [CYCLE FOUND]' if graph_res['is_circular'] else 'No loop'}")
    if graph_res["is_circular"]:
        print(f"    * Loop Length                : {graph_res['circular_length']} accounts")
        print(f"    * Ring Member Path           : {' -> '.join(graph_res['ring_members'])}")
    if graph_res["shell_chain_length"] > 0:
        print(f"  Longest Shell Conduit Chain    : {graph_res['shell_chain_length']} hops")
        print(f"    * Conduit Path               : {' -> '.join(graph_res['shell_chain_path'])}")
    print(f"  Composite Graph Risk Score     : {graph_res['graph_risk_score']:.2f} / 10.0")

    # 3. Test Temporal Pattern Engine on a Velocity Burst
    print("\n--- Part 3: Temporal Pattern Matching (Time-Delta Anomalies) ---")
    velocity_sample = df[df["fraud_type"] == "VELOCITY_BURST"].iloc[0]
    temp_res = temporal_engine.analyze(velocity_sample["txn_id"])
    print(f"  Audited Transaction ID         : {velocity_sample['txn_id']}")
    print(f"  Sender -> Receiver             : {velocity_sample['sender_id']} -> {velocity_sample['receiver_id']}")
    print(f"  Amount                         : INR {velocity_sample['amount_inr']:,.2f}")
    print(f"  Velocity Burst Triggered       : {'YES' if temp_res['velocity_burst'] else 'No'}")
    if temp_res["velocity_burst"]:
        print(f"    * Transaction Count in 30min : {temp_res['velocity_burst_count']} transactions")
    print(f"  Dormancy Reactivation Flagged  : {'YES' if temp_res['dormant_reactivation'] else 'No'}")
    print(f"  Days Inactive Before Transfer  : {temp_res['dormancy_days']:.1f} days")
    print(f"  Composite Temporal Risk Score  : {temp_res['temporal_risk_score']:.2f} / 10.0")

    # 4. Bayesian Belief Updating Bridge
    print("\n--- Part 4: The Bayesian Update Bridge ---")
    print("Converting Stage D empirical findings into mathematical belief updates:")
    bayes = BayesianBeliefEngine(p_prior=0.45)
    print(f"  Starting Belief Prior P(fraud) : {bayes.p_fraud:.4f}")
    
    updates = bayes.update_from_graph(graph_res)
    for u in updates:
        print(f"  * Graph Evidence Applied   : {u['evidence']:<26} (LR = {u['likelihood_ratio']:<4.1f}) -> New P: {u['p_fraud_after']:.4f}")

    updates_temp = bayes.update_from_temporal(temp_res)
    for u in updates_temp:
        print(f"  * Temporal Evidence Applied: {u['evidence']:<26} (LR = {u['likelihood_ratio']:<4.1f}) -> New P: {u['p_fraud_after']:.4f}")

    print(f"\n  Final Bayesian Converged Belief: P(fraud | Evidence) = {bayes.p_fraud:.4f}")
    print("=" * 70)
    print("Stage D Conclusion: Connects isolated dots across time and graph topology.")
    print("=" * 70)

if __name__ == "__main__":
    test_stage_d()
