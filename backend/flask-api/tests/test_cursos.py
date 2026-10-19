"""Cursos: solo el docente dueño ve el roster o puede borrar su curso."""
import uuid
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.cursos as cursos_routes


def _token(app, role, identity="11111111-1111-1111-1111-111111111111"):
    with app.app_context():
        return create_access_token(identity=identity, additional_claims={"role": role})


def test_listar_estudiantes_requiere_sesion(client):
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes")
    assert res.status_code == 401


def test_listar_estudiantes_rechaza_rol_estudiante(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", headers=headers)
    assert res.status_code == 403


def test_listar_estudiantes_curso_inexistente_da_404(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: None))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.get("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", headers=headers)
    assert res.status_code == 404


def test_listar_estudiantes_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    otro_docente_id = uuid.uuid4()
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=otro_docente_id)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.get(f"/api/cursos/{curso_falso.id}/estudiantes", headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_requiere_sesion(client):
    res = client.post("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", json={"email": "x@x.com"})
    assert res.status_code == 401


def test_agregar_estudiante_rechaza_rol_estudiante(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.post("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes", json={"email": "x@x.com"}, headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.post(f"/api/cursos/{curso_falso.id}/estudiantes", json={"email": "x@x.com"}, headers=headers)
    assert res.status_code == 403


def test_agregar_estudiante_con_correo_inexistente_da_404(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes.User, "query", SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(first=lambda: None)))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}
    res = client.post(f"/api/cursos/{curso.id}/estudiantes", json={"email": "nadie@clerk-ship.online"}, headers=headers)
    assert res.status_code == 404


def test_quitar_estudiante_requiere_sesion(client):
    res = client.delete("/api/cursos/11111111-1111-1111-1111-111111111111/estudiantes/22222222-2222-2222-2222-222222222222")
    assert res.status_code == 401


def test_quitar_estudiante_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.delete(f"/api/cursos/{curso_falso.id}/estudiantes/22222222-2222-2222-2222-222222222222", headers=headers)
    assert res.status_code == 403


def test_borrar_curso_requiere_sesion(client):
    res = client.delete("/api/cursos/11111111-1111-1111-1111-111111111111")
    assert res.status_code == 401


def test_borrar_curso_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4()))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.delete(f"/api/cursos/{curso_falso.id}", headers=headers)
    assert res.status_code == 403


def test_actualizar_curso_requiere_sesion(client):
    res = client.patch("/api/cursos/11111111-1111-1111-1111-111111111111", json={"name": "Nuevo"})
    assert res.status_code == 401


def test_actualizar_curso_rechaza_rol_estudiante(app, client):
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.patch("/api/cursos/11111111-1111-1111-1111-111111111111", json={"name": "Nuevo"}, headers=headers)
    assert res.status_code == 403


def test_mis_fechas_requiere_sesion(client):
    res = client.get("/api/cursos/mis-fechas")
    assert res.status_code == 401


def test_mis_fechas_devuelve_lista_vacia_sin_cursos(app, client, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="STUDENT"))
        monkeypatch.setattr(
            cursos_routes.StudentCourse, "query",
            SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(all=lambda: [])),
        )
    headers = {"Authorization": f"Bearer {_token(app, 'STUDENT')}"}
    res = client.get("/api/cursos/mis-fechas", headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {"fechas": []}


def test_mis_fechas_devuelve_items_con_due_at(app, client, monkeypatch):
    from datetime import datetime, timezone
    docente_id = uuid.uuid4()
    curso_id = uuid.uuid4()
    curso = SimpleNamespace(id=curso_id, teacher_id=docente_id, name="Gastro I")
    bloque_id = uuid.uuid4()
    bloque = SimpleNamespace(id=bloque_id, course_id=curso_id)
    due = datetime(2026, 11, 15, 23, 59, tzinfo=timezone.utc)
    item = SimpleNamespace(id=uuid.uuid4(), block_id=bloque_id, title="Caso 1", type="ASSIGNMENT", due_at=due, open_at=None)

    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(
            cursos_routes.Course, "query",
            SimpleNamespace(
                filter_by=lambda **kw: SimpleNamespace(all=lambda: [curso]),
                filter=lambda *a: SimpleNamespace(all=lambda: [curso]),
            ),
        )
        monkeypatch.setattr(
            cursos_routes.CourseBlock, "query",
            SimpleNamespace(filter=lambda *a: SimpleNamespace(all=lambda: [bloque])),
        )
        monkeypatch.setattr(
            cursos_routes.CourseContentItem, "query",
            SimpleNamespace(
                join=lambda *a: SimpleNamespace(
                    filter=lambda *a2: SimpleNamespace(
                        order_by=lambda *a3: SimpleNamespace(all=lambda: [item])
                    )
                )
            ),
        )

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}
    res = client.get("/api/cursos/mis-fechas", headers=headers)
    assert res.status_code == 200
    body = res.get_json()
    assert len(body["fechas"]) == 1
    fecha = body["fechas"][0]
    assert fecha["title"] == "Caso 1"
    assert fecha["type"] == "ASSIGNMENT"
    assert fecha["course_name"] == "Gastro I"
    assert "2026-11-15" in fecha["due_at"]


