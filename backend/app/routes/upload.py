"""
upload.py — PDF contract upload endpoint.

POST /api/contracts/upload
  - Accepts a PDF file (max 20 MB)
  - Tries to extract pricing fields via LLM (pdfplumber + Gemini)
  - Falls back to pure synthetic generation if LLM unavailable
  - Saves account / contract / usage / invoice JSON to disk
  - Returns {account_id, account, message}
"""

import io

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.scenario import build_full_scenario

router = APIRouter()

_MAX_BYTES = 20 * 1024 * 1024  # 20 MB
_PDF_MAGIC = b"%PDF"


async def _extract_from_pdf(content: bytes) -> dict:
    """
    Extract pricing fields from PDF content using pdfplumber + LLM.
    Returns a (possibly empty) dict.  Never raises — any failure returns {}.
    """
    try:
        import pdfplumber  # optional dep — guarded here

        from app.agents.llm import LLMClient

        # Extract text from first 5 pages
        text_pages: list[str] = []
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            for page in pdf.pages[:5]:
                text = page.extract_text()
                if text:
                    text_pages.append(text)

        if not text_pages:
            return {}

        contract_text = "\n\n".join(text_pages)[:5000]  # cap at ~5k chars

        llm = LLMClient()

        system_prompt = (
            "You are a contract data extractor. Extract pricing information from the contract text.\n"
            "Return ONLY a JSON object with these fields (use null for any field you cannot find — "
            "never guess or hallucinate values):\n"
            "- party_name: string — name of the customer / counterparty\n"
            "- base_fee_monthly: number — monthly base fee in USD (integer)\n"
            "- usage_limit_monthly: number — monthly usage limit in units (integer)\n"
            "- overage_rate_per_unit: number — overage rate per unit as a decimal (e.g. 0.05)\n"
            "- discount_rate: number — discount rate as a decimal (e.g. 0.25 for 25%)\n"
            "- payment_net_days: number — payment terms in days (integer)"
        )

        result = await llm.generate(system_prompt, f"Contract text:\n{contract_text}")

        if isinstance(result, dict):
            # Strip null values so callers can use simple `or` fallbacks
            return {k: v for k, v in result.items() if v is not None}

    except Exception:
        pass  # LLM unavailable or pdfplumber failed — fall back to synthetic

    return {}


@router.post("/contracts/upload")
async def upload_contract(file: UploadFile = File(...)):
    """Upload a PDF contract and auto-generate synthetic usage + invoice data."""

    if not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    content = await file.read()

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(content) > _MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 20 MB limit.")

    if not content.startswith(_PDF_MAGIC):
        raise HTTPException(status_code=400, detail="File does not appear to be a valid PDF.")

    # Best-effort LLM extraction — falls back to {} on any error
    extracted = await _extract_from_pdf(content)

    # Build + save full scenario (always succeeds)
    account = build_full_scenario(file.filename, extracted)

    return {
        "account_id": account["id"],
        "account": account,
        "message": (
            f"Contract '{file.filename}' uploaded. "
            f"Account {account['id']} created with synthetic usage and invoice data."
        ),
    }
