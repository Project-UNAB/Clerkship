-- Códigos de verificación y de recuperación: hasheados y separados.
-- Aditiva: no borra datos. verification_code pasa de VARCHAR(6) a VARCHAR(255)
-- para guardar el hash; los códigos en texto plano pendientes (si los hubiera)
-- siguen siendo legibles y vencen en 10 minutos.
BEGIN;
ALTER TABLE public.users ALTER COLUMN verification_code TYPE VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_code VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_code_expires_at TIMESTAMP WITHOUT TIME ZONE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;
COMMIT;
