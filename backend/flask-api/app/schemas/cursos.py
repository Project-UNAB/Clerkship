"""
Course management Request and Response schemas for Clerkship API.
"""

from typing import Optional
from pydantic import EmailStr, Field
from app.schemas.base import BaseSchema


class CreateCourseRequest(BaseSchema):
    """Payload to create a new academic course."""

    name: str = Field(..., min_length=1, max_length=150, description="Nombre del curso")
    description: Optional[str] = Field(None, max_length=20000, description="Descripción del programa (HTML del editor WYSIWYG)")
    academic_period: Optional[str] = Field(None, max_length=20, description="Período académico (ej. 2026-1)")


class ActualizarCursoRequest(BaseSchema):
    """El docente dueño edita su curso — nombre, descripción (HTML) y período."""

    name: Optional[str] = Field(None, min_length=1, max_length=150)
    description: Optional[str] = Field(None, max_length=20000)
    academic_period: Optional[str] = Field(None, max_length=20)


class CourseResponse(BaseSchema):
    """Course representation."""

    id: str
    teacher_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    academic_period: Optional[str] = None


class EnrollmentResponse(BaseSchema):
    """Response returned upon successful course enrollment."""

    message: str
    course_id: str
    student_id: str


class AgregarEstudianteRequest(BaseSchema):
    """El docente agrega a un estudiante a su curso por correo."""

    email: EmailStr

