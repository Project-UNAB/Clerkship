"""
Base schema configuration and common response models for Clerkship API.
"""

from functools import wraps
from typing import Any, Dict, List, Optional
from flask import jsonify, request
from pydantic import BaseModel, ConfigDict, ValidationError


class BaseSchema(BaseModel):
    """Base Pydantic model with common configuration across all DTOs."""

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        populate_by_name=True,
        validate_assignment=True,
    )


class ErrorResponse(BaseSchema):
    """Standardized API error response."""

    error: str
    message: str
    status_code: int
    details: Optional[List[Dict[str, Any]]] = None


class DatabaseStatus(BaseSchema):
    """Database connectivity status report."""

    postgresql: str
    mongodb: str


class HealthResponse(BaseSchema):
    """System diagnostic health response."""

    status: str
    service: str
    framework: str
    version: str
    databases: DatabaseStatus


def validate_body(schema_cls: type[BaseModel], multipart: bool = False):
    """
    Flask route decorator to validate request JSON body against a Pydantic schema.
    If validation passes, injects `validated_body` as a keyword argument into the route handler.
    If validation fails, returns a standardized 400 Bad Request JSON response.

    Con `multipart=True` la ruta también acepta multipart/form-data: los campos
    de texto del formulario se validan contra el mismo schema y los archivos
    quedan en `request.files` para que la ruta los procese.
    """

    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            es_formulario = multipart and request.mimetype == "multipart/form-data"
            if not es_formulario and request.content_length and request.content_length > 0 and not request.is_json:
                return (
                    jsonify(
                        {
                            "error": "Bad Request",
                            "message": "La cabecera Content-Type debe ser application/json",
                            "status_code": 400,
                        }
                    ),
                    400,
                )

            data = request.form.to_dict() if es_formulario else request.get_json(silent=True)
            if not es_formulario and data is None and request.data and len(request.data.strip()) > 0:
                return (
                    jsonify(
                        {
                            "error": "Bad Request",
                            "message": "Cuerpo JSON inválido o malformado",
                            "status_code": 400,
                        }
                    ),
                    400,
                )

            try:
                validated = schema_cls.model_validate(data or {})
            except ValidationError as err:
                formatted_errors = [
                    {
                        "field": ".".join(str(loc) for loc in e["loc"]),
                        "message": e["msg"],
                        "type": e["type"],
                    }
                    for e in err.errors()
                ]
                return (
                    jsonify(
                        {
                            "error": "Bad Request",
                            "message": "Error de validación en los datos enviados",
                            "details": formatted_errors,
                            "status_code": 400,
                        }
                    ),
                    400,
                )

            return fn(*args, validated_body=validated, **kwargs)

        return wrapper

    return decorator

