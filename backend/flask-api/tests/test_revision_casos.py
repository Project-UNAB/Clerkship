"""Revisión de casos clínicos por expertos: anonimización del caso, concordancia
IA ↔ experto, resultados por criterio y rutas del portal y del administrador.
No escriben en la base: revisiones e invitaciones en memoria, commit fake."""
import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

from app.models import RevisionCaso, ValidacionInvitacion
from app.routes import validacion as validacion_routes
from app.routes.admin_validacion import calcular_resultados_casos
from app.services.revision_casos import CRITERIOS_CASO, concordancia, nombres_a_ocultar, vista_caso

TOKEN = "c" * 32
INV_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
CONSULTA_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


def _consulta(score=70):
    return SimpleNamespace(id=CONSULTA_ID, subtema="Colelitiasis", difficulty="MEDIUM", specialty="Gastroenterología",
                           finished_at=datetime(2026, 10, 19), score=score)


DOC = {
    "case": {
        "subtema": "Colelitiasis",
        "datos_paciente": {"nombre": "Paciente Ficticio", "edad": 45, "sexo": "F", "ocupacion": "Docente",
                           "peso_kg": 70.0, "documento": "123", "telefono": "300", "avatar_url": "x"},
        "examen_fisico": {"signo_murphy": "Positivo", "aspecto_general": "Álgica"},
        "examen_fisico_alterado": {"signo_murphy": "Positivo"},
        "paraclinicos": {"perfil_hepatico": "FA 300"},
        "paraclinicos_alterados": {"perfil_hepatico": "FA 300"},
        "diagnostico_real": "Colecistitis aguda",
        "rubrica_evaluacion": {"preguntas_clave_anamnesis": ["Dolor posprandial"]},
    },
    "chat_history": [
        {"sender": "STUDENT", "content": "Buenas, soy Valentina Ríos, su médica.", "timestamp": "t1"},
        {"sender": "PATIENT", "content": "Me duele aquí.", "timestamp": "t2"},
        {"sender": "STUDENT", "content": "[Exploracion fisica: signo de Murphy]", "timestamp": "t3", "es_exploracion": True},
    ],
    "acciones_clinicas": [{"tipo": "paraclinico", "clave": "perfil_hepatico", "timestamp": "t4"}],
    "ai_evaluation": {"puntaje_global": 70},
    "respuesta_estudiante": {"hipotesis": "Colecistitis (Valentina)", "diferenciales": ["Pancreatitis"], "plan": "Eco"},
}


# ── Anonimización y estadística ──

def test_vista_caso_oculta_al_estudiante_y_los_datos_del_paciente():
    v = vista_caso(_consulta(), DOC, nombres_a_ocultar("Valentina", "Ríos", "vrios"))
    assert v["paciente"] == {"edad": 45, "sexo": "F", "ocupacion": "Docente", "peso_kg": 70.0}
    assert "Valentina" not in v["conversacion"][0]["texto"] and "[Estudiante]" in v["conversacion"][0]["texto"]
    assert v["conversacion"][1]["quien"] == "PACIENTE" and v["conversacion"][2]["exploracion"] is True
    assert "Valentina" not in v["respuesta_estudiante"]["hipotesis"]
    murphy = next(h for h in v["examen_fisico"] if h["clave"] == "signo_murphy")
    assert murphy["alterado"] is True and murphy["etiqueta"] == "Signo de Murphy"
    assert v["acciones"][0]["etiqueta"] == "Perfil hepático"
    assert v["diagnostico_real"] == "Colecistitis aguda" and v["puntaje_ia"] == 70.0
    assert "student_id" not in v and "documento" not in str(v["paciente"])


def test_vista_caso_sin_respuesta_guardada():
    doc = {k: v for k, v in DOC.items() if k != "respuesta_estudiante"}
    assert vista_caso(_consulta(), doc)["respuesta_estudiante"] is None


