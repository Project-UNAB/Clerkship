"""Schemas para el material de curso (bloques, contenido y tareas)."""
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
    """type: DOCUMENT | VIDEO | LINK | TEXT | ASSIGNMENT | QUIZ — los demás campos varían según el tipo."""

    type: str = Field(..., description="DOCUMENT | VIDEO | LINK | TEXT | ASSIGNMENT | QUIZ")
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

    # ASSIGNMENT (tarea con ventana de entrega)
    open_at: Optional[str] = Field(None, description="ISO 8601 — desde cuándo se puede entregar (opcional)")
    due_at: Optional[str] = Field(None, description="ISO 8601 — fecha límite de entrega (opcional)")
    max_score: Optional[float] = Field(None, ge=0, description="Puntaje máximo de la tarea")
    allow_late: Optional[bool] = Field(False, description="Si se puede entregar después de due_at (marcada como tardía)")

    # QUIZ (open_at/due_at arriba se reutilizan como ventana de disponibilidad)
    time_limit_minutes: Optional[int] = Field(None, ge=1, description="Duración máxima del intento, en minutos")
    max_attempts: Optional[int] = Field(None, ge=1, description="Intentos permitidos por estudiante (vacío = sin límite)")


class ActualizarContenidoRequest(BaseSchema):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)
    position: Optional[int] = None
    video_url: Optional[str] = Field(None, max_length=500)
    link_url: Optional[str] = Field(None, max_length=500)
    text_content: Optional[str] = None
    open_at: Optional[str] = Field(None, description="ISO 8601")
    due_at: Optional[str] = Field(None, description="ISO 8601")
    max_score: Optional[float] = Field(None, ge=0)
    allow_late: Optional[bool] = None
    time_limit_minutes: Optional[int] = Field(None, ge=1)
    max_attempts: Optional[int] = Field(None, ge=1)


class EntregarTareaRequest(BaseSchema):
    """El estudiante entrega un archivo para una tarea."""

    name: str = Field(..., min_length=1, max_length=255, description="Nombre del archivo con extensión")
    mime_type: Optional[str] = None
    file_base64: str = Field(..., min_length=1)


class CalificarEntregaRequest(BaseSchema):
    """El docente califica una entrega."""

    score: float = Field(..., ge=0)
    feedback: Optional[str] = Field(None, max_length=2000)
