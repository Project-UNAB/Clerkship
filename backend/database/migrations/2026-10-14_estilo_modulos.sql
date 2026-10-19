-- Icono y color de la tarjeta de cada módulo. Espejo en SQL de la revisión de
-- Alembic `estilo_modulos`
-- (backend/flask-api/alembic/versions/20261014_estilo_modulos.py).
-- Aplica UNA de las dos: `alembic upgrade estilo_modulos`, o este archivo y
-- después `alembic stamp estilo_modulos`. Es idempotente.
BEGIN;

-- Claves del icono y del color que el docente elige para la tarjeta del
-- módulo (lista cerrada en el backend). NULL = icono y color por defecto.
ALTER TABLE public.course_blocks
  ADD COLUMN IF NOT EXISTS icon VARCHAR(30),
  ADD COLUMN IF NOT EXISTS color VARCHAR(20);

COMMIT;
