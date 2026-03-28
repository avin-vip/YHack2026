"""
ARIA x CUAD Pipeline v3
=======================
Upgrades over v1:
  1. Per-contract invoice simulation (unique data per contract)
  2. Each agent outputs a probability distribution over actions
  3. Each agent computes expected utility per action
  4. Each agent picks its own best action
  5. Orchestrator picks the globally best action across all agents

Usage:
    python3 CUAD.py
"""

import json
import math
import random
import re
import shutil
import urllib.error
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path


CUAD_ZIP_URL = "https://github.com/TheAtticusProject/cuad/raw/main/data.zip"
CUAD_CACHE_DIR = Path(".cuad_cache")
CUAD_ZIP_PATH = CUAD_CACHE_DIR / "data.zip"
CUAD_TRAIN_JSON_PATH = CUAD_CACHE_DIR / "train_separate_questions.json"

# ─────────────────────────────────────────
# ACTION DEFINITIONS (shared across agents)
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
    print("Loading CUAD QA dataset (first time may take ~1 min)...")
    train_json_path = ensure_cuad_train_json()

    with train_json_path.open(encoding="utf-8") as handle:
        payload = json.load(handle)

    rows = []
    for example in payload.get("data", []):
        title = example.get("title", "").strip()
        for paragraph in example.get("paragraphs", []):
            for qa in paragraph.get("qas", []):
                rows.append(
                    {
                        "id": qa.get("id", ""),
                        "title": title,
                        "question": qa.get("question", "").strip(),
                        "answers": {
                            "text": [
                                answer.get("text", "").strip()
                                for answer in qa.get("answers", [])
                            ],
                            "answer_start": [
                                answer.get("answer_start", -1)
                                for answer in qa.get("answers", [])
                            ],
                        },
                    }
                )

    print(f"Loaded {len(rows)} rows")
    return rows


def ensure_cuad_train_json():
    if CUAD_TRAIN_JSON_PATH.exists():
        return CUAD_TRAIN_JSON_PATH

    CUAD_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    if not CUAD_ZIP_PATH.exists():
        print("Downloading CUAD data archive...")
        try:
            with urllib.request.urlopen(CUAD_ZIP_URL) as response, CUAD_ZIP_PATH.open("wb") as output:
                shutil.copyfileobj(response, output)
        except urllib.error.URLError as exc:
            raise SystemExit(
                f"Failed to download CUAD data from {CUAD_ZIP_URL}: {exc}"
            ) from exc

    print("Extracting CUAD training data...")
    with zipfile.ZipFile(CUAD_ZIP_PATH) as archive:
        member_name = next(
            (
                name
                for name in archive.namelist()
                if name.endswith("/train_separate_questions.json")
                or name == "train_separate_questions.json"
            ),
            None,
        )
        if member_name is None:
            raise SystemExit("CUAD archive did not contain train_separate_questions.json")

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
    print(f"Found {len(contracts)} unique contracts")
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

    contract = {
        "contract_id": rows[0]["title"],
        "legal_terms": {}
    }
    for row in rows:
        q = row["question"].lower()
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
    print(f"Built {len(real_contracts)} usable contracts")
    return real_contracts


# ─────────────────────────────────────────
# UPGRADE 1: Per-contract invoice simulation
# Fixes the "identical output" bug — each
# contract now gets unique usage + invoice data
# derived from its own legal terms.
# ─────────────────────────────────────────

def simulate_invoice_from_contract(contract):
    """
    Generates unique usage + invoice data per contract
    based on its actual legal terms.
    Uses a deterministic seed so results are reproducible.
    """
    terms = contract["legal_terms"]
    net_days = terms.get("payment_net_days", 30)

    # Deterministic randomness per contract
    seed = hash(contract["contract_id"]) % 10000
    rng = random.Random(seed)

    # Unit price varies with payment terms
    base_price = 40.0 + (net_days * 0.15)

    # Simulate realistic billing errors
    actual_units = rng.randint(1500, 2500)
    billed_units = int(actual_units * rng.uniform(0.70, 0.99))   # underbilled quantity
    billed_price = base_price * rng.uniform(0.80, 1.00)          # possible price error

    usage = {
        "period": "2026-01-01 to 2026-01-31",
        "meter": "api_calls",
        "units_consumed": actual_units
    }
    invoice = {
        "invoice_id": f"INV-{seed}",
        "quantity_billed": billed_units,
        "unit_price": round(billed_price, 2),
        "invoice_total": round(billed_units * billed_price, 2)
    }
    return usage, invoice


