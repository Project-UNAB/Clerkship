"""Fase 1 — seguridad de matrícula y archivos: modos de matrícula (OPEN,
CODE, APPROVAL), código del curso, solicitudes, validación de archivos por
contenido real, descargas con URL firmada y permisos, cruce bloque-curso y
que el cuestionario no filtre las respuestas correctas. No toca la base real
ni R2 — todo con monkeypatch."""
import base64
import io
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from flask_jwt_extended import create_access_token

import app.routes.curso_contenido as cc_routes
import app.routes.curso_quiz as cq_routes
import app.routes.cursos as cursos_routes
from app import storage
from app.models import AuditLog, Course
from app.services import matricula
from app.services.archivos import ArchivoInvalido, validar_archivo
from tests.fakes import ConsultaFalsa

PDF = b"%PDF-1.4\n%%EOF\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16


def _headers(app, role, identity):
    with app.app_context():
        token = create_access_token(identity=str(identity), additional_claims={"role": role})
    return {"Authorization": f"Bearer {token}"}


def _query(first=None, count=0, todos=None):
    """Query falsa: cualquier filter_by/filter/order_by devuelve lo mismo."""
    q = SimpleNamespace(first=lambda: first, one=lambda: first, count=lambda: count, all=lambda: todos or [])
    q.filter_by = lambda **kw: q
    q.filter = lambda *a: q
    q.order_by = lambda *a: q
    q.with_for_update = lambda **kw: q
    q.populate_existing = lambda: q
    return q


def _entrega_nueva(item_id, student_id, ahora, es_tardia):
    """Lo que devuelve el upsert de la entrega cuando el estudiante no había entregado."""
    return cc_routes.AssignmentSubmission(
        id=uuid.uuid4(), item_id=item_id, student_id=student_id, current_version=0, submitted_at=ahora, is_late=es_tardia,
    )


@pytest.fixture(autouse=True)
def _bloque_del_curso(app, monkeypatch):
    """Por defecto el bloque de la URL sí pertenece al curso. Los tests que
    prueban el cruce bloque-curso vuelven a parchear CourseBlock.query."""
    with app.app_context():
        monkeypatch.setattr(cc_routes.CourseBlock, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes, "_archivos_de_entregas", lambda ids: {})


def _zip(nombres):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zf:
        for nombre in nombres:
            zf.writestr(nombre, "x")
    return buffer.getvalue()


# ─────────────────────────── Matrícula ───────────────────────────

def _preparar_matricula(app, monkeypatch, curso, ya_matriculado=False, solicitud=None):
    estudiante_id = uuid.uuid4()
    agregados = []
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cursos_routes.StudentCourse, "query", _query(first=object() if ya_matriculado else None))
        monkeypatch.setattr(cursos_routes.EnrollmentRequest, "query", _query(first=solicitud))
        # Los registros de auditoria (fase 6) se prueban aparte.
        monkeypatch.setattr(cursos_routes.db.session, "add", lambda o: None if isinstance(o, AuditLog) else agregados.append(o))
        monkeypatch.setattr(cursos_routes.db.session, "commit", lambda: None)
    return estudiante_id, agregados


def _curso(modo="CODE", codigo="ABCD2345", teacher_id=None):
    return SimpleNamespace(id=uuid.uuid4(), teacher_id=teacher_id or uuid.uuid4(), enrollment_mode=modo, enrollment_code=codigo)


def test_matricular_requiere_sesion(client):
    res = client.post("/api/cursos/11111111-1111-1111-1111-111111111111/matricular", json={})
    assert res.status_code == 401


def test_matricular_rechaza_docente(app, client):
    res = client.post(
        "/api/cursos/11111111-1111-1111-1111-111111111111/matricular",
        json={}, headers=_headers(app, "TEACHER", uuid.uuid4()),
    )
    assert res.status_code == 403


@pytest.mark.parametrize("cuerpo", [None, {}, {"code": ""}, {"code": "ZZZZ9999"}, {"code": "ABCD234"}])
def test_matricular_modo_code_sin_codigo_correcto_da_403(app, client, monkeypatch, cuerpo):
    curso = _curso()
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json=cuerpo, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 403
    assert agregados == []
    # El error nunca devuelve el código real.
    assert "ABCD2345" not in res.get_data(as_text=True)


