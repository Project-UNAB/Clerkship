"""Comentarios privados de las tareas

Crea assignment_comments: un hilo por (tarea, estudiante) entre el docente
dueño del curso y ese estudiante. Se borra con la tarea, el estudiante o el
autor. 2026-10-28_comentarios_tareas.sql es el espejo en SQL.

Revision ID: comentarios_tareas
Revises: validacion_id_obligatorio
Create Date: 2026-10-28 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'comentarios_tareas'
down_revision = 'validacion_id_obligatorio'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS assignment_comments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            item_id UUID NOT NULL REFERENCES course_content_items(id) ON DELETE CASCADE,
            student_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
            author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
            created_at TIMESTAMPTZ DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_assignment_comments_hilo ON assignment_comments (item_id, student_id, created_at);
    """)


def downgrade():
    op.execute("DROP TABLE IF EXISTS assignment_comments;")
