"""Almacenamiento de archivos en Cloudflare R2 (API compatible con S3).

El bucket es privado: el navegador sube con una URL firmada de PUT y descarga
con una URL firmada de GET. Las credenciales nunca salen del backend.
"""
import logging
import os
import uuid
from functools import lru_cache
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

PRESIGN_TTL_SECONDS = 15 * 60
# Descargas de material y entregas de curso: enlace de vida más corta.
DESCARGA_CURSO_TTL_SECONDS = 10 * 60
# Portadas de curso: solo las ve quien ya está autenticado y no son material
# sensible; el enlace dura lo suficiente para una sesión de navegación.
IMAGEN_TTL_SECONDS = 60 * 60
MAX_FILE_BYTES = 100 * 1024 * 1024
QUOTA_BYTES_PER_USER = 5 * 1024 ** 3

# Almacenamiento personal: los mismos tipos que ya acepta la Carpeta de
# Documentos (PDF, Word, Excel, PowerPoint, imágenes y texto plano).
# Publicar en la biblioteca sigue restringido solo a PDF (ver almacenamiento.py).
TIPOS_PERMITIDOS = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
    "text/plain",
    "text/csv",
}

_EXTENSIONES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.ms-powerpoint": ".ppt",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "text/plain": ".txt",
    "text/csv": ".csv",
    # Solo para entregas de tareas que lo habiliten (no está en TIPOS_PERMITIDOS).
    "application/zip": ".zip",
}


class StorageNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    endpoint = os.environ.get("R2_ENDPOINT_URL")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (endpoint and key and secret and os.environ.get("R2_BUCKET")):
        # El mensaje llega tal cual al cliente (503): no nombra variables ni proveedor.
        logging.getLogger(__name__).error("R2 no está configurado: faltan variables R2_*")
        raise StorageNotConfigured("El almacenamiento de archivos no está disponible en este momento.")
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=key,
        aws_secret_access_key=secret,
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def _bucket() -> str:
    return os.environ["R2_BUCKET"]


def nueva_clave(owner_id: str, mime_type: str) -> str:
    """Clave única por archivo, agrupada por dueño. El nombre original no forma parte de la clave."""
    extension = _EXTENSIONES.get(mime_type, "")
    return f"usuarios/{owner_id}/{uuid.uuid4().hex}{extension}"


def clave_biblioteca(article_id: str) -> str:
    return f"biblioteca/{article_id}.pdf"


def url_subida(clave: str, mime_type: str, size_bytes: int) -> str:
    return _client().generate_presigned_url(
        "put_object",
        Params={"Bucket": _bucket(), "Key": clave, "ContentType": mime_type, "ContentLength": size_bytes},
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )


def _content_disposition(nombre: str) -> str:
    """Cabecera de descarga con el nombre original. El nombre lo eligió quien
    subió el archivo, así que se limpia antes de meterlo en una cabecera:
    sin saltos de línea, comillas ni separadores de ruta."""
    limpio = "".join(ch for ch in (nombre or "") if ch.isprintable() and ch not in '"\\/;%')
    limpio = limpio.strip(" .") or "archivo"
    ascii_fallback = limpio.encode("ascii", "ignore").decode("ascii").strip(" .") or "archivo"
    return f"attachment; filename=\"{ascii_fallback}\"; filename*=UTF-8''{quote(limpio, safe='')}"


def url_descarga(clave: str, nombre: str, mime_type: str | None = None, expira: int = PRESIGN_TTL_SECONDS) -> str:
    """URL firmada de descarga. Siempre baja como adjunto (nunca se abre
    dentro del navegador). Si se pasa `mime_type`, la respuesta sale con ese
    tipo cuando está en la lista permitida y como binario genérico si no."""
    params = {
        "Bucket": _bucket(),
        "Key": clave,
        "ResponseContentDisposition": _content_disposition(nombre),
    }
    if mime_type is not None:
        params["ResponseContentType"] = mime_type if mime_type in TIPOS_PERMITIDOS else "application/octet-stream"
    return _client().generate_presigned_url("get_object", Params=params, ExpiresIn=expira)


def url_imagen(clave: str, mime_type: str = "image/webp", expira: int = IMAGEN_TTL_SECONDS) -> str:
    """URL para mostrar una imagen propia de la plataforma (portadas de curso)
    en un <img>. El bucket es privado, así que por defecto es una URL firmada;
    si R2_PUBLIC_BASE_URL apunta a un dominio público del bucket, se usa ese
    y la URL es estable (el navegador la puede cachear)."""
    base_publica = (os.environ.get("R2_PUBLIC_BASE_URL") or "").strip().rstrip("/")
    if base_publica:
        return f"{base_publica}/{quote(clave)}"
    return _client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": _bucket(),
            "Key": clave,
            "ResponseContentType": mime_type,
            "ResponseContentDisposition": "inline",
            "ResponseCacheControl": f"private, max-age={expira}",
        },
        ExpiresIn=expira,
    )


def tamano_real(clave: str) -> int | None:
    """Tamaño que R2 tiene guardado, o None si el objeto no existe."""
    try:
        return _client().head_object(Bucket=_bucket(), Key=clave)["ContentLength"]
    except ClientError:
        return None


def subir_bytes(clave: str, contenido: bytes, mime_type: str) -> None:
    """Sube bytes directo desde el backend (sin URL firmada). Lo usa la Carpeta
    de Documentos, que recibe el archivo como base64 en el cuerpo del pedido."""
    _client().put_object(Bucket=_bucket(), Key=clave, Body=contenido, ContentType=mime_type or "application/octet-stream")


def descargar_bytes(clave: str) -> bytes:
    return _client().get_object(Bucket=_bucket(), Key=clave)["Body"].read()


def copiar(origen: str, destino: str) -> None:
    _client().copy_object(
        Bucket=_bucket(),
        Key=destino,
        CopySource={"Bucket": _bucket(), "Key": origen},
    )


def borrar(clave: str) -> None:
    _client().delete_object(Bucket=_bucket(), Key=clave)
