"""
generate_import_csvs.py
Generates a folder of realistic Indian bank transaction CSV files
in the exact format used by the NHCE AEGIS system.

Output: s:/NHCE/sample_import_csvs/   (15 files, various forensic patterns)

Run: python generate_import_csvs.py
"""

import csv
import os
import random
import math
from datetime import datetime, timedelta

random.seed(42)

OUT_DIR = os.path.join(os.path.dirname(__file__), "sample_import_csvs")
os.makedirs(OUT_DIR, exist_ok=True)

# ── Helpers ──────────────────────────────────────────────────────────────────

FIRST_NAMES = [
    "Aarav", "Aditya", "Akash", "Amit", "Ananya", "Arjun", "Aryan",
    "Deepika", "Divya", "Ishaan", "Kavya", "Kiran", "Meera", "Mohan",
    "Nisha", "Priya", "Rahul", "Rajesh", "Ravi", "Ritika", "Rohit",
    "Saanvi", "Sanjay", "Sunita", "Suresh", "Tanvi", "Varun", "Vihaan",
    "Vikram", "Zara",
]
LAST_NAMES = [
    "Agarwal", "Bansal", "Bose", "Chaudhary", "Das", "Gupta", "Iyer",
    "Jain", "Joshi", "Kapoor", "Kumar", "Mehta", "Mishra", "Nair",
    "Patel", "Pillai", "Rao", "Reddy", "Sharma", "Singh", "Sinha",
    "Tiwari", "Trivedi", "Verma", "Yadav",
]
MODES = ["NEFT", "RTGS", "IMPS", "UPI", "Bank Transfer", "Cheque"]
LOAN_TYPES = ["Home Loan", "Personal Loan", "Car Loan", "Business Loan", "Education Loan"]

_name_cache: dict[str, str] = {}


def acc_name(acc_id: str) -> str:
    if acc_id not in _name_cache:
        seed = sum(ord(c) * (i + 1) for i, c in enumerate(acc_id))
        rng = random.Random(seed % (2**32))
        _name_cache[acc_id] = f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"
    return _name_cache[acc_id]


def fmt_date(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d")


def fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


def txn_id(acc: str, n: int) -> str:
    return f"TXN_{acc}_{n:04d}"


CSV_HEADER = [
    "Sl No", "Transaction Type", "Mode", "From Account", "From Name",
    "To Account", "To Name", "Amount", "Date", "Time",
    "Savings Balance", "FD Amount", "Loan Type", "Outstanding Loan",
]


def write_csv(filename: str, rows: list[dict]) -> None:
    path = os.path.join(OUT_DIR, filename)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=CSV_HEADER)
        w.writeheader()
        for row in rows:
            w.writerow(row)
    kb = os.path.getsize(path) // 1024
    print(f"  [OK] {filename}  ({len(rows)} transactions, ~{kb} KB)")


def make_row(
    sl: int, acc_id: str, txn_type: str,
    from_acc: str, to_acc: str,
    amount: float, dt: datetime,
    balance: float, fd: float = 500000.0,
    loan_type: str = "Personal Loan", loan_outstanding: float = 0.0,
) -> dict:
    return {
        "Sl No": sl,
        "Transaction Type": txn_type,
        "Mode": random.choice(MODES),
        "From Account": from_acc,
        "From Name": acc_name(from_acc),
        "To Account": to_acc,
        "To Name": acc_name(to_acc),
        "Amount": round(amount, 2),
        "Date": fmt_date(dt),
        "Time": fmt_time(dt),
        "Savings Balance": round(balance, 2),
        "FD Amount": round(fd, 2),
        "Loan Type": loan_type,
        "Outstanding Loan": round(loan_outstanding, 2),
    }


BASE_DATE = datetime(2024, 1, 5)


def rand_dt(start: datetime, days_range: int = 120) -> datetime:
    delta_days = random.randint(0, days_range)
    delta_secs = random.randint(0, 86399)
    return start + timedelta(days=delta_days, seconds=delta_secs)


