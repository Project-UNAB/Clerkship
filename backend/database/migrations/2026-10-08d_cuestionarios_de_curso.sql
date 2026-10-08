-- Cuestionarios (quizzes): sexto tipo de contenido, con banco de preguntas
-- de opción múltiple/verdadero-falso y calificación automática. Aditiva.
BEGIN;

ALTER TABLE public.course_content_items
  ADD COLUMN IF NOT EXISTS time_limit_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER;

CREATE TABLE IF NOT EXISTS public.quiz_questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.course_content_items(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL,
    prompt TEXT NOT NULL,
    points NUMERIC(6, 2) NOT NULL DEFAULT 1,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_quiz_questions_item ON public.quiz_questions (item_id);

CREATE TABLE IF NOT EXISTS public.quiz_choices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    text VARCHAR(500) NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    position INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_quiz_choices_question ON public.quiz_choices (question_id);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.course_content_items(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(user_id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    started_at TIMESTAMP NOT NULL DEFAULT now(),
    submitted_at TIMESTAMP,
    score NUMERIC(6, 2),
    max_score NUMERIC(6, 2)
);
CREATE INDEX IF NOT EXISTS ix_quiz_attempts_item_student ON public.quiz_attempts (item_id, student_id);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID NOT NULL REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
    selected_choice_ids UUID[] NOT NULL DEFAULT '{}',
    is_correct BOOLEAN,
    UNIQUE (attempt_id, question_id)
);
CREATE INDEX IF NOT EXISTS ix_quiz_answers_attempt ON public.quiz_answers (attempt_id);

COMMIT;
