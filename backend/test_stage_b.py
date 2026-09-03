"""
AEGIS — Stage B Verification & Deep Dive
Demonstrates Shannon Entropy Confidence Estimation:
  H(X) = -p*log2(p) - (1-p)*log2(1-p)
Shows:
1. Entropy vs. Probability curve across belief states
2. Threshold gating (H < 0.35 bits -> CONFIDENT)
3. Step-by-step collapse of uncertainty during an investigation
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
from core.entropy import compute_entropy, is_confident, entropy_loop_status, ENTROPY_THRESHOLD

def test_stage_b():
    print("=" * 70)
    print("  AEGIS -- STAGE B: SHANNON ENTROPY CONFIDENCE ENGINE")
    print("  Mathematical Rule: H(X) = -p*log2(p) - (1-p)*log2(1-p) in [0, 1] bits")
    print(f"  Confidence Threshold: theta = {ENTROPY_THRESHOLD} bits")
    print("=" * 70)

    # 1. Theoretical Entropy Curve
    print("\n--- Part 1: Binary Shannon Entropy vs. Fraud Probability ---")
    print(f"  {'P(fraud)':<10} {'Entropy H(X)':<16} {'Confidence %':<15} {'Loop Decision'}")
    print("  " + "-" * 62)

    test_probs = [0.01, 0.05, 0.10, 0.20, 0.35, 0.50, 0.65, 0.80, 0.90, 0.95, 0.99]
    for p in test_probs:
        h = compute_entropy(p)
        conf = (1 - h) * 100
        decision = "CONFIDENT -> Proceed to Stage E" if h < ENTROPY_THRESHOLD else "UNCERTAIN -> Gather More Evidence (Stage C)"
        bar = "#" * int(h * 20)
        print(f"  {p:<10.2f} {h:<8.4f} bits {bar:<10} {conf:>6.1f}%        {decision}")

    # 2. Simulation of Uncertainty Collapse
    print("\n--- Part 2: Live Investigation Uncertainty Collapse ---")
    print("Simulating belief updates as evidence arrives for an initially ambiguous case:\n")
    
    # Starting at maximum uncertainty P = 0.50
    evidence_steps = [
        ("XGBoost Prior (Ambiguous)", 0.50),
        ("Watchlist Query: Clean (+0.05)", 0.55),
        ("Temporal Query: Velocity Burst Detected (+0.18)", 0.73),
        ("Graph Query: 4-Hop Shell Loop Discovered (+0.21)", 0.94),
        ("Final Bayesian Convergence (+0.04)", 0.98),
    ]

    for step_num, (desc, p) in enumerate(evidence_steps):
        status = entropy_loop_status(p, step_num)
        h = status["entropy"]
        conf = status["confidence_pct"]
        is_conf = status["is_confident"]
        
        status_tag = "[OK] CONFIDENT -> PROCEED TO STAGE E" if is_conf else "[...] UNCERTAIN -> LOOP BACK"
        
        print(f"  Step {step_num}: {desc}")
        print(f"    P(fraud)   : {p:.4f}")
        print(f"    Entropy    : {h:.4f} bits (Threshold: {ENTROPY_THRESHOLD})")
        print(f"    Confidence : {conf:.1f}%")
        print(f"    Action     : {status_tag}\n")

    print("=" * 70)
    print("Stage B Conclusion: Investigation terminates ONLY when entropy drops below theta.")
    print("This mathematically prevents alert fatigue and eliminates arbitrary loop counts.")
    print("=" * 70)

if __name__ == "__main__":
    test_stage_b()
