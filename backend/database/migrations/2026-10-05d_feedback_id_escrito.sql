-- El ID del usuario lo escribe quien responde (las cuentas de desarrollo aún no
-- existen en la tabla users), así que:
--   * id_usuario: texto obligatorio, 2 a 60 caracteres.
--   * user_id: se conserva como referencia a la sesión, pero ya no es obligatorio
--     ni tiene llave foránea, para no bloquear IDs que aún no son cuentas.
-- Las tablas estaban vacías al aplicar esta migración.
BEGIN;

ALTER TABLE public.feedback_inicio ADD COLUMN IF NOT EXISTS id_usuario VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_usuario)) >= 2);
ALTER TABLE public.feedback_casos ADD COLUMN IF NOT EXISTS id_usuario VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_usuario)) >= 2);
ALTER TABLE public.feedback_historial ADD COLUMN IF NOT EXISTS id_usuario VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_usuario)) >= 2);
ALTER TABLE public.feedback_biblioteca ADD COLUMN IF NOT EXISTS id_usuario VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_usuario)) >= 2);

ALTER TABLE public.feedback_inicio DROP CONSTRAINT IF EXISTS feedback_inicio_user_id_fkey;
ALTER TABLE public.feedback_casos DROP CONSTRAINT IF EXISTS feedback_casos_user_id_fkey;
ALTER TABLE public.feedback_historial DROP CONSTRAINT IF EXISTS feedback_historial_user_id_fkey;
ALTER TABLE public.feedback_biblioteca DROP CONSTRAINT IF EXISTS feedback_biblioteca_user_id_fkey;

ALTER TABLE public.feedback_inicio ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.feedback_casos ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.feedback_historial ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.feedback_biblioteca ALTER COLUMN user_id DROP NOT NULL;

COMMIT;
