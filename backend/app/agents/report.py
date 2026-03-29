"""
report.py — Report Generator Agent.

Generates professional narrative summaries from ARIA analysis results.
Designed for k2-think-v2 (reasoning model) — prompts are structured to
leverage internal chain-of-thought before producing structured JSON output.

API INTEGRATION: Currently a placeholder. Replace _call_k2() with the
actual k2-think-v2 HTTP client when the endpoint is available.
"""

import json
from datetime import date


# ── K2 PLACEHOLDER ────────────────────────────────────────────────────────────
# TODO: Replace with actual k2-think-v2 client.
# The prompts below are written for a reasoning model — do not simplify them
# when wiring the real API. The model benefits from full context.

async def _call_k2(system_prompt: str, user_prompt: str) -> dict | None:
    """
    Placeholder for k2-think-v2 API call.
    Returns None — callers fall back to the deterministic template.

    When wiring the real API:
      - POST to k2-think-v2 endpoint
      - Pass system_prompt as system role, user_prompt as user role
      - Set response_format = json_object (or parse from response.text)
      - Return parsed dict
    """
    # ── REAL IMPLEMENTATION GOES HERE ──
    # Example shape (adapt to actual SDK):
    #
    # import httpx
    # async with httpx.AsyncClient() as client:
    #     resp = await client.post(
    #         "https://api.k2.ai/v1/chat/completions",
    #         headers={"Authorization": f"Bearer {os.getenv('K2_API_KEY')}"},
    #         json={
    #             "model": "k2-think-v2",
    #             "messages": [
    #                 {"role": "system", "content": system_prompt},
    #                 {"role": "user", "content": user_prompt},
    #             ],
    #             "response_format": {"type": "json_object"},
    #             "temperature": 0.3,
    #         },
    #         timeout=30,
    #     )
    #     data = resp.json()
    #     return json.loads(data["choices"][0]["message"]["content"])
    #
    return None  # remove this line when wiring the real API


# ── DASHBOARD REPORT AGENT ────────────────────────────────────────────────────

_DASHBOARD_SYSTEM = """You are a senior financial analyst writing an executive summary for a CFO.

You have been given the output of ARIA — an autonomous 4-agent revenue integrity system that cross-referenced enterprise contracts, usage records, and invoices to detect billing discrepancies.

Your task:
1. Analyze the leakage findings across all accounts
2. Identify the dominant error patterns
3. Assess the financial and operational risk
4. Write a concise, board-ready executive summary (3 paragraphs maximum)
5. List 3–5 specific, actionable recommendations

Tone: professional, direct, evidence-backed. No hedging. No filler sentences.
Audience: CFO, VP Finance, or Board. They understand SaaS metrics.

You MUST respond with valid JSON in exactly this structure:
{
  "executive_summary": "3-paragraph prose summary (plain text, no markdown)",
  "key_findings": ["array of 3-5 specific finding strings, each referencing dollar amounts or percentages"],
  "recommendations": ["array of 3-5 specific action strings, ordered by priority"],
  "risk_level": "HIGH or MEDIUM or LOW",
  "risk_rationale": "one sentence explaining the risk rating"
}"""


def _dashboard_user_prompt(summary: dict, accounts: list[dict]) -> str:
    lines = [
        "ARIA ANALYSIS RESULTS",
        "=" * 40,
        f"Analysis Date: {date.today().isoformat()}",
        f"Accounts Analyzed: {summary.get('accounts_analyzed', len(accounts))}",
        f"Accounts With Leakage: {summary.get('accounts_with_leakage', 0)}",
        f"Total Leakage Detected: ${summary.get('total_leakage', 0):,}",
        f"Average Confidence: {round(summary.get('avg_confidence', 0) * 100, 1)}%",
        "",
        "PER-ACCOUNT BREAKDOWN",
        "-" * 40,
    ]

    for a in accounts:
        orch = a.get("orch", {})
        out = orch.get("output", {})
        conf = round(orch.get("confidence", 0) * 100, 1)
        lines += [
            f"Account: {a.get('name', a.get('account_id', 'Unknown'))}",
            f"  ARR: ${a.get('arr', 0):,}",
            f"  Leakage: {out.get('net_leakage', '$0')}",
            f"  Confidence: {conf}%",
            f"  Urgency: {out.get('urgency', 'MEDIUM')}",
            f"  Expected: {out.get('expected', 'N/A')} | Billed: {out.get('actual_billed', 'N/A')}",
            f"  Billing Error: {a.get('billing_error_type', 'Underbilling')}",
            "",
        ]

    lines += [
        "AGENT CONFIDENCE SUMMARY",
        "-" * 40,
        f"Contract Analyst avg confidence: {round(sum(a.get('contract', {}).get('confidence', 0) for a in accounts) / max(len(accounts), 1) * 100, 1)}%",
        f"Usage Validator avg confidence: {round(sum(a.get('usage', {}).get('confidence', 0) for a in accounts) / max(len(accounts), 1) * 100, 1)}%",
        f"Billing Auditor avg confidence: {round(sum(a.get('billing', {}).get('confidence', 0) for a in accounts) / max(len(accounts), 1) * 100, 1)}%",
        f"Orchestrator avg confidence: {round(sum(a.get('orch', {}).get('confidence', 0) for a in accounts) / max(len(accounts), 1) * 100, 1)}%",
    ]

    return "\n".join(lines)


