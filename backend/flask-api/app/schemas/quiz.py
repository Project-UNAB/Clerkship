"""Schemas para el banco de preguntas y los intentos de un cuestionario."""
from typing import List, Optional

from pydantic import Field

from app.schemas.base import BaseSchema


class ChoiceInput(BaseSchema):
    text: str = Field(..., min_length=1, max_length=500)
    is_correct: bool = False


class CrearPreguntaRequest(BaseSchema):
    type: str = Field(..., description="SINGLE_CHOICE | MULTIPLE_CHOICE | TRUE_FALSE")
    prompt: str = Field(..., min_length=1)
    points: Optional[float] = Field(1, gt=0)
    choices: List[ChoiceInput] = Field(..., min_length=2)


class ActualizarPreguntaRequest(BaseSchema):
    prompt: Optional[str] = Field(None, min_length=1)
    points: Optional[float] = Field(None, gt=0)
    position: Optional[int] = None
    choices: Optional[List[ChoiceInput]] = Field(None, min_length=2, description="Si se manda, reemplaza todas las opciones")


class AnswerInput(BaseSchema):
    question_id: str
    selected_choice_ids: List[str] = Field(default_factory=list)


class ResponderIntentoRequest(BaseSchema):
    answers: List[AnswerInput] = Field(default_factory=list)
