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
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app import db, limiter, storage
from app.models import (
    AssignmentSubmission,
    Course,
    CourseBlock,
    CourseContentItem,
    Student,
    StudentCourse,
    SubmissionFile,
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
from app.services import auditoria, conversion, limites, limpieza_r2, notificaciones, paginacion, tareas
from app.services.archivos import ArchivoInvalido, validar_archivo
from app.services.sanitize import sanitizar_html
from app.services.transacciones import transaccion
from app.utils import get_current_user, role_required

curso_contenido_bp = Blueprint("curso_contenido", __name__)

TIPOS_VALIDOS = ("DOCUMENT", "VIDEO", "LINK", "TEXT", "ASSIGNMENT", "QUIZ")
# Mismo límite que la Carpeta de Documentos (~11MB reales en base64).
MAX_CONTENIDO_BASE64_CHARS = 15 * 1024 * 1024


class FechaInvalida(ValueError):
    pass


def _ensure_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _parse_iso(valor):
    """'2026-10-20T23:59:00Z' o con offset -> datetime aware en UTC."""
    if not valor:
        return None
    try:
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError as err:
        raise FechaInvalida(f"Fecha inválida: {valor}") from err
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc)
    else:
        dt = dt.replace(tzinfo=timezone.utc)
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


def _item_del_curso(course_id, block_id, item_id):
    """El contenido, solo si su bloque pertenece a ESE curso. Los permisos se
    deciden con el curso de la URL: sin este cruce, alguien con acceso al
    curso A podría leer o tocar contenido del curso B poniendo sus ids."""
    if CourseBlock.query.filter_by(id=block_id, course_id=course_id).first() is None:
        return None
    return CourseContentItem.query.filter_by(id=item_id, block_id=block_id).first()


def _archivo_invalido(err):
    return jsonify({"error": "Unsupported Media Type", "message": str(err), "status_code": 415}), 415


def _item_dict(item, archivo=None):
    """El contenido listo para responder. A una tarea se le agregan sus
    `reglas`: lo que de verdad se aplica al entregar (valores por defecto y
    topes del servidor incluidos) y en qué punto de la ventana está."""
    d = item.to_dict(archivo=archivo)
    if item.type == "ASSIGNMENT":
        d["reglas"] = tareas.reglas_para_respuesta(item)
    return d


def _borrar_de_r2(clave):
    """Borra un objeto de R2 después del commit que lo dejó sin referencias.
    Si R2 falla no tumba la petición: la clave queda anotada para reintentar
    (ver app/services/limpieza_r2.py)."""
    limpieza_r2.borrar_o_encolar(clave, "contenido")


def _respuesta_descarga(archivo):
    """URL firmada de vida corta para bajar el archivo directo de R2. Solo se
    llama después de comprobar que el usuario tiene permiso sobre el archivo."""
    try:
        url = storage.url_descarga(
            archivo.storage_key,
            archivo.nombre,
            mime_type=archivo.mime_type,
            expira=storage.DESCARGA_CURSO_TTL_SECONDS,
        )
    except storage.StorageNotConfigured as serr:
        return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503
    return jsonify({
        "url": url,
        "name": archivo.nombre,
        "mime_type": archivo.mime_type,
        "size_bytes": archivo.size_bytes,
        "expires_in": storage.DESCARGA_CURSO_TTL_SECONDS,
    }), 200


