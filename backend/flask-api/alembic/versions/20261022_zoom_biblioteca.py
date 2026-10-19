"""Zoom de la biblioteca por usuario

Agrega users.library_zoom (porcentaje de 60 a 200; NULL = 100 %), para que el
tamaño de los libros que elige cada usuario se mantenga en cualquier
dispositivo. 2026-10-22_zoom_biblioteca.sql es el espejo en SQL.

Revision ID: zoom_biblioteca
Revises: idioma_biblioteca
Create Date: 2026-10-22 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'zoom_biblioteca'
down_revision = 'idioma_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS library_zoom SMALLINT;")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE users ADD CONSTRAINT users_library_zoom_check CHECK (library_zoom BETWEEN 60 AND 200);
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)


def downgrade():
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_library_zoom_check;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS library_zoom;")
