"""Cadena de modelos del simulador (app/services/simulador/modelo.py): cada
intento fallido queda clasificado, un modelo lento no se come el presupuesto
de los demás y un JSON roto hace pasar al siguiente modelo."""

from types import SimpleNamespace

import pytest

from app.services.simulador import modelo


class ClienteFalso:
    """Imita genai.Client: cada modelo responde con un texto o lanza una excepción."""

    def __init__(self, respuestas):
        self.respuestas = respuestas
        self.llamadas = []
        self.models = SimpleNamespace(generate_content=self._generar)

    def _generar(self, model, contents, config):
        self.llamadas.append((model, config))
        r = self.respuestas[model]
        if callable(r):
            r = r(config)
        if isinstance(r, Exception):
            raise r
        return SimpleNamespace(text=r, usage_metadata=SimpleNamespace(
            prompt_token_count=10, candidates_token_count=5, total_token_count=15))


@pytest.fixture
def sin_openrouter(monkeypatch):
    monkeypatch.setattr(modelo, "_en_pausa_hasta", {})
    monkeypatch.setattr(modelo.openrouter, "is_configured", lambda: False)
    monkeypatch.setenv("AI_AGENT_PROVIDER", "gemini")
    monkeypatch.setattr(modelo.time, "sleep", lambda _s: None)


def _usar(monkeypatch, cliente, modelos):
    monkeypatch.setattr(modelo, "_cliente_gemini", lambda: cliente)
    monkeypatch.setenv("SIMULADOR_MODELOS", ",".join(modelos))


@pytest.mark.parametrize("mensaje, motivo", [
    ("429 RESOURCE_EXHAUSTED quota", "cuota"),
    ("504 DEADLINE_EXCEEDED", "tiempo"),
    ("ReadTimeout: timed out", "tiempo"),
    ("503 UNAVAILABLE high demand", "no_disponible"),
    ("404 NOT_FOUND model", "modelo_inexistente"),
    ("400 INVALID_ARGUMENT", "peticion_invalida"),
    ("403 PERMISSION_DENIED", "credenciales"),
    ("algo raro", "otro"),
])
def test_clasifica_el_motivo_de_cada_falla(mensaje, motivo):
    assert modelo.motivo_de_falla(Exception(mensaje)) == motivo


def test_pasa_al_siguiente_modelo_y_registra_por_que_fallo(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"lento": Exception("504 DEADLINE_EXCEEDED"), "rapido": '{"ok": true}'})
    _usar(monkeypatch, cliente, ["lento", "rapido"])

    r = modelo.llamar_modelo(["prompt"], agente="paciente")

    assert not r.es_mock and r.modelo == "rapido"
    assert [(i["modelo"], i["resultado"]) for i in r.intentos] == [("lento", "tiempo"), ("rapido", "ok")]
    assert r.total_tokens == 15


def test_un_json_roto_hace_probar_el_siguiente_modelo(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"a": "esto no es json", "b": '{"mensaje": "hola"}'})
    _usar(monkeypatch, cliente, ["a", "b"])

    r = modelo.llamar_modelo(["prompt"])

    assert r.modelo == "b"
    assert r.intentos[0]["resultado"] == "formato"


def test_cada_intento_tiene_tiempo_maximo_y_al_menos_10_s(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"a": '{"ok": 1}'})
    _usar(monkeypatch, cliente, ["a"])

    modelo.llamar_modelo(["prompt"], agente="paciente")

    timeout_ms = cliente.llamadas[0][1].http_options.timeout
    assert timeout_ms == modelo.TIEMPOS["paciente"]["intento"] * 1000
    assert timeout_ms >= modelo.MINIMO_POR_INTENTO_S * 1000


def test_si_el_modelo_no_admite_el_razonamiento_bajo_se_reintenta_sin_el(monkeypatch, sin_openrouter):
    def responder(config):
        if config.thinking_config is not None:
            return Exception("400 INVALID_ARGUMENT Thinking level LOW is not supported")
        return '{"ok": true}'

    cliente = ClienteFalso({"a": responder})
    _usar(monkeypatch, cliente, ["a"])

    r = modelo.llamar_modelo(["prompt"])

    assert r.modelo == "a" and len(cliente.llamadas) == 2
    assert [i["resultado"] for i in r.intentos] == ["ok"]


def test_no_prueba_mas_modelos_cuando_se_agota_el_presupuesto(monkeypatch, sin_openrouter):
    reloj = {"t": 0.0}
    monkeypatch.setattr(modelo.time, "perf_counter", lambda: reloj["t"])

    def lento(_config):
        reloj["t"] += 15  # cada intento "tarda" 15 s
        return Exception("504 DEADLINE_EXCEEDED")

    cliente = ClienteFalso({"a": lento, "b": lento, "c": lento})
    _usar(monkeypatch, cliente, ["a", "b", "c"])

    r = modelo.llamar_modelo(["prompt"], agente="paciente")  # presupuesto de 22 s

    assert r.es_mock
    assert [m for m, _ in cliente.llamadas] == ["a"]


def test_sin_proveedor_devuelve_mock_con_el_ultimo_error(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"a": Exception("429 RESOURCE_EXHAUSTED")})
    _usar(monkeypatch, cliente, ["a"])

    r = modelo.llamar_modelo(["prompt"])

    assert r.es_mock and "429" in r.error
    assert r.intentos[0]["resultado"] == "cuota"


def test_la_cadena_por_defecto_no_empieza_por_un_modelo_lento(monkeypatch):
    monkeypatch.delenv("SIMULADOR_MODELOS", raising=False)
    assert modelo.cadena_de_modelos() == modelo.MODELOS_POR_DEFECTO
    assert "gemini-3.8-flash" not in modelo.cadena_de_modelos()


def test_un_modelo_sin_cuota_se_salta_en_las_llamadas_siguientes(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"sin_cuota": Exception("429 RESOURCE_EXHAUSTED"), "libre": '{"ok": true}'})
    _usar(monkeypatch, cliente, ["sin_cuota", "libre"])

    modelo.llamar_modelo(["prompt"], agente="paciente")
    segunda = modelo.llamar_modelo(["prompt"], agente="paciente")

    assert [m for m, _ in cliente.llamadas] == ["sin_cuota", "libre", "libre"]
    assert [i["modelo"] for i in segunda.intentos] == ["libre"]


def test_si_todos_estan_en_pausa_igual_se_prueban(monkeypatch, sin_openrouter):
    cliente = ClienteFalso({"a": '{"ok": true}'})
    _usar(monkeypatch, cliente, ["a"])
    modelo._pausar("a", "cuota")

    assert modelo.llamar_modelo(["prompt"]).modelo == "a"