@curso_contenido_bp.get("/opciones-tarea")
@jwt_required()
def opciones_tarea():
    """Entre qué puede elegir un docente al configurar una tarea: las
    extensiones que el servidor sabe verificar, las que usa si no elige
    ninguna y los topes de tamaño y cantidad."""
    return jsonify({
        "supported_extensions": list(tareas.EXTENSIONES_SOPORTADAS),
        "default_extensions": list(tareas.EXTENSIONES_POR_DEFECTO),
        **tareas.limites_globales(),
    }), 200


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

    # Todo el contenido del curso en UNA consulta (antes eran dos por bloque)
    # y sus archivos en otra: tres consultas sin importar cuántos bloques haya.
    items_por_bloque = {}
    archivo_ids = []
    if bloques:
        items = (
            CourseContentItem.query.filter(CourseContentItem.block_id.in_([b.id for b in bloques]))
            .order_by(CourseContentItem.position.asc(), CourseContentItem.created_at.asc())
            .all()
        )
        for item in items:
            items_por_bloque.setdefault(str(item.block_id), []).append(item)
            if item.file_id:
                archivo_ids.append(item.file_id)

    archivos_por_id = {}
    if archivo_ids:
        for archivo in UserFile.query.filter(UserFile.id.in_(archivo_ids)).all():
            archivos_por_id[str(archivo.id)] = archivo

    resultado = []
    for bloque in bloques:
        d = bloque.to_dict()
        d["contenido"] = [
            _item_dict(item, archivos_por_id.get(str(item.file_id)) if item.file_id else None)
            for item in items_por_bloque.get(str(bloque.id), [])
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
    # Primero la base, en una sola transacción; R2 después, ya confirmada: si
    # el commit falla no se pierde ningún archivo que siga referenciado.
    claves = []
    with transaccion():
        items = CourseContentItem.query.filter_by(block_id=block_id).all()
        # Los archivos del material, en una sola consulta (antes era una por documento).
        archivo_ids = [i.file_id for i in items if i.type == "DOCUMENT" and i.file_id]
        if archivo_ids:
            for archivo in UserFile.query.filter(UserFile.id.in_(archivo_ids)).all():
                claves.append(archivo.storage_key)
                db.session.delete(archivo)
        # Las filas de las entregas se van en cascada; sus archivos en R2 no.
        claves.extend(_claves_de_entregas([i.id for i in items if i.type == "ASSIGNMENT"]))
        # Quedan anotadas en la misma transacción: si R2 falla después, se reintenta.
        pendientes = limpieza_r2.encolar(claves, f"bloque:{block_id}")

        db.session.delete(bloque)

    limpieza_r2.procesar(pendientes)
    return jsonify({"ok": True}), 200


# ─────────────────────────── Contenido ───────────────────────────

@curso_contenido_bp.post("/<course_id>/bloques/<block_id>/contenido")
@role_required("TEACHER")
@limiter.limit(limites.SUBIDA_MATERIAL, key_func=limites.usuario_o_ip)
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

    # Todo lo que puede terminar en 400 se valida antes de subir nada a R2.
    if tipo == "VIDEO" and not validated_body.video_url:
        return jsonify({"error": "Bad Request", "message": "Falta 'video_url' para un video", "status_code": 400}), 400
    if tipo == "LINK" and not validated_body.link_url:
        return jsonify({"error": "Bad Request", "message": "Falta 'link_url' para un enlace", "status_code": 400}), 400
    if tipo == "TEXT" and not validated_body.text_content:
        return jsonify({"error": "Bad Request", "message": "Falta 'text_content' para una nota", "status_code": 400}), 400

    open_at = due_at = None
    if tipo in ("ASSIGNMENT", "QUIZ"):
        try:
            open_at = _parse_iso(validated_body.open_at)
            due_at = _parse_iso(validated_body.due_at)
        except FechaInvalida as ferr:
            return jsonify({"error": "Bad Request", "message": str(ferr), "status_code": 400}), 400
        if open_at and due_at and open_at >= due_at:
            return jsonify({"error": "Bad Request", "message": "'open_at' debe ser anterior a 'due_at'", "status_code": 400}), 400

    # Reglas de la tarea: qué archivos recibe y hasta cuándo.
    late_until = None
    allowed_extensions = []
    rubrica = []
    if tipo == "ASSIGNMENT":
        try:
            late_until = _parse_iso(validated_body.late_until)
            allowed_extensions = tareas.normalizar_extensiones(validated_body.allowed_extensions)
            tareas.validar_limites(validated_body.max_file_size_mb, validated_body.max_files)
            tareas.validar_ventana(open_at, due_at, bool(validated_body.allow_late), late_until)
            rubrica = tareas.normalizar_rubrica(validated_body.rubric)
        except (FechaInvalida, tareas.ReglaInvalida) as rerr:
            return jsonify({"error": "Bad Request", "message": str(rerr), "status_code": 400}), 400

    # El docente lo escribe con un editor WYSIWYG — nunca se confía en el
    # HTML tal como llega del cliente, se limpia acá (contra XSS).
    text_content = sanitizar_html(validated_body.text_content) if tipo == "TEXT" else None

    clave = None
    contenido = b""
    mime_type = None

    if tipo == "DOCUMENT":
        if not validated_body.file_base64 or not validated_body.name:
            return jsonify({"error": "Bad Request", "message": "Falta 'file_base64' o 'name' para un documento", "status_code": 400}), 400
        if len(validated_body.file_base64) > MAX_CONTENIDO_BASE64_CHARS:
            return jsonify({"error": "Payload Too Large", "message": "El archivo es demasiado pesado", "status_code": 413}), 413
        try:
            contenido = base64.b64decode(validated_body.file_base64, validate=False)
        except (binascii.Error, ValueError):
            return jsonify({"error": "Bad Request", "message": "El contenido en base64 es inválido", "status_code": 400}), 400

        # El tipo sale del contenido real, no del mime_type que manda el cliente.
        try:
            mime_type = validar_archivo(validated_body.name, contenido)
        except ArchivoInvalido as aerr:
            return _archivo_invalido(aerr)
        try:
            clave = storage.nueva_clave(str(user.id), mime_type)
            storage.subir_bytes(clave, contenido, mime_type)
        except storage.StorageNotConfigured as serr:
            return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503

    # El archivo (si lo hay) y el contenido se guardan juntos o no se guarda nada.
    file_id = None
    try:
        with transaccion():
            if clave is not None:
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
                text_content=text_content,
                open_at=open_at,
                due_at=due_at,
                # Con rúbrica, el puntaje máximo es la suma de sus criterios.
                max_score=(
                    (tareas.puntaje_de_rubrica(rubrica) if rubrica else validated_body.max_score)
                    if tipo == "ASSIGNMENT" else None
                ),
                rubric=rubrica or None,
                allow_late=bool(validated_body.allow_late) if tipo == "ASSIGNMENT" else False,
                late_until=late_until,
                allowed_extensions=allowed_extensions,
                max_file_size_mb=validated_body.max_file_size_mb if tipo == "ASSIGNMENT" else None,
                max_files=(validated_body.max_files or 1) if tipo == "ASSIGNMENT" else 1,
                time_limit_minutes=validated_body.time_limit_minutes if tipo == "QUIZ" else None,
                max_attempts=validated_body.max_attempts if tipo == "QUIZ" else None,
                grade_policy=(validated_body.grade_policy or "BEST") if tipo == "QUIZ" else "BEST",
            )
            db.session.add(item)
    except Exception:
        # El objeto ya estaba en R2 pero ninguna fila lo referencia: se quita.
        _borrar_de_r2(clave)
        raise

    if tipo == "ASSIGNMENT":
        # Después del commit y en su propia transacción: avisar no puede tumbar la publicación.
        notificaciones.tarea_publicada(course, item)

    archivo_obj = UserFile.query.get(file_id) if file_id else None
    return jsonify(_item_dict(item, archivo_obj)), 201


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

    item = _item_del_curso(course_id, block_id, item_id)
    if item is None:
        return jsonify({"error": "Not Found", "message": "Contenido no encontrado", "status_code": 404}), 404

    # Campos que vinieron en el cuerpo, aunque sea con null: en las fechas y
    # los límites de la tarea, null explícito significa "quitar el valor".
    enviados = validated_body.model_fields_set
    es_tarea = item.type == "ASSIGNMENT"

    # Primero se calcula y valida todo; el item solo se toca si nada falla.
    try:
        nuevo_open = _parse_iso(validated_body.open_at) if "open_at" in enviados else item.open_at
        nuevo_due = _parse_iso(validated_body.due_at) if "due_at" in enviados else item.due_at
        if nuevo_open and nuevo_due and _ensure_utc(nuevo_open) >= _ensure_utc(nuevo_due):
            raise tareas.ReglaInvalida("'open_at' debe ser anterior a 'due_at'")

        if es_tarea:
            nuevo_allow_late = validated_body.allow_late if validated_body.allow_late is not None else bool(item.allow_late)
            nuevo_late_until = _parse_iso(validated_body.late_until) if "late_until" in enviados else item.late_until
            if not nuevo_allow_late and "late_until" not in enviados:
                # Apagar las tardías se lleva consigo su fecha tope.
                nuevo_late_until = None
            nuevas_extensiones = (
                tareas.normalizar_extensiones(validated_body.allowed_extensions)
                if "allowed_extensions" in enviados else list(item.allowed_extensions or [])
            )
            nuevo_tamano = validated_body.max_file_size_mb if "max_file_size_mb" in enviados else item.max_file_size_mb
            nuevo_max_files = (validated_body.max_files or 1) if "max_files" in enviados else (item.max_files or 1)
            nueva_rubrica = tareas.normalizar_rubrica(validated_body.rubric) if "rubric" in enviados else None
            tareas.validar_limites(
                nuevo_tamano if "max_file_size_mb" in enviados else None,
                nuevo_max_files if "max_files" in enviados else None,
            )
            tareas.validar_ventana(nuevo_open, nuevo_due, nuevo_allow_late, nuevo_late_until)
    except (FechaInvalida, tareas.ReglaInvalida) as rerr:
        return jsonify({"error": "Bad Request", "message": str(rerr), "status_code": 400}), 400

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
        item.text_content = sanitizar_html(validated_body.text_content)
    if validated_body.max_score is not None:
        item.max_score = validated_body.max_score
    if validated_body.time_limit_minutes is not None:
        item.time_limit_minutes = validated_body.time_limit_minutes
    if validated_body.max_attempts is not None:
        item.max_attempts = validated_body.max_attempts
    if validated_body.grade_policy is not None and item.type == "QUIZ":
        if (item.grade_policy or "BEST") != validated_body.grade_policy:
            auditoria.registrar(
                auditoria.GRADE_POLICY_CHANGE, "quiz", item.id,
                old={"grade_policy": item.grade_policy or "BEST"}, new={"grade_policy": validated_body.grade_policy},
            )
        item.grade_policy = validated_body.grade_policy
    if "open_at" in enviados or "due_at" in enviados:
        item.open_at = nuevo_open
        item.due_at = nuevo_due
    if es_tarea:
        item.allow_late = nuevo_allow_late
        item.late_until = nuevo_late_until
        item.allowed_extensions = nuevas_extensiones
        item.max_file_size_mb = nuevo_tamano
        item.max_files = nuevo_max_files
        if "rubric" in enviados:
            item.rubric = nueva_rubrica or None
            if nueva_rubrica:
                # Con rúbrica, el puntaje máximo es la suma de sus criterios.
                item.max_score = tareas.puntaje_de_rubrica(nueva_rubrica)

    db.session.commit()
    archivo_obj = UserFile.query.get(item.file_id) if item.file_id else None
    return jsonify(_item_dict(item, archivo_obj)), 200


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>")
@jwt_required()
def obtener_contenido(course_id, block_id, item_id):
    """Detalle de un elemento. Para una tarea trae además `reglas` (qué
    archivos acepta, tamaño, cantidad, fechas y cuánto falta) y, si quien
    pregunta es un estudiante, `mi_entrega`."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    item = _item_del_curso(course_id, block_id, item_id)
    if item is None:
        return jsonify({"error": "Not Found", "message": "Contenido no encontrado", "status_code": 404}), 404

    archivo_obj = UserFile.query.get(item.file_id) if item.file_id else None
    d = _item_dict(item, archivo_obj)
    if item.type == "ASSIGNMENT" and user.role == "STUDENT":
        entrega = AssignmentSubmission.query.filter_by(item_id=item.id, student_id=user.id).first()
        d["mi_entrega"] = _entrega_dict(entrega) if entrega is not None and entrega.current_version else None
    return jsonify(d), 200


@curso_contenido_bp.delete("/<course_id>/bloques/<block_id>/contenido/<item_id>")
@role_required("TEACHER")
def borrar_contenido(course_id, block_id, item_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    item = _item_del_curso(course_id, block_id, item_id)
    if item is None:
        return jsonify({"error": "Not Found", "message": "Contenido no encontrado", "status_code": 404}), 404

    claves = []
    with transaccion():
        if item.type == "DOCUMENT" and item.file_id:
            archivo = UserFile.query.get(item.file_id)
            if archivo is not None:
                claves.append(archivo.storage_key)
                db.session.delete(archivo)
        if item.type == "ASSIGNMENT":
            # Las filas de las entregas se van en cascada; sus archivos en R2 no.
            claves.extend(_claves_de_entregas([item.id]))
        # Quedan anotadas en la misma transacción: si R2 falla después, se reintenta.
        pendientes = limpieza_r2.encolar(claves, f"contenido:{item_id}")

        db.session.delete(item)

    limpieza_r2.procesar(pendientes)
    return jsonify({"ok": True}), 200


# ─────────────────────── Archivo del contenido (documentos) ───────────────────────

def _item_documento_o_404(course_id, block_id, item_id):
    item = _item_del_curso(course_id, block_id, item_id)
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


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/descarga")
@jwt_required()
def descargar_contenido(course_id, block_id, item_id):
    """Enlace firmado para descargar el material: docente dueño o estudiante matriculado."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    _item, archivo, err = _item_documento_o_404(course_id, block_id, item_id)
    if err:
        return err
    return _respuesta_descarga(archivo)


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

