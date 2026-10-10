-- Migracion Fase 1: matricula con codigo o aprobacion del docente
-- Espejo en SQL de backend/flask-api/alembic/versions/20261008_fase1_matricula_segura.py
-- (revision fase1_matricula). Aplica una de las dos, no ambas; si usas este
-- archivo, marca luego la revision con `alembic stamp fase1_matricula`.
-- Los cursos existentes quedan en CODE con el codigo en NULL: nadie se
-- matricula solo hasta que el docente genere un codigo desde el curso.

-- 1. Tipos enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_mode') THEN
        CREATE TYPE enrollment_mode AS ENUM ('OPEN', 'CODE', 'APPROVAL');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_request_status') THEN
        CREATE TYPE enrollment_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END $$;

-- 2. Columnas de matricula en courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_mode enrollment_mode NOT NULL DEFAULT 'CODE';
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_code VARCHAR(16);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_courses_enrollment_code') THEN
        ALTER TABLE courses ADD CONSTRAINT uq_courses_enrollment_code UNIQUE (enrollment_code);
    END IF;
END $$;

-- 3. Solicitudes de matricula (modo APPROVAL)
CREATE TABLE IF NOT EXISTS enrollment_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(user_id) ON DELETE CASCADE,
    status enrollment_request_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT uq_enrollment_requests_course_student UNIQUE (course_id, student_id)
);

CREATE INDEX IF NOT EXISTS ix_enrollment_requests_course_status ON enrollment_requests (course_id, status);
CREATE INDEX IF NOT EXISTS ix_enrollment_requests_student_id ON enrollment_requests (student_id);
