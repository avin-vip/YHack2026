import json
from pathlib import Path

from app.agents.llm import LLMClient
from app.agents.contract import ContractAnalyst
from app.agents.usage import UsageValidator
from app.agents.billing import BillingAuditor
from app.agents.orchestrator import Orchestrator

DATA_DIR = Path(__file__).parent.parent.parent / "data"


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


async def run_analysis(account_id: str) -> dict:
    """Run the full 4-agent analysis pipeline for an account."""
    account_data = load_account_data(account_id)
    llm = LLMClient()

    # Step 1: Contract Analyst
    contract_agent = ContractAnalyst(llm)
    contract_result = await contract_agent.run({
        "contract": account_data["contract"],
        "input_description": f"{account_data['contract']['id']} · {account_data['contract']['total_pages']}-page PDF agreement",
    })

    # Step 2: Usage Validator + Billing Auditor (conceptually parallel)
    usage_agent = UsageValidator(llm)
    usage_result = await usage_agent.run({
        "usage": account_data["usage"],
        "contract": account_data["contract"],
        "input_description": f"{account_data['usage']['source']} · {account_data['usage']['total_rows']} rows · API logs",
    })

    billing_agent = BillingAuditor(llm)
    billing_result = await billing_agent.run({
        "invoice": account_data["invoice"],
        "contract": account_data["contract"],
        "input_description": f"{account_data['invoice']['id']} · ${account_data['invoice']['total']:,} issued",
    })

    # Step 3: Orchestrator
    orch_agent = Orchestrator(llm)
    orch_result = await orch_agent.run({
        "contract_result": contract_result,
        "usage_result": usage_result,
        "billing_result": billing_result,
        "account": account_data["account"],
        "input_description": "All 3 agent outputs · shared context",
    })

    # Build final response
    return {
        "account_id": account_id,
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
