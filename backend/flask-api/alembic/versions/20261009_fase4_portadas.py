"""Fase 4: imagen de portada de los cursos

Agrega courses.cover_image_key: la clave en R2 de la portada ya procesada
(1200x600). La miniatura (400x200) vive al lado con sufijo _thumb, asi que no
necesita columna propia. NULL = el curso no tiene portada.
2026-10-09c_fase4_portadas.sql es el espejo en SQL.

Revision ID: fase4_portadas
Revises: fase3_tareas
Create Date: 2026-10-09 20:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase4_portadas'
down_revision = 'fase3_tareas'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS cover_image_key VARCHAR(500);")


def downgrade():
    # Los objetos que hubiera en R2 (portadas/...) quedan huerfanos: borrarlos aparte.
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS cover_image_key;")
