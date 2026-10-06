"""Almacenamiento personal (5 GB por usuario) y publicación de PDF en la biblioteca.

Flujo de subida:
  1. POST /subidas            -> el backend valida y devuelve una URL firmada de PUT.
  2. PUT (desde el navegador) -> el archivo va directo a Cloudflare R2.
  3. POST /subidas/<id>/confirmar -> el backend verifica que R2 tiene el archivo.
"""
import uuid

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required
from pydantic import Field
from sqlalchemy import func

from app import db
from app.models import Article, DocumentFolder, UserFile
from app.schemas import BaseSchema, validate_body
from app import storage

almacenamiento_bp = Blueprint("almacenamiento", __name__)


class SubidaRequest(BaseSchema):
    nombre: str = Field(..., min_length=1, max_length=255)
    mime_type: str = Field(..., max_length=100)
    size_bytes: int = Field(..., gt=0)
    carpeta_id: str | None = None


class PublicarRequest(BaseSchema):
    titulo: str | None = Field(None, max_length=255)
    descripcion: str | None = Field(None, max_length=2000)
    specialty: str | None = Field(None, max_length=100)


class ActualizarArchivoRequest(BaseSchema):
    nombre: str | None = Field(None, min_length=1, max_length=255)
    carpeta_id: str | None = Field(None, description="null o vacío para quitar la carpeta")


