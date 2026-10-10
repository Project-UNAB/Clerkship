"""Conversión de documentos a PDF vía Gotenberg (LibreOffice headless).

Gotenberg corre como su propio servicio (contenedor Docker, ver
backend/gotenberg/). El backend nunca instala LibreOffice ni parsea
Word/Excel/PowerPoint: le manda el archivo original a Gotenberg y recibe
un PDF, que el frontend muestra con el mismo visor de PDF.js que ya usa
para todo lo demás.
"""
import logging
import os

import requests

CONVERT_TIMEOUT_SECONDS = 60

# Formatos que pasan por Gotenberg. Excel no está acá: se muestra en el
# frontend como grilla real (SheetJS + x-data-spreadsheet), no como PDF.
FORMATOS_CONVERTIBLES = {
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}


logger = logging.getLogger(__name__)


class ConversionNotConfigured(RuntimeError):
    pass


class ConversionError(RuntimeError):
    pass


def _gotenberg_url() -> str:
    url = os.environ.get("GOTENBERG_URL")
    if not url:
        logger.error("Conversión a PDF sin configurar: falta GOTENBERG_URL")
        raise ConversionNotConfigured("La vista previa de este tipo de archivo no está disponible en este momento.")
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
        # El detalle (host interno, error de red) va al log, no a la respuesta.
        logger.error("No se pudo contactar al servicio de conversión", exc_info=True)
        raise ConversionError("No se pudo generar la vista previa del archivo.") from err

    if resp.status_code != 200:
        logger.error("El servicio de conversión respondió %s: %s", resp.status_code, resp.text[:300])
        raise ConversionError("No se pudo generar la vista previa del archivo.")

    return resp.content
