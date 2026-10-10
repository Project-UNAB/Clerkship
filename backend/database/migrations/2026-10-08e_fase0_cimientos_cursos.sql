-- Migracion Fase 0: Cimientos de base de datos para modulo Mis Cursos
-- Espejo en SQL de backend/flask-api/alembic/versions/20261008_fase0_cimientos_cursos.py
-- (revision fase0_cursos). Aplica una de las dos, no ambas; si usas este
-- archivo, marca luego la revision con `alembic stamp fase0_cursos`.
-- 1. Limpieza preventiva de duplicados
DELETE FROM student_courses a
USING student_courses b
WHERE a.ctid < b.ctid
  AND a.student_id = b.student_id
  AND a.course_id = b.course_id;

DELETE FROM assignment_submissions a
USING assignment_submissions b
WHERE a.ctid < b.ctid
  AND a.item_id = b.item_id
  AND a.student_id = b.student_id;

-- 2. Conversion de columnas naive TIMESTAMP a TIMESTAMPTZ (UTC)
ALTER TABLE courses ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE courses ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE student_courses ALTER COLUMN enrolled_at TYPE TIMESTAMPTZ USING enrolled_at AT TIME ZONE 'UTC';

ALTER TABLE course_blocks ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE course_blocks ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE course_content_items ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE course_content_items ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';
ALTER TABLE course_content_items ALTER COLUMN open_at TYPE TIMESTAMPTZ USING open_at AT TIME ZONE 'UTC';
ALTER TABLE course_content_items ALTER COLUMN due_at TYPE TIMESTAMPTZ USING due_at AT TIME ZONE 'UTC';

ALTER TABLE assignment_submissions ALTER COLUMN submitted_at TYPE TIMESTAMPTZ USING submitted_at AT TIME ZONE 'UTC';
ALTER TABLE assignment_submissions ALTER COLUMN graded_at TYPE TIMESTAMPTZ USING graded_at AT TIME ZONE 'UTC';

ALTER TABLE quiz_attempts ALTER COLUMN started_at TYPE TIMESTAMPTZ USING started_at AT TIME ZONE 'UTC';
ALTER TABLE quiz_attempts ALTER COLUMN submitted_at TYPE TIMESTAMPTZ USING submitted_at AT TIME ZONE 'UTC';

ALTER TABLE quiz_questions ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

ALTER TABLE course_announcements ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';
ALTER TABLE course_announcements ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

ALTER TABLE course_announcement_comments ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- 3. Restricciones unicas
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_student_courses_student_course'
    ) THEN
        ALTER TABLE student_courses
        ADD CONSTRAINT uq_student_courses_student_course UNIQUE (student_id, course_id);
    END IF;
END $$;

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

-- 4. Creacion de indices
CREATE INDEX IF NOT EXISTS ix_student_courses_student_id ON student_courses (student_id);
CREATE INDEX IF NOT EXISTS ix_student_courses_course_id ON student_courses (course_id);
CREATE INDEX IF NOT EXISTS ix_assignment_submissions_item_student ON assignment_submissions (item_id, student_id);
CREATE INDEX IF NOT EXISTS ix_course_content_items_due_at ON course_content_items (due_at);
CREATE INDEX IF NOT EXISTS ix_course_blocks_course_id_position ON course_blocks (course_id, position);
