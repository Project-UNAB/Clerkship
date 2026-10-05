-- Quita la columna nombre de los formularios de retroalimentación.
-- En su lugar se guarda user_id (ya existe en todas las tablas), que sale de la
-- sesión del usuario y no se escribe a mano.
-- Las tablas estaban vacías al aplicar esta migración.
BEGIN;
ALTER TABLE public.feedback_inicio DROP COLUMN IF EXISTS nombre;
ALTER TABLE public.feedback_casos DROP COLUMN IF EXISTS nombre;
ALTER TABLE public.feedback_historial DROP COLUMN IF EXISTS nombre;
ALTER TABLE public.feedback_biblioteca DROP COLUMN IF EXISTS nombre;
COMMIT;
