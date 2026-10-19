-- Idioma de los recursos de la biblioteca. Espejo en SQL de la revisión de
-- Alembic `idioma_biblioteca`
-- (backend/flask-api/alembic/versions/20261021_idioma_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade idioma_biblioteca`, o este archivo y
-- después `alembic stamp idioma_biblioteca`. Es idempotente.
BEGIN;

-- 'es' o 'en'; NULL = sin indicar. Sirve para el filtro por idioma.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS language VARCHAR(2);

DO $$ BEGIN
  ALTER TABLE public.articles ADD CONSTRAINT articles_language_check CHECK (language IN ('es', 'en'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
