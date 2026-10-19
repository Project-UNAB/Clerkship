"""Portada de los recursos de la biblioteca

Agrega articles.portada_key: la clave en R2 de la portada vertical (2:3) del
libro, ya procesada. La miniatura vive al lado con sufijo _thumb, como las
portadas de los cursos. NULL = el libro se muestra con el color de su tipo.
2026-10-19_portadas_biblioteca.sql es el espejo en SQL.

Revision ID: portadas_biblioteca
Revises: moderacion_biblioteca
Create Date: 2026-10-19 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'portadas_biblioteca'
down_revision = 'moderacion_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS portada_key VARCHAR(500);")


def downgrade():
    # Los objetos que hubiera en R2 (biblioteca/portadas/...) quedan huérfanos: borrarlos aparte.
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS portada_key;")
