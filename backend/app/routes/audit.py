from fastapi import APIRouter

from app.utils.audit import get_audit_trail

router = APIRouter()


@router.get("/audit/{account_id}")
def get_audit(account_id: str):
    """Get the audit trail for an account."""
    trail = get_audit_trail(account_id)
    return {"account_id": account_id, "events": trail}
