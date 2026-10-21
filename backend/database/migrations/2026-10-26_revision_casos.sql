-- Revisión de casos clínicos por expertos. Espejo en SQL de la revisión de Alembic
-- `revision_casos` (backend/flask-api/alembic/versions/20261026_revision_casos.py).
-- Aplica UNA de las dos: `alembic upgrade revision_casos`, o este archivo y
-- después `alembic stamp revision_casos`. Es idempotente.
BEGIN;

-- Cada consulta completada que el administrador asigna a un experto invitado:
-- calificaciones (1 a 4) por criterio, observaciones y su puntaje (0 a 100).
CREATE TABLE IF NOT EXISTS public.validacion_revisiones_caso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invitacion_id UUID NOT NULL REFERENCES public.validacion_invitaciones(id) ON DELETE CASCADE,
  consultation_id UUID NOT NULL REFERENCES public.consultations(id) ON DELETE CASCADE,
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  observaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  puntaje_experto SMALLINT CHECK (puntaje_experto BETWEEN 0 AND 100),
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'ENVIADA')),
  enviada_at TIMESTAMPTZ,
  asignada_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT uq_revision_caso_experto UNIQUE (invitacion_id, consultation_id)
);
CREATE INDEX IF NOT EXISTS ix_revisiones_caso_consulta ON public.validacion_revisiones_caso (consultation_id);

COMMIT;
