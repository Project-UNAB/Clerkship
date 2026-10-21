"""Validación por expertos: el ID es obligatorio, el nombre opcional

El experto se identifica con su ID (documento o registro profesional); su
nombre y apellidos pasan a ser opcionales, en las invitaciones y en el
formulario abierto por pestaña. Las CHECK de longitud siguen valiendo cuando
hay nombre (un nulo las cumple). Una invitación debe tener nombre o ID.
2026-10-27_validacion_id_obligatorio.sql es el espejo en SQL.

Revision ID: validacion_id_obligatorio
Revises: revision_casos
Create Date: 2026-10-27 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'validacion_id_obligatorio'
down_revision = 'revision_casos'
branch_labels = None
depends_on = None

TABLAS = ("validacion_inicio", "validacion_casos", "validacion_historial", "validacion_biblioteca")


def upgrade():
    op.execute("ALTER TABLE validacion_invitaciones ALTER COLUMN nombre DROP NOT NULL;")
    op.execute("""
        ALTER TABLE validacion_invitaciones DROP CONSTRAINT IF EXISTS validacion_invitaciones_identificado_check;
        ALTER TABLE validacion_invitaciones ADD CONSTRAINT validacion_invitaciones_identificado_check
            CHECK (nombre IS NOT NULL OR registro_profesional IS NOT NULL);
    """)
    for t in TABLAS:
        op.execute(f"ALTER TABLE {t} ALTER COLUMN nombre_experto DROP NOT NULL;")


def downgrade():
    for t in TABLAS:
        op.execute(f"ALTER TABLE {t} ALTER COLUMN nombre_experto SET NOT NULL;")
    op.execute("ALTER TABLE validacion_invitaciones DROP CONSTRAINT IF EXISTS validacion_invitaciones_identificado_check;")
    op.execute("ALTER TABLE validacion_invitaciones ALTER COLUMN nombre SET NOT NULL;")
