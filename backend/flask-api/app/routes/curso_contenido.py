"""
Material de un curso: bloques (temas, funcionan como carpetas) con contenido
adentro — documentos (en R2, como la Carpeta de Documentos), videos (enlace
externo a YouTube/Vimeo), enlaces externos y notas de texto.

Solo el docente dueño del curso puede crear/editar/borrar. Para verlo basta
con ser ese docente o estar matriculado como estudiante en el curso.
"""
import base64
import binascii

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db, storage
from app.models import Course, CourseBlock, CourseContentItem, StudentCourse, UserFile
from app.schemas import (
    ActualizarBloqueRequest,
    ActualizarContenidoRequest,
    CrearBloqueRequest,
    CrearContenidoRequest,
    validate_body,
)
from app.services import conversion
from app.utils import get_current_user, role_required

curso_contenido_bp = Blueprint("curso_contenido", __name__)

TIPOS_VALIDOS = ("DOCUMENT", "VIDEO", "LINK", "TEXT")
# Mismo límite que la Carpeta de Documentos (~11MB reales en base64).
MAX_CONTENIDO_BASE64_CHARS = 15 * 1024 * 1024


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