def test_matricular_modo_code_con_codigo_desactivado_da_403(app, client, monkeypatch):
    curso = _curso(codigo=None)
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    for cuerpo in ({}, {"code": ""}, {"code": "None"}, {"code": "null"}):
        res = client.post(f"/api/cursos/{curso.id}/matricular", json=cuerpo, headers=_headers(app, "STUDENT", estudiante_id))
        assert res.status_code == 403
    assert agregados == []


def test_matricular_modo_code_con_codigo_correcto_matricula(app, client, monkeypatch):
    curso = _curso()
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    # Se acepta en minúsculas y con guion o espacios: es el mismo código.
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={"code": " abcd-2345 "}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 201
    assert res.get_json()["status"] == "ENROLLED"
    assert len(agregados) == 1
    assert str(agregados[0].student_id) == str(estudiante_id)


def test_matricular_curso_sin_modo_se_trata_como_code(app, client, monkeypatch):
    curso = _curso(modo=None, codigo=None)
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 403
    assert agregados == []


def test_matricular_modo_open_matricula_sin_codigo(app, client, monkeypatch):
    curso = _curso(modo="OPEN", codigo=None)
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 201
    assert len(agregados) == 1


def test_matricular_ya_matriculado_da_409(app, client, monkeypatch):
    curso = _curso(modo="OPEN")
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso, ya_matriculado=True)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 409
    assert agregados == []


def test_matricular_modo_approval_crea_solicitud_y_no_matricula(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso)
    # Ni con el código del curso se salta la aprobación del docente.
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={"code": "ABCD2345"}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 202
    assert res.get_json()["status"] == "PENDING"
    assert len(agregados) == 1
    assert isinstance(agregados[0], cursos_routes.EnrollmentRequest)
    assert agregados[0].status == "PENDING"


def test_matricular_modo_approval_repetir_no_duplica_la_solicitud(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    solicitud = SimpleNamespace(status="PENDING")
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso, solicitud=solicitud)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 202
    assert agregados == []


