-- Los archivos de R2 quedan dentro de las carpetas del dashboard (document_folders).
-- Aditiva: solo agrega una columna nullable. Si se borra una carpeta, sus archivos
-- quedan sin carpeta (no se borran de R2 por esta vía; el backend lo maneja al borrar).
BEGIN;
ALTER TABLE public.user_files ADD COLUMN IF NOT EXISTS carpeta_id UUID
    REFERENCES public.document_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ix_user_files_carpeta ON public.user_files (carpeta_id);
COMMIT;
