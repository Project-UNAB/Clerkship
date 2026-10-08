-- Tareas (assignments): quinto tipo de contenido dentro de un bloque de
-- curso, con ventana de apertura/cierre y entregas de archivo calificables.
-- Aditiva: agrega columnas nullable a course_content_items y una tabla nueva.
BEGIN;

ALTER TABLE public.course_content_items
  ADD COLUMN IF NOT EXISTS open_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS allow_late BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.course_content_items(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(user_id) ON DELETE CASCADE,
    file_id UUID REFERENCES public.user_files(id) ON DELETE SET NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT now(),
    is_late BOOLEAN NOT NULL DEFAULT false,
    score NUMERIC(6, 2),
    feedback TEXT,
    graded_at TIMESTAMP,
    graded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    UNIQUE (item_id, student_id)
);
CREATE INDEX IF NOT EXISTS ix_assignment_submissions_item ON public.assignment_submissions (item_id);
CREATE INDEX IF NOT EXISTS ix_assignment_submissions_student ON public.assignment_submissions (student_id);

COMMIT;
