from datetime import datetime, timezone as _tz

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy.exc import IntegrityError

from app import db, limiter, storage
from app.models import (
    AssignmentSubmission,
    Consultation,
    Course,
    CourseBlock,
    CourseContentItem,
    EnrollmentRequest,
    Student,
    StudentCourse,
    SubmissionFile,
    User,
    UserFile,
)
from app.schemas import (
    ActualizarCursoRequest,
    ActualizarMatriculaRequest,
    AgregarEstudianteRequest,
    CourseResponse,
    CreateCourseRequest,
    EnrollmentResponse,
    MatricularRequest,
    validate_body,
)
from app.services import auditoria, limites, limpieza_r2, paginacion, portadas, tareas
from app.services.matricula import codigo_coincide, generar_codigo
from app.services.sanitize import sanitizar_html
from app.utils import get_current_user, role_required

cursos_bp = Blueprint("cursos", __name__)


def _curso_del_docente(course_id, user):
    """(curso, None) si existe y `user` es su docente dueño; si no, (None, respuesta)."""
    course = Course.query.get(course_id)
    if course is None:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404)
    if str(course.teacher_id) != str(user.id):
        return None, (jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403)
    return course, None


def _codigo_nuevo() -> str:
    """Código de matrícula que no esté en uso por otro curso."""
    for _ in range(10):
        codigo = generar_codigo()
        # Incluye los cursos en la papelera: el UNIQUE de la base también los cuenta.
        if Course.query.execution_options(include_deleted=True).filter_by(enrollment_code=codigo).first() is None:
            return codigo
    raise RuntimeError("No se pudo generar un código de matrícula único")


def _auditar_codigo(course, codigo_anterior):
    """El código es un secreto: en el registro queda enmascarado."""
    auditoria.registrar(
        auditoria.ENROLLMENT_CODE_CHANGE, "course", course.id,
        old={"enrollment_code": auditoria.enmascarar_codigo(codigo_anterior)},
        new={"enrollment_code": auditoria.enmascarar_codigo(course.enrollment_code)},
    )


def _matricula_dict(course):
    """Configuración de matrícula del curso — incluye el código, así que solo
    se le devuelve al docente dueño."""
    pendientes = EnrollmentRequest.query.filter_by(course_id=course.id, status="PENDING").count()
    return {
        "course_id": str(course.id),
        "enrollment_mode": course.enrollment_mode or "CODE",
        "enrollment_code": course.enrollment_code,
        "pending_requests": pendientes,
    }


def _resolver_solicitud_pendiente(course_id, student_id, estado, resuelta_por):
    """Si el estudiante tenía una solicitud pendiente en el curso, la cierra."""
    solicitud = EnrollmentRequest.query.filter_by(course_id=course_id, student_id=student_id).first()
    if solicitud is not None and solicitud.status == "PENDING":
        solicitud.status = estado
        solicitud.resolved_at = datetime.now(_tz.utc)
        solicitud.resolved_by = resuelta_por


@cursos_bp.get("")
@jwt_required()
def listar():
    """Catálogo de cursos (lo usa "Unirme a un curso"). Devuelve como mucho
    PER_PAGE_MAXIMO; con ?page / ?per_page responde paginado."""
    query = Course.query.order_by(Course.created_at.desc(), Course.id.asc())
    if paginacion.pidio_paginacion():
        page, per_page = paginacion.parametros()
        courses, total = paginacion.paginar(query, page, per_page)
        return jsonify({"cursos": [c.to_dict() for c in courses], **paginacion.meta(total, page, per_page)}), 200
    return jsonify([c.to_dict() for c in query.limit(paginacion.PER_PAGE_MAXIMO).all()]), 200


_SIN_PENDIENTES = {"pending_assignments": 0, "next_due_at": None, "next_due_title": None}


