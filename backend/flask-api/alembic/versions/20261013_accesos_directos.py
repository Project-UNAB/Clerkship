"""Accesos directos del curso

Agrega courses.shortcuts: la lista de accesos directos (nombre + enlace web)
que el docente pone en la página del curso, como JSONB
[{"label": "...", "url": "https://..."}]. NULL = el curso no tiene ninguno.
2026-10-13_accesos_directos.sql es el espejo en SQL.

Revision ID: accesos_directos
Revises: tarjeta_curso
Create Date: 2026-10-13 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'accesos_directos'
down_revision = 'tarjeta_curso'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS shortcuts JSONB;")


def downgrade():
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS shortcuts;")