def _error(status: int, mensaje: str):
    nombres = {400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 413: "Payload Too Large", 503: "Service Unavailable"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _usuario_id():
    return uuid.UUID(get_jwt_identity())


def _espacio_usado(owner_id) -> int:
    """Bytes que ocupan los archivos del usuario, incluidos los pendientes de confirmar."""
    total = db.session.query(func.coalesce(func.sum(UserFile.size_bytes), 0)).filter(UserFile.owner_id == owner_id).scalar()
    return int(total or 0)


def _archivo_del_usuario(file_id, owner_id):
    try:
        return UserFile.query.filter_by(id=uuid.UUID(file_id), owner_id=owner_id).first()
    except ValueError:
        return None


@almacenamiento_bp.get("/uso")
@jwt_required()
def uso():
    usado = _espacio_usado(_usuario_id())
    return jsonify({"usado_bytes": usado, "limite_bytes": storage.QUOTA_BYTES_PER_USER}), 200


@almacenamiento_bp.get("/archivos")
@jwt_required()
def listar_archivos():
    query = UserFile.query.filter_by(owner_id=_usuario_id(), estado="LISTO")
    carpeta_id = request.args.get("carpeta_id")
    if carpeta_id:
        try:
            query = query.filter_by(carpeta_id=uuid.UUID(carpeta_id))
        except ValueError:
            return _error(400, "carpeta_id inválido.")
    archivos = query.order_by(UserFile.created_at.desc()).all()
    return jsonify({"archivos": [a.to_dict() for a in archivos]}), 200


@almacenamiento_bp.post("/subidas")
@jwt_required()
@validate_body(SubidaRequest)
def iniciar_subida(validated_body: SubidaRequest):
    if validated_body.mime_type not in storage.TIPOS_PERMITIDOS:
        return _error(400, "Ese tipo de archivo no está permitido.")
    if validated_body.size_bytes > storage.MAX_FILE_BYTES:
        return _error(413, "El archivo supera el máximo de 100 MB.")

    owner_id = _usuario_id()
    if _espacio_usado(owner_id) + validated_body.size_bytes > storage.QUOTA_BYTES_PER_USER:
        return _error(413, "No tienes espacio suficiente. Tu límite es de 5 GB.")

    carpeta_id = None
    if validated_body.carpeta_id:
        try:
            carpeta = DocumentFolder.query.filter_by(id=uuid.UUID(validated_body.carpeta_id), owner_user_id=owner_id).first()
        except ValueError:
            carpeta = None
        if carpeta is None:
            return _error(404, "Carpeta no encontrada.")
        carpeta_id = carpeta.id

    clave = storage.nueva_clave(str(owner_id), validated_body.mime_type)
    archivo = UserFile(
        owner_id=owner_id,
        nombre=validated_body.nombre.strip(),
        storage_key=clave,
        mime_type=validated_body.mime_type,
        size_bytes=validated_body.size_bytes,
        estado="PENDIENTE",
        carpeta_id=carpeta_id,
    )
    db.session.add(archivo)
    db.session.commit()

    try:
        url = storage.url_subida(clave, validated_body.mime_type, validated_body.size_bytes)
    except storage.StorageNotConfigured as err:
        db.session.delete(archivo)
        db.session.commit()
        return _error(503, str(err))

    return jsonify({
        "id": str(archivo.id),
        "upload_url": url,
        "headers": {"Content-Type": validated_body.mime_type},
        "expira_en_segundos": storage.PRESIGN_TTL_SECONDS,
    }), 201


@almacenamiento_bp.post("/subidas/<file_id>/confirmar")
@jwt_required()
def confirmar_subida(file_id):
    archivo = _archivo_del_usuario(file_id, _usuario_id())
    if archivo is None:
        return _error(404, "Archivo no encontrado.")
    if archivo.estado == "LISTO":
        return jsonify({"archivo": archivo.to_dict()}), 200

    try:
        tamano = storage.tamano_real(archivo.storage_key)
    except storage.StorageNotConfigured as err:
        return _error(503, str(err))

    if tamano is None:
        return _error(409, "El archivo todavía no llegó al almacenamiento. Intenta de nuevo.")
    if tamano != archivo.size_bytes:
        storage.borrar(archivo.storage_key)
        db.session.delete(archivo)
        db.session.commit()
        return _error(400, "El tamaño del archivo no coincide con lo declarado. Vuelve a subirlo.")

    archivo.estado = "LISTO"
    db.session.commit()
    return jsonify({"archivo": archivo.to_dict()}), 200


@almacenamiento_bp.get("/archivos/<file_id>/descarga")
@jwt_required()
def descargar(file_id):
    archivo = _archivo_del_usuario(file_id, _usuario_id())
    if archivo is None or archivo.estado != "LISTO":
        return _error(404, "Archivo no encontrado.")
    try:
        return jsonify({"url": storage.url_descarga(archivo.storage_key, archivo.nombre)}), 200
    except storage.StorageNotConfigured as err:
        return _error(503, str(err))


@almacenamiento_bp.patch("/archivos/<file_id>")
@jwt_required()
@validate_body(ActualizarArchivoRequest)
def actualizar_archivo(file_id, validated_body: ActualizarArchivoRequest):
    owner_id = _usuario_id()
    archivo = _archivo_del_usuario(file_id, owner_id)
    if archivo is None:
        return _error(404, "Archivo no encontrado.")

    if validated_body.nombre:
        archivo.nombre = validated_body.nombre.strip()

    data = request.get_json(silent=True) or {}
    if "carpeta_id" in data:
        carpeta_id_raw = data["carpeta_id"]
        if carpeta_id_raw:
            try:
                carpeta = DocumentFolder.query.filter_by(id=uuid.UUID(carpeta_id_raw), owner_user_id=owner_id).first()
            except ValueError:
                carpeta = None
            if carpeta is None:
                return _error(404, "Carpeta no encontrada.")
            archivo.carpeta_id = carpeta.id
        else:
            archivo.carpeta_id = None

    db.session.commit()
    return jsonify({"archivo": archivo.to_dict()}), 200


@almacenamiento_bp.delete("/archivos/<file_id>")
@jwt_required()
def borrar_archivo(file_id):
    archivo = _archivo_del_usuario(file_id, _usuario_id())
    if archivo is None:
        return _error(404, "Archivo no encontrado.")
    try:
        storage.borrar(archivo.storage_key)
    except storage.StorageNotConfigured as err:
        return _error(503, str(err))
    db.session.delete(archivo)
    db.session.commit()
    return jsonify({"ok": True}), 200


@almacenamiento_bp.post("/archivos/<file_id>/publicar")
@jwt_required()
@validate_body(PublicarRequest)
def publicar_en_biblioteca(file_id, validated_body: PublicarRequest):
    owner_id = _usuario_id()
    archivo = _archivo_del_usuario(file_id, owner_id)
    if archivo is None or archivo.estado != "LISTO":
        return _error(404, "Archivo no encontrado.")
    if archivo.mime_type != "application/pdf":
        return _error(400, "Solo se pueden publicar archivos PDF en la biblioteca.")

    article_id = uuid.uuid4()
    titulo = (validated_body.titulo or archivo.nombre.rsplit(".", 1)[0]).strip()
    clave_publica = storage.clave_biblioteca(str(article_id))
    try:
        storage.copiar(archivo.storage_key, clave_publica)
    except storage.StorageNotConfigured as err:
        return _error(503, str(err))

    articulo = Article(
        id=article_id,
        type="GUIA",
        title=titulo,
        description=validated_body.descripcion or "",
        specialty=validated_body.specialty,
        url=f"/api/almacenamiento/biblioteca/{article_id}/descarga",
        archivo_key=clave_publica,
        publicado_por=owner_id,
    )
    db.session.add(articulo)
    db.session.commit()
    return jsonify({"article": articulo.to_dict(tags=[])}), 201


@almacenamiento_bp.get("/biblioteca/<article_id>/descarga")
@jwt_required()
def descargar_de_biblioteca(article_id):
    try:
        articulo = Article.query.get(uuid.UUID(article_id))
    except ValueError:
        articulo = None
    if articulo is None or not articulo.archivo_key:
        return _error(404, "Este recurso no tiene archivo descargable.")
    try:
        return jsonify({"url": storage.url_descarga(articulo.archivo_key, f"{articulo.title}.pdf")}), 200
    except storage.StorageNotConfigured as err:
        return _error(503, str(err))
