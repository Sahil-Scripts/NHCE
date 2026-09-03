"""
AEGIS — XGBoost Risk Scorer (Stage A)
Loads the trained XGBoost model and returns a sigmoid-normalized
fraud probability P₀(fraud) ∈ [0, 1] for each transaction.
"""

import numpy as np
import joblib
from pathlib import Path
from core.features import FEATURE_COLUMNS

MODEL_PATH = Path(__file__).parent.parent / "models" / "xgb_model.pkl"
HIGH_RISK_THRESHOLD = 0.65   # Transactions above this enter the investigation loop


class AEGISScorer:
    """XGBoost-based initial risk scorer — Stage A of the AEGIS pipeline."""

    def __init__(self, model_path: Path = MODEL_PATH):
        if not model_path.exists():
            raise FileNotFoundError(
                f"Model not found at {model_path}. Run 'python train.py' first."
            )
        self.model = joblib.load(model_path)
        self.threshold = HIGH_RISK_THRESHOLD

    def score(self, feature_dict: dict) -> dict:
        """
        Score a single transaction's feature vector.

        Returns:
            {
              "risk_prior": float [0,1],   # P₀(fraud)
              "is_high_risk": bool,        # enters investigation loop if True
              "raw_score": float,          # pre-sigmoid XGBoost output
              "top_features": list         # top contributing features
            }
        """
        import pandas as pd
        row = pd.DataFrame([feature_dict])[FEATURE_COLUMNS].fillna(0)
        raw_score  = self.model.predict(row, output_margin=True)[0]
        risk_prior = float(1 / (1 + np.exp(-raw_score)))   # sigmoid

        # Feature importances for explanation
        importances = self.model.feature_importances_
        feat_importance = sorted(
            zip(FEATURE_COLUMNS, importances),
            key=lambda x: x[1], reverse=True
        )
        top_features = [
            {"feature": name, "importance": float(imp)}
            for name, imp in feat_importance[:5]
        ]

        return {
            "risk_prior":   risk_prior,
            "is_high_risk": risk_prior >= self.threshold,
            "raw_score":    float(raw_score),
            "top_features": top_features,
        }

    def score_batch(self, features_df) -> list:
        """Score a batch of transactions."""
        import pandas as pd
        rows = features_df[FEATURE_COLUMNS].fillna(0)
        raw_scores  = self.model.predict(rows, output_margin=True)
        risk_priors = 1 / (1 + np.exp(-raw_scores))
        return [
            {"risk_prior": float(rp), "is_high_risk": float(rp) >= self.threshold}
            for rp in risk_priors
        ]
