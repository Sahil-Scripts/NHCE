"""
AEGIS -- Model Training Script
Generates synthetic data, engineers features, trains XGBoost,
and saves the model to models/xgb_model.pkl
"""

import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, str(Path(__file__).parent))

import numpy as np
import pandas as pd
import joblib
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    roc_auc_score, classification_report, confusion_matrix, precision_recall_curve
)
import xgboost as xgb

from data.synthetic_gen import generate_dataset
from core.features import engineer_features, FEATURE_COLUMNS

MODEL_DIR  = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "xgb_model.pkl"
MODEL_DIR.mkdir(exist_ok=True)


def train():
    print("\n" + "=" * 60)
    print("  AEGIS -- Training Pipeline")
    print("=" * 60)

    # Step 1: Generate data
    print("\n[1/5] Generating synthetic transaction dataset...")
    t0 = time.time()
    df, accounts, rings = generate_dataset()

    # Load account metadata
    acc_df = pd.read_csv(Path(__file__).parent / "data" / "accounts.csv")

    # -- Step 2: Feature engineering -------------------------------------------
    print("\n[2/5] Engineering features (this may take ~30s for 8k txns)...")
    # Use a sample for speed during demo -- increase for production
    sample_size = min(len(df), 3000)
    df_sample = df.sample(n=sample_size, random_state=42).reset_index(drop=True)

    feat_df = engineer_features(df_sample, acc_df)
    feat_df["label"] = df_sample["label"].values
    feat_df = feat_df.fillna(0)
    print(f"  [OK] {len(feat_df):,} samples  {len(FEATURE_COLUMNS)} features")

    # -- Step 3: Train/test split ----------------------------------------------
    print("\n[3/5] Splitting train/test (80/20)...")
    X = feat_df[FEATURE_COLUMNS]
    y = feat_df["label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, stratify=y, random_state=42
    )
    print(f"  Train: {len(X_train):,} samples | Test: {len(X_test):,} samples")
    print(f"  Fraud rate -- Train: {y_train.mean()*100:.1f}% | Test: {y_test.mean()*100:.1f}%")

    # -- Step 4: Train XGBoost ------------------------------------------------
    print("\n[4/5] Training XGBoost...")
    scale_pos_weight = (y_train == 0).sum() / max((y_train == 1).sum(), 1)

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.80,
        scale_pos_weight=scale_pos_weight,
        eval_metric="auc",
        use_label_encoder=False,
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        verbose=False,
    )
    print("  [OK] Training complete")

    # -- Step 5: Evaluate ------------------------------------------------------
    print("\n[5/5] Evaluating model performance...")
    y_pred_proba = model.predict_proba(X_test)[:, 1]
    y_pred       = (y_pred_proba >= 0.65).astype(int)

    auc   = roc_auc_score(y_test, y_pred_proba)
    cm    = confusion_matrix(y_test, y_pred)
    tn, fp, fn, tp = cm.ravel()
    precision = tp / max(tp + fp, 1)
    recall    = tp / max(tp + fn, 1)
    f1        = 2 * precision * recall / max(precision + recall, 1e-9)
    fp_rate   = fp / max(fp + tn, 1)

    print(f"\n  {'Metric':<30} {'Value':>10}")
    print(f"  {'-'*42}")
    print(f"  {'ROC-AUC':<30} {auc:>10.4f}")
    print(f"  {'Precision':<30} {precision:>10.4f}")
    print(f"  {'Recall':<30} {recall:>10.4f}")
    print(f"  {'F1 Score':<30} {f1:>10.4f}")
    print(f"  {'False Positive Rate':<30} {fp_rate:>10.4f}")
    print(f"  {'True Positives':<30} {tp:>10,}")
    print(f"  {'False Positives':<30} {fp:>10,}")
    print(f"  {'False Negatives':<30} {fn:>10,}")

    # Top features
    importances = model.feature_importances_
    feat_imp = sorted(zip(FEATURE_COLUMNS, importances), key=lambda x: x[1], reverse=True)
    print(f"\n  Top 10 Most Important Features:")
    for name, imp in feat_imp[:10]:
        bar = "#" * int(imp * 200)
        print(f"    {name:<35} {imp:.4f}  {bar}")

    # Save
    joblib.dump(model, MODEL_PATH)
    print(f"\n  [OK] Model saved -> {MODEL_PATH}")
    print("\n" + "=" * 60)
    print("  Training Complete! Run 'python investigate.py' to test AEGIS.")
    print("=" * 60 + "\n")

    return model


if __name__ == "__main__":
    train()
