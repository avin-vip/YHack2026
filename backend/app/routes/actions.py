from fastapi import APIRouter
from pydantic import BaseModel

from app.utils.audit import log_audit_event

router = APIRouter()


class RecoverRequest(BaseModel):
    account_id: str
    action_name: str
    amount: float
    invoice_id: str | None = None


@router.post("/actions/recover")
async def execute_recovery(request: RecoverRequest):
    """Execute a recovery action (mock — logs the action to audit trail)."""
    log_audit_event(
        account_id=request.account_id,
        agent="orchestrator",
        action="RECOVERY_EXECUTED",
        detail=f"{request.action_name}: ${request.amount:,.2f} via {request.invoice_id or 'N/A'}",
        confidence=None,
    )

    return {
        "status": "executed",
        "account_id": request.account_id,
        "action": request.action_name,
        "amount": request.amount,
        "invoice_id": request.invoice_id,
        "message": f"Recovery action '{request.action_name}' executed successfully.",
    }
