-- Validación por expertos: el ID es obligatorio y el nombre opcional. Espejo en SQL
-- de la revisión de Alembic `validacion_id_obligatorio`
-- (backend/flask-api/alembic/versions/20261027_validacion_id_obligatorio.py).
-- Aplica UNA de las dos: `alembic upgrade validacion_id_obligatorio`, o este archivo y
-- después `alembic stamp validacion_id_obligatorio`. Es idempotente.
BEGIN;

-- El nombre y apellidos pasan a ser opcionales. Las CHECK de longitud siguen
-- valiendo cuando hay nombre (un nulo las cumple).
ALTER TABLE public.validacion_invitaciones ALTER COLUMN nombre DROP NOT NULL;
ALTER TABLE public.validacion_invitaciones DROP CONSTRAINT IF EXISTS validacion_invitaciones_identificado_check;
-- Una invitación debe tener al menos nombre o ID.
ALTER TABLE public.validacion_invitaciones ADD CONSTRAINT validacion_invitaciones_identificado_check
  CHECK (nombre IS NOT NULL OR registro_profesional IS NOT NULL);

ALTER TABLE public.validacion_inicio ALTER COLUMN nombre_experto DROP NOT NULL;
ALTER TABLE public.validacion_casos ALTER COLUMN nombre_experto DROP NOT NULL;
ALTER TABLE public.validacion_historial ALTER COLUMN nombre_experto DROP NOT NULL;
ALTER TABLE public.validacion_biblioteca ALTER COLUMN nombre_experto DROP NOT NULL;

COMMIT;
