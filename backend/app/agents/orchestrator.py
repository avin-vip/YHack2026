import json

from app.agents.base import BaseAgent


class Orchestrator(BaseAgent):
    name = "orch"
    role = "Orchestrator"

    def get_system_prompt(self) -> str:
        return """You are the Orchestrator agent in the ARIA revenue recovery system.
You aggregate outputs from the Contract Analyst, Usage Validator, and Billing Auditor to produce a final recovery recommendation.

Given all three agent outputs, you must:
1. Compute the net revenue leakage (expected - actual billed)
2. Calculate a weighted confidence score across all agents
3. Determine recovery probability based on evidence strength
4. Rank recovery actions by impact score (confidence × financial impact)
5. Assess urgency level
6. Draft a professional recovery email
7. Generate a structured billing correction payload

You MUST respond with valid JSON in this exact structure:
{
  "output": {
    "expected": "string (e.g. '$85,000')",
    "actual_billed": "string (e.g. '$63,750')",
    "net_leakage": "string (e.g. '$21,250')",
    "recovery_probability": "string (e.g. '0.85')",
    "urgency": "string (HIGH/MEDIUM/LOW)"
  },
  "confidence": number between 0 and 1,
  "evidence": ["array of summary evidence from all agents"],
  "reasoning": ["array of reasoning steps showing aggregation logic"],
  "recovery_actions": [
    {
      "rank": 1,
      "name": "string",
      "score": number,
      "amount": number,
      "basis": "string (contract clause reference)",
      "deadline": "string",
      "probability": number,
      "description": "string"
    }
  ],
  "email": {
    "to": "string",
    "subject": "string",
    "body": "string (professional, concise recovery email)"
  },
  "billing_payload": {
    "invoice_id": "string (new corrective invoice ID)",
    "amount": number,
    "overage_units": number,
    "rate_per_unit": number,
    "confidence": number,
    "due_days": number
  }
}

Be precise with financial calculations. Show your math in reasoning. Keep the email professional and concise."""

    def build_user_prompt(self, data: dict) -> str:
        contract_result = data.get("contract_result", {})
        usage_result = data.get("usage_result", {})
        billing_result = data.get("billing_result", {})
        account = data.get("account", {})

        self._log("All agent contexts received")
        self._log(
            f"Contract conf: {contract_result.get('confidence', 0):.2f} | "
            f"Usage conf: {usage_result.get('confidence', 0):.2f} | "
            f"Billing conf: {billing_result.get('confidence', 0):.2f}",
            "blue",
        )

        return f"""Aggregate the following agent outputs and produce a recovery recommendation:

ACCOUNT: {account.get('name', 'Unknown')} ({account.get('id', '')})
PRIMARY CONTACT: {account.get('primary_contact', '')}

CONTRACT ANALYST OUTPUT:
{json.dumps(contract_result, indent=2)}

USAGE VALIDATOR OUTPUT:
{json.dumps(usage_result, indent=2)}

BILLING AUDITOR OUTPUT:
{json.dumps(billing_result, indent=2)}

Calculate net leakage, rank recovery actions, draft a recovery email, and generate a billing correction payload.
The email should reference specific contract sections and be addressed to the account's finance team."""
