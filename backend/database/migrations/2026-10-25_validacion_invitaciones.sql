-- Invitaciones de validación por expertos. Espejo en SQL de la revisión de Alembic
-- `validacion_invitaciones` (backend/flask-api/alembic/versions/20261025_validacion_invitaciones.py).
-- Aplica UNA de las dos: `alembic upgrade validacion_invitaciones`, o este archivo y
-- después `alembic stamp validacion_invitaciones`. Es idempotente.
BEGIN;

-- Enlace personal de cada profesional de la salud que valida la plataforma:
-- sus datos, las secciones que evalúa, sus respuestas (1 a 4), observaciones
-- y el juicio final de aplicabilidad.
CREATE TABLE IF NOT EXISTS public.validacion_invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(64) NOT NULL UNIQUE,
  nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2),
  email VARCHAR(160),
  profesion VARCHAR(120) NOT NULL,
  especialidad VARCHAR(120),
  institucion VARCHAR(160),
  registro_profesional VARCHAR(60),
  anos_experiencia SMALLINT CHECK (anos_experiencia BETWEEN 0 AND 80),
  secciones JSONB NOT NULL,
  respuestas JSONB NOT NULL DEFAULT '{}'::jsonb,
  observaciones JSONB NOT NULL DEFAULT '{}'::jsonb,
  enviadas JSONB NOT NULL DEFAULT '{}'::jsonb,
  aplicabilidad VARCHAR(30) CHECK (aplicabilidad IN ('APLICABLE', 'APLICABLE_CON_CAMBIOS', 'NO_APLICABLE')),
  comentario_final TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE', 'EN_CURSO', 'COMPLETADA', 'REVOCADA')),
  consentimiento_at TIMESTAMPTZ,
  abierta_at TIMESTAMPTZ,
  completada_at TIMESTAMPTZ,
  creada_por UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMIT;
