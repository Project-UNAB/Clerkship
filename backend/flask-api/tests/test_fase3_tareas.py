"""Fase 3 — configuración de tareas por el docente: extensiones permitidas y
lista negra, tamaño y cantidad de archivos, ventana de tiempo con entregas
tardías, versiones de la entrega y las reglas que ve el estudiante.

No toca la base real ni R2 — todo con monkeypatch."""
import base64
import io
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_contenido as cc_routes
from app.services import tareas
from app.services.archivos import ArchivoInvalido, validar_archivo
from tests.fakes import ColaR2Falsa

PDF = b"%PDF-1.4\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
MB = 1024 * 1024


def _b64(contenido: bytes) -> str:
    return base64.b64encode(contenido).decode("ascii")


def _zip(nombres):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for nombre in nombres:
            zf.writestr(nombre, "x")
    return buffer.getvalue()


def _ahora():
    return datetime.now(timezone.utc)


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _query(first=None, todos=None):
    q = SimpleNamespace(first=lambda: first, one=lambda: first, all=lambda: todos or [])
    q.filter_by = lambda **kw: q
    q.filter = lambda *a: q
    q.order_by = lambda *a: q
    q.with_for_update = lambda **kw: q
    q.populate_existing = lambda: q
    return q


def _tarea(**kw):
    datos = dict(
        id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", title="Informe", description=None, position=0,
        file_id=None, video_url=None, link_url=None, text_content=None, created_at=None,
        open_at=None, due_at=None, allow_late=False, late_until=None, max_score=10,
        allowed_extensions=[], max_file_size_mb=None, max_files=1,
    )
    datos.update(kw)
    return cc_routes.CourseContentItem(**datos)


@pytest.fixture(autouse=True)
def _topes(app):
    """Topes del servidor conocidos, sin depender del entorno."""
    claves = ("ASSIGNMENT_MAX_FILE_MB", "ASSIGNMENT_MAX_FILES", "ASSIGNMENT_MAX_TOTAL_MB", "PROPAGATE_EXCEPTIONS")
    anteriores = {c: app.config.get(c) for c in claves}
    app.config.update(ASSIGNMENT_MAX_FILE_MB=10, ASSIGNMENT_MAX_FILES=5, ASSIGNMENT_MAX_TOTAL_MB=20)
    yield
    app.config.update(anteriores)


# ─────────────────────────── Reglas puras ───────────────────────────

def test_extensiones_se_normalizan():
    assert tareas.normalizar_extensiones([".PDF", "docx", " pdf ", "", "Zip"]) == ["docx", "pdf", "zip"]
    assert tareas.normalizar_extensiones(None) == []


@pytest.mark.parametrize("peligrosa", ["exe", "bat", "sh", "js", "php", "html", "svg", ".EXE", "ps1", "jar", "docm"])
def test_el_docente_no_puede_habilitar_extensiones_de_la_lista_negra(peligrosa):
    with pytest.raises(tareas.ReglaInvalida) as err:
        tareas.normalizar_extensiones(["pdf", peligrosa])
    assert "bloqueada" in str(err.value)


def test_extension_que_el_servidor_no_sabe_verificar_no_se_puede_habilitar():
    with pytest.raises(tareas.ReglaInvalida) as err:
        tareas.normalizar_extensiones(["pdf", "psd"])
    assert "no está soportada" in str(err.value)


def test_reglas_efectivas_usan_valores_por_defecto_y_topes(app):
    with app.app_context():
        por_defecto = tareas.reglas_efectivas(_tarea())
        assert por_defecto["allowed_extensions"] == list(tareas.EXTENSIONES_POR_DEFECTO)
        assert "zip" not in por_defecto["allowed_extensions"]
        assert por_defecto["max_file_size_mb"] == 10 and por_defecto["max_files"] == 1

        configurada = tareas.reglas_efectivas(_tarea(allowed_extensions=["zip", "pdf"], max_file_size_mb=3, max_files=2))
        assert configurada["allowed_extensions"] == ["pdf", "zip"]
        assert configurada["max_file_size_mb"] == 3 and configurada["max_files"] == 2

        # Si el tope del servidor baja después, la tarea no puede pasarlo.
        app.config.update(ASSIGNMENT_MAX_FILE_MB=2, ASSIGNMENT_MAX_FILES=1)
        recortada = tareas.reglas_efectivas(_tarea(max_file_size_mb=8, max_files=4))
        assert recortada["max_file_size_mb"] == 2 and recortada["max_files"] == 1


