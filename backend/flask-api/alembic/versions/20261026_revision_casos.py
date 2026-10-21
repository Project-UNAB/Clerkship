"""Revisión de casos clínicos por expertos

Crea validacion_revisiones_caso: cada consulta completada que el administrador
asigna a un experto invitado, con sus calificaciones (1 a 4) por criterio, sus
observaciones y su propio puntaje (0 a 100). Las invitaciones pueden quedar
sin secciones de plataforma (solo revisión de casos).
2026-10-26_revision_casos.sql es el espejo en SQL.

Revision ID: revision_casos
Revises: validacion_invitaciones
Create Date: 2026-10-26 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'revision_casos'
down_revision = 'validacion_invitaciones'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS validacion_revisiones_caso (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            invitacion_id UUID NOT NULL REFERENCES validacion_invitaciones(id) ON DELETE CASCADE,
            consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
            respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
            observaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
            puntaje_experto SMALLINT CHECK (puntaje_experto BETWEEN 0 AND 100),
            estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'ENVIADA')),
            enviada_at TIMESTAMPTZ,
            asignada_por UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_revision_caso_experto UNIQUE (invitacion_id, consultation_id)
        );
        CREATE INDEX IF NOT EXISTS ix_revisiones_caso_consulta ON validacion_revisiones_caso (consultation_id);
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS validacion_revisiones_caso;")