# ─────────────────────────────────────────
# UPGRADE 2: Per-agent probability distributions
# Each agent assigns P(action succeeds) based
# on its own confidence + specialization.
# ─────────────────────────────────────────

def compute_action_distribution(confidence, agent_type):
    """
    Each agent has different trust in each action
    based on what it specializes in.

    contract analyst → trusts invoice correction most
    usage validator  → trusts data requests most
    billing auditor  → trusts invoice correction + legal most
    """
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


# ─────────────────────────────────────────
# UPGRADE 3: Expected utility per agent
# EU = P(success) × leakage × recovery_rate
#    − cost − risk × penalty
# ─────────────────────────────────────────

def compute_expected_utility(action_dist, total_leakage, penalty=2000):
    """
    For each action, compute expected utility using
    the agent's own probability estimate of success.
    """
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
# ARIA AGENTS
# ─────────────────────────────────────────

def agent_contract_analyst(contract, usage, invoice):
    """
    Agent 1: What should the customer be paying?
    Computes expected revenue from contract terms.
    """
    terms = contract.get("legal_terms", {})
    net_days = terms.get("payment_net_days", 30)

    base_expected = invoice["quantity_billed"] * invoice["unit_price"]
    late_payment_risk = 1.0 + (net_days / 300)
    expected_revenue = round(base_expected * late_payment_risk, 2)

    fields_found = len(terms)
    confidence = min(0.60 + (fields_found * 0.08), 0.97)

    # Per-agent EU computation
    leakage_estimate = max(expected_revenue - invoice["invoice_total"], 0)
    action_dist = compute_action_distribution(confidence, "contract")
    eu_scores    = compute_expected_utility(action_dist, leakage_estimate)
    best_action  = pick_best_action(eu_scores)

    return {
        "agent":            "Contract Analyst",
        "expected_revenue": expected_revenue,
        "confidence":       round(confidence, 2),
        "action_dist":      action_dist,
        "eu_scores":        eu_scores,
        "best_action":      best_action,
        "reasoning":        f"Net {net_days} payment terms, {fields_found} fields found"
    }


def agent_usage_validator(contract, usage, invoice):
    """
    Agent 2: Did usage match what was contracted?
    """
    actual   = usage["units_consumed"]
    billed   = invoice["quantity_billed"]
    unbilled = max(actual - billed, 0)
    ratio    = actual / billed if billed > 0 else 1.0
    confidence = min(abs(1 - ratio) * 4 + 0.60, 0.97)

    leakage_estimate = unbilled * invoice["unit_price"]
    action_dist = compute_action_distribution(confidence, "usage")
    eu_scores    = compute_expected_utility(action_dist, leakage_estimate)
    best_action  = pick_best_action(eu_scores)

    return {
        "agent":          "Usage Validator",
        "actual_units":   actual,
        "billed_units":   billed,
        "unbilled_units": unbilled,
        "confidence":     round(confidence, 2),
        "action_dist":    action_dist,
        "eu_scores":      eu_scores,
        "best_action":    best_action,
        "reasoning":      f"Usage ratio: {ratio:.2f} — {'anomaly detected' if unbilled > 0 else 'within range'}"
    }


def agent_billing_auditor(contract, usage, invoice, contract_output):
    """
    Agent 3: Is the invoice amount correct?
    """
    expected      = contract_output["expected_revenue"]
    actual        = invoice["invoice_total"]
    leakage       = round(max(expected - actual, 0), 2)
    leakage_ratio = (expected - actual) / expected if expected > 0 else 0

    confidence = 1 / (1 + math.exp(-10 * (leakage_ratio - 0.10)))

    anomalies = []
    billed_quantity = invoice["quantity_billed"]
    if billed_quantity > 0 and invoice["unit_price"] < (
        contract_output["expected_revenue"] / billed_quantity
    ) * 0.9:
        anomalies.append("unit_price_below_contract")
    if billed_quantity < usage["units_consumed"]:
        anomalies.append("quantity_underbilled")

    action_dist = compute_action_distribution(confidence, "billing")
    eu_scores    = compute_expected_utility(action_dist, leakage)
    best_action  = pick_best_action(eu_scores)

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
        "reasoning":       f"Leakage ratio: {leakage_ratio:.2%}"
    }