def _indicadores_del_estudiante(course_ids, student_id) -> dict:
    """{course_id: {pending_assignments, next_due_at, next_due_title}} para
    las cards del estudiante, en DOS consultas para todos sus cursos.

    Pendiente = tarea que ya abrió, todavía recibe entregas (a tiempo o como
    tardía) y que el estudiante no ha entregado. La próxima
    fecha es el cierre más cercano entre esas."""
    course_ids = list(course_ids)
    if not course_ids:
        return {}

    tareas_de_los_cursos = (
        db.session.query(CourseContentItem, CourseBlock.course_id)
        .join(CourseBlock, CourseContentItem.block_id == CourseBlock.id)
        .filter(CourseBlock.course_id.in_(course_ids), CourseContentItem.type == "ASSIGNMENT")
        .all()
    )
    if not tareas_de_los_cursos:
        return {}

    entregadas = {
        item_id for (item_id,) in db.session.query(AssignmentSubmission.item_id).filter(
            AssignmentSubmission.student_id == student_id,
            AssignmentSubmission.item_id.in_([item.id for item, _c in tareas_de_los_cursos]),
            AssignmentSubmission.current_version > 0,
        ).all()
    }

    ahora = datetime.now(_tz.utc)
    resultado = {}
    for item, course_id in tareas_de_los_cursos:
        # Ni las ya entregadas, ni las que cerraron, ni las que todavía no abren.
        if item.id in entregadas or tareas.estado_ventana(item, ahora) not in ("OPEN", "LATE"):
            continue
        datos = resultado.setdefault(str(course_id), dict(_SIN_PENDIENTES))
        datos["pending_assignments"] += 1
        if item.due_at is None:
            continue
        cierre = item.due_at if item.due_at.tzinfo else item.due_at.replace(tzinfo=_tz.utc)
        if cierre > ahora and (datos["next_due_at"] is None or cierre < datos["_cierre"]):
            datos["_cierre"] = cierre
            datos["next_due_at"] = cierre.astimezone(_tz.utc).isoformat()
            datos["next_due_title"] = item.title
    for datos in resultado.values():
        datos.pop("_cierre", None)
    return resultado


@cursos_bp.get("/mios")
@jwt_required()
def listar_mios():
    """Los cursos del usuario: los que dicta (docente) o en los que está
    matriculado (estudiante). Con ?page / ?per_page responde paginado:
    {cursos, total, page, per_page, pages}. Sin esos parámetros mantiene la
    forma anterior (un arreglo), limitado a PER_PAGE_MAXIMO cursos."""
    user = get_current_user()

    if user.role == "TEACHER":
        query = Course.query.filter_by(teacher_id=user.id)
    else:
        query = (
            Course.query.join(StudentCourse, StudentCourse.course_id == Course.id)
            .filter(StudentCourse.student_id == user.id)
        )
    query = query.order_by(Course.created_at.desc(), Course.id.asc())

    paginado = paginacion.pidio_paginacion()
    if paginado:
        page, per_page = paginacion.parametros()
        courses, total = paginacion.paginar(query, page, per_page)
    else:
        courses = query.limit(paginacion.PER_PAGE_MAXIMO).all()

    resultado = [c.to_dict() for c in courses]
    if user.role != "TEACHER" and courses:
        # Los nombres de los docentes, en UNA consulta (antes era una por curso).
        docente_ids = {c.teacher_id for c in courses if c.teacher_id}
        docentes = {str(u.id): u for u in User.query.filter(User.id.in_(docente_ids)).all()} if docente_ids else {}
        indicadores = _indicadores_del_estudiante([c.id for c in courses], user.id)
        for curso, d in zip(courses, resultado):
            docente = docentes.get(str(curso.teacher_id))
            d["teacher_name"] = f"{docente.first_name} {docente.last_name}" if docente else None
            # Para la card: cuántas tareas le faltan y cuál cierra primero.
            d.update(indicadores.get(str(curso.id), _SIN_PENDIENTES))

    if paginado:
        return jsonify({"cursos": resultado, **paginacion.meta(total, page, per_page)}), 200
    return jsonify(resultado), 200


def _es_docente_dueno(user, course) -> bool:
    return user.role == "TEACHER" and str(course.teacher_id) == str(user.id)


def _borrar_de_r2(clave):
    """Borra un objeto de R2 después del commit que lo dejó sin referencias.
    Si R2 falla no tumba la petición: la clave queda anotada para reintentar."""
    limpieza_r2.borrar_o_encolar(clave, "portada")


def _borrar_portada_de_r2(clave_portada):
    """Quita de R2 la portada y su miniatura."""
    if clave_portada:
        _borrar_de_r2(clave_portada)
        _borrar_de_r2(portadas.clave_miniatura(clave_portada))


def _error_portada(err: portadas.PortadaInvalida):
    titulos = {400: "Bad Request", 413: "Payload Too Large", 415: "Unsupported Media Type"}
    return jsonify({
        "error": titulos.get(err.status_code, "Bad Request"),
        "message": str(err),
        "status_code": err.status_code,
        "code": err.codigo,
    }), err.status_code


def _portada_recibida():
    """La imagen que vino en el campo "cover" del formulario, ya validada y
    procesada: ((portada, miniatura), None). (None, None) si no vino imagen,
    y (None, respuesta de error) si vino pero no sirve."""
    archivo = request.files.get("cover")
    if archivo is None or not archivo.filename:
        return None, None

    # Se lee como mucho un byte más del máximo: si llega, ya se sabe que se pasó
    # sin cargar en memoria un archivo arbitrariamente grande.
    contenido = archivo.stream.read(portadas.tamano_maximo_bytes() + 1)
    try:
        return portadas.procesar_portada(
            archivo.filename, contenido, request.form.get("focus_x"), request.form.get("focus_y"),
        ), None
    except portadas.PortadaInvalida as err:
        return None, _error_portada(err)


