"""
AEGIS — Adaptive Evidence Planner (Stage C)
Selects the next best evidence source to query using:

    Utility = InfoGain(source) / QueryCost(source)

Highest-utility unqueried source is selected each iteration.
"""

import numpy as np
from core.entropy import compute_entropy


# Evidence source registry — each source has:
#   - cost: relative query cost (1.0 = baseline, higher = more expensive)
#   - base_info_gain: expected entropy reduction when this source is queried
#   - description: human-readable label
EVIDENCE_SOURCES = {
    "graph_traversal": {
        "cost":           1.5,
        "base_info_gain": 0.45,
        "description":    "BFS/DFS graph traversal — shell chains & circular loops",
    },
    "temporal_analysis": {
        "cost":           1.0,
        "base_info_gain": 0.35,
        "description":    "Velocity burst, dormancy, round-trip detection",
    },
    "watchlist_lookup": {
        "cost":           0.5,
        "base_info_gain": 0.30,
        "description":    "Check sender/receiver against PEP/OFAC/RBI watchlists",
    },
    "transaction_history": {
        "cost":           1.2,
        "base_info_gain": 0.28,
        "description":    "Full 90-day transaction history analysis",
    },
    "behavioural_baseline": {
        "cost":           1.8,
        "base_info_gain": 0.25,
        "description":    "Account behaviour profiling — deviation from baseline",
    },
    "cross_account_cluster": {
        "cost":           2.0,
        "base_info_gain": 0.38,
        "description":    "Network cluster analysis across related accounts",
    },
    "kyc_risk_review": {
        "cost":           0.8,
        "base_info_gain": 0.20,
        "description":    "KYC tier and onboarding risk score lookup",
    },
}


class EvidencePlanner:
    """
    Adaptive evidence planner that selects the highest-utility
    unqueried source at each iteration of the investigation loop.
    """

    def __init__(self, p_fraud_initial: float):
        self.p_fraud       = p_fraud_initial
        self.queried       = set()          # Already-queried sources
        self.query_log     = []             # Ordered list of queries made

    def _compute_utility(self, source_id: str, source_cfg: dict) -> float:
        """
        Utility = InfoGain(source) / QueryCost(source)

        InfoGain is scaled by current entropy — the more uncertain we are,
        the more valuable additional evidence becomes.
        """
        current_entropy = compute_entropy(self.p_fraud)
        # Scale info gain by current uncertainty — more gain when we're most uncertain
        scaled_gain = source_cfg["base_info_gain"] * (1 + current_entropy)
        return scaled_gain / source_cfg["cost"]

    def next_source(self) -> dict | None:
        """
        Select the next best evidence source to query.

        Returns:
            {"source_id": str, "utility": float, "description": str}
            or None if all sources exhausted.
        """
        candidates = []
        for source_id, cfg in EVIDENCE_SOURCES.items():
            if source_id not in self.queried:
                utility = self._compute_utility(source_id, cfg)
                candidates.append({
                    "source_id":   source_id,
                    "utility":     round(utility, 4),
                    "cost":        cfg["cost"],
                    "description": cfg["description"],
                })

        if not candidates:
            return None

        best = max(candidates, key=lambda x: x["utility"])
        return best

    def mark_queried(self, source_id: str, result_summary: str = "",
                     p_fraud_after: float = None):
        """Mark a source as queried and log it."""
        self.queried.add(source_id)
        if p_fraud_after is not None:
            self.p_fraud = p_fraud_after
        self.query_log.append({
            "step":           len(self.query_log) + 1,
            "source":         source_id,
            "description":    EVIDENCE_SOURCES.get(source_id, {}).get("description", ""),
            "result_summary": result_summary,
            "p_fraud_after":  round(p_fraud_after, 4) if p_fraud_after else None,
        })

    def get_plan_summary(self) -> dict:
        """Return a summary of the planner's decisions."""
        return {
            "sources_queried":   list(self.queried),
            "sources_remaining": [s for s in EVIDENCE_SOURCES if s not in self.queried],
            "query_log":         self.query_log,
            "total_queries":     len(self.queried),
        }
