-- Archivos del usuario en Cloudflare R2 (5 GB por usuario) y publicación en la biblioteca.
-- Aditiva: crea user_files y agrega dos columnas a articles. No borra datos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.user_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    nombre VARCHAR(255) NOT NULL CHECK (char_length(btrim(nombre)) >= 1),
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 104857600),
    estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'LISTO')),
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_user_files_owner ON public.user_files (owner_id);

-- Ruta del PDF publicado en R2 y quién lo publicó (un estudiante no es teachers.user_id).
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS archivo_key TEXT;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS publicado_por UUID;

COMMIT;