def _subir_portada(imagenes):
    """Sube portada y miniatura con nombre aleatorio. Devuelve (clave, None), o
    (None, respuesta) si R2 no está configurado. Si falla a medias no deja
    nada subido."""
    portada, miniatura = imagenes
    clave, clave_mini = portadas.claves_nuevas()
    try:
        storage.subir_bytes(clave, portada, portadas.MIME_SALIDA)
        storage.subir_bytes(clave_mini, miniatura, portadas.MIME_SALIDA)
    except storage.StorageNotConfigured as serr:
        return None, (jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503)
    except Exception:
        _borrar_portada_de_r2(clave)
        raise
    return clave, None


@cursos_bp.post("")
@role_required("TEACHER")
@limiter.limit(limites.SUBIDA_PORTADA, key_func=limites.usuario_o_ip, exempt_when=limites.sin_archivo_de_portada)
@validate_body(CreateCourseRequest, multipart=True)
def crear(validated_body: CreateCourseRequest):
    """Crea el curso. Acepta JSON, o multipart/form-data con los mismos campos
    y la imagen de portada en "cover" (JPG, PNG o WebP)."""
    user = get_current_user()

    # La imagen se valida antes de crear nada: una portada inválida no deja curso a medias.
    imagenes, err = _portada_recibida()
    if err:
        return err
    clave_portada = None
    if imagenes is not None:
        clave_portada, err = _subir_portada(imagenes)
        if err:
            return err

    try:
        course = Course(
            teacher_id=user.id,
            name=validated_body.name.strip(),
            description=sanitizar_html(validated_body.description) if validated_body.description else None,
            academic_period=validated_body.academic_period,
            # Por defecto nadie entra sin el código que reparte el docente.
            enrollment_mode="CODE",
            enrollment_code=_codigo_nuevo(),
            cover_image_key=clave_portada,
        )
        db.session.add(course)
        db.session.commit()
    except Exception:
        db.session.rollback()
        _borrar_portada_de_r2(clave_portada)
        raise

    return jsonify(course.to_dict()), 201


@cursos_bp.patch("/<course_id>")
@role_required("TEACHER")
@limiter.limit(limites.SUBIDA_PORTADA, key_func=limites.usuario_o_ip, exempt_when=limites.sin_archivo_de_portada)
@validate_body(ActualizarCursoRequest, multipart=True)
def actualizar(course_id, validated_body: ActualizarCursoRequest):
    """El docente dueño edita su curso — nombre, descripción (HTML del
    editor WYSIWYG, se sanitiza igual que avisos y notas de bloque), período
    y, si viene por multipart en el campo "cover", la imagen de portada."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if not _es_docente_dueno(user, course):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    imagenes, err = _portada_recibida()
    if err:
        return err
    clave_nueva = None
    if imagenes is not None:
        clave_nueva, err = _subir_portada(imagenes)
        if err:
            return err
    clave_anterior = course.cover_image_key if clave_nueva else None

    try:
        if validated_body.name is not None:
            course.name = validated_body.name.strip()
        if validated_body.description is not None:
            course.description = sanitizar_html(validated_body.description)
        if validated_body.academic_period is not None:
            course.academic_period = validated_body.academic_period
        if clave_nueva:
            course.cover_image_key = clave_nueva
        db.session.commit()
    except Exception:
        db.session.rollback()
        _borrar_portada_de_r2(clave_nueva)
        raise

    # La portada reemplazada se borra de R2 solo con el cambio ya confirmado.
    _borrar_portada_de_r2(clave_anterior)
    return jsonify(course.to_dict()), 200


@cursos_bp.delete("/<course_id>/cover")
@role_required("TEACHER")
def quitar_portada(course_id):
    """El docente dueño quita la portada: el curso vuelve a mostrarse con su
    color e iniciales, y la imagen se borra de R2."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if not _es_docente_dueno(user, course):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    clave_anterior = course.cover_image_key
    if clave_anterior:
        course.cover_image_key = None
        db.session.commit()
        _borrar_portada_de_r2(clave_anterior)
    return jsonify(course.to_dict()), 200


