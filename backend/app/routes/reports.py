"""
reports.py — Report generation endpoints.

POST /api/reports/dashboard   — Full multi-account report narrative
POST /api/reports/account     — Single account report narrative

Both endpoints accept the analysis data from the frontend (already computed
by the pipeline) and call the ReportAgent to generate prose narrative.
The frontend combines the narrative with the structured data to render the PDF.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any

from app.agents.report import generate_dashboard_narrative, generate_account_narrative

router = APIRouter()


class DashboardReportRequest(BaseModel):
    summary: dict[str, Any]
    accounts: list[dict[str, Any]]


class AccountReportRequest(BaseModel):
    account_name: str
    analysis: dict[str, Any]


@router.post("/reports/dashboard")
async def dashboard_report(req: DashboardReportRequest):
    """
    Generate executive narrative for the dashboard (all-accounts) report.
    Returns narrative JSON — frontend combines with structured data to render PDF.
    """
    narrative = await generate_dashboard_narrative(req.summary, req.accounts)
    return {
        "narrative": narrative,
        "generated_at": __import__("datetime").date.today().isoformat(),
    }


@router.post("/reports/account")
async def account_report(req: AccountReportRequest):
    """
    Generate narrative for a single-account report.
    Returns narrative JSON — frontend combines with structured data to render PDF.
    """
    narrative = await generate_account_narrative(req.account_name, req.analysis)
    return {
        "narrative": narrative,
        "generated_at": __import__("datetime").date.today().isoformat(),
    }
