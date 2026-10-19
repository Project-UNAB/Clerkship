"""Icono y color de la tarjeta de cada módulo

Agrega course_blocks.icon y course_blocks.color: las claves del icono y del
color que el docente elige para la tarjeta del módulo (de una lista cerrada,
ver app/schemas/curso_contenido.py). NULL = icono y color por defecto.
2026-10-14_estilo_modulos.sql es el espejo en SQL.

Revision ID: estilo_modulos
Revises: accesos_directos
Create Date: 2026-10-14 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'estilo_modulos'
down_revision = 'accesos_directos'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE course_blocks ADD COLUMN IF NOT EXISTS icon VARCHAR(30);")
    op.execute("ALTER TABLE course_blocks ADD COLUMN IF NOT EXISTS color VARCHAR(20);")


def downgrade():
    op.execute("ALTER TABLE course_blocks DROP COLUMN IF EXISTS color;")
    op.execute("ALTER TABLE course_blocks DROP COLUMN IF EXISTS icon;")
