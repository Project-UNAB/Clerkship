"""Idioma de los recursos de la biblioteca

Agrega articles.language ('es' o 'en'; NULL = sin indicar) para filtrar la
biblioteca por idioma. 2026-10-21_idioma_biblioteca.sql es el espejo en SQL.

Revision ID: idioma_biblioteca
Revises: anotaciones_biblioteca
Create Date: 2026-10-21 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'idioma_biblioteca'
down_revision = 'anotaciones_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS language VARCHAR(2);")
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE articles ADD CONSTRAINT articles_language_check CHECK (language IN ('es', 'en'));
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    """)


def downgrade():
    op.execute("ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_language_check;")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS language;")
