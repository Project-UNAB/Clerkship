-- Portada de los recursos de la biblioteca. Espejo en SQL de la revisión de
-- Alembic `portadas_biblioteca`
-- (backend/flask-api/alembic/versions/20261019_portadas_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade portadas_biblioteca`, o este archivo y
-- después `alembic stamp portadas_biblioteca`. Es idempotente.
BEGIN;

-- Clave en R2 de la portada vertical (2:3) ya procesada. La miniatura vive al
-- lado con sufijo _thumb. NULL = el libro se muestra con el color de su tipo.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS portada_key VARCHAR(500);

COMMIT;