def test_concordancia_bland_altman_y_pearson():
    r = concordancia([(70, 80), (60, 65), (90, 85)])   # diferencias 10, 5, −5
    assert r["n"] == 3
    assert r["diferencia_media"] == pytest.approx(3.33, abs=0.01)
    assert r["de"] == pytest.approx(7.64, abs=0.01)
    assert r["limite_inferior"] == pytest.approx(3.33 - 1.96 * 7.64, abs=0.05)
    assert r["error_absoluto_medio"] == pytest.approx(6.67, abs=0.01)
    assert r["dentro_10"] == 1 and r["pearson"] > 0.8
    assert concordancia([])["diferencia_media"] is None
    assert concordancia([(50, 60)])["de"] is None


def _revision(**campos):
    base = dict(id=uuid.uuid4(), invitacion_id=INV_ID, consultation_id=CONSULTA_ID, respuestas={}, observaciones={},
                puntaje_experto=None, estado="PENDIENTE", enviada_at=None, created_at=None)
    return RevisionCaso(**{**base, **campos})


def test_resultados_por_criterio_caso_y_concordancia():
    otra = uuid.UUID("33333333-3333-3333-3333-333333333333")
    invitaciones = {INV_ID: SimpleNamespace(etiqueta="Dra. A", estado="EN_CURSO"),
                    otra: SimpleNamespace(etiqueta="Dr. Revocado", estado="REVOCADA")}
    revisiones = [
        _revision(estado="ENVIADA", respuestas={k: 4 for k in CRITERIOS_CASO}, puntaje_experto=80,
                  observaciones={"justicia_puntaje": "Algo estricto"}),
        _revision(invitacion_id=otra, estado="ENVIADA", respuestas={k: 1 for k in CRITERIOS_CASO}, puntaje_experto=10),
        _revision(invitacion_id=uuid.uuid4(), estado="EN_CURSO", respuestas={k: 1 for k in CRITERIOS_CASO}),
    ]
    r = calcular_resultados_casos(revisiones, {CONSULTA_ID: _consulta(70)}, invitaciones)
    assert r["revisiones"] == 1 and r["expertos"] == 1          # la revocada y la no enviada no cuentan
    assert r["criterios"]["items"][0]["v"] == 1
    assert r["casos"][0]["puntaje_expertos"] == 80 and r["casos"][0]["puntaje_ia"] == 70
    assert r["concordancia"]["diferencia_media"] == 10
    assert r["observaciones"]["justicia_puntaje"][0]["caso"] == "Colelitiasis"


# ── Portal del experto ──

@pytest.fixture
def portal(monkeypatch):
    inv = ValidacionInvitacion(id=INV_ID, token=TOKEN, nombre="Dra. A", profesion="Médica", secciones=[],
                               respuestas={}, observaciones={}, enviadas={}, estado="EN_CURSO", anos_experiencia=10,
                               aplicabilidad="APLICABLE", abierta_at=None, completada_at=None,
                               consentimiento_at=datetime(2026, 10, 19))
    rev = _revision()
    ajena = _revision(invitacion_id=uuid.uuid4())
    revisiones = {rev.id: rev, ajena.id: ajena}
    consulta = SimpleNamespace(filter_by=lambda token: SimpleNamespace(first=lambda: inv if token == inv.token else None))
    monkeypatch.setattr(validacion_routes, "ValidacionInvitacion", SimpleNamespace(query=consulta))
    monkeypatch.setattr(validacion_routes, "db", SimpleNamespace(session=SimpleNamespace(
        commit=lambda: None, get=lambda _modelo, rid: revisiones.get(rid))))
    monkeypatch.setattr(validacion_routes, "_casos_de", lambda _inv: [{"estado": rev.estado}])
    monkeypatch.setattr(validacion_routes, "caso_para_revision",
                        lambda _cid: {"diagnostico_real": "X", "evaluacion": {"puntaje_global": 70}, "puntaje_ia": 70.0})
    return SimpleNamespace(inv=inv, rev=rev, ajena=ajena)


