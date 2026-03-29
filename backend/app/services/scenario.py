"""
scenario.py - Persistent synthetic scenario generator for uploaded PDFs.
"""

import hashlib
import json
import random
import re
from datetime import date, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"

_TIERS = [
    {
        "name": "Professional",
        "base_fee": 15000,
        "usage_limit": 2000,
        "overage_rate": 0.12,
        "unit_multiplier": 1,
        "discount_rate": 0.10,
        "total_pages": 18,
        "overage_section": "§3.4",
        "limit_section": "§5.2",
        "discount_section": "§9.1",
    },
    {
        "name": "Enterprise",
        "base_fee": 42000,
        "usage_limit": 5000,
        "overage_rate": 0.08,
        "unit_multiplier": 1000,
        "discount_rate": 0.15,
        "total_pages": 22,
        "overage_section": "§3.4",
        "limit_section": "§5.2",
        "discount_section": "§9.1",
    },
    {
        "name": "Enterprise Plus",
        "base_fee": 85000,
        "usage_limit": 10000,
        "overage_rate": 0.05,
        "unit_multiplier": 1000,
        "discount_rate": 0.25,
        "total_pages": 28,
        "overage_section": "§4.2",
        "limit_section": "§7.1",
        "discount_section": "§12.3",
    },
]

_ERROR_TYPES = ["missing_overage", "wrong_discount_scope", "wrong_rate"]


def _seed_from_filename(filename: str) -> int:
    return int(hashlib.md5(Path(filename).name.encode()).hexdigest()[:8], 16)


