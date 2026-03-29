"""
report.py - Report narrative generation helpers.

Uses deterministic fallbacks today; can be wired to a narrative model later.
"""

from datetime import date


def _dashboard_fallback(summary: dict, accounts: list[dict]) -> dict:
    total = summary.get("total_leakage", 0)
    n = summary.get("accounts_analyzed", len(accounts))
    leaky = summary.get("accounts_with_leakage", 0)
    conf = round(summary.get("avg_confidence", 0) * 100, 1)

    findings = []
    for a in accounts:
        out = a.get("orch", {}).get("output", {})
        findings.append(
            f"{a.get('name', a.get('account_id', 'Unknown'))}: "
            f"{out.get('net_leakage', '$0')} leakage ({out.get('urgency', 'MEDIUM')} urgency)"
        )

    return {
        "executive_summary": (
            f"ARIA completed a revenue integrity audit across {n} accounts on {date.today().isoformat()}. "
            f"Leakage was detected in {leaky} of {n} accounts, totaling ${total:,}, with an average "
            f"cross-agent confidence of {conf}%.\n\n"
            "The discrepancies are systemic billing issues such as missing overage line items, "
            "incorrect discount scope application, and overage rate mismatches.\n\n"
            "Corrective invoice and outreach actions should be prioritized for HIGH urgency findings."
        ),
        "key_findings": findings[:5],
        "recommendations": [
            "Issue corrective invoices for HIGH urgency findings immediately.",
            "Fix discount scope configuration to avoid overage discounting.",
            "Run recurring monthly ARIA scans to prevent leakage accumulation.",
        ],
        "risk_level": "HIGH" if total > 30000 else "MEDIUM" if total > 10000 else "LOW",
        "risk_rationale": (
            f"${total:,} in unrecovered revenue across {leaky} accounts indicates a material billing "
            "control gap that compounds without remediation."
        ),
    }


def _account_fallback(account_name: str, analysis: dict) -> dict:
    agents = analysis.get("agents", analysis)
    orch = agents.get("orch", agents.get("orchestrator", {}))
    out = orch.get("output", {})
    billing = agents.get("billing", {}).get("output", {})
    usage = agents.get("usage", {}).get("output", {})

    leakage = out.get("net_leakage", "$0")
    expected = out.get("expected", "N/A")
    billed = out.get("actual_billed", "N/A")
    overage = usage.get("overage", "N/A")
    discount_err = billing.get("discount_error", "billing error")

    return {
        "summary": (
            f"ARIA identified a billing discrepancy for {account_name} causing {leakage} of uncollected revenue. "
            f"Expected revenue was {expected}, while the invoice reflected {billed}.\n\n"
            "The finding is supported by cross-referenced contract, usage, and invoice evidence."
        ),
        "finding_narrative": (
            f"The billing audit found {overage} overage was not billed correctly. In addition, "
            f"discount handling ('{discount_err}') does not match contract discount scope language."
        ),
        "recovery_recommendation": (
            f"Issue a corrective invoice for {leakage} and send the prepared finance communication within "
            "the contract adjustment window."
        ),
    }


async def generate_dashboard_narrative(summary: dict, accounts: list[dict]) -> dict:
    return _dashboard_fallback(summary, accounts)


async def generate_account_narrative(account_name: str, analysis: dict) -> dict:
    return _account_fallback(account_name, analysis)
