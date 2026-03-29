"""
ARIA Account Generator
======================
Generates 10 synthetic accounts from real CUAD contract data.

Each account gets a unique: account JSON, contract JSON, invoice JSON, usage JSON.
Invoices are seeded with varied billing errors so the ARIA pipeline has meaningful
discrepancies to detect across the portfolio.

Usage (from project root or backend/):
    python backend/generate_accounts.py

Requires .cuad_cache/train_separate_questions.json — run CUAD.py first if missing.
"""

import json
import random
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
CUAD_TRAIN_JSON = PROJECT_ROOT / ".cuad_cache" / "train_separate_questions.json"

DATA_DIR = Path(__file__).parent / "data"
ACCOUNTS_DIR  = DATA_DIR / "accounts"
CONTRACTS_DIR = DATA_DIR / "contracts"
INVOICES_DIR  = DATA_DIR / "invoices"
USAGE_DIR     = DATA_DIR / "usage"

# ── Pricing tiers ─────────────────────────────────────────────────────────────

PRICING_TIERS = [
    {
        "tier_id": "starter",
        "name": "Starter",
        "base_fee": 5_000,
        "usage_limit": 1_000,
        "overage_rate": 0.10,
        "unit_multiplier": 100,
        "max_discount_rate": 0.15,
    },
    {
        "tier_id": "professional",
        "name": "Professional",
        "base_fee": 25_000,
        "usage_limit": 5_000,
        "overage_rate": 0.08,
        "unit_multiplier": 500,
        "max_discount_rate": 0.20,
    },
    {
        "tier_id": "enterprise",
        "name": "Enterprise",
        "base_fee": 50_000,
        "usage_limit": 8_000,
        "overage_rate": 0.06,
        "unit_multiplier": 750,
        "max_discount_rate": 0.25,
    },
    {
        "tier_id": "enterprise-plus",
        "name": "Enterprise Plus",
        "base_fee": 85_000,
        "usage_limit": 10_000,
        "overage_rate": 0.05,
        "unit_multiplier": 1_000,
        "max_discount_rate": 0.30,
    },
]

# ── Synthetic company identities ───────────────────────────────────────────────

COMPANIES = [
    ("Orbit Systems Prime",  "Cloud Infrastructure",          "US-EAST",    "billing@orbitsystemsprime.io"),
    ("Orbit Systems",        "Cloud Infrastructure",           "US-EAST",    "billing@orbitsystems.io"),
    ("Sentinel Technologies","Cybersecurity",                  "EU-WEST",    "accounts@sentineltech.io"),
    ("Meridian Data",        "Data Engineering",               "US-CENTRAL", "finance@meridiandata.io"),
    ("Apex Cloud",           "Cloud Services",                 "APAC",       "ops-finance@apexcloud.io"),
    ("Pioneer AI",           "Artificial Intelligence",        "US-WEST",    "billing@pioneerai.io"),
    ("Northstar Logistics",  "Supply Chain / Logistics",       "US-EAST",    "finance@northstarlogistics.io"),
    ("Catalyst Health",      "Healthcare Technology",          "US-CENTRAL", "accounts@catalysthealth.io"),
    ("Beacon Financial",     "FinTech",                        "EU-WEST",    "finance@beaconfinancial.io"),
    ("Aurora Robotics",      "Manufacturing / Robotics",       "APAC",       "billing@aurorarobotics.io"),
]

# Billing error types assigned round-robin to accounts.
# 4× missing_overage, 2× wrong_discount_scope, 2× wrong_unit_price, 2× clean
BILLING_ERRORS = [
    "missing_overage",
    "missing_overage",
    "wrong_discount_scope",
    "missing_overage",
    "wrong_unit_price",
    "missing_overage",
    "wrong_discount_scope",
    "clean",
    "wrong_unit_price",
    "clean",
]

# Accounts that must never be overwritten
PROTECTED_ACCOUNT_IDS = {"acme-ent-90210"}

# CUAD clause questions to extract
TARGET_FIELDS = {
    "governing law":      "governing_law",
    "termination":        "termination_notice",
    "payment terms":      "payment_terms",
    "renewal term":       "renewal_term",
}

