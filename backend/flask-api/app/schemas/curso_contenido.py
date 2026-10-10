"""Schemas para el material de curso (bloques, contenido y tareas)."""
from typing import List, Literal, Optional

from pydantic import Field

from app.schemas.base import BaseSchema

PoliticaNota = Literal["BEST", "LAST", "AVERAGE", "FIRST"]


class CriterioRubrica(BaseSchema):
    """Un criterio de la rúbrica de una tarea."""

    id: Optional[str] = Field(None, max_length=64, description="Al editar, el id del criterio que ya existía")
    title: str = Field(..., min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=500)
    max_points: float = Field(..., gt=0, le=1000)


class NotaDeCriterio(BaseSchema):
    """Los puntos que el docente pone en un criterio de la rúbrica."""

    criterion_id: str = Field(..., min_length=1, max_length=64)
    points: float = Field(..., ge=0)
    comment: Optional[str] = Field(None, max_length=500)


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
    late_until: Optional[str] = Field(None, description="ISO 8601 — hasta cuándo se aceptan tardías (vacío = sin tope)")
    allowed_extensions: Optional[List[str]] = Field(
        None, max_length=30, description='Extensiones que acepta la tarea, ej. ["pdf","docx"]. Vacío = las del servidor por defecto',
    )
    max_file_size_mb: Optional[int] = Field(None, ge=1, description="Tamaño máximo por archivo, en MB (hasta el tope del servidor)")
    max_files: Optional[int] = Field(None, ge=1, description="Archivos por entrega (por defecto 1)")
    rubric: Optional[List[CriterioRubrica]] = Field(
        None, max_length=20, description="Rúbrica opcional: con ella max_score es la suma de los puntos de los criterios",
    )

    # QUIZ (open_at/due_at arriba se reutilizan como ventana de disponibilidad)
    time_limit_minutes: Optional[int] = Field(None, ge=1, description="Duración máxima del intento, en minutos")
    max_attempts: Optional[int] = Field(None, ge=1, description="Intentos permitidos por estudiante (vacío = sin límite)")
    grade_policy: Optional[PoliticaNota] = Field(None, description="Qué nota queda con varios intentos: BEST (por defecto) | LAST | AVERAGE | FIRST")


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
    # En estos, mandar null explícito borra el valor (vuelve al de por defecto).
    late_until: Optional[str] = Field(None, description="ISO 8601; null quita el tope de tardías")
    allowed_extensions: Optional[List[str]] = Field(None, max_length=30)
    max_file_size_mb: Optional[int] = Field(None, ge=1)
    max_files: Optional[int] = Field(None, ge=1)
    rubric: Optional[List[CriterioRubrica]] = Field(None, max_length=20, description="[] o null quita la rúbrica")
    time_limit_minutes: Optional[int] = Field(None, ge=1)
    max_attempts: Optional[int] = Field(None, ge=1)
    grade_policy: Optional[PoliticaNota] = None


class ArchivoEntrega(BaseSchema):
    name: str = Field(..., min_length=1, max_length=255, description="Nombre del archivo con extensión")
    mime_type: Optional[str] = Field(None, description="Se ignora: el tipo sale del contenido real")
    file_base64: str = Field(..., min_length=1)


class EntregarTareaRequest(BaseSchema):
    """El estudiante entrega (o reemplaza) los archivos de una tarea: `files`
    con uno o varios, o `name` + `file_base64` para un solo archivo."""

    files: Optional[List[ArchivoEntrega]] = Field(None, max_length=20)
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="Nombre del archivo con extensión")
    mime_type: Optional[str] = None
    file_base64: Optional[str] = Field(None, min_length=1)

    def archivos(self) -> List[ArchivoEntrega]:
        if self.files:
            return list(self.files)
        if self.name and self.file_base64:
            return [ArchivoEntrega(name=self.name, file_base64=self.file_base64)]
        return []


class PreferenciasNotificacionRequest(BaseSchema):
    """Si el usuario quiere recibir las notificaciones también por correo."""

    email: bool


class CalificarEntregaRequest(BaseSchema):
    """El docente califica una entrega: con `score` si la tarea es de nota
    única, o con `criteria` (los puntos de cada criterio) si tiene rúbrica —
    en ese caso la nota es la suma. `feedback` es el comentario general."""

    score: Optional[float] = Field(None, ge=0)
    feedback: Optional[str] = Field(None, max_length=2000)
    criteria: Optional[List[NotaDeCriterio]] = Field(None, max_length=20)