def test_actualizar_curso_rechaza_docente_que_no_es_dueno(app, client, monkeypatch):
    curso_falso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=uuid.uuid4(), role="TEACHER"))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso_falso))
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER')}"}
    res = client.patch(f"/api/cursos/{curso_falso.id}", json={"name": "Nuevo"}, headers=headers)
    assert res.status_code == 403


def test_actualizar_curso_exitoso_sanitiza_descripcion(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(
        id=uuid.uuid4(), teacher_id=docente_id, name="Viejo", description=None, academic_period=None, cover_image_key=None,
    )
    curso.to_dict = lambda: {
        "id": str(curso.id), "teacher_id": str(curso.teacher_id),
        "name": curso.name, "description": curso.description, "academic_period": curso.academic_period,
    }
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes.db.session, "commit", lambda: None)

    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}
    res = client.patch(
        f"/api/cursos/{curso.id}",
        json={
            "name": "Proyecto de Grado II",
            "description": "<p>Bienvenida</p><script>alert(1)</script>",
            "academic_period": "2026-2",
        },
        headers=headers,
    )
    assert res.status_code == 200
    body = res.get_json()
    assert body["name"] == "Proyecto de Grado II"
    assert "<script>" not in body["description"]
    assert "<p>Bienvenida</p>" in body["description"]
    assert body["academic_period"] == "2026-2"


def test_el_correo_del_docente_solo_lo_ve_la_gente_del_curso(app, monkeypatch):
    docente_id, estudiante_id = uuid.uuid4(), uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    matriculados = {str(estudiante_id)}

    def filter_by(student_id, course_id):
        return SimpleNamespace(first=lambda: object() if str(student_id) in matriculados else None)

    ve = cursos_routes._es_del_curso
    with app.app_context():
        monkeypatch.setattr(cursos_routes.StudentCourse, "query", SimpleNamespace(filter_by=filter_by))
        assert ve(SimpleNamespace(id=docente_id, role="TEACHER"), curso)
        assert ve(SimpleNamespace(id=estudiante_id, role="STUDENT"), curso)
        assert ve(SimpleNamespace(id=uuid.uuid4(), role="ADMIN"), curso)
        # Otro docente u otro estudiante pueden pedir la ficha, pero no reciben el correo.
        assert not ve(SimpleNamespace(id=uuid.uuid4(), role="TEACHER"), curso)
        assert not ve(SimpleNamespace(id=uuid.uuid4(), role="STUDENT"), curso)
        assert not ve(None, curso)


