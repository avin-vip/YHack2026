"""
reports.py - Report narrative generation endpoints.
"""

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

from app.agents.report import generate_account_narrative, generate_dashboard_narrative

router = APIRouter()


class DashboardReportRequest(BaseModel):
    summary: dict[str, Any]
    accounts: list[dict[str, Any]]


class AccountReportRequest(BaseModel):
    account_name: str
    analysis: dict[str, Any]


@router.post("/reports/dashboard")
async def dashboard_report(req: DashboardReportRequest):
    narrative = await generate_dashboard_narrative(req.summary, req.accounts)
    return {
        "narrative": narrative,
        "generated_at": __import__("datetime").date.today().isoformat(),
    }


@router.post("/reports/account")
async def account_report(req: AccountReportRequest):
    narrative = await generate_account_narrative(req.account_name, req.analysis)
    return {
        "narrative": narrative,
        "generated_at": __import__("datetime").date.today().isoformat(),
    }
