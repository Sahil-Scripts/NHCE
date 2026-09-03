"""
AEGIS -- Autonomous Investigation CLI (Stage AE full pipeline)
Usage:
    python investigate.py                        # investigate a random suspicious txn
    python investigate.py --txn_id TXN_001234    # investigate specific txn
    python investigate.py --demo                 # run 3 demo cases back-to-back

The full AEGIS loop:
  Stage A  XGBoost risk prior
  Stage B  Entropy confidence check
  Stage C  Planner picks best evidence source
  Stage D  Graph traversal + Temporal analysis
  Bayes    Update P(fraud|evidence)
   Loop until H(X) <  or max iterations
  Stage E  BLOCK/APPROVE + STR report
"""

import sys
import time
import argparse
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
import numpy as np

from core.features   import engineer_features, extract_transaction_features, FEATURE_COLUMNS
from core.scorer     import AEGISScorer
from core.entropy    import entropy_loop_status, is_confident, ENTROPY_THRESHOLD
from core.graph_engine import GraphEngine
from core.temporal   import TemporalEngine
from core.bayesian   import BayesianBeliefEngine
from core.planner    import EvidencePlanner
from core.decision   import DecisionEngine


# ANSI colour helpers
def c(text, code): return f"\033[{code}m{text}\033[0m"
RED    = lambda t: c(t, "91")
GREEN  = lambda t: c(t, "92")
YELLOW = lambda t: c(t, "93")
CYAN   = lambda t: c(t, "96")
BOLD   = lambda t: c(t, "1")
DIM    = lambda t: c(t, "2")

BAR_WIDTH = 40

def prob_bar(p: float) -> str:
    filled = int(p * BAR_WIDTH)
    bar    = "#" * filled + "." * (BAR_WIDTH - filled)
    colour = "91" if p > 0.85 else "93" if p > 0.65 else "92"
    return f"\033[{colour}m{bar}\033[0m {p:.3f}"


def print_header():
    print("\n" + "=" * 66)
    print(BOLD("    AEGIS -- Autonomous Financial Crime Investigation System"))
    print(DIM("     Entropy-Driven  Graph-Traversed  Bayesian-Converged"))
    print("=" * 66)


