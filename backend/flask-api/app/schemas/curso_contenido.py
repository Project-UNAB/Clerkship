"""Schemas para el material de curso (bloques y contenido)."""
from typing import Optional

from pydantic import Field

from app.schemas.base import BaseSchema


class CrearBloqueRequest(BaseSchema):
    title: str = Field(..., min_length=1, max_length=150, description="Título del bloque/tema")
    description: Optional[str] = Field(None, max_length=1000)


class ActualizarBloqueRequest(BaseSchema):
    title: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=1000)
    position: Optional[int] = None


class CrearContenidoRequest(BaseSchema):
    """type: DOCUMENT | VIDEO | LINK | TEXT — los demás campos varían según el tipo."""

    type: str = Field(..., description="DOCUMENT | VIDEO | LINK | TEXT")
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

    # DOCUMENT
    name: Optional[str] = Field(None, max_length=255, description="Nombre del archivo con extensión")
    mime_type: Optional[str] = None
    file_base64: Optional[str] = None

    # VIDEO (enlace externo YouTube/Vimeo)
    video_url: Optional[str] = Field(None, max_length=500)

    # LINK (recurso externo)
    link_url: Optional[str] = Field(None, max_length=500)

    # TEXT (nota/instrucción del docente)
    text_content: Optional[str] = None


class ActualizarContenidoRequest(BaseSchema):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    position: Optional[int] = None
    video_url: Optional[str] = Field(None, max_length=500)
    link_url: Optional[str] = Field(None, max_length=500)
    text_content: Optional[str] = None