def test_limites_por_encima_del_tope_se_rechazan(app):
    with app.app_context():
        tareas.validar_limites(10, 5)
        with pytest.raises(tareas.ReglaInvalida):
            tareas.validar_limites(11, None)
        with pytest.raises(tareas.ReglaInvalida):
            tareas.validar_limites(None, 6)


def test_coherencia_de_la_ventana():
    cierre = _ahora()
    tareas.validar_ventana(cierre - timedelta(days=1), cierre, True, cierre + timedelta(days=2))
    tareas.validar_ventana(None, cierre, True, None)        # tardías sin tope
    for args in (
        (cierre, cierre - timedelta(hours=1), False, None),            # abre después de cerrar
        (None, cierre, False, cierre + timedelta(days=1)),             # late_until sin allow_late
        (None, None, True, cierre),                                    # late_until sin due_at
        (None, cierre, True, cierre - timedelta(minutes=1)),           # late_until antes del cierre
    ):
        with pytest.raises(tareas.ReglaInvalida):
            tareas.validar_ventana(*args)


def test_estado_de_la_ventana():
    ahora = _ahora()
    hora = timedelta(hours=1)
    assert tareas.estado_ventana(_tarea(), ahora) == "OPEN"                                   # sin fechas
    assert tareas.estado_ventana(_tarea(open_at=ahora + hora), ahora) == "NOT_OPEN"
    assert tareas.estado_ventana(_tarea(open_at=ahora - hora, due_at=ahora + hora), ahora) == "OPEN"
    assert tareas.estado_ventana(_tarea(due_at=ahora - hora), ahora) == "CLOSED"
    assert tareas.estado_ventana(_tarea(due_at=ahora - hora, allow_late=True), ahora) == "LATE"
    assert tareas.estado_ventana(_tarea(due_at=ahora - hora, allow_late=True, late_until=ahora + hora), ahora) == "LATE"
    assert tareas.estado_ventana(
        _tarea(due_at=ahora - 2 * hora, allow_late=True, late_until=ahora - hora), ahora,
    ) == "CLOSED"
    # Fechas sin zona (como las devolvería una columna TIMESTAMP) se toman como UTC.
    assert tareas.estado_ventana(_tarea(due_at=(ahora - hora).replace(tzinfo=None)), ahora) == "CLOSED"


def test_reglas_para_el_estudiante_traen_fechas_y_tiempo_restante(app):
    ahora = _ahora()
    with app.app_context():
        r = tareas.reglas_para_respuesta(
            _tarea(due_at=ahora + timedelta(hours=2), allow_late=True, late_until=ahora + timedelta(days=1)), ahora,
        )
    assert r["status"] == "OPEN" and r["accepts_submissions"] is True
    assert r["seconds_until_due"] == 7200
    assert r["due_at"].endswith("+00:00") and r["late_until"].endswith("+00:00")
    assert r["allow_late"] is True and r["max_files"] == 1


# ─────────────────────── Validación de archivos por tarea ───────────────────────

def test_solo_pasan_las_extensiones_que_permite_la_tarea():
    assert validar_archivo("informe.pdf", PDF, permitidas=["pdf"]) == "application/pdf"
    with pytest.raises(ArchivoInvalido) as err:
        validar_archivo("foto.png", PNG, permitidas=["pdf", "docx"])
    assert err.value.codigo == "EXTENSION_NOT_ALLOWED"
    assert "docx, pdf" in str(err.value)


def test_jpg_y_jpeg_son_la_misma_extension():
    jpg = b"\xff\xd8\xff\xe0" + b"\x00" * 16
    assert validar_archivo("foto.jpeg", jpg, permitidas=["jpg"]) == "image/jpeg"
    assert validar_archivo("foto.JPG", jpg, permitidas=["jpeg"]) == "image/jpeg"


