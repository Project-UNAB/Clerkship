"""
Authentication Request and Response schemas for Clerkship API.
"""

from typing import Any, Literal, Optional
from pydantic import EmailStr, Field
from app.schemas.base import BaseSchema


class RegisterRequest(BaseSchema):
    """Payload for user registration."""

    role: Literal["STUDENT", "TEACHER"]
    first_name: str = Field(..., min_length=1, max_length=100, description="Nombre(s) del usuario")
    last_name: str = Field(..., min_length=1, max_length=100, description="Apellido(s) del usuario")
    email: EmailStr = Field(..., description="Correo institucional o personal")
    password: str = Field(..., min_length=8, description="Contraseña de al menos 8 caracteres")
    student_code: Optional[str] = Field(None, max_length=50, description="Código de estudiante si aplica")


class RegisterResponse(BaseSchema):
    """Response returned after successful registration."""

    message: str
    user_id: str
    email: str
    username: str


class VerifyEmailRequest(BaseSchema):
    """Payload to verify email address using 6-digit OTP code."""

    email: Optional[EmailStr] = Field(None, description="Opcional: el usuario sale del JWT")
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="Código numérico de 6 dígitos")


class ResendCodeRequest(BaseSchema):
    """Payload to request resending the verification code.

    Con JWT el usuario sale del token; sin JWT el correo es obligatorio.
    """

    email: Optional[EmailStr] = Field(None, description="Obligatorio solo si no hay JWT")


class ForgotPasswordRequest(BaseSchema):
    """Payload to start a password reset (sends a 6-digit code by email)."""

    email: EmailStr


class ResetPasswordRequest(BaseSchema):
    """Payload to set a new password using the code received by email."""

    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="Código numérico de 6 dígitos")
    new_password: str = Field(..., min_length=8, description="Nueva contraseña de al menos 8 caracteres")


class LoginRequest(BaseSchema):
    """Payload for user authentication."""

    email: EmailStr
    password: str = Field(..., min_length=1)


class ChangePasswordRequest(BaseSchema):
    """Payload for updating user password."""

    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, description="Nueva contraseña de al menos 8 caracteres")


class UpdateAvatarRequest(BaseSchema):
    """Payload for updating user avatar SVG or DiceBear string."""

    avatar_svg: str = Field(..., min_length=1)


class AuthTokensResponse(BaseSchema):
    """Response containing JWT bearer and refresh tokens."""

    access_token: str
    refresh_token: str
    user: Optional[Any] = None


class MessageResponse(BaseSchema):
    """Generic informational message response."""

    message: str

