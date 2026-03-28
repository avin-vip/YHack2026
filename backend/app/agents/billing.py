import json

from app.agents.base import BaseAgent


class BillingAuditor(BaseAgent):
    name = "billing"
    role = "Billing Auditor"

    def get_system_prompt(self) -> str:
        return """You are a Billing Auditor agent in the ARIA revenue recovery system.
Your role is to audit invoices against contract terms and usage data to find billing errors.

Given invoice data and contract terms, you must:
1. Verify each line item against contract pricing
2. Check if overage charges are present and correct
3. Verify discount application scope (base only vs all charges per contract)
4. Identify any missing line items or incorrect calculations
5. Quantify the financial impact of any errors found

You MUST respond with valid JSON in this exact structure:
{
  "output": {
    "invoice_total": "string (e.g. '$63,750')",
    "base_charge": "string",
    "overage_line": "string (e.g. '$0.00' if missing)",
    "discount_error": "string describing any discount misapplication"
  },
  "confidence": number between 0 and 1,
  "evidence": ["array of evidence strings citing invoice and contract data"],
  "reasoning": ["array of reasoning step strings"]
}

Be precise about dollar amounts. Flag discrepancies clearly."""

    def build_user_prompt(self, data: dict) -> str:
        invoice = data.get("invoice", {})
        contract = data.get("contract", {})

        self._log(f"Loading {invoice.get('id', 'unknown')}...")
        self._log(f"Line items: Base ${invoice.get('total', 0):,}")

        return f"""Audit the following invoice against contract terms:

INVOICE:
{json.dumps(invoice, indent=2)}

CONTRACT TERMS:
- Base fee: ${contract.get('base_fee_monthly', 'N/A'):,}/month
- Overage rate: ${contract.get('overage_rate_per_unit', 'N/A')}/unit
- Discount: {contract.get('discount', {}).get('rate', 0) * 100}% on {contract.get('discount', {}).get('scope', 'N/A')}
- Discount clause: {contract.get('discount', {}).get('clause', 'N/A')}

Verify all line items, check for missing overage charges, and validate discount application scope."""
