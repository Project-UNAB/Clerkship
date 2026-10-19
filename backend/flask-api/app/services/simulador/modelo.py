"""
Cliente de modelo para el simulador: Gemini (con cadena de modelos de
respaldo) primero, OpenRouter (Nemotron 3 Ultra gratis) despues si Gemini
esta saturado, Mock (503, el cliente reintenta) si ambos fallan.

La cadena del simulador es propia (no la de app/services/agents/gemini_agents.py):
cada agente tiene un tiempo maximo por intento y un presupuesto total, para
que un modelo lento no se coma el tiempo de los demas. Medido el 2026-10-17
con la clave del proyecto: gemini-3.8-flash tarda ~30 s incluso en una
respuesta trivial (y suele dar 504), mientras gemini-3.6-flash y
gemini-3.5-flash responden en ~1-2 s. Por eso 3.8 no esta en la cadena por
defecto; se puede volver a poner con SIMULADOR_MODELOS.

Cada intento fallido queda en el log con su motivo (cuota, tiempo, no
disponible, formato...) y en RespuestaModelo.intentos.
"""

import json
import logging
import os
import re
import time
from typing import List, Optional

from app.services.agents import openrouter_fallback as openrouter

logger = logging.getLogger(__name__)

# Orden por defecto: los que respondieron rapido en la medicion primero.
# SIMULADOR_MODELOS (lista separada por comas) la reemplaza completa.
MODELOS_POR_DEFECTO = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-flash-latest",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

# Tiempo maximo de UN intento y presupuesto total de Gemini, por agente (s).
# Los turnos de chat tienen meta de 10 s; la evaluacion, de 45 s. Google no
# acepta un tiempo maximo menor a 10 s por llamada (400 INVALID_ARGUMENT).
MINIMO_POR_INTENTO_S = 10

TIEMPOS = {
    "generador": {"intento": 35, "total": 75},
    "paciente": {"intento": 10, "total": 22},
    "evaluador": {"intento": 25, "total": 50},
    "defecto": {"intento": 30, "total": 60},
}


# Tras un 429 (cuota por minuto agotada) o un 503 (saturado), el modelo se
# salta por un rato en vez de volver a probarlo en cada llamada: medido el
# 2026-10-17, re-probar modelos sin cuota era lo que alargaba los turnos de chat.
PAUSA_TRAS_FALLA_S = {"cuota": 60, "no_disponible": 15}
_en_pausa_hasta: dict = {}


def _en_pausa(modelo_nombre: str) -> bool:
    return time.monotonic() < _en_pausa_hasta.get(modelo_nombre, 0)


def _pausar(modelo_nombre: str, motivo: str):
    if motivo in PAUSA_TRAS_FALLA_S:
        _en_pausa_hasta[modelo_nombre] = time.monotonic() + PAUSA_TRAS_FALLA_S[motivo]


class RespuestaModelo:
    def __init__(self, texto: Optional[str], proveedor: str, modelo: Optional[str], es_mock: bool,
                 error: Optional[str] = None, latency_ms: Optional[float] = None,
                 prompt_tokens: Optional[int] = None, completion_tokens: Optional[int] = None,
                 total_tokens: Optional[int] = None, intentos: Optional[list] = None):
        self.texto = texto
        self.proveedor = proveedor
        self.modelo = modelo
        self.es_mock = es_mock
        self.error = error
        self.latency_ms = latency_ms
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = total_tokens
        # [{"modelo", "resultado": "ok" | motivo de falla, "ms", "detalle"}]
        self.intentos = intentos or []


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


def cadena_de_modelos() -> List[str]:
    propia = [m.strip() for m in os.getenv("SIMULADOR_MODELOS", "").split(",") if m.strip()]
    return propia or list(MODELOS_POR_DEFECTO)


def motivo_de_falla(exc: Exception) -> str:
    """Clasifica el error de Google en un motivo corto para el log y las mediciones."""
    msg = f"{type(exc).__name__} {exc}"
    if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
        return "cuota"
    if any(t in msg for t in ("504", "DEADLINE_EXCEEDED", "imeout", "timed out", "ReadTimeout")):
        return "tiempo"
    if any(t in msg for t in ("503", "UNAVAILABLE", "overloaded")):
        return "no_disponible"
    if "404" in msg or "NOT_FOUND" in msg:
        return "modelo_inexistente"
    if "400" in msg or "INVALID_ARGUMENT" in msg:
        return "peticion_invalida"
    if "401" in msg or "403" in msg or "PERMISSION_DENIED" in msg or "API key" in msg:
        return "credenciales"
    return "otro"


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


def _configuracion(types, temperature: float, timeout_s: float, con_razonamiento_bajo: bool):
    extra = {}
    if con_razonamiento_bajo:
        # Menos razonamiento interno = respuesta mucho mas rapida; la tarea
        # de cada agente esta guiada por el prompt y la salida es JSON.
        extra["thinking_config"] = types.ThinkingConfig(thinking_level="low")
    return types.GenerateContentConfig(
        response_mime_type="application/json",
        temperature=temperature,
        http_options=types.HttpOptions(timeout=int(timeout_s * 1000)),
        **extra,
    )


