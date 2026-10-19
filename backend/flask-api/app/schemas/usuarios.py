"""
User profile Request and Response schemas for Clerkship API.
"""

from typing import Any, Dict, Literal, Optional
from pydantic import EmailStr, Field
from app.schemas.base import BaseSchema


class UserResponse(BaseSchema):
    """Full user profile representation."""

    id: str
    username: str
    email: EmailStr
    first_name: str
    last_name: str
    role: Literal["STUDENT", "TEACHER", "ADMIN"]
    email_verified: bool = False
    avatar_svg: Optional[str] = None


class UserSummary(BaseSchema):
    """Brief public summary of a user for search results or member lists."""

    id: str
    username: str
    first_name: str
    last_name: str
    role: str


class UpdateUserRequest(BaseSchema):
    """Payload for updating personal profile information."""

    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, min_length=1, max_length=100)


class StorageUsageResponse(BaseSchema):
    """Report of user storage capacity and consumption."""

    used_bytes: int = 0
    limit_bytes: int = 5368709120  # 5 GB default
    breakdown: Dict[str, Any] = Field(default_factory=dict)


class RegistrarConsentimientoRequest(BaseSchema):
    """Payload para registrar la aceptación del consentimiento informado."""

    version: str = Field(..., min_length=1, max_length=20)

