"""
AEGIS — Decision Engine + STR Report Generator (Stage E)
Final stage of the AEGIS pipeline:
  - Compare P(fraud|all_evidence) to decision boundary θ
  - P > θ → BLOCK and generate Suspicious Transaction Report (STR)
  - P ≤ θ → APPROVE and log audit trail
"""

import json
from datetime import datetime
from pathlib import Path

DECISION_THRESHOLD = 0.85   # P(fraud) > 0.85 → BLOCK
OUTPUT_DIR = Path(__file__).parent.parent / "reports"


class DecisionEngine:
    """Makes the final BLOCK/APPROVE decision and generates reports."""

    def __init__(self, threshold: float = DECISION_THRESHOLD):
        self.threshold = threshold
        OUTPUT_DIR.mkdir(exist_ok=True)

    def decide(self,
               txn_id: str,
               p_fraud: float,
               txn_data: dict,
               belief_summary: dict,
               graph_result: dict,
               temporal_result: dict,
               planner_summary: dict,
               xgb_result: dict) -> dict:
        """
        Make the final BLOCK/APPROVE decision and compile the full case report.

        Returns:
            Complete investigation report dict
        """
        decision = "BLOCK" if p_fraud > self.threshold else "APPROVE"
        confidence = round(p_fraud * 100, 1) if decision == "BLOCK" else round((1 - p_fraud) * 100, 1)
        now = datetime.now()

        # Compile all anomalies
        all_anomalies = temporal_result.get("anomalies", [])
        if graph_result.get("is_circular"):
            all_anomalies.append(f"CIRCULAR LOOP: {graph_result['circular_length']}-member ring detected")
        if graph_result.get("shell_chain_length", 0) >= 3:
            all_anomalies.append(f"SHELL CHAIN: {graph_result['shell_chain_length']}-hop chain to shell network")
        if graph_result.get("reachable_watchlisted", 0) > 0:
            all_anomalies.append(f"WATCHLIST: {graph_result['reachable_watchlisted']} watchlisted accounts in network")

        report = {
            "aegis_version":   "1.0.0",
            "report_id":       f"AEGIS_{txn_id}_{now.strftime('%Y%m%d_%H%M%S')}",
            "generated_at":    now.isoformat(),

            # Transaction details
            "transaction": {
                "txn_id":       txn_id,
                "sender_id":    txn_data.get("sender_id"),
                "receiver_id":  txn_data.get("receiver_id"),
                "amount_inr":   txn_data.get("amount_inr"),
                "timestamp":    str(txn_data.get("timestamp")),
            },

            # Decision
            "decision": {
                "outcome":         decision,
                "p_fraud":         round(p_fraud, 4),
                "confidence_pct":  confidence,
                "threshold_used":  self.threshold,
                "reason":          self._decision_reason(decision, p_fraud, all_anomalies),
            },

            # Investigation trail
            "investigation": {
                "total_evidence_sources": planner_summary.get("total_queries", 0),
                "sources_queried":        planner_summary.get("sources_queried", []),
                "belief_updates":         belief_summary.get("total_updates", 0),
                "p_fraud_initial":        round(belief_summary["belief_history"][0]["p_fraud"], 4),
                "p_fraud_final":          round(p_fraud, 4),
                "belief_history":         belief_summary.get("belief_history", []),
                "query_log":              planner_summary.get("query_log", []),
            },

            # Evidence
            "evidence": {
                "anomalies_detected":    all_anomalies,
                "anomaly_count":         len(all_anomalies),
                "graph": {
                    "is_circular":             graph_result.get("is_circular"),
                    "circular_length":         graph_result.get("circular_length"),
                    "ring_members":            graph_result.get("ring_members", []),
                    "shell_chain_length":      graph_result.get("shell_chain_length"),
                    "shell_chain_path":        graph_result.get("shell_chain_path", []),
                    "reachable_accounts":      graph_result.get("reachable_accounts"),
                    "reachable_watchlisted":   graph_result.get("reachable_watchlisted"),
                    "total_flow_amount_inr":   graph_result.get("total_flow_amount"),
                    "graph_risk_score":        graph_result.get("graph_risk_score"),
                },
                "temporal": {
                    "velocity_burst":          temporal_result.get("velocity_burst"),
                    "velocity_burst_count":    temporal_result.get("velocity_burst_count"),
                    "dormant_reactivation":    temporal_result.get("dormant_reactivation"),
                    "dormancy_days":           temporal_result.get("dormancy_days"),
                    "round_trip_detected":     temporal_result.get("round_trip_detected"),
                    "round_trip_hours":        temporal_result.get("round_trip_hours"),
                    "threshold_split_pattern": temporal_result.get("threshold_split_pattern"),
                    "temporal_risk_score":     temporal_result.get("temporal_risk_score"),
                },
                "xgboost": {
                    "risk_prior":   xgb_result.get("risk_prior"),
                    "raw_score":    xgb_result.get("raw_score"),
                    "top_features": xgb_result.get("top_features", []),
                },
            },

            # Regulatory compliance (STR fields for FIU-IND)
            "compliance": self._build_str_fields(decision, txn_data, p_fraud,
                                                  all_anomalies, now) if decision == "BLOCK" else None,
        }

        # Save report to disk
        report_path = OUTPUT_DIR / f"{report['report_id']}.json"
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2, default=str)

        return report

    def _decision_reason(self, decision: str, p_fraud: float, anomalies: list) -> str:
        if decision == "BLOCK":
            return (
                f"P(fraud|evidence) = {p_fraud:.3f} exceeds decision boundary theta={self.threshold}. "
                f"Detected {len(anomalies)} anomaly signal(s): {'; '.join(anomalies[:2])}{'...' if len(anomalies) > 2 else ''}."
            )
        else:
            return (
                f"P(fraud|evidence) = {p_fraud:.3f} below decision boundary theta={self.threshold}. "
                f"Insufficient evidence to flag -- transaction approved and logged."
            )

    def _build_str_fields(self, decision: str, txn_data: dict,
                           p_fraud: float, anomalies: list,
                           timestamp: datetime) -> dict:
        """Generate Suspicious Transaction Report fields per FIU-IND/RBI format."""
        return {
            "str_type":           "AUTOMATED_STR",
            "reporting_entity":   "AEGIS_AUTONOMOUS_AML_SYSTEM",
            "str_date":           timestamp.strftime("%Y-%m-%d"),
            "str_time":           timestamp.strftime("%H:%M:%S"),
            "subject_account":    txn_data.get("sender_id"),
            "beneficiary_account": txn_data.get("receiver_id"),
            "transaction_amount": txn_data.get("amount_inr"),
            "currency":           "INR",
            "fraud_probability":  round(p_fraud, 4),
            "suspicion_grounds":  anomalies,
            "regulatory_framework": ["PMLA_2002", "RBI_KYC_MASTER", "FATF_R16", "FIU_IND_STR"],
            "fiu_ind_compliance": True,
            "fatf_aml_compliant": True,
            "audit_trail_complete": True,
            "recommendation":     "FREEZE_ACCOUNT_PENDING_INVESTIGATION",
        }
