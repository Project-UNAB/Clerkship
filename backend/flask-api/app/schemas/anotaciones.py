"""Anotaciones privadas de los libros de la biblioteca (lápiz y resaltador)."""
from typing import Annotated, List, Literal, Optional

from pydantic import Field, model_validator

from app.schemas.base import BaseSchema

# Topes por página: de sobra para subrayar y dibujar a mano, y un cuerpo que no
# pasa de ~1 MB aunque se llenen.
MAX_TRAZOS_POR_PAGINA = 400
MAX_PUNTOS_POR_TRAZO = 4000
MAX_PUNTOS_POR_PAGINA = 60000

Coordenada = Annotated[float, Field(ge=0, le=1)]
Punto = Annotated[List[Coordenada], Field(min_length=2, max_length=2)]


class Trazo(BaseSchema):
    """Un trazo a mano alzada. Las coordenadas van de 0 a 1 respecto de la
    página (x hacia la derecha, y hacia abajo) y el grosor es una fracción del
    ancho de la página: así el trazo queda igual a cualquier tamaño y zoom."""

    herramienta: Literal["lapiz", "resaltador"]
    color: str = Field(..., pattern=r"^#[0-9a-fA-F]{6}$")
    grosor: float = Field(..., gt=0, le=0.08)
    puntos: List[Punto] = Field(..., min_length=1, max_length=MAX_PUNTOS_POR_TRAZO)


class GuardarAnotacionesRequest(BaseSchema):
    """Todos los trazos de una página: reemplazan a los que había. Lista vacía = borrar."""

    trazos: List[Trazo] = Field(..., max_length=MAX_TRAZOS_POR_PAGINA)

    @model_validator(mode="after")
    def _tope_de_puntos(self):
        if sum(len(t.puntos) for t in self.trazos) > MAX_PUNTOS_POR_PAGINA:
            raise ValueError(f"La página tiene demasiados trazos (más de {MAX_PUNTOS_POR_PAGINA} puntos).")
        return self


# ── Notas y comentarios sobre zonas de la página ──
MAX_CITA = 2000
MAX_TEXTO_NOTA = 5000
ColorNota = Literal["#FACC15", "#4ADE80", "#60A5FA", "#F472B6", "#FB923C"]


class ZonaNota(BaseSchema):
    """Recuadro relativo a la página (0 a 1), con origen arriba a la izquierda."""

    x: Coordenada
    y: Coordenada
    w: float = Field(..., gt=0, le=1)
    h: float = Field(..., gt=0, le=1)

    @model_validator(mode="after")
    def _dentro_de_la_pagina(self):
        if self.x + self.w > 1.0001 or self.y + self.h > 1.0001:
            raise ValueError("La zona de la nota se sale de la página.")
        return self


class CrearNotaRequest(BaseSchema):
    pagina: int = Field(..., ge=1, le=10000)
    rect: ZonaNota
    cita: Optional[str] = Field(None, max_length=MAX_CITA, description="Texto del PDF dentro de la zona")
    texto: str = Field("", max_length=MAX_TEXTO_NOTA, description="La nota o el comentario del usuario")
    color: ColorNota = "#FACC15"


class ActualizarNotaRequest(BaseSchema):
    texto: Optional[str] = Field(None, max_length=MAX_TEXTO_NOTA)
    color: Optional[ColorNota] = None
