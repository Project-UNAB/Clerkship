"""
Carpetas y documentos reales del Dashboard.

La carpeta (quién es dueño, nombre, color) vive en Postgres (`document_folders`).
El archivo en sí vive en Cloudflare R2, con su metadata en Postgres
(`user_files`, la misma tabla que usa /api/almacenamiento) — no en Mongo.

Los documentos que se subieron ANTES de este cambio siguen en Mongo
(colección `documents`, como base64). Siguen apareciendo mezclados con los
nuevos hasta que se migren o se borren; esta ruta solo lee de ahí, nunca
vuelve a escribir.
"""
import base64
import binascii
import uuid
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from sqlalchemy import func

from app import db, get_mongo_db, storage
from app.models import DocumentFolder, UserFile
from app.schemas import (
    CreateFolderRequest,
    DocumentFileResponse,
    DocumentFolderResponse,
    UpdateFolderRequest,
    UploadDocumentRequest,
    validate_body,
)
from app.utils import get_current_user

documentos_bp = Blueprint("documentos", __name__)

# Límite del cuerpo del pedido (JSON con el archivo en base64). Para archivos
# más grandes, la Carpeta de Documentos debería migrar al flujo de URL firmada
# de /api/almacenamiento, pensado para hasta 100 MB sin pasar por el backend.
MAX_DOCUMENT_BASE64_CHARS = 15 * 1024 * 1024  # ~11MB reales por documento


def _extension_of(name: str) -> str:
    """".pdf" de "informe.pdf", o "" si no tiene punto — mismo criterio que
    splitExtension() en el frontend."""
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""


def _folder_dict_with_counts(folder: DocumentFolder, counts: dict, subfolder_counts: dict = None) -> dict:
    d = folder.to_dict()
    info = counts.get(str(folder.id), {"files": 0, "size_bytes": 0})
    d["file_count"] = info["files"]
    d["total_size_bytes"] = info["size_bytes"]
    d["subfolder_count"] = (subfolder_counts or {}).get(str(folder.id), 0)
    return d


def _conteos_por_carpeta(user_id) -> dict:
    """Archivos y bytes por carpeta, sumando R2 (user_files) y los que
    todavía quedan en Mongo (legado)."""
    counts: dict = {}

    rows = (
        db.session.query(UserFile.carpeta_id, func.count(UserFile.id), func.coalesce(func.sum(UserFile.size_bytes), 0))
        .filter(UserFile.owner_id == user_id, UserFile.estado == "LISTO")
        .group_by(UserFile.carpeta_id)
        .all()
    )
    for carpeta_id, total_files, total_bytes in rows:
        key = str(carpeta_id) if carpeta_id else ""
        counts[key] = {"files": total_files, "size_bytes": int(total_bytes)}

    try:
        pipeline = [
            {"$match": {"owner_user_id": str(user_id)}},
            {"$group": {"_id": "$folder_id", "files": {"$sum": 1}, "size_bytes": {"$sum": "$size_bytes"}}},
        ]
        for doc in get_mongo_db().documents.aggregate(pipeline):
            key = doc["_id"] or ""
            prev = counts.get(key, {"files": 0, "size_bytes": 0})
            counts[key] = {"files": prev["files"] + doc["files"], "size_bytes": prev["size_bytes"] + doc["size_bytes"]}
    except Exception:
        pass

    return counts


def _document_dict(doc, include_data: bool = False) -> dict:
    """Documento legado de Mongo, en el mismo formato que uno de R2."""
    d = {
        "id": str(doc["_id"]),
        "folder_id": doc.get("folder_id"),
        "name": doc.get("name"),
        "mime_type": doc.get("mime_type"),
        "size_bytes": doc.get("size_bytes", 0),
        "created_at": doc["created_at"].replace(tzinfo=timezone.utc).isoformat() if doc.get("created_at") else None,
        "origen": "mongo",
    }
    if include_data:
        d["data"] = doc.get("data")
    return d


def _archivo_r2_dict(archivo: UserFile, include_data: bool = False) -> dict:
    d = {
        "id": str(archivo.id),
        "folder_id": str(archivo.carpeta_id) if archivo.carpeta_id else None,
        "name": archivo.nombre,
        "mime_type": archivo.mime_type,
        "size_bytes": archivo.size_bytes,
        "created_at": archivo.created_at.replace(tzinfo=timezone.utc).isoformat() if archivo.created_at else None,
        "origen": "r2",
    }
    if include_data:
        contenido = storage.descargar_bytes(archivo.storage_key)
        d["data"] = base64.b64encode(contenido).decode("ascii")
    return d


