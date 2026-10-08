"""Schemas para el foro de avisos de un curso."""
from typing import Optional

from pydantic import Field

from app.schemas.base import BaseSchema


class CrearAvisoRequest(BaseSchema):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, description="HTML del editor WYSIWYG — se sanitiza en el backend")
    pinned: Optional[bool] = False


class ActualizarAvisoRequest(BaseSchema):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    body: Optional[str] = Field(None, min_length=1)
    pinned: Optional[bool] = None


class CrearComentarioAvisoRequest(BaseSchema):
    content: str = Field(..., min_length=1, max_length=2000)