def _tarea_o_404(course_id, block_id, item_id):
    item = _item_del_curso(course_id, block_id, item_id)
    if item is None or item.type != "ASSIGNMENT":
        return None, (jsonify({"error": "Not Found", "message": "Tarea no encontrada", "status_code": 404}), 404)
    return item, None


def _es_estudiante_matriculado(user, course) -> bool:
    return user.role == "STUDENT" and StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is not None


def _archivos_de_entregas(submission_ids) -> dict:
    """{submission_id: [SubmissionFile, ...]} con todas las versiones."""
    ids = [i for i in submission_ids if i is not None]
    if not ids:
        return {}
    agrupados = {}
    for archivo in SubmissionFile.query.filter(SubmissionFile.submission_id.in_(ids)).all():
        agrupados.setdefault(str(archivo.submission_id), []).append(archivo)
    return agrupados


def _entrega_dict(entrega, estudiante=None):
    archivos = _archivos_de_entregas([entrega.id]).get(str(entrega.id), [])
    return entrega.to_dict(archivos=archivos, estudiante=estudiante)


def _claves_de_entregas(item_ids) -> list:
    """Claves en R2 de todo lo entregado (todas las versiones) a esas tareas."""
    ids = list(item_ids)
    if not ids:
        return []
    filas = (
        db.session.query(SubmissionFile.file_key)
        .join(AssignmentSubmission, SubmissionFile.submission_id == AssignmentSubmission.id)
        .execution_options(include_deleted=True)  # también las entregas en la papelera
        .filter(AssignmentSubmission.item_id.in_(ids))
        .all()
    )
    return [clave for (clave,) in filas]


