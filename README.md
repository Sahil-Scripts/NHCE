# AEGIS — Autonomous Financial Crime Investigation System

AEGIS is an entropy-driven, graph-traversed, and Bayesian-converged financial crime investigation engine designed to replace rigid legacy SQL-based AML rules.

---

## 🌟 Overview & Highlights

- **Stage A (Risk Normalization)**: XGBoost gradient-boosted scoring on 40+ engineered features mapping to initial prior $P_0(\text{fraud}) \in [0, 1]$.
- **Stage B (Confidence Estimation)**: Shannon entropy $H(X) = -\sum p(x) \log_2 p(x)$ determines if uncertainty is sufficiently resolved ($H < \theta$) before deciding.
- **Stage C (Adaptive Evidence Selection)**: Information-theoretic evidence planner optimizing $\text{Utility} = \frac{\text{InfoGain}(\text{source})}{\text{QueryCost}(\text{source})}$.
- **Stage D (Graph & Temporal Traversal)**: NetworkX BFS/DFS cycle detection for shell rings (3-12 hops), circular round-trips, and velocity micro-bursts.
- **Bayesian Belief Convergence**: Probabilistic posterior updates $P(\text{fraud} | E) \propto P(E | \text{fraud}) P(\text{fraud})$ driving confidence.
- **Stage E (Decision & Compliance)**: Sub-2s automated decisions with FIU-IND and RBI-compliant automated Suspicious Transaction Report (STR) generation.

---

## 📁 Repository Structure

```
s:\NHCE\
├── Presentation/                      # Interactive presentation deck
│   ├── problem-statement.html         # Slide 1: Legacy AML failure modes
│   ├── solution.html                  # Slide 2: 4-Layer AEGIS architecture
│   └── aegis_technical_approach.html  # Slide 3: Algorithm deep dive
├── frontend/
│   ├── account_data/
│   │   ├── generate_bank_csvs.py      # Bank statement CSV generator
│   │   └── generated_accounts/        # 50 real bank statement CSVs
│   └── frontend/                      # React 19 + TanStack Start + Tailwind + Radix UI
│       ├── src/                       # Transaction flow analysis, circular loop detection
│       └── package.json
├── backend/
│   ├── core/
│   │   ├── features.py                # 40+ transaction feature engineering
│   │   ├── scorer.py                  # XGBoost Stage A risk scorer
│   │   ├── entropy.py                 # Stage B Shannon entropy engine
│   │   ├── planner.py                 # Stage C adaptive evidence selection
│   │   ├── graph_engine.py            # Stage D NetworkX graph intelligence
│   │   ├── temporal.py                # Stage D temporal & velocity engine
│   │   ├── bayesian.py                # Bayesian belief update loop
│   │   └── decision.py                # Stage E decision & STR report generator
│   ├── data/
│   │   ├── synthetic_gen.py           # Multi-hop fraud scenario generator
│   │   ├── sample_transactions.csv    # Generated synthetic dataset
│   │   └── accounts.csv               # Accounts metadata & risk profiles
│   ├── demo/
│   │   └── run_demo.py                # End-to-end stream demonstration
│   ├── dashboard/
│   │   └── index.html                 # Real-time investigation dashboard (Slide 4)
│   ├── reports/                       # Generated FIU-IND STR audit reports (.json)
│   ├── train.py                       # Model training & ROC-AUC evaluation script
│   ├── investigate.py                 # Interactive CLI investigation tool
│   └── requirements.txt               # Dependencies
└── README.md
```

---

## 🚀 Quickstart Guide

### 1. Requirements Installation
```bash
pip install -r backend/requirements.txt
```

### 2. Generate Data & Train Model
```bash
python backend/train.py
```

### 3. Run Single Transaction Investigation (CLI)
```bash
# Run random suspicious case:
python backend/investigate.py

# Run on a specific transaction:
python backend/investigate.py --txn_id TXN_000042

# Run 3 interactive cases:
python backend/investigate.py --demo
```

### 4. Run Batch Demo
```bash
python backend/demo/run_demo.py
```

### 5. Launch Interactive FIU India Frontend
```bash
cd frontend/frontend
npm run dev
```
Open `http://localhost:8080` to interact with the full Transaction Flow Analysis dashboard.
