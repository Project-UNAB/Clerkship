-- Zoom de la biblioteca por usuario. Espejo en SQL de la revisión de Alembic
-- `zoom_biblioteca` (backend/flask-api/alembic/versions/20261022_zoom_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade zoom_biblioteca`, o este archivo y
-- después `alembic stamp zoom_biblioteca`. Es idempotente.
BEGIN;

-- Porcentaje de 60 a 200; NULL = 100 %.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS library_zoom SMALLINT;

DO $$ BEGIN
  ALTER TABLE public.users ADD CONSTRAINT users_library_zoom_check CHECK (library_zoom BETWEEN 60 AND 200);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
