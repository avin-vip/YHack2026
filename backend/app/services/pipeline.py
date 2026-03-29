import json
import os
from datetime import datetime, timezone
from typing import Awaitable, Callable
import inspect
from pathlib import Path

from app.agents.llm import LLMClient
from app.agents.contract import ContractAnalyst
from app.agents.usage import UsageValidator
from app.agents.billing import BillingAuditor
from app.agents.orchestrator import Orchestrator
from app.services.run_logger import RunLogger
from app.services.recovery import generate_recovery_package

DATA_DIR = Path(__file__).parent.parent.parent / "data"
ProgressCallback = Callable[[dict], Awaitable[None] | None]

_AGENT_DISPLAY_NAMES = {
    "contract": "Contract Analyst",
    "usage": "Usage Validator",
    "billing": "Billing Auditor",
    "orch": "Orchestrator",
}


def load_json(subdir: str, filename: str) -> dict:
    path = DATA_DIR / subdir / filename
    with open(path) as f:
        return json.load(f)


def load_account_data(account_id: str) -> dict:
    """Load all data files for an account."""
    account = load_json("accounts", f"{account_id}.json")
    contract_id = account["contract_id"]
    contract = load_json("contracts", f"{contract_id}.json")

    # Find invoice and usage files for this account
    invoices_dir = DATA_DIR / "invoices"
    usage_dir = DATA_DIR / "usage"

    invoice = None
    for f in invoices_dir.glob("*.json"):
        data = json.loads(f.read_text())
        if data.get("account_id") == account_id:
            invoice = data
            break

    usage = None
    for f in usage_dir.glob("*.json"):
        data = json.loads(f.read_text())
        if data.get("account_id") == account_id:
            usage = data
            break

    return {
        "account": account,
        "contract": contract,
        "invoice": invoice,
        "usage": usage,
    }


def _make_error_result(role: str, description: str, error: str) -> dict:
    """Create a standardized error result for a failed agent."""
    return {
        "role": role,
        "input_description": description,
        "output": {},
        "confidence": 0.0,
        "evidence": [],
        "reasoning": [],
        "error": error,
        "logs": [],
        "impact": 0,
    }


def _parse_dollar_amount(value: str) -> int:
    """Parse a dollar string like '$21,250' into an integer."""
    try:
        return int(str(value).replace("$", "").replace(",", "").strip())
    except (ValueError, TypeError):
        return 0


def _get_llm(agent_name: str, providers: dict | None = None, run_logger: RunLogger | None = None) -> LLMClient:
    """Get LLM client for a specific agent, allowing per-agent provider override."""
    providers = providers or {}
    provider = providers.get(agent_name) or os.getenv("LLM_PROVIDER", "gemini")
    display_name = _AGENT_DISPLAY_NAMES.get(agent_name, agent_name)
    return LLMClient(provider=provider, run_logger=run_logger, agent_name=display_name)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _emit_progress(
    progress_cb: ProgressCallback | None,
    account_id: str,
    stage: str,
    status: str,
    **extra: dict,
) -> None:
    if not progress_cb:
        return
    payload = {
        "account_id": account_id,
        "stage": stage,
        "status": status,
        "timestamp": _utc_now_iso(),
        **extra,
    }
    maybe_awaitable = progress_cb(payload)
    if inspect.isawaitable(maybe_awaitable):
        await maybe_awaitable


