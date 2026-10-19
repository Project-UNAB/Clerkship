-- Moderación de recursos de la biblioteca médica. Espejo en SQL de la revisión
-- de Alembic `moderacion_biblioteca`
-- (backend/flask-api/alembic/versions/20261018_moderacion_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade moderacion_biblioteca`, o este
-- archivo y después `alembic stamp moderacion_biblioteca`. Es idempotente.
BEGIN;

-- Estado de revisión: los artículos existentes quedan APROBADO por defecto.
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS estado VARCHAR(15) NOT NULL DEFAULT 'APROBADO',
  ADD COLUMN IF NOT EXISTS revisado_por UUID,
  ADD COLUMN IF NOT EXISTS revisado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rechazo VARCHAR(500);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_articles_estado'
  ) THEN
    ALTER TABLE public.articles
      ADD CONSTRAINT chk_articles_estado
      CHECK (estado IN ('PENDIENTE', 'APROBADO', 'RECHAZADO'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_articles_estado ON public.articles (estado);

COMMIT;
