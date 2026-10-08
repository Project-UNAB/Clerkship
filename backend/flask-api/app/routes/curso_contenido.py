"""
Material de un curso: bloques (temas, funcionan como carpetas) con contenido
adentro — documentos (en R2, como la Carpeta de Documentos), videos (enlace
externo a YouTube/Vimeo), enlaces externos, notas de texto y tareas (entrega
de archivo con ventana de apertura/cierre, calificables).

Solo el docente dueño del curso puede crear/editar/borrar. Para verlo basta
con ser ese docente o estar matriculado como estudiante en el curso.
"""
import base64
import binascii
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db, storage
from app.models import (
    AssignmentSubmission,
    Course,
    CourseBlock,
    CourseContentItem,
    Student,
    StudentCourse,
    User,
    UserFile,
)
from app.schemas import (
    ActualizarBloqueRequest,
    ActualizarContenidoRequest,
    CalificarEntregaRequest,
    CrearBloqueRequest,
    CrearContenidoRequest,
    EntregarTareaRequest,
    validate_body,
)
from app.services import conversion
from app.utils import get_current_user, role_required

curso_contenido_bp = Blueprint("curso_contenido", __name__)

TIPOS_VALIDOS = ("DOCUMENT", "VIDEO", "LINK", "TEXT", "ASSIGNMENT")
# Mismo límite que la Carpeta de Documentos (~11MB reales en base64).
MAX_CONTENIDO_BASE64_CHARS = 15 * 1024 * 1024


class FechaInvalida(ValueError):
    pass


def _parse_iso(valor):
    """'2026-10-20T23:59:00Z' o con offset -> datetime naive en UTC (mismo
    criterio que el resto del backend: timestamps naive, siempre UTC)."""
    if not valor:
        return None
    try:
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as err:
        raise FechaInvalida(f"Fecha inválida: {valor}") from err
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _curso_o_404(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404)
    return course, None


def _es_docente_dueno(user, course) -> bool:
    return user.role == "TEACHER" and str(course.teacher_id) == str(user.id)


def _puede_ver(user, course) -> bool:
    if _es_docente_dueno(user, course):
        return True
    if user.role == "STUDENT":
        return StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is not None
    return False


def _bloque_o_404(course_id, block_id):
    bloque = CourseBlock.query.filter_by(id=block_id, course_id=course_id).first()
    if bloque is None:
        return None, (jsonify({"error": "Not Found", "message": "Bloque no encontrado", "status_code": 404}), 404)
    return bloque, None


def _forbidden():
    return jsonify({"error": "Forbidden", "message": "No tienes acceso a este curso", "status_code": 403}), 403


# ─────────────────────────── Bloques ───────────────────────────

