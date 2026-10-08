-- Material de curso: bloques (temas, funcionan como carpetas) con contenido
-- adentro (documentos en R2, videos por enlace externo, enlaces y notas de
-- texto). El docente los crea y organiza; aditiva, no toca tablas existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.course_blocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_course_blocks_course ON public.course_blocks (course_id);

CREATE TABLE IF NOT EXISTS public.course_content_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    block_id UUID NOT NULL REFERENCES public.course_blocks(id) ON DELETE CASCADE,
    type VARCHAR(12) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    file_id UUID REFERENCES public.user_files(id) ON DELETE SET NULL,
    video_url VARCHAR(500),
    link_url VARCHAR(500),
    text_content TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_course_content_items_block ON public.course_content_items (block_id);

COMMIT;
