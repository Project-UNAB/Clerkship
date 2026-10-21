"""Formularios de retroalimentación por pestaña: validación y autenticación.

No escriben en la base: las respuestas inválidas se rechazan antes de guardar.
"""
import pytest
from flask_jwt_extended import create_access_token

def _completo(claves):
    return {"id_usuario": "U00123456", **{clave: 4 for clave in claves}}


PESTANAS = {
    "inicio": _completo([
        "claridad_navegacion", "informacion_util", "accesos_rapidos", "velocidad_carga",
        "diseno_visual", "legibilidad_textos", "orden_menus", "facilidad_uso_movil",
        "confianza_plataforma", "claridad_mensajes", "utilidad_avisos", "recomendaria_plataforma",
    ]),
    "casos": _completo([
        "realismo_caso", "calidad_paciente_virtual", "claridad_instrucciones", "dificultad_percibida",
        "coherencia_sintomas", "coherencia_examenes", "utilidad_educativa", "retroalimentacion_clara",
        "tiempo_adecuado", "variedad_casos", "realismo_examenes", "satisfaccion_general",
    ]),
    "historial": _completo([
        "claridad_puntajes", "utilidad_recomendacion", "facilidad_revision", "detalle_evaluacion",
        "comprension_dimensiones", "progreso_visible", "utilidad_para_estudiar", "filtros_utiles",
        "exportacion_util", "satisfaccion_general",
    ]),
    "biblioteca": _completo([
        "calidad_contenido", "facilidad_busqueda", "utilidad_recursos", "actualidad_contenido",
        "claridad_descripciones", "variedad_recursos", "facilidad_descarga", "organizacion_por_temas",
        "calidad_lectura", "utilidad_para_estudio", "satisfaccion_general",
    ]),
}


def test_feedback_acepta_formulario_completo(client, headers, monkeypatch):
    """Con el payload completo la validación pasa; se simula la escritura para no tocar la base."""
    from app.routes import feedback as feedback_routes
    guardados = []
    monkeypatch.setattr(feedback_routes, "_guardar", lambda modelo, body: guardados.append(body) or ({"ok": True}, 201))
    for pestana, body in PESTANAS.items():
        res = client.post(f"/api/feedback/{pestana}", json=body, headers=headers)
        assert res.status_code == 201
    assert len(guardados) == 4


@pytest.fixture
def headers(app):
    with app.app_context():
        token = create_access_token(
            identity="11111111-1111-1111-1111-111111111111",
            additional_claims={"role": "STUDENT"},
        )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("pestana", PESTANAS)
def test_feedback_requiere_sesion(client, pestana):
    res = client.post(f"/api/feedback/{pestana}", json=PESTANAS[pestana])
    assert res.status_code == 401


@pytest.mark.parametrize("pestana", PESTANAS)
def test_feedback_rechaza_calificacion_fuera_de_rango(client, headers, pestana):
    body = dict(PESTANAS[pestana])
    primera = next(iter(body))
    body[primera] = 6
    res = client.post(f"/api/feedback/{pestana}", json=body, headers=headers)
    assert res.status_code == 400


@pytest.mark.parametrize("pestana", PESTANAS)
def test_feedback_rechaza_pregunta_sin_responder(client, headers, pestana):
    body = dict(PESTANAS[pestana])
    body.pop(next(k for k in body if k != "id_usuario"))
    res = client.post(f"/api/feedback/{pestana}", json=body, headers=headers)
    assert res.status_code == 400


def test_feedback_ya_no_exige_escribir_el_id(client, headers, monkeypatch):
    """El ID se toma de la sesión: sin id_usuario la validación pasa."""
    from app.routes import feedback as feedback_routes
    monkeypatch.setattr(feedback_routes, "_guardar", lambda modelo, body: ({"ok": True}, 201))
    body = dict(PESTANAS["inicio"])
    body.pop("id_usuario")
    res = client.post("/api/feedback/inicio", json=body, headers=headers)
    assert res.status_code == 201


def test_feedback_rechaza_id_demasiado_corto(client, headers):
    body = dict(PESTANAS["inicio"], id_usuario="A")
    res = client.post("/api/feedback/inicio", json=body, headers=headers)
    assert res.status_code == 400