def llamar_modelo(partes_contenido: List[str], temperature: float = 0.4, agente: str = "defecto") -> RespuestaModelo:
    """Intenta Gemini (con su cadena de modelos de respaldo), luego OpenRouter.
    Si ambos fallan devuelve es_mock=True para que la ruta responda 503 y el
    cliente reintente hasta que algun proveedor responda.

    `agente` ("generador" | "paciente" | "evaluador") elige el tiempo maximo
    por intento y el presupuesto total (ver TIEMPOS)."""
    start = time.perf_counter()
    tiempos = TIEMPOS.get(agente, TIEMPOS["defecto"])
    client = _cliente_gemini()
    intentos: list = []
    ultimo_error = None

    def registrar(modelo, resultado, t0, detalle=None):
        intentos.append({"modelo": modelo, "resultado": resultado, "ms": round((time.perf_counter() - t0) * 1000), "detalle": detalle})
        if resultado != "ok":
            logger.warning("Simulador [%s]: modelo '%s' fallo por %s en %d ms: %s",
                           agente, modelo, resultado, intentos[-1]["ms"], (detalle or "")[:200])

    if client:
        from google.genai import types
        cadena = cadena_de_modelos()
        disponibles = [m for m in cadena if not _en_pausa(m)]
        # Si todos estan en pausa se prueban igual: mejor un intento que un 503 seguro.
        for candidato in (disponibles or cadena):
            transcurrido = time.perf_counter() - start
            restante = tiempos["total"] - transcurrido
            if restante < MINIMO_POR_INTENTO_S:
                logger.warning("Simulador [%s]: se agoto el presupuesto de %d s antes de probar '%s'.",
                               agente, tiempos["total"], candidato)
                break
            timeout_s = max(MINIMO_POR_INTENTO_S, min(tiempos["intento"], restante))
            con_razonamiento_bajo = True
            # Como mucho dos intentos por modelo: el segundo solo si el modelo no
            # admite el nivel de razonamiento. Un 503 o un 429 pasan al siguiente.
            for _ in range(2):
                t0 = time.perf_counter()
                try:
                    response = client.models.generate_content(
                        model=candidato,
                        contents=partes_contenido,
                        config=_configuracion(types, temperature, timeout_s, con_razonamiento_bajo),
                    )
                except Exception as exc:  # noqa: BLE001
                    ultimo_error = exc
                    motivo = motivo_de_falla(exc)
                    if motivo == "peticion_invalida" and con_razonamiento_bajo and "hinking" in str(exc):
                        # Este modelo no admite el nivel de razonamiento: se reintenta sin el.
                        con_razonamiento_bajo = False
                        continue
                    registrar(candidato, motivo, t0, str(exc))
                    _pausar(candidato, motivo)
                    break

                texto = (getattr(response, "text", None) or "").strip()
                try:
                    if not texto:
                        raise ValueError("respuesta vacia")
                    parsear_json(texto)
                except Exception as exc:  # noqa: BLE001
                    # Un JSON roto no le sirve al agente: se prueba el siguiente modelo.
                    ultimo_error = exc
                    registrar(candidato, "formato", t0, str(exc))
                    break

                registrar(candidato, "ok", t0)
                uso = getattr(response, "usage_metadata", None)
                return RespuestaModelo(
                    texto, "Google Gemini", candidato, False,
                    latency_ms=(time.perf_counter() - start) * 1000,
                    prompt_tokens=getattr(uso, "prompt_token_count", None) if uso else None,
                    completion_tokens=getattr(uso, "candidates_token_count", None) if uso else None,
                    total_tokens=getattr(uso, "total_token_count", None) if uso else None,
                    intentos=intentos,
                )

    if os.getenv("AI_AGENT_PROVIDER", "gemini").lower() != "mock" and openrouter.is_configured():
        t0 = time.perf_counter()
        try:
            sistema = partes_contenido[0]
            usuario = partes_contenido[-1] if len(partes_contenido) > 1 else "Responde en el formato indicado."
            data, modelo_or, uso = openrouter.generate_json(sistema, temperature=temperature, user_message=usuario)
            uso = uso or {}
            registrar(f"openrouter:{modelo_or}", "ok", t0)
            return RespuestaModelo(
                json.dumps(data, ensure_ascii=False), "OpenRouter", modelo_or, False,
                latency_ms=(time.perf_counter() - start) * 1000,
                prompt_tokens=uso.get("prompt_tokens"), completion_tokens=uso.get("completion_tokens"),
                total_tokens=uso.get("total_tokens"),
                intentos=intentos,
            )
        except Exception as exc:  # noqa: BLE001
            ultimo_error = exc
            registrar("openrouter", motivo_de_falla(exc), t0, str(exc))

    return RespuestaModelo(
        None, "Mock", None, True,
        error=str(ultimo_error) if ultimo_error else "Sin proveedor de IA configurado (falta GEMINI_API_KEY u OPENROUTER_API_KEY)",
        latency_ms=(time.perf_counter() - start) * 1000,
        intentos=intentos,
    )