@pytest.mark.parametrize("nombre", ["virus.exe", "informe.pdf.exe", "shell.php.pdf", "pagina.html", "dibujo.svg", "run.sh", "x.JS"])
def test_la_lista_negra_gana_aunque_la_tarea_la_permita(nombre):
    # Aunque alguien lograra meter la extensión en la tarea, el archivo no entra.
    with pytest.raises(ArchivoInvalido) as err:
        validar_archivo(nombre, PDF, permitidas=["pdf", "exe", "html", "svg", "sh", "js"])
    assert err.value.codigo == "DANGEROUS_EXTENSION"


def test_contenido_que_no_coincide_con_la_extension():
    with pytest.raises(ArchivoInvalido) as err:
        validar_archivo("informe.pdf", b"MZ\x90\x00 esto es un ejecutable", permitidas=["pdf"])
    assert err.value.codigo == "CONTENT_MISMATCH"


def test_zip_solo_si_la_tarea_lo_habilita_y_viene_limpio():
    limpio = _zip(["informe.pdf", "datos/tabla.csv"])
    assert validar_archivo("entrega.zip", limpio, permitidas=["zip"]) == "application/zip"
    # El material del curso (sin lista) sigue sin aceptar comprimidos.
    with pytest.raises(ArchivoInvalido):
        validar_archivo("entrega.zip", limpio)
    with pytest.raises(ArchivoInvalido) as err:
        validar_archivo("entrega.zip", _zip(["informe.pdf", "bin/instalar.exe"]), permitidas=["zip"])
    assert err.value.codigo == "CONTENT_MISMATCH"
    with pytest.raises(ArchivoInvalido):
        validar_archivo("entrega.zip", PDF, permitidas=["zip"])       # un PDF renombrado a .zip


# ─────────────────────────── Docente: crear y editar ───────────────────────────

def _preparar_docente(app, monkeypatch, docente_id, curso, item=None):
    estado = {"commits": 0}
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=docente_id, role="TEACHER"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseBlock, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(
            cc_routes.db.session, "query", lambda *a: SimpleNamespace(filter_by=lambda **kw: SimpleNamespace(scalar=lambda: -1)),
        )
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "flush", lambda: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: estado.__setitem__("commits", estado["commits"] + 1))
    return estado


def test_crear_tarea_guarda_las_reglas(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    estado = _preparar_docente(app, monkeypatch, docente_id, curso)

    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{uuid.uuid4()}/contenido",
        json={
            "type": "ASSIGNMENT", "title": "Informe de caso", "max_score": 10,
            "open_at": "2026-10-20T08:00:00-05:00", "due_at": "2026-10-27T23:59:00-05:00",
            "allow_late": True, "late_until": "2026-10-29T23:59:00-05:00",
            "allowed_extensions": ["PDF", ".docx", "zip"], "max_file_size_mb": 5, "max_files": 3,
        },
        headers=_headers(app, "TEACHER", docente_id),
    )

    assert res.status_code == 201
    body = res.get_json()
    assert body["allowed_extensions"] == ["docx", "pdf", "zip"]
    assert body["max_file_size_mb"] == 5 and body["max_files"] == 3
    # Fecha Y hora, guardadas en UTC.
    assert body["open_at"] == "2026-10-20T13:00:00+00:00"
    assert body["due_at"] == "2026-10-28T04:59:00+00:00"
    assert body["late_until"] == "2026-10-30T04:59:00+00:00"
    assert body["reglas"]["allowed_extensions"] == ["docx", "pdf", "zip"]
    assert estado["commits"] == 1


