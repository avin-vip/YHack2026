import os
import json
import re
import asyncio
from urllib.parse import quote

import google.generativeai as genai
import httpx
from dotenv import load_dotenv

load_dotenv()

# ── Lava gateway config ──
LAVA_ENDPOINT = "https://api.lava.so/v1/forward"

LAVA_MODELS = {
    "gpt-4o": {
        "name": "GPT-4o",
        "provider_url": "https://api.openai.com/v1/chat/completions",
        "model_id": "gpt-4o",
        "format": "openai",
    },
    "claude-sonnet": {
        "name": "Claude Sonnet 4",
        "provider_url": "https://api.anthropic.com/v1/messages",
        "model_id": "claude-sonnet-4-20250514",
        "format": "anthropic",
    },
    "claude-haiku": {
        "name": "Claude Haiku 4.5",
        "provider_url": "https://api.anthropic.com/v1/messages",
        "model_id": "claude-haiku-4-5-20251001",
        "format": "anthropic",
    },
    "kimi": {
        "name": "Kimi",
        "provider_url": "https://api.moonshot.cn/v1/chat/completions",
        "model_id": "moonshot-v1-auto",
        "format": "openai",
    },
}

AVAILABLE_MODELS = {
    "gemini": "Gemini 2.5 Flash",
    "k2": "K2 Think V2",
    **{k: v["name"] for k, v in LAVA_MODELS.items()},
}


class LLMClient:
    """LLM client abstraction. Supports Gemini, K2, and Lava-routed providers."""

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
        elif self.provider in LAVA_MODELS:
            self.lava_key = os.getenv("LAVA_SECRET_KEY")
            if not self.lava_key:
                raise ValueError("LAVA_SECRET_KEY not set in environment")
            self.lava_config = LAVA_MODELS[self.provider]
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
        if self.provider in LAVA_MODELS:
            fmt = self.lava_config["format"]
            if fmt == "anthropic":
                return await self._generate_lava_anthropic(system_prompt, user_prompt)
            return await self._generate_lava_openai(system_prompt, user_prompt)
        raise ValueError(f"Provider {self.provider} not implemented")

    # ── Gemini (direct SDK) ──

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

    # ── K2 Think V2 (direct httpx) ──

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

    # ── Lava gateway: OpenAI-compatible providers (GPT-4o, Kimi) ──

    def _lava_url(self) -> str:
        return f"{LAVA_ENDPOINT}?u={quote(self.lava_config['provider_url'], safe='')}"

    async def _generate_lava_openai(self, system_prompt: str, user_prompt: str) -> dict:
        payload = {
            "model": self.lava_config["model_id"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.lava_key}",
        }

        name = self.lava_config["name"]
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(self._lava_url(), json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"Lava/{name} returned {e.response.status_code}: {e.response.text[:500]}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Lava/{name} call failed: {e}") from e

        content = data["choices"][0]["message"]["content"]
        return self._extract_json(content)

    # ── Lava gateway: Anthropic providers (Claude) ──

    async def _generate_lava_anthropic(self, system_prompt: str, user_prompt: str) -> dict:
        payload = {
            "model": self.lava_config["model_id"],
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": [
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.lava_key}",
            "anthropic-version": "2023-06-01",
        }

        name = self.lava_config["name"]
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(self._lava_url(), json=payload, headers=headers)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise RuntimeError(
                f"Lava/{name} returned {e.response.status_code}: {e.response.text[:500]}"
            ) from e
        except Exception as e:
            raise RuntimeError(f"Lava/{name} call failed: {e}") from e

        # Anthropic response: { content: [{ type: "text", text: "..." }] }
        content = data["content"][0]["text"]
        return self._extract_json(content)

    # ── JSON extraction ──

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
