"""Validación por expertos con enlace personal: estadística (V de Aiken, I-CVI,
kappa, S-CVI), portal del experto y permisos del administrador.
No escriben en la base: la invitación es un objeto en memoria y el commit es un fake."""
from datetime import datetime
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

from app.models import ValidacionInvitacion
from app.routes import validacion as validacion_routes
from app.routes.admin_validacion import calcular_resultados
from app.services.validez_contenido import aiken, icvi, resumen_seccion

TOKEN = "t" * 32


# ── Estadística ──

def test_aiken_v_y_su_intervalo():
    r = aiken([4, 4, 3, 4, 3])                      # S = 13, n·(c−1) = 15
    assert r["v"] == pytest.approx(0.867, abs=1e-3)
    assert r["ic_inferior"] < r["v"] < r["ic_superior"] <= 1
    todos = aiken([4] * 5)
    assert todos["v"] == 1 and todos["ic_superior"] == 1
    assert todos["ic_inferior"] == pytest.approx(0.796, abs=1e-3)  # Penfield y Giacobbi con nk = 15
    assert aiken([1, 1])["v"] == 0
    assert aiken([]) == {"v": None, "ic_inferior": None, "ic_superior": None}


def test_icvi_y_kappa_modificado():
    r = icvi([4, 4, 3, 2])                          # 3 de 4 califican 3 o 4
    assert r["i_cvi"] == 0.75
    assert r["kappa"] == pytest.approx(0.667, abs=1e-3)  # pc = C(4,3)·0,5⁴ = 0,25
    assert icvi([4, 4, 4])["i_cvi"] == 1


def test_resumen_de_seccion():
    r = resumen_seccion({"a": [4, 4, 4], "b": [4, 2, 3], "c": []})
    assert [i["key"] for i in r["items"]] == ["a", "b", "c"]
    assert r["items"][1]["distribucion"] == {"1": 0, "2": 1, "3": 1, "4": 1}
    assert r["items"][2]["n"] == 0 and r["items"][2]["v"] is None
    assert r["s_cvi_ave"] == pytest.approx((1 + 2 / 3) / 2, abs=1e-3)
    assert r["s_cvi_ua"] == 0.5
    assert r["expertos"] == 3


def _invitacion(**campos):
    base = dict(id="11111111-1111-1111-1111-111111111111", token=TOKEN, nombre="Dra. Prueba", profesion="Médica",
                secciones=["inicio", "casos"], respuestas={}, observaciones={}, enviadas={}, estado="PENDIENTE",
                anos_experiencia=None, consentimiento_at=None, aplicabilidad=None, abierta_at=None, completada_at=None)
    return ValidacionInvitacion(**{**base, **campos})


def test_resultados_solo_cuentan_secciones_enviadas_y_no_revocadas():
    items = validacion_routes.items_de("inicio")
    enviada = _invitacion(respuestas={"inicio": {k: 4 for k in items}, "casos": {"pertinencia_clinica": 1}},
                          observaciones={"inicio": {items[0]: "Ajustar el contraste"}},
                          enviadas={"inicio": "2026-10-19"}, aplicabilidad="APLICABLE", estado="COMPLETADA")
    revocada = _invitacion(id="22222222-2222-2222-2222-222222222222", estado="REVOCADA",
                           respuestas={"inicio": {k: 1 for k in items}}, enviadas={"inicio": "2026-10-19"})
    abierto = SimpleNamespace(id="x", nombre_experto="Dr. Abierto", id_experto="RM-1", profesion="Médico",
                              especialidad=None, anos_experiencia=10, comentario="Bien", created_at=datetime(2026, 10, 1),
                              **{k: 3 for k in items})
    r = calcular_resultados([enviada, revocada], {"inicio": [abierto]})

    assert [e["origen"] for e in r["expertos"]] == ["invitacion", "formulario"]
    inicio = r["secciones"]["inicio"]
    assert inicio["expertos"] == 2
    assert inicio["items"][0]["distribucion"] == {"1": 0, "2": 0, "3": 1, "4": 1}
    assert inicio["observaciones"][items[0]][0]["texto"] == "Ajustar el contraste"
    assert inicio["observaciones"]["_general"][0]["texto"] == "Bien"
    assert r["secciones"]["casos"]["expertos"] == 0   # casos no se envió
    assert r["aplicabilidad"]["APLICABLE"] == 1


# ── Portal del experto (ruta pública) ──

@pytest.fixture
def invitacion(monkeypatch):
    inv = _invitacion()
    consulta = SimpleNamespace(filter_by=lambda token: SimpleNamespace(first=lambda: inv if token == inv.token else None))
    monkeypatch.setattr(validacion_routes, "ValidacionInvitacion", SimpleNamespace(query=consulta))
    monkeypatch.setattr(validacion_routes, "db", SimpleNamespace(session=SimpleNamespace(commit=lambda: None)))
    monkeypatch.setattr(validacion_routes, "_casos_de", lambda _inv: [])
    return inv


def test_enlace_inexistente_o_revocado_responde_404(client, invitacion):
    assert client.get("/api/validacion/invitacion/" + "x" * 32).status_code == 404
    invitacion.estado = "REVOCADA"
    assert client.get(f"/api/validacion/invitacion/{TOKEN}").status_code == 404


def test_abrir_el_enlace_registra_la_apertura_sin_sesion(client, invitacion):
    res = client.get(f"/api/validacion/invitacion/{TOKEN}")
    assert res.status_code == 200
    datos = res.get_json()
    assert datos["experto"]["nombre"] == "Dra. Prueba" and datos["secciones"] == ["inicio", "casos"]
    assert "token" not in datos
    assert invitacion.abierta_at is not None
    assert "aceptar el consentimiento" in datos["faltantes"]


