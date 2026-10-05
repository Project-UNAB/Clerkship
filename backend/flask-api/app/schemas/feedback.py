"""Payloads de los formularios de retroalimentación, uno por pestaña.
El usuario no va en el body: se toma del JWT."""

from typing import Annotated, Optional

from pydantic import Field

from app.schemas.base import BaseSchema

Calificacion = Annotated[int, Field(ge=1, le=5, description="De 1 (muy mala) a 5 (muy buena)")]
Comentario = Annotated[Optional[str], Field(None, max_length=1000)]
IdUsuario = Annotated[str, Field(min_length=2, max_length=60, description="ID escrito por quien responde")]


class FeedbackInicioRequest(BaseSchema):
    id_usuario: IdUsuario
    claridad_navegacion: Calificacion
    informacion_util: Calificacion
    accesos_rapidos: Calificacion
    velocidad_carga: Calificacion
    diseno_visual: Calificacion
    legibilidad_textos: Calificacion
    orden_menus: Calificacion
    facilidad_uso_movil: Calificacion
    confianza_plataforma: Calificacion
    claridad_mensajes: Calificacion
    utilidad_avisos: Calificacion
    recomendaria_plataforma: Calificacion
    comentario: Comentario = None


class FeedbackCasosRequest(BaseSchema):
    id_usuario: IdUsuario
    realismo_caso: Calificacion
    calidad_paciente_virtual: Calificacion
    claridad_instrucciones: Calificacion
    dificultad_percibida: Calificacion
    coherencia_sintomas: Calificacion
    coherencia_examenes: Calificacion
    utilidad_educativa: Calificacion
    retroalimentacion_clara: Calificacion
    tiempo_adecuado: Calificacion
    variedad_casos: Calificacion
    realismo_examenes: Calificacion
    satisfaccion_general: Calificacion
    comentario: Comentario = None


class FeedbackHistorialRequest(BaseSchema):
    id_usuario: IdUsuario
    claridad_puntajes: Calificacion
    utilidad_recomendacion: Calificacion
    facilidad_revision: Calificacion
    detalle_evaluacion: Calificacion
    comprension_dimensiones: Calificacion
    progreso_visible: Calificacion
    utilidad_para_estudiar: Calificacion
    filtros_utiles: Calificacion
    exportacion_util: Calificacion
    satisfaccion_general: Calificacion
    comentario: Comentario = None


class FeedbackBibliotecaRequest(BaseSchema):
    id_usuario: IdUsuario
    calidad_contenido: Calificacion
    facilidad_busqueda: Calificacion
    utilidad_recursos: Calificacion
    actualidad_contenido: Calificacion
    claridad_descripciones: Calificacion
    variedad_recursos: Calificacion
    facilidad_descarga: Calificacion
    organizacion_por_temas: Calificacion
    calidad_lectura: Calificacion
    utilidad_para_estudio: Calificacion
    satisfaccion_general: Calificacion
    comentario: Comentario = None