def _error_entrega(status_code, error, message, code, **extra):
    """Error al entregar. `code` identifica la regla que falló, para que la
    interfaz pueda explicarla sin depender del texto."""
    return jsonify({"error": error, "message": message, "status_code": status_code, "code": code, **extra}), status_code


def _nombre_original(nombre: str) -> str:
    """Solo el nombre, sin rutas: es lo que se muestra y con lo que se descarga."""
    return (nombre or "").replace("\\", "/").rsplit("/", 1)[-1].strip()[:255] or "archivo"


def _entrega_bloqueada(item_id, student_id, ahora, es_tardia):
    """Upsert seguro de la entrega: la fila de (tarea, estudiante) existe y
    queda bloqueada para esta transacción.

    INSERT ... ON CONFLICT DO NOTHING se apoya en el UNIQUE (item_id,
    student_id): de dos envíos simultáneos solo uno inserta y el otro espera
    a que el primero confirme. El SELECT ... FOR UPDATE que sigue los pone en
    fila, así que el segundo ya lee la entrega del primero y le suma una
    versión en vez de crear otra fila. La fila nueva nace en versión 0 (sin
    archivos); quien llama la sube a 1 en la misma transacción."""
    db.session.execute(
        pg_insert(AssignmentSubmission.__table__)
        .values(item_id=item_id, student_id=student_id, current_version=0, submitted_at=ahora, is_late=es_tardia)
        .on_conflict_do_nothing(index_elements=["item_id", "student_id"])
    )
    return (
        AssignmentSubmission.query.execution_options(include_deleted=True)  # la fila única puede estar en la papelera
        .filter_by(item_id=item_id, student_id=student_id)
        .with_for_update()
        .populate_existing()
        .one()
    )