def test_crear_tarea_sin_reglas_usa_las_de_por_defecto(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    _preparar_docente(app, monkeypatch, docente_id, curso)

    body = client.post(
        f"/api/cursos/{curso.id}/bloques/{uuid.uuid4()}/contenido",
        json={"type": "ASSIGNMENT", "title": "Informe"}, headers=_headers(app, "TEACHER", docente_id),
    ).get_json()

    assert body["allowed_extensions"] == [] and body["max_file_size_mb"] is None and body["max_files"] == 1
    assert body["reglas"]["allowed_extensions"] == list(tareas.EXTENSIONES_POR_DEFECTO)
    assert body["reglas"]["max_file_size_mb"] == 10
    assert body["reglas"]["status"] == "OPEN"


@pytest.mark.parametrize("extra,fragmento", [
    ({"allowed_extensions": ["pdf", "exe"]}, "bloqueada"),
    ({"allowed_extensions": ["html"]}, "bloqueada"),
    ({"allowed_extensions": ["psd"]}, "no está soportada"),
    ({"max_file_size_mb": 11}, "no puede superar 10 MB"),
    ({"max_files": 6}, "más de 5 archivos"),
    ({"due_at": "2026-10-27T23:59:00Z", "late_until": "2026-10-29T00:00:00Z"}, "allow_late"),
    ({"due_at": "2026-10-27T23:59:00Z", "allow_late": True, "late_until": "2026-10-27T00:00:00Z"}, "posterior"),
    ({"open_at": "2026-10-28T00:00:00Z", "due_at": "2026-10-27T00:00:00Z"}, "anterior"),
    ({"due_at": "el martes"}, "Fecha inválida"),
])
def test_crear_tarea_con_reglas_invalidas_da_400(app, client, monkeypatch, extra, fragmento):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    estado = _preparar_docente(app, monkeypatch, docente_id, curso)

    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{uuid.uuid4()}/contenido",
        json={"type": "ASSIGNMENT", "title": "Informe", **extra}, headers=_headers(app, "TEACHER", docente_id),
    )

    assert res.status_code == 400
    assert fragmento in res.get_json()["message"]
    assert estado["commits"] == 0


def test_editar_tarea_cambia_reglas_y_null_las_quita(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    cierre = _ahora() + timedelta(days=3)
    item = _tarea(
        due_at=cierre, allow_late=True, late_until=cierre + timedelta(days=2),
        allowed_extensions=["pdf"], max_file_size_mb=4, max_files=2,
    )
    _preparar_docente(app, monkeypatch, docente_id, curso, item=item)
    ruta = f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}"
    headers = _headers(app, "TEACHER", docente_id)

    res = client.patch(ruta, json={"allowed_extensions": ["png", "pdf"], "max_file_size_mb": 8, "max_files": 1}, headers=headers)
    assert res.status_code == 200
    assert item.allowed_extensions == ["pdf", "png"] and item.max_file_size_mb == 8 and item.max_files == 1
    assert item.late_until is not None          # lo que no se mandó no se toca

    # null explícito: quita el tope de tardías y vuelve al tamaño y extensiones por defecto.
    res = client.patch(ruta, json={"late_until": None, "max_file_size_mb": None, "allowed_extensions": []}, headers=headers)
    assert res.status_code == 200
    assert item.late_until is None and item.max_file_size_mb is None and item.allowed_extensions == []
    assert res.get_json()["reglas"]["max_file_size_mb"] == 10

    # Apagar las tardías se lleva su fecha tope.
    item.late_until = cierre + timedelta(days=2)
    assert client.patch(ruta, json={"allow_late": False}, headers=headers).status_code == 200
    assert item.allow_late is False and item.late_until is None


def test_editar_tarea_invalida_no_deja_cambios_a_medias(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = _tarea(allowed_extensions=["pdf"], max_files=1)
    estado = _preparar_docente(app, monkeypatch, docente_id, curso, item=item)

    res = client.patch(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}",
        json={"title": "Otro título", "max_files": 3, "allowed_extensions": ["pdf", "bat"]},
        headers=_headers(app, "TEACHER", docente_id),
    )

    assert res.status_code == 400
    assert item.title == "Informe" and item.max_files == 1 and item.allowed_extensions == ["pdf"]
    assert estado["commits"] == 0


def test_estudiante_no_puede_editar_la_tarea(app, client):
    res = client.patch(
        f"/api/cursos/{uuid.uuid4()}/bloques/{uuid.uuid4()}/contenido/{uuid.uuid4()}",
        json={"allowed_extensions": ["zip"]}, headers=_headers(app, "STUDENT", uuid.uuid4()),
    )
    assert res.status_code == 403


# ─────────────────────────── Estudiante: reglas y entrega ───────────────────────────