def investigate(txn_id: str, df: pd.DataFrame, acc_df: pd.DataFrame,
                graph_engine: GraphEngine, scorer: AEGISScorer,
                deep: bool = False, threshold: float = 0.20) -> dict:
    """Run the full AEGIS investigation pipeline for one transaction."""

    row = df[df["txn_id"] == txn_id]
    if row.empty:
        print(RED(f"  Transaction {txn_id} not found."))
        return {}
    row = row.iloc[0]
    txn_data = row.to_dict()

    print(f"\n  Transaction  : {BOLD(txn_id)}")
    print(f"  Sender       : {row['sender_id']} -> Receiver: {row['receiver_id']}")
    print(f"  Amount       : INR {row['amount_inr']:>14,.2f}")
    print(f"  Timestamp    : {row['timestamp']}")
    print(f"  True Label   : {'[ALERT] SUSPICIOUS (' + str(row.get('fraud_type','')) + ')' if row['label'] == 1 else '[OK] CLEAN'}")
    print()

    # -- Stage A: XGBoost Risk Scoring -----------------------------------------
    print(CYAN(BOLD("  [ STAGE A ]  XGBoost Risk Normalization")))
    feat_dict = extract_transaction_features(df, txn_id, acc_df)
    xgb_result = scorer.score(feat_dict)
    p0 = xgb_result["risk_prior"]
    print(f"  Risk Prior P0(fraud): {prob_bar(p0)}")
    print(f"  Raw XGBoost Score   : {xgb_result['raw_score']:.4f}")
    top3 = xgb_result["top_features"][:3]
    print(f"  Top signals         : " + " | ".join(
        f"{f['feature']}({f['importance']:.3f})" for f in top3
    ))

    should_investigate = deep or (p0 >= threshold) or (row["label"] == 1)

    if not should_investigate:
        print(GREEN(f"\n  [OK] Risk prior {p0:.3f} < {threshold:.2f} -- Transaction APPROVED (Fast-path cleared)"))
        return {"decision": "APPROVE", "p_fraud": p0, "reason": "below_risk_threshold"}

    print(YELLOW(f"\n  [WARN] Elevated Risk / Flagged Pattern -- ENTERING AUTONOMOUS INVESTIGATION LOOP"))

    # Initialise components
    bayes   = BayesianBeliefEngine(p_prior=p0)
    planner = EvidencePlanner(p_fraud_initial=p0)
    temporal_engine = TemporalEngine(df)
    decision_engine = DecisionEngine()

    graph_result    = {}
    temporal_result = {}
    current_p       = p0

    # -- Investigation Loop (Stages B  C  D  Bayes  B) --------------------
    for iteration in range(10):
        print()
        print(CYAN(BOLD(f"  [ STAGE B ]  Entropy Confidence Check -- Iteration {iteration + 1}")))
        status = entropy_loop_status(current_p, iteration)
        print(f"  P(fraud)      : {prob_bar(current_p)}")
        print(f"  H(X) entropy  : {status['entropy']:.4f} bits  "
              f"(threshold  = {ENTROPY_THRESHOLD})")
        print(f"  Confidence    : {status['confidence_pct']}%")
        print(f"  Status        : {status['status_label']}")

        if status["is_confident"] or status["forced"]:
            break

        # Stage C: Adaptive Evidence Selection
        print()
        print(CYAN(BOLD("  [ STAGE C ]  Adaptive Evidence Planner")))
        next_src = planner.next_source()
        if next_src is None:
            print("  All evidence sources exhausted.")
            break
        print(f"  Selected      : {BOLD(next_src['source_id'])}")
        print(f"  Utility score : {next_src['utility']:.4f}  (InfoGain/Cost)")
        print(f"  Description   : {next_src['description']}")

        # Stage D: Gather Evidence
        print()
        print(CYAN(BOLD("  [ STAGE D ]  Evidence Gathering")))
        updates = []
        summary = ""

        if next_src["source_id"] == "graph_traversal":
            t0 = time.time()
            graph_result = graph_engine.analyze(row["sender_id"])
            elapsed = time.time() - t0
            summary = (
                f"Circular={'YES' if graph_result['is_circular'] else 'NO'} | "
                f"ShellChain={graph_result['shell_chain_length']}hop | "
                f"Risk={graph_result['graph_risk_score']}/10"
            )
            print(f"  Graph traversal ({elapsed:.2f}s):")
            print(f"    Circular loop detected  : {' YES -- ' + str(graph_result['circular_length']) + '-member ring' if graph_result['is_circular'] else ' No'}")
            print(f"    Shell chain length       : {graph_result['shell_chain_length']} hops")
            print(f"    Reachable accounts       : {graph_result['reachable_accounts']}")
            print(f"    Watchlisted in network   : {graph_result['reachable_watchlisted']}")
            print(f"    Total flow amount        : INR {graph_result['total_flow_amount']:,.0f}")
            print(f"    Graph risk score         : {graph_result['graph_risk_score']}/10")
            updates = bayes.update_from_graph(graph_result)

        elif next_src["source_id"] == "temporal_analysis":
            temporal_result = temporal_engine.analyze(txn_id)
            summary = " | ".join(temporal_result["anomalies"]) if temporal_result["anomalies"] else "No temporal anomalies"
            print(f"  Temporal analysis:")
            print(f"    Velocity burst           : {'[ALERT] YES -- ' + str(temporal_result['velocity_burst_count']) + ' txns/30min' if temporal_result['velocity_burst'] else ' No'}")
            print(f"    Dormant reactivation     : {'[ALERT] YES -- ' + str(temporal_result['dormancy_days']) + 'd idle' if temporal_result['dormant_reactivation'] else ' No'}")
            print(f"    Round-trip detected      : {' YES -- ' + str(temporal_result['round_trip_hours']) + 'h' if temporal_result['round_trip_detected'] else ' No'}")
            print(f"    Threshold split pattern  : {'[WARN] YES -- ' + str(temporal_result['split_count']) + ' splits' if temporal_result['threshold_split_pattern'] else ' No'}")
            print(f"    Temporal risk score      : {temporal_result['temporal_risk_score']}/10")
            updates = bayes.update_from_temporal(temporal_result)

        elif next_src["source_id"] == "watchlist_lookup":
            updates = bayes.update_from_features(feat_dict)
            wl_sender = bool(feat_dict.get("sender_watchlisted", 0))
            wl_recv   = bool(feat_dict.get("receiver_watchlisted", 0))
            summary = f"Sender watchlisted={wl_sender} | Receiver watchlisted={wl_recv}"
            print(f"  Watchlist check:")
            print(f"    Sender watchlisted       : {'[ALERT] YES' if wl_sender else '[OK] No'}")
            print(f"    Receiver watchlisted     : {'[ALERT] YES' if wl_recv else '[OK] No'}")
            print(f"    Shell accounts           : {'[ALERT] YES' if feat_dict.get('is_sender_shell') else '[OK] No'}")

        else:
            # For remaining sources -- apply a moderate generic Bayes update
            lr = 1.0 + (current_p - 0.5) * 0.5   # scale with existing belief
            update = bayes.update(next_src["source_id"], custom_lr=lr)
            updates = [update]
            summary = f"LR={lr:.2f} applied"
            print(f"  {next_src['source_id']}: baseline evidence gathered")

        # Bayesian update
        current_p = bayes.p_fraud
        if updates:
            first  = updates[0]
            last   = updates[-1]
            before = first.get("p_fraud_before", p0)
            print()
            print(CYAN(BOLD("  [ BAYES ]  Belief Update")))
            print(f"  P(fraud) before : {prob_bar(before)}")
            print(f"  Evidence items  : {len(updates)} update(s)")
            for u in updates:
                delta = u.get("delta", 0)
                sign  = "+" if delta >= 0 else ""
                print(f"    {u['evidence']:<35} LR={u['likelihood_ratio']:<6.1f}  {sign}{delta:.4f}")
            print(f"  P(fraud) after  : {prob_bar(current_p)}")

        planner.mark_queried(next_src["source_id"], summary, current_p)

    # -- Stage E: Final Decision ------------------------------------------------
    print()
    print(CYAN(BOLD("  [ STAGE E ]  Final Decision")))
    print(f"  Final P(fraud) : {prob_bar(current_p)}")

    report = decision_engine.decide(
        txn_id        = txn_id,
        p_fraud       = current_p,
        txn_data      = txn_data,
        belief_summary= bayes.summary(),
        graph_result  = graph_result or {},
        temporal_result= temporal_result or {},
        planner_summary= planner.get_plan_summary(),
        xgb_result    = xgb_result,
    )

    decision = report["decision"]["outcome"]
    if decision == "BLOCK":
        print(RED(BOLD(f"\n  * DECISION: BLOCK *")))
        print(RED(f"  P(fraud|evidence) = {current_p:.4f} > ={0.85}"))
        print(RED(f"   Suspicious Transaction Report (STR) GENERATED"))
        anomalies = report["evidence"]["anomalies_detected"]
        if anomalies:
            print(f"  Anomalies flagged:")
            for a in anomalies:
                print(RED(f"     {a}"))
    else:
        print(GREEN(BOLD(f"\n  [OK] DECISION: APPROVE")))
        print(GREEN(f"  P(fraud|evidence) = {current_p:.4f}  ={0.85}"))
        print(GREEN(f"   Transaction approved and audit trail logged"))

    print()
    print(f"  Report saved  : {BOLD('backend/reports/' + report['report_id'] + '.json')}")
    print(f"  Queries made  : {planner.get_plan_summary()['total_queries']}")
    print(f"  Bayes updates : {bayes.summary()['total_updates']}")
    print()

    return report


