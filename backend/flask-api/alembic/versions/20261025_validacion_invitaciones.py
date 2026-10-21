"""Invitaciones de validación por expertos

Crea validacion_invitaciones: el enlace personal de cada profesional de la
salud que valida la plataforma, con sus respuestas (1 a 4) por sección, sus
observaciones y su juicio final de aplicabilidad.
2026-10-25_validacion_invitaciones.sql es el espejo en SQL.

Revision ID: validacion_invitaciones
Revises: favoritos_biblioteca
Create Date: 2026-10-25 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'validacion_invitaciones'
down_revision = 'favoritos_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS validacion_invitaciones (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token VARCHAR(64) NOT NULL UNIQUE,
            nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2),
            email VARCHAR(160),
            profesion VARCHAR(120) NOT NULL,
            especialidad VARCHAR(120),
            institucion VARCHAR(160),
            registro_profesional VARCHAR(60),
            anos_experiencia SMALLINT CHECK (anos_experiencia BETWEEN 0 AND 80),
            secciones JSONB NOT NULL,
            respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
            observaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
            enviadas JSONB NOT NULL DEFAULT '{}'::jsonb,
            aplicabilidad VARCHAR(30) CHECK (aplicabilidad IN ('APLICABLE', 'APLICABLE_CON_CAMBIOS', 'NO_APLICABLE')),
            comentario_final TEXT,
            estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
                CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'REVOCADA')),
            consentimiento_at TIMESTAMPTZ,
            abierta_at TIMESTAMPTZ,
            completada_at TIMESTAMPTZ,
            creada_por UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS validacion_invitaciones;")
