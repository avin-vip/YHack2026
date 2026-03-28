import json

from app.agents.base import BaseAgent


class UsageValidator(BaseAgent):
    name = "usage"
    role = "Usage Validator"

    def get_system_prompt(self) -> str:
        return """You are a Usage Validator agent in the ARIA revenue recovery system.
Your role is to analyze usage/metering data and compare it against contract limits.

Given usage data and contract terms, you must:
1. Verify total consumption for the billing period
2. Compare against the contract usage limit
3. Detect any overage (units above the limit)
4. Calculate the gross overage value using the contract overage rate and unit multiplier
5. Note any data quality issues (deduplication, retries removed)

You MUST respond with valid JSON in this exact structure:
{
  "output": {
    "total_units": "string (e.g. '10,840')",
    "contract_limit": "string (e.g. '10,000')",
    "overage": "string (e.g. '840 units')",
    "overage_value": "string (e.g. '$42,000 gross')"
  },
  "confidence": number between 0 and 1,
  "evidence": ["array of evidence strings with specific data points"],
  "reasoning": ["array of reasoning step strings"]
}

Be precise with numbers. Show your math for overage calculations."""

    def build_user_prompt(self, data: dict) -> str:
        usage = data.get("usage", {})
        contract = data.get("contract", {})

        self._log(f"Loading {usage.get('source', 'data')} ({usage.get('total_rows', 0)} rows)...")
        self._log("Deduplicating retried calls...")

        return f"""Analyze usage data against contract limits:

USAGE DATA:
{json.dumps(usage, indent=2)}

CONTRACT TERMS:
- Usage limit: {contract.get('usage_limit_monthly', 'N/A')} units/month
- Overage rate: ${contract.get('overage_rate_per_unit', 'N/A')}/unit
- Unit multiplier: {contract.get('unit_multiplier', 1)}

Calculate total usage, overage, and overage value."""
