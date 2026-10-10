-- Fase 5: rendimiento, paginación y borrado seguro. Espejo en SQL de la
-- revisión de Alembic `fase5_rendimiento`
-- (backend/flask-api/alembic/versions/20261010_fase5_rendimiento.py).
-- Aplica UNA de las dos: `alembic upgrade fase5_rendimiento`, o este archivo
-- y después `alembic stamp fase5_rendimiento`. Es idempotente.
BEGIN;

-- 1. Borrado suave: NULL = vigente; con fecha = en la papelera (restaurable).
ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. Objetos de R2 pendientes de borrar: se anotan en la misma transacción
--    que borra las filas que los referenciaban y se reintentan si R2 falla.
CREATE TABLE IF NOT EXISTS public.pending_file_deletions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    reason VARCHAR(120),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_attempt_at TIMESTAMPTZ
);

-- 3. Un curso con simulaciones clínicas no se borra definitivamente: la llave
--    foránea pasa de NO ACTION a ON DELETE RESTRICT, explícito. El resto de la
--    cascada del curso ya era ON DELETE CASCADE.
DO $$
DECLARE
    fk RECORD;
BEGIN
    FOR fk IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.contype = 'f'
          AND c.conrelid = 'public.consultations'::regclass
          AND c.confrelid = 'public.courses'::regclass
          AND a.attname = 'course_id'
          AND c.confdeltype <> 'r'
    LOOP
        EXECUTE format('ALTER TABLE public.consultations DROP CONSTRAINT %I', fk.conname);
        EXECUTE format(
            'ALTER TABLE public.consultations ADD CONSTRAINT %I FOREIGN KEY (course_id) '
            'REFERENCES public.courses(id) ON DELETE RESTRICT', fk.conname
        );
    END LOOP;
END $$;

-- 4. Índices
-- /mios del docente: sus cursos vigentes, del más nuevo al más viejo.
CREATE INDEX IF NOT EXISTS ix_courses_teacher_vigentes
  ON public.courses (teacher_id, created_at DESC) WHERE deleted_at IS NULL;
-- Papelera del docente.
CREATE INDEX IF NOT EXISTS ix_courses_teacher_papelera
  ON public.courses (teacher_id, deleted_at DESC) WHERE deleted_at IS NOT NULL;
-- Roster: casos por estudiante dentro de un curso.
CREATE INDEX IF NOT EXISTS ix_consultations_course_student_status
  ON public.consultations (course_id, student_id, status);
-- Roster paginado: matrículas de un curso por fecha.
CREATE INDEX IF NOT EXISTS ix_student_courses_course_enrolled
  ON public.student_courses (course_id, enrolled_at DESC);
-- Avisos paginados: fijados primero, luego los más recientes.
CREATE INDEX IF NOT EXISTS ix_course_announcements_course_orden
  ON public.course_announcements (course_id, pinned DESC, created_at DESC);
-- Contenido de varios bloques ya ordenado.
CREATE INDEX IF NOT EXISTS ix_course_content_items_block_position
  ON public.course_content_items (block_id, position);
-- Entregas paginadas de una tarea, sin las de la papelera.
CREATE INDEX IF NOT EXISTS ix_assignment_submissions_item_submitted
  ON public.assignment_submissions (item_id, submitted_at DESC) WHERE deleted_at IS NULL;
-- Cola de limpieza: los pendientes más viejos primero.
CREATE INDEX IF NOT EXISTS ix_pending_file_deletions_created
  ON public.pending_file_deletions (created_at);

COMMIT;