def _descendant_ids(user_id, root_id: str) -> list:
    """IDs de todas las subcarpetas (a cualquier profundidad) de root_id, sin incluirlo."""
    all_folders = DocumentFolder.query.filter_by(owner_user_id=user_id).all()
    children_of: dict = {}
    for f in all_folders:
        parent = str(f.parent_folder_id) if f.parent_folder_id else None
        children_of.setdefault(parent, []).append(str(f.id))

    result = []
    stack = list(children_of.get(root_id, []))
    while stack:
        fid = stack.pop()
        result.append(fid)
        stack.extend(children_of.get(fid, []))
    return result


@documentos_bp.get("/carpetas")
@jwt_required()
def listar_carpetas():
    user = get_current_user()
    if not user:
        return jsonify({
            "error": "Not Found",
            "message": "Usuario no encontrado",
            "status_code": 404
        }), 404

    folders = DocumentFolder.query.filter_by(owner_user_id=user.id).order_by(DocumentFolder.created_at.asc()).all()
    counts = _conteos_por_carpeta(user.id)

    subfolder_counts: dict = {}
    for f in folders:
        if f.parent_folder_id:
            key = str(f.parent_folder_id)
            subfolder_counts[key] = subfolder_counts.get(key, 0) + 1

    return jsonify({"folders": [_folder_dict_with_counts(f, counts, subfolder_counts) for f in folders]}), 200


@documentos_bp.post("/carpetas")
@jwt_required()
@validate_body(CreateFolderRequest)
def crear_carpeta(validated_body: CreateFolderRequest):
    user = get_current_user()
    name = validated_body.name.strip()
    color = (validated_body.color or "#10B981").strip()

    data = request.get_json(silent=True) or {}
    parent_folder_id = data.get("parent_folder_id")

    if parent_folder_id:
        parent = DocumentFolder.query.filter_by(id=parent_folder_id, owner_user_id=user.id).first()
        if parent is None:
            return jsonify({
                "error": "Not Found",
                "message": "Carpeta padre no encontrada",
                "status_code": 404
            }), 404

    folder = DocumentFolder(owner_user_id=user.id, name=name, color=color, parent_folder_id=parent_folder_id or None)
    db.session.add(folder)
    db.session.commit()

    return jsonify({"folder": _folder_dict_with_counts(folder, {}), **_folder_dict_with_counts(folder, {})}), 201


@documentos_bp.patch("/carpetas/<folder_id>")
@jwt_required()
@validate_body(UpdateFolderRequest)
def actualizar_carpeta(folder_id, validated_body: UpdateFolderRequest):
    user = get_current_user()
    folder = DocumentFolder.query.filter_by(id=folder_id, owner_user_id=user.id).first()
    if folder is None:
        return jsonify({
            "error": "Not Found",
            "message": "Carpeta no encontrada",
            "status_code": 404
        }), 404

    if validated_body.name:
        folder.name = validated_body.name.strip()
    if validated_body.color:
        folder.color = validated_body.color.strip()

    data = request.get_json(silent=True) or {}
    if "parent_folder_id" in data:
        parent_folder_id = data["parent_folder_id"]
        if parent_folder_id:
            if parent_folder_id == str(folder.id):
                return jsonify({
                    "error": "Bad Request",
                    "message": "Una carpeta no puede ser su propia carpeta padre",
                    "status_code": 400
                }), 400
            parent = DocumentFolder.query.filter_by(id=parent_folder_id, owner_user_id=user.id).first()
            if parent is None:
                return jsonify({
                    "error": "Not Found",
                    "message": "Carpeta padre no encontrada",
                    "status_code": 404
                }), 404
            if parent_folder_id in _descendant_ids(user.id, str(folder.id)):
                return jsonify({
                    "error": "Bad Request",
                    "message": "No se puede mover una carpeta dentro de su propia subcarpeta",
                    "status_code": 400
                }), 400
        folder.parent_folder_id = parent_folder_id or None

    folder.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    counts = _conteos_por_carpeta(user.id)
    return jsonify({"folder": _folder_dict_with_counts(folder, counts)}), 200


