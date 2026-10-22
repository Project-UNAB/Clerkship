"""Comentarios privados de las tareas: un hilo por estudiante con el docente.
No escriben en la base: el contexto (curso, tarea, permisos) y el commit son fakes."""
import uuid
from datetime import datetime
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

from app.models import AssignmentComment
from app.routes import curso_tarea_comentarios as rutas

CURSO, BLOQUE, ITEM = (uuid.UUID(int=1), uuid.UUID(int=2), uuid.UUID(int=3))
ESTUDIANTE, OTRO, DOCENTE = (uuid.UUID(int=10), uuid.UUID(int=11), uuid.UUID(int=20))
URL = f"/api/cursos/{CURSO}/bloques/{BLOQUE}/contenido/{ITEM}/comentarios"


def _token(app, user_id, rol):
    with app.app_context():
        return {"Authorization": f"Bearer {create_access_token(identity=str(user_id), additional_claims={'role': rol})}"}


@pytest.fixture
def mundo(monkeypatch):
    """Curso con un docente y dos estudiantes matriculados; hilos en memoria."""
    guardados = []
    estado = SimpleNamespace(usuario=None, guardados=guardados)
    usuarios = {
        ESTUDIANTE: SimpleNamespace(id=ESTUDIANTE, role="STUDENT", first_name="Ana", last_name="Ríos", username="ana", avatar_svg=None),
        OTRO: SimpleNamespace(id=OTRO, role="STUDENT", first_name="Luis", last_name="Paz", username="luis", avatar_svg=None),
        DOCENTE: SimpleNamespace(id=DOCENTE, role="TEACHER", first_name="Prof", last_name="X", username="prof", avatar_svg=None),
    }
    curso = SimpleNamespace(id=CURSO, teacher_id=DOCENTE)
    monkeypatch.setattr(rutas, "get_current_user", lambda: estado.usuario)
    monkeypatch.setattr(rutas, "_curso_o_404", lambda _c: (curso, None))
    monkeypatch.setattr(rutas, "_tarea_o_404", lambda *_a: (SimpleNamespace(id=ITEM), None))
    monkeypatch.setattr(rutas, "_es_docente_dueno", lambda u, c: u.id == DOCENTE)
    monkeypatch.setattr(rutas, "_es_estudiante_matriculado", lambda u, c: u.id in (ESTUDIANTE, OTRO))
    monkeypatch.setattr(rutas, "_matriculado", lambda c, s: s in (ESTUDIANTE, OTRO))

    def hilo(item_id, student_id, yo):
        return [c.to_dict(usuarios[c.author_id], yo) for c in guardados if c.student_id == student_id]

    def add(c):
        c.id = c.id or uuid.uuid4()
        c.created_at = datetime(2026, 10, 21, 12, len(guardados))
        guardados.append(c)

    class ComentarioFalso:
        """Como AssignmentComment, sin tocar la base."""
        to_dict = AssignmentComment.to_dict

        def __init__(self, **campos):
            self.id = None
            self.__dict__.update(campos)

        class query:
            @staticmethod
            def filter_by(id, item_id):
                return SimpleNamespace(first=lambda: next((c for c in guardados if c.id == id), None))

    monkeypatch.setattr(rutas, "_hilo", hilo)
    monkeypatch.setattr(rutas, "db", SimpleNamespace(session=SimpleNamespace(
        add=add, commit=lambda: None, delete=lambda c: guardados.remove(c))))
    monkeypatch.setattr(rutas, "AssignmentComment", ComentarioFalso)
    estado.usuarios = usuarios
    return estado


def test_el_estudiante_escribe_en_su_hilo_sin_haber_entregado(app, client, mundo):
    mundo.usuario = mundo.usuarios[ESTUDIANTE]
    h = _token(app, ESTUDIANTE, "STUDENT")
    res = client.post(URL, json={"body": "  ¿El informe va en PDF?  "}, headers=h)
    assert res.status_code == 201
    c = res.get_json()["comentario"]
    assert c["body"] == "¿El informe va en PDF?" and c["es_mio"] is True and c["author_name"] == "Ana Ríos"
    # Aunque mande otro estudiante_id, el hilo es el suyo.
    client.post(URL, json={"body": "Otra duda", "estudiante_id": str(OTRO)}, headers=h)
    assert all(g.student_id == ESTUDIANTE for g in mundo.guardados)
    assert len(client.get(URL, headers=h).get_json()["comentarios"]) == 2


def test_el_docente_responde_en_el_hilo_de_un_estudiante(app, client, mundo):
    mundo.usuario = mundo.usuarios[DOCENTE]
    h = _token(app, DOCENTE, "TEACHER")
    assert client.post(URL, json={"body": "Hola"}, headers=h).status_code == 400          # falta el hilo
    assert client.post(URL, json={"body": "Hola", "estudiante_id": str(uuid.UUID(int=99))}, headers=h).status_code == 404
    res = client.post(URL, json={"body": "Sí, en PDF.", "estudiante_id": str(ESTUDIANTE)}, headers=h)
    assert res.status_code == 201 and mundo.guardados[0].student_id == ESTUDIANTE
    hilo = client.get(f"{URL}?estudiante={ESTUDIANTE}", headers=h).get_json()["comentarios"]
    assert hilo[0]["author_role"] == "TEACHER"


def test_un_estudiante_no_borra_comentarios_ajenos(app, client, mundo):
    mundo.usuario = mundo.usuarios[DOCENTE]
    client.post(URL, json={"body": "Mensaje del docente", "estudiante_id": str(ESTUDIANTE)}, headers=_token(app, DOCENTE, "TEACHER"))
    cid = mundo.guardados[0].id
    mundo.usuario = mundo.usuarios[ESTUDIANTE]
    assert client.delete(f"{URL}/{cid}", headers=_token(app, ESTUDIANTE, "STUDENT")).status_code == 403
    mundo.usuario = mundo.usuarios[OTRO]
    assert client.delete(f"{URL}/{cid}", headers=_token(app, OTRO, "STUDENT")).status_code == 404   # otro hilo
    mundo.usuario = mundo.usuarios[DOCENTE]
    assert client.delete(f"{URL}/{cid}", headers=_token(app, DOCENTE, "TEACHER")).status_code == 200
    assert mundo.guardados == []


def test_comentario_vacio_o_largo_se_rechaza(app, client, mundo):
    mundo.usuario = mundo.usuarios[ESTUDIANTE]
    h = _token(app, ESTUDIANTE, "STUDENT")
    assert client.post(URL, json={"body": ""}, headers=h).status_code == 400
    assert client.post(URL, json={"body": "x" * 2001}, headers=h).status_code == 400


def test_sin_sesion_no_hay_comentarios(client):
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={"body": "hola"}).status_code == 401