BILLING_PERIOD  = "2024-10"
ISSUED_DATE     = "2024-11-01"
DUE_DATE        = "2024-12-01"
PERIOD_DAYS     = 31
PERIOD_START    = date(2024, 10, 1)


# ── CUAD helpers ──────────────────────────────────────────────────────────────

def load_cuad() -> dict[str, list[dict]]:
    """Load CUAD train JSON and group QA rows by contract title."""
    if not CUAD_TRAIN_JSON.exists():
        raise FileNotFoundError(
            f"CUAD data not found at {CUAD_TRAIN_JSON}\n"
            "Run CUAD.py from the project root first to download and cache it."
        )

    print(f"Loading CUAD from {CUAD_TRAIN_JSON} ...")
    with CUAD_TRAIN_JSON.open(encoding="utf-8") as fh:
        payload = json.load(fh)

    grouped: dict[str, list[dict]] = defaultdict(list)
    for example in payload.get("data", []):
        title = example.get("title", "").strip()
        for paragraph in example.get("paragraphs", []):
            for qa in paragraph.get("qas", []):
                grouped[title].append({
                    "question": qa.get("question", "").strip(),
                    "answers": {
                        "text": [a.get("text", "").strip() for a in qa.get("answers", [])],
                    },
                })

    print(f"  Found {len(grouped)} unique contracts in CUAD")
    return grouped


def extract_terms(rows: list[dict]) -> dict[str, str]:
    terms: dict[str, str] = {}
    for row in rows:
        q = row["question"].lower()
        answers = row["answers"]["text"]
        if not answers:
            continue
        for key, field in TARGET_FIELDS.items():
            if key in q and field not in terms:
                terms[field] = answers[0]
    return terms


def parse_days(text: str, default: int = 30) -> int:
    m = re.search(r"\d+", text)
    return int(m.group()) if m else default


# ── Data builders ─────────────────────────────────────────────────────────────

def _daily_breakdown(total_units: int) -> list[dict]:
    """Distribute total_units across PERIOD_DAYS days with realistic variation."""
    rng = random.Random(total_units)
    weights = [rng.uniform(0.5, 1.5) for _ in range(PERIOD_DAYS)]
    wsum = sum(weights)
    days = []
    remaining = total_units
    for i in range(PERIOD_DAYS - 1):
        u = round(weights[i] / wsum * total_units)
        days.append(u)
        remaining -= u
    days.append(max(0, remaining))
    return [
        {"date": (PERIOD_START + timedelta(days=i)).isoformat(), "units": days[i]}
        for i in range(PERIOD_DAYS)
    ]


def build_account(idx: int, account_id: str, contract_id: str, tier: dict) -> dict:
    name, industry, region, contact = COMPANIES[idx]
    rng = random.Random(idx * 7)
    discount_rate = round(rng.uniform(0.05, tier["max_discount_rate"]), 2)
    arr = round(tier["base_fee"] * (1 - discount_rate) * 12)
    return {
        "id": account_id,
        "name": name,
        "arr": arr,
        "tier": tier["name"],
        "contract_id": contract_id,
        "primary_contact": contact,
        "industry": industry,
        "status": "active",
        "created_at": "2024-01-01",
        "region": region,
    }


