"""Consentimiento informado en el servidor

Agrega users.consent_accepted_at y users.consent_version para persistir
la aceptación del consentimiento informado (Ley 1581 de 2012) en el servidor.
2026-10-17_consentimiento_servidor.sql es el espejo en SQL.

Revision ID: consentimiento_servidor
Revises: estilo_modulos
Create Date: 2026-10-17 10:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'consentimiento_servidor'
down_revision = 'estilo_modulos'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP WITH TIME ZONE;")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20);")


def downgrade():
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS consent_version;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS consent_accepted_at;")
