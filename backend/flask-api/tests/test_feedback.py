"""Formularios de retroalimentación por pestaña: validación y autenticación.

No escriben en la base: las respuestas inválidas se rechazan antes de guardar.
"""
import pytest
from flask_jwt_extended import create_access_token

def _completo(claves):
    return {clave: 4 for clave in claves}


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
def test_feedback_rechaza_campo_faltante(client, headers, pestana):
    body = dict(PESTANAS[pestana])
    body.pop(next(iter(body)))
    res = client.post(f"/api/feedback/{pestana}", json=body, headers=headers)
    assert res.status_code == 400


def test_feedback_rechaza_comentario_demasiado_largo(client, headers):
    body = dict(PESTANAS["inicio"], comentario="x" * 1001)
    res = client.post("/api/feedback/inicio", json=body, headers=headers)
    assert res.status_code == 400