def build_contract(account_id: str, contract_id: str, tier: dict, terms: dict, idx: int) -> dict:
    rng = random.Random(idx * 7)
    discount_rate = round(rng.uniform(0.05, tier["max_discount_rate"]), 2)
    termination_days = parse_days(terms.get("termination_notice", "30 days"))
    payment_net_days = parse_days(terms.get("payment_terms", "net 30"), default=30)
    name = COMPANIES[idx][0]

    return {
        "id": contract_id,
        "account_id": account_id,
        "effective_date": "2024-01-01",
        "expiration_date": "2025-12-31",
        "term_months": 24,
        "pricing_tier": tier["name"],
        "base_fee_monthly": tier["base_fee"],
        "usage_limit_monthly": tier["usage_limit"],
        "usage_unit": "API calls",
        "overage_rate_per_unit": tier["overage_rate"],
        "unit_multiplier": tier["unit_multiplier"],
        "discount": {
            "rate": discount_rate,
            "scope": "base_only",
            "clause": "§12.3",
            "description": f"{round(discount_rate * 100)}% discount applies to base charges only",
        },
        "clauses": {
            "overage": {
                "section": "§4.2",
                "text": (
                    f"Overage rate: ${tier['overage_rate']:.2f} per unit above monthly limit "
                    f"of {tier['usage_limit']:,} units. Overage charges are calculated at the "
                    "end of each billing cycle."
                ),
            },
            "base_limit": {
                "section": "§7.1",
                "text": (
                    f"Base usage limit: {tier['usage_limit']:,} units per month. "
                    "Units are measured as individual API calls aggregated across all endpoints."
                ),
            },
            "discount_scope": {
                "section": "§12.3",
                "text": (
                    "Discounts apply to base charges only, not overage or add-on charges. "
                    "Any discount applied beyond base charges is a billing error and subject to correction."
                ),
            },
            "termination": {
                "section": "§9.1",
                "text": f"Either party may terminate with {termination_days} days written notice.",
            },
            "payment": {
                "section": "§5.2",
                "text": f"Payment due within {payment_net_days} days of invoice date.",
            },
            "governing_law": {
                "section": "§14.1",
                "text": terms.get("governing_law", "Governed by the laws of the State of Delaware."),
            },
        },
        "legal_terms": terms,
        "total_pages": rng.randint(15, 45),
        "signed_by": f"CFO, {name}",
        "status": "active",
    }