class _Entorno:
    """Estudiante matriculado frente a una tarea, con R2 y la sesión falsos."""

    def __init__(self, app, monkeypatch, item, matriculado=True, entrega=None, subida_falla_en=None):
        self.estudiante_id = uuid.uuid4()
        self.curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
        self.item = item
        self.subidos, self.borrados_r2, self.agregados = [], [], []
        self.commits = self.rollbacks = 0
        self.entrega = entrega
        self.ruta = f"/api/cursos/{self.curso.id}/bloques/{item.block_id}/contenido/{item.id}"
        self.headers = _headers(app, "STUDENT", self.estudiante_id)

        def subir(clave, contenido, mime):
            if subida_falla_en is not None and len(self.subidos) == subida_falla_en:
                raise RuntimeError("R2 no responde")
            self.subidos.append((clave, mime, len(contenido)))

        def entrega_bloqueada(item_id, student_id, ahora, es_tardia):
            if self.entrega is None:
                self.entrega = cc_routes.AssignmentSubmission(
                    id=uuid.uuid4(), item_id=item_id, student_id=student_id, current_version=0,
                    submitted_at=ahora, is_late=es_tardia,
                )
            return self.entrega

        def archivos_de_entregas(ids):
            return {str(i): [o for o in self.agregados if isinstance(o, cc_routes.SubmissionFile)] for i in ids}

        with app.app_context():
            monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=self.estudiante_id, role="STUDENT"))
            monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: self.curso))
            monkeypatch.setattr(cc_routes.CourseBlock, "query", _query(first=object()))
            monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object() if matriculado else None))
            monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
            monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=entrega))
            monkeypatch.setattr(cc_routes, "_entrega_bloqueada", entrega_bloqueada)
            monkeypatch.setattr(cc_routes, "_archivos_de_entregas", archivos_de_entregas)
            monkeypatch.setattr(cc_routes.storage, "subir_bytes", subir)
            monkeypatch.setattr(cc_routes.storage, "borrar", self.borrados_r2.append)
            monkeypatch.setattr(cc_routes.db.session, "add", self.agregados.append)
            monkeypatch.setattr(cc_routes.db.session, "commit", self._commit)
            monkeypatch.setattr(cc_routes.db.session, "rollback", self._rollback)

    def _commit(self):
        self.commits += 1

    def _rollback(self):
        self.rollbacks += 1

    def nada_guardado(self):
        return self.subidos == [] and self.agregados == [] and self.commits == 0


def test_detalle_de_la_tarea_le_muestra_las_reglas_al_estudiante(app, client, monkeypatch):
    cierre = _ahora() + timedelta(hours=5)
    item = _tarea(due_at=cierre, allowed_extensions=["pdf", "docx"], max_file_size_mb=5, max_files=2)
    env = _Entorno(app, monkeypatch, item)

    res = client.get(env.ruta, headers=env.headers)

    assert res.status_code == 200
    body = res.get_json()
    reglas = body["reglas"]
    assert reglas["allowed_extensions"] == ["docx", "pdf"]
    assert reglas["max_file_size_mb"] == 5 and reglas["max_files"] == 2
    assert reglas["status"] == "OPEN" and reglas["accepts_submissions"] is True
    assert 0 < reglas["seconds_until_due"] <= 5 * 3600
    assert reglas["due_at"] is not None
    assert body["mi_entrega"] is None


def test_detalle_de_la_tarea_exige_estar_matriculado(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(), matriculado=False)
    assert client.get(env.ruta, headers=env.headers).status_code == 403


