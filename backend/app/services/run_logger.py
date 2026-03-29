import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

LOGS_DIR = Path(__file__).parent.parent.parent / "logs"


def _percentile(values: list[int], pct: float) -> int:
    """Return nearest-rank percentile for latency arrays."""
    if not values:
        return 0
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, round((pct / 100.0) * (len(ordered) - 1))))
    return int(ordered[rank])


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
        queue_wait_ms: int,
        llm_latency_ms: int,
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
            "queue_wait_ms": queue_wait_ms,
            "llm_latency_ms": llm_latency_ms,
            "success": success,
            "error": error,
        })

    def _build_latency_metrics(self) -> dict:
        by_agent_provider: dict[tuple[str, str], list[dict]] = {}
        for entry in self.entries:
            key = (entry.get("agent", "unknown"), entry.get("provider", "unknown"))
            by_agent_provider.setdefault(key, []).append(entry)

        rows = []
        for (agent, provider), entries in sorted(by_agent_provider.items()):
            total_latencies = [int(e.get("latency_ms", 0) or 0) for e in entries]
            queue_latencies = [int(e.get("queue_wait_ms", 0) or 0) for e in entries]
            llm_latencies = [int(e.get("llm_latency_ms", 0) or 0) for e in entries]
            rows.append({
                "agent": agent,
                "provider": provider,
                "calls": len(entries),
                "total_latency_ms": {
                    "p50": _percentile(total_latencies, 50),
                    "p95": _percentile(total_latencies, 95),
                },
                "queue_wait_ms": {
                    "p50": _percentile(queue_latencies, 50),
                    "p95": _percentile(queue_latencies, 95),
                },
                "llm_latency_ms": {
                    "p50": _percentile(llm_latencies, 50),
                    "p95": _percentile(llm_latencies, 95),
                },
            })

        return {"by_agent_provider": rows}

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
            "latency_metrics": self._build_latency_metrics(),
            "entries": self.entries,
        }
        path = LOGS_DIR / filename
        with open(path, "w") as f:
            json.dump(data, f, indent=2, default=str)
        return path
