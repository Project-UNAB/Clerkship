"""Payloads del panel de administrador."""
from typing import Optional

from pydantic import Field

from app.schemas.base import BaseSchema


class ActualizarUsuarioRequest(BaseSchema):
    role: Optional[str] = Field(None, pattern=r"^(STUDENT|TEACHER|ADMIN)$")
    activo: Optional[bool] = None