def test_entrega_valida_dentro_del_plazo(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(due_at=_ahora() + timedelta(hours=1), allowed_extensions=["pdf"]))

    res = client.post(f"{env.ruta}/entregas", json={"name": "C:\\docs\\mi informe.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 201
    body = res.get_json()
    assert body["version"] == 1 and body["is_late"] is False and body["history"] == []
    assert [f["nombre"] for f in body["files"]] == ["mi informe.pdf"]
    clave, mime, _tam = env.subidos[0]
    assert mime == "application/pdf" and clave.endswith(".pdf") and "informe" not in clave
    assert "file_key" not in str(body) and clave not in str(body)      # la clave de R2 no sale al cliente
    assert env.commits == 1


@pytest.mark.parametrize("nombre,contenido,codigo", [
    ("foto.png", PNG, "EXTENSION_NOT_ALLOWED"),          # tipo válido, pero no en esta tarea
    ("apuntes.txt", b"hola", "EXTENSION_NOT_ALLOWED"),
    ("programa.exe", b"MZ\x90\x00", "DANGEROUS_EXTENSION"),
    ("informe.pdf.exe", PDF, "DANGEROUS_EXTENSION"),
    ("pagina.html", b"<script>alert(1)</script>", "DANGEROUS_EXTENSION"),
    ("informe.pdf", b"MZ\x90\x00 no soy un pdf", "CONTENT_MISMATCH"),
    ("sin_extension", PDF, "EXTENSION_NOT_ALLOWED"),
])
def test_archivo_no_permitido_da_415_con_las_reglas(app, client, monkeypatch, nombre, contenido, codigo):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf", "docx"]))

    res = client.post(f"{env.ruta}/entregas", json={"name": nombre, "file_base64": _b64(contenido)}, headers=env.headers)

    assert res.status_code == 415
    body = res.get_json()
    assert body["code"] == codigo
    assert body["reglas"]["allowed_extensions"] == ["docx", "pdf"]
    assert env.nada_guardado()


def test_archivo_muy_grande_da_413(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_file_size_mb=1))
    grande = PDF + b"0" * (1 * MB + 1)

    res = client.post(f"{env.ruta}/entregas", json={"name": "grande.pdf", "file_base64": _b64(grande)}, headers=env.headers)

    assert res.status_code == 413
    body = res.get_json()
    assert body["code"] == "FILE_TOO_LARGE" and "1 MB" in body["message"] and body["file"] == "grande.pdf"
    assert env.nada_guardado()

    # Justo en el límite sí entra.
    justo = PDF + b"0" * (1 * MB - len(PDF))
    assert client.post(
        f"{env.ruta}/entregas", json={"name": "justo.pdf", "file_base64": _b64(justo)}, headers=env.headers,
    ).status_code == 201


def test_el_total_de_la_entrega_tambien_tiene_tope(app, client, monkeypatch):
    app.config.update(ASSIGNMENT_MAX_TOTAL_MB=1)
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_file_size_mb=1, max_files=2))
    medio = PDF + b"0" * (700 * 1024)

    res = client.post(
        f"{env.ruta}/entregas",
        json={"files": [{"name": "a.pdf", "file_base64": _b64(medio)}, {"name": "b.pdf", "file_base64": _b64(medio)}]},
        headers=env.headers,
    )

    assert res.status_code == 413 and res.get_json()["code"] == "TOTAL_TOO_LARGE"
    assert env.nada_guardado()


def test_mas_archivos_de_los_permitidos_da_400(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_files=2))
    archivo = {"name": "a.pdf", "file_base64": _b64(PDF)}

    res = client.post(f"{env.ruta}/entregas", json={"files": [archivo, archivo, archivo]}, headers=env.headers)

    assert res.status_code == 400 and res.get_json()["code"] == "TOO_MANY_FILES"
    assert env.nada_guardado()


def test_entrega_sin_archivos_da_400(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea())
    res = client.post(f"{env.ruta}/entregas", json={"files": []}, headers=env.headers)
    assert res.status_code == 400 and res.get_json()["code"] == "NO_FILES"


def test_varios_archivos_en_una_entrega(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf", "png"], max_files=2))

    res = client.post(
        f"{env.ruta}/entregas",
        json={"files": [{"name": "informe.pdf", "file_base64": _b64(PDF)}, {"name": "figura.png", "file_base64": _b64(PNG)}]},
        headers=env.headers,
    )

    assert res.status_code == 201
    archivos = res.get_json()["files"]
    assert [(f["nombre"], f["position"], f["mime_type"]) for f in archivos] == [
        ("informe.pdf", 0, "application/pdf"), ("figura.png", 1, "image/png"),
    ]
    assert len(env.subidos) == 2 and len({c for c, _m, _t in env.subidos}) == 2


def test_si_uno_de_los_archivos_no_cumple_no_se_sube_ninguno(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_files=2))

    res = client.post(
        f"{env.ruta}/entregas",
        json={"files": [{"name": "informe.pdf", "file_base64": _b64(PDF)}, {"name": "macro.docm", "file_base64": _b64(PDF)}]},
        headers=env.headers,
    )

    assert res.status_code == 415 and res.get_json()["file"] == "macro.docm"
    assert env.nada_guardado()