@curso_contenido_bp.get("/<course_id>/bloques")
@jwt_required()
def listar_bloques(course_id):
    """Bloques del curso con su contenido adentro, listos para pintar la
    pantalla completa de una vez (sin N+1 requests desde el frontend)."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    bloques = CourseBlock.query.filter_by(course_id=course_id).order_by(CourseBlock.position.asc(), CourseBlock.created_at.asc()).all()

    archivo_ids = [
        item.file_id
        for bloque in bloques
        for item in CourseContentItem.query.filter_by(block_id=bloque.id).all()
        if item.file_id
    ]
    archivos_por_id = {}
    if archivo_ids:
        for archivo in UserFile.query.filter(UserFile.id.in_(archivo_ids)).all():
            archivos_por_id[str(archivo.id)] = archivo

    resultado = []
    for bloque in bloques:
        items = (
            CourseContentItem.query.filter_by(block_id=bloque.id)
            .order_by(CourseContentItem.position.asc(), CourseContentItem.created_at.asc())
            .all()
        )
        d = bloque.to_dict()
        d["contenido"] = [
            item.to_dict(archivo=archivos_por_id.get(str(item.file_id)) if item.file_id else None)
            for item in items
        ]
        resultado.append(d)

    return jsonify({"bloques": resultado}), 200


@curso_contenido_bp.post("/<course_id>/bloques")
@role_required("TEACHER")
@validate_body(CrearBloqueRequest)
def crear_bloque(course_id, validated_body: CrearBloqueRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    max_pos = db.session.query(db.func.coalesce(db.func.max(CourseBlock.position), -1)).filter_by(course_id=course_id).scalar()

    bloque = CourseBlock(
        course_id=course_id,
        title=validated_body.title.strip(),
        description=validated_body.description,
        position=max_pos + 1,
    )
    db.session.add(bloque)
    db.session.commit()

    d = bloque.to_dict()
    d["contenido"] = []
    return jsonify(d), 201


@curso_contenido_bp.patch("/<course_id>/bloques/<block_id>")
@role_required("TEACHER")
@validate_body(ActualizarBloqueRequest)
def actualizar_bloque(course_id, block_id, validated_body: ActualizarBloqueRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    bloque, err = _bloque_o_404(course_id, block_id)
    if err:
        return err

    if validated_body.title is not None:
        bloque.title = validated_body.title.strip()
    if validated_body.description is not None:
        bloque.description = validated_body.description
    if validated_body.position is not None:
        bloque.position = validated_body.position

    db.session.commit()
    return jsonify(bloque.to_dict()), 200


@curso_contenido_bp.delete("/<course_id>/bloques/<block_id>")
@role_required("TEACHER")
def borrar_bloque(course_id, block_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    bloque, err = _bloque_o_404(course_id, block_id)
    if err:
        return err

    # Los archivos en R2 de los documentos de este bloque se borran también
    # (si no, quedarían huérfanos para siempre — a diferencia de la Carpeta
    # de Documentos, acá el contenido no tiene dueño individual fuera del bloque).
    items = CourseContentItem.query.filter_by(block_id=block_id).all()
    for item in items:
        if item.type == "DOCUMENT" and item.file_id:
            archivo = UserFile.query.get(item.file_id)
            if archivo is not None:
                try:
                    storage.borrar(archivo.storage_key)
                except storage.StorageNotConfigured:
                    pass
                db.session.delete(archivo)

    db.session.delete(bloque)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ─────────────────────────── Contenido ───────────────────────────

@curso_contenido_bp.post("/<course_id>/bloques/<block_id>/contenido")
@role_required("TEACHER")
@validate_body(CrearContenidoRequest)
def crear_contenido(course_id, block_id, validated_body: CrearContenidoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    bloque, err = _bloque_o_404(course_id, block_id)
    if err:
        return err

    tipo = (validated_body.type or "").strip().upper()
    if tipo not in TIPOS_VALIDOS:
        return jsonify({
            "error": "Bad Request",
            "message": f"type debe ser uno de: {', '.join(TIPOS_VALIDOS)}",
            "status_code": 400,
        }), 400

    file_id = None

    if tipo == "DOCUMENT":
        if not validated_body.file_base64 or not validated_body.name:
            return jsonify({"error": "Bad Request", "message": "Falta 'file_base64' o 'name' para un documento", "status_code": 400}), 400
        if len(validated_body.file_base64) > MAX_CONTENIDO_BASE64_CHARS:
            return jsonify({"error": "Payload Too Large", "message": "El archivo es demasiado pesado", "status_code": 413}), 413
        try:
            contenido = base64.b64decode(validated_body.file_base64, validate=False)
        except (binascii.Error, ValueError):
            return jsonify({"error": "Bad Request", "message": "El contenido en base64 es inválido", "status_code": 400}), 400

        mime_type = (validated_body.mime_type or "application/octet-stream").strip()
        try:
            clave = storage.nueva_clave(str(user.id), mime_type)
            storage.subir_bytes(clave, contenido, mime_type)
        except storage.StorageNotConfigured as serr:
            return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503

        archivo = UserFile(
            owner_id=user.id,
            nombre=validated_body.name.strip(),
            storage_key=clave,
            mime_type=mime_type,
            size_bytes=len(contenido),
            estado="LISTO",
        )
        db.session.add(archivo)
        db.session.flush()
        file_id = archivo.id

    elif tipo == "VIDEO" and not validated_body.video_url:
        return jsonify({"error": "Bad Request", "message": "Falta 'video_url' para un video", "status_code": 400}), 400
    elif tipo == "LINK" and not validated_body.link_url:
        return jsonify({"error": "Bad Request", "message": "Falta 'link_url' para un enlace", "status_code": 400}), 400
    elif tipo == "TEXT" and not validated_body.text_content:
        return jsonify({"error": "Bad Request", "message": "Falta 'text_content' para una nota", "status_code": 400}), 400

    open_at = due_at = None
    if tipo == "ASSIGNMENT":
        try:
            open_at = _parse_iso(validated_body.open_at)
            due_at = _parse_iso(validated_body.due_at)
        except FechaInvalida as ferr:
            return jsonify({"error": "Bad Request", "message": str(ferr), "status_code": 400}), 400
        if open_at and due_at and open_at >= due_at:
            return jsonify({"error": "Bad Request", "message": "'open_at' debe ser anterior a 'due_at'", "status_code": 400}), 400

    max_pos = db.session.query(db.func.coalesce(db.func.max(CourseContentItem.position), -1)).filter_by(block_id=block_id).scalar()

    item = CourseContentItem(
        block_id=block_id,
        type=tipo,
        title=validated_body.title.strip(),
        description=validated_body.description,
        position=max_pos + 1,
        file_id=file_id,
        video_url=validated_body.video_url,
        link_url=validated_body.link_url,
        text_content=validated_body.text_content,
        open_at=open_at,
        due_at=due_at,
        max_score=validated_body.max_score if tipo == "ASSIGNMENT" else None,
        allow_late=bool(validated_body.allow_late) if tipo == "ASSIGNMENT" else False,
    )
    db.session.add(item)
    db.session.commit()

    archivo_obj = UserFile.query.get(file_id) if file_id else None
    return jsonify(item.to_dict(archivo=archivo_obj)), 201


@curso_contenido_bp.patch("/<course_id>/bloques/<block_id>/contenido/<item_id>")
@role_required("TEACHER")
@validate_body(ActualizarContenidoRequest)
def actualizar_contenido(course_id, block_id, item_id, validated_body: ActualizarContenidoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None:
        return jsonify({"error": "Not Found", "message": "Contenido no encontrado", "status_code": 404}), 404

    if validated_body.title is not None:
        item.title = validated_body.title.strip()
    if validated_body.description is not None:
        item.description = validated_body.description
    if validated_body.position is not None:
        item.position = validated_body.position
    if validated_body.video_url is not None:
        item.video_url = validated_body.video_url
    if validated_body.link_url is not None:
        item.link_url = validated_body.link_url
    if validated_body.text_content is not None:
        item.text_content = validated_body.text_content
    if validated_body.max_score is not None:
        item.max_score = validated_body.max_score
    if validated_body.allow_late is not None:
        item.allow_late = validated_body.allow_late
    if validated_body.open_at is not None or validated_body.due_at is not None:
        try:
            nuevo_open = _parse_iso(validated_body.open_at) if validated_body.open_at is not None else item.open_at
            nuevo_due = _parse_iso(validated_body.due_at) if validated_body.due_at is not None else item.due_at
        except FechaInvalida as ferr:
            return jsonify({"error": "Bad Request", "message": str(ferr), "status_code": 400}), 400
        if nuevo_open and nuevo_due and nuevo_open >= nuevo_due:
            return jsonify({"error": "Bad Request", "message": "'open_at' debe ser anterior a 'due_at'", "status_code": 400}), 400
        item.open_at = nuevo_open
        item.due_at = nuevo_due

    db.session.commit()
    archivo_obj = UserFile.query.get(item.file_id) if item.file_id else None
    return jsonify(item.to_dict(archivo=archivo_obj)), 200


@curso_contenido_bp.delete("/<course_id>/bloques/<block_id>/contenido/<item_id>")
@role_required("TEACHER")
def borrar_contenido(course_id, block_id, item_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None:
        return jsonify({"error": "Not Found", "message": "Contenido no encontrado", "status_code": 404}), 404

    if item.type == "DOCUMENT" and item.file_id:
        archivo = UserFile.query.get(item.file_id)
        if archivo is not None:
            try:
                storage.borrar(archivo.storage_key)
            except storage.StorageNotConfigured:
                pass
            db.session.delete(archivo)

    db.session.delete(item)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ─────────────────────── Archivo del contenido (documentos) ───────────────────────

def _item_documento_o_404(course_id, block_id, item_id):
    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None or item.type != "DOCUMENT" or not item.file_id:
        return None, None, (jsonify({"error": "Not Found", "message": "Documento no encontrado", "status_code": 404}), 404)
    archivo = UserFile.query.get(item.file_id)
    if archivo is None:
        return None, None, (jsonify({"error": "Not Found", "message": "Documento no encontrado", "status_code": 404}), 404)
    return item, archivo, None


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/archivo")
@jwt_required()
def obtener_archivo_contenido(course_id, block_id, item_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    _item, archivo, err = _item_documento_o_404(course_id, block_id, item_id)
    if err:
        return err

    contenido = storage.descargar_bytes(archivo.storage_key)
    return jsonify({
        "document": {
            "id": str(archivo.id),
            "name": archivo.nombre,
            "mime_type": archivo.mime_type,
            "size_bytes": archivo.size_bytes,
            "data": base64.b64encode(contenido).decode("ascii"),
        }
    }), 200


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/vista-previa")
@jwt_required()
def vista_previa_contenido(course_id, block_id, item_id):
    """Mismo flujo que la vista previa de /api/documentos: PDF directo, u
    oficina (Word/PowerPoint) convertido a PDF vía Gotenberg."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    _item, archivo, err = _item_documento_o_404(course_id, block_id, item_id)
    if err:
        return err

    contenido = storage.descargar_bytes(archivo.storage_key)
    mime_type = (archivo.mime_type or "").lower()

    if mime_type == "application/pdf":
        return jsonify({"mime_type": "application/pdf", "data": base64.b64encode(contenido).decode("ascii"), "converted": False}), 200

    if mime_type not in conversion.FORMATOS_CONVERTIBLES:
        return jsonify({"error": "Unsupported Media Type", "message": "Este tipo de archivo no tiene vista previa en PDF", "status_code": 415}), 415

    try:
        pdf_bytes = conversion.convertir_a_pdf(contenido, archivo.nombre)
    except conversion.ConversionNotConfigured as cerr:
        return jsonify({"error": "Service Unavailable", "message": str(cerr), "status_code": 503}), 503
    except conversion.ConversionError as cerr:
        return jsonify({"error": "Bad Gateway", "message": str(cerr), "status_code": 502}), 502

    return jsonify({"mime_type": "application/pdf", "data": base64.b64encode(pdf_bytes).decode("ascii"), "converted": True}), 200