def build_account_id(filename: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", Path(filename).stem.lower()).strip("-")[:24]
    seed = _seed_from_filename(filename)
    return f"upload-{slug}-{seed % 10000:04d}"


def _get_tier(seed: int) -> dict:
    tier = dict(_TIERS[seed % len(_TIERS)])
    rng = random.Random(seed)
    variance = 1.0 + rng.uniform(-0.15, 0.15)
    tier["base_fee"] = round(tier["base_fee"] * variance / 100) * 100
    return tier


def _make_contract(account_id: str, contract_id: str, tier: dict, extracted: dict) -> dict:
    base_fee = int(extracted.get("base_fee_monthly") or tier["base_fee"])
    usage_limit = int(extracted.get("usage_limit_monthly") or tier["usage_limit"])
    overage_rate = float(extracted.get("overage_rate_per_unit") or tier["overage_rate"])
    discount_rate = float(extracted.get("discount_rate") or tier["discount_rate"])

    today = date.today()
    eff = (today - timedelta(days=365)).isoformat()
    exp = (today + timedelta(days=365)).isoformat()

    return {
        "id": contract_id,
        "account_id": account_id,
        "effective_date": eff,
        "expiration_date": exp,
        "term_months": 24,
        "pricing_tier": tier["name"],
        "base_fee_monthly": base_fee,
        "usage_limit_monthly": usage_limit,
        "usage_unit": "API calls",
        "overage_rate_per_unit": overage_rate,
        "unit_multiplier": tier["unit_multiplier"],
        "discount": {
            "rate": discount_rate,
            "scope": "base_only",
            "clause": tier["discount_section"],
            "description": f"{int(discount_rate * 100)}% discount applies to base charges only",
        },
        "clauses": {
            "overage": {
                "section": tier["overage_section"],
                "text": (
                    f"Overage rate: ${overage_rate}/unit above monthly limit of "
                    f"{usage_limit:,} units. Overage charges are invoiced at end of billing cycle."
                ),
            },
            "base_limit": {
                "section": tier["limit_section"],
                "text": f"Base usage limit: {usage_limit:,} units per month.",
            },
            "discount_scope": {
                "section": tier["discount_section"],
                "text": "Discounts apply to base charges only, not overage or add-on charges.",
            },
        },
        "total_pages": tier["total_pages"],
        "signed_by": "VP Finance",
        "status": "active",
    }


def _make_usage(account_id: str, contract: dict, seed: int) -> dict:
    rng = random.Random(seed + 1)
    usage_limit = contract["usage_limit_monthly"]

    overage_pct = rng.uniform(0.08, 0.15)
    total_units = int(usage_limit * (1.0 + overage_pct))
    overage_units = total_units - usage_limit

    daily_units = []
    remaining = total_units
    for i in range(30):
        days_left = 31 - i
        avg = remaining // days_left
        jitter = rng.randint(-max(1, int(avg * 0.25)), max(1, int(avg * 0.25)))
        day_val = max(1, avg + jitter)
        daily_units.append(day_val)
        remaining -= day_val
    daily_units.append(max(0, remaining))

    retry_removed = rng.randint(20, 120)

    return {
        "account_id": account_id,
        "period": "2024-10",
        "source": f"usage-oct-{account_id}.csv",
        "total_rows": total_units + retry_removed,
        "total_units": total_units,
        "contract_limit": usage_limit,
        "overage_units": overage_units,
        "deduplicated": True,
        "retry_calls_removed": retry_removed,
        "daily_breakdown": [
            {"date": f"2024-10-{i + 1:02d}", "units": u}
            for i, u in enumerate(daily_units)
        ],
    }


def _make_invoice(account_id: str, contract_id: str, contract: dict, usage: dict, seed: int) -> dict:
    error_type = _ERROR_TYPES[seed % len(_ERROR_TYPES)]

    base_fee = contract["base_fee_monthly"]
    overage_units = usage["overage_units"]
    overage_rate = contract["overage_rate_per_unit"]
    multiplier = contract["unit_multiplier"]
    discount_rate = contract["discount"]["rate"]
    tier_name = contract["pricing_tier"]

    gross_overage = overage_units * overage_rate * multiplier
    discounted_base = round(base_fee * (1.0 - discount_rate))

    if error_type == "missing_overage":
        line_items = [
            {
                "id": "li-001",
                "description": f"{tier_name} - Base Fee",
                "quantity": 1,
                "unit_price": base_fee,
                "discount_rate": discount_rate,
                "amount": discounted_base,
                "type": "base",
                "note": f"{int(discount_rate * 100)}% discount applied",
            },
            {
                "id": "li-002",
                "description": "Overage Charges",
                "quantity": 0,
                "unit_price": 0,
                "discount_rate": 0,
                "amount": 0,
                "type": "overage",
                "note": "No overage recorded",
            },
        ]
        total = discounted_base
        discount_applied = {
            "rate": discount_rate,
            "applied_to": "base_only",
            "note": "Correctly scoped but overage line missing entirely",
        }
    elif error_type == "wrong_discount_scope":
        wrong_overage = round(gross_overage * (1.0 - discount_rate))
        line_items = [
            {
                "id": "li-001",
                "description": f"{tier_name} - Base Fee",
                "quantity": 1,
                "unit_price": base_fee,
                "discount_rate": discount_rate,
                "amount": discounted_base,
                "type": "base",
                "note": f"{int(discount_rate * 100)}% discount applied",
            },
            {
                "id": "li-002",
                "description": "Overage Charges",
                "quantity": overage_units,
                "unit_price": round(overage_rate * multiplier, 4),
                "discount_rate": discount_rate,
                "amount": wrong_overage,
                "type": "overage",
                "note": f"{int(discount_rate * 100)}% discount incorrectly applied to overages",
            },
        ]
        total = discounted_base + wrong_overage
        discount_applied = {
            "rate": discount_rate,
            "applied_to": "all_charges",
            "note": "Discount incorrectly applied to all charges including overage",
        }
    else:
        rng = random.Random(seed + 2)
        rate_factor = rng.uniform(0.70, 0.88)
        wrong_overage = round(gross_overage * rate_factor)
        line_items = [
            {
                "id": "li-001",
                "description": f"{tier_name} - Base Fee",
                "quantity": 1,
                "unit_price": base_fee,
                "discount_rate": discount_rate,
                "amount": discounted_base,
                "type": "base",
                "note": f"{int(discount_rate * 100)}% discount applied",
            },
            {
                "id": "li-002",
                "description": "Overage Charges",
                "quantity": overage_units,
                "unit_price": round(overage_rate * multiplier * rate_factor, 4),
                "discount_rate": 0,
                "amount": wrong_overage,
                "type": "overage",
                "note": "Incorrect overage rate applied",
            },
        ]
        total = discounted_base + wrong_overage
        discount_applied = {
            "rate": discount_rate,
            "applied_to": "base_only",
            "note": "Discount correctly scoped but overage rate is wrong",
        }

    invoice_id = f"inv-upload-{seed % 100000:05x}"
    return {
        "id": invoice_id,
        "account_id": account_id,
        "contract_id": contract_id,
        "billing_period": "2024-10",
        "issued_date": "2024-11-01",
        "due_date": "2024-12-01",
        "line_items": line_items,
        "subtotal": total,
        "discount_applied": discount_applied,
        "total": total,
        "currency": "USD",
        "status": "issued",
        "payment_status": "paid",
    }


def _write_json(subdir: str, filename: str, data: dict) -> None:
    path = DATA_DIR / subdir / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def save_scenario(account: dict, contract: dict, usage: dict, invoice: dict) -> None:
    _write_json("accounts", f"{account['id']}.json", account)
    _write_json("contracts", f"{contract['id']}.json", contract)
    _write_json("usage", f"usage-oct-{account['id']}.json", usage)
    _write_json("invoices", f"{invoice['id']}.json", invoice)


def build_full_scenario(filename: str, extracted: dict) -> dict:
    seed = _seed_from_filename(filename)
    account_id = build_account_id(filename)
    contract_id = f"ctr-upload-{seed % 100000:05x}"
    tier = _get_tier(seed)

    raw_name = extracted.get("party_name") or ""
    if raw_name:
        company_name = raw_name.strip()
    else:
        stem = Path(filename).stem.replace("-", " ").replace("_", " ")
        company_name = stem.title()

    contract = _make_contract(account_id, contract_id, tier, extracted)
    usage = _make_usage(account_id, contract, seed)
    invoice = _make_invoice(account_id, contract_id, contract, usage, seed)

    account = {
        "id": account_id,
        "name": company_name,
        "arr": contract["base_fee_monthly"] * 12,
        "tier": tier["name"],
        "contract_id": contract_id,
        "primary_contact": "finance@client.com",
        "industry": "Uploaded Contract",
        "status": "active",
        "created_at": date.today().isoformat(),
        "region": "UPLOAD",
    }

    save_scenario(account, contract, usage, invoice)
    return account