# ── Pattern 1: Normal High-Volume Retail Account ─────────────────────────────
def gen_normal_retail(acc_id: str, n_txns: int = 200) -> list[dict]:
    rows = []
    balance = random.uniform(100000, 800000)
    peers = [str(random.randint(1000000000, 9999999999)) for _ in range(12)]
    for i in range(1, n_txns + 1):
        credit = random.random() > 0.45
        amount = round(random.uniform(500, 50000), 2)
        if credit:
            balance += amount
            rows.append(make_row(i, acc_id, "CREDIT", random.choice(peers), acc_id, amount, rand_dt(BASE_DATE), balance))
        else:
            balance -= amount
            rows.append(make_row(i, acc_id, "DEBIT", acc_id, random.choice(peers), amount, rand_dt(BASE_DATE), balance))
    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Pattern 2: Circular Money Loop (A→B→C→D→A) ──────────────────────────────
def gen_circular_loop(acc_ids: list[str]) -> dict[str, list[dict]]:
    """Generate a circular loop across 4 accounts."""
    n = len(acc_ids)
    all_rows: dict[str, list[dict]] = {a: [] for a in acc_ids}
    loop_amount = round(random.uniform(180000, 195000), 2)  # Just below ₹2L structuring threshold

    dt = BASE_DATE + timedelta(days=random.randint(5, 30))
    for i, acc in enumerate(acc_ids):
        nxt = acc_ids[(i + 1) % n]
        # Initial seeding credit from external
        ext = str(random.randint(1000000000, 9999999999))
        balance = random.uniform(200000, 600000)
        seed_row = make_row(1, acc, "CREDIT", ext, acc, loop_amount + random.uniform(5000, 20000), dt, balance)
        all_rows[acc].append(seed_row)

        # The circular hop
        balance -= loop_amount
        dt2 = dt + timedelta(hours=random.randint(1, 8))
        loop_row = make_row(2, acc, "DEBIT", acc, nxt, loop_amount, dt2, balance)
        all_rows[acc].append(loop_row)

        # Receive from previous
        balance += loop_amount
        dt3 = dt + timedelta(hours=random.randint(9, 16))
        recv_row = make_row(3, acc, "CREDIT", acc_ids[(i - 1) % n], acc, loop_amount, dt3, balance)
        all_rows[acc].append(recv_row)

        # Normal noise transactions
        for j in range(4, 60):
            credit = random.random() > 0.5
            amt = round(random.uniform(1000, 30000), 2)
            peer = str(random.randint(1000000000, 9999999999))
            dt4 = rand_dt(BASE_DATE)
            if credit:
                balance += amt
                all_rows[acc].append(make_row(j, acc, "CREDIT", peer, acc, amt, dt4, balance))
            else:
                balance -= amt
                all_rows[acc].append(make_row(j, acc, "DEBIT", acc, peer, amt, dt4, balance))

        all_rows[acc].sort(key=lambda r: r["Date"])

    return all_rows


# ── Pattern 3: Structuring (transactions just under ₹2,00,000) ──────────────
def gen_structuring(acc_id: str, n_struct: int = 25) -> list[dict]:
    rows = []
    balance = random.uniform(500000, 2000000)
    peers = [str(random.randint(1000000000, 9999999999)) for _ in range(6)]

    # First 30 normal
    for i in range(1, 31):
        credit = random.random() > 0.5
        amt = round(random.uniform(5000, 80000), 2)
        peer = random.choice(peers)
        dt = rand_dt(BASE_DATE)
        if credit:
            balance += amt
            rows.append(make_row(i, acc_id, "CREDIT", peer, acc_id, amt, dt, balance))
        else:
            balance -= amt
            rows.append(make_row(i, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))

    # Structuring block — amounts cluster tightly below ₹2L
    for j in range(n_struct):
        amt = round(random.uniform(185000, 199500), 2)
        peer = random.choice(peers)
        dt = rand_dt(BASE_DATE + timedelta(days=30), days_range=30)
        balance -= amt
        rows.append(make_row(31 + j, acc_id, "DEBIT", acc_id, peer, amt, dt, balance, loan_type="Business Loan"))

    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Pattern 4: Velocity Burst (5+ transactions in 30 minutes) ───────────────