def test_matricular_modo_approval_rechazada_vuelve_a_pendiente(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    solicitud = SimpleNamespace(status="REJECTED", created_at=None, resolved_at=datetime.now(timezone.utc), resolved_by=uuid.uuid4())
    estudiante_id, agregados = _preparar_matricula(app, monkeypatch, curso, solicitud=solicitud)
    res = client.post(f"/api/cursos/{curso.id}/matricular", json={}, headers=_headers(app, "STUDENT", estudiante_id))
    assert res.status_code == 202
    assert solicitud.status == "PENDING"
    assert solicitud.resolved_by is None
    # Sigue sin estar matriculado.
    assert agregados == []


def test_course_to_dict_no_expone_el_codigo():
    curso = Course(id=uuid.uuid4(), teacher_id=uuid.uuid4(), name="Gastro", enrollment_mode="CODE", enrollment_code="ABCD2345")
    d = curso.to_dict()
    assert d["enrollment_mode"] == "CODE"
    assert "enrollment_code" not in d
    assert "ABCD2345" not in str(d)


def test_codigo_generado_y_comparacion():
    codigo = matricula.generar_codigo()
    assert len(codigo) == matricula.LARGO_CODIGO
    assert set(codigo) <= set(matricula.ALFABETO_CODIGO)
    assert matricula.generar_codigo() != matricula.generar_codigo()
    assert matricula.codigo_coincide(codigo, codigo.lower())
    assert not matricula.codigo_coincide(codigo, None)
    assert not matricula.codigo_coincide(None, None)
    assert not matricula.codigo_coincide(None, "")
    assert not matricula.codigo_coincide("", "")


# ─────────────────── Código y solicitudes (docente) ───────────────────

RUTAS_DOCENTE = [
    ("get", "/matricula"),
    ("patch", "/matricula"),
    ("post", "/matricula/codigo"),
    ("delete", "/matricula/codigo"),
    ("get", "/solicitudes"),
    ("post", "/solicitudes/44444444-4444-4444-4444-444444444444/aprobar"),
    ("post", "/solicitudes/44444444-4444-4444-4444-444444444444/rechazar"),
]


@pytest.mark.parametrize("method,sufijo", RUTAS_DOCENTE)
def test_rutas_de_matricula_del_docente_requieren_sesion(client, method, sufijo):
    res = getattr(client, method)(f"/api/cursos/11111111-1111-1111-1111-111111111111{sufijo}", json={"enrollment_mode": "OPEN"})
    assert res.status_code == 401


@pytest.mark.parametrize("method,sufijo", RUTAS_DOCENTE)
def test_rutas_de_matricula_del_docente_rechazan_estudiante(app, client, method, sufijo):
    res = getattr(client, method)(
        f"/api/cursos/11111111-1111-1111-1111-111111111111{sufijo}",
        json={"enrollment_mode": "OPEN"}, headers=_headers(app, "STUDENT", uuid.uuid4()),
    )
    assert res.status_code == 403


@pytest.mark.parametrize("method,sufijo", RUTAS_DOCENTE)
def test_rutas_de_matricula_rechazan_docente_que_no_es_dueno(app, client, monkeypatch, method, sufijo):
    curso = _curso()
    otro_docente = uuid.uuid4()
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=otro_docente, role="TEACHER"))
        monkeypatch.setattr(cursos_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
    res = getattr(client, method)(
        f"/api/cursos/{curso.id}{sufijo}",
        json={"enrollment_mode": "OPEN"}, headers=_headers(app, "TEACHER", otro_docente),
    )
    assert res.status_code == 403
    assert "ABCD2345" not in res.get_data(as_text=True)
    assert curso.enrollment_mode == "CODE"
    assert curso.enrollment_code == "ABCD2345"


def _preparar_docente(app, monkeypatch, curso, solicitud=None, matricula_existente=None):
    agregados = []
    with app.app_context():
        monkeypatch.setattr(cursos_routes, "get_current_user", lambda: SimpleNamespace(id=curso.teacher_id, role="TEACHER"))
        # get() para el curso; filter_by() para comprobar que el código nuevo no esté en uso.
        consulta_curso = ConsultaFalsa()          # nadie más tiene el código nuevo
        consulta_curso.get = lambda _id: curso
        monkeypatch.setattr(cursos_routes.Course, "query", consulta_curso)
        monkeypatch.setattr(cursos_routes.EnrollmentRequest, "query", _query(first=solicitud, count=3))
        monkeypatch.setattr(cursos_routes.StudentCourse, "query", _query(first=matricula_existente))
        monkeypatch.setattr(cursos_routes.User, "query", SimpleNamespace(get=lambda _id: None))
        # Los registros de auditoria (fase 6) se prueban aparte.
        monkeypatch.setattr(cursos_routes.db.session, "add", lambda o: None if isinstance(o, AuditLog) else agregados.append(o))
        monkeypatch.setattr(cursos_routes.db.session, "commit", lambda: None)
    return _headers(app, "TEACHER", curso.teacher_id), agregados


def test_docente_ve_su_codigo(app, client, monkeypatch):
    curso = _curso()
    headers, _ = _preparar_docente(app, monkeypatch, curso)
    res = client.get(f"/api/cursos/{curso.id}/matricula", headers=headers)
    assert res.status_code == 200
    assert res.get_json() == {
        "course_id": str(curso.id), "enrollment_mode": "CODE", "enrollment_code": "ABCD2345", "pending_requests": 3,
    }


def test_docente_regenera_el_codigo(app, client, monkeypatch):
    curso = _curso()
    headers, _ = _preparar_docente(app, monkeypatch, curso)
    res = client.post(f"/api/cursos/{curso.id}/matricula/codigo", headers=headers)
    assert res.status_code == 200
    nuevo = res.get_json()["enrollment_code"]
    assert nuevo and nuevo != "ABCD2345"
    assert curso.enrollment_code == nuevo
    # El código viejo deja de servir de inmediato.
    assert not matricula.codigo_coincide(curso.enrollment_code, "ABCD2345")


def test_docente_desactiva_el_codigo(app, client, monkeypatch):
    curso = _curso()
    headers, _ = _preparar_docente(app, monkeypatch, curso)
    res = client.delete(f"/api/cursos/{curso.id}/matricula/codigo", headers=headers)
    assert res.status_code == 200
    assert res.get_json()["enrollment_code"] is None
    assert curso.enrollment_code is None


def test_docente_cambia_el_modo_y_code_genera_codigo_si_no_hay(app, client, monkeypatch):
    curso = _curso(modo="OPEN", codigo=None)
    headers, _ = _preparar_docente(app, monkeypatch, curso)
    res = client.patch(f"/api/cursos/{curso.id}/matricula", json={"enrollment_mode": "CODE"}, headers=headers)
    assert res.status_code == 200
    assert curso.enrollment_mode == "CODE"
    assert curso.enrollment_code

    res = client.patch(f"/api/cursos/{curso.id}/matricula", json={"enrollment_mode": "APPROVAL"}, headers=headers)
    assert res.status_code == 200
    assert curso.enrollment_mode == "APPROVAL"


def test_docente_no_puede_poner_un_modo_inventado(app, client, monkeypatch):
    curso = _curso()
    headers, _ = _preparar_docente(app, monkeypatch, curso)
    res = client.patch(f"/api/cursos/{curso.id}/matricula", json={"enrollment_mode": "PUBLIC"}, headers=headers)
    assert res.status_code in (400, 422)
    assert curso.enrollment_mode == "CODE"


def _solicitud(curso, status="PENDING"):
    s = SimpleNamespace(id=uuid.uuid4(), course_id=curso.id, student_id=uuid.uuid4(), status=status, resolved_at=None, resolved_by=None)
    s.to_dict = lambda estudiante=None, curso=None: {"id": str(s.id), "status": s.status}
    return s


def test_aprobar_solicitud_matricula_al_estudiante(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    solicitud = _solicitud(curso)
    headers, agregados = _preparar_docente(app, monkeypatch, curso, solicitud=solicitud)
    res = client.post(f"/api/cursos/{curso.id}/solicitudes/{solicitud.id}/aprobar", headers=headers)
    assert res.status_code == 200
    assert solicitud.status == "APPROVED"
    assert str(solicitud.resolved_by) == str(curso.teacher_id)
    assert len(agregados) == 1
    assert str(agregados[0].student_id) == str(solicitud.student_id)


def test_rechazar_solicitud_no_matricula(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    solicitud = _solicitud(curso)
    headers, agregados = _preparar_docente(app, monkeypatch, curso, solicitud=solicitud)
    res = client.post(f"/api/cursos/{curso.id}/solicitudes/{solicitud.id}/rechazar", headers=headers)
    assert res.status_code == 200
    assert solicitud.status == "REJECTED"
    assert agregados == []


def test_resolver_solicitud_ya_resuelta_da_409(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    solicitud = _solicitud(curso, status="REJECTED")
    headers, agregados = _preparar_docente(app, monkeypatch, curso, solicitud=solicitud)
    res = client.post(f"/api/cursos/{curso.id}/solicitudes/{solicitud.id}/aprobar", headers=headers)
    assert res.status_code == 409
    assert solicitud.status == "REJECTED"
    assert agregados == []


def test_resolver_solicitud_de_otro_curso_da_404(app, client, monkeypatch):
    curso = _curso(modo="APPROVAL")
    filtros = {}
    headers, agregados = _preparar_docente(app, monkeypatch, curso)

    def filter_by(**kw):
        filtros.update(kw)
        return _query(first=None)

    with app.app_context():
        monkeypatch.setattr(cursos_routes.EnrollmentRequest, "query", SimpleNamespace(filter_by=filter_by))
    res = client.post(f"/api/cursos/{curso.id}/solicitudes/44444444-4444-4444-4444-444444444444/aprobar", headers=headers)
    assert res.status_code == 404
    # La búsqueda va atada al curso de la URL, no solo al id de la solicitud.
    assert filtros["course_id"] == curso.id
    assert agregados == []


# ─────────────────────────── Validación de archivos ───────────────────────────

def test_validar_archivo_acepta_tipos_reales():
    assert validar_archivo("informe.pdf", PDF) == "application/pdf"
    assert validar_archivo("FOTO.PNG", PNG) == "image/png"
    assert validar_archivo("foto.jpeg", b"\xff\xd8\xff\xe0" + b"\x00" * 8) == "image/jpeg"
    assert validar_archivo("notas.txt", "Paciente con dolor epigástrico\n".encode("utf-8")) == "text/plain"
    docx = _zip(["[Content_Types].xml", "word/document.xml"])
    assert validar_archivo("historia.docx", docx).endswith("wordprocessingml.document")


@pytest.mark.parametrize("nombre,contenido", [
    ("malware.pdf", b"MZ\x90\x00\x03\x00\x00\x00"),            # ejecutable con extensión .pdf
    ("pagina.pdf", b"<html><script>alert(1)</script></html>"),  # HTML disfrazado de PDF
    ("foto.png", PDF),                                          # tipo real distinto a la extensión
    ("foto.jpg", PNG),
    ("script.txt", b"MZ\x90\x00\x03\x00\x00\x00"),              # binario como texto
    ("vacio.pdf", b""),
    ("informe.docx", b"PK\x03\x04no-es-un-zip"),
])
def test_validar_archivo_rechaza_contenido_que_no_coincide(nombre, contenido):
    with pytest.raises(ArchivoInvalido):
        validar_archivo(nombre, contenido)


@pytest.mark.parametrize("nombre", [
    "shell.php", "pagina.html", "imagen.svg", "virus.exe", "script.js", "macro.docm",
    "sin_extension", ".pdf", "doble.pdf.exe", "truco.pdf\x00.exe", "informe.pdf ",
])
def test_validar_archivo_rechaza_extensiones_fuera_de_la_lista(nombre):
    # "informe.pdf " (con espacio) sí es un PDF válido: se recorta el nombre.
    if nombre.strip() == "informe.pdf":
        assert validar_archivo(nombre, PDF) == "application/pdf"
        return
    with pytest.raises(ArchivoInvalido):
        validar_archivo(nombre, PDF)


def test_validar_archivo_rechaza_zip_que_no_es_office_y_docx_con_macros():
    with pytest.raises(ArchivoInvalido):
        validar_archivo("comprimido.docx", _zip(["cualquier.txt"]))
    with pytest.raises(ArchivoInvalido):
        validar_archivo("hoja.xlsx", _zip(["[Content_Types].xml", "word/document.xml"]))
    with pytest.raises(ArchivoInvalido):
        validar_archivo("macro.docx", _zip(["[Content_Types].xml", "word/document.xml", "word/vbaProject.bin"]))


def test_clave_en_r2_no_usa_el_nombre_original():
    owner = uuid.uuid4()
    clave = storage.nueva_clave(str(owner), "application/pdf")
    assert clave.startswith(f"usuarios/{owner}/")
    assert clave.endswith(".pdf")
    nombre = clave.rsplit("/", 1)[1][:-4]
    assert len(nombre) == 32 and int(nombre, 16) >= 0
    assert clave != storage.nueva_clave(str(owner), "application/pdf")


def test_content_disposition_limpia_el_nombre():
    cabecera = storage._content_disposition('..\\..\\etc/pass"wd\r\nSet-Cookie: x=1;.pdf')
    assert cabecera.startswith("attachment; ")
    assert "\r" not in cabecera and "\n" not in cabecera
    assert "/" not in cabecera.split("filename*=")[0]
    assert "\\" not in cabecera
    assert cabecera.count('"') == 2
    assert storage._content_disposition("") .startswith('attachment; filename="archivo"')
    assert "filename*=UTF-8''cl%C3%ADnica.pdf" in storage._content_disposition("clínica.pdf")


def test_url_descarga_firma_con_expiracion_corta_y_como_adjunto(monkeypatch):
    llamadas = {}

    class ClienteFalso:
        def generate_presigned_url(self, operacion, Params, ExpiresIn):
            llamadas.update(operacion=operacion, params=Params, expira=ExpiresIn)
            return "https://r2.example/firmada"

    monkeypatch.setattr(storage, "_client", lambda: ClienteFalso())
    monkeypatch.setenv("R2_BUCKET", "bucket-de-prueba")
    url = storage.url_descarga("usuarios/x/abc.pdf", "informe.pdf", mime_type="text/html", expira=storage.DESCARGA_CURSO_TTL_SECONDS)
    assert url == "https://r2.example/firmada"
    assert llamadas["operacion"] == "get_object"
    assert 5 * 60 <= llamadas["expira"] <= 15 * 60
    assert llamadas["params"]["ResponseContentDisposition"].startswith("attachment;")
    # Un tipo fuera de la lista nunca se sirve como tal (p. ej. text/html).
    assert llamadas["params"]["ResponseContentType"] == "application/octet-stream"


# ─────────────────────────── Subidas ───────────────────────────

def _b64(contenido: bytes) -> str:
    return base64.b64encode(contenido).decode("ascii")


def test_entregar_tarea_con_archivo_disfrazado_da_415(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", open_at=None, due_at=None, allow_late=False)
    subidos = []
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=None))
        monkeypatch.setattr(cc_routes.storage, "subir_bytes", lambda *a, **kw: subidos.append(a))

    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas",
        # El cliente jura que es PDF; el contenido es un ejecutable.
        json={"name": "tarea.pdf", "mime_type": "application/pdf", "file_base64": _b64(b"MZ\x90\x00\x03\x00\x00\x00")},
        headers=_headers(app, "STUDENT", estudiante_id),
    )
    assert res.status_code == 415
    assert subidos == []


def test_entregar_tarea_guarda_el_mime_real_y_clave_aleatoria(app, client, monkeypatch):
    estudiante_id = uuid.uuid4()
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT", open_at=None, due_at=None, allow_late=False)
    subidos = []
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: SimpleNamespace(id=estudiante_id, role="STUDENT"))
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes, "_entrega_bloqueada", _entrega_nueva)
        monkeypatch.setattr(cc_routes.storage, "subir_bytes", lambda clave, contenido, mime: subidos.append((clave, mime)))
        monkeypatch.setattr(cc_routes.db.session, "add", lambda *a: None)
        monkeypatch.setattr(cc_routes.db.session, "flush", lambda: None)
        monkeypatch.setattr(cc_routes.db.session, "commit", lambda: None)

    res = client.post(
        f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas",
        # Nombre con ruta y MIME declarado falso: ninguno de los dos llega a R2.
        json={"name": "../../otro/tarea final.pdf", "mime_type": "text/html", "file_base64": _b64(PDF)},
        headers=_headers(app, "STUDENT", estudiante_id),
    )
    assert res.status_code == 201
    clave, mime = subidos[0]
    assert mime == "application/pdf"
    assert clave.startswith(f"usuarios/{estudiante_id}/") and clave.endswith(".pdf")
    assert "tarea" not in clave and ".." not in clave


