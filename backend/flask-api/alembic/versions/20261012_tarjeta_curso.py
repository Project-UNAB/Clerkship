"""Texto propio de la tarjeta del curso

Agrega courses.card_summary: el texto corto (texto plano, hasta 280
caracteres) que se muestra en la tarjeta del curso en "Mis cursos". Es
independiente de courses.description, que es el contenido rico que se ve
dentro del curso. NULL = la tarjeta no muestra texto propio.
2026-10-12_tarjeta_curso.sql es el espejo en SQL.

Revision ID: tarjeta_curso
Revises: fase7_funcionalidades
Create Date: 2026-10-12 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'tarjeta_curso'
down_revision = 'fase7_funcionalidades'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS card_summary VARCHAR(280);")


def downgrade():
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS card_summary;")
