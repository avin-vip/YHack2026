"""
CUAD Pipeline Service
=====================
Self-contained service that runs the CUAD math pipeline (no LLM agents)
and returns results in the same JSON shape as pipeline.py's run_analysis().

Math functions inlined from root CUAD.py; K2 Think V2 used for explanations.
Uses httpx instead of requests for the K2 API call.
"""

import asyncio
import json
import math
import random
import re
import shutil
import urllib.error
import urllib.request
import uuid
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx

# ─────────────────────────────────────────
# TIMESTAMPS / LOGGING HELPERS
# ─────────────────────────────────────────

def _ts():
    return datetime.now(timezone.utc).isoformat()

def _log(msg, level="ok"):
    return {"ts": _ts(), "msg": msg, "level": level}


# ─────────────────────────────────────────
# K2 THINK V2 CONFIG
# ─────────────────────────────────────────

K2_API_URL = "https://api.k2think.ai/v1/chat/completions"
K2_API_KEY = "IFM-sprhFoxC0E95jm9n"
K2_MODEL   = "MBZUAI-IFM/K2-Think-v2"


def call_k2(prompt: str, max_tokens: int = 200) -> str:
    """
    Call K2 Think V2 using httpx and return the response text.
    Falls back gracefully if K2 is unavailable —
    the pipeline never crashes due to K2 issues.
    """
    try:
        with httpx.Client(timeout=15) as client:
            response = client.post(
                K2_API_URL,
                headers={
                    "Authorization": f"Bearer {K2_API_KEY}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model":      K2_MODEL,
                    "max_tokens": max_tokens,
                    "stream":     False,
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                },
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"[K2 unavailable: {e}]"


def k2_explain_agent(agent_name: str, contract: dict,
                     usage: dict, invoice: dict, math_output: dict) -> str:
    """
    K2 reads what the math agent found and explains it
    in 1-2 plain English sentences for the audit report.
    """
    prompt = f"""You are {agent_name} in a revenue leakage detection system.

Contract terms:
{json.dumps(contract['legal_terms'], indent=2)}

Usage data:
- Units consumed: {usage['units_consumed']}
- Units billed:   {invoice['quantity_billed']}

Invoice data:
- Unit price:    ${invoice['unit_price']}
- Invoice total: ${invoice['invoice_total']}

Math analysis found:
{json.dumps({k: v for k, v in math_output.items()
             if k not in ['action_dist', 'eu_scores']}, indent=2)}

In exactly 1-2 sentences, explain what billing problem was detected and why it matters.
Be specific about dollar amounts and contract terms. No bullet points."""

    return call_k2(prompt, max_tokens=120)


def k2_explain_decision(contract: dict, c1: dict, c2: dict,
                        c3: dict, c4: dict) -> str:
    """
    K2 explains the orchestrator's final decision
    in plain English for the audit report.
    """
    prompt = f"""You are an AI revenue recovery orchestrator.

Contract: {contract['contract_id'][:60]}
Contract terms: {json.dumps(contract['legal_terms'], indent=2)}

Agent findings:
- Contract Analyst: expected ${c1['expected_revenue']:,.2f}, confidence {c1['confidence']}, voted {c1['best_action']}
- Usage Validator:  {c2['unbilled_units']} unbilled units, confidence {c2['confidence']}, voted {c2['best_action']}
- Billing Auditor:  ${c3['leakage_amount']:,.2f} leakage detected, confidence {c3['confidence']}, voted {c3['best_action']}

Final decision: {c4['selected_action']}
Expected recovery: ${c4['expected_recovery']:,.2f}
Final confidence: {c4['final_confidence']}

In 2-3 sentences, explain why this action was chosen and what outcome is expected.
Be specific. No bullet points."""

    return call_k2(prompt, max_tokens=150)


# ─────────────────────────────────────────
# CUAD PATHS
# ─────────────────────────────────────────

CUAD_ZIP_URL         = "https://github.com/TheAtticusProject/cuad/raw/main/data.zip"
CUAD_CACHE_DIR       = Path(__file__).parents[4] / ".cuad_cache"
CUAD_ZIP_PATH        = CUAD_CACHE_DIR / "data.zip"
CUAD_TRAIN_JSON_PATH = CUAD_CACHE_DIR / "train_separate_questions.json"


# ─────────────────────────────────────────
# ACTION DEFINITIONS
# ─────────────────────────────────────────

ACTIONS = {
    "issue_corrected_invoice": {"recovery_rate": 1.00, "cost": 500,  "risk": 0.05},
    "notify_audit_team":       {"recovery_rate": 0.80, "cost": 200,  "risk": 0.02},
    "request_more_data":       {"recovery_rate": 0.90, "cost": 300,  "risk": 0.01},
    "escalate_to_legal":       {"recovery_rate": 0.95, "cost": 800,  "risk": 0.10},
}


# ─────────────────────────────────────────
# STEP 1: Load CUAD Dataset
# ─────────────────────────────────────────

def load_cuad():
    train_json_path = ensure_cuad_train_json()

    with train_json_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    rows = []
    for example in payload.get("data", []):
        title = example.get("title", "").strip()
        for paragraph in example.get("paragraphs", []):
            for qa in paragraph.get("qas", []):
                rows.append({
                    "id":       qa.get("id", ""),
                    "title":    title,
                    "question": qa.get("question", "").strip(),
                    "answers": {
                        "text": [
                            a.get("text", "").strip()
                            for a in qa.get("answers", [])
                        ],
                        "answer_start": [
                            a.get("answer_start", -1)
                            for a in qa.get("answers", [])
                        ],
                    },
                })

    return rows


def ensure_cuad_train_json():
    if CUAD_TRAIN_JSON_PATH.exists():
        return CUAD_TRAIN_JSON_PATH

    CUAD_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if not CUAD_ZIP_PATH.exists():
        try:
            with urllib.request.urlopen(CUAD_ZIP_URL) as response, \
                 CUAD_ZIP_PATH.open("wb") as output:
                shutil.copyfileobj(response, output)
        except urllib.error.URLError as exc:
            raise RuntimeError(
                f"Failed to download CUAD data from {CUAD_ZIP_URL}: {exc}"
            ) from exc

    with zipfile.ZipFile(CUAD_ZIP_PATH) as archive:
        member_name = next(
            (name for name in archive.namelist()
             if name.endswith("/train_separate_questions.json")
             or name == "train_separate_questions.json"),
            None,
        )
        if member_name is None:
            raise RuntimeError(
                "CUAD archive did not contain train_separate_questions.json")

        extracted_path = Path(archive.extract(member_name, path=CUAD_CACHE_DIR))
        if extracted_path != CUAD_TRAIN_JSON_PATH:
            shutil.copyfile(extracted_path, CUAD_TRAIN_JSON_PATH)

    return CUAD_TRAIN_JSON_PATH


# ─────────────────────────────────────────
# STEP 2: Group rows by contract title
# ─────────────────────────────────────────

def group_by_contract(dataset):
    contracts = defaultdict(list)
    for row in dataset:
        contracts[row["title"]].append(row)
    return contracts


# ─────────────────────────────────────────
# STEP 3: Extract only fields ARIA needs
# ─────────────────────────────────────────

TARGET_FIELDS = {
    "governing law":      "governing_law",
    "termination notice": "termination_notice",
    "payment terms":      "payment_terms",
    "renewal term":       "renewal_term",
}

def extract_contract(rows):
    if not rows:
        return {"contract_id": "unknown_contract", "legal_terms": {}}

    contract = {"contract_id": rows[0]["title"], "legal_terms": {}}
    for row in rows:
        q       = row["question"].lower()
        answers = row["answers"]["text"]
        if not answers:
            continue
        for key, field in TARGET_FIELDS.items():
            if key in q and field not in contract["legal_terms"]:
                contract["legal_terms"][field] = answers[0]
    return contract


# ─────────────────────────────────────────
# STEP 4: Normalize values
# ─────────────────────────────────────────

def parse_days(text):
    match = re.search(r"\d+", text)
    return int(match.group()) if match else None

def parse_net_days(text):
    match = re.search(r"\d+", text)
    return int(match.group()) if match else 30

def normalize_contract(contract):
    terms = contract["legal_terms"]
    if "termination_notice" in terms:
        terms["termination_notice_days"] = parse_days(terms["termination_notice"])
    if "payment_terms" in terms:
        terms["payment_net_days"] = parse_net_days(terms["payment_terms"])
    return contract


# ─────────────────────────────────────────
# STEP 5: Build final dataset
# ─────────────────────────────────────────

def build_real_contracts(grouped):
    real_contracts = []
    for rows in grouped.values():
        contract = extract_contract(rows)
        if len(contract["legal_terms"]) >= 2:
            contract = normalize_contract(contract)
            real_contracts.append(contract)
    return real_contracts


# ─────────────────────────────────────────
# Invoice simulation
# ─────────────────────────────────────────

def simulate_invoice_from_contract(contract):
    terms    = contract["legal_terms"]
    net_days = terms.get("payment_net_days", 30)
    seed     = hash(contract["contract_id"]) % 10000
    rng      = random.Random(seed)

    base_price   = 40.0 + (net_days * 0.15)
    actual_units = rng.randint(1500, 2500)
    billed_units = int(actual_units * rng.uniform(0.70, 0.99))
    billed_price = base_price * rng.uniform(0.80, 1.00)

    usage = {
        "period":         "2026-01-01 to 2026-01-31",
        "meter":          "api_calls",
        "units_consumed": actual_units,
    }
    invoice = {
        "invoice_id":      f"INV-{seed}",
        "quantity_billed": billed_units,
        "unit_price":      round(billed_price, 2),
        "invoice_total":   round(billed_units * billed_price, 2),
    }
    return usage, invoice


# ─────────────────────────────────────────
# Action distributions and expected utility
# ─────────────────────────────────────────

def compute_action_distribution(confidence, agent_type):
    p = confidence
    if agent_type == "contract":
        return {
            "issue_corrected_invoice": p * 0.90,
            "notify_audit_team":       p * 0.70,
            "request_more_data":       p * 0.50,
            "escalate_to_legal":       p * 0.60,
        }
    elif agent_type == "usage":
        return {
            "issue_corrected_invoice": p * 0.70,
            "notify_audit_team":       p * 0.60,
            "request_more_data":       p * 0.95,
            "escalate_to_legal":       p * 0.40,
        }
    elif agent_type == "billing":
        return {
            "issue_corrected_invoice": p * 0.95,
            "notify_audit_team":       p * 0.65,
            "request_more_data":       p * 0.55,
            "escalate_to_legal":       p * 0.75,
        }
    return {a: p * 0.70 for a in ACTIONS}


def compute_expected_utility(action_dist, total_leakage, penalty=2000):
    eu = {}
    for action, p_success in action_dist.items():
        a = ACTIONS[action]
        eu[action] = round(
            p_success * total_leakage * a["recovery_rate"]
            - a["cost"]
            - a["risk"] * penalty,
            2
        )
    return eu


def pick_best_action(eu_scores):
    return max(eu_scores, key=lambda a: eu_scores[a])


# ─────────────────────────────────────────
# ARIA AGENTS — math layer
# ─────────────────────────────────────────

def agent_contract_analyst(contract, usage, invoice):
    terms             = contract.get("legal_terms", {})
    net_days          = terms.get("payment_net_days", 30)
    base_expected     = invoice["quantity_billed"] * invoice["unit_price"]
    late_payment_risk = 1.0 + (net_days / 300)
    expected_revenue  = round(base_expected * late_payment_risk, 2)
    fields_found      = len(terms)
    confidence        = min(0.60 + (fields_found * 0.08), 0.97)
    leakage_estimate  = max(expected_revenue - invoice["invoice_total"], 0)
    action_dist       = compute_action_distribution(confidence, "contract")
    eu_scores         = compute_expected_utility(action_dist, leakage_estimate)
    best_action       = pick_best_action(eu_scores)

    return {
        "agent":            "Contract Analyst",
        "expected_revenue": expected_revenue,
        "confidence":       round(confidence, 2),
        "action_dist":      action_dist,
        "eu_scores":        eu_scores,
        "best_action":      best_action,
        "reasoning":        f"Net {net_days} payment terms, {fields_found} fields found",
    }


def agent_usage_validator(contract, usage, invoice):
    actual     = usage["units_consumed"]
    billed     = invoice["quantity_billed"]
    unbilled   = max(actual - billed, 0)
    ratio      = actual / billed if billed > 0 else 1.0
    confidence = min(abs(1 - ratio) * 4 + 0.60, 0.97)
    leakage_estimate = unbilled * invoice["unit_price"]
    action_dist      = compute_action_distribution(confidence, "usage")
    eu_scores        = compute_expected_utility(action_dist, leakage_estimate)
    best_action      = pick_best_action(eu_scores)

    return {
        "agent":          "Usage Validator",
        "actual_units":   actual,
        "billed_units":   billed,
        "unbilled_units": unbilled,
        "confidence":     round(confidence, 2),
        "action_dist":    action_dist,
        "eu_scores":      eu_scores,
        "best_action":    best_action,
        "reasoning":      f"Usage ratio: {ratio:.2f} — {'anomaly detected' if unbilled > 0 else 'within range'}",
    }


def agent_billing_auditor(contract, usage, invoice, contract_output):
    expected      = contract_output["expected_revenue"]
    actual        = invoice["invoice_total"]
    leakage       = round(max(expected - actual, 0), 2)
    leakage_ratio = (expected - actual) / expected if expected > 0 else 0
    confidence    = 1 / (1 + math.exp(-10 * (leakage_ratio - 0.10)))

    anomalies = []
    billed_quantity = invoice["quantity_billed"]
    if billed_quantity > 0 and invoice["unit_price"] < (
        contract_output["expected_revenue"] / billed_quantity
    ) * 0.9:
        anomalies.append("unit_price_below_contract")
    if billed_quantity < usage["units_consumed"]:
        anomalies.append("quantity_underbilled")

    action_dist = compute_action_distribution(confidence, "billing")
    eu_scores   = compute_expected_utility(action_dist, leakage)
    best_action = pick_best_action(eu_scores)

    return {
        "agent":           "Billing Auditor",
        "expected_amount": expected,
        "billed_amount":   actual,
        "leakage_amount":  leakage,
        "confidence":      round(confidence, 2),
        "anomalies":       anomalies,
        "action_dist":     action_dist,
        "eu_scores":       eu_scores,
        "best_action":     best_action,
        "reasoning":       f"Leakage ratio: {leakage_ratio:.2%}",
    }


def agent_orchestrator(c1, c2, c3):
    final_confidence = round(
        0.30 * c1["confidence"] +
        0.25 * c2["confidence"] +
        0.45 * c3["confidence"],
        2
    )
    agent_votes = {
        "Contract Analyst": c1["best_action"],
        "Usage Validator":  c2["best_action"],
        "Billing Auditor":  c3["best_action"],
    }
    global_eu = {
        action: max(
            c1["eu_scores"].get(action, 0),
            c2["eu_scores"].get(action, 0),
            c3["eu_scores"].get(action, 0),
        )
        for action in ACTIONS
    }
    final_action      = pick_best_action(global_eu)
    a                 = ACTIONS[final_action]
    expected_recovery = round(final_confidence * c3["leakage_amount"] * a["recovery_rate"], 2)

    return {
        "agent":             "Orchestrator",
        "final_confidence":  final_confidence,
        "agent_votes":       agent_votes,
        "global_eu":         global_eu,
        "selected_action":   final_action,
        "expected_recovery": expected_recovery,
    }


# ─────────────────────────────────────────
# MAIN ENTRY POINT
# ─────────────────────────────────────────

async def run_cuad_analysis(contract_index: int = 0) -> dict:
    """
    Run the CUAD math pipeline and return results in the same shape
    as pipeline.py's run_analysis().
    """
    # Load CUAD data (blocking I/O wrapped in thread)
    raw = await asyncio.to_thread(load_cuad)
    grouped = group_by_contract(raw)
    real_contracts = build_real_contracts(grouped)

    if not real_contracts:
        raise RuntimeError("No usable CUAD contracts found")

    idx = contract_index % len(real_contracts)
    contract = real_contracts[idx]
    usage, invoice = simulate_invoice_from_contract(contract)

    # Run math agents
    c1 = agent_contract_analyst(contract, usage, invoice)
    c2 = agent_usage_validator(contract, usage, invoice)
    c3 = agent_billing_auditor(contract, usage, invoice, c1)
    c4 = agent_orchestrator(c1, c2, c3)

    # K2 explanations (blocking HTTP wrapped in thread)
    k2 = await asyncio.to_thread(_run_k2_explanations, contract, usage, invoice, c1, c2, c3, c4)

    run_id = f"cuad-run-{uuid.uuid4().hex[:5].upper()}"

    # ── Build per-agent result dicts in pipeline.py shape ──

    contract_result = {
        "role":              "Contract Analyst",
        "input_description": f"{contract['contract_id'][:60]} · CUAD legal contract",
        "output": {
            "expected_revenue": f"${c1['expected_revenue']:,.2f}",
            "governing_law":    contract["legal_terms"].get("governing_law", "N/A"),
            "payment_terms":    contract["legal_terms"].get("payment_terms", "N/A"),
            "renewal_term":     contract["legal_terms"].get("renewal_term", "N/A"),
            "overage_rate":     f"${invoice['unit_price']:.2f}/unit",
        },
        "confidence": c1["confidence"],
        "evidence": [
            f"Expected revenue: ${c1['expected_revenue']:,.2f}",
            f"Payment net days: {contract['legal_terms'].get('payment_net_days', 30)}",
            f"Fields extracted: {len(contract['legal_terms'])}",
        ],
        "reasoning": [
            c1["reasoning"],
            k2.get("contract_analyst", ""),
        ],
        "logs": [
            _log("Contract Analyst initializing"),
            _log(f"Extracted {len(contract['legal_terms'])} legal fields"),
            _log(f"Expected revenue computed: ${c1['expected_revenue']:,.2f}"),
            _log(f"Best action: {c1['best_action']}"),
        ],
        "impact": int(c1["expected_revenue"]),
        "model":  "K2-Think-v2 + math",
    }

    usage_result = {
        "role":              "Usage Validator",
        "input_description": f"Simulated meter data · 2026-01-01 to 2026-01-31 · API calls",
        "output": {
            "total_units":     f"{c2['actual_units']:,}",
            "contract_limit":  f"{c2['billed_units']:,}",
            "overage":         f"{c2['unbilled_units']} units",
            "unbilled_units":  c2["unbilled_units"],
        },
        "confidence": c2["confidence"],
        "evidence": [
            f"Actual units consumed: {c2['actual_units']:,}",
            f"Units billed: {c2['billed_units']:,}",
            f"Unbilled units: {c2['unbilled_units']:,}",
        ],
        "reasoning": [
            c2["reasoning"],
            k2.get("usage_validator", ""),
        ],
        "logs": [
            _log("Usage Validator initializing"),
            _log(f"Consumption: {c2['actual_units']:,} units"),
            _log(f"Billed quantity: {c2['billed_units']:,} units"),
            _log(f"Unbilled gap: {c2['unbilled_units']:,} units", "warn" if c2["unbilled_units"] > 0 else "ok"),
        ],
        "impact": int(c2["unbilled_units"] * invoice["unit_price"]),
        "model":  "K2-Think-v2 + math",
    }

    billing_result = {
        "role":              "Billing Auditor",
        "input_description": f"{invoice['invoice_id']} · ${invoice['invoice_total']:,.2f} issued",
        "output": {
            "invoice_total":  f"${c3['billed_amount']:,.2f}",
            "overage_line":   f"${max(c3['expected_amount'] - c3['billed_amount'], 0):,.2f}",
            "discount_error": "quantity underbilled" if "quantity_underbilled" in c3["anomalies"] else "none",
            "anomalies":      c3["anomalies"],
        },
        "confidence": c3["confidence"],
        "evidence": [
            f"Expected: ${c3['expected_amount']:,.2f}",
            f"Billed: ${c3['billed_amount']:,.2f}",
            f"Leakage: ${c3['leakage_amount']:,.2f}",
        ],
        "reasoning": [
            c3["reasoning"],
            k2.get("billing_auditor", ""),
        ],
        "logs": [
            _log("Billing Auditor initializing"),
            _log(f"Invoice total: ${c3['billed_amount']:,.2f}"),
            _log(f"Anomalies: {c3['anomalies']}", "warn" if c3["anomalies"] else "ok"),
            _log(f"Leakage detected: ${c3['leakage_amount']:,.2f}", "hot" if c3["leakage_amount"] > 0 else "ok"),
        ],
        "impact": int(c3["billed_amount"]),
        "model":  "K2-Think-v2 + math",
    }

    # Build recovery_actions from global_eu
    max_eu = max(c4["global_eu"].values()) if c4["global_eu"] else 1
    if max_eu == 0:
        max_eu = 1
    recovery_actions = [
        {
            "rank": i + 1,
            "name": action,
            "score": round(eu_val / max_eu, 3),
            "amount": round(c4["expected_recovery"] * ACTIONS[action]["recovery_rate"], 2),
            "description": f"EU: {eu_val:,.2f} | risk: {ACTIONS[action]['risk']}",
            "basis": f"Agent votes: {list(c4['agent_votes'].values())}",
        }
        for i, (action, eu_val) in enumerate(c4["global_eu"].items())
    ]
    recovery_actions.sort(key=lambda x: x["score"], reverse=True)
    for i, a in enumerate(recovery_actions):
        a["rank"] = i + 1

    net_leakage = c3["leakage_amount"]
    recovery_pct = int(c4["final_confidence"] * 100)

    email = {
        "to":      "finance-ops@company.com",
        "subject": f"[ARIA] Revenue Leakage Detected — ${net_leakage:,.2f} — {contract['contract_id'][:40]}",
        "body":    (
            f"ARIA has detected ${net_leakage:,.2f} in revenue leakage "
            f"for contract {contract['contract_id'][:60]}.\n\n"
            f"Recommended action: {c4['selected_action'].replace('_', ' ').title()}\n"
            f"Expected recovery: ${c4['expected_recovery']:,.2f}\n"
            f"Confidence: {c4['final_confidence']:.0%}\n\n"
            f"K2 Analysis: {k2.get('decision', 'N/A')}"
        ),
    }

    billing_payload = {
        "invoice_id":        invoice["invoice_id"],
        "original_amount":   invoice["invoice_total"],
        "corrected_amount":  round(invoice["invoice_total"] + net_leakage, 2),
        "delta":             net_leakage,
        "line_items": [
            {
                "description": "Unbilled usage units",
                "quantity":    c2["unbilled_units"],
                "unit_price":  invoice["unit_price"],
                "total":       round(c2["unbilled_units"] * invoice["unit_price"], 2),
            }
        ],
        "action": c4["selected_action"],
    }

    orch_result = {
        "role":              "Orchestrator",
        "input_description": "All 3 agent outputs · CUAD math pipeline",
        "output": {
            "net_leakage":          f"${net_leakage:,.2f}",
            "recovery_probability": f"{recovery_pct}%",
            "urgency":              "HIGH" if c4["final_confidence"] > 0.75 else "MEDIUM",
            "recommended_action":   c4["selected_action"].replace("_", " ").title(),
        },
        "confidence": c4["final_confidence"],
        "evidence": [
            f"Contract vote: {c4['agent_votes']['Contract Analyst']}",
            f"Usage vote: {c4['agent_votes']['Usage Validator']}",
            f"Billing vote: {c4['agent_votes']['Billing Auditor']}",
            f"Expected recovery: ${c4['expected_recovery']:,.2f}",
        ],
        "reasoning": [
            f"Weighted confidence: {c4['final_confidence']:.2f}",
            f"Selected action: {c4['selected_action']}",
            k2.get("decision", ""),
        ],
        "logs": [
            _log("Orchestrator initializing"),
            _log(f"Agent votes: {list(c4['agent_votes'].values())}"),
            _log(f"Global EU computed for {len(c4['global_eu'])} actions"),
            _log(f"Final action: {c4['selected_action']}", "hot"),
            _log(f"Expected recovery: ${c4['expected_recovery']:,.2f}", "acid"),
        ],
        "impact":           int(net_leakage),
        "model":            "K2-Think-v2 + math",
        "recovery_actions": recovery_actions,
        "email":            email,
        "billing_payload":  billing_payload,
    }

    leakage = {
        "net_leakage":          f"${net_leakage:,.2f}",
        "recovery_probability": f"{recovery_pct}%",
        "urgency":              "HIGH" if c4["final_confidence"] > 0.75 else "MEDIUM",
        "recommended_action":   c4["selected_action"].replace("_", " ").title(),
    }

    audit_trail = []
    for agent_key, result in [
        ("contract", contract_result),
        ("usage", usage_result),
        ("billing", billing_result),
        ("orchestrator", orch_result),
    ]:
        for log_entry in result.get("logs", []):
            audit_trail.append({
                "timestamp":  log_entry["ts"],
                "agent":      agent_key,
                "action":     log_entry["msg"],
                "level":      log_entry.get("level", "ok"),
                "confidence": result.get("confidence"),
            })

    return {
        "account_id": f"cuad-{idx}",
        "run_id":     run_id,
        "log_file":   None,
        "agents": {
            "contract":     contract_result,
            "usage":        usage_result,
            "billing":      billing_result,
            "orchestrator": orch_result,
        },
        "leakage":          leakage,
        "recovery_actions": recovery_actions,
        "email":            email,
        "billing_payload":  billing_payload,
        "audit_trail":      audit_trail,
    }


def _run_k2_explanations(contract, usage, invoice, c1, c2, c3, c4):
    """Run all K2 explanation calls synchronously (called via asyncio.to_thread)."""
    return {
        "contract_analyst": k2_explain_agent("Contract Analyst", contract, usage, invoice, c1),
        "usage_validator":  k2_explain_agent("Usage Validator",  contract, usage, invoice, c2),
        "billing_auditor":  k2_explain_agent("Billing Auditor",  contract, usage, invoice, c3),
        "decision":         k2_explain_decision(contract, c1, c2, c3, c4),
    }
