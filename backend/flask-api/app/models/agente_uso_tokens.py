"""Uso de tokens de los 3 agentes del simulador (Generador, Paciente,
Evaluador). Una fila por cada llamada real al modelo. Creada por
backend/database/migrations/2026-10-06c_uso_tokens_agentes.sql."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db

AGENTES = ("GENERADOR", "PACIENTE", "EVALUADOR")


class AgenteUsoTokens(db.Model):
    __tablename__ = "agente_uso_tokens"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    agente = db.Column(db.String(20), nullable=False)
    consultation_id = db.Column(UUID(as_uuid=True), db.ForeignKey("consultations.id", ondelete="SET NULL"))
    proveedor = db.Column(db.String(40), nullable=False)
    modelo = db.Column(db.String(80))
    es_mock = db.Column(db.Boolean, nullable=False, default=False)
    prompt_tokens = db.Column(db.Integer)
    completion_tokens = db.Column(db.Integer)
    total_tokens = db.Column(db.Integer)
    latency_ms = db.Column(db.Integer)
    created_at = db.Column(db.DateTime, server_default=func.now())