# ─────────────────────────── Descargas ───────────────────────────

def _preparar_descarga_entrega(app, monkeypatch, user, curso, entrega, item):
    archivo = SimpleNamespace(
        id=uuid.uuid4(), storage_key="usuarios/x/abc.pdf", nombre="tarea.pdf", mime_type="application/pdf", size_bytes=10,
    )
    firmadas = []

    def url_descarga(clave, nombre, mime_type=None, expira=None):
        firmadas.append((clave, expira))
        return "https://r2.example/firmada"

    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes.AssignmentSubmission, "query", _query(first=entrega))
        monkeypatch.setattr(cc_routes.SubmissionFile, "query", _query(first=archivo))
        # Matriculado en el curso: lo que se prueba es que no baste con eso para ver la entrega de otro.
        monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object()))
        monkeypatch.setattr(cc_routes.storage, "url_descarga", url_descarga)
        monkeypatch.setattr(cc_routes.storage, "descargar_bytes", lambda clave: PDF)
    return firmadas


def _entrega_y_ruta(curso):
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="ASSIGNMENT")
    entrega = SimpleNamespace(id=uuid.uuid4(), item_id=item.id, file_id=None, current_version=1, student_id=uuid.uuid4())
    ruta = f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/entregas/{entrega.id}"
    return item, entrega, ruta