@cursos_bp.get("/<course_id>")
@jwt_required()
def obtener(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({
            "error": "Not Found",
            "message": "Curso no encontrado",
            "status_code": 404
        }), 404
    return jsonify(course.to_dict()), 200


@cursos_bp.post("/<course_id>/matricular")
@role_required("STUDENT")
@limiter.limit(limites.MATRICULA, key_func=limites.usuario_o_ip)
@validate_body(MatricularRequest)
def matricular(course_id, validated_body: MatricularRequest):
    """El estudiante entra a un curso por su cuenta, según enrollment_mode:
    OPEN matricula directo, CODE exige el código del curso y APPROVAL deja una
    solicitud pendiente que resuelve el docente."""
    user = get_current_user()

    course = Course.query.get(course_id)
    if course is None:
        return jsonify({
            "error": "Not Found",
            "message": "Curso no encontrado",
            "status_code": 404
        }), 404

    if StudentCourse.query.filter_by(student_id=user.id, course_id=course_id).first() is not None:
        return jsonify({
            "error": "Conflict",
            "message": "Ya estás matriculado en este curso",
            "status_code": 409
        }), 409

    modo = course.enrollment_mode or "CODE"

    if modo == "APPROVAL":
        solicitud = EnrollmentRequest.query.filter_by(course_id=course_id, student_id=user.id).first()
        if solicitud is None:
            solicitud = EnrollmentRequest(course_id=course_id, student_id=user.id, status="PENDING")
            db.session.add(solicitud)
        elif solicitud.status != "PENDING":
            solicitud.status = "PENDING"
            solicitud.created_at = datetime.now(_tz.utc)
            solicitud.resolved_at = None
            solicitud.resolved_by = None
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
        return jsonify({
            "message": "Solicitud enviada. El docente debe aprobarla para que entres al curso.",
            "status": "PENDING",
            "course_id": str(course_id),
            "student_id": str(user.id),
        }), 202

    if modo == "CODE":
        # Mismo mensaje con código ausente, equivocado o desactivado: no se le
        # dan pistas a quien está probando códigos.
        if not codigo_coincide(course.enrollment_code, validated_body.code):
            return jsonify({
                "error": "Forbidden",
                "message": "Código de matrícula inválido. Pídele el código al docente del curso.",
                "status_code": 403,
            }), 403
    elif modo != "OPEN":
        return jsonify({"error": "Forbidden", "message": "Este curso no admite matrícula", "status_code": 403}), 403

    db.session.add(StudentCourse(student_id=user.id, course_id=course_id))
    auditoria.registrar(
        auditoria.STUDENT_ENROLL, "course", course_id, new={"student_id": user.id, "via": "CODE" if modo == "CODE" else "OPEN"},
    )
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Conflict", "message": "Ya estás matriculado en este curso", "status_code": 409}), 409

    return jsonify({
        "message": "Matrícula registrada exitosamente",
        "status": "ENROLLED",
        "course_id": str(course_id),
        "student_id": str(user.id),
    }), 201


# ─────────────────── Configuración de matrícula (docente dueño) ───────────────────

@cursos_bp.get("/<course_id>/matricula")
@role_required("TEACHER")
def obtener_matricula(course_id):
    """Modo de matrícula y código del curso — solo el docente dueño."""
    course, err = _curso_del_docente(course_id, get_current_user())
    if err:
        return err
    return jsonify(_matricula_dict(course)), 200


@cursos_bp.patch("/<course_id>/matricula")
@role_required("TEACHER")
@validate_body(ActualizarMatriculaRequest)
def actualizar_matricula(course_id, validated_body: ActualizarMatriculaRequest):
    course, err = _curso_del_docente(course_id, get_current_user())
    if err:
        return err

    modo_anterior, codigo_anterior = course.enrollment_mode, course.enrollment_code
    course.enrollment_mode = validated_body.enrollment_mode
    if course.enrollment_mode == "CODE" and not course.enrollment_code:
        course.enrollment_code = _codigo_nuevo()
    if modo_anterior != course.enrollment_mode:
        auditoria.registrar(
            auditoria.ENROLLMENT_MODE_CHANGE, "course", course.id,
            old={"enrollment_mode": modo_anterior}, new={"enrollment_mode": course.enrollment_mode},
        )
    if codigo_anterior != course.enrollment_code:
        _auditar_codigo(course, codigo_anterior)
    db.session.commit()
    return jsonify(_matricula_dict(course)), 200


@cursos_bp.post("/<course_id>/matricula/codigo")
@role_required("TEACHER")
def regenerar_codigo_matricula(course_id):
    """Genera un código nuevo; el anterior deja de servir de inmediato."""
    course, err = _curso_del_docente(course_id, get_current_user())
    if err:
        return err

    codigo_anterior = course.enrollment_code
    course.enrollment_code = _codigo_nuevo()
    _auditar_codigo(course, codigo_anterior)
    db.session.commit()
    return jsonify(_matricula_dict(course)), 200


@cursos_bp.delete("/<course_id>/matricula/codigo")
@role_required("TEACHER")
def desactivar_codigo_matricula(course_id):
    """Deja el curso sin código: en modo CODE nadie se matricula por su
    cuenta hasta que el docente genere uno nuevo."""
    course, err = _curso_del_docente(course_id, get_current_user())
    if err:
        return err

    codigo_anterior = course.enrollment_code
    course.enrollment_code = None
    if codigo_anterior:
        _auditar_codigo(course, codigo_anterior)
    db.session.commit()
    return jsonify(_matricula_dict(course)), 200


# ─────────────────── Solicitudes de matrícula (modo APPROVAL) ───────────────────

@cursos_bp.get("/mis-solicitudes")
@role_required("STUDENT")
def mis_solicitudes():
    """Solicitudes de matrícula del estudiante que siguen sin entrar al curso
    (pendientes o rechazadas)."""
    user = get_current_user()
    solicitudes = (
        EnrollmentRequest.query.filter_by(student_id=user.id)
        .filter(EnrollmentRequest.status.in_(["PENDING", "REJECTED"]))
        .order_by(EnrollmentRequest.created_at.desc())
        .all()
    )
    cursos = {}
    if solicitudes:
        ids = [s.course_id for s in solicitudes]
        cursos = {str(c.id): c for c in Course.query.filter(Course.id.in_(ids)).all()}
    return jsonify({
        "solicitudes": [s.to_dict(curso=cursos.get(str(s.course_id))) for s in solicitudes]
    }), 200


@cursos_bp.get("/<course_id>/solicitudes")
@role_required("TEACHER")
def listar_solicitudes(course_id):
    """Solicitudes pendientes del curso (o ?status=ALL para ver el historial)."""
    course, err = _curso_del_docente(course_id, get_current_user())
    if err:
        return err

    query = EnrollmentRequest.query.filter_by(course_id=course.id)
    if (request.args.get("status") or "PENDING").upper() != "ALL":
        query = query.filter_by(status="PENDING")
    solicitudes = query.order_by(EnrollmentRequest.created_at.asc()).all()

    estudiantes = {}
    if solicitudes:
        ids = [s.student_id for s in solicitudes]
        estudiantes = {str(u.id): u for u in User.query.filter(User.id.in_(ids)).all()}
    return jsonify({
        "solicitudes": [s.to_dict(estudiante=estudiantes.get(str(s.student_id))) for s in solicitudes]
    }), 200


def _resolver_solicitud(course_id, request_id, aprobar: bool):
    user = get_current_user()
    course, err = _curso_del_docente(course_id, user)
    if err:
        return err

    # Se busca por id Y curso: el docente de otro curso no puede resolverla.
    solicitud = EnrollmentRequest.query.filter_by(id=request_id, course_id=course.id).first()
    if solicitud is None:
        return jsonify({"error": "Not Found", "message": "Solicitud no encontrada", "status_code": 404}), 404
    if solicitud.status != "PENDING":
        return jsonify({"error": "Conflict", "message": "Esta solicitud ya fue resuelta", "status_code": 409}), 409

    # La matrícula y el cambio de estado van juntos: o quedan los dos o ninguno.
    try:
        if aprobar and StudentCourse.query.filter_by(student_id=solicitud.student_id, course_id=course.id).first() is None:
            db.session.add(StudentCourse(student_id=solicitud.student_id, course_id=course.id))
        solicitud.status = "APPROVED" if aprobar else "REJECTED"
        solicitud.resolved_at = datetime.now(_tz.utc)
        solicitud.resolved_by = user.id
        auditoria.registrar(
            auditoria.STUDENT_ENROLL if aprobar else auditoria.ENROLLMENT_REQUEST_REJECT, "course", course.id,
            new={"student_id": solicitud.student_id, "via": "APPROVAL", "request_id": solicitud.id},
        )
        db.session.commit()
    except IntegrityError:
        # Dos clics a la vez sobre la misma solicitud: la otra petición ya la matriculó.
        db.session.rollback()
        return jsonify({"error": "Conflict", "message": "Esta solicitud ya fue resuelta", "status_code": 409}), 409
    except Exception:
        db.session.rollback()
        raise

    estudiante = User.query.get(solicitud.student_id)
    return jsonify(solicitud.to_dict(estudiante=estudiante)), 200


@cursos_bp.post("/<course_id>/solicitudes/<request_id>/aprobar")
@role_required("TEACHER")
def aprobar_solicitud(course_id, request_id):
    return _resolver_solicitud(course_id, request_id, aprobar=True)


@cursos_bp.post("/<course_id>/solicitudes/<request_id>/rechazar")
@role_required("TEACHER")
def rechazar_solicitud(course_id, request_id):
    return _resolver_solicitud(course_id, request_id, aprobar=False)


def _consulta_roster(course_id):
    """Matrícula + estudiante + usuario + sus casos clínicos del curso, todo
    en UNA consulta. Los conteos salen de una subconsulta agrupada por
    estudiante (COUNT ... FILTER), unida con LEFT JOIN para que quien no tiene
    casos aparezca en cero. Antes eran dos COUNT por cada estudiante."""
    casos = (
        db.session.query(
            Consultation.student_id.label("student_id"),
            db.func.count().filter(Consultation.status == "COMPLETED").label("completados"),
            db.func.count().filter(Consultation.status == "IN_PROGRESS").label("en_progreso"),
        )
        .filter(Consultation.course_id == course_id)
        .group_by(Consultation.student_id)
        .subquery()
    )
    return (
        db.session.query(
            StudentCourse,
            Student,
            User,
            db.func.coalesce(casos.c.completados, 0),
            db.func.coalesce(casos.c.en_progreso, 0),
        )
        .join(Student, Student.user_id == StudentCourse.student_id)
        .join(User, User.id == Student.user_id)
        .outerjoin(casos, casos.c.student_id == StudentCourse.student_id)
        .filter(StudentCourse.course_id == course_id)
        # El desempate por id deja el orden estable entre páginas.
        .order_by(StudentCourse.enrolled_at.desc(), User.id.asc())
    )


@cursos_bp.get("/<course_id>/estudiantes")
@role_required("TEACHER")
def listar_estudiantes(course_id):
    """Roster del curso: solo lo ve el docente dueño del curso."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    page, per_page = paginacion.parametros()
    filas, total = paginacion.paginar(_consulta_roster(course_id), page, per_page)

    resultado = []
    for matricula, student, estudiante, completados, en_progreso in filas:
        resultado.append({
            "user_id": str(estudiante.id),
            "nombre": f"{estudiante.first_name} {estudiante.last_name}",
            "email": estudiante.email,
            "student_code": student.student_code,
            "enrolled_at": matricula.enrolled_at.isoformat() if matricula.enrolled_at else None,
            "casos_completados": int(completados or 0),
            "casos_en_progreso": int(en_progreso or 0),
        })

    return jsonify({"estudiantes": resultado, **paginacion.meta(total, page, per_page)}), 200


@cursos_bp.post("/<course_id>/estudiantes")
@role_required("TEACHER")
@validate_body(AgregarEstudianteRequest)
def agregar_estudiante(course_id, validated_body: AgregarEstudianteRequest):
    """El docente agrega a un estudiante existente a su curso, por correo.
    No crea la cuenta: el estudiante tiene que haberse registrado antes."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    email = validated_body.email.strip().lower()
    estudiante = User.query.filter_by(email=email, role="STUDENT").first()
    if estudiante is None:
        return jsonify({
            "error": "Not Found",
            "message": "No hay ninguna cuenta de estudiante con ese correo. Pídele que se registre primero.",
            "status_code": 404,
        }), 404

    if StudentCourse.query.filter_by(student_id=estudiante.id, course_id=course_id).first() is not None:
        return jsonify({"error": "Conflict", "message": "Ese estudiante ya está matriculado en este curso.", "status_code": 409}), 409

    try:
        db.session.add(StudentCourse(student_id=estudiante.id, course_id=course_id))
        # Si había pedido entrar (modo APPROVAL), agregarlo a mano la aprueba.
        _resolver_solicitud_pendiente(course_id, estudiante.id, "APPROVED", user.id)
        auditoria.registrar(auditoria.STUDENT_ENROLL, "course", course_id, new={"student_id": estudiante.id, "via": "TEACHER"})
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "Conflict", "message": "Ese estudiante ya está matriculado en este curso.", "status_code": 409}), 409
    except Exception:
        db.session.rollback()
        raise

    student = Student.query.get(estudiante.id)
    return jsonify({
        "user_id": str(estudiante.id),
        "nombre": f"{estudiante.first_name} {estudiante.last_name}",
        "email": estudiante.email,
        "student_code": student.student_code if student else None,
        "casos_completados": 0,
        "casos_en_progreso": 0,
    }), 201


