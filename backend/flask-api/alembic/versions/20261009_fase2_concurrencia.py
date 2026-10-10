"""Fase 2: concurrencia en entregas y cuestionarios

- course_content_items.grade_policy (BEST | LAST | AVERAGE | FIRST, por
  defecto BEST): que nota queda cuando hay varios intentos entregados.
- quiz_attempts.deadline_at y quiz_attempts.expired: hasta cuando se puede
  responder el intento y si se cerro por tiempo.
- UNIQUE (item_id, student_id, attempt_number) en quiz_attempts y un indice
  unico parcial que deja un solo intento abierto por estudiante por
  cuestionario. Son la segunda barrera: la primera es el bloqueo de fila
  (SELECT ... FOR UPDATE) que hace el backend al iniciar un intento.
- Se asegura el UNIQUE (attempt_id, question_id) de quiz_answers y el
  UNIQUE (item_id, student_id) de assignment_submissions (ya existian).

Antes de crear las restricciones se renumeran los intentos que tengan el
numero repetido y, si un estudiante tiene varios intentos abiertos del mismo
cuestionario, se deja abierto el mas reciente y los demas se cierran en cero
marcados como vencidos. 2026-10-09_fase2_concurrencia.sql es el espejo en SQL.

Revision ID: fase2_concurrencia
Revises: fase1_matricula
Create Date: 2026-10-09 10:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase2_concurrencia'
down_revision = 'fase1_matricula'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Politica de nota del cuestionario
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_grade_policy') THEN
                CREATE TYPE quiz_grade_policy AS ENUM ('BEST', 'LAST', 'AVERAGE', 'FIRST');
            END IF;
        END $$;
        """
    )
    op.execute(
        "ALTER TABLE course_content_items "
        "ADD COLUMN IF NOT EXISTS grade_policy quiz_grade_policy NOT NULL DEFAULT 'BEST';"
    )

    # 2. Tiempo limite del intento
    op.execute("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS expired BOOLEAN NOT NULL DEFAULT false;")

    # 3. Limpieza previa a las restricciones unicas de quiz_attempts
    op.execute(
        """
        UPDATE quiz_attempts a
        SET submitted_at = now(), score = 0, expired = true
        FROM (
            SELECT id, row_number() OVER (
                PARTITION BY item_id, student_id ORDER BY started_at DESC, id DESC
            ) AS rn
            FROM quiz_attempts
            WHERE submitted_at IS NULL
        ) abiertos
        WHERE a.id = abiertos.id AND abiertos.rn > 1;
        """
    )
    op.execute(
        """
        UPDATE quiz_attempts a
        SET attempt_number = orden.rn
        FROM (
            SELECT id, row_number() OVER (
                PARTITION BY item_id, student_id ORDER BY started_at ASC, id ASC
            ) AS rn
            FROM quiz_attempts
        ) orden
        WHERE a.id = orden.id
          AND a.attempt_number <> orden.rn
          AND EXISTS (
              SELECT 1 FROM quiz_attempts b
              WHERE b.item_id = a.item_id AND b.student_id = a.student_id
              GROUP BY b.attempt_number HAVING COUNT(*) > 1
          );
        """
    )

    # 4. Restricciones unicas
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_quiz_attempts_item_student_number') THEN
                ALTER TABLE quiz_attempts
                ADD CONSTRAINT uq_quiz_attempts_item_student_number UNIQUE (item_id, student_id, attempt_number);
            END IF;
        END $$;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_un_abierto "
        "ON quiz_attempts (item_id, student_id) WHERE submitted_at IS NULL;"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conrelid = 'quiz_answers'::regclass AND contype = 'u'
                  AND conname = 'quiz_answers_attempt_id_question_id_key'
            ) THEN
                DELETE FROM quiz_answers a USING quiz_answers b
                WHERE a.ctid < b.ctid AND a.attempt_id = b.attempt_id AND a.question_id = b.question_id;
                ALTER TABLE quiz_answers
                ADD CONSTRAINT quiz_answers_attempt_id_question_id_key UNIQUE (attempt_id, question_id);
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname IN ('assignment_submissions_item_id_student_id_key', 'uq_assignment_submissions_item_student')
            ) THEN
                ALTER TABLE assignment_submissions
                ADD CONSTRAINT assignment_submissions_item_id_student_id_key UNIQUE (item_id, student_id);
            END IF;
        END $$;
        """
    )


def downgrade():
    # Los UNIQUE de quiz_answers y assignment_submissions son anteriores a
    # esta revision: no se tocan.
    op.execute("DROP INDEX IF EXISTS uq_quiz_attempts_un_abierto;")
    op.execute("ALTER TABLE quiz_attempts DROP CONSTRAINT IF EXISTS uq_quiz_attempts_item_student_number;")
    op.execute("ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS expired;")
    op.execute("ALTER TABLE quiz_attempts DROP COLUMN IF EXISTS deadline_at;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS grade_policy;")
    op.execute("DROP TYPE IF EXISTS quiz_grade_policy;")