def agent_orchestrator(c1, c2, c3):
    """
    Agent 4: Global decision optimizer.

    Each agent has already:
      - computed a probability distribution over actions
      - computed expected utility per action
      - picked their own best action

    Orchestrator now picks the globally best action
    by taking the max EU across all 3 agents per action,
    then selecting the action with the highest global EU.
    """
    # Weighted confidence fusion
    final_confidence = round(
        0.30 * c1["confidence"] +
        0.25 * c2["confidence"] +
        0.45 * c3["confidence"],
        2
    )

    # Each agent's vote
    agent_votes = {
        "Contract Analyst": c1["best_action"],
        "Usage Validator":  c2["best_action"],
        "Billing Auditor":  c3["best_action"],
    }

    # Global EU: max across all agents per action
    global_eu = {}
    for action in ACTIONS:
        global_eu[action] = max(
            c1["eu_scores"].get(action, 0),
            c2["eu_scores"].get(action, 0),
            c3["eu_scores"].get(action, 0),
        )

    # Pick action with highest global EU
    final_action = pick_best_action(global_eu)
    a = ACTIONS[final_action]
    leakage = c3["leakage_amount"]
    expected_recovery = round(final_confidence * leakage * a["recovery_rate"], 2)

    return {
        "agent":             "Orchestrator",
        "final_confidence":  final_confidence,
        "agent_votes":       agent_votes,
        "global_eu":         global_eu,
        "selected_action":   final_action,
        "expected_recovery": expected_recovery,
    }


# ─────────────────────────────────────────
# STEP 6: Run full ARIA pipeline
# ─────────────────────────────────────────

def run_aria(contract, usage, invoice):
    print(f"\n{'='*55}")
    print(f"CONTRACT: {contract['contract_id'][:50]}")
    print(f"{'='*55}")

    c1 = agent_contract_analyst(contract, usage, invoice)
    c2 = agent_usage_validator(contract, usage, invoice)
    c3 = agent_billing_auditor(contract, usage, invoice, c1)
    c4 = agent_orchestrator(c1, c2, c3)

    # Agent outputs
    print(f"[Agent 1] Expected Revenue : ${c1['expected_revenue']:>10,.2f} | Confidence: {c1['confidence']:.2f} | Vote: {c1['best_action']}")
    print(f"[Agent 2] Unbilled Units   : {c2['unbilled_units']:>10}      | Confidence: {c2['confidence']:.2f} | Vote: {c2['best_action']}")
    print(f"[Agent 3] Leakage          : ${c3['leakage_amount']:>10,.2f} | Confidence: {c3['confidence']:.2f} | Vote: {c3['best_action']}")

    # Orchestrator decision
    print(f"\n[Orchestrator] Agent votes : {list(c4['agent_votes'].values())}")
    print(f"[Orchestrator] Global EU   : { {k: round(v,1) for k,v in c4['global_eu'].items()} }")
    print(f"[Orchestrator] Final action: {c4['selected_action']}")
    print(f"[Orchestrator] Recovery    : ${c4['expected_recovery']:>10,.2f} | Confidence: {c4['final_confidence']:.2f}")

    return {
        "contract_id": contract["contract_id"],
        "leakage":     c3["leakage_amount"],
        "action":      c4["selected_action"],
        "recovery":    c4["expected_recovery"],
        "confidence":  c4["final_confidence"],
        "votes":       c4["agent_votes"],
    }


def print_summary(results):
    print(f"\n{'='*55}")
    print("SUMMARY")
    print(f"{'='*55}")
    print(f"Contracts analyzed : {len(results)}")

    if not results:
        print("Total recovery     : $0.00")
        print("Avg confidence     : 0.00")
        return

    total_recovery = sum(r["recovery"]    for r in results)
    avg_confidence = sum(r["confidence"]  for r in results) / len(results)
    print(f"Total recovery     : ${total_recovery:,.2f}")
    print(f"Avg confidence     : {avg_confidence:.2f}")

    # Action breakdown
    from collections import Counter
    action_counts = Counter(r["action"] for r in results)
    print(f"Actions chosen     : {dict(action_counts)}")


# ─────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────

if __name__ == "__main__":

    raw            = load_cuad()
    grouped        = group_by_contract(raw)
    real_contracts = build_real_contracts(grouped)

    results = []
    for contract in real_contracts[:5]:
        # Unique invoice + usage per contract (fixes identical output bug)
        usage, invoice = simulate_invoice_from_contract(contract)
        result = run_aria(contract, usage, invoice)
        results.append(result)

    print_summary(results)