-- Accesos directos del curso. Espejo en SQL de la revisión de Alembic
-- `accesos_directos`
-- (backend/flask-api/alembic/versions/20261013_accesos_directos.py).
-- Aplica UNA de las dos: `alembic upgrade accesos_directos`, o este archivo y
-- después `alembic stamp accesos_directos`. Es idempotente.
BEGIN;

-- Lista de accesos directos que el docente pone en la página del curso:
-- [{"label": "...", "url": "https://..."}]. NULL = sin accesos directos.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS shortcuts JSONB;

COMMIT;