@curso_contenido_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas")
@jwt_required()
@limiter.limit(limites.ENTREGA, key_func=limites.usuario_o_ip)
@validate_body(EntregarTareaRequest)
def entregar_tarea(course_id, block_id, item_id, validated_body: EntregarTareaRequest):
    """El estudiante entrega los archivos de la tarea, o la reemplaza: cada
    envío es una versión nueva y las anteriores quedan de historial. Todo se
    valida contra las reglas que configuró el docente (ventana de tiempo,
    cantidad, tamaño, extensión y contenido real) antes de subir nada."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()

    item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return err

    ahora = datetime.now(timezone.utc)
    reglas = tareas.reglas_para_respuesta(item, ahora)

    # 1. Ventana de tiempo, con el reloj del servidor.
    estado = reglas["status"]
    if estado == "NOT_OPEN":
        return _error_entrega(400, "Bad Request", "Esta tarea todavía no abre", "NOT_OPEN", reglas=reglas)
    if estado == "CLOSED":
        if item.allow_late:
            return _error_entrega(400, "Bad Request", "El plazo para entregas tardías ya cerró", "LATE_CLOSED", reglas=reglas)
        return _error_entrega(400, "Bad Request", "El plazo de entrega ya cerró", "CLOSED", reglas=reglas)
    es_tardia = estado == "LATE"

    # 2. Cantidad de archivos.
    enviados = validated_body.archivos()
    if not enviados:
        return _error_entrega(400, "Bad Request", "Adjunta al menos un archivo ('files', o 'name' y 'file_base64')", "NO_FILES")
    if len(enviados) > reglas["max_files"]:
        plural = "archivo" if reglas["max_files"] == 1 else "archivos"
        return _error_entrega(
            400, "Bad Request", f"Esta tarea acepta como máximo {reglas['max_files']} {plural} por entrega", "TOO_MANY_FILES",
            reglas=reglas,
        )

    # 3. Tamaño, extensión y contenido real de cada uno.
    max_bytes = reglas["max_file_size_mb"] * 1024 * 1024
    max_total_bytes = reglas["max_total_mb"] * 1024 * 1024
    validados = []
    total = 0
    for enviado in enviados:
        nombre = _nombre_original(enviado.name)
        demasiado_grande = _error_entrega(
            413, "Payload Too Large",
            f"'{nombre}' supera el tamaño máximo de {reglas['max_file_size_mb']} MB por archivo", "FILE_TOO_LARGE",
            file=nombre, reglas=reglas,
        )
        # El base64 pesa 4/3 del archivo: si ya se pasa, ni se decodifica.
        if len(enviado.file_base64) > max_bytes * 4 // 3 + 16:
            return demasiado_grande
        try:
            contenido = base64.b64decode(enviado.file_base64, validate=False)
        except (binascii.Error, ValueError):
            return _error_entrega(400, "Bad Request", f"El contenido en base64 de '{nombre}' es inválido", "INVALID_BASE64", file=nombre)
        if len(contenido) > max_bytes:
            return demasiado_grande
        total += len(contenido)
        if total > max_total_bytes:
            return _error_entrega(
                413, "Payload Too Large",
                f"La entrega completa supera el máximo de {reglas['max_total_mb']} MB", "TOTAL_TOO_LARGE", reglas=reglas,
            )
        # El tipo sale del contenido real, no del mime_type que manda el cliente.
        try:
            mime_type = validar_archivo(enviado.name, contenido, permitidas=reglas["allowed_extensions"])
        except ArchivoInvalido as aerr:
            return _error_entrega(415, "Unsupported Media Type", f"'{nombre}': {aerr}", aerr.codigo, file=nombre, reglas=reglas)
        validados.append((nombre, contenido, mime_type))

    # 4. A R2, con clave aleatoria. Si algo falla de acá en adelante, lo que
    #    se alcanzó a subir se quita: ninguna fila lo referencia.
    claves = []

    def _limpiar_r2():
        for clave in claves:
            _borrar_de_r2(clave)

    try:
        for _nombre, contenido, mime_type in validados:
            clave = storage.nueva_clave(str(user.id), mime_type)
            storage.subir_bytes(clave, contenido, mime_type)
            claves.append(clave)
    except storage.StorageNotConfigured as serr:
        _limpiar_r2()
        return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503
    except Exception:
        _limpiar_r2()
        raise

    # 5. La entrega y sus archivos, en una sola transacción.
    try:
        entrega = _entrega_bloqueada(item_id, user.id, ahora, es_tardia)
        version = (entrega.current_version or 0) + 1
        for posicion, ((nombre, contenido, mime_type), clave) in enumerate(zip(validados, claves)):
            db.session.add(SubmissionFile(
                submission_id=entrega.id,
                version=version,
                position=posicion,
                file_key=clave,
                original_name=nombre,
                mime_type=mime_type,
                size_bytes=len(contenido),
                is_late=es_tardia,
                uploaded_at=ahora,
            ))
        entrega.current_version = version
        entrega.submitted_at = ahora
        entrega.is_late = es_tardia
        # Si el docente la había mandado a la papelera, volver a entregar la trae de vuelta.
        entrega.deleted_at = None
        if version > 1:
            # Volver a entregar reabre la calificación anterior: hay que revisar de nuevo.
            entrega.score = None
            entrega.rubric_scores = None
            entrega.feedback = None
            entrega.graded_at = None
            entrega.graded_by = None
        db.session.commit()
    except Exception:
        db.session.rollback()
        _limpiar_r2()
        raise

    # Los archivos de las versiones anteriores no se borran: son el historial.
    d = _entrega_dict(entrega)
    d["reglas"] = reglas
    return jsonify(d), 201


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
    item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return err

    # ?eliminadas=1: las que el docente mandó a la papelera (para restaurarlas).
    ver_papelera = (request.args.get("eliminadas") or "").lower() in ("1", "true", "si", "sí")
    query = AssignmentSubmission.query.filter(
        AssignmentSubmission.item_id == item_id, AssignmentSubmission.current_version > 0,
    )
    if ver_papelera:
        query = query.execution_options(include_deleted=True).filter(AssignmentSubmission.deleted_at.isnot(None))
    query = query.order_by(AssignmentSubmission.submitted_at.desc(), AssignmentSubmission.id.asc())

    page, per_page = paginacion.parametros()
    entregas, total = paginacion.paginar(query, page, per_page)
    archivos = _archivos_de_entregas([e.id for e in entregas])

    estudiante_ids = [e.student_id for e in entregas]
    estudiantes = {str(u.id): u for u in User.query.filter(User.id.in_(estudiante_ids)).all()} if estudiante_ids else {}

    return jsonify({
        "entregas": [
            e.to_dict(archivos=archivos.get(str(e.id), []), estudiante=estudiantes.get(str(e.student_id)))
            for e in entregas
        ],
        "reglas": tareas.reglas_para_respuesta(item),
        **paginacion.meta(total, page, per_page),
    }), 200


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/mia")
@jwt_required()
def mi_entrega(course_id, block_id, item_id):
    """El estudiante consulta su propia entrega (null si no ha entregado), con
    el historial de versiones y las reglas de la tarea."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_estudiante_matriculado(user, course):
        return _forbidden()
    item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return err

    reglas = tareas.reglas_para_respuesta(item)
    entrega = AssignmentSubmission.query.filter_by(item_id=item_id, student_id=user.id).first()
    if entrega is None or not entrega.current_version:
        return jsonify({"entrega": None, "reglas": reglas}), 200

    return jsonify({"entrega": _entrega_dict(entrega), "reglas": reglas}), 200


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
    item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return err

    entrega = AssignmentSubmission.query.filter_by(id=submission_id, item_id=item_id).first()
    if entrega is None:
        return jsonify({"error": "Not Found", "message": "Entrega no encontrada", "status_code": 404}), 404

    def _invalido(mensaje):
        return jsonify({"error": "Bad Request", "message": mensaje, "status_code": 400}), 400

    rubrica = list(getattr(item, "rubric", None) or [])
    detalle = None
    if rubrica:
        # Tarea con rúbrica: la nota es la suma de los puntos por criterio.
        if not validated_body.criteria:
            return _invalido("Esta tarea se califica con rúbrica: envía los puntos de cada criterio en 'criteria'.")
        try:
            nota, detalle = tareas.calificar_con_rubrica(rubrica, validated_body.criteria)
        except tareas.ReglaInvalida as rerr:
            return _invalido(str(rerr))
    else:
        if validated_body.criteria:
            return _invalido("Esta tarea no tiene rúbrica: envía la nota en 'score'.")
        if validated_body.score is None:
            return _invalido("Falta la nota ('score').")
        nota = validated_body.score
        if item.max_score is not None and nota > float(item.max_score):
            return _invalido(f"El puntaje no puede superar {item.max_score}")

    auditoria.registrar(
        auditoria.GRADE_CHANGE, "submission", entrega.id,
        old={"score": entrega.score, "feedback": entrega.feedback, "rubric_scores": entrega.rubric_scores},
        new={
            "score": nota, "feedback": validated_body.feedback, "rubric_scores": detalle,
            "student_id": entrega.student_id,
        },
    )
    entrega.score = nota
    entrega.rubric_scores = detalle
    entrega.feedback = validated_body.feedback
    entrega.graded_at = datetime.now(timezone.utc)
    entrega.graded_by = user.id
    db.session.commit()
    notificaciones.tarea_calificada(course, item, entrega)

    return jsonify(_entrega_dict(entrega)), 200