def gen_velocity_burst(acc_id: str) -> list[dict]:
    rows = []
    balance = random.uniform(300000, 1000000)
    peers = [str(random.randint(1000000000, 9999999999)) for _ in range(8)]

    # Normal activity first
    for i in range(1, 80):
        credit = random.random() > 0.5
        amt = round(random.uniform(2000, 60000), 2)
        peer = random.choice(peers)
        dt = rand_dt(BASE_DATE)
        if credit:
            balance += amt
            rows.append(make_row(i, acc_id, "CREDIT", peer, acc_id, amt, dt, balance))
        else:
            balance -= amt
            rows.append(make_row(i, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))

    # Burst: 8 transactions within 20 minutes
    burst_start = BASE_DATE + timedelta(days=45, hours=14)
    for k in range(8):
        amt = round(random.uniform(50000, 150000), 2)
        peer = random.choice(peers)
        dt = burst_start + timedelta(minutes=k * 2 + random.randint(0, 1))
        balance -= amt
        rows.append(make_row(80 + k, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))

    # More normal after
    for m in range(20):
        credit = random.random() > 0.5
        amt = round(random.uniform(1000, 40000), 2)
        peer = random.choice(peers)
        dt = rand_dt(BASE_DATE + timedelta(days=50))
        if credit:
            balance += amt
            rows.append(make_row(88 + m, acc_id, "CREDIT", peer, acc_id, amt, dt, balance))
        else:
            balance -= amt
            rows.append(make_row(88 + m, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))

    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Pattern 5: Dormant Account (90+ day gap then sudden large activity) ──────
def gen_dormant(acc_id: str) -> list[dict]:
    rows = []
    balance = random.uniform(80000, 250000)
    peers = [str(random.randint(1000000000, 9999999999)) for _ in range(5)]

    # A few old transactions (Jan 2024)
    for i in range(1, 8):
        credit = random.random() > 0.4
        amt = round(random.uniform(5000, 40000), 2)
        peer = random.choice(peers)
        dt = BASE_DATE + timedelta(days=random.randint(0, 15))
        if credit:
            balance += amt
            rows.append(make_row(i, acc_id, "CREDIT", peer, acc_id, amt, dt, balance))
        else:
            balance -= amt
            rows.append(make_row(i, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))

    # 100-day silence, then sudden wake-up with large txns (May 2024)
    wake_date = BASE_DATE + timedelta(days=115)
    new_peers = [str(random.randint(1000000000, 9999999999)) for _ in range(3)]
    for j in range(15):
        amt = round(random.uniform(100000, 450000), 2)
        peer = random.choice(new_peers)
        dt = wake_date + timedelta(days=j, hours=random.randint(0, 23))
        balance += amt
        rows.append(make_row(8 + j, acc_id, "CREDIT", peer, acc_id, amt, dt, balance, loan_type="Business Loan"))

    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Pattern 6: Shell Company (receives large amounts, immediately re-routes) ─
def gen_shell(acc_id: str, destinations: list[str]) -> list[dict]:
    rows = []
    balance = 10000.0
    sources = [str(random.randint(1000000000, 9999999999)) for _ in range(4)]

    sl = 1
    for day in range(0, 90, 3):
        dt = BASE_DATE + timedelta(days=day, hours=random.randint(9, 17))
        # Receive large credit
        credit_amt = round(random.uniform(200000, 800000), 2)
        balance += credit_amt
        rows.append(make_row(sl, acc_id, "CREDIT", random.choice(sources), acc_id, credit_amt, dt, balance, loan_type="Business Loan"))
        sl += 1

        # Within hours, route same amount out to multiple destinations
        n_out = random.randint(2, 4)
        split_amt = credit_amt / n_out
        for dest in random.sample(destinations, min(n_out, len(destinations))):
            dt2 = dt + timedelta(hours=random.randint(1, 5))
            balance -= split_amt
            rows.append(make_row(sl, acc_id, "DEBIT", acc_id, dest, round(split_amt, 2), dt2, balance, loan_type="Business Loan"))
            sl += 1

    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Pattern 7: Large but Legitimate Salary + Investment Account ──────────────
