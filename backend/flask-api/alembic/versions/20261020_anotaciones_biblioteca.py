"""Anotaciones privadas en los libros de la biblioteca

Crea article_annotations: lo que cada usuario subraya o dibuja en una página
de un libro (una fila por usuario, libro y página). Se borra sola con el
usuario o con el libro. 2026-10-20_anotaciones_biblioteca.sql es el espejo en SQL.

Revision ID: anotaciones_biblioteca
Revises: portadas_biblioteca
Create Date: 2026-10-20 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'anotaciones_biblioteca'
down_revision = 'portadas_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS article_annotations (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            page INTEGER NOT NULL CHECK (page >= 1),
            strokes JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (user_id, article_id, page)
        );
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS article_annotations;")
