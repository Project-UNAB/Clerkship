-- Columna para activar/desactivar cuentas desde el panel de administrador.
-- Aditiva: todas las cuentas existentes quedan activas por defecto.
BEGIN;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
COMMIT;
