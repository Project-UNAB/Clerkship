"""Validación por expertos, una tabla por pestaña. Creadas por
backend/database/migrations/2026-10-05g_validacion_expertos.sql.
Los expertos no tienen cuenta: se identifican con datos escritos en el formulario."""
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app import db


class _ValidacionBase:
    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    nombre_experto = db.Column(db.String(120), nullable=False)
    id_experto = db.Column(db.String(60), nullable=False)
    profesion = db.Column(db.String(120), nullable=False)
    anos_experiencia = db.Column(db.SmallInteger, nullable=False)
    especialidad = db.Column(db.String(120))
    comentario = db.Column(db.Text)
    created_at = db.Column(db.DateTime, server_default=func.now())


def _cal():
    return db.Column(db.SmallInteger, nullable=False)


class ValidacionInicio(_ValidacionBase, db.Model):
    __tablename__ = "validacion_inicio"
    claridad_informacion = _cal()
    pertinencia_informacion = _cal()
    organizacion_visual = _cal()
    jerarquia_navegacion = _cal()
    accesibilidad = _cal()
    coherencia_terminologia = _cal()
    suficiencia_accesos = _cal()
    utilidad_general = _cal()


class ValidacionCasos(_ValidacionBase, db.Model):
    __tablename__ = "validacion_casos"
    pertinencia_clinica = _cal()
    redaccion_clara = _cal()
    coherencia_diagnostica = _cal()
    coherencia_examenes = _cal()
    realismo_paciente = _cal()
    dificultad_adecuada = _cal()
    utilidad_formativa = _cal()
    suficiencia_contenido = _cal()


class ValidacionHistorial(_ValidacionBase, db.Model):
    __tablename__ = "validacion_historial"
    claridad_puntajes = _cal()
    pertinencia_evaluacion = _cal()
    retroalimentacion_util = _cal()
    coherencia_dimensiones = _cal()
    suficiencia_informacion = _cal()
    utilidad_formativa = _cal()
    comprension_estudiante = _cal()
    presentacion = _cal()


class ValidacionBiblioteca(_ValidacionBase, db.Model):
    __tablename__ = "validacion_biblioteca"
    pertinencia_recursos = _cal()
    actualidad_fuentes = _cal()
    calidad_fuentes = _cal()
    claridad_descripcion = _cal()
    organizacion_contenido = _cal()
    suficiencia_recursos = _cal()
    utilidad_formativa = _cal()
    accesibilidad_archivos = _cal()