def test_descarga_de_entrega_requiere_sesion(client):
    res = client.get(
        "/api/cursos/11111111-1111-1111-1111-111111111111/bloques/22222222-2222-2222-2222-222222222222"
        "/contenido/33333333-3333-3333-3333-333333333333/entregas/44444444-4444-4444-4444-444444444444/descarga"
    )
    assert res.status_code == 401


@pytest.mark.parametrize("sufijo", ["/descarga", "/archivo"])
def test_estudiante_no_accede_a_la_entrega_de_otro(app, client, monkeypatch, sufijo):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item, entrega, ruta = _entrega_y_ruta(curso)
    otro = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    firmadas = _preparar_descarga_entrega(app, monkeypatch, otro, curso, entrega, item)
    res = client.get(ruta + sufijo, headers=_headers(app, "STUDENT", otro.id))
    assert res.status_code == 403
    assert firmadas == []
    assert "r2.example" not in res.get_data(as_text=True)


def test_docente_de_otro_curso_no_accede_a_la_entrega(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item, entrega, ruta = _entrega_y_ruta(curso)
    otro = SimpleNamespace(id=uuid.uuid4(), role="TEACHER")
    firmadas = _preparar_descarga_entrega(app, monkeypatch, otro, curso, entrega, item)
    res = client.get(ruta + "/descarga", headers=_headers(app, "TEACHER", otro.id))
    assert res.status_code == 403
    assert firmadas == []


def test_autor_y_docente_dueno_reciben_url_firmada_corta(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item, entrega, ruta = _entrega_y_ruta(curso)
    for user in (SimpleNamespace(id=entrega.student_id, role="STUDENT"), SimpleNamespace(id=curso.teacher_id, role="TEACHER")):
        firmadas = _preparar_descarga_entrega(app, monkeypatch, user, curso, entrega, item)
        res = client.get(ruta + "/descarga", headers=_headers(app, user.role, user.id))
        assert res.status_code == 200
        body = res.get_json()
        assert body["url"] == "https://r2.example/firmada"
        assert 5 * 60 <= body["expires_in"] <= 15 * 60
        assert firmadas == [("usuarios/x/abc.pdf", body["expires_in"])]
        # La clave interna de R2 no se le devuelve al cliente.
        assert "storage_key" not in body


def _preparar_material(app, monkeypatch, user, curso, matriculado):
    item = SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="DOCUMENT", file_id=uuid.uuid4())
    archivo = SimpleNamespace(storage_key="usuarios/x/guia.pdf", nombre="guia.pdf", mime_type="application/pdf", size_bytes=10)
    with app.app_context():
        monkeypatch.setattr(cc_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cc_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cc_routes.StudentCourse, "query", _query(first=object() if matriculado else None))
        monkeypatch.setattr(cc_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cc_routes.UserFile, "query", SimpleNamespace(get=lambda _id: archivo))
        monkeypatch.setattr(cc_routes.storage, "url_descarga", lambda *a, **kw: "https://r2.example/firmada")
        monkeypatch.setattr(cc_routes.storage, "descargar_bytes", lambda clave: PDF)
    return f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}"