def build_usage_and_invoice(
    account_id: str,
    contract_id: str,
    contract: dict,
    error_type: str,
    idx: int,
) -> tuple[dict, dict]:
    rng = random.Random(idx * 13 + 999)

    limit        = contract["usage_limit_monthly"]
    overage_rate = contract["overage_rate_per_unit"]
    multiplier   = contract["unit_multiplier"]
    base_fee     = contract["base_fee_monthly"]
    discount_rate = contract["discount"]["rate"]
    tier_name    = contract["pricing_tier"]
    inv_id       = f"inv-2024-{500 + idx}"

    # ── Simulate actual usage and invoice based on error type ────────────────

    if error_type == "clean":
        actual_units      = rng.randint(int(limit * 0.60), int(limit * 0.90))
        overage_units     = 0
        invoice_base      = round(base_fee * (1 - discount_rate))
        ov_qty            = 0
        ov_amount         = 0.0
        ov_discount       = 0.0
        ov_note           = "No overage recorded"
        discount_to       = "base_only"
        discount_note     = f"{round(discount_rate * 100)}% discount applied to base charges only"

    elif error_type == "missing_overage":
        actual_units      = rng.randint(int(limit * 1.05), int(limit * 1.20))
        overage_units     = actual_units - limit
        invoice_base      = round(base_fee * (1 - discount_rate))
        ov_qty            = 0      # overage not billed
        ov_amount         = 0.0
        ov_discount       = 0.0
        ov_note           = "No overage recorded"
        discount_to       = "base_only"
        discount_note     = f"{round(discount_rate * 100)}% discount applied"

    elif error_type == "wrong_discount_scope":
        actual_units      = rng.randint(int(limit * 1.05), int(limit * 1.15))
        overage_units     = actual_units - limit
        correct_overage   = round(overage_units * overage_rate * multiplier, 2)
        invoice_base      = round(base_fee * (1 - discount_rate))
        ov_qty            = overage_units
        ov_amount         = round(correct_overage * (1 - discount_rate), 2)  # wrongly discounted
        ov_discount       = discount_rate
        ov_note           = f"Overage with {round(discount_rate * 100)}% discount applied"
        discount_to       = "all_charges"
        discount_note     = "Discount applied to all charges including overage"

    elif error_type == "wrong_unit_price":
        actual_units      = rng.randint(int(limit * 0.70), int(limit * 0.90))
        overage_units     = 0
        wrong_price       = round(base_fee * rng.uniform(0.74, 0.88))
        invoice_base      = round(wrong_price * (1 - discount_rate))
        base_fee          = wrong_price    # invoice line uses wrong price
        ov_qty            = 0
        ov_amount         = 0.0
        ov_discount       = 0.0
        ov_note           = "No overage recorded"
        discount_to       = "base_only"
        discount_note     = f"{round(discount_rate * 100)}% discount applied"

    else:
        raise ValueError(f"Unknown error_type: {error_type!r}")

    invoice_total = invoice_base + ov_amount
    retry_removed = rng.randint(10, 80)
    total_rows    = actual_units + retry_removed + rng.randint(0, 50)

    usage = {
        "account_id": account_id,
        "period": BILLING_PERIOD,
        "source": f"usage-oct-{account_id}.csv",
        "total_rows": total_rows,
        "total_units": actual_units,
        "contract_limit": limit,
        "overage_units": overage_units,
        "deduplicated": True,
        "retry_calls_removed": retry_removed,
        "daily_breakdown": _daily_breakdown(actual_units),
    }

    invoice = {
        "id": inv_id,
        "account_id": account_id,
        "contract_id": contract_id,
        "billing_period": BILLING_PERIOD,
        "issued_date": ISSUED_DATE,
        "due_date": DUE_DATE,
        "line_items": [
            {
                "id": "li-001",
                "description": f"{tier_name} - Base Fee",
                "quantity": 1,
                "unit_price": base_fee,
                "discount_rate": discount_rate,
                "amount": invoice_base,
                "type": "base",
                "note": discount_note,
            },
            {
                "id": "li-002",
                "description": "Overage Charges",
                "quantity": ov_qty,
                "unit_price": overage_rate if ov_qty > 0 else 0,
                "discount_rate": ov_discount,
                "amount": ov_amount,
                "type": "overage",
                "note": ov_note,
            },
        ],
        "subtotal": invoice_total,
        "discount_applied": {
            "rate": discount_rate,
            "applied_to": discount_to,
            "note": discount_note,
        },
        "total": invoice_total,
        "currency": "USD",
        "status": "issued",
        "payment_status": "paid",
    }

    return usage, invoice


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    grouped = load_cuad()

    # Select first 10 contracts that yield at least 1 extracted term
    candidates: list[tuple[str, dict]] = []
    for title, rows in grouped.items():
        terms = extract_terms(rows)
        if terms:
            candidates.append((title, terms))
        if len(candidates) == 10:
            break

    print(f"  Selected {len(candidates)} CUAD contracts with extractable terms")

    # Ensure output directories exist
    for d in [ACCOUNTS_DIR, CONTRACTS_DIR, INVOICES_DIR, USAGE_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    generated = 0
    for idx, (cuad_title, terms) in enumerate(candidates):
        tier       = PRICING_TIERS[idx % len(PRICING_TIERS)]
        error_type = BILLING_ERRORS[idx]

        # Build stable IDs from index (avoids slug collisions with special chars in titles)
        account_id  = f"{re.sub(r'[^a-z0-9]', '-', COMPANIES[idx][0].lower())}-{idx:03d}"
        contract_id = f"ctr-cuad-{idx:04d}"

        if account_id in PROTECTED_ACCOUNT_IDS:
            print(f"  [{idx:02d}] SKIPPED — protected ID {account_id}")
            continue

        account  = build_account(idx, account_id, contract_id, tier)
        contract = build_contract(account_id, contract_id, tier, terms, idx)
        usage, invoice = build_usage_and_invoice(account_id, contract_id, contract, error_type, idx)

        (ACCOUNTS_DIR  / f"{account_id}.json").write_text(json.dumps(account,  indent=2))
        (CONTRACTS_DIR / f"{contract_id}.json").write_text(json.dumps(contract, indent=2))
        (USAGE_DIR     / f"usage-oct-{account_id}.json").write_text(json.dumps(usage, indent=2))
        (INVOICES_DIR  / f"{invoice['id']}.json").write_text(json.dumps(invoice, indent=2))

        print(
            f"  [{idx + 1:02d}] {account['name']:<24} "
            f"tier={tier['name']:<16} "
            f"error={error_type}"
        )
        generated += 1

    print(f"\nDone — generated {generated} accounts (acme-ent-90210 preserved unchanged).")
    print("Restart the backend and visit http://localhost:8000/api/accounts to verify.")


if __name__ == "__main__":
    main()
