from fastapi import APIRouter, HTTPException

from app.services.pipeline import run_analysis

router = APIRouter()


@router.post("/accounts/{account_id}/analyze")
async def analyze_account(account_id: str):
    """Run the full 4-agent analysis pipeline for an account.

    This is the main endpoint that triggers:
    1. Contract Analyst
    2. Usage Validator
    3. Billing Auditor
    4. Orchestrator

    Returns the complete analysis with leakage detection, recovery actions,
    email draft, billing payload, and audit trail.
    """
    try:
        result = await run_analysis(account_id)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")
