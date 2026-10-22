-- Comentarios privados de las tareas. Espejo en SQL de la revisión de Alembic
-- `comentarios_tareas` (backend/flask-api/alembic/versions/20261028_comentarios_tareas.py).
-- Aplica UNA de las dos: `alembic upgrade comentarios_tareas`, o este archivo y
-- después `alembic stamp comentarios_tareas`. Es idempotente.
BEGIN;

-- Un hilo por (tarea, estudiante) entre el docente dueño del curso y ese
-- estudiante. Se borra con la tarea, el estudiante o el autor.
CREATE TABLE IF NOT EXISTS public.assignment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.course_content_items(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(user_id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_assignment_comments_hilo ON public.assignment_comments (item_id, student_id, created_at);

COMMIT;