def test_antes_de_abrir_se_rechaza(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(open_at=_ahora() + timedelta(hours=1), due_at=_ahora() + timedelta(days=1)))

    res = client.post(f"{env.ruta}/entregas", json={"name": "a.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 400
    body = res.get_json()
    assert body["code"] == "NOT_OPEN" and body["reglas"]["seconds_until_open"] > 0
    assert env.nada_guardado()


def test_fuera_de_plazo_sin_tardias_se_rechaza(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(due_at=_ahora() - timedelta(minutes=1), allow_late=False))

    res = client.post(f"{env.ruta}/entregas", json={"name": "a.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 400 and res.get_json()["code"] == "CLOSED"
    assert res.get_json()["reglas"]["accepts_submissions"] is False
    assert env.nada_guardado()


@pytest.mark.parametrize("late_until_en", [None, timedelta(hours=2)])
def test_entrega_tardia_permitida_queda_marcada(app, client, monkeypatch, late_until_en):
    ahora = _ahora()
    env = _Entorno(app, monkeypatch, _tarea(
        due_at=ahora - timedelta(hours=1), allow_late=True,
        late_until=(ahora + late_until_en) if late_until_en else None,
    ))

    res = client.post(f"{env.ruta}/entregas", json={"name": "a.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 201
    body = res.get_json()
    assert body["is_late"] is True and body["files"][0]["is_late"] is True
    assert body["reglas"]["status"] == "LATE"


def test_despues_del_limite_de_tardias_se_rechaza(app, client, monkeypatch):
    ahora = _ahora()
    env = _Entorno(app, monkeypatch, _tarea(
        due_at=ahora - timedelta(days=2), allow_late=True, late_until=ahora - timedelta(minutes=1),
    ))

    res = client.post(f"{env.ruta}/entregas", json={"name": "a.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 400 and res.get_json()["code"] == "LATE_CLOSED"
    assert env.nada_guardado()


def test_reemplazar_la_entrega_crea_otra_version_y_guarda_el_historial(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(due_at=_ahora() + timedelta(hours=1), allowed_extensions=["pdf", "png"]))

    primera = client.post(f"{env.ruta}/entregas", json={"name": "v1.pdf", "file_base64": _b64(PDF)}, headers=env.headers).get_json()
    env.entrega.score = 7            # el docente la alcanzó a calificar
    segunda = client.post(f"{env.ruta}/entregas", json={"name": "v2.png", "file_base64": _b64(PNG)}, headers=env.headers).get_json()

    assert primera["version"] == 1 and segunda["version"] == 2
    assert segunda["id"] == primera["id"]                                   # la misma entrega
    assert [f["nombre"] for f in segunda["files"]] == ["v2.png"]
    assert [(h["version"], h["files"][0]["nombre"]) for h in segunda["history"]] == [(1, "v1.pdf")]
    assert segunda["score"] is None                                         # hay que volver a calificar
    assert env.borrados_r2 == []                                            # el archivo de la v1 se conserva
    versiones = sorted(o.version for o in env.agregados if isinstance(o, cc_routes.SubmissionFile))
    assert versiones == [1, 2]


def test_no_se_puede_reemplazar_despues_del_cierre(app, client, monkeypatch):
    item = _tarea(due_at=_ahora() - timedelta(minutes=5))
    entrega = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4(), current_version=1, submitted_at=_ahora(), is_late=False,
    )
    env = _Entorno(app, monkeypatch, item, entrega=entrega)

    res = client.post(f"{env.ruta}/entregas", json={"name": "v2.pdf", "file_base64": _b64(PDF)}, headers=env.headers)

    assert res.status_code == 400 and res.get_json()["code"] == "CLOSED"
    assert entrega.current_version == 1


def test_si_r2_falla_a_mitad_se_quita_lo_que_se_alcanzo_a_subir(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_files=2), subida_falla_en=1)
    app.config["PROPAGATE_EXCEPTIONS"] = False

    res = client.post(
        f"{env.ruta}/entregas",
        json={"files": [{"name": "a.pdf", "file_base64": _b64(PDF)}, {"name": "b.pdf", "file_base64": _b64(PDF)}]},
        headers=env.headers,
    )

    assert res.status_code == 500
    assert env.borrados_r2 == [env.subidos[0][0]]
    assert env.agregados == [] and env.commits == 0


def test_mi_entrega_trae_reglas_aunque_no_haya_entregado(app, client, monkeypatch):
    env = _Entorno(app, monkeypatch, _tarea(allowed_extensions=["pdf"], max_file_size_mb=2))
    body = client.get(f"{env.ruta}/entregas/mia", headers=env.headers).get_json()
    assert body["entrega"] is None
    assert body["reglas"]["allowed_extensions"] == ["pdf"] and body["reglas"]["max_file_size_mb"] == 2


# ─────────────────────────── Descargas e historial ───────────────────────────

def _archivo_guardado(entrega_id, version=1):
    return cc_routes.SubmissionFile(
        id=uuid.uuid4(), submission_id=entrega_id, version=version, position=0,
        file_key="usuarios/x/abc.pdf", original_name="informe.pdf", mime_type="application/pdf", size_bytes=15,
    )


def test_archivo_de_una_version_anterior_se_descarga_con_url_firmada(app, client, monkeypatch):
    item = _tarea()
    env = _Entorno(app, monkeypatch, item)
    entrega = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=env.estudiante_id, current_version=2, submitted_at=_ahora(), is_late=False,
    )
    viejo = _archivo_guardado(entrega.id, version=1)
    firmadas = []
    with app.app_context():
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=entrega))
        monkeypatch.setattr(cc_routes.SubmissionFile, "query", _query(first=viejo))
        monkeypatch.setattr(
            cc_routes.storage, "url_descarga",
            lambda clave, nombre, mime_type=None, expira=None: firmadas.append((clave, nombre, expira)) or "https://r2.example/x",
        )

    res = client.get(f"{env.ruta}/entregas/{entrega.id}/archivos/{viejo.id}/descarga", headers=env.headers)

    assert res.status_code == 200
    body = res.get_json()
    assert body["url"] == "https://r2.example/x" and body["name"] == "informe.pdf"
    assert firmadas == [("usuarios/x/abc.pdf", "informe.pdf", body["expires_in"])]
    assert "usuarios/x/abc.pdf" not in str(body)


def test_un_estudiante_no_descarga_archivos_de_la_entrega_de_otro(app, client, monkeypatch):
    item = _tarea()
    env = _Entorno(app, monkeypatch, item)
    ajena = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=uuid.uuid4(), current_version=1, submitted_at=_ahora(), is_late=False,
    )
    archivo = _archivo_guardado(ajena.id)
    with app.app_context():
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=ajena))
        monkeypatch.setattr(cc_routes.SubmissionFile, "query", _query(first=archivo))

    res = client.get(f"{env.ruta}/entregas/{ajena.id}/archivos/{archivo.id}/descarga", headers=env.headers)

    assert res.status_code == 403


