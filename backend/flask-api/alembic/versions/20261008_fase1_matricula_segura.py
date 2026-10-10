"""Fase 1: matricula con codigo o aprobacion del docente

Agrega courses.enrollment_mode (OPEN | CODE | APPROVAL, por defecto CODE) y
courses.enrollment_code (unico, nullable), y crea enrollment_requests.

Los cursos que ya existen quedan en CODE con el codigo en NULL: nadie puede
matricularse solo hasta que el docente genere un codigo desde el curso (las
matriculas ya hechas no se tocan, y agregar por correo sigue funcionando).
2026-10-08f_fase1_matricula_segura.sql es el espejo en SQL de esta revision.

Revision ID: fase1_matricula
Revises: fase0_cursos
Create Date: 2026-10-08 23:55:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase1_matricula'
down_revision = 'fase0_cursos'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Tipos enum
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_mode') THEN
                CREATE TYPE enrollment_mode AS ENUM ('OPEN', 'CODE', 'APPROVAL');
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'enrollment_request_status') THEN
                CREATE TYPE enrollment_request_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
            END IF;
        END $$;
        """
    )

    # 2. Columnas de matricula en courses
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_mode enrollment_mode NOT NULL DEFAULT 'CODE';")
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_code VARCHAR(16);")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_courses_enrollment_code') THEN
                ALTER TABLE courses ADD CONSTRAINT uq_courses_enrollment_code UNIQUE (enrollment_code);
            END IF;
        END $$;
        """
    )

    # 3. Solicitudes de matricula (modo APPROVAL)
    op.execute(
        """
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
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_enrollment_requests_course_status ON enrollment_requests (course_id, status);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_enrollment_requests_student_id ON enrollment_requests (student_id);")


def downgrade():
    # Borra las solicitudes de matricula y los codigos; las matriculas
    # (student_courses) no se tocan.
    op.execute("DROP TABLE IF EXISTS enrollment_requests;")
    op.execute("ALTER TABLE courses DROP CONSTRAINT IF EXISTS uq_courses_enrollment_code;")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS enrollment_code;")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS enrollment_mode;")
    op.execute("DROP TYPE IF EXISTS enrollment_request_status;")
    op.execute("DROP TYPE IF EXISTS enrollment_mode;")
