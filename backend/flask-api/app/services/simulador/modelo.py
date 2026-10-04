"""
Cliente de modelo para el simulador: Gemini (con cadena de modelos de
respaldo) primero, OpenRouter (Nemotron 3 Ultra gratis) despues si Gemini
esta saturado, Mock (503, el cliente reintenta) si ambos fallan.

Reutiliza los helpers de reintento/cadena de modelos ya existentes en
app/services/agents/gemini_agents.py y el respaldo de OpenRouter ya
existente en app/services/agents/openrouter_fallback.py — no se duplica esa
logica, se le enchufa el flujo del simulador (que arma sus propios prompts
en español y su propio parseo/guardrails, distintos de los 3 agentes viejos).
"""

import json
import logging
import os
import re
import time
from typing import List, Optional

from app.services.agents import openrouter_fallback as openrouter
from app.services.agents.gemini_agents import _generate_with_retry, _model_chain

logger = logging.getLogger(__name__)


class RespuestaModelo:
    def __init__(self, texto: Optional[str], proveedor: str, modelo: Optional[str], es_mock: bool,
                 error: Optional[str] = None, latency_ms: Optional[float] = None):
        self.texto = texto
        self.proveedor = proveedor
        self.modelo = modelo
        self.es_mock = es_mock
        self.error = error
        self.latency_ms = latency_ms


def parsear_json(raw: str) -> dict:
    """Puerto de parsearJson(): limpia fences ```json, intenta JSON.parse, si
    falla busca el primer '{' y el ultimo '}' y reintenta."""
    limpio = re.sub(r"^```(?:json)?", "", (raw or "").strip(), flags=re.IGNORECASE)
    limpio = re.sub(r"```$", "", limpio.strip()).strip()
    try:
        return json.loads(limpio)
    except ValueError:
        inicio = limpio.find("{")
        fin = limpio.rfind("}")
        if inicio >= 0 and fin > inicio:
            return json.loads(limpio[inicio:fin + 1])
        raise


def _cliente_gemini():
    if os.getenv("AI_AGENT_PROVIDER", "gemini").lower() == "mock":
        return None
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:  # noqa: BLE001
        logger.warning("No se pudo inicializar el cliente de Gemini: %s", e)
        return None


def llamar_modelo(partes_contenido: List[str], temperature: float = 0.4) -> RespuestaModelo:
    """Intenta Gemini (con su cadena de modelos de respaldo), luego OpenRouter.
    Si ambos fallan devuelve es_mock=True para que la ruta responda 503 y el
    cliente reintente hasta que algun proveedor responda."""
    start = time.perf_counter()
    client = _cliente_gemini()
    model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
    ultimo_error = None

    if client:
        from google.genai import types
        for candidato in _model_chain(model_name):
            try:
                response = _generate_with_retry(
                    client,
                    model=candidato,
                    contents=partes_contenido,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=temperature,
                        http_options=types.HttpOptions(timeout=90_000),  # ms — evita que un call cuelgue indefinidamente sin red
                    ),
                )
                texto = (getattr(response, "text", None) or "").strip()
                if texto:
                    return RespuestaModelo(texto, "Google Gemini", candidato, False, latency_ms=(time.perf_counter() - start) * 1000)
            except Exception as exc:  # noqa: BLE001
                ultimo_error = exc
                logger.warning("Simulador: Gemini modelo '%s' fallo: %s", candidato, exc)

    if os.getenv("AI_AGENT_PROVIDER", "gemini").lower() != "mock" and openrouter.is_configured():
        try:
            sistema = partes_contenido[0]
            usuario = partes_contenido[-1] if len(partes_contenido) > 1 else "Responde en el formato indicado."
            data, modelo_or = openrouter.generate_json(sistema, temperature=temperature, user_message=usuario)
            return RespuestaModelo(
                json.dumps(data, ensure_ascii=False), "OpenRouter", modelo_or, False,
                latency_ms=(time.perf_counter() - start) * 1000,
            )
        except Exception as exc:  # noqa: BLE001
            ultimo_error = exc
            logger.warning("Simulador: respaldo OpenRouter fallo: %s", exc)

    return RespuestaModelo(
        None, "Mock", None, True,
        error=str(ultimo_error) if ultimo_error else "Sin proveedor de IA configurado (falta GEMINI_API_KEY u OPENROUTER_API_KEY)",
        latency_ms=(time.perf_counter() - start) * 1000,
    )
