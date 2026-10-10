"""Fase 7: notificaciones y rubricas

- notifications: notificaciones dentro de la plataforma (read_at NULL = no
  leida). dedupe_key evita repetir el recordatorio de fecha limite.
- users.email_notifications: recibir las notificaciones tambien por correo
  (apagado por defecto; lo activa cada usuario).
- course_content_items.rubric: rubrica opcional de una tarea (criterios con
  puntaje). assignment_submissions.rubric_scores: la nota por criterio.

Exportar calificaciones, los indicadores de la card y la zona horaria no
necesitan cambios en la base (las fechas siguen en UTC).
2026-10-11_fase7_funcionalidades.sql es el espejo en SQL.

Revision ID: fase7_funcionalidades
Revises: fase6_seguridad
Create Date: 2026-10-11 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase7_funcionalidades'
down_revision = 'fase6_seguridad'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Notificaciones
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(30) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body VARCHAR(500),
            course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
            entity_type VARCHAR(30),
            entity_id UUID,
            event_at TIMESTAMPTZ,
            read_at TIMESTAMPTZ,
            email_sent_at TIMESTAMPTZ,
            dedupe_key VARCHAR(160) UNIQUE,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON notifications (user_id, created_at);")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_notifications_user_no_leidas ON notifications (user_id) WHERE read_at IS NULL;"
    )
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT false;")

    # 2. Rubrica de la tarea y nota por criterio
    op.execute("ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS rubric JSONB;")
    op.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS rubric_scores JSONB;")


def downgrade():
    # Se pierden las notificaciones, las rubricas y el detalle por criterio
    # (la nota total de cada entrega se conserva en assignment_submissions.score).
    op.execute("ALTER TABLE assignment_submissions DROP COLUMN IF EXISTS rubric_scores;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS rubric;")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS email_notifications;")
    op.execute("DROP TABLE IF EXISTS notifications;")