@documentos_bp.delete("/carpetas/<folder_id>")
@jwt_required()
def borrar_carpeta(folder_id):
    user = get_current_user()
    folder = DocumentFolder.query.filter_by(id=folder_id, owner_user_id=user.id).first()
    if folder is None:
        return jsonify({"error": "Carpeta no encontrada"}), 404

    folder_ids = [str(folder.id)] + _descendant_ids(user.id, str(folder.id))

    # Los archivos en R2 no se borran: la llave foránea los deja sin carpeta
    # (ON DELETE SET NULL), así que no se pierden al borrar la carpeta.
    deleted_count = 0
    try:
        result = get_mongo_db().documents.delete_many({"owner_user_id": str(user.id), "folder_id": {"$in": folder_ids}})
        deleted_count = result.deleted_count
    except Exception:
        deleted_count = 0
    db.session.delete(folder)
    db.session.commit()

    return jsonify({"ok": True, "documents_deleted": deleted_count}), 200


@documentos_bp.get("/documentos")
@documentos_bp.get("/archivos")
@jwt_required()
def listar_documentos():
    user = get_current_user()
    folder_id = request.args.get("folder_id")
    limit = min(int(request.args.get("limit", 100)), 300)

    r2_query = UserFile.query.filter_by(owner_id=user.id, estado="LISTO")
    if folder_id:
        try:
            r2_query = r2_query.filter_by(carpeta_id=uuid.UUID(folder_id))
        except ValueError:
            r2_query = r2_query.filter(False)
    archivos_r2 = [_archivo_r2_dict(a) for a in r2_query.order_by(UserFile.created_at.desc()).limit(limit).all()]

    mongo_query: dict = {"owner_user_id": str(user.id)}
    if folder_id:
        mongo_query["folder_id"] = folder_id
    try:
        docs_mongo = [
            _document_dict(d)
            for d in get_mongo_db().documents.find(mongo_query).sort("created_at", -1).limit(limit)
        ]
    except Exception:
        docs_mongo = []

    combined = sorted(archivos_r2 + docs_mongo, key=lambda d: d["created_at"] or "", reverse=True)[:limit]
    return jsonify({"documents": combined}), 200


@documentos_bp.post("/documentos")
@documentos_bp.post("/archivos")
@jwt_required()
@validate_body(UploadDocumentRequest)
def subir_documento(validated_body: UploadDocumentRequest):
    user = get_current_user()
    name = validated_body.name.strip()
    mime_type = (validated_body.mime_type or "application/octet-stream").strip()
    file_b64 = validated_body.get_content()
    folder_id = validated_body.folder_id

    if not file_b64:
        return jsonify({
            "error": "Bad Request",
            "message": "Se requiere el contenido del archivo en 'file_base64' o 'data'",
            "status_code": 400
        }), 400

    if len(file_b64) > MAX_DOCUMENT_BASE64_CHARS:
        return jsonify({
            "error": "Payload Too Large",
            "message": "El documento es demasiado pesado",
            "status_code": 413
        }), 413

    try:
        contenido = base64.b64decode(file_b64, validate=False)
    except (binascii.Error, ValueError):
        return jsonify({
            "error": "Bad Request",
            "message": "El contenido en base64 es inválido",
            "status_code": 400
        }), 400

    carpeta_id = None
    if folder_id:
        folder = DocumentFolder.query.filter_by(id=folder_id, owner_user_id=user.id).first()
        if folder is None:
            return jsonify({
                "error": "Not Found",
                "message": "Carpeta no encontrada",
                "status_code": 404
            }), 404
        carpeta_id = folder.id

    try:
        clave = storage.nueva_clave(str(user.id), mime_type)
        storage.subir_bytes(clave, contenido, mime_type)
    except storage.StorageNotConfigured as err:
        return jsonify({"error": "Service Unavailable", "message": str(err), "status_code": 503}), 503

    archivo = UserFile(
        owner_id=user.id,
        nombre=name,
        storage_key=clave,
        mime_type=mime_type,
        size_bytes=len(contenido),
        estado="LISTO",
        carpeta_id=carpeta_id,
    )
    db.session.add(archivo)
    db.session.commit()

    doc_dict = _archivo_r2_dict(archivo)
    return jsonify({"document": doc_dict, **doc_dict}), 201


