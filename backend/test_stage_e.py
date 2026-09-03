"""
AEGIS — Stage E Verification & Deep Dive
Demonstrates the Final Decision Engine & Automated STR Reporting:
1. Decision boundary thresholding (P > 0.85 -> BLOCK, P <= 0.85 -> APPROVE)
2. Automated Suspicious Transaction Report (STR) generation
3. Verification of FIU-IND and RBI regulatory compliance fields
"""

import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import pandas as pd
from core.decision import DecisionEngine

def test_stage_e():
    print("=" * 70)
    print("  AEGIS -- STAGE E: FINAL DECISION & AUTOMATED STR COMPLIANCE")
    print("  Decision Boundary: P(fraud | Evidence) > 0.85 -> BLOCK + STR")
    print("  Regulatory Framework: PMLA 2002, RBI Master Directions, FATF R16, FIU-IND")
    print("=" * 70)

    decision_engine = DecisionEngine(threshold=0.85)

    # 1. Simulate Case 1: High-Confidence Fraud Ring (P = 0.965 -> BLOCK)
    print("\n--- Case 1: High-Confidence Laundering Syndicate ---")
    mock_txn_fraud = {
        "txn_id": "TXN_099981",
        "sender_id": "ACC_0259",
        "receiver_id": "ACC_0366",
        "amount_inr": 2450000.00,
        "timestamp": "2025-06-15 14:22:10"
    }

    mock_belief_fraud = {
        "total_updates": 3,
        "belief_history": [
            {"step": 0, "evidence": "XGBoost_prior", "likelihood_ratio": 1.0, "p_fraud": 0.45},
            {"step": 1, "evidence": "circular_loop_detected", "likelihood_ratio": 12.0, "p_fraud": 0.9076},
            {"step": 2, "evidence": "shell_chain_length_3plus", "likelihood_ratio": 8.0, "p_fraud": 0.9874},
            {"step": 3, "evidence": "watchlisted_in_subgraph", "likelihood_ratio": 6.5, "p_fraud": 0.9980}
        ]
    }

    mock_graph_fraud = {
        "is_circular": True,
        "circular_length": 3,
        "ring_members": ["ACC_0259", "ACC_0366", "ACC_0216", "ACC_0259"],
        "shell_chain_length": 3,
        "shell_chain_path": ["ACC_0259", "ACC_0366", "ACC_0258", "ACC_0292"],
        "reachable_accounts": 500,
        "reachable_watchlisted": 20,
        "total_flow_amount": 2108408918.69,
        "graph_risk_score": 7.90
    }

    mock_temporal_fraud = {
        "velocity_burst": False,
        "velocity_burst_count": 0,
        "dormant_reactivation": False,
        "dormancy_days": 0.0,
        "round_trip_detected": True,
        "round_trip_hours": 1.4,
        "threshold_split_pattern": False,
        "temporal_risk_score": 3.0,
        "anomalies": ["ROUND-TRIP: funds returned in 1.4h"]
    }

    mock_planner = {
        "total_queries": 3,
        "sources_queried": ["watchlist_lookup", "graph_traversal", "temporal_analysis"],
        "query_log": []
    }

    mock_xgb = {
        "risk_prior": 0.45,
        "raw_score": -0.20,
        "top_features": [{"feature": "is_sender_shell", "importance": 0.05}]
    }

    report_fraud = decision_engine.decide(
        txn_id="TXN_099981",
        p_fraud=0.9980,
        txn_data=mock_txn_fraud,
        belief_summary=mock_belief_fraud,
        graph_result=mock_graph_fraud,
        temporal_result=mock_temporal_fraud,
        planner_summary=mock_planner,
        xgb_result=mock_xgb
    )

    print(f"  Decision Outcome       : *** {report_fraud['decision']['outcome']} ***")
    print(f"  Final Probability P    : {report_fraud['decision']['p_fraud'] * 100:.2f}% (Threshold: 85.0%)")
    print(f"  Decision Reason        : {report_fraud['decision']['reason']}")
    print(f"  Report File Generated  : backend/reports/{report_fraud['report_id']}.json")

    # 2. Inspect Compliance Fields
    print("\n--- FIU-IND & RBI Regulatory Compliance Payload ---")
    comp = report_fraud["compliance"]
    print(f"  Reporting Entity       : {comp['reporting_entity']}")
    print(f"  STR Date & Time        : {comp['str_date']} {comp['str_time']}")
    print(f"  Subject Account        : {comp['subject_account']}")
    print(f"  Beneficiary Account    : {comp['beneficiary_account']}")
    print(f"  Transaction Amount     : INR {comp['transaction_amount']:,.2f}")
    print(f"  Suspicion Grounds      :")
    for g in comp["suspicion_grounds"]:
        print(f"    * {g}")
    print(f"  Regulatory Standards   : {', '.join(comp['regulatory_framework'])}")
    print(f"  FIU-IND Compliance     : {comp['fiu_ind_compliance']}")
    print(f"  Full Audit Trail       : {comp['audit_trail_complete']}")
    print(f"  Action Recommendation  : {comp['recommendation']}")

    # 3. Simulate Case 2: Clean Cleared Transaction (P = 0.12 -> APPROVE)
    print("\n--- Case 2: Innocent Customer Transfer (P = 0.12 <= 0.85) ---")
    mock_txn_clean = {
        "txn_id": "TXN_001002",
        "sender_id": "ACC_0019",
        "receiver_id": "ACC_0044",
        "amount_inr": 15000.00,
        "timestamp": "2025-06-16 10:00:00"
    }
    report_clean = decision_engine.decide(
        txn_id="TXN_001002",
        p_fraud=0.1200,
        txn_data=mock_txn_clean,
        belief_summary={"total_updates": 0, "belief_history": [{"p_fraud": 0.12}]},
        graph_result={},
        temporal_result={"anomalies": []},
        planner_summary={"total_queries": 0, "sources_queried": []},
        xgb_result={"risk_prior": 0.12, "raw_score": -2.0, "top_features": []}
    )
    print(f"  Decision Outcome       : *** {report_clean['decision']['outcome']} ***")
    print(f"  Final Probability P    : {report_clean['decision']['p_fraud'] * 100:.2f}% (Threshold: 85.0%)")
    print(f"  Decision Reason        : {report_clean['decision']['reason']}")
    print(f"  STR Generated          : {'No (Transaction Cleared)' if report_clean['compliance'] is None else 'Yes'}")

    print("\n" + "=" * 70)
    print("Stage E Complete: Automated, auditable decisions replacing weeks of manual review.")
    print("=" * 70)

if __name__ == "__main__":
    test_stage_e()
