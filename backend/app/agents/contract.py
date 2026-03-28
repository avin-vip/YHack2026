import json

from app.agents.base import BaseAgent


class ContractAnalyst(BaseAgent):
    name = "contract"
    role = "Contract Analyst"

    def get_system_prompt(self) -> str:
        return """You are a Contract Analyst agent in the ARIA revenue recovery system.
Your role is to analyze contract documents and extract key financial terms.

Given contract data, you must:
1. Identify the pricing structure (base fee, overage rates, limits)
2. Extract discount terms and their exact scope
3. Calculate the expected monthly revenue
4. Flag any ambiguous or notable clauses that could cause billing errors

You MUST respond with valid JSON in this exact structure:
{
  "output": {
    "expected_revenue": "string (e.g. '$85,000/mo')",
    "pricing_tier": "string",
    "discount_schedule": "string describing discount terms and scope",
    "overage_rate": "string (e.g. '$0.05/unit')"
  },
  "confidence": number between 0 and 1,
  "evidence": ["array of evidence strings citing specific contract sections"],
  "reasoning": ["array of reasoning step strings describing your analysis process"]
}

Be precise. Cite specific contract sections (e.g. §4.2). Be conservative in confidence scoring.
Do not hallucinate data not present in the input."""

    def build_user_prompt(self, data: dict) -> str:
        contract = data.get("contract", {})
        self._log(f"Fetching {contract.get('id', 'unknown')} from vault...")
        self._log(f"Parsing {contract.get('total_pages', 0)}-page PDF agreement...")

        return f"""Analyze the following contract and extract financial terms:

{json.dumps(contract, indent=2)}

Extract: expected monthly revenue, pricing tier, discount schedule, overage rate.
Cite specific contract sections as evidence."""
