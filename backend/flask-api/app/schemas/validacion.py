"""Payloads de la validación por expertos. Escala 1 (no pertinente / no claro) a 4 (totalmente)."""

from typing import Annotated, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import Field

from app.schemas.base import BaseSchema

Escala = Annotated[int, Field(ge=1, le=4, description="1 = no pertinente / no claro, 4 = totalmente")]
Comentario = Annotated[Optional[str], Field(None, max_length=2000)]


class _ExpertoBase(BaseSchema):
    nombre_experto: Optional[str] = Field(None, min_length=2, max_length=120)
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


# ── Invitaciones personales (portal del experto) ──
SeccionValidacion = Literal["inicio", "casos", "historial", "biblioteca"]
Texto120 = Annotated[Optional[str], Field(None, max_length=120)]
Correo = Annotated[Optional[str], Field(None, max_length=160, pattern=r"^$|^[^@\s]+@[^@\s]+\.[^@\s]+$")]


# Vacío borra el nombre (el experto queda identificado por su ID); si hay, 2 letras o más.
NombreOpcional = Annotated[Optional[str], Field(None, max_length=120, pattern=r"^$|^.{2,}$")]


class CrearInvitacionRequest(BaseSchema):
    """El experto se identifica con su ID (documento o registro profesional); el nombre es opcional."""
    nombre: NombreOpcional = None
    email: Correo = None
    profesion: str = Field(..., min_length=2, max_length=120)
    especialidad: Texto120 = None
    institucion: Annotated[Optional[str], Field(None, max_length=160)] = None
    registro_profesional: str = Field(..., min_length=2, max_length=60, description="ID: documento o registro profesional")
    anos_experiencia: Optional[int] = Field(None, ge=0, le=80)
    # Vacía si el experto solo va a revisar casos clínicos.
    secciones: List[SeccionValidacion] = Field(default_factory=list, max_length=4)


class ActualizarInvitacionRequest(BaseSchema):
    """El administrador corrige datos, cambia las secciones o revoca / reactiva / reabre."""
    nombre: NombreOpcional = None
    email: Correo = None
    profesion: Optional[str] = Field(None, min_length=2, max_length=120)
    especialidad: Texto120 = None
    institucion: Annotated[Optional[str], Field(None, max_length=160)] = None
    registro_profesional: Annotated[Optional[str], Field(None, max_length=60)] = None
    anos_experiencia: Optional[int] = Field(None, ge=0, le=80)
    secciones: Optional[List[SeccionValidacion]] = Field(None, max_length=4)
    accion: Optional[Literal["revocar", "reactivar", "reabrir"]] = None


class PerfilExpertoRequest(BaseSchema):
    """Lo que el experto confirma de sí mismo y su juicio final. Todo opcional: se autoguarda."""
    nombre: NombreOpcional = None
    profesion: Optional[str] = Field(None, min_length=2, max_length=120)
    especialidad: Texto120 = None
    institucion: Annotated[Optional[str], Field(None, max_length=160)] = None
    registro_profesional: Annotated[Optional[str], Field(None, max_length=60)] = None
    anos_experiencia: Optional[int] = Field(None, ge=0, le=80)
    consentimiento: Optional[bool] = None
    aplicabilidad: Optional[Literal["APLICABLE", "APLICABLE_CON_CAMBIOS", "NO_APLICABLE"]] = None
    comentario_final: Comentario = None


class GuardarSeccionRequest(BaseSchema):
    """Autoguardado de una sección: calificaciones (1 a 4) y observaciones por ítem
    (la clave «_general» es la observación de toda la sección)."""
    respuestas: Dict[str, Escala] = Field(default_factory=dict)
    observaciones: Dict[str, Annotated[str, Field(max_length=2000)]] = Field(default_factory=dict)


# ── Revisión de casos clínicos ──

class AsignarCasosRequest(BaseSchema):
    """Expertos (invitaciones) a los que se asigna una consulta completada."""
    invitaciones: List[UUID] = Field(..., min_length=1, max_length=50)


class GuardarRevisionRequest(BaseSchema):
    """Autoguardado de la revisión de un caso: criterios (1 a 4), observaciones
    («_general» es la del caso completo) y el puntaje que le daría el experto."""
    respuestas: Dict[str, Escala] = Field(default_factory=dict)
    observaciones: Dict[str, Annotated[str, Field(max_length=2000)]] = Field(default_factory=dict)
    puntaje_experto: Optional[int] = Field(None, ge=0, le=100)
