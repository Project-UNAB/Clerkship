"""Payloads del panel de administrador."""
from typing import Optional

from pydantic import Field

from app.schemas.base import BaseSchema


class ActualizarUsuarioRequest(BaseSchema):
    role: Optional[str] = Field(None, pattern=r"^(STUDENT|TEACHER|ADMIN)$")
    activo: Optional[bool] = None


class RechazarArticuloRequest(BaseSchema):
    motivo: str = Field(..., min_length=1, max_length=500, description="Motivo del rechazo")