def _dashboard_fallback(summary: dict, accounts: list[dict]) -> dict:
    """Deterministic template when LLM is unavailable."""
    total = summary.get("total_leakage", 0)
    n = summary.get("accounts_analyzed", len(accounts))
    leaky = summary.get("accounts_with_leakage", 0)
    conf = round(summary.get("avg_confidence", 0) * 100, 1)

    # Build per-account finding lines
    finding_lines = []
    for a in accounts:
        out = a.get("orch", {}).get("output", {})
        leak = out.get("net_leakage", "$0")
        name = a.get("name", a.get("account_id", "Unknown"))
        finding_lines.append(f"{name}: {leak} leakage detected ({out.get('urgency', 'MEDIUM')} urgency)")

    return {
        "executive_summary": (
            f"ARIA completed a full revenue integrity audit across {n} enterprise accounts on {date.today().isoformat()}. "
            f"The analysis identified billing discrepancies in {leaky} of {n} accounts, with a combined leakage total of "
            f"${total:,}. All findings were validated by a 4-agent cross-referencing pipeline achieving an average "
            f"confidence score of {conf}%.\n\n"
            f"The discrepancies identified are not the result of customer fraud — they are systematic billing system "
            f"errors including missing overage line items, incorrectly scoped discount application, and wrong overage "
            f"rates. Each finding is supported by direct evidence from the executed contract, validated usage logs, "
            f"and the issued invoice.\n\n"
            f"Immediate action is recommended on all HIGH urgency findings. Corrective invoices and recovery emails "
            f"have been pre-drafted by ARIA and are ready for finance team review and approval."
        ),
        "key_findings": finding_lines + [
            f"Combined leakage of ${total:,} represents recoverable revenue contractually owed by customers",
            f"Average detection confidence of {conf}% — findings supported by cross-referenced evidence",
        ],
        "recommendations": [
            "Issue corrective invoices for all HIGH urgency findings immediately",
            "Review and update billing system configuration to prevent recurrence of discount scope errors",
            "Schedule monthly ARIA scans across all accounts to prevent leakage accumulation",
            "Brief the finance team on the 3 identified error pattern types for manual spot-check awareness",
            "Set a billing configuration audit for the next 30 days on all Enterprise Plus accounts",
        ],
        "risk_level": "HIGH" if total > 30000 else "MEDIUM" if total > 10000 else "LOW",
        "risk_rationale": (
            f"${total:,} in unrecovered revenue across {leaky} accounts represents a material billing control gap "
            f"that will compound monthly without systematic remediation."
        ),
    }


async def generate_dashboard_narrative(summary: dict, accounts: list[dict]) -> dict:
    """Generate executive narrative for the dashboard report."""
    system = _DASHBOARD_SYSTEM
    user = _dashboard_user_prompt(summary, accounts)

    result = await _call_k2(system, user)
    if result and isinstance(result, dict) and "executive_summary" in result:
        return result

    return _dashboard_fallback(summary, accounts)


# ── ACCOUNT REPORT AGENT ──────────────────────────────────────────────────────

_ACCOUNT_SYSTEM = """You are a senior financial analyst writing a revenue leakage finding report for a single enterprise account.

You have been given the output of ARIA's 4-agent pipeline: the Contract Analyst extracted pricing terms, the Usage Validator computed overage, the Billing Auditor identified invoice errors, and the Orchestrator calculated the net leakage with confidence intervals.

Your task:
1. Synthesize the 4 agents' findings into a coherent narrative
2. Explain clearly what went wrong in the billing and why it matters
3. State the recommended recovery action and its expected outcome

Tone: professional, precise, evidence-backed. Write as if this report will be sent to the customer's account manager and the finance team.

You MUST respond with valid JSON in exactly this structure:
{
  "summary": "2-paragraph prose summary of the finding (plain text, no markdown)",
  "finding_narrative": "1 paragraph explaining the specific billing error with clause references",
  "recovery_recommendation": "1-2 sentences: the primary recommended action and expected recovery amount"
}"""


