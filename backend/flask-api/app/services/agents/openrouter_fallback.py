"""
Respaldo vía OpenRouter (API compatible con OpenAI) para cuando Gemini está
saturado (503/429). Solo se usa DESPUÉS de agotar los modelos de Gemini y antes
de rendirse al Mock. Sin OPENROUTER_API_KEY queda desactivado.
"""

import json
import logging
import os
import re
import time
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger(__name__)

_URL = "https://openrouter.ai/api/v1/chat/completions"
_DEFAULT_MODELS = "nvidia/nemotron-3-ultra-550b-a55b:free"


def is_configured() -> bool:
    return bool(os.getenv("OPENROUTER_API_KEY", "").strip())


def _models() -> List[str]:
    raw = os.getenv("OPENROUTER_MODELS", _DEFAULT_MODELS)
    return [m.strip() for m in raw.split(",") if m.strip()]


def _extract_json(text: str) -> Dict[str, Any]:
    text = re.sub(r"^```(?:json)?|```$", "", (text or "").strip(), flags=re.IGNORECASE | re.MULTILINE).strip()
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise
        return json.loads(text[start:end + 1])


def generate_json(prompt: str, schema: Optional[dict] = None, temperature: float = 0.3,
                  user_message: Optional[str] = None, attempts: int = 2) -> tuple:
    """Devuelve (dict_json, modelo_usado). Lanza excepción si todos los modelos fallan."""
    key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY no configurada")

    system = prompt
    if schema:
        system += (
            "\n\nResponde ÚNICAMENTE con un objeto JSON válido (sin texto adicional ni bloques markdown) "
            "que cumpla este JSON Schema:\n" + json.dumps(schema, ensure_ascii=False)
        )
    else:
        system += "\n\nResponde ÚNICAMENTE con un objeto JSON válido, sin texto adicional ni bloques markdown."

    messages = [{"role": "system", "content": system}]
    messages.append({"role": "user", "content": user_message or "Genera la respuesta JSON solicitada."})

    last: Optional[Exception] = None
    for model in _models():
        for i in range(attempts):
            try:
                res = requests.post(
                    _URL,
                    headers={
                        "Authorization": f"Bearer {key}",
                        "Content-Type": "application/json",
                        "X-Title": "Clerkship UNAB",
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": 6000,
                        "response_format": {"type": "json_object"},
                    },
                    timeout=90,
                )
                if res.status_code in (429, 502, 503, 504):
                    raise RuntimeError(f"OpenRouter {res.status_code}: {res.text[:200]}")
                res.raise_for_status()
                content = ((res.json().get("choices") or [{}])[0].get("message") or {}).get("content")
                return _extract_json(content or ""), model
            except Exception as exc:  # noqa: BLE001
                last = exc
                logger.warning("OpenRouter modelo '%s' falló (intento %d): %s", model, i + 1, exc)
                time.sleep(2 * (i + 1))
    raise last or RuntimeError("OpenRouter sin respuesta")
