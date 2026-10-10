-- Fase 7: notificaciones y rúbricas. Espejo en SQL de la revisión de Alembic
-- `fase7_funcionalidades`
-- (backend/flask-api/alembic/versions/20261011_fase7_funcionalidades.py).
-- Aplica UNA de las dos: `alembic upgrade fase7_funcionalidades`, o este
-- archivo y después `alembic stamp fase7_funcionalidades`. Es idempotente.
BEGIN;

-- 1. Notificaciones dentro de la plataforma. read_at NULL = no leída.
--    dedupe_key evita repetir el recordatorio de fecha límite (corre cada hora).
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body VARCHAR(500),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE,
    entity_type VARCHAR(30),
    entity_id UUID,
    event_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    email_sent_at TIMESTAMPTZ,
    dedupe_key VARCHAR(160) UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_notifications_user_created ON public.notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_notifications_user_no_leidas ON public.notifications (user_id) WHERE read_at IS NULL;

--    Recibirlas también por correo: apagado hasta que el usuario lo active.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT false;

-- 2. Rúbrica opcional de una tarea ([{id, title, description, max_points}]) y
--    la nota por criterio de cada entrega.
ALTER TABLE public.course_content_items ADD COLUMN IF NOT EXISTS rubric JSONB;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS rubric_scores JSONB;

COMMIT;
