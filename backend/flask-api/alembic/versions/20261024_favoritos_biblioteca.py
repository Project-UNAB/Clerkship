"""Favoritos de la biblioteca

Crea article_favorites: los recursos que cada usuario marcó como favoritos.
Se borra con el usuario o con el recurso. 2026-10-24_favoritos_biblioteca.sql
es el espejo en SQL.

Revision ID: favoritos_biblioteca
Revises: notas_biblioteca
Create Date: 2026-10-24 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'favoritos_biblioteca'
down_revision = 'notas_biblioteca'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS article_favorites (
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ DEFAULT now(),
            PRIMARY KEY (user_id, article_id)
        );
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS article_favorites;")
