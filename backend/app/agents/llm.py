import os
import json
import re
import asyncio
import time
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

# ── Request shaping + shared HTTP clients ──
_PROVIDER_CONCURRENCY = {
    "gemini": int(os.getenv("ARIA_GEMINI_CONCURRENCY", "4")),
    "k2": int(os.getenv("ARIA_K2_CONCURRENCY", "3")),
    "gpt-4o": int(os.getenv("ARIA_GPT4O_CONCURRENCY", "3")),
    "claude-sonnet": int(os.getenv("ARIA_CLAUDE_SONNET_CONCURRENCY", "2")),
    "claude-haiku": int(os.getenv("ARIA_CLAUDE_HAIKU_CONCURRENCY", "3")),
    "kimi": int(os.getenv("ARIA_KIMI_CONCURRENCY", "3")),
}
_PROVIDER_SEMAPHORES: dict[str, asyncio.Semaphore] = {}

_HTTP_CLIENTS: dict[str, httpx.AsyncClient] = {}
_HTTP_CLIENT_LIMITS = httpx.Limits(
    max_connections=int(os.getenv("ARIA_HTTP_MAX_CONNECTIONS", "100")),
    max_keepalive_connections=int(os.getenv("ARIA_HTTP_KEEPALIVE_CONNECTIONS", "20")),
)


def _get_provider_semaphore(provider: str) -> asyncio.Semaphore:
    if provider not in _PROVIDER_SEMAPHORES:
        limit = max(1, _PROVIDER_CONCURRENCY.get(provider, 2))
        _PROVIDER_SEMAPHORES[provider] = asyncio.Semaphore(limit)
    return _PROVIDER_SEMAPHORES[provider]


def _get_http_client(client_key: str) -> httpx.AsyncClient:
    client = _HTTP_CLIENTS.get(client_key)
    if client is None:
        client = httpx.AsyncClient(timeout=120.0, limits=_HTTP_CLIENT_LIMITS)
        _HTTP_CLIENTS[client_key] = client
    return client


class LLMClient:
    """LLM client abstraction. Supports Gemini, K2, and Lava-routed providers."""

    def __init__(self, provider: str | None = None, run_logger=None, agent_name: str | None = None):
        self.provider = provider or os.getenv("LLM_PROVIDER", "gemini")
        self.run_logger = run_logger
        self.agent_name = agent_name
        self._last_raw: str | None = None
        self._last_think: str | None = None  # K2 chain-of-thought reasoning
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
        self._last_raw = None
        total_start = time.time()
        queue_start = total_start
        queue_wait_ms = 0
        llm_latency_ms = 0
        error_msg = None
        result = None

        try:
            semaphore = _get_provider_semaphore(self.provider)
            async with semaphore:
                queue_wait_ms = round((time.time() - queue_start) * 1000)
                llm_start = time.time()
                if self.provider == "gemini":
                    result = await self._generate_gemini(system_prompt, user_prompt)
                elif self.provider == "k2":
                    result = await self._generate_k2(system_prompt, user_prompt)
                elif self.provider in LAVA_MODELS:
                    fmt = self.lava_config["format"]
                    if fmt == "anthropic":
                        result = await self._generate_lava_anthropic(system_prompt, user_prompt)
                    else:
                        result = await self._generate_lava_openai(system_prompt, user_prompt)
                else:
                    raise ValueError(f"Provider {self.provider} not implemented")
                llm_latency_ms = round((time.time() - llm_start) * 1000)
            return result
        except Exception as e:
            error_msg = str(e)
            raise
        finally:
            if self.run_logger:
                latency_ms = round((time.time() - total_start) * 1000)
                self.run_logger.log_call(
                    agent=self.agent_name or "unknown",
                    provider=self.provider,
                    model=self.model_name,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    raw_response=self._last_raw,
                    parsed_response=result,
                    latency_ms=latency_ms,
                    queue_wait_ms=queue_wait_ms,
                    llm_latency_ms=llm_latency_ms,
                    success=error_msg is None,
                    error=error_msg,
                )

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

        self._last_raw = response.text

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
            client = _get_http_client("k2")
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
        self._last_raw = content

        # Extract K2 chain-of-thought before _extract_json strips it
        think_match = re.search(r"<think>(.*?)</think>", content, re.DOTALL)
        self._last_think = think_match.group(1).strip() if think_match else None

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
            client = _get_http_client("lava-openai")
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
        self._last_raw = content
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
            client = _get_http_client("lava-anthropic")
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
        self._last_raw = content
        return self._extract_json(content)

    # ── JSON extraction ──

    @staticmethod
    def _extract_json(text: str) -> dict:
        """Extract JSON from a response that may contain markdown code blocks or surrounding text."""
        # Strip <think>...</think> blocks (K2 reasoning model wraps output in these)
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
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
