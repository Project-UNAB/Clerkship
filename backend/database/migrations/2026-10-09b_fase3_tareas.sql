-- Fase 3: configuración de tareas por el docente. Espejo en SQL de la
-- revisión de Alembic `fase3_tareas`
-- (backend/flask-api/alembic/versions/20261009_fase3_tareas.py).
-- Aplica UNA de las dos: `alembic upgrade fase3_tareas`, o este archivo y
-- después `alembic stamp fase3_tareas`. Es idempotente.
BEGIN;

-- 1. Reglas de la tarea (solo se usan en items ASSIGNMENT)
ALTER TABLE public.course_content_items
  ADD COLUMN IF NOT EXISTS late_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS allowed_extensions VARCHAR(10)[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER,
  ADD COLUMN IF NOT EXISTS max_files INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_course_content_items_limites_tarea') THEN
        ALTER TABLE public.course_content_items
        ADD CONSTRAINT ck_course_content_items_limites_tarea
        CHECK (max_files >= 1 AND (max_file_size_mb IS NULL OR max_file_size_mb >= 1));
    END IF;
END $$;

-- 2. Versión vigente de la entrega
ALTER TABLE public.assignment_submissions
  ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0;

-- 3. Archivos por versión: volver a entregar agrega una versión y las
--    anteriores quedan de historial.
CREATE TABLE IF NOT EXISTS public.submission_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
    version INTEGER NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    file_key VARCHAR(500) NOT NULL UNIQUE,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(150),
    size_bytes BIGINT,
    is_late BOOLEAN NOT NULL DEFAULT false,
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_submission_files_version_position UNIQUE (submission_id, version, position)
);
CREATE INDEX IF NOT EXISTS ix_submission_files_submission_version
  ON public.submission_files (submission_id, version);

-- 4. Las entregas anteriores (un archivo en user_files) pasan a ser la versión 1
INSERT INTO public.submission_files
    (submission_id, version, position, file_key, original_name, mime_type, size_bytes, is_late, uploaded_at)
SELECT s.id, 1, 0, f.storage_key, f.nombre, f.mime_type, f.size_bytes, s.is_late, s.submitted_at
FROM public.assignment_submissions s
JOIN public.user_files f ON f.id = s.file_id
WHERE NOT EXISTS (SELECT 1 FROM public.submission_files x WHERE x.submission_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.submission_files y WHERE y.file_key = f.storage_key);

UPDATE public.assignment_submissions s
SET current_version = 1
WHERE s.current_version = 0
  AND EXISTS (SELECT 1 FROM public.submission_files x WHERE x.submission_id = s.id);

COMMIT;