def test_autoguardado_mezcla_y_rechaza_items_ajenos(client, invitacion):
    url = f"/api/validacion/invitacion/{TOKEN}/secciones/inicio"
    items = validacion_routes.items_de("inicio")
    assert client.put(url, json={"respuestas": {items[0]: 4}}).status_code == 200
    res = client.put(url, json={"respuestas": {items[1]: 2}, "observaciones": {items[1]: "Mejorar", "_general": "  "}})
    assert res.status_code == 200
    assert invitacion.respuestas["inicio"] == {items[0]: 4, items[1]: 2}
    assert invitacion.observaciones["inicio"] == {items[1]: "Mejorar"}
    assert invitacion.estado == "EN_CURSO"
    assert client.put(url, json={"respuestas": {"no_existe": 3}}).status_code == 400
    assert client.put(url, json={"respuestas": {items[0]: 5}}).status_code == 400
    assert client.put(f"/api/validacion/invitacion/{TOKEN}/secciones/biblioteca", json={}).status_code == 404


def test_flujo_completo_hasta_finalizar(client, invitacion):
    base = f"/api/validacion/invitacion/{TOKEN}"
    assert client.post(f"{base}/secciones/inicio/enviar").status_code == 400   # sin calificar
    assert client.post(f"{base}/finalizar").status_code == 400
    for s in ("inicio", "casos"):
        client.put(f"{base}/secciones/{s}", json={"respuestas": {k: 4 for k in validacion_routes.items_de(s)}})
        assert client.post(f"{base}/secciones/{s}/enviar").status_code == 200
    res = client.patch(base, json={"consentimiento": True, "anos_experiencia": 12, "aplicabilidad": "APLICABLE_CON_CAMBIOS"})
    assert res.get_json()["faltantes"] == ["escribir tu ID (documento o registro profesional)"]
    res = client.patch(base, json={"registro_profesional": "RM-4455"})
    assert res.get_json()["faltantes"] == []
    res = client.post(f"{base}/finalizar")
    assert res.status_code == 200 and res.get_json()["estado"] == "COMPLETADA"
    # Ya finalizada, queda de solo lectura.
    assert client.put(f"{base}/secciones/inicio", json={"respuestas": {}}).status_code == 409
    assert client.get(base).status_code == 200


# ── Administrador ──

def _cabecera(app, rol):
    with app.app_context():
        token = create_access_token(identity="33333333-3333-3333-3333-333333333333", additional_claims={"role": rol})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("metodo,ruta", [
    ("get", "/api/admin/validacion-expertos/invitaciones"),
    ("post", "/api/admin/validacion-expertos/invitaciones"),
    ("get", "/api/admin/validacion-expertos/resultados"),
    ("delete", "/api/admin/validacion-expertos/invitaciones/11111111-1111-1111-1111-111111111111"),
])
def test_solo_el_administrador_gestiona_invitaciones(app, client, metodo, ruta):
    assert getattr(client, metodo)(ruta).status_code == 401
    assert getattr(client, metodo)(ruta, headers=_cabecera(app, "TEACHER")).status_code == 403


def test_crear_invitacion_valida_secciones(app, client):
    h = _cabecera(app, "ADMIN")
    url = "/api/admin/validacion-expertos/invitaciones"
    assert client.post(url, json={"nombre": "Dr. X", "profesion": "Médico", "registro_profesional": "RM-1",
                                  "secciones": ["otra"]}, headers=h).status_code == 400
    assert client.post(url, json={"nombre": "Dr. X", "profesion": "Médico", "secciones": ["inicio"],
                                  "email": "no-es-correo"}, headers=h).status_code == 400


# ── El ID es obligatorio; el nombre, opcional ──

def test_invitar_exige_el_id_y_no_el_nombre(app, client, monkeypatch):
    from app.routes import admin_validacion
    h = _cabecera(app, "ADMIN")
    url = "/api/admin/validacion-expertos/invitaciones"
    assert client.post(url, json={"nombre": "Dr. X", "profesion": "Médico"}, headers=h).status_code == 400
    creadas = []
    monkeypatch.setattr(admin_validacion, "db", SimpleNamespace(session=SimpleNamespace(add=creadas.append, commit=lambda: None)))
    monkeypatch.setattr(admin_validacion, "get_current_user", lambda: SimpleNamespace(id=None))
    res = client.post(url, json={"nombre": "", "profesion": "Médico", "registro_profesional": "  RM-778 "}, headers=h)
    assert res.status_code == 201
    assert creadas[0].nombre is None and creadas[0].registro_profesional == "RM-778"
    assert creadas[0].etiqueta == "ID RM-778"


def test_el_experto_puede_borrar_su_nombre_pero_no_su_id(client, invitacion):
    base = f"/api/validacion/invitacion/{TOKEN}"
    client.patch(base, json={"nombre": ""})
    assert invitacion.nombre == "Dra. Prueba"                       # sin ID no se queda sin identificar
    client.patch(base, json={"registro_profesional": "CC-123", "nombre": ""})
    assert invitacion.nombre is None and invitacion.registro_profesional == "CC-123"
    client.patch(base, json={"registro_profesional": ""})
    assert invitacion.registro_profesional == "CC-123"
    assert client.get(base).get_json()["experto"]["etiqueta"] == "ID CC-123"
