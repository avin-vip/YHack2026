from abc import ABC, abstractmethod
from datetime import datetime, timezone

from app.agents.llm import LLMClient


class BaseAgent(ABC):
    """Base class for all ARIA agents."""

    name: str = "base"
    role: str = "Base Agent"

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.logs: list[dict] = []

    def _log(self, msg: str, level: str = "dim"):
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        self.logs.append({"ts": ts, "msg": msg, "level": level})

    @abstractmethod
    def get_system_prompt(self) -> str:
        pass

    @abstractmethod
    def build_user_prompt(self, data: dict) -> str:
        pass

    async def run(self, data: dict) -> dict:
        """Execute the agent: build prompts, call LLM, return structured output."""
        self.logs = []
        self._log(f"Initializing {self.role}...")

        system_prompt = self.get_system_prompt()
        user_prompt = self.build_user_prompt(data)

        self._log("Sending to LLM for analysis...")
        response = await self.llm.generate(system_prompt, user_prompt)

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
