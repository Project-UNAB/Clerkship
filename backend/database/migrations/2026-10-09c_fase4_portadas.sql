-- Fase 4: imagen de portada de los cursos. Espejo en SQL de la revisión de
-- Alembic `fase4_portadas`
-- (backend/flask-api/alembic/versions/20261009_fase4_portadas.py).
-- Aplica UNA de las dos: `alembic upgrade fase4_portadas`, o este archivo y
-- después `alembic stamp fase4_portadas`. Es idempotente.
BEGIN;

-- Clave en R2 de la portada ya procesada (1200x600). La miniatura (400x200)
-- vive al lado con sufijo _thumb. NULL = el curso no tiene portada.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS cover_image_key VARCHAR(500);

COMMIT;
