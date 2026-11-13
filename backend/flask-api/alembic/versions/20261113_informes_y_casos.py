"""Informe de la consulta compartible y casos clínicos asignados en los cursos

- consultations: course_item_id (caso asignado por el docente), share_token
  (enlace para compartir) y la nota del docente (teacher_score,
  teacher_feedback, graded_at).
- course_content_items: case_template (el caso generado una vez y usado por
  todos los estudiantes), case_subtema y case_dificultad.
- consultation_shares: con quién compartió el estudiante su informe.
- consultation_comments: notas sobre el informe, por sección.

Todo es aditivo. 2026-11-13_informes_y_casos.sql es el espejo en SQL.

Revision ID: informes_y_casos
Revises: comentarios_tareas
Create Date: 2026-11-13 10:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'informes_y_casos'
down_revision = 'comentarios_tareas'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS course_item_id UUID
            REFERENCES course_content_items(id) ON DELETE SET NULL;
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS teacher_score NUMERIC(6, 2);
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;
        ALTER TABLE consultations ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_share_token ON consultations (share_token)
            WHERE share_token IS NOT NULL;
        CREATE INDEX IF NOT EXISTS ix_consultations_course_item ON consultations (course_item_id, student_id);

        ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_template JSONB;
        ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_subtema VARCHAR(150);
        ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_dificultad VARCHAR(20);

        CREATE TABLE IF NOT EXISTS consultation_shares (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
            via VARCHAR(10) NOT NULL DEFAULT 'DIRECTO' CHECK (via IN ('DIRECTO', 'ENLACE')),
            created_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_consultation_shares UNIQUE (consultation_id, user_id)
        );
        CREATE INDEX IF NOT EXISTS ix_consultation_shares_user ON consultation_shares (user_id, created_at);

        CREATE TABLE IF NOT EXISTS consultation_comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            section VARCHAR(40) NOT NULL DEFAULT 'general',
            body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
            created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_consultation_comments ON consultation_comments (consultation_id, created_at);
    """)


def downgrade():
    op.execute("""
        DROP TABLE IF EXISTS consultation_comments;
        DROP TABLE IF EXISTS consultation_shares;
        ALTER TABLE course_content_items DROP COLUMN IF EXISTS case_dificultad;
        ALTER TABLE course_content_items DROP COLUMN IF EXISTS case_subtema;
        ALTER TABLE course_content_items DROP COLUMN IF EXISTS case_template;
        DROP INDEX IF EXISTS ix_consultations_course_item;
        DROP INDEX IF EXISTS uq_consultations_share_token;
        ALTER TABLE consultations DROP COLUMN IF EXISTS graded_at;
        ALTER TABLE consultations DROP COLUMN IF EXISTS teacher_feedback;
        ALTER TABLE consultations DROP COLUMN IF EXISTS teacher_score;
        ALTER TABLE consultations DROP COLUMN IF EXISTS share_token;
        ALTER TABLE consultations DROP COLUMN IF EXISTS course_item_id;
    """)
