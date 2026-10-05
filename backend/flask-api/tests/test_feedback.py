"""Formularios de retroalimentación por pestaña: validación y autenticación.

No escriben en la base: las respuestas inválidas se rechazan antes de guardar.
"""
import pytest
from flask_jwt_extended import create_access_token

PESTANAS = {
    "inicio": {"claridad_navegacion": 4, "informacion_util": 5, "accesos_rapidos": 3},
    "casos": {"realismo_caso": 4, "calidad_paciente_virtual": 5, "claridad_instrucciones": 4, "dificultad_percibida": 3},
    "historial": {"claridad_puntajes": 4, "utilidad_recomendacion": 5, "facilidad_revision": 4},
    "biblioteca": {"calidad_contenido": 4, "facilidad_busqueda": 3, "utilidad_recursos": 5},
}


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