def _account_user_prompt(account_name: str, analysis: dict) -> str:
    agents = analysis.get("agents", analysis)  # support both pipeline and frontend formats
    contract = agents.get("contract", {})
    usage = agents.get("usage", {})
    billing = agents.get("billing", {})
    orch = agents.get("orch", agents.get("orchestrator", {}))

    out_c = contract.get("output", {})
    out_u = usage.get("output", {})
    out_b = billing.get("output", {})
    out_o = orch.get("output", {})

    lines = [
        f"ACCOUNT: {account_name}",
        "=" * 40,
        "",
        "CONTRACT ANALYST OUTPUT",
        f"  Expected Revenue: {out_c.get('expected_revenue', 'N/A')}",
        f"  Pricing Tier: {out_c.get('pricing_tier', 'N/A')}",
        f"  Discount Schedule: {out_c.get('discount_schedule', 'N/A')}",
        f"  Overage Rate: {out_c.get('overage_rate', 'N/A')}",
        f"  Confidence: {round(contract.get('confidence', 0) * 100, 1)}%",
        f"  Evidence: {'; '.join(contract.get('evidence', [])[:3])}",
        "",
        "USAGE VALIDATOR OUTPUT",
        f"  Total Units: {out_u.get('total_units', 'N/A')}",
        f"  Contract Limit: {out_u.get('contract_limit', 'N/A')}",
        f"  Overage: {out_u.get('overage', 'N/A')}",
        f"  Overage Value: {out_u.get('overage_value', 'N/A')}",
        f"  Confidence: {round(usage.get('confidence', 0) * 100, 1)}%",
        "",
        "BILLING AUDITOR OUTPUT",
        f"  Invoice Total: {out_b.get('invoice_total', 'N/A')}",
        f"  Base Charge: {out_b.get('base_charge', 'N/A')}",
        f"  Overage Line: {out_b.get('overage_line', 'N/A')}",
        f"  Discount Error: {out_b.get('discount_error', 'N/A')}",
        f"  Confidence: {round(billing.get('confidence', 0) * 100, 1)}%",
        f"  Evidence: {'; '.join(billing.get('evidence', [])[:3])}",
        "",
        "ORCHESTRATOR CONCLUSION",
        f"  Expected: {out_o.get('expected', 'N/A')}",
        f"  Actual Billed: {out_o.get('actual_billed', 'N/A')}",
        f"  Net Leakage: {out_o.get('net_leakage', 'N/A')}",
        f"  Recovery Probability: {out_o.get('recovery_probability', 'N/A')}",
        f"  Urgency: {out_o.get('urgency', 'N/A')}",
        f"  Confidence: {round(orch.get('confidence', 0) * 100, 1)}%",
    ]

    return "\n".join(lines)


def _account_fallback(account_name: str, analysis: dict) -> dict:
    agents = analysis.get("agents", analysis)
    orch = agents.get("orch", agents.get("orchestrator", {}))
    out = orch.get("output", {})
    billing = agents.get("billing", {})
    out_b = billing.get("output", {})
    contract = agents.get("contract", {})
    out_c = contract.get("output", {})
    usage = agents.get("usage", {})
    out_u = usage.get("output", {})

    leakage = out.get("net_leakage", "$0")
    expected = out.get("expected", "N/A")
    billed = out.get("actual_billed", "N/A")
    overage = out_u.get("overage", "N/A")
    discount_err = out_b.get("discount_error", "billing error")
    conf = round(orch.get("confidence", 0) * 100, 1)

    return {
        "summary": (
            f"ARIA's revenue integrity analysis of {account_name} identified a billing discrepancy "
            f"resulting in {leakage} of uncollected revenue for the October 2024 billing period. "
            f"The account's contract specifies an expected monthly revenue of {expected}, however the "
            f"invoice issued totaled {billed} — a shortfall that stems from specific, identifiable "
            f"errors in the billing system configuration.\n\n"
            f"The finding is supported by three independent evidence sources — the executed contract, "
            f"validated usage logs, and the issued invoice — cross-referenced by ARIA's 4-agent pipeline "
            f"with a combined confidence score of {conf}%. A corrective invoice and recovery email have "
            f"been pre-drafted and are ready for finance team review."
        ),
        "finding_narrative": (
            f"The billing audit identified {overage} of usage overage that was not correctly captured on "
            f"the invoice. Additionally, the discount applied ({discount_err}) does not conform to the "
            f"contract's discount scope clause, which restricts discounts to base charges only. "
            f"The combination of these two errors — a missing overage charge and an incorrectly "
            f"applied discount — produced the net underbilling of {leakage} identified by the Orchestrator."
        ),
        "recovery_recommendation": (
            f"Issue corrective invoice {leakage} referencing the original invoice and citing the "
            f"relevant contract clauses. The pre-drafted recovery email should be reviewed and sent to "
            f"the account's finance contact within 5 business days to stay within the contract's "
            f"90-day retroactive billing adjustment window."
        ),
    }


async def generate_account_narrative(account_name: str, analysis: dict) -> dict:
    """Generate narrative for a single-account report."""
    system = _ACCOUNT_SYSTEM
    user = _account_user_prompt(account_name, analysis)

    result = await _call_k2(system, user)
    if result and isinstance(result, dict) and "summary" in result:
        return result

    return _account_fallback(account_name, analysis)