def test_feedback_rechaza_comentario_demasiado_largo(client, headers):
    body = dict(PESTANAS["inicio"], comentario="x" * 1001)
    res = client.post("/api/feedback/inicio", json=body, headers=headers)
    assert res.status_code == 400


# ── Una respuesta por usuario y pestaña, «mi respuesta» y el resumen del admin ──
from datetime import datetime
from types import SimpleNamespace


def _modelo_falso(filas):
    class Modelo:
        created_at = SimpleNamespace(desc=lambda: None)
        __table__ = SimpleNamespace(columns=[SimpleNamespace(name=n) for n in
                                             ("id", "user_id", "id_usuario", "claridad_navegacion", "informacion_util", "comentario", "created_at")])

        class query:
            @staticmethod
            def filter_by(user_id):
                propias = [f for f in filas if f.user_id == user_id]
                return SimpleNamespace(order_by=lambda *_a: SimpleNamespace(first=lambda: propias[0] if propias else None))

        def __init__(self, **campos):
            filas.append(SimpleNamespace(created_at=datetime(2026, 10, 19), **campos))

    return Modelo


def test_responder_dos_veces_actualiza_y_toma_el_usuario_de_la_sesion(app, client, headers, monkeypatch):
    from app.routes import feedback as feedback_routes
    filas = []
    modelo = _modelo_falso(filas)
    monkeypatch.setattr(feedback_routes, "MODELOS", {"inicio": modelo})
    monkeypatch.setattr(feedback_routes, "FeedbackInicio", modelo)
    monkeypatch.setattr(feedback_routes, "User", SimpleNamespace(query=SimpleNamespace(get=lambda _id: SimpleNamespace(username="ana.rios"))))
    monkeypatch.setattr(feedback_routes, "func", SimpleNamespace(now=lambda: datetime(2026, 10, 20)))
    monkeypatch.setattr(feedback_routes, "db", SimpleNamespace(session=SimpleNamespace(add=lambda _f: None, commit=lambda: None)))

    cuerpo = {k: v for k, v in PESTANAS["inicio"].items() if k != "id_usuario"}
    res = client.post("/api/feedback/inicio", json=cuerpo, headers=headers)
    assert res.status_code == 201 and len(filas) == 1
    assert filas[0].id_usuario == "ana.rios"

    res = client.post("/api/feedback/inicio", json={**cuerpo, "claridad_navegacion": 2}, headers=headers)
    assert res.status_code == 200 and res.get_json()["actualizada"] is True
    assert len(filas) == 1 and filas[0].claridad_navegacion == 2

    mia = client.get("/api/feedback/inicio/mia", headers=headers).get_json()["respuesta"]
    assert mia["respuestas"]["claridad_navegacion"] == 2


def test_mi_respuesta_sin_responder_es_nula_y_pestana_invalida_404(client, headers, monkeypatch):
    from app.routes import feedback as feedback_routes
    monkeypatch.setattr(feedback_routes, "MODELOS", {"inicio": _modelo_falso([])})
    assert client.get("/api/feedback/inicio/mia", headers=headers).get_json() == {"respuesta": None}
    assert client.get("/api/feedback/otra/mia", headers=headers).status_code == 404


def test_resumen_de_opinion_promedia_y_distribuye():
    from app.routes.admin import resumir_opinion
    filas = [
        SimpleNamespace(a=5, b=4, comentario="Muy bien", id_usuario="u1", created_at=datetime(2026, 10, 1)),
        SimpleNamespace(a=3, b=4, comentario="", id_usuario="u2", created_at=datetime(2026, 10, 2)),
        SimpleNamespace(a=4, b=None, comentario="Mejorar móvil", id_usuario="u3", created_at=datetime(2026, 10, 3)),
    ]
    r = resumir_opinion(["a", "b"], filas)
    assert r["total"] == 3
    assert r["preguntas"][0] == {"key": "a", "promedio": 4.0, "distribucion": {"1": 0, "2": 0, "3": 1, "4": 1, "5": 1}, "respuestas": 3}
    assert r["preguntas"][1]["promedio"] == 4.0 and r["preguntas"][1]["respuestas"] == 2
    assert r["promedio_general"] == 4.0
    assert [c["texto"] for c in r["comentarios"]] == ["Mejorar móvil", "Muy bien"]
