import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

LOGS_DIR = Path(__file__).parent.parent.parent / "logs"


class RunLogger:
    """Captures every LLM prompt/response pair during a single pipeline run."""

    def __init__(self, account_id: str):
        self.run_id = uuid.uuid4().hex[:8]
        self.account_id = account_id
        self.started_at = datetime.now(timezone.utc).isoformat()
        self.entries: list[dict] = []

    def log_call(
        self,
        *,
        agent: str,
        provider: str,
        model: str,
        system_prompt: str,
        user_prompt: str,
        raw_response: str | None,
        parsed_response: dict | None,
        latency_ms: int,
        success: bool,
        error: str | None,
    ):
        self.entries.append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent": agent,
            "provider": provider,
            "model": model,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "raw_response": raw_response,
            "parsed_response": parsed_response,
            "latency_ms": latency_ms,
            "success": success,
            "error": error,
        })

    def save(self) -> Path:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        filename = f"run_{ts}_{self.run_id}.json"
        data = {
            "run_id": self.run_id,
            "account_id": self.account_id,
            "started_at": self.started_at,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_calls": len(self.entries),
            "entries": self.entries,
        }
        path = LOGS_DIR / filename
        with open(path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        return path
