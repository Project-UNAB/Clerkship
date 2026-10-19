"""Moderación de recursos de la biblioteca médica

Agrega articles.estado ('PENDIENTE' | 'APROBADO' | 'RECHAZADO', por defecto
'APROBADO' para no ocultar los artículos ya publicados), revisado_por,
revisado_en y motivo_rechazo.
2026-10-18_moderacion_biblioteca.sql es el espejo en SQL.

Revision ID: moderacion_biblioteca
Revises: consentimiento_servidor
Create Date: 2026-10-18 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'moderacion_biblioteca'
down_revision = 'consentimiento_servidor'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "ALTER TABLE articles ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'APROBADO';"
    )
    op.execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS revisado_por UUID;")
    op.execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMPTZ;")
    op.execute("ALTER TABLE articles ADD COLUMN IF NOT EXISTS motivo_rechazo VARCHAR(500);")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'chk_articles_estado'
            ) THEN
                ALTER TABLE articles
                ADD CONSTRAINT chk_articles_estado
                CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO'));
            END IF;
        END $$;
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_articles_estado ON articles (estado);")


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_articles_estado;")
    op.execute("ALTER TABLE articles DROP CONSTRAINT IF EXISTS chk_articles_estado;")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS motivo_rechazo;")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS revisado_en;")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS revisado_por;")
    op.execute("ALTER TABLE articles DROP COLUMN IF EXISTS estado;")
