import os
import json
import re
import asyncio

import google.generativeai as genai
import httpx
from dotenv import load_dotenv

load_dotenv()

AVAILABLE_MODELS = {
    "gemini": "Gemini 2.5 Flash",
    "k2": "K2 Think V2",
}


class LLMClient:
    """LLM client abstraction. Supports Gemini and K2 Think V2."""

    def __init__(self, provider: str | None = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")
        self._init_provider()

    def _init_provider(self):
        if self.provider == "gemini":
            api_key = os.getenv("GEMINI_API_KEY")
            if not api_key:
                raise ValueError("GEMINI_API_KEY not set in environment")
            genai.configure(api_key=api_key)
            self.model = genai.GenerativeModel("gemini-2.5-flash")
        elif self.provider == "k2":
            self.k2_api_key = os.getenv("K2_API_KEY")
            if not self.k2_api_key:
                raise ValueError("K2_API_KEY not set in environment")
            self.k2_endpoint = "https://api.k2think.ai/v1/chat/completions"
            self.k2_model = "MBZUAI-IFM/K2-Think-v2"
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider}")

    @property
    def model_name(self) -> str:
        return AVAILABLE_MODELS.get(self.provider, self.provider)

    async def generate(self, system_prompt: str, user_prompt: str) -> dict:
        """Send a prompt to the LLM and return parsed JSON response."""
        if self.provider == "gemini":
            return await self._generate_gemini(system_prompt, user_prompt)
        if self.provider == "k2":
            return await self._generate_k2(system_prompt, user_prompt)
        raise ValueError(f"Provider {self.provider} not implemented")

    async def _generate_gemini(self, system_prompt: str, user_prompt: str) -> dict:
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        gen_config = genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0.2,
        )

        try:
            if hasattr(self.model, "generate_content_async"):
                response = await self.model.generate_content_async(
                    full_prompt,
                    generation_config=gen_config,
                )
            else:
                response = await asyncio.to_thread(
                    self.model.generate_content,
                    full_prompt,
                    generation_config=gen_config,
                )
        except Exception as e:
            raise RuntimeError(f"Gemini API call failed: {e}") from e

        try:
            return json.loads(response.text)
        except (json.JSONDecodeError, ValueError) as e:
            raise RuntimeError(
                f"Failed to parse LLM response as JSON: {e}\nRaw response: {response.text[:500]}"
            ) from e

    async def _generate_k2(self, system_prompt: str, user_prompt: str) -> dict:
        payload = {
            "model": self.k2_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.k2_api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(self.k2_endpoint, json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"K2 API returned {e.response.status_code}: {e.response.text[:500]}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"K2 API call failed: {e}") from e

        content = data["choices"][0]["message"]["content"]
        return self._extract_json(content)

    @staticmethod
    def _extract_json(text: str) -> dict:
        """Extract JSON from a response that may contain markdown code blocks or surrounding text."""
        # Direct parse
        try:
            return json.loads(text)
        except (json.JSONDecodeError, ValueError):
            pass
        # Markdown code block
        match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1))
            except (json.JSONDecodeError, ValueError):
                pass
        # First { to last }
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except (json.JSONDecodeError, ValueError):
                pass
        raise RuntimeError(f"Failed to extract JSON from response:\n{text[:500]}")
