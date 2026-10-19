-- Texto propio de la tarjeta del curso. Espejo en SQL de la revisión de
-- Alembic `tarjeta_curso`
-- (backend/flask-api/alembic/versions/20261012_tarjeta_curso.py).
-- Aplica UNA de las dos: `alembic upgrade tarjeta_curso`, o este archivo y
-- después `alembic stamp tarjeta_curso`. Es idempotente.
BEGIN;

-- Texto corto (plano) de la tarjeta en "Mis cursos". Es independiente de
-- description, que es el contenido que se ve dentro del curso. NULL = sin texto.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS card_summary VARCHAR(280);

COMMIT;
