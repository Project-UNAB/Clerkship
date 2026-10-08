"""Conversión de documentos a PDF vía Gotenberg (LibreOffice headless).

Gotenberg corre como su propio servicio (contenedor Docker, ver
backend/gotenberg/). El backend nunca instala LibreOffice ni parsea
Word/Excel/PowerPoint: le manda el archivo original a Gotenberg y recibe
un PDF, que el frontend muestra con el mismo visor de PDF.js que ya usa
para todo lo demás.
"""
import os

import requests

CONVERT_TIMEOUT_SECONDS = 60

# Formatos que Gotenberg ya sabe convertir a PDF via LibreOffice.
FORMATOS_CONVERTIBLES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


class ConversionNotConfigured(RuntimeError):
    pass


class ConversionError(RuntimeError):
    pass


def _gotenberg_url() -> str:
    url = os.environ.get("GOTENBERG_URL")
    if not url:
        raise ConversionNotConfigured("GOTENBERG_URL no está configurado")
    return url.rstrip("/")


def convertir_a_pdf(contenido: bytes, nombre_archivo: str) -> bytes:
    """Convierte un archivo de Office a PDF llamando a Gotenberg.

    nombre_archivo debe conservar su extensión original (Gotenberg la usa
    para decidir qué filtro de LibreOffice aplicar).
    """
    url = f"{_gotenberg_url()}/forms/libreoffice/convert"
    try:
        resp = requests.post(
            url,
            files={"files": (nombre_archivo, contenido)},
            timeout=CONVERT_TIMEOUT_SECONDS,
        )
    except requests.RequestException as err:
        raise ConversionError(f"No se pudo contactar a Gotenberg: {err}") from err

    if resp.status_code != 200:
        raise ConversionError(f"Gotenberg respondió {resp.status_code}: {resp.text[:300]}")

    return resp.content
