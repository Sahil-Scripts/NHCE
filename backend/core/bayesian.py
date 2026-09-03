"""
AEGIS — Bayesian Belief Updater
Implements the core Bayes update loop:

    P(fraud | E_new) = P(E_new | fraud) · P(fraud) / P(E_new)

Pre-computed likelihood ratios P(E|fraud) for each evidence source
are based on empirical fraud case statistics.
"""

import numpy as np

# ── Likelihood Ratios (LR = P(evidence|fraud) / P(evidence|clean)) ────────────
# LR > 1 → evidence increases fraud probability
# LR < 1 → evidence decreases fraud probability
LIKELIHOOD_RATIOS = {
    # Graph intelligence evidence
    "circular_loop_detected":       12.0,   # Circular flow is very strong fraud signal
    "shell_chain_length_3plus":      8.0,   # 3+ hop shell chain
    "shell_chain_length_6plus":     14.0,   # 6+ hop shell chain
    "watchlisted_in_subgraph":       6.5,
    "new_counterparty":              2.2,

    # Temporal evidence
    "velocity_burst":                5.5,   # Many txns in short window
    "dormant_reactivation":          4.8,   # Dormant account suddenly active
    "round_trip_detected":           9.0,   # Funds returned quickly
    "threshold_split_pattern":       7.5,   # Structuring below ₹2L

    # Feature-level evidence
    "high_amount_zscore":            3.5,   # Amount >> account average
    "sender_watchlisted":           18.0,   # Watchlisted sender
    "receiver_watchlisted":         14.0,
    "sender_is_shell":               6.0,
    "receiver_is_shell":             4.5,
    "high_kyc_risk":                 3.0,
    "night_transaction":             1.8,
    "weekend_high_value":            2.0,

    # Absence of suspicious signals (exculpatory)
    "no_anomalies_found":            0.4,   # Evidence of innocence
    "established_counterparty":      0.6,   # Long history with receiver
    "low_amount_normal_hour":        0.5,
}


def bayesian_update(p_prior: float, likelihood_ratio: float) -> float:
    """
    Apply a single Bayes update using odds form:
        posterior_odds = prior_odds × LR
        posterior = posterior_odds / (1 + posterior_odds)

    Args:
        p_prior:          current P(fraud) ∈ (0, 1)
        likelihood_ratio: LR = P(evidence|fraud) / P(evidence|clean)

    Returns:
        Updated P(fraud) ∈ (0, 1)
    """
    p = np.clip(p_prior, 1e-6, 1 - 1e-6)
    prior_odds     = p / (1 - p)
    posterior_odds = prior_odds * likelihood_ratio
    return float(posterior_odds / (1 + posterior_odds))


class BayesianBeliefEngine:
    """
    Maintains and updates the fraud belief state as evidence arrives.
    Keeps a full audit trail of every update for STR reporting.
    """

    def __init__(self, p_prior: float):
        """
        Args:
            p_prior: Initial fraud probability from XGBoost scorer (Stage A)
        """
        self.p_fraud  = float(np.clip(p_prior, 1e-6, 1 - 1e-6))
        self.history  = [{"step": 0, "evidence": "XGBoost_prior",
                          "likelihood_ratio": 1.0, "p_fraud": self.p_fraud}]
        self.step     = 0

    def update(self, evidence_key: str, custom_lr: float = None) -> dict:
        """
        Apply one Bayes update for a named evidence type.

        Args:
            evidence_key: Key in LIKELIHOOD_RATIOS (or custom)
            custom_lr:    Override the default LR for this evidence

        Returns:
            Update record with before/after probabilities
        """
        lr = custom_lr if custom_lr is not None else LIKELIHOOD_RATIOS.get(evidence_key, 1.0)
        p_before = self.p_fraud
        self.p_fraud = bayesian_update(self.p_fraud, lr)
        self.step += 1

        record = {
            "step":             self.step,
            "evidence":         evidence_key,
            "likelihood_ratio": lr,
            "p_fraud_before":   round(p_before, 4),
            "p_fraud_after":    round(self.p_fraud, 4),
            "delta":            round(self.p_fraud - p_before, 4),
        }
        self.history.append(record)
        return record

    def update_from_graph(self, graph_result: dict) -> list:
        """Apply all relevant Bayes updates from graph analysis results."""
        updates = []
        if graph_result.get("is_circular"):
            updates.append(self.update("circular_loop_detected"))
        chain_len = graph_result.get("shell_chain_length", 0)
        if chain_len >= 6:
            updates.append(self.update("shell_chain_length_6plus"))
        elif chain_len >= 3:
            updates.append(self.update("shell_chain_length_3plus"))
        if graph_result.get("reachable_watchlisted", 0) > 0:
            updates.append(self.update("watchlisted_in_subgraph"))
        return updates

    def update_from_temporal(self, temporal_result: dict) -> list:
        """Apply all relevant Bayes updates from temporal analysis results."""
        updates = []
        if temporal_result.get("velocity_burst"):
            updates.append(self.update("velocity_burst"))
        if temporal_result.get("dormant_reactivation"):
            updates.append(self.update("dormant_reactivation"))
        if temporal_result.get("round_trip_detected"):
            updates.append(self.update("round_trip_detected"))
        if temporal_result.get("threshold_split_pattern"):
            updates.append(self.update("threshold_split_pattern"))
        return updates

    def update_from_features(self, feature_dict: dict) -> list:
        """Apply Bayes updates from raw feature signals."""
        updates = []
        if feature_dict.get("sender_watchlisted", 0) > 0:
            updates.append(self.update("sender_watchlisted"))
        if feature_dict.get("receiver_watchlisted", 0) > 0:
            updates.append(self.update("receiver_watchlisted"))
        if feature_dict.get("is_sender_shell", 0) > 0:
            updates.append(self.update("sender_is_shell"))
        if feature_dict.get("is_receiver_shell", 0) > 0:
            updates.append(self.update("receiver_is_shell"))
        if feature_dict.get("amount_zscore", 0) > 3.0:
            updates.append(self.update("high_amount_zscore"))
        if feature_dict.get("is_night_txn", 0) > 0:
            updates.append(self.update("night_transaction"))
        if feature_dict.get("is_new_counterparty", 0) > 0:
            updates.append(self.update("new_counterparty"))
        elif feature_dict.get("pair_count_30d", 0) > 5:
            updates.append(self.update("established_counterparty"))
        return updates

    def summary(self) -> dict:
        return {
            "final_p_fraud":   round(self.p_fraud, 4),
            "total_updates":   self.step,
            "belief_history":  self.history,
            "p_fraud_change":  round(self.p_fraud - self.history[0]["p_fraud"], 4),
        }
