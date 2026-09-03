# AEGIS — Setup & Installation Guide

## Prerequisites

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Python | 3.10+ | Backend ML engine |
| Node.js | 18.0+ | Frontend dev server |
| npm | 9.0+ | Package manager for frontend |
| Git | Any | Version control |

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/Sahil-Scripts/NHCE.git
cd NHCE
```

---

## Step 2 — Install Python Backend Dependencies

### Option A: Install directly (simple)
```bash
pip install -r requirements.txt
```

### Option B: Install inside a virtual environment (recommended)
```bash
# Create a virtual environment
python -m venv venv

# Activate it
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Verify installation
```bash
python -c "import xgboost, networkx, pandas, numpy, sklearn; print('All packages OK')"
```

---

## Step 3 — Train the ML Model

```bash
python backend/train.py
```

This generates:
- `backend/models/xgb_model.pkl` — Trained XGBoost model
- `backend/data/sample_transactions.csv` — Labeled synthetic dataset
- `backend/data/accounts.csv` — Account metadata

---

## Step 4 — Install Frontend Dependencies

```bash
cd frontend/frontend
npm install
```

---

## Step 5 — Launch the Application

### Windows one-click startup:
```cmd
# From project root — double-click or run:
start_all.bat
```

### Manual startup:
```bash
# Terminal 1 — Start the frontend dev server:
cd frontend/frontend
npm run dev

# The app will be available at:
# http://localhost:8080
```

---

## Step 6 — (Optional) Run Backend Diagnostics

Test all 5 algorithm stages from the CLI:
```bash
python backend/run_diagnostics.py --stage all

# Or test individual stages:
python backend/run_diagnostics.py --stage A   # XGBoost scoring
python backend/run_diagnostics.py --stage B   # Shannon entropy
python backend/run_diagnostics.py --stage C   # Evidence planner
python backend/run_diagnostics.py --stage D   # Graph & temporal
python backend/run_diagnostics.py --stage E   # Bayesian decision
```

---

## Step 7 — Run a Sample Investigation (CLI)

```bash
# Investigate a random suspicious transaction:
python backend/investigate.py

# Investigate a specific transaction ID:
python backend/investigate.py --txn_id TXN_000042

# Run 3 demo cases back-to-back:
python backend/investigate.py --demo
```

---

## Package Summary

| Package | Version | Why It's Used |
|---------|---------|---------------|
| `xgboost` | ≥ 2.0.0 | Stage A: Gradient boosted model scoring 43 transaction features |
| `scikit-learn` | ≥ 1.3.0 | Model training pipeline, ROC-AUC evaluation |
| `scipy` | ≥ 1.11.0 | Statistical distributions for structuring cluster detection |
| `numpy` | ≥ 1.24.0 | Vectorized entropy, likelihood ratio, and feature computations |
| `pandas` | ≥ 2.0.0 | Transaction DataFrame loading and time-series feature extraction |
| `networkx` | ≥ 3.1 | Stage D: Directed graph construction and DFS cycle search |
| `joblib` | ≥ 1.3.0 | Saving/loading the trained `xgb_model.pkl` artifact |
| `matplotlib` | ≥ 3.7.0 | Optional: ROC curve and entropy convergence plots |
