"""Payloads de la validación por expertos. Escala 1 (no pertinente / no claro) a 4 (totalmente)."""

from typing import Annotated, Optional

from pydantic import Field

from app.schemas.base import BaseSchema

Escala = Annotated[int, Field(ge=1, le=4, description="1 = no pertinente / no claro, 4 = totalmente")]
Comentario = Annotated[Optional[str], Field(None, max_length=2000)]


class _ExpertoBase(BaseSchema):
    nombre_experto: str = Field(..., min_length=2, max_length=120)
    id_experto: str = Field(..., min_length=2, max_length=60, description="Documento o registro profesional")
    profesion: str = Field(..., min_length=2, max_length=120)
    anos_experiencia: int = Field(..., ge=0, le=80)
    especialidad: Optional[str] = Field(None, max_length=120)
    comentario: Comentario = None


class ValidacionInicioRequest(_ExpertoBase):
    claridad_informacion: Escala
    pertinencia_informacion: Escala
    organizacion_visual: Escala
    jerarquia_navegacion: Escala
    accesibilidad: Escala
    coherencia_terminologia: Escala
    suficiencia_accesos: Escala
    utilidad_general: Escala


class ValidacionCasosRequest(_ExpertoBase):
    pertinencia_clinica: Escala
    redaccion_clara: Escala
    coherencia_diagnostica: Escala
    coherencia_examenes: Escala
    realismo_paciente: Escala
    dificultad_adecuada: Escala
    utilidad_formativa: Escala
    suficiencia_contenido: Escala


class ValidacionHistorialRequest(_ExpertoBase):
    claridad_puntajes: Escala
    pertinencia_evaluacion: Escala
    retroalimentacion_util: Escala
    coherencia_dimensiones: Escala
    suficiencia_informacion: Escala
    utilidad_formativa: Escala
    comprension_estudiante: Escala
    presentacion: Escala


class ValidacionBibliotecaRequest(_ExpertoBase):
    pertinencia_recursos: Escala
    actualidad_fuentes: Escala
    calidad_fuentes: Escala
    claridad_descripcion: Escala
    organizacion_contenido: Escala
    suficiencia_recursos: Escala
    utilidad_formativa: Escala
    accesibilidad_archivos: Escala
