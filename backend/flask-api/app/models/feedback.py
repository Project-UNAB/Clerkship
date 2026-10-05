"""Formularios de retroalimentación por pestaña. Una tabla por pestaña.
Columnas creadas por backend/database/migrations/2026-10-05*_feedback_*.sql.
El usuario se guarda en user_id (sale de la sesión, no se escribe a mano)."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


def _calificacion():
    return db.Column(db.SmallInteger, nullable=False)


class FeedbackInicio(db.Model):
    __tablename__ = "feedback_inicio"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    claridad_navegacion = _calificacion()
    informacion_util = _calificacion()
    accesos_rapidos = _calificacion()
    velocidad_carga = _calificacion()
    diseno_visual = _calificacion()
    legibilidad_textos = _calificacion()
    orden_menus = _calificacion()
    facilidad_uso_movil = _calificacion()
    confianza_plataforma = _calificacion()
    claridad_mensajes = _calificacion()
    utilidad_avisos = _calificacion()
    recomendaria_plataforma = _calificacion()
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackCasos(db.Model):
    __tablename__ = "feedback_casos"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    realismo_caso = _calificacion()
    calidad_paciente_virtual = _calificacion()
    claridad_instrucciones = _calificacion()
    dificultad_percibida = _calificacion()
    coherencia_sintomas = _calificacion()
    coherencia_examenes = _calificacion()
    utilidad_educativa = _calificacion()
    retroalimentacion_clara = _calificacion()
    tiempo_adecuado = _calificacion()
    variedad_casos = _calificacion()
    realismo_examenes = _calificacion()
    satisfaccion_general = _calificacion()
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackHistorial(db.Model):
    __tablename__ = "feedback_historial"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    claridad_puntajes = _calificacion()
    utilidad_recomendacion = _calificacion()
    facilidad_revision = _calificacion()
    detalle_evaluacion = _calificacion()
    comprension_dimensiones = _calificacion()
    progreso_visible = _calificacion()
    utilidad_para_estudiar = _calificacion()
    filtros_utiles = _calificacion()
    exportacion_util = _calificacion()
    satisfaccion_general = _calificacion()
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


class FeedbackBiblioteca(db.Model):
    __tablename__ = "feedback_biblioteca"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    calidad_contenido = _calificacion()
    facilidad_busqueda = _calificacion()
    utilidad_recursos = _calificacion()
    actualidad_contenido = _calificacion()
    claridad_descripciones = _calificacion()
    variedad_recursos = _calificacion()
    facilidad_descarga = _calificacion()
    organizacion_por_temas = _calificacion()
    calidad_lectura = _calificacion()
    utilidad_para_estudio = _calificacion()
    satisfaccion_general = _calificacion()
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())
