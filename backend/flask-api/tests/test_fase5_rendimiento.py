"""Fase 5 — rendimiento, paginación y borrado seguro: parámetros de página
con tope, roster sin N+1, papelera de cursos y entregas (borrado suave con
restauración), borrado definitivo con bloqueo por simulaciones y limpieza de
R2 con cola de reintentos.

No toca la base real ni R2 — todo con monkeypatch. El comportamiento que solo
se ve con Postgres (filtro automático de eliminados, cascadas, número real de
consultas) se comprobó contra la base con transacciones que se deshacen."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token
from sqlalchemy import select
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import IntegrityError

import app.routes.curso_avisos as ca_routes
import app.routes.curso_calificaciones as cal_routes
import app.routes.curso_contenido as cc_routes
import app.routes.cursos as cursos_routes
from app.models import AssignmentSubmission, Course, CourseAnnouncement, CourseBlock, CourseContentItem
from app.models import soft_delete
from app.services import limpieza_r2, paginacion
from tests.fakes import ColaR2Falsa, ConsultaFalsa

AHORA = datetime.now(timezone.utc)


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _curso(docente_id, **kw):
    datos = dict(id=uuid.uuid4(), teacher_id=docente_id, name="Gastro I", enrollment_mode="CODE")
    datos.update(kw)
    return Course(**datos)


class _Sesion:
    def __init__(self, app, monkeypatch, modulo, commit_falla=None):
        self.agregados, self.borrados = [], []
        self.commits = self.rollbacks = 0
        self._falla = commit_falla
        with app.app_context():
            monkeypatch.setattr(modulo.db.session, "add", self.agregados.append)
            monkeypatch.setattr(modulo.db.session, "delete", self.borrados.append)
            monkeypatch.setattr(modulo.db.session, "commit", self._commit)
            monkeypatch.setattr(modulo.db.session, "rollback", self._rollback)

    def _commit(self):
        if self._falla is not None:
            raise self._falla
        self.commits += 1

    def _rollback(self):
        self.rollbacks += 1


@pytest.fixture(autouse=True)
def _propagar(app):
    anterior = app.config.get("PROPAGATE_EXCEPTIONS")
    yield
    app.config["PROPAGATE_EXCEPTIONS"] = anterior


# ─────────────────────────── Paginación ───────────────────────────

@pytest.mark.parametrize("query,esperado", [
    ("", (1, 20)),
    ("?page=3&per_page=50", (3, 50)),
    ("?per_page=100000", (1, 100)),          # tope máximo
    ("?per_page=0", (1, 1)),
    ("?page=0", (1, 20)),
    ("?page=-4&per_page=-9", (1, 1)),
    ("?page=abc&per_page=xyz", (1, 20)),     # basura: valores por defecto
])
def test_parametros_de_pagina_con_tope(app, query, esperado):
    with app.test_request_context(f"/x{query}"):
        assert paginacion.parametros() == esperado


def test_meta_de_paginacion():
    assert paginacion.meta(0, 1, 20) == {"total": 0, "page": 1, "per_page": 20, "pages": 0}
    assert paginacion.meta(20, 1, 20)["pages"] == 1
    assert paginacion.meta(21, 2, 20) == {"total": 21, "page": 2, "per_page": 20, "pages": 2}
    assert paginacion.meta(101, 1, 100)["pages"] == 2


def test_paginar_devuelve_solo_la_pagina_y_el_total():
    filas = list(range(45))
    assert paginacion.paginar(ConsultaFalsa(todos=filas), 1, 20) == (filas[:20], 45)
    assert paginacion.paginar(ConsultaFalsa(todos=filas), 3, 20) == (filas[40:], 45)
    assert paginacion.paginar(ConsultaFalsa(todos=filas), 9, 20) == ([], 45)      # página que no existe
    assert paginacion.paginar(ConsultaFalsa(todos=[]), 1, 20) == ([], 0)


# ─────────────────────────── /mios ───────────────────────────

def _preparar_mios(app, monkeypatch, user, cursos, docentes=()):
    consultas_de_usuarios = []

    class _Usuarios(ConsultaFalsa):
        def all(self):
            consultas_de_usuarios.append(True)
            return list(docentes)

        def get(self, _id):
            raise AssertionError("un User.query.get por curso es el N+1 que se eliminó")

    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cursos_routes.Course, "query", ConsultaFalsa(todos=cursos))
        monkeypatch.setattr(cursos_routes.User, "query", _Usuarios())
        # Los indicadores de la card (fase 7) se prueban en su propio archivo.
        monkeypatch.setattr(cursos_routes, "_indicadores_del_estudiante", lambda course_ids, student_id: {})
    return consultas_de_usuarios


def test_mios_paginado_trae_total_y_paginas(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    cursos = [_curso(docente.id, name=f"Curso {n}") for n in range(45)]
    _preparar_mios(app, monkeypatch, docente, cursos)

    body = client.get("/api/cursos/mios?page=3&per_page=20", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert [c["name"] for c in body["cursos"]] == [f"Curso {n}" for n in range(40, 45)]
    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (45, 3, 20, 3)


def test_mios_sin_parametros_conserva_la_forma_anterior_pero_con_tope(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    _preparar_mios(app, monkeypatch, docente, [_curso(docente.id) for _ in range(130)])

    body = client.get("/api/cursos/mios", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert isinstance(body, list) and len(body) == paginacion.PER_PAGE_MAXIMO


def test_mios_del_estudiante_trae_los_docentes_en_una_sola_consulta(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    profe_a = SimpleNamespace(id=uuid.uuid4(), first_name="Ana", last_name="Ruiz")
    profe_b = SimpleNamespace(id=uuid.uuid4(), first_name="Luis", last_name="Paz")
    cursos = [_curso(profe_a.id), _curso(profe_b.id), _curso(profe_a.id), _curso(uuid.uuid4())]
    consultas = _preparar_mios(app, monkeypatch, estudiante, cursos, docentes=[profe_a, profe_b])

    body = client.get("/api/cursos/mios?per_page=50", headers=_headers(app, "STUDENT", estudiante.id)).get_json()

    assert [c["teacher_name"] for c in body["cursos"]] == ["Ana Ruiz", "Luis Paz", "Ana Ruiz", None]
    assert len(consultas) == 1


# ─────────────────────────── Roster ───────────────────────────

def test_el_roster_es_una_sola_consulta_con_agregaciones(app):
    """El SQL que sale: matrícula + estudiante + usuario y los dos conteos de
    casos desde una subconsulta agrupada, unida con LEFT JOIN."""
    with app.app_context():
        sql = str(cursos_routes._consulta_roster(uuid.uuid4()).statement.compile(dialect=postgresql.dialect()))

    assert sql.count("FROM student_courses") == 1
    assert "LEFT OUTER JOIN (SELECT consultations.student_id" in sql
    assert "GROUP BY consultations.student_id" in sql
    assert sql.count("count(*) FILTER (WHERE consultations.status =") == 2
    assert "coalesce(" in sql
    assert "ORDER BY student_courses.enrolled_at DESC, users.id ASC" in sql


def _fila_roster(n, completados=0, en_progreso=0):
    matricula = SimpleNamespace(enrolled_at=AHORA)
    student = SimpleNamespace(student_code=f"EST{n:03d}")
    usuario = SimpleNamespace(id=uuid.uuid4(), first_name="Est", last_name=str(n), email=f"e{n}@x.com")
    return (matricula, student, usuario, completados, en_progreso)


def test_roster_paginado_no_consulta_casos_por_estudiante(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id)
    filas = [_fila_roster(n, completados=n, en_progreso=1) for n in range(45)]

    def prohibido(*a, **kw):
        raise AssertionError("consultar Consultation por estudiante es el N+1 que se eliminó")

    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes, "_consulta_roster", lambda course_id: ConsultaFalsa(todos=filas))
        monkeypatch.setattr(cursos_routes.Consultation, "query", SimpleNamespace(filter_by=prohibido))

    body = client.get(
        f"/api/cursos/{curso.id}/estudiantes?page=2&per_page=20", headers=_headers(app, "TEACHER", docente.id),
    ).get_json()

    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (45, 2, 20, 3)
    assert [e["student_code"] for e in body["estudiantes"]] == [f"EST{n:03d}" for n in range(20, 40)]
    assert body["estudiantes"][0]["casos_completados"] == 20 and body["estudiantes"][0]["casos_en_progreso"] == 1


def test_roster_respeta_el_tope_de_per_page(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id)
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes, "_consulta_roster", lambda cid: ConsultaFalsa(todos=[_fila_roster(n) for n in range(250)]))

    body = client.get(f"/api/cursos/{curso.id}/estudiantes?per_page=5000", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert body["per_page"] == 100 and len(body["estudiantes"]) == 100 and body["pages"] == 3


# ─────────────────────────── Otros listados ───────────────────────────

def test_avisos_paginados(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    avisos = [
        CourseAnnouncement(id=uuid.uuid4(), course_id=curso.id, author_id=curso.teacher_id, title=f"A{n}", body="<p>x</p>",
                           pinned=False, created_at=AHORA)
        for n in range(25)
    ]
    with app.app_context():
        monkeypatch.setattr(ca_routes, "get_current_user", lambda: estudiante)
        monkeypatch.setattr(ca_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(ca_routes.StudentCourse, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(ca_routes.CourseAnnouncement, "query", ConsultaFalsa(todos=avisos))
        monkeypatch.setattr(ca_routes.User, "query", ConsultaFalsa(todos=[]))
        monkeypatch.setattr(ca_routes.db.session, "query", lambda *a: ConsultaFalsa(todos=[]))

    body = client.get(f"/api/cursos/{curso.id}/avisos?page=2&per_page=10", headers=_headers(app, "STUDENT", estudiante.id)).get_json()

    assert [a["title"] for a in body["avisos"]] == [f"A{n}" for n in range(10, 20)]
    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (25, 2, 10, 3)


def _tarea():
    return CourseContentItem(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="Informe", position=0, max_score=10,
        allow_late=False, allowed_extensions=[], max_files=1,
    )


def _entrega(item, **kw):
    datos = dict(id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4(), current_version=1, submitted_at=AHORA, is_late=False)
    datos.update(kw)
    return AssignmentSubmission(**datos)


def _preparar_entregas(app, monkeypatch, docente, curso, item, entregas, entrega=None):
    opciones = []
    sesion = _Sesion(app, monkeypatch, cc_routes)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", ConsultaFalsa(first=item))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", ConsultaFalsa(first=entrega, todos=entregas, opciones=opciones))
        monkeypatch.setattr(cc_routes.User, "query", ConsultaFalsa(todos=[]))
        monkeypatch.setattr(cc_routes, "_archivos_de_entregas", lambda ids: {})
    ruta = f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas"
    return ruta, sesion, opciones


def test_entregas_paginadas(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    item = _tarea()
    ruta, _, opciones = _preparar_entregas(app, monkeypatch, docente, curso, item, [_entrega(item) for _ in range(33)])

    body = client.get(f"{ruta}?per_page=15&page=3", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert len(body["entregas"]) == 3
    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (33, 3, 15, 3)
    assert "reglas" in body
    assert opciones == []          # sin pedirlo, las eliminadas no se consultan


def test_entregas_de_la_papelera_se_piden_aparte(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    item = _tarea()
    ruta, _, opciones = _preparar_entregas(app, monkeypatch, docente, curso, item, [_entrega(item, deleted_at=AHORA)])

    body = client.get(f"{ruta}?eliminadas=1", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert opciones == [{"include_deleted": True}]
    assert body["entregas"][0]["deleted_at"] is not None


def test_calificaciones_paginadas_solo_cargan_los_estudiantes_de_la_pagina(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    filas = [
        (SimpleNamespace(), SimpleNamespace(student_code=f"E{n}"), SimpleNamespace(id=uuid.uuid4(), first_name="Est", last_name=str(n)))
        for n in range(30)
    ]
    pedidos = []

    def construir(course_id, student_ids):
        pedidos.append(list(student_ids))
        return [], {}

    with app.app_context():
        monkeypatch.setattr(cal_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cal_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cal_routes.db.session, "query", lambda *a: ConsultaFalsa(todos=filas))
        monkeypatch.setattr(cal_routes, "_construir_matriz", construir)

    body = client.get(
        f"/api/cursos/{curso.id}/calificaciones?page=2&per_page=10", headers=_headers(app, "TEACHER", docente.id),
    ).get_json()

    assert (body["total"], body["page"], body["per_page"], body["pages"]) == (30, 2, 10, 3)
    assert [e["student_code"] for e in body["estudiantes"]] == [f"E{n}" for n in range(10, 20)]
    assert pedidos == [[u.id for _m, _s, u in filas[10:20]]]


def test_listar_bloques_trae_todo_el_contenido_en_una_consulta(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    bloques = [CourseBlock(id=uuid.uuid4(), course_id=curso.id, title=f"B{n}", position=n) for n in range(12)]
    items = [
        CourseContentItem(id=uuid.uuid4(), block_id=b.id, type="LINK", title=f"{b.title}-{k}", position=k, link_url="https://x.com")
        for b in bloques for k in range(3)
    ]
    consultas_de_items = []

    class _Items(ConsultaFalsa):
        def all(self):
            consultas_de_items.append(True)
            return super().all()

    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: docente)
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", ConsultaFalsa(todos=bloques))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _Items(todos=items))

    body = client.get(f"/api/cursos/{curso.id}/bloques", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert len(body["bloques"]) == 12
    assert [c["title"] for c in body["bloques"][5]["contenido"]] == ["B5-0", "B5-1", "B5-2"]
    assert len(consultas_de_items) == 1          # antes: 2 por bloque = 24


# ─────────────────────────── Borrado suave ───────────────────────────

def test_el_filtro_de_eliminados_se_aplica_a_los_select_del_orm():
    """El criterio que se agrega a cada consulta: deleted_at IS NULL, salvo
    que se pida include_deleted o sea el refresco de un objeto ya cargado."""
    class _Estado:
        def __init__(self, **kw):
            self.is_select, self.is_column_load, self.is_relationship_load = True, False, False
            self.execution_options = {}
            self.statement = select(Course)
            self.__dict__.update(kw)

    normal = _Estado()
    soft_delete._excluir_eliminados(normal)
    assert len(normal.statement._with_options) == 1

    for exento in (
        _Estado(execution_options={"include_deleted": True}),
        _Estado(is_column_load=True),
        _Estado(is_relationship_load=True),
        _Estado(is_select=False),
    ):
        soft_delete._excluir_eliminados(exento)
        assert exento.statement._with_options == ()


def _preparar_curso(app, monkeypatch, user, vigente=None, en_papelera=None, simulaciones=0, commit_falla=None):
    sesion = _Sesion(app, monkeypatch, cursos_routes, commit_falla=commit_falla)
    cola = ColaR2Falsa()
    consulta = ConsultaFalsa(first=en_papelera, todos=[en_papelera] if en_papelera is not None else [])
    consulta.get = lambda _id: vigente
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cursos_routes.Course, "query", consulta)
        monkeypatch.setattr(cursos_routes, "limpieza_r2", cola)
        monkeypatch.setattr(cursos_routes.db.session, "query", lambda *a: ConsultaFalsa(first=simulaciones))
    return sesion, cola


def test_borrar_un_curso_lo_manda_a_la_papelera_sin_borrar_nada(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, cover_image_key="portadas/a.webp")
    sesion, cola = _preparar_curso(app, monkeypatch, docente, vigente=curso)

    res = client.delete(f"/api/cursos/{curso.id}", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    body = res.get_json()
    assert body["restorable"] is True and body["deleted_at"]
    assert curso.deleted_at is not None
    assert sesion.borrados == [] and sesion.commits == 1          # no hay DELETE
    assert cola.encoladas == [] and cola.procesadas == []         # ni se toca R2


def test_borrar_un_curso_ajeno_da_403(app, client, monkeypatch):
    otro = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(uuid.uuid4())
    sesion, _ = _preparar_curso(app, monkeypatch, otro, vigente=curso)
    assert client.delete(f"/api/cursos/{curso.id}", headers=_headers(app, "TEACHER", otro.id)).status_code == 403
    assert curso.deleted_at is None and sesion.commits == 0


def test_la_papelera_lista_los_cursos_eliminados_del_docente(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    eliminado = _curso(docente.id, deleted_at=AHORA)
    _preparar_curso(app, monkeypatch, docente, en_papelera=eliminado)

    body = client.get("/api/cursos/papelera", headers=_headers(app, "TEACHER", docente.id)).get_json()

    assert [c["id"] for c in body["cursos"]] == [str(eliminado.id)]
    assert body["cursos"][0]["deleted_at"] is not None
    assert (body["total"], body["page"], body["pages"]) == (1, 1, 1)


def test_restaurar_un_curso_lo_saca_de_la_papelera(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    eliminado = _curso(docente.id, deleted_at=AHORA)
    sesion, _ = _preparar_curso(app, monkeypatch, docente, en_papelera=eliminado)

    res = client.post(f"/api/cursos/{eliminado.id}/restaurar", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    assert eliminado.deleted_at is None and res.get_json()["deleted_at"] is None
    assert sesion.commits == 1


@pytest.mark.parametrize("ruta,metodo", [("restaurar", "post"), ("permanente", "delete")])
def test_papelera_solo_el_dueno_y_solo_lo_que_esta_en_la_papelera(app, client, monkeypatch, ruta, metodo):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")

    # Un curso vigente no se restaura ni se borra definitivamente: primero va a la papelera.
    vigente = _curso(docente.id)
    sesion, cola = _preparar_curso(app, monkeypatch, docente, en_papelera=vigente)
    res = getattr(client, metodo)(f"/api/cursos/{vigente.id}/{ruta}", headers=_headers(app, "TEACHER", docente.id))
    assert res.status_code == 404 and sesion.commits == 0 and sesion.borrados == []

    # El de otro docente, tampoco.
    ajeno = _curso(uuid.uuid4(), deleted_at=AHORA)
    sesion, cola = _preparar_curso(app, monkeypatch, docente, en_papelera=ajeno)
    res = getattr(client, metodo)(f"/api/cursos/{ajeno.id}/{ruta}", headers=_headers(app, "TEACHER", docente.id))
    assert res.status_code == 403 and ajeno.deleted_at is not None and sesion.borrados == []

    # Un estudiante, nunca.
    res = getattr(client, metodo)(f"/api/cursos/{ajeno.id}/{ruta}", headers=_headers(app, "STUDENT", uuid.uuid4()))
    assert res.status_code == 403


# ─────────────────────────── Borrado definitivo ───────────────────────────

def test_borrado_definitivo_encola_los_archivos_y_los_borra_despues_del_commit(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, deleted_at=AHORA, cover_image_key="portadas/a.webp")
    sesion, cola = _preparar_curso(app, monkeypatch, docente, en_papelera=curso)
    archivos_borrados = []
    orden = []
    with app.app_context():
        monkeypatch.setattr(
            cursos_routes, "_archivos_del_curso",
            lambda course_id: (["usuarios/d/material.pdf", "usuarios/e/entrega-v1.pdf", "usuarios/e/entrega-v2.pdf"], [uuid.uuid4()]),
        )
        consulta_archivos = ConsultaFalsa()
        consulta_archivos.delete = lambda **kw: archivos_borrados.append(True)
        monkeypatch.setattr(cursos_routes.UserFile, "query", consulta_archivos)
        commit_original = cursos_routes.db.session.commit
        monkeypatch.setattr(cursos_routes.db.session, "commit", lambda: (orden.append("commit"), commit_original()))
        procesar_original = cola.procesar
        cola.procesar = lambda claves=None, limite=200: (orden.append("r2"), procesar_original(claves))[1]

    res = client.delete(f"/api/cursos/{curso.id}/permanente", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 200
    esperadas = [
        "usuarios/d/material.pdf", "usuarios/e/entrega-v1.pdf", "usuarios/e/entrega-v2.pdf",
        "portadas/a.webp", "portadas/a_thumb.webp",
    ]
    assert cola.encoladas == esperadas                 # material, entregas (todas las versiones) y portada
    assert cola.motivos == [f"curso:{curso.id}"]
    assert sesion.borrados == [curso]                  # un solo DELETE: el resto lo hace la cascada de la base
    assert archivos_borrados == [True]                 # las filas de user_files, que no cuelgan del curso
    assert orden == ["commit", "r2"]                   # R2 solo después del commit
    assert cola.procesadas == esperadas
    assert res.get_json() == {"ok": True, "files_deleted": 5, "files_pending": 0}


def test_borrado_definitivo_bloqueado_si_hay_simulaciones_clinicas(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, deleted_at=AHORA, cover_image_key="portadas/a.webp")
    sesion, cola = _preparar_curso(app, monkeypatch, docente, en_papelera=curso, simulaciones=4)

    res = client.delete(f"/api/cursos/{curso.id}/permanente", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 409
    assert res.get_json()["simulaciones"] == 4
    assert sesion.borrados == [] and sesion.commits == 0
    assert cola.encoladas == [] and cola.procesadas == []
    assert curso.deleted_at is not None          # sigue en la papelera, restaurable


def test_si_la_llave_foranea_frena_el_borrado_no_se_toca_r2(app, client, monkeypatch):
    """Una simulación creada entre la comprobación y el DELETE: la frena la base (RESTRICT)."""
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, deleted_at=AHORA, cover_image_key="portadas/a.webp")
    sesion, cola = _preparar_curso(
        app, monkeypatch, docente, en_papelera=curso,
        commit_falla=IntegrityError("DELETE", {}, Exception("fk_consultation_course")),
    )
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "_archivos_del_curso", lambda course_id: (["usuarios/d/material.pdf"], []))

    res = client.delete(f"/api/cursos/{curso.id}/permanente", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 409
    assert sesion.rollbacks == 1
    assert cola.procesadas == []                 # el rollback también deshace lo anotado en la cola


def test_si_falla_el_borrado_definitivo_no_se_borra_ningun_archivo(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = _curso(docente.id, deleted_at=AHORA)
    sesion, cola = _preparar_curso(app, monkeypatch, docente, en_papelera=curso, commit_falla=RuntimeError("se cayó la base"))
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "_archivos_del_curso", lambda course_id: (["usuarios/d/material.pdf"], []))
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.delete(f"/api/cursos/{curso.id}/permanente", headers=_headers(app, "TEACHER", docente.id))

    assert res.status_code == 500
    assert sesion.rollbacks == 1 and cola.procesadas == []


# ─────────────────────────── Cola de limpieza de R2 ───────────────────────────

def _pendiente(clave, intentos=0):
    return SimpleNamespace(storage_key=clave, attempts=intentos, last_error=None, last_attempt_at=None)


def test_procesar_borra_lo_que_puede_y_deja_el_resto_para_reintentar(app, monkeypatch):
    bien, mal = _pendiente("usuarios/a/ok.pdf"), _pendiente("usuarios/a/falla.pdf", intentos=2)
    sesion = _Sesion(app, monkeypatch, limpieza_r2)
    borrados = []

    def borrar(clave):
        if "falla" in clave:
            raise RuntimeError("R2 no responde")
        borrados.append(clave)

    with app.app_context():
        monkeypatch.setattr(limpieza_r2.PendingFileDeletion, "query", ConsultaFalsa(todos=[bien, mal]))
        monkeypatch.setattr(limpieza_r2.storage, "borrar", borrar)
        resumen = limpieza_r2.procesar()

    assert resumen == {"borrados": 1, "fallidos": 1}
    assert borrados == ["usuarios/a/ok.pdf"]
    assert sesion.borrados == [bien]                       # lo borrado sale de la cola
    assert mal.attempts == 3 and "R2 no responde" in mal.last_error and mal.last_attempt_at is not None
    assert sesion.commits == 1


def test_procesar_nunca_tumba_la_peticion(app, monkeypatch):
    class _Rota(ConsultaFalsa):
        def all(self):
            raise RuntimeError("se cayó la base")

    sesion = _Sesion(app, monkeypatch, limpieza_r2)
    with app.app_context():
        monkeypatch.setattr(limpieza_r2.PendingFileDeletion, "query", _Rota())
        assert limpieza_r2.procesar(["usuarios/a/x.pdf"]) == {"borrados": 0, "fallidos": 0}
    assert sesion.rollbacks == 1


def test_procesar_sin_claves_no_consulta_nada(app, monkeypatch):
    with app.app_context():
        monkeypatch.setattr(limpieza_r2.PendingFileDeletion, "query", None)      # si la tocara, fallaría
        assert limpieza_r2.procesar([]) == {"borrados": 0, "fallidos": 0}
        assert limpieza_r2.procesar([None, ""]) == {"borrados": 0, "fallidos": 0}


def test_encolar_es_un_insert_que_ignora_repetidos(app, monkeypatch):
    ejecutadas = []
    with app.app_context():
        monkeypatch.setattr(limpieza_r2.db.session, "execute", ejecutadas.append)
        anotadas = limpieza_r2.encolar(["a.pdf", None, "b.pdf", "a.pdf", ""], "curso:1")
        assert limpieza_r2.encolar([], "curso:1") == []

    assert anotadas == ["a.pdf", "b.pdf"]
    assert len(ejecutadas) == 1
    sql = str(ejecutadas[0].compile(dialect=postgresql.dialect()))
    assert "INSERT INTO pending_file_deletions" in sql and "ON CONFLICT (storage_key) DO NOTHING" in sql


def test_si_r2_falla_al_borrar_un_archivo_suelto_queda_en_la_cola(app, monkeypatch):
    sesion = _Sesion(app, monkeypatch, limpieza_r2)
    encoladas = []

    def r2_caido(clave):
        raise RuntimeError("R2 no responde")

    with app.app_context():
        monkeypatch.setattr(limpieza_r2.storage, "borrar", r2_caido)
        monkeypatch.setattr(limpieza_r2, "encolar", lambda claves, motivo=None: encoladas.append((list(claves), motivo)))
        limpieza_r2.borrar_o_encolar("portadas/vieja.webp", "portada")
        limpieza_r2.borrar_o_encolar(None)

    assert encoladas == [(["portadas/vieja.webp"], "portada")]
    assert sesion.commits == 1


# ─────────────────────────── Entregas: papelera ───────────────────────────

def test_el_docente_manda_una_entrega_a_la_papelera_y_la_restaura(app, client, monkeypatch):
    docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente.id)
    item = _tarea()
    entrega = _entrega(item, score=8)
    ruta, sesion, opciones = _preparar_entregas(app, monkeypatch, docente, curso, item, [entrega], entrega=entrega)
    headers = _headers(app, "TEACHER", docente.id)

    res = client.delete(f"{ruta}/{entrega.id}", headers=headers)
    assert res.status_code == 200 and res.get_json()["restorable"] is True
    assert entrega.deleted_at is not None
    assert sesion.borrados == []                    # la fila, sus archivos y su nota siguen ahí
    assert float(entrega.score) == 8.0

    # Ya está en la papelera: volver a eliminarla es un 404.
    assert client.delete(f"{ruta}/{entrega.id}", headers=headers).status_code == 404

    res = client.post(f"{ruta}/{entrega.id}/restaurar", headers=headers)
    assert res.status_code == 200
    assert entrega.deleted_at is None and res.get_json()["deleted_at"] is None
    assert res.get_json()["score"] == 8.0

    # Y una vigente no se "restaura".
    assert client.post(f"{ruta}/{entrega.id}/restaurar", headers=headers).status_code == 404
    assert {"include_deleted": True} in opciones


@pytest.mark.parametrize("metodo,sufijo", [("delete", ""), ("post", "/restaurar")])
def test_solo_el_docente_dueno_toca_la_papelera_de_entregas(app, client, monkeypatch, metodo, sufijo):
    otro_docente = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _tarea()
    entrega = _entrega(item)
    ruta, sesion, _ = _preparar_entregas(app, monkeypatch, otro_docente, curso, item, [entrega], entrega=entrega)

    res = getattr(client, metodo)(f"{ruta}/{entrega.id}{sufijo}", headers=_headers(app, "TEACHER", otro_docente.id))
    assert res.status_code == 403 and entrega.deleted_at is None and sesion.commits == 0

    res = getattr(client, metodo)(f"{ruta}/{entrega.id}{sufijo}", headers=_headers(app, "STUDENT", entrega.student_id))
    assert res.status_code == 403


def test_volver_a_entregar_saca_la_entrega_de_la_papelera(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _tarea()
    entrega = _entrega(item, student_id=estudiante.id, deleted_at=AHORA, score=5)
    ruta, sesion, _ = _preparar_entregas(app, monkeypatch, estudiante, curso, item, [entrega], entrega=entrega)
    with app.app_context():
        monkeypatch.setattr(cc_routes.StudentCourse, "query", ConsultaFalsa(first=object()))
        monkeypatch.setattr(cc_routes, "_entrega_bloqueada", lambda item_id, student_id, ahora, es_tardia: entrega)
        monkeypatch.setattr(cc_routes.storage, "nueva_clave", lambda owner, mime: "usuarios/x/nuevo.pdf")
        monkeypatch.setattr(cc_routes.storage, "subir_bytes", lambda clave, contenido, mime: None)

    res = client.post(ruta, json={"name": "v2.pdf", "file_base64": "JVBERi0xLjQKJSVFT0YK"}, headers=_headers(app, "STUDENT", estudiante.id))

    assert res.status_code == 201
    assert entrega.deleted_at is None and entrega.current_version == 2
    assert res.get_json()["deleted_at"] is None
