"""Payloads de los formularios de retroalimentación, uno por pestaña."""

from typing import Annotated, Optional

from pydantic import Field

from app.schemas.base import BaseSchema

Calificacion = Annotated[int, Field(ge=1, le=5, description="De 1 (muy mala) a 5 (muy buena)")]
Comentario = Annotated[Optional[str], Field(None, max_length=1000)]


class FeedbackInicioRequest(BaseSchema):
    claridad_navegacion: Calificacion
    informacion_util: Calificacion
    accesos_rapidos: Calificacion
    comentario: Comentario = None


class FeedbackCasosRequest(BaseSchema):
    realismo_caso: Calificacion
    calidad_paciente_virtual: Calificacion
    claridad_instrucciones: Calificacion
    dificultad_percibida: Calificacion
    comentario: Comentario = None


class FeedbackHistorialRequest(BaseSchema):
    claridad_puntajes: Calificacion
    utilidad_recomendacion: Calificacion
    facilidad_revision: Calificacion
    comentario: Comentario = None


class FeedbackBibliotecaRequest(BaseSchema):
    calidad_contenido: Calificacion
    facilidad_busqueda: Calificacion
    utilidad_recursos: Calificacion
    comentario: Comentario = None
