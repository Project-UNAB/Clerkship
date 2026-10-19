-- Consentimiento informado en el servidor. Espejo en SQL de la revisión de
-- Alembic `consentimiento_servidor`
-- (backend/flask-api/alembic/versions/20261017_consentimiento_servidor.py).
-- Aplica UNA de las dos: `alembic upgrade consentimiento_servidor`, o este archivo y
-- después `alembic stamp consentimiento_servidor`. Es idempotente.
BEGIN;

-- Fecha y versión del consentimiento informado aceptado por el usuario (Ley 1581 de 2012).
-- Null si aún no ha aceptado.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS consent_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS consent_version VARCHAR(20);

COMMIT;