async def run_analysis(
    account_id: str,
    providers: dict | None = None,
    progress_cb: ProgressCallback | None = None,
) -> dict:
    """Run the full 4-agent analysis pipeline for an account."""
    run_logger = RunLogger(account_id=account_id)

    account_data = load_account_data(account_id)
    contract = account_data["contract"]

    # Step 1: Contract Analyst
    await _emit_progress(progress_cb, account_id, "contract", "started")
    try:
        contract_llm = _get_llm("contract", providers, run_logger)
        contract_agent = ContractAnalyst(contract_llm)
        contract_result = await contract_agent.run({
            "contract": contract,
            "input_description": f"{contract['id']} · {contract['total_pages']}-page PDF agreement",
        })
        contract_result["impact"] = contract.get("base_fee_monthly", 0)
        contract_result["model"] = contract_llm.model_name
        await _emit_progress(
            progress_cb,
            account_id,
            "contract",
            "completed",
            model=contract_llm.model_name,
        )
    except Exception as e:
        contract_result = _make_error_result(
            "Contract Analyst",
            f"{contract['id']} · {contract['total_pages']}-page PDF agreement",
            str(e),
        )
        await _emit_progress(progress_cb, account_id, "contract", "failed", error=str(e))

    # Step 2: Usage Validator + Billing Auditor (conceptually parallel)
    await _emit_progress(progress_cb, account_id, "usage", "started")
    try:
        usage_llm = _get_llm("usage", providers, run_logger)
        usage_agent = UsageValidator(usage_llm)
        usage_result = await usage_agent.run({
            "usage": account_data["usage"],
            "contract": contract,
            "input_description": f"{account_data['usage']['source']} · {account_data['usage']['total_rows']} rows · API logs",
        })
        overage_units = account_data["usage"].get("overage_units", 0)
        overage_rate = contract.get("overage_rate_per_unit", 0)
        unit_multiplier = contract.get("unit_multiplier", 1)
        usage_result["impact"] = overage_units * overage_rate * unit_multiplier
        usage_result["model"] = usage_llm.model_name
        await _emit_progress(
            progress_cb,
            account_id,
            "usage",
            "completed",
            model=usage_llm.model_name,
        )
    except Exception as e:
        usage_result = _make_error_result(
            "Usage Validator",
            f"{account_data['usage']['source']} · {account_data['usage']['total_rows']} rows · API logs",
            str(e),
        )
        await _emit_progress(progress_cb, account_id, "usage", "failed", error=str(e))

    await _emit_progress(progress_cb, account_id, "billing", "started")
    try:
        billing_llm = _get_llm("billing", providers, run_logger)
        billing_agent = BillingAuditor(billing_llm)
        billing_result = await billing_agent.run({
            "invoice": account_data["invoice"],
            "contract": contract,
            "input_description": f"{account_data['invoice']['id']} · ${account_data['invoice']['total']:,} issued",
        })
        billing_result["impact"] = account_data["invoice"].get("total", 0)
        billing_result["model"] = billing_llm.model_name
        await _emit_progress(
            progress_cb,
            account_id,
            "billing",
            "completed",
            model=billing_llm.model_name,
        )
    except Exception as e:
        billing_result = _make_error_result(
            "Billing Auditor",
            f"{account_data['invoice']['id']} · ${account_data['invoice']['total']:,} issued",
            str(e),
        )
        await _emit_progress(progress_cb, account_id, "billing", "failed", error=str(e))

    # Step 3: Orchestrator
    await _emit_progress(progress_cb, account_id, "orch", "started")
    try:
        orch_llm = _get_llm("orch", providers, run_logger)
        orch_agent = Orchestrator(orch_llm)
        orch_result = await orch_agent.run({
            "contract_result": contract_result,
            "usage_result": usage_result,
            "billing_result": billing_result,
            "account": account_data["account"],
            "input_description": "All 3 agent outputs · shared context",
        })
        net_leakage_str = orch_result.get("output", {}).get("net_leakage", "0")
        orch_result["impact"] = _parse_dollar_amount(net_leakage_str)
        orch_result["model"] = orch_llm.model_name
        await _emit_progress(
            progress_cb,
            account_id,
            "orch",
            "completed",
            model=orch_llm.model_name,
        )
    except Exception as e:
        orch_result = _make_error_result(
            "Orchestrator",
            "All 3 agent outputs · shared context",
            str(e),
        )
        await _emit_progress(progress_cb, account_id, "orch", "failed", error=str(e))

    log_path = run_logger.save()

    # Build final response
    result = {
        "account_id": account_id,
        "run_id": run_logger.run_id,
        "log_file": str(log_path),
        "agents": {
            "contract": contract_result,
            "usage": usage_result,
            "billing": billing_result,
            "orchestrator": orch_result,
        },
        "leakage": orch_result.get("output", {}),
        "recovery_actions": orch_result.get("recovery_actions", []),
        "email": orch_result.get("email", {}),
        "billing_payload": orch_result.get("billing_payload", {}),
        "audit_trail": _build_audit_trail(contract_result, usage_result, billing_result, orch_result),
    }
    result["recovery_package"] = generate_recovery_package(result)
    await _emit_progress(progress_cb, account_id, "analysis", "completed")
    return result


def _build_audit_trail(contract: dict, usage: dict, billing: dict, orch: dict) -> list[dict]:
    """Combine all agent logs into a unified audit trail."""
    trail = []
    for agent_name, result in [("contract", contract), ("usage", usage), ("billing", billing), ("orchestrator", orch)]:
        for log in result.get("logs", []):
            trail.append({
                "timestamp": log["ts"],
                "agent": agent_name,
                "action": log["msg"],
                "level": log.get("level", "dim"),
                "confidence": result.get("confidence"),
            })
    return trail
