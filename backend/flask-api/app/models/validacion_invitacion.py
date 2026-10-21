"""Invitación personal de un profesional de la salud para validar la plataforma.

El administrador la crea con los datos del experto y las secciones que debe
evaluar; el experto entra con su enlace (token), sin cuenta, y sus respuestas
se van guardando solas. Creada por 2026-10-25_validacion_invitaciones.sql."""
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.sql import func

from app import db

ESTADOS_INVITACION = ("PENDIENTE", "EN_CURSO", "COMPLETADA", "REVOCADA")
APLICABILIDAD = ("APLICABLE", "APLICABLE_CON_CAMBIOS", "NO_APLICABLE")


class ValidacionInvitacion(db.Model):
    __tablename__ = "validacion_invitaciones"

    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())
    token = db.Column(db.String(64), nullable=False, unique=True)
    # Datos del experto: el administrador escribe los que conoce y el experto los confirma.
    nombre = db.Column(db.String(120))  # opcional: el experto se identifica con su ID
    email = db.Column(db.String(160))
    profesion = db.Column(db.String(120), nullable=False)
    especialidad = db.Column(db.String(120))
    institucion = db.Column(db.String(160))
    registro_profesional = db.Column(db.String(60))  # ID: documento o registro profesional
    anos_experiencia = db.Column(db.SmallInteger)
    secciones = db.Column(JSONB, nullable=False)                         # ["inicio", "casos", ...]
    respuestas = db.Column(JSONB, nullable=False, server_default="{}")   # {seccion: {item: 1..4}}
    observaciones = db.Column(JSONB, nullable=False, server_default="{}")  # {seccion: {item | "_general": texto}}
    enviadas = db.Column(JSONB, nullable=False, server_default="{}")     # {seccion: fecha ISO}
    aplicabilidad = db.Column(db.String(30))
    comentario_final = db.Column(db.Text)
    estado = db.Column(db.String(20), nullable=False, server_default="PENDIENTE")
    consentimiento_at = db.Column(db.DateTime(timezone=True))
    abierta_at = db.Column(db.DateTime(timezone=True))
    completada_at = db.Column(db.DateTime(timezone=True))
    creada_por = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="SET NULL"))
    created_at = db.Column(db.DateTime(timezone=True), server_default=func.now())
    updated_at = db.Column(db.DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    @property
    def etiqueta(self) -> str:
        """Cómo se muestra el experto: su nombre o, si no lo dio, su ID."""
        if self.nombre:
            return self.nombre
        return f"ID {self.registro_profesional}" if self.registro_profesional else "Experto"

    def datos_experto(self) -> dict:
        return {
            "etiqueta": self.etiqueta,
            "nombre": self.nombre, "email": self.email, "profesion": self.profesion,
            "especialidad": self.especialidad, "institucion": self.institucion,
            "registro_profesional": self.registro_profesional, "anos_experiencia": self.anos_experiencia,
        }

    def para_experto(self) -> dict:
        """Lo que ve el propio experto con su enlace."""
        return {
            "experto": self.datos_experto(),
            "secciones": list(self.secciones or []),
            "respuestas": self.respuestas or {},
            "observaciones": self.observaciones or {},
            "enviadas": self.enviadas or {},
            "aplicabilidad": self.aplicabilidad,
            "comentario_final": self.comentario_final,
            "estado": self.estado,
            "consentimiento": self.consentimiento_at is not None,
            "completada_at": self.completada_at.isoformat() if self.completada_at else None,
        }

    def para_admin(self) -> dict:
        return {
            "id": str(self.id),
            "token": self.token,
            **self.para_experto(),
            "abierta_at": self.abierta_at.isoformat() if self.abierta_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