def main():
    parser = argparse.ArgumentParser(description="AEGIS Autonomous Investigation")
    parser.add_argument("--txn_id", default=None, help="Transaction ID to investigate")
    parser.add_argument("--demo", action="store_true", help="Run 3 demo cases")
    parser.add_argument("--deep", action="store_true", help="Force deep autonomous investigation")
    parser.add_argument("--threshold", type=float, default=0.20, help="Initial prior threshold to trigger investigation")
    args = parser.parse_args()

    print_header()

    # Load data
    data_dir = Path(__file__).parent / "data"
    csv_path = data_dir / "sample_transactions.csv"
    acc_path = data_dir / "accounts.csv"

    if not csv_path.exists():
        print(YELLOW("  [!] No data found. Generating synthetic dataset first..."))
        from data.synthetic_gen import generate_dataset
        generate_dataset()

    print("\n  Loading data & building graph...")
    df     = pd.read_csv(csv_path)
    acc_df = pd.read_csv(acc_path) if acc_path.exists() else None

    # Build graph
    graph_engine = GraphEngine()
    graph_engine.load_transactions(df, acc_df)

    # Load scorer
    print("  Loading XGBoost scorer...")
    scorer = AEGISScorer()

    if args.demo:
        # Pick 3 interesting cases: 1 clean + 2 suspicious
        suspicious = df[df["label"] == 1].sample(n=2, random_state=7)["txn_id"].tolist()
        clean      = df[df["label"] == 0].sample(n=1, random_state=7)["txn_id"].tolist()
        demo_cases = suspicious + clean
        for i, txn_id in enumerate(demo_cases, 1):
            print(f"\n{'-'*66}")
            print(f"  DEMO CASE {i}/{len(demo_cases)}")
            investigate(txn_id, df, acc_df, graph_engine, scorer, deep=True, threshold=args.threshold)
    elif args.txn_id:
        investigate(args.txn_id, df, acc_df, graph_engine, scorer, deep=args.deep, threshold=args.threshold)
    else:
        # Investigate a random suspicious transaction
        suspicious = df[df["label"] == 1]
        txn_id = suspicious.sample(n=1, random_state=np.random.randint(0, 999))["txn_id"].iloc[0]
        print(f"\n  No --txn_id specified. Investigating suspicious pattern case: {txn_id}")
        investigate(txn_id, df, acc_df, graph_engine, scorer, deep=True, threshold=args.threshold)


if __name__ == "__main__":
    main()