@pytest.mark.parametrize("sufijo", ["/descarga", "/archivo"])
def test_material_rechaza_estudiante_no_matriculado(app, client, monkeypatch, sufijo):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    user = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    ruta = _preparar_material(app, monkeypatch, user, curso, matriculado=False)
    res = client.get(ruta + sufijo, headers=_headers(app, "STUDENT", user.id))
    assert res.status_code == 403


def test_material_estudiante_matriculado_recibe_url_firmada(app, client, monkeypatch):
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    user = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    ruta = _preparar_material(app, monkeypatch, user, curso, matriculado=True)
    res = client.get(ruta + "/descarga", headers=_headers(app, "STUDENT", user.id))
    assert res.status_code == 200
    assert res.get_json()["url"] == "https://r2.example/firmada"


@pytest.mark.parametrize("sufijo", ["/descarga", "/archivo", "/vista-previa"])
def test_material_de_otro_curso_no_se_alcanza_cambiando_el_curso_de_la_url(app, client, monkeypatch, sufijo):
    """El estudiante está matriculado en el curso de la URL, pero el bloque y
    el contenido son de otro curso: tiene que dar 404, no el archivo."""
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    user = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    ruta = _preparar_material(app, monkeypatch, user, curso, matriculado=True)
    with app.app_context():
        monkeypatch.setattr(cc_routes.CourseBlock, "query", _query(first=None))
    res = client.get(ruta + sufijo, headers=_headers(app, "STUDENT", user.id))
    assert res.status_code == 404
    assert "r2.example" not in res.get_data(as_text=True)


