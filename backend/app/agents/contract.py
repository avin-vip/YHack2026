import json
import re

from app.agents.base import BaseAgent


class ContractAnalyst(BaseAgent):
    name = "contract"
    role = "Contract Analyst"
    LOW_CONFIDENCE_THRESHOLD = 0.80

    _AMBIGUITY_HINTS = (
        "ambiguous",
        "unclear",
        "conflict",
        "not explicit",
        "uncertain",
        "insufficient",
    )

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

    @staticmethod
    def _normalize_section(section_id: str) -> str:
        return str(section_id or "").strip().lower().replace(" ", "")

    def _search_clause(self, contract: dict, section_id: str) -> str:
        """Tool: search_clause(section_id) -> raw clause text."""
        wanted = self._normalize_section(section_id)
        if not wanted:
            return ""

        clauses = contract.get("clauses", {})
        for clause in clauses.values():
            sec = self._normalize_section(clause.get("section", ""))
            if sec == wanted or wanted in sec or sec in wanted:
                return str(clause.get("text", "")).strip()

        discount = contract.get("discount", {})
        discount_clause = self._normalize_section(discount.get("clause", ""))
        if discount_clause and (discount_clause == wanted or wanted in discount_clause):
            return str(discount.get("description", "")).strip()

        return ""

    def _needs_clarification(self, response: dict) -> bool:
        confidence = float(response.get("confidence", 0.0) or 0.0)
        if confidence < self.LOW_CONFIDENCE_THRESHOLD:
            return True

        fragments = []
        output = response.get("output", {})
        fragments.extend([str(v) for v in output.values()])
        fragments.extend([str(v) for v in response.get("evidence", [])])
        fragments.extend([str(v) for v in response.get("reasoning", [])])
        haystack = " ".join(fragments).lower()
        return any(hint in haystack for hint in self._AMBIGUITY_HINTS)

    def _extract_section_candidates(self, response: dict, contract: dict) -> list[str]:
        joined = " ".join(
            [str(v) for v in response.get("evidence", []) + response.get("reasoning", [])]
        )
        sections = re.findall(r"§\d+(?:\.\d+)?", joined)
        if sections:
            # Keep order, dedupe
            return list(dict.fromkeys(sections))[:3]

        # Fallback to discount clause first, then common pricing sections.
        fallback = []
        discount_clause = contract.get("discount", {}).get("clause")
        if discount_clause:
            fallback.append(str(discount_clause))
        for clause in contract.get("clauses", {}).values():
            sec = clause.get("section")
            if sec:
                fallback.append(str(sec))
        return list(dict.fromkeys(fallback))[:3]

    def _build_clarification_prompt(self, contract: dict, first_pass: dict, tool_results: list[dict]) -> str:
        return f"""You are running a second-pass clarification for contract analysis.
The first pass showed low confidence or potential ambiguity.

FIRST PASS OUTPUT:
{json.dumps(first_pass, indent=2)}

TOOL RESULTS:
{json.dumps(tool_results, indent=2)}

ORIGINAL CONTRACT (for full context):
{json.dumps(contract, indent=2)}

Task:
1) Resolve discount-scope and pricing ambiguities using the tool results first.
2) Recompute expected monthly revenue if needed.
3) Return the same JSON schema as before with updated confidence, evidence, and reasoning.
4) Cite section IDs explicitly in evidence (e.g., §12.3, §4.2).
5) Be conservative: if ambiguity remains, keep confidence below 0.8."""

    async def run(self, data: dict) -> dict:
        """Run with a simple observe-act-observe loop for ambiguity resolution."""
        self.logs = []
        self._log(f"Initializing {self.role}...")

        contract = data.get("contract", {})
        system_prompt = self.get_system_prompt()
        user_prompt = self.build_user_prompt(data)

        self._log("Sending to LLM for analysis...")
        try:
            first_pass = await self.llm.generate(system_prompt, user_prompt)
        except Exception as e:
            self._log(f"LLM call failed: {e}", "red")
            return {
                "role": self.role,
                "input_description": data.get("input_description", ""),
                "output": {},
                "confidence": 0.0,
                "evidence": [],
                "reasoning": [],
                "error": str(e),
                "logs": self.logs,
            }

        response = first_pass
        if self._needs_clarification(first_pass):
            self._log("Low confidence detected; entering tool-use loop...", "amber")
            sections = self._extract_section_candidates(first_pass, contract)
            tool_results = []
            resolved_sections = []
            for section in sections:
                clause_text = self._search_clause(contract, section)
                if clause_text:
                    tool_results.append({"tool": "search_clause", "section_id": section, "text": clause_text})
                    resolved_sections.append(section)
                    self._log(f"Tool search_clause('{section}') -> clause retrieved", "blue")
                else:
                    self._log(f"Tool search_clause('{section}') -> no match", "amber")

            if tool_results:
                clarify_prompt = self._build_clarification_prompt(contract, first_pass, tool_results)
                self._log("Tool clarify_ambiguity(...) -> re-querying LLM", "blue")
                try:
                    second_pass = await self.llm.generate(system_prompt, clarify_prompt)
                    first_conf = float(first_pass.get("confidence", 0.0) or 0.0)
                    second_conf = float(second_pass.get("confidence", 0.0) or 0.0)
                    if second_conf >= first_conf:
                        response = second_pass
                        top_section = resolved_sections[0] if resolved_sections else "§12.3"
                        self._log(
                            f"Agent re-queried {top_section} — resolved discount scope ambiguity",
                            "acid",
                        )
                    else:
                        self._log(
                            "Clarification pass returned lower confidence; retaining first pass.",
                            "amber",
                        )
                except Exception as e:
                    self._log(f"clarify_ambiguity failed: {e}", "amber")
            else:
                self._log("No clause context retrieved; skipping clarification pass.", "amber")

        self._log("Analysis complete", "acid")

        return {
            "role": self.role,
            "input_description": data.get("input_description", ""),
            "output": response.get("output", {}),
            "confidence": response.get("confidence", 0.0),
            "evidence": response.get("evidence", []),
            "reasoning": response.get("reasoning", []),
            "logs": self.logs,
        }