@cursos_bp.delete("/<course_id>/estudiantes/<student_id>")
@role_required("TEACHER")
def quitar_estudiante(course_id, student_id):
    """El docente quita a un estudiante de su curso (no borra su cuenta, ni
    las sesiones que ya haya hecho ahí — solo la matrícula)."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    matricula = StudentCourse.query.filter_by(student_id=student_id, course_id=course_id).first()
    if matricula is None:
        return jsonify({"error": "Not Found", "message": "Ese estudiante no está matriculado en este curso", "status_code": 404}), 404

    db.session.delete(matricula)
    auditoria.registrar(auditoria.STUDENT_REMOVE, "course", course_id, old={"student_id": student_id, "via": "TEACHER"})
    db.session.commit()
    return jsonify({"ok": True}), 200


@cursos_bp.delete("/<course_id>")
@role_required("TEACHER")
def borrar_curso(course_id):
    """Manda el curso a la papelera (borrado suave). Deja de existir para
    estudiantes y listados, pero no se pierde nada: el docente lo puede
    restaurar, o borrarlo definitivamente desde la papelera."""
    user = get_current_user()
    course = Course.query.get(course_id)
    if course is None:
        return jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404
    if str(course.teacher_id) != str(user.id):
        return jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403

    course.marcar_eliminado()
    auditoria.registrar(auditoria.COURSE_DELETE, "course", course.id, old={"name": course.name})
    db.session.commit()
    return jsonify({"ok": True, "deleted_at": course.deleted_at.isoformat(), "restorable": True}), 200


def _curso_en_papelera(course_id, user):
    """(curso, None) si el curso está en la papelera y es de ese docente."""
    course = Course.query.execution_options(include_deleted=True).filter_by(id=course_id).first()
    if course is None or course.deleted_at is None:
        return None, (jsonify({
            "error": "Not Found", "message": "Ese curso no está en la papelera", "status_code": 404,
        }), 404)
    if not _es_docente_dueno(user, course):
        return None, (jsonify({"error": "Forbidden", "message": "No eres el docente de este curso", "status_code": 403}), 403)
    return course, None


@cursos_bp.get("/papelera")
@role_required("TEACHER")
def listar_papelera():
    """Cursos que el docente mandó a la papelera, del más reciente al más viejo."""
    user = get_current_user()
    page, per_page = paginacion.parametros()
    query = (
        Course.query.execution_options(include_deleted=True)
        .filter(Course.teacher_id == user.id, Course.deleted_at.isnot(None))
        .order_by(Course.deleted_at.desc(), Course.id.asc())
    )
    courses, total = paginacion.paginar(query, page, per_page)
    return jsonify({"cursos": [c.to_dict() for c in courses], **paginacion.meta(total, page, per_page)}), 200


@cursos_bp.post("/<course_id>/restaurar")
@role_required("TEACHER")
def restaurar_curso(course_id):
    """Saca el curso de la papelera: vuelve tal como estaba, con sus
    estudiantes, material, entregas y notas."""
    course, err = _curso_en_papelera(course_id, get_current_user())
    if err:
        return err
    course.restaurar()
    auditoria.registrar(auditoria.COURSE_RESTORE, "course", course.id, new={"name": course.name})
    db.session.commit()
    return jsonify(course.to_dict()), 200


def _archivos_del_curso(course_id):
    """Todo lo que el curso tiene en R2: (claves, ids de user_files). Las
    filas de material y de entregas viejas viven en user_files, que no cuelga
    del curso por llave foránea: hay que borrarlas a mano."""
    claves, user_file_ids = [], []

    items = (
        db.session.query(CourseContentItem.id, CourseContentItem.type, CourseContentItem.file_id)
        .join(CourseBlock, CourseContentItem.block_id == CourseBlock.id)
        .filter(CourseBlock.course_id == course_id)
        .all()
    )
    user_file_ids.extend(file_id for _id, tipo, file_id in items if tipo == "DOCUMENT" and file_id)

    tarea_ids = [item_id for item_id, tipo, _f in items if tipo == "ASSIGNMENT"]
    if tarea_ids:
        entregas = (
            db.session.query(AssignmentSubmission.id, AssignmentSubmission.file_id)
            .execution_options(include_deleted=True)  # también las entregas en la papelera
            .filter(AssignmentSubmission.item_id.in_(tarea_ids))
            .all()
        )
        user_file_ids.extend(file_id for _id, file_id in entregas if file_id)
        entrega_ids = [entrega_id for entrega_id, _f in entregas]
        if entrega_ids:
            claves.extend(
                clave for (clave,) in db.session.query(SubmissionFile.file_key)
                .filter(SubmissionFile.submission_id.in_(entrega_ids)).all()
            )

    if user_file_ids:
        claves.extend(
            clave for (clave,) in db.session.query(UserFile.storage_key).filter(UserFile.id.in_(user_file_ids)).all()
        )
    return claves, user_file_ids


@cursos_bp.delete("/<course_id>/permanente")
@role_required("TEACHER")
def borrar_curso_definitivamente(course_id):
    """Borra para siempre un curso que ya está en la papelera, con todo lo que
    cuelga de él (bloques, contenido, entregas, intentos, preguntas, avisos:
    lo hace la base con ON DELETE CASCADE). No se puede si tiene simulaciones
    clínicas: esas sesiones son historial de los estudiantes.

    Los archivos en R2 (material, entregas, portada) se anotan como pendientes
    en la misma transacción y se borran después del commit; lo que R2 no deje
    borrar en el momento queda en la cola y se reintenta."""
    course, err = _curso_en_papelera(course_id, get_current_user())
    if err:
        return err

    simulaciones = db.session.query(db.func.count(Consultation.id)).filter(Consultation.course_id == course.id).scalar()
    if simulaciones:
        return jsonify({
            "error": "Conflict",
            "message": "No se puede borrar definitivamente: el curso tiene simulaciones clínicas de estudiantes. "
                       "Puede quedarse en la papelera o restaurarse.",
            "status_code": 409,
            "simulaciones": int(simulaciones),
        }), 409

    try:
        claves, user_file_ids = _archivos_del_curso(course.id)
        if course.cover_image_key:
            claves.extend([course.cover_image_key, portadas.clave_miniatura(course.cover_image_key)])
        pendientes = limpieza_r2.encolar(claves, f"curso:{course.id}")
        auditoria.registrar(
            auditoria.COURSE_PURGE, "course", course.id, old={"name": course.name, "files": len(pendientes)},
        )
        if user_file_ids:
            UserFile.query.filter(UserFile.id.in_(user_file_ids)).delete(synchronize_session=False)
        db.session.delete(course)
        db.session.commit()
    except IntegrityError:
        # Una simulación creada justo ahora: la llave foránea (RESTRICT) lo frena.
        db.session.rollback()
        return jsonify({
            "error": "Conflict",
            "message": "No se puede borrar definitivamente: el curso tiene simulaciones clínicas de estudiantes.",
            "status_code": 409,
        }), 409
    except Exception:
        db.session.rollback()
        raise

    resumen = limpieza_r2.procesar(pendientes)
    return jsonify({
        "ok": True,
        "files_deleted": resumen["borrados"],
        # Lo que R2 no dejó borrar ahora queda en la cola y se reintenta.
        "files_pending": len(pendientes) - resumen["borrados"],
    }), 200


@cursos_bp.get("/mis-fechas")
@jwt_required()
def mis_fechas():
    """Tareas (ASSIGNMENT) y Cuestionarios (QUIZ) con due_at de los cursos del
    usuario logueado. Estudiante → sus matrículas. Docente → sus propios."""
    user = get_current_user()

    if user.role == "TEACHER":
        course_ids = [str(c.id) for c in Course.query.filter_by(teacher_id=user.id).all()]
    else:
        matriculas = StudentCourse.query.filter_by(student_id=user.id).all()
        course_ids = [str(m.course_id) for m in matriculas]

    if not course_ids:
        return jsonify({"fechas": []}), 200

    bloques_mapa = {
        str(b.id): b
        for b in CourseBlock.query.filter(CourseBlock.course_id.in_(course_ids)).all()
    }
    cursos_mapa = {
        str(c.id): c
        for c in Course.query.filter(Course.id.in_(course_ids)).all()
    }

    items = (
        CourseContentItem.query
        .join(CourseBlock, CourseContentItem.block_id == CourseBlock.id)
        .filter(
            CourseBlock.course_id.in_(course_ids),
            CourseContentItem.type.in_(["ASSIGNMENT", "QUIZ"]),
            CourseContentItem.due_at.isnot(None),
        )
        .order_by(CourseContentItem.due_at.asc())
        .all()
    )

    resultado = []
    for item in items:
        bloque = bloques_mapa.get(str(item.block_id))
        if not bloque:
            continue
        curso = cursos_mapa.get(str(bloque.course_id))
        if not curso:
            continue
        resultado.append({
            "item_id": str(item.id),
            "course_id": str(bloque.course_id),
            "course_name": curso.name,
            "title": item.title,
            "type": item.type,
            "due_at": (item.due_at.astimezone(_tz.utc) if item.due_at.tzinfo else item.due_at.replace(tzinfo=_tz.utc)).isoformat() if item.due_at else None,
            "open_at": (item.open_at.astimezone(_tz.utc) if item.open_at.tzinfo else item.open_at.replace(tzinfo=_tz.utc)).isoformat() if item.open_at else None,
        })

    return jsonify({"fechas": resultado}), 200


@cursos_bp.delete("/<course_id>/matricular")
@role_required("STUDENT")
def desmatricular(course_id):
    user = get_current_user()

    enrollment = StudentCourse.query.filter_by(student_id=user.id, course_id=course_id).first()
    if enrollment is None:
        return jsonify({
            "error": "Not Found",
            "message": "No estás matriculado en este curso",
            "status_code": 404
        }), 404

    db.session.delete(enrollment)
    auditoria.registrar(auditoria.STUDENT_REMOVE, "course", course_id, old={"student_id": user.id, "via": "SELF"})
    db.session.commit()

    return jsonify({"message": "Matrícula eliminada exitosamente"}), 200

