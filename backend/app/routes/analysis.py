from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.agents.llm import AVAILABLE_MODELS
from app.services.pipeline import run_analysis

router = APIRouter()


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


@router.get("/models")
async def get_available_models():
    """Return the list of available LLM providers."""
    return {"models": AVAILABLE_MODELS}