def test_el_experto_solo_ve_sus_casos(client, portal):
    base = f"/api/validacion/invitacion/{TOKEN}/casos"
    res = client.get(f"{base}/{portal.rev.id}")
    assert res.status_code == 200 and res.get_json()["caso"]["diagnostico_real"] == "X"
    assert client.get(f"{base}/{portal.ajena.id}").status_code == 404
    assert client.get(f"{base}/no-es-uuid").status_code == 404


def test_revision_de_caso_hasta_enviar_y_bloquea_finalizar(client, portal):
    url = f"/api/validacion/invitacion/{TOKEN}/casos/{portal.rev.id}"
    assert client.put(url, json={"respuestas": {"no_existe": 3}}).status_code == 400
    assert client.put(url, json={"puntaje_experto": 101}).status_code == 400
    # Con el caso pendiente no se puede finalizar.
    assert client.post(f"/api/validacion/invitacion/{TOKEN}/finalizar").status_code == 400
    res = client.put(url, json={"respuestas": {CRITERIOS_CASO[0]: 3}, "observaciones": {"_general": "Bien"}})
    assert res.status_code == 200 and portal.rev.estado == "EN_CURSO"
    assert client.post(f"{url}/enviar").status_code == 400      # faltan criterios
    client.put(url, json={"respuestas": {k: 4 for k in CRITERIOS_CASO}})
    res = client.post(f"{url}/enviar")
    assert res.status_code == 400 and "puntaje" in res.get_json()["message"]
    client.put(url, json={"puntaje_experto": 75})
    assert client.post(f"{url}/enviar").status_code == 200
    assert portal.rev.estado == "ENVIADA" and portal.rev.puntaje_experto == 75
    assert portal.rev.observaciones == {"_general": "Bien"}


# ── Administrador ──

def _cabecera(app, rol):
    with app.app_context():
        token = create_access_token(identity="44444444-4444-4444-4444-444444444444", additional_claims={"role": rol})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.parametrize("metodo,ruta", [
    ("get", "/api/admin/validacion-expertos/casos"),
    ("get", "/api/admin/validacion-expertos/casos/resultados"),
    ("get", f"/api/admin/validacion-expertos/casos/{CONSULTA_ID}"),
    ("post", f"/api/admin/validacion-expertos/casos/{CONSULTA_ID}/asignaciones"),
    ("delete", f"/api/admin/validacion-expertos/revisiones/{CONSULTA_ID}"),
])
def test_solo_el_administrador_asigna_y_ve_casos(app, client, metodo, ruta):
    assert getattr(client, metodo)(ruta).status_code == 401
    assert getattr(client, metodo)(ruta, headers=_cabecera(app, "STUDENT")).status_code == 403


def test_asignar_exige_al_menos_un_experto(app, client):
    res = client.post(f"/api/admin/validacion-expertos/casos/{CONSULTA_ID}/asignaciones",
                      json={"invitaciones": []}, headers=_cabecera(app, "ADMIN"))
    assert res.status_code == 400


def test_puntaje_a_ciegas_antes_de_ver_la_evaluacion(client, portal):
    url = f"/api/validacion/invitacion/{TOKEN}/casos/{portal.rev.id}"
    caso = client.get(url).get_json()["caso"]
    assert caso["evaluacion_oculta"] is True and caso["evaluacion"] is None and caso["puntaje_ia"] is None
    assert client.put(url, json={"puntaje_experto": 60}).status_code == 200
    caso = client.get(url).get_json()["caso"]
    assert caso["evaluacion_oculta"] is False and caso["puntaje_ia"] == 70.0
    # Ya vista la evaluación, el puntaje no cambia (reenviar el mismo valor sí se acepta).
    assert client.put(url, json={"puntaje_experto": 90}).status_code == 409
    assert client.put(url, json={"puntaje_experto": 60, "respuestas": {CRITERIOS_CASO[0]: 2}}).status_code == 200
    assert portal.rev.puntaje_experto == 60
