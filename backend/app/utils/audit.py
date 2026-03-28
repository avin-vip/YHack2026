import json
from datetime import datetime, timezone
from pathlib import Path

AUDIT_DIR = Path(__file__).parent.parent.parent / "data" / "audit"


def log_audit_event(account_id: str, agent: str, action: str, detail: str, confidence: float | None = None):
    """Append an audit event to the account's audit log file."""
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    audit_file = AUDIT_DIR / f"{account_id}.json"

    events = []
    if audit_file.exists():
        events = json.loads(audit_file.read_text())

    events.append({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent": agent,
        "action": action,
        "detail": detail,
        "confidence": confidence,
    })

    audit_file.write_text(json.dumps(events, indent=2))


def get_audit_trail(account_id: str) -> list[dict]:
    """Read the audit trail for an account."""
    audit_file = AUDIT_DIR / f"{account_id}.json"
    if not audit_file.exists():
        return []
    return json.loads(audit_file.read_text())
