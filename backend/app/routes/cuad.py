from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services.cuad_pipeline import run_cuad_analysis

router = APIRouter()

class CuadRequest(BaseModel):
    contract_index: int = 0

@router.post("/cuad/analyze")
async def cuad_analyze(request: CuadRequest = None):
    try:
        index = request.contract_index if request else 0
        return await run_cuad_analysis(contract_index=index)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"CUAD analysis failed: {str(e)}")
