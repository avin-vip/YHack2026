import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter()
DATA_DIR = Path(__file__).parent.parent.parent / "data"


def _load_json(subdir: str, filename: str) -> dict:
    path = DATA_DIR / subdir / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"{subdir}/{filename} not found")
    with open(path) as f:
        return json.load(f)


@router.get("/accounts")
def list_accounts():
    """List all accounts."""
    accounts_dir = DATA_DIR / "accounts"
    accounts = []
    for f in accounts_dir.glob("*.json"):
        accounts.append(json.loads(f.read_text()))
    return {"accounts": accounts}


@router.get("/accounts/{account_id}")
def get_account(account_id: str):
    """Get account details."""
    return _load_json("accounts", f"{account_id}.json")


@router.get("/accounts/{account_id}/contract")
def get_contract(account_id: str):
    """Get contract for an account."""
    account = _load_json("accounts", f"{account_id}.json")
    contract_id = account["contract_id"]
    return _load_json("contracts", f"{contract_id}.json")


@router.get("/accounts/{account_id}/usage")
def get_usage(account_id: str):
    """Get usage records for an account."""
    usage_dir = DATA_DIR / "usage"
    for f in usage_dir.glob("*.json"):
        data = json.loads(f.read_text())
        if data.get("account_id") == account_id:
            return data
    raise HTTPException(status_code=404, detail="No usage data found")


@router.get("/accounts/{account_id}/invoices")
def get_invoices(account_id: str):
    """Get invoices for an account."""
    invoices_dir = DATA_DIR / "invoices"
    invoices = []
    for f in invoices_dir.glob("*.json"):
        data = json.loads(f.read_text())
        if data.get("account_id") == account_id:
            invoices.append(data)
    return {"invoices": invoices}