def test_archivo_que_no_es_de_esa_entrega_da_404(app, client, monkeypatch):
    item = _tarea()
    env = _Entorno(app, monkeypatch, item)
    entrega = cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item.id, student_id=env.estudiante_id, current_version=1, submitted_at=_ahora(), is_late=False,
    )
    with app.app_context():
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=entrega))
        monkeypatch.setattr(cc_routes.SubmissionFile, "query", _query(first=None))   # no hay tal archivo en ESA entrega

    res = client.get(f"{env.ruta}/entregas/{entrega.id}/archivos/{uuid.uuid4()}/descarga", headers=env.headers)

    assert res.status_code == 404


def test_borrar_la_tarea_quita_de_r2_los_archivos_entregados(app, client, monkeypatch):
    docente_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=docente_id)
    item = _tarea()
    borrados = []
    _preparar_docente(app, monkeypatch, docente_id, curso, item=item)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "_claves_de_entregas", lambda ids: ["usuarios/a/v1.pdf", "usuarios/a/v2.pdf"])
        monkeypatch.setattr(cc_routes.db.session, "delete", lambda obj: None)
        # Las claves se anotan en la cola dentro de la transacción y se borran después del commit.
        cola = ColaR2Falsa(borrar=borrados.append)
        monkeypatch.setattr(cc_routes, "limpieza_r2", cola)

    res = client.delete(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}", headers=_headers(app, "TEACHER", docente_id),
    )

    assert res.status_code == 200
    assert cola.encoladas == ["usuarios/a/v1.pdf", "usuarios/a/v2.pdf"]
    assert borrados == ["usuarios/a/v1.pdf", "usuarios/a/v2.pdf"]
