"""Validación por expertos: ruta pública, escala 1 a 4 y datos del experto obligatorios.
No escribe en la base: el guardado se reemplaza por un fake."""
import pytest

from app.routes import validacion as validacion_routes

EXPERTO = {
    "nombre_experto": "Dra. Prueba Experta",
    "id_experto": "RM-123456",
    "profesion": "Médica gastroenteróloga",
    "anos_experiencia": 12,
    "especialidad": "Gastroenterología",
    "comentario": "Sin observaciones.",
}

ITEMS = {
    "inicio": ["claridad_informacion", "pertinencia_informacion", "organizacion_visual", "jerarquia_navegacion",
               "accesibilidad", "coherencia_terminologia", "suficiencia_accesos", "utilidad_general"],
    "casos": ["pertinencia_clinica", "redaccion_clara", "coherencia_diagnostica", "coherencia_examenes",
              "realismo_paciente", "dificultad_adecuada", "utilidad_formativa", "suficiencia_contenido"],
    "historial": ["claridad_puntajes", "pertinencia_evaluacion", "retroalimentacion_util", "coherencia_dimensiones",
                  "suficiencia_informacion", "utilidad_formativa", "comprension_estudiante", "presentacion"],
    "biblioteca": ["pertinencia_recursos", "actualidad_fuentes", "calidad_fuentes", "claridad_descripcion",
                   "organizacion_contenido", "suficiencia_recursos", "utilidad_formativa", "accesibilidad_archivos"],
}


def _cuerpo(pestana, valor=3):
    return {**EXPERTO, **{k: valor for k in ITEMS[pestana]}}


@pytest.fixture
def guardados(monkeypatch):
    lista = []
    monkeypatch.setattr(validacion_routes, "_guardar", lambda modelo, body: lista.append(body) or ({"ok": True}, 201))
    return lista


@pytest.mark.parametrize("pestana", ITEMS)
def test_validacion_es_publica_y_acepta_envio_completo(client, guardados, pestana):
    res = client.post(f"/api/validacion/{pestana}", json=_cuerpo(pestana))
    assert res.status_code == 201
    assert len(guardados) == 1


@pytest.mark.parametrize("pestana", ITEMS)
def test_validacion_rechaza_escala_fuera_de_1_a_4(client, guardados, pestana):
    body = _cuerpo(pestana)
    body[ITEMS[pestana][0]] = 5
    res = client.post(f"/api/validacion/{pestana}", json=body)
    assert res.status_code == 400
    assert guardados == []


@pytest.mark.parametrize("pestana", ITEMS)
def test_validacion_exige_datos_del_experto(client, guardados, pestana):
    body = _cuerpo(pestana)
    body.pop("id_experto")
    res = client.post(f"/api/validacion/{pestana}", json=body)
    assert res.status_code == 400
    assert guardados == []


def test_validacion_rechaza_anos_negativos(client, guardados):
    body = _cuerpo("casos", valor=2)
    body["anos_experiencia"] = -1
    res = client.post("/api/validacion/casos", json=body)
    assert res.status_code == 400
