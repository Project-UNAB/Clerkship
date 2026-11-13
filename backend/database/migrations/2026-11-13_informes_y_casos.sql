-- Espejo en SQL de alembic/versions/20261113_informes_y_casos.py
-- Informe compartible de la consulta y casos clínicos asignados en los cursos. Aditivo.
BEGIN;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS course_item_id UUID
    REFERENCES course_content_items(id) ON DELETE SET NULL;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS share_token VARCHAR(64);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS teacher_score NUMERIC(6, 2);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS teacher_feedback TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS uq_consultations_share_token ON consultations (share_token)
    WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_consultations_course_item ON consultations (course_item_id, student_id);

ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_template JSONB;
ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_subtema VARCHAR(150);
ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS case_dificultad VARCHAR(20);

CREATE TABLE IF NOT EXISTS consultation_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    shared_by UUID REFERENCES users(id) ON DELETE SET NULL,
    via VARCHAR(10) NOT NULL DEFAULT 'DIRECTO' CHECK (via IN ('DIRECTO', 'ENLACE')),
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_consultation_shares UNIQUE (consultation_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_consultation_shares_user ON consultation_shares (user_id, created_at);

CREATE TABLE IF NOT EXISTS consultation_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consultation_id UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    section VARCHAR(40) NOT NULL DEFAULT 'general',
    body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_consultation_comments ON consultation_comments (consultation_id, created_at);
    
COMMIT;