# ─────────────────────────── Cuestionarios ───────────────────────────

def _preparar_revision(app, monkeypatch, user, curso, item, intento, abiertos=0, intentos=1):
    pregunta = cq_routes.QuizQuestion(id=uuid.uuid4(), item_id=item.id, type="SINGLE_CHOICE", prompt="P1", points=1, position=0)
    correcta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="A", is_correct=True, position=0)
    incorrecta = cq_routes.QuizChoice(id=uuid.uuid4(), question_id=pregunta.id, text="B", is_correct=False, position=1)

    # Los intentos del estudiante en ese cuestionario: `abiertos` sin entregar
    # (y sin límite de tiempo propio) y el resto ya entregados.
    ahora = datetime.now(timezone.utc)
    suyos = [
        SimpleNamespace(submitted_at=None if n < abiertos else ahora, deadline_at=None, started_at=ahora)
        for n in range(intentos)
    ]

    def filter_by(**kw):
        if "id" in kw:
            return _query(first=intento)
        return _query(todos=suyos)

    with app.app_context():
        monkeypatch.setattr(cq_routes, "get_current_user", lambda: user)
        monkeypatch.setattr(cq_routes.Course, "query", SimpleNamespace(get=lambda _id: curso))
        monkeypatch.setattr(cq_routes.StudentCourse, "query", _query(first=object()))
        monkeypatch.setattr(cq_routes.CourseContentItem, "query", _query(first=item))
        monkeypatch.setattr(cq_routes.QuizAttempt, "query", SimpleNamespace(filter_by=filter_by))
        monkeypatch.setattr(cq_routes.QuizAnswer, "query", _query(todos=[]))
        monkeypatch.setattr(cq_routes, "_preguntas_con_opciones", lambda item_id: [(pregunta, [correcta, incorrecta])])
    return f"/api/cursos/{curso.id}/bloques/{item.block_id}/contenido/{item.id}/intentos/{intento.id}"