def test_actualizar_curso_guarda_el_texto_de_la_tarjeta_sin_tocar_la_descripcion(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(
        id=uuid.uuid4(), teacher_id=docente_id, name="Gastro", description="<p>Adentro</p>",
        academic_period=None, cover_image_key=None, card_summary=None,
    )
    curso.to_dict = lambda: {"id": str(curso.id), "description": curso.description, "card_summary": curso.card_summary}
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes.db.session, "commit", lambda: None)
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}

    res = client.patch(f"/api/cursos/{curso.id}", json={"card_summary": "  Rotación de\n gastro  "}, headers=headers)
    assert res.status_code == 200
    assert res.get_json()["card_summary"] == "Rotación de gastro"
    assert res.get_json()["description"] == "<p>Adentro</p>"

    # Accesos directos: solo enlaces web, con nombre, y como mucho ocho.
    curso.shortcuts = None
    curso.to_dict = lambda: {"id": str(curso.id), "card_summary": curso.card_summary, "description": curso.description, "shortcuts": curso.shortcuts or []}
    res = client.patch(
        f"/api/cursos/{curso.id}",
        json={"shortcuts": [{"label": "  Sala de   clase ", "url": "https://meet.example.com/abc"}]},
        headers=headers,
    )
    assert res.status_code == 200
    assert res.get_json()["shortcuts"] == [{"label": "Sala de clase", "url": "https://meet.example.com/abc"}]
    for invalido in (
        [{"label": "Malo", "url": "javascript:alert(1)"}],
        [{"label": "", "url": "https://a.co"}],
        [{"label": "x", "url": "https://a.co"}] * 9,
    ):
        assert client.patch(f"/api/cursos/{curso.id}", json={"shortcuts": invalido}, headers=headers).status_code in (400, 422)
    assert curso.shortcuts == [{"label": "Sala de clase", "url": "https://meet.example.com/abc"}]
    res = client.patch(f"/api/cursos/{curso.id}", json={"shortcuts": []}, headers=headers)
    assert res.status_code == 200 and curso.shortcuts is None

    # Vacío lo quita; más de 280 caracteres no se acepta.
    res = client.patch(f"/api/cursos/{curso.id}", json={"card_summary": ""}, headers=headers)
    assert res.status_code == 200 and res.get_json()["card_summary"] is None
    res = client.patch(f"/api/cursos/{curso.id}", json={"card_summary": "x" * 281}, headers=headers)
    assert res.status_code in (400, 422)


def test_el_icono_y_el_color_del_modulo_salen_de_una_lista_cerrada():
    import pytest
    from pydantic import ValidationError

    from app.schemas.curso_contenido import ActualizarBloqueRequest

    ok = ActualizarBloqueRequest(icon="stethoscope", color="morado")
    assert (ok.icon, ok.color) == ("stethoscope", "morado")
    for invalido in ({"icon": "<svg onload=alert(1)>"}, {"color": "#ff0000"}, {"color": "red; background:url(x)"}):
        with pytest.raises(ValidationError):
            ActualizarBloqueRequest(**invalido)


def test_reordenar_modulos_exige_todos_los_modulos_del_curso_una_vez(app, client, monkeypatch):
    from app.routes import curso_contenido as rutas

    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    bloques = [SimpleNamespace(id=uuid.uuid4(), position=i) for i in range(3)]
    with app.app_context():
        monkeypatch.setattr(rutas, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(rutas, "_curso_o_404", lambda _id: (curso, None))
        monkeypatch.setattr(rutas.CourseBlock, "query", SimpleNamespace(filter_by=lambda **_k: SimpleNamespace(all=lambda: bloques)))
        monkeypatch.setattr(rutas.db.session, "commit", lambda: None)
    headers = {"Authorization": f"Bearer {_token(app, 'TEACHER', identity=str(docente_id))}"}
    url = f"/api/cursos/{curso.id}/bloques/orden"
    a, b, c = (str(x.id) for x in bloques)

    res = client.put(url, json={"orden": [c, a, b]}, headers=headers)
    assert res.status_code == 200
    assert [x.position for x in bloques] == [1, 2, 0]

    # Incompleto, repetido o con un id ajeno: no cambia nada.
    for malo in ([c, a], [c, a, a], [c, a, str(uuid.uuid4())]):
        assert client.put(url, json={"orden": malo}, headers=headers).status_code == 400
    assert [x.position for x in bloques] == [1, 2, 0]


def test_crear_modulo_acepta_icono_y_color_de_la_lista():
    import pytest
    from pydantic import ValidationError

    from app.schemas.curso_contenido import CrearBloqueRequest

    ok = CrearBloqueRequest(title="Hígado", icon="flask", color="verde")
    assert (ok.icon, ok.color) == ("flask", "verde")
    assert CrearBloqueRequest(title="Sin estilo").icon is None
    with pytest.raises(ValidationError):
        CrearBloqueRequest(title="x", color="#123456")