# ─────────────────────────── Tareas: entregas ───────────────────────────

def _tarea_o_404(block_id, item_id):
    item = CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()
    if item is None or item.type != "ASSIGNMENT":
        return None, (jsonify({"error": "Not Found", "message": "Tarea no encontrada", "status_code": 404}), 404)
    return item, None


def _es_estudiante_matriculado(user, course) -> bool:
    return user.role == "STUDENT" and StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is not None


@curso_contenido_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas")
@jwt_required()
@validate_body(EntregarTareaRequest)
def entregar_tarea(course_id, block_id, item_id, validated_body: EntregarTareaRequest):
    """El estudiante entrega (o vuelve a entregar, pisando la anterior) un
    archivo para la tarea. Respeta open_at/due_at/allow_late."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()

    item, err = _tarea_o_404(block_id, item_id)
    if err:
        return err

    ahora = datetime.now(timezone.utc).replace(tzinfo=None)
    if item.open_at and ahora < item.open_at:
        return jsonify({"error": "Bad Request", "message": "Esta tarea todavía no abre", "status_code": 400}), 400
    es_tardia = bool(item.due_at and ahora > item.due_at)
    if es_tardia and not item.allow_late:
        return jsonify({"error": "Bad Request", "message": "El plazo de entrega ya cerró", "status_code": 400}), 400

    if len(validated_body.file_base64) > MAX_CONTENIDO_BASE64_CHARS:
        return jsonify({"error": "Payload Too Large", "message": "El archivo es demasiado pesado", "status_code": 413}), 413
    try:
        contenido = base64.b64decode(validated_body.file_base64, validate=False)
    except (binascii.Error, ValueError):
        return jsonify({"error": "Bad Request", "message": "El contenido en base64 es inválido", "status_code": 400}), 400

    mime_type = (validated_body.mime_type or "application/octet-stream").strip()
    try:
        clave = storage.nueva_clave(str(user.id), mime_type)
        storage.subir_bytes(clave, contenido, mime_type)
    except storage.StorageNotConfigured as serr:
        return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503

    archivo_nuevo = UserFile(
        owner_id=user.id,
        nombre=validated_body.name.strip(),
        storage_key=clave,
        mime_type=mime_type,
        size_bytes=len(contenido),
        estado="LISTO",
    )
    db.session.add(archivo_nuevo)
    db.session.flush()

    entrega = AssignmentSubmission.query.filter_by(item_id=item_id, student_id=user.id).first()
    archivo_anterior = None
    if entrega is not None:
        archivo_anterior = UserFile.query.get(entrega.file_id) if entrega.file_id else None
        entrega.file_id = archivo_nuevo.id
        entrega.submitted_at = ahora
        entrega.is_late = es_tardia
        # Volver a entregar reabre la calificación anterior: hay que revisar de nuevo.
        entrega.score = None
        entrega.feedback = None
        entrega.graded_at = None
        entrega.graded_by = None
    else:
        entrega = AssignmentSubmission(
            item_id=item_id,
            student_id=user.id,
            file_id=archivo_nuevo.id,
            submitted_at=ahora,
            is_late=es_tardia,
        )
        db.session.add(entrega)

    if archivo_anterior is not None:
        try:
            storage.borrar(archivo_anterior.storage_key)
        except storage.StorageNotConfigured:
            pass
        db.session.delete(archivo_anterior)

    db.session.commit()
    return jsonify(entrega.to_dict(archivo=archivo_nuevo)), 201


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas")
@role_required("TEACHER")
def listar_entregas(course_id, block_id, item_id):
    """El docente ve todas las entregas de la tarea, para calificar."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    _item, err = _tarea_o_404(block_id, item_id)
    if err:
        return err

    entregas = AssignmentSubmission.query.filter_by(item_id=item_id).order_by(AssignmentSubmission.submitted_at.desc()).all()

    archivo_ids = [e.file_id for e in entregas if e.file_id]
    archivos = {str(a.id): a for a in UserFile.query.filter(UserFile.id.in_(archivo_ids)).all()} if archivo_ids else {}

    estudiante_ids = [e.student_id for e in entregas]
    estudiantes = {str(u.id): u for u in User.query.filter(User.id.in_(estudiante_ids)).all()} if estudiante_ids else {}

    return jsonify({
        "entregas": [
            e.to_dict(
                archivo=archivos.get(str(e.file_id)) if e.file_id else None,
                estudiante=estudiantes.get(str(e.student_id)),
            )
            for e in entregas
        ]
    }), 200


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/mia")
@jwt_required()
def mi_entrega(course_id, block_id, item_id):
    """El estudiante consulta el estado de su propia entrega (o null si no ha entregado)."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    _item, err = _tarea_o_404(block_id, item_id)
    if err:
        return err

    entrega = AssignmentSubmission.query.filter_by(item_id=item_id, student_id=user.id).first()
    if entrega is None:
        return jsonify({"entrega": None}), 200

    archivo = UserFile.query.get(entrega.file_id) if entrega.file_id else None
    return jsonify({"entrega": entrega.to_dict(archivo=archivo)}), 200


@curso_contenido_bp.patch("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>")
@role_required("TEACHER")
@validate_body(CalificarEntregaRequest)
def calificar_entrega(course_id, block_id, item_id, submission_id, validated_body: CalificarEntregaRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    item, err = _tarea_o_404(block_id, item_id)
    if err:
        return err

    entrega = AssignmentSubmission.query.filter_by(id=submission_id, item_id=item_id).first()
    if entrega is None:
        return jsonify({"error": "Not Found", "message": "Entrega no encontrada", "status_code": 404}), 404

    if item.max_score is not None and validated_body.score > float(item.max_score):
        return jsonify({
            "error": "Bad Request",
            "message": f"El puntaje no puede superar {item.max_score}",
            "status_code": 400,
        }), 400

    entrega.score = validated_body.score
    entrega.feedback = validated_body.feedback
    entrega.graded_at = datetime.now(timezone.utc).replace(tzinfo=None)
    entrega.graded_by = user.id
    db.session.commit()

    archivo = UserFile.query.get(entrega.file_id) if entrega.file_id else None
    return jsonify(entrega.to_dict(archivo=archivo)), 200


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/archivo")
@jwt_required()
def obtener_archivo_entrega(course_id, block_id, item_id, submission_id):
    """El docente dueño del curso, o el estudiante dueño de la entrega, descargan el archivo entregado."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    _item, err = _tarea_o_404(block_id, item_id)
    if err:
        return err

    entrega = AssignmentSubmission.query.filter_by(id=submission_id, item_id=item_id).first()
    if entrega is None or not entrega.file_id:
        return jsonify({"error": "Not Found", "message": "Entrega no encontrada", "status_code": 404}), 404

    es_dueno = _es_docente_dueno(user, course)
    es_autor = user.role == "STUDENT" and str(entrega.student_id) == str(user.id)
    if not es_dueno and not es_autor:
        return _forbidden()

    archivo = UserFile.query.get(entrega.file_id)
    if archivo is None:
        return jsonify({"error": "Not Found", "message": "Entrega no encontrada", "status_code": 404}), 404

    contenido = storage.descargar_bytes(archivo.storage_key)
    return jsonify({
        "document": {
            "id": str(archivo.id),
            "name": archivo.nombre,
            "mime_type": archivo.mime_type,
            "size_bytes": archivo.size_bytes,
            "data": base64.b64encode(contenido).decode("ascii"),
        }
    }), 200
