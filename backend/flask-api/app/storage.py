"""Almacenamiento de archivos en Cloudflare R2 (API compatible con S3).

El bucket es privado: el navegador sube con una URL firmada de PUT y descarga
con una URL firmada de GET. Las credenciales nunca salen del backend.
"""
import os
import uuid
from functools import lru_cache

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

PRESIGN_TTL_SECONDS = 15 * 60
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
}


class StorageNotConfigured(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _client():
    endpoint = os.environ.get("R2_ENDPOINT_URL")
    key = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    if not (endpoint and key and secret and os.environ.get("R2_BUCKET")):
        raise StorageNotConfigured("R2 no está configurado (faltan variables R2_*)")
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


def url_descarga(clave: str, nombre: str) -> str:
    return _client().generate_presigned_url(
        "get_object",
        Params={
            "Bucket": _bucket(),
            "Key": clave,
            "ResponseContentDisposition": f'attachment; filename="{nombre}"',
        },
        ExpiresIn=PRESIGN_TTL_SECONDS,
    )


def tamano_real(clave: str) -> int | None:
    """Tamaño que R2 tiene guardado, o None si el objeto no existe."""
    try:
        return _client().head_object(Bucket=_bucket(), Key=clave)["ContentLength"]
    except ClientError:
        return None


def copiar(origen: str, destino: str) -> None:
    _client().copy_object(
        Bucket=_bucket(),
        Key=destino,
        CopySource={"Bucket": _bucket(), "Key": origen},
    )


def borrar(clave: str) -> None:
    _client().delete_object(Bucket=_bucket(), Key=clave)
