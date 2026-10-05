"""Formularios de retroalimentación por pestaña. Una tabla por pestaña,
creadas por backend/database/migrations/2026-10-05_feedback_por_pestana.sql."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class FeedbackInicio(db.Model):
    __tablename__ = "feedback_inicio"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    claridad_navegacion = db.Column(db.SmallInteger, nullable=False)
    informacion_util = db.Column(db.SmallInteger, nullable=False)
    accesos_rapidos = db.Column(db.SmallInteger, nullable=False)
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackCasos(db.Model):
    __tablename__ = "feedback_casos"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    realismo_caso = db.Column(db.SmallInteger, nullable=False)
    calidad_paciente_virtual = db.Column(db.SmallInteger, nullable=False)
    claridad_instrucciones = db.Column(db.SmallInteger, nullable=False)
    dificultad_percibida = db.Column(db.SmallInteger, nullable=False)
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackHistorial(db.Model):
    __tablename__ = "feedback_historial"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    claridad_puntajes = db.Column(db.SmallInteger, nullable=False)
    utilidad_recomendacion = db.Column(db.SmallInteger, nullable=False)
    facilidad_revision = db.Column(db.SmallInteger, nullable=False)
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackBiblioteca(db.Model):
    __tablename__ = "feedback_biblioteca"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    calidad_contenido = db.Column(db.SmallInteger, nullable=False)
    facilidad_busqueda = db.Column(db.SmallInteger, nullable=False)
    utilidad_recursos = db.Column(db.SmallInteger, nullable=False)
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())