def _quiz(max_attempts=3, due_at=None):
    return SimpleNamespace(id=uuid.uuid4(), block_id=uuid.uuid4(), type="QUIZ", max_attempts=max_attempts, due_at=due_at)


def _intento(item, estudiante_id, entregado=True):
    intento = cq_routes.QuizAttempt(id=uuid.uuid4(), item_id=item.id, student_id=estudiante_id, attempt_number=1)
    intento.submitted_at = datetime.now(timezone.utc) if entregado else None
    return intento


def test_intento_abierto_no_devuelve_cuales_son_las_correctas(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz()
    intento = _intento(item, estudiante.id, entregado=False)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, abiertos=1)
    res = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id))
    assert res.status_code == 200
    assert "is_correct" not in res.get_data(as_text=True)


def test_revision_con_intentos_disponibles_no_revela_la_clave(app, client, monkeypatch):
    """Entregar un intento en blanco no sirve para leer las respuestas del siguiente."""
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=3)
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, intentos=1)
    res = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id))
    assert res.status_code == 200
    body = res.get_json()
    assert body["respuestas_reveladas"] is False
    assert all("is_correct" not in c for p in body["preguntas"] for c in p["choices"])


def test_revision_con_otro_intento_abierto_no_revela_la_clave(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    # Aunque ya gastó todos los intentos: uno sigue en curso y todavía lo puede entregar.
    item = _quiz(max_attempts=2)
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, abiertos=1, intentos=2)
    body = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id)).get_json()
    assert body["respuestas_reveladas"] is False
    assert all("is_correct" not in c for p in body["preguntas"] for c in p["choices"])


def test_revision_con_intento_abierto_ya_vencido_si_revela_la_clave(app, client, monkeypatch):
    """Un intento abierto al que se le acabó el plazo ya no sirve para usar la clave."""
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=2, due_at=datetime.now(timezone.utc) - timedelta(days=1))
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, abiertos=1, intentos=2)
    body = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id)).get_json()
    assert body["respuestas_reveladas"] is True


def test_revision_sin_limite_de_intentos_no_revela_la_clave(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=None)
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, intentos=50)
    body = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id)).get_json()
    assert body["respuestas_reveladas"] is False


@pytest.mark.parametrize("max_attempts,due_at", [
    (1, None),                                                   # intentos agotados
    (3, datetime.now(timezone.utc) - timedelta(days=1)),         # plazo cerrado
])
def test_revision_revela_la_clave_cuando_ya_no_puede_responder(app, client, monkeypatch, max_attempts, due_at):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=max_attempts, due_at=due_at)
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento, intentos=1)
    body = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id)).get_json()
    assert body["respuestas_reveladas"] is True
    assert [c["is_correct"] for c in body["preguntas"][0]["choices"]] == [True, False]


def test_estudiante_no_ve_el_intento_de_otro(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=1)
    intento = _intento(item, uuid.uuid4())
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento)
    res = client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id))
    assert res.status_code == 403


def test_cuestionario_de_otro_curso_no_se_alcanza_cambiando_el_curso_de_la_url(app, client, monkeypatch):
    estudiante = SimpleNamespace(id=uuid.uuid4(), role="STUDENT")
    curso = SimpleNamespace(id=uuid.uuid4(), teacher_id=uuid.uuid4())
    item = _quiz(max_attempts=1)
    intento = _intento(item, estudiante.id)
    ruta = _preparar_revision(app, monkeypatch, estudiante, curso, item, intento)
    with app.app_context():
        monkeypatch.setattr(cq_routes.CourseBlock, "query", _query(first=None))
    assert client.get(ruta, headers=_headers(app, "STUDENT", estudiante.id)).status_code == 404
    assert client.post(ruta.rsplit("/", 1)[0], headers=_headers(app, "STUDENT", estudiante.id)).status_code == 404
