from datetime import datetime, timezone


def generate_recovery_package(analysis_result: dict) -> dict:
    """Generate a complete recovery package from analysis results."""
    orch = analysis_result.get("agents", {}).get("orchestrator", {})

    email = orch.get("email", {})
    payload = orch.get("billing_payload", {})
    actions = orch.get("recovery_actions", [])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "account_id": analysis_result["account_id"],
        "email": email,
        "billing_payload": payload,
        "recovery_actions": actions,
        "leakage": analysis_result.get("leakage", {}),
    }
