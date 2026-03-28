import asyncio
import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.llm import AVAILABLE_MODELS
from app.services.pipeline import run_analysis

router = APIRouter()

DATA_DIR = Path(__file__).parent.parent.parent / "data"


class AnalyzeRequest(BaseModel):
    providers: Optional[dict[str, str]] = None


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
    for r in results:
        leak = r.get("leakage", {})
        net = leak.get("net_leakage", "0")
        amount = int(str(net).replace("$", "").replace(",", "").strip() or "0")
        if amount > 0:
            accounts_with_leakage += 1
            total_leakage += amount

    return {
        "summary": {
            "accounts_analyzed": len(results),
            "accounts_with_leakage": accounts_with_leakage,
            "total_leakage": total_leakage,
        },
        "results": results,
    }
@router.get("/models")
async def get_available_models():
    """Return the list of available LLM providers."""
    return {"models": AVAILABLE_MODELS}