def _entrega_para_docente(course_id, block_id, item_id, submission_id, en_papelera):
    """(entrega, None) si el docente dueño puede tocarla. `en_papelera` dice
    si se busca una vigente (False) o una eliminada (True)."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return None, err
    if not _es_docente_dueno(user, course):
        return None, _forbidden()
    _item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return None, err

    entrega = (
        AssignmentSubmission.query.execution_options(include_deleted=True)
        .filter_by(id=submission_id, item_id=item_id)
        .first()
    )
    if entrega is None or (entrega.deleted_at is not None) != en_papelera:
        mensaje = "Esa entrega no está en la papelera" if en_papelera else "Entrega no encontrada"
        return None, (jsonify({"error": "Not Found", "message": mensaje, "status_code": 404}), 404)
    return entrega, None


@curso_contenido_bp.delete("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>")
@role_required("TEACHER")
def eliminar_entrega(course_id, block_id, item_id, submission_id):
    """El docente dueño manda una entrega a la papelera (borrado suave): deja
    de contar en listados y calificaciones, pero conserva archivos, versiones
    y nota, y se puede restaurar. Si el estudiante vuelve a entregar, vuelve sola."""
    entrega, err = _entrega_para_docente(course_id, block_id, item_id, submission_id, en_papelera=False)
    if err:
        return err
    entrega.marcar_eliminado()
    auditoria.registrar(
        auditoria.SUBMISSION_DELETE, "submission", entrega.id, old={"student_id": entrega.student_id, "score": entrega.score},
    )
    db.session.commit()
    return jsonify({"ok": True, "deleted_at": entrega.deleted_at.isoformat(), "restorable": True}), 200


@curso_contenido_bp.post("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/restaurar")
@role_required("TEACHER")
def restaurar_entrega(course_id, block_id, item_id, submission_id):
    """El docente dueño saca una entrega de la papelera."""
    entrega, err = _entrega_para_docente(course_id, block_id, item_id, submission_id, en_papelera=True)
    if err:
        return err
    entrega.restaurar()
    auditoria.registrar(
        auditoria.SUBMISSION_RESTORE, "submission", entrega.id, new={"student_id": entrega.student_id, "score": entrega.score},
    )
    db.session.commit()
    return jsonify(_entrega_dict(entrega)), 200


def _archivo_de_entrega_o_error(course_id, block_id, item_id, submission_id, file_id=None):
    """(archivo, None) si el usuario puede ver esa entrega: el docente dueño
    del curso o el estudiante que la hizo. Un estudiante nunca llega al
    archivo de otro, aunque conozca el id de la entrega. Sin `file_id` es el
    primer archivo de la versión vigente; con él, ese archivo (de cualquier
    versión) siempre que sea de ESA entrega."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return None, err
    # Antes de buscar nada más: quien no es del curso no se entera de qué tareas o entregas existen.
    if not _puede_ver(user, course):
        return None, _forbidden()
    _item, err = _tarea_o_404(course_id, block_id, item_id)
    if err:
        return None, err

    no_encontrada = (jsonify({"error": "Not Found", "message": "Entrega no encontrada", "status_code": 404}), 404)
    entrega = AssignmentSubmission.query.filter_by(id=submission_id, item_id=item_id).first()
    if entrega is None:
        return None, no_encontrada

    es_dueno = _es_docente_dueno(user, course)
    es_autor = user.role == "STUDENT" and str(entrega.student_id) == str(user.id)
    if not es_dueno and not es_autor:
        return None, _forbidden()

    if file_id is not None:
        archivo = SubmissionFile.query.filter_by(id=file_id, submission_id=entrega.id).first()
    else:
        archivo = (
            SubmissionFile.query.filter_by(submission_id=entrega.id, version=entrega.current_version)
            .order_by(SubmissionFile.position.asc())
            .first()
        )
        if archivo is None and entrega.file_id:
            # Entrega anterior al historial de versiones: un solo archivo en user_files.
            archivo = UserFile.query.get(entrega.file_id)
    if archivo is None:
        return None, no_encontrada
    return archivo, None


@curso_contenido_bp.get(
    "/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/archivos/<file_id>/descarga"
)
@jwt_required()
def descargar_archivo_entrega(course_id, block_id, item_id, submission_id, file_id):
    """Enlace firmado para descargar UN archivo de una entrega (de la versión
    vigente o del historial): docente dueño o el estudiante que la hizo."""
    archivo, err = _archivo_de_entrega_o_error(course_id, block_id, item_id, submission_id, file_id=file_id)
    if err:
        return err
    return _respuesta_descarga(archivo)


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/descarga")
@jwt_required()
def descargar_entrega(course_id, block_id, item_id, submission_id):
    """Enlace firmado para descargar una entrega: docente dueño o el estudiante que la hizo."""
    archivo, err = _archivo_de_entrega_o_error(course_id, block_id, item_id, submission_id)
    if err:
        return err
    return _respuesta_descarga(archivo)


@curso_contenido_bp.get("/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/archivo")
@jwt_required()
def obtener_archivo_entrega(course_id, block_id, item_id, submission_id):
    """El docente dueño del curso, o el estudiante dueño de la entrega, descargan el archivo entregado."""
    archivo, err = _archivo_de_entrega_o_error(course_id, block_id, item_id, submission_id)
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