def _ubicar(document_id):
    """Encuentra el documento en R2 (UserFile) o, si no está ahí, en Mongo (legado).
    Devuelve ("r2", UserFile) | ("mongo", dict) | (None, None)."""
    try:
        archivo = UserFile.query.get(uuid.UUID(document_id))
        if archivo is not None:
            return "r2", archivo
    except ValueError:
        pass

    try:
        oid = ObjectId(document_id)
    except InvalidId:
        return None, None
    try:
        doc = get_mongo_db().documents.find_one({"_id": oid})
    except Exception:
        return None, None
    if doc is not None:
        return "mongo", doc
    return None, None


@documentos_bp.get("/documentos/<document_id>")
@documentos_bp.get("/archivos/<document_id>")
@jwt_required()
def obtener_documento(document_id):
    user = get_current_user()
    origen, doc = _ubicar(document_id)

    if origen == "r2":
        if doc.owner_id != user.id:
            return jsonify({"error": "Documento no encontrado"}), 404
        return jsonify({"document": _archivo_r2_dict(doc, include_data=True)}), 200

    if origen == "mongo":
        if doc.get("owner_user_id") != str(user.id):
            return jsonify({"error": "Documento no encontrado"}), 404
        return jsonify({"document": _document_dict(doc, include_data=True)}), 200

    return jsonify({"error": "Documento no encontrado"}), 404


@documentos_bp.patch("/documentos/<document_id>")
@documentos_bp.patch("/archivos/<document_id>")
@jwt_required()
def actualizar_documento(document_id):
    user = get_current_user()
    origen, doc = _ubicar(document_id)
    if origen is None:
        return jsonify({"error": "Documento no encontrado"}), 404

    data = request.get_json(silent=True) or {}

    if origen == "r2":
        if doc.owner_id != user.id:
            return jsonify({"error": "Documento no encontrado"}), 404
        if "name" in data:
            name = (data["name"] or "").strip()
            if not name:
                return jsonify({"error": "name no puede quedar vacío"}), 400
            original_ext = _extension_of(doc.nombre or "")
            new_base = name[: len(name) - len(_extension_of(name))] if _extension_of(name) else name
            doc.nombre = f"{new_base}{original_ext}"
        if "folder_id" in data:
            folder_id = data["folder_id"]
            if folder_id:
                folder = DocumentFolder.query.filter_by(id=folder_id, owner_user_id=user.id).first()
                if folder is None:
                    return jsonify({"error": "Carpeta no encontrada"}), 404
                doc.carpeta_id = folder.id
            else:
                doc.carpeta_id = None
        db.session.commit()
        return jsonify({"ok": True}), 200

    # Legado en Mongo.
    if doc.get("owner_user_id") != str(user.id):
        return jsonify({"error": "Documento no encontrado"}), 404
    mongo = get_mongo_db()
    updates = {}
    if "name" in data:
        name = (data["name"] or "").strip()
        if not name:
            return jsonify({"error": "name no puede quedar vacío"}), 400
        original_ext = _extension_of(doc.get("name") or "")
        new_base = name[: len(name) - len(_extension_of(name))] if _extension_of(name) else name
        updates["name"] = f"{new_base}{original_ext}"
    if "folder_id" in data:
        folder_id = data["folder_id"]
        if folder_id:
            folder = DocumentFolder.query.filter_by(id=folder_id, owner_user_id=user.id).first()
            if folder is None:
                return jsonify({"error": "Carpeta no encontrada"}), 404
        updates["folder_id"] = folder_id
    if updates:
        mongo.documents.update_one({"_id": doc["_id"]}, {"$set": updates})
    return jsonify({"ok": True}), 200


@documentos_bp.delete("/documentos/<document_id>")
@documentos_bp.delete("/archivos/<document_id>")
@jwt_required()
def borrar_documento(document_id):
    user = get_current_user()
    origen, doc = _ubicar(document_id)
    if origen is None:
        return jsonify({"error": "Documento no encontrado"}), 404

    if origen == "r2":
        if doc.owner_id != user.id:
            return jsonify({"error": "Documento no encontrado"}), 404
        try:
            storage.borrar(doc.storage_key)
        except storage.StorageNotConfigured:
            pass
        db.session.delete(doc)
        db.session.commit()
        return jsonify({"ok": True}), 200

    if doc.get("owner_user_id") != str(user.id):
        return jsonify({"error": "Documento no encontrado"}), 404
    get_mongo_db().documents.delete_one({"_id": doc["_id"]})
    return jsonify({"ok": True}), 200
