"""Fase 0: Cimientos de base de datos para modulo Mis Cursos

Primera revision de Alembic: no hay linea base. El esquema anterior sale de
backend/database/postgres/init/ y de los .sql de backend/database/migrations/
(hasta 2026-10-08d), que deben estar aplicados antes de correr esta.
2026-10-08e_fase0_cimientos_cursos.sql es el espejo en SQL de esta revision.

Revision ID: fase0_cursos
Revises: 
Create Date: 2026-10-08 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'fase0_cursos'
down_revision = None
branch_labels = None
depends_on = None

COLUMNAS_FECHAS = [
    ("courses", "created_at"),
    ("courses", "updated_at"),
    ("student_courses", "enrolled_at"),
    ("course_blocks", "created_at"),
    ("course_blocks", "updated_at"),
    ("course_content_items", "created_at"),
    ("course_content_items", "updated_at"),
    ("course_content_items", "open_at"),
    ("course_content_items", "due_at"),
    ("assignment_submissions", "submitted_at"),
    ("assignment_submissions", "graded_at"),
    ("quiz_attempts", "started_at"),
    ("quiz_attempts", "submitted_at"),
    ("quiz_questions", "created_at"),
    ("course_announcements", "created_at"),
    ("course_announcements", "updated_at"),
    ("course_announcement_comments", "created_at"),
]


def upgrade():
    # 1. Limpieza preventiva de duplicados antes de aplicar restricciones unicas
    op.execute(
        """
        DELETE FROM student_courses a
        USING student_courses b
        WHERE a.ctid < b.ctid
          AND a.student_id = b.student_id
          AND a.course_id = b.course_id;
        """
    )

    op.execute(
        """
        DELETE FROM assignment_submissions a
        USING assignment_submissions b
        WHERE a.ctid < b.ctid
          AND a.item_id = b.item_id
          AND a.student_id = b.student_id;
        """
    )

    # 2. Conversion de columnas naive TIMESTAMP a TIMESTAMPTZ (UTC)
    for tabla, columna in COLUMNAS_FECHAS:
        op.execute(
            f"ALTER TABLE {tabla} ALTER COLUMN {columna} TYPE TIMESTAMPTZ USING {columna} AT TIME ZONE 'UTC';"
        )

    # 3. Restricciones unicas
    # student_courses (student_id, course_id)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_courses_student_course'
            ) THEN
                ALTER TABLE student_courses
                ADD CONSTRAINT uq_student_courses_student_course UNIQUE (student_id, course_id);
            END IF;
        END $$;
        """
    )

    # assignment_submissions (item_id, student_id)
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname IN ('assignment_submissions_item_id_student_id_key', 'uq_assignment_submissions_item_student')
                  AND conrelid = 'assignment_submissions'::regclass
            ) THEN
                ALTER TABLE assignment_submissions
                ADD CONSTRAINT assignment_submissions_item_id_student_id_key UNIQUE (item_id, student_id);
            END IF;
        END $$;
        """
    )

    # 4. Creacion de indices
    op.execute("CREATE INDEX IF NOT EXISTS ix_student_courses_student_id ON student_courses (student_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_student_courses_course_id ON student_courses (course_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_assignment_submissions_item_student ON assignment_submissions (item_id, student_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_course_content_items_due_at ON course_content_items (due_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_course_blocks_course_id_position ON course_blocks (course_id, position);")


def downgrade():
    # 1. Eliminar indices creados
    op.execute("DROP INDEX IF EXISTS ix_course_blocks_course_id_position;")
    op.execute("DROP INDEX IF EXISTS ix_course_content_items_due_at;")
    op.execute("DROP INDEX IF EXISTS ix_assignment_submissions_item_student;")
    op.execute("DROP INDEX IF EXISTS ix_student_courses_course_id;")
    op.execute("DROP INDEX IF EXISTS ix_student_courses_student_id;")

    # 2. Eliminar restricciones unicas adicionales. El UNIQUE de
    # assignment_submissions viene de 2026-10-08b y no se toca; solo se quita
    # el nombre alterno por si una version anterior de esta migracion lo creo.
    op.execute("ALTER TABLE student_courses DROP CONSTRAINT IF EXISTS uq_student_courses_student_course;")
    op.execute("ALTER TABLE assignment_submissions DROP CONSTRAINT IF EXISTS uq_assignment_submissions_item_student;")

    # 3. Revertir columnas de TIMESTAMPTZ a TIMESTAMP naive
    for tabla, columna in COLUMNAS_FECHAS:
        op.execute(
            f"ALTER TABLE {tabla} ALTER COLUMN {columna} TYPE TIMESTAMP WITHOUT TIME ZONE USING {columna} AT TIME ZONE 'UTC';"
        )
