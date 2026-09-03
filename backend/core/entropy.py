"""
AEGIS — Shannon Entropy Confidence Engine (Stage B)
Computes H(X) over the current fraud belief distribution.
High entropy = uncertain → gather more evidence.
Low entropy < θ = confident → proceed to decision.

H(X) = -Σ p(x) · log₂ p(x)
"""

import numpy as np

ENTROPY_THRESHOLD = 0.35   # bits — below this, we are confident enough to decide
MAX_ITERATIONS    = 10     # safety: never loop more than 10 times


def compute_entropy(p_fraud: float) -> float:
    """
    Compute binary Shannon entropy for a Bernoulli belief distribution.

    Args:
        p_fraud: Current posterior probability of fraud ∈ (0, 1)

    Returns:
        H(X) in bits ∈ [0, 1]
    """
    p = np.clip(p_fraud, 1e-9, 1 - 1e-9)
    q = 1 - p
    return float(-p * np.log2(p) - q * np.log2(q))


def is_confident(p_fraud: float, threshold: float = ENTROPY_THRESHOLD) -> bool:
    """Return True if entropy is below the confidence threshold."""
    return compute_entropy(p_fraud) < threshold


def entropy_loop_status(p_fraud: float, iteration: int, threshold: float = ENTROPY_THRESHOLD) -> dict:
    """
    Return the full entropy loop status for a given belief state.

    Returns:
        {
          "p_fraud": float,
          "entropy": float,
          "threshold": float,
          "is_confident": bool,
          "iteration": int,
          "confidence_pct": float,      # 1 - H/H_max, as percentage
          "status_label": str
        }
    """
    h = compute_entropy(p_fraud)
    h_max = 1.0   # max binary entropy at p=0.5
    confident = h < threshold

    if confident:
        label = "CONFIDENT -- PROCEEDING TO DECISION"
    elif iteration >= MAX_ITERATIONS:
        label = "MAX ITERATIONS -- FORCED DECISION"
    else:
        label = f"UNCERTAIN -- GATHERING EVIDENCE (iteration {iteration+1}/{MAX_ITERATIONS})"

    return {
        "p_fraud":         p_fraud,
        "entropy":         h,
        "threshold":       ENTROPY_THRESHOLD,
        "is_confident":    confident,
        "forced":          iteration >= MAX_ITERATIONS,
        "iteration":       iteration,
        "confidence_pct":  round((1 - h / h_max) * 100, 1),
        "status_label":    label,
    }
