import os
import json

import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()


class LLMClient:
    """LLM client abstraction. Currently supports Gemini, designed for easy swap to Hermes/K2."""

    def __init__(self, provider: str | None = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")
        self._init_provider()

    def _init_provider(self):
        if self.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not set in environment")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel("gemini-2.0-flash")
        # Future: elif self.provider == "hermes": ...
        # Future: elif self.provider == "k2": ...
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

    async def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Send a prompt to the LLM and return parsed JSON response."""
        if self.provider == "gemini":
            return await self._generate_gemini(system_prompt, user_prompt)
        raise ValueError(f"Provider {self.provider} not implemented")

    async def _generate_gemini(self, system_prompt: str, user_prompt: str) -> dict:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        response = self.model.generate_content(
            full_prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        return json.loads(response.text)
