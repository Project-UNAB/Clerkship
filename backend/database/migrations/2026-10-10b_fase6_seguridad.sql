-- Fase 6: rate limiting, auditoría y endurecimiento de JWT. Espejo en SQL de
-- la revisión de Alembic `fase6_seguridad`
-- (backend/flask-api/alembic/versions/20261010_fase6_seguridad.py).
-- Aplica UNA de las dos: `alembic upgrade fase6_seguridad`, o este archivo y
-- después `alembic stamp fase6_seguridad`. Es idempotente.
BEGIN;

-- 1. Registro de auditoría: quién cambió qué, cuándo y desde qué IP. Solo se
--    agregan filas; borrar la cuenta del autor no borra el rastro.
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(64),
    old_value JSONB,
    new_value JSONB,
    ip VARCHAR(45),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_logs_user_created ON public.audit_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_logs_created ON public.audit_logs (created_at);

-- 2. Lista de revocación de JWT por jti (logout). expires_at es cuándo vencía
--    el token: pasada esa fecha la fila se puede borrar (flask limpiar-tokens).
CREATE TABLE IF NOT EXISTS public.revoked_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jti VARCHAR(64) NOT NULL UNIQUE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    token_type VARCHAR(10) NOT NULL,
    reason VARCHAR(40),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires ON public.revoked_tokens (expires_at);

-- 3. Corte de sesiones por usuario: los JWT emitidos antes de esta fecha dejan
--    de valer (cambio de rol, de contraseña, o cerrar todas las sesiones).
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ;

COMMIT;