def gen_legitimate_hni(acc_id: str) -> list[dict]:
    rows = []
    balance = random.uniform(2000000, 8000000)
    employer = str(random.randint(1000000000, 9999999999))
    brokers = [str(random.randint(1000000000, 9999999999)) for _ in range(3)]
    peers = [str(random.randint(1000000000, 9999999999)) for _ in range(5)]

    sl = 1
    for month in range(4):  # Jan–Apr salary
        salary_date = BASE_DATE + timedelta(days=month * 30 + 28)
        salary = round(random.uniform(300000, 800000), 2)
        balance += salary
        rows.append(make_row(sl, acc_id, "CREDIT", employer, acc_id, salary, salary_date, balance,
                             fd=round(random.uniform(1000000, 5000000), 2), loan_type="Home Loan",
                             loan_outstanding=round(random.uniform(3000000, 8000000), 2)))
        sl += 1

        # Monthly investment to broker
        invest_dt = salary_date + timedelta(days=2)
        invest_amt = round(salary * random.uniform(0.3, 0.5), 2)
        balance -= invest_amt
        rows.append(make_row(sl, acc_id, "DEBIT", acc_id, random.choice(brokers), invest_amt, invest_dt, balance,
                             fd=round(random.uniform(1000000, 5000000), 2), loan_type="Home Loan",
                             loan_outstanding=round(random.uniform(3000000, 8000000), 2)))
        sl += 1

    # General spending
    for _ in range(100):
        credit = random.random() > 0.65
        amt = round(random.uniform(1000, 120000), 2)
        peer = random.choice(peers)
        dt = rand_dt(BASE_DATE)
        if credit:
            balance += amt
            rows.append(make_row(sl, acc_id, "CREDIT", peer, acc_id, amt, dt, balance))
        else:
            balance -= amt
            rows.append(make_row(sl, acc_id, "DEBIT", acc_id, peer, amt, dt, balance))
        sl += 1

    rows.sort(key=lambda r: r["Date"])
    return rows


# ── Main generation ───────────────────────────────────────────────────────────

def main():
    print("\nGenerating sample_import_csvs ...\n")

    # 1. Normal retail accounts (3 files)
    for acc in ["ACC_RETAIL_001", "ACC_RETAIL_002", "ACC_RETAIL_003"]:
        rows = gen_normal_retail(acc, n_txns=random.randint(150, 280))
        write_csv(f"{acc}.csv", rows)

    # 2. Circular Loop — 4 accounts forming a ring
    loop_ids = ["LOOP_ALPHA_01", "LOOP_BETA_02", "LOOP_GAMMA_03", "LOOP_DELTA_04"]
    loop_data = gen_circular_loop(loop_ids)
    for acc_id, rows in loop_data.items():
        write_csv(f"{acc_id}.csv", rows)

    # 3. Structuring — 2 accounts
    for acc in ["STRUCT_ACC_001", "STRUCT_ACC_002"]:
        rows = gen_structuring(acc, n_struct=random.randint(20, 35))
        write_csv(f"{acc}.csv", rows)

    # 4. Velocity burst — 1 account
    rows = gen_velocity_burst("VELO_BURST_001")
    write_csv("VELO_BURST_001.csv", rows)

    # 5. Dormant wake-up — 1 account
    rows = gen_dormant("DORMANT_001")
    write_csv("DORMANT_001.csv", rows)

    # 6. Shell company — 1 account routing through several destinations
    dest_ids = ["LOOP_ALPHA_01", "LOOP_BETA_02", "ACC_RETAIL_001",
                str(random.randint(1000000000, 9999999999))]
    rows = gen_shell("SHELL_CO_001", dest_ids)
    write_csv("SHELL_CO_001.csv", rows)

    # 7. Legitimate HNI — 1 account (should NOT trigger BLOCK)
    rows = gen_legitimate_hni("LEGIT_HNI_001")
    write_csv("LEGIT_HNI_001.csv", rows)

    total = len(os.listdir(OUT_DIR))
    print(f"\nDone! {total} CSV files written to:\n  {OUT_DIR}\n")
    print("Patterns included:")
    print("  ACC_RETAIL_001/002/003  -> Normal consumer banking activity")
    print("  LOOP_ALPHA/BETA/GAMMA/DELTA -> 4-hop circular money loop (suspicious)")
    print("  STRUCT_ACC_001/002      -> Structuring pattern (below INR 2L threshold)")
    print("  VELO_BURST_001          -> Velocity burst (8 txns in 20 minutes)")
    print("  DORMANT_001             -> Dormant 100 days -> sudden large credits")
    print("  SHELL_CO_001            -> Shell company routing pattern")
    print("  LEGIT_HNI_001           -> Legitimate HNI salary + investments")


if __name__ == "__main__":
    main()
