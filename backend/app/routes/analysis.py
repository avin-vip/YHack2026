import asyncio
import json
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from fastapi.responses import StreamingResponse

from app.agents.llm import AVAILABLE_MODELS
from app.services.pipeline import run_analysis
from app.services.slack import send_batch_summary

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"


class AnalyzeRequest(BaseModel):
    providers: Optional[dict[str, str]] = None


class BatchAnalyzeStreamRequest(BaseModel):
    accounts: Optional[list[str]] = None
    providers_by_account: Optional[dict[str, dict[str, str]]] = None


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@router.post("/accounts/{account_id}/analyze")
async def analyze_account(account_id: str, request: Optional[AnalyzeRequest] = None):
    """Run the full 4-agent analysis pipeline for an account.

    Optionally accepts per-agent provider overrides in the request body:
    { "providers": { "contract": "gemini", "usage": "k2", ... } }
    """
    try:
        providers = request.providers if request else None
        result = await run_analysis(account_id, providers=providers)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post("/batch-analyze")
async def batch_analyze():
    """Run analysis on all accounts in parallel.

    Returns per-account results plus an aggregate summary.
    """
    accounts_dir = DATA_DIR / "accounts"
    account_ids = [f.stem for f in accounts_dir.glob("*.json")]

    if not account_ids:
        raise HTTPException(status_code=404, detail="No accounts found")

    async def safe_analyze(account_id: str) -> dict:
        try:
            return await run_analysis(account_id)
        except Exception as e:
            return {
                "account_id": account_id,
                "error": str(e),
                "agents": {},
                "leakage": {},
                "recovery_actions": [],
            }

    results = await asyncio.gather(*[safe_analyze(aid) for aid in account_ids])

    total_leakage = 0
    accounts_with_leakage = 0
    top_accounts = []
    for r in results:
        leak = r.get("leakage", {})
        net = leak.get("net_leakage", "0")
        amount = float(str(net).replace("$", "").replace(",", "").strip() or "0")
        if amount > 0:
            accounts_with_leakage += 1
            total_leakage += amount
            top_accounts.append({"name": r.get("account_id", ""), "leakage": amount})

    top_accounts.sort(key=lambda x: x["leakage"], reverse=True)
    asyncio.create_task(send_batch_summary(
        total_leakage=total_leakage,
        accounts_analyzed=len(results),
        accounts_with_leakage=accounts_with_leakage,
        top_accounts=top_accounts,
    ))

    return {
        "summary": {
            "accounts_analyzed": len(results),
            "accounts_with_leakage": accounts_with_leakage,
            "total_leakage": total_leakage,
        },
        "results": results,
    }


@router.post("/batch-analyze-stream")
async def batch_analyze_stream(request: Optional[BatchAnalyzeStreamRequest] = None):
    """Run analysis on accounts in parallel and stream per-stage progress via SSE."""
    accounts_dir = DATA_DIR / "accounts"
    all_account_ids = [f.stem for f in accounts_dir.glob("*.json")]

    if not all_account_ids:
        raise HTTPException(status_code=404, detail="No accounts found")

    requested_ids = request.accounts if request and request.accounts else all_account_ids
    account_ids = [aid for aid in requested_ids if aid in set(all_account_ids)]

    if not account_ids:
        raise HTTPException(status_code=404, detail="No valid accounts found")

    providers_by_account = request.providers_by_account if request and request.providers_by_account else {}
    run_id = uuid4().hex
    event_queue: asyncio.Queue[dict | None] = asyncio.Queue()

    async def emit(event_name: str, payload: dict) -> None:
        await event_queue.put({
            "event": event_name,
            "data": payload,
        })

    async def safe_analyze_stream(account_id: str) -> dict:
        await emit("account_started", {
            "run_id": run_id,
            "account_id": account_id,
            "timestamp": _utc_now_iso(),
        })
        try:
            providers = providers_by_account.get(account_id)

            async def progress_cb(progress_payload: dict):
                await emit("stage_update", {
                    "run_id": run_id,
                    **progress_payload,
                })

            result = await run_analysis(
                account_id,
                providers=providers,
                progress_cb=progress_cb,
            )

            await emit("account_completed", {
                "run_id": run_id,
                "account_id": account_id,
                "timestamp": _utc_now_iso(),
                "result": result,
            })
            return result
        except Exception as e:
            await emit("account_failed", {
                "run_id": run_id,
                "account_id": account_id,
                "timestamp": _utc_now_iso(),
                "error": str(e),
            })
            return {
                "account_id": account_id,
                "error": str(e),
                "agents": {},
                "leakage": {},
                "recovery_actions": [],
            }

    async def run_and_finalize() -> None:
        results = await asyncio.gather(*[safe_analyze_stream(aid) for aid in account_ids])

        total_leakage = 0
        accounts_with_leakage = 0
        top_accounts = []
        for r in results:
            leak = r.get("leakage", {})
            net = leak.get("net_leakage", "0")
            amount = float(str(net).replace("$", "").replace(",", "").strip() or "0")
            if amount > 0:
                accounts_with_leakage += 1
                total_leakage += amount
                top_accounts.append({"name": r.get("account_id", ""), "leakage": amount})

        top_accounts.sort(key=lambda x: x["leakage"], reverse=True)
        await send_batch_summary(
            total_leakage=total_leakage,
            accounts_analyzed=len(results),
            accounts_with_leakage=accounts_with_leakage,
            top_accounts=top_accounts,
        )

        await emit("batch_completed", {
            "run_id": run_id,
            "timestamp": _utc_now_iso(),
            "summary": {
                "accounts_analyzed": len(results),
                "accounts_with_leakage": accounts_with_leakage,
                "total_leakage": total_leakage,
            },
        })
        await event_queue.put(None)

    asyncio.create_task(run_and_finalize())

    async def event_stream():
        yield _to_sse("batch_started", {
            "run_id": run_id,
            "timestamp": _utc_now_iso(),
            "total_accounts": len(account_ids),
        })

        while True:
            item = await event_queue.get()
            if item is None:
                break
            yield _to_sse(item["event"], item["data"])

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


@router.get("/models")
async def get_available_models():
    """Return the list of available LLM providers."""
    return {"models": AVAILABLE_MODELS}
