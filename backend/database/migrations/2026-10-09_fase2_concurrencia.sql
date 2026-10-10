-- Fase 2: concurrencia en entregas y cuestionarios. Espejo en SQL de la
-- revisión de Alembic `fase2_concurrencia`
-- (backend/flask-api/alembic/versions/20261009_fase2_concurrencia.py).
-- Aplica UNA de las dos: `alembic upgrade fase2_concurrencia`, o este archivo
-- y después `alembic stamp fase2_concurrencia`. Es idempotente.
BEGIN;

-- 1. Política de nota del cuestionario
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quiz_grade_policy') THEN
        CREATE TYPE quiz_grade_policy AS ENUM ('BEST', 'LAST', 'AVERAGE', 'FIRST');
    END IF;
END $$;

ALTER TABLE public.course_content_items
  ADD COLUMN IF NOT EXISTS grade_policy quiz_grade_policy NOT NULL DEFAULT 'BEST';

-- 2. Tiempo límite del intento
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired BOOLEAN NOT NULL DEFAULT false;

-- 3. Limpieza previa a las restricciones únicas: si un estudiante tiene varios
--    intentos abiertos del mismo cuestionario queda abierto el más reciente y
--    los demás se cierran en cero, marcados como vencidos.
UPDATE public.quiz_attempts a
SET submitted_at = now(), score = 0, expired = true
FROM (
    SELECT id, row_number() OVER (
        PARTITION BY item_id, student_id ORDER BY started_at DESC, id DESC
    ) AS rn
    FROM public.quiz_attempts
    WHERE submitted_at IS NULL
) abiertos
WHERE a.id = abiertos.id AND abiertos.rn > 1;

--    Y se renumeran los intentos de quien tenga algún número repetido.
UPDATE public.quiz_attempts a
SET attempt_number = orden.rn
FROM (
    SELECT id, row_number() OVER (
        PARTITION BY item_id, student_id ORDER BY started_at ASC, id ASC
    ) AS rn
    FROM public.quiz_attempts
) orden
WHERE a.id = orden.id
  AND a.attempt_number <> orden.rn
  AND EXISTS (
      SELECT 1 FROM public.quiz_attempts b
      WHERE b.item_id = a.item_id AND b.student_id = a.student_id
      GROUP BY b.attempt_number HAVING COUNT(*) > 1
  );

-- 4. Restricciones únicas (segunda barrera detrás del SELECT ... FOR UPDATE)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_quiz_attempts_item_student_number') THEN
        ALTER TABLE public.quiz_attempts
        ADD CONSTRAINT uq_quiz_attempts_item_student_number UNIQUE (item_id, student_id, attempt_number);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.quiz_answers'::regclass AND contype = 'u'
          AND conname = 'quiz_answers_attempt_id_question_id_key'
    ) THEN
        DELETE FROM public.quiz_answers a USING public.quiz_answers b
        WHERE a.ctid < b.ctid AND a.attempt_id = b.attempt_id AND a.question_id = b.question_id;
        ALTER TABLE public.quiz_answers
        ADD CONSTRAINT quiz_answers_attempt_id_question_id_key UNIQUE (attempt_id, question_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname IN ('assignment_submissions_item_id_student_id_key', 'uq_assignment_submissions_item_student')
    ) THEN
        ALTER TABLE public.assignment_submissions
        ADD CONSTRAINT assignment_submissions_item_id_student_id_key UNIQUE (item_id, student_id);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_quiz_attempts_un_abierto
  ON public.quiz_attempts (item_id, student_id) WHERE submitted_at IS NULL;

COMMIT;
