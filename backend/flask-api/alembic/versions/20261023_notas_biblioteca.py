"""Notas y comentarios en los libros de la biblioteca

Crea article_notes: la nota o el comentario de un usuario sobre una zona de una
página (un párrafo, parte del texto o un recuadro), con el texto citado del PDF.
Se borra con el usuario o con el libro. 2026-10-23_notas_biblioteca.sql es el
espejo en SQL.

Revision ID: notas_biblioteca
Revises: zoom_biblioteca
Create Date: 2026-10-23 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'notas_biblioteca'
down_revision = 'zoom_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS article_notes (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            page INTEGER NOT NULL CHECK (page >= 1),
            rect JSONB NOT NULL,
            quote TEXT,
            body TEXT NOT NULL DEFAULT '',
            color VARCHAR(7) NOT NULL DEFAULT '#FACC15',
            created_at TIMESTAMPTZ DEFAULT now(),
            updated_at TIMESTAMPTZ DEFAULT now()
        );
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_article_notes_user_article ON article_notes (user_id, article_id, page);")


def downgrade():
    op.execute("DROP TABLE IF EXISTS article_notes;")
