"""Fase 3: configuracion de tareas por el docente

- course_content_items (solo se usan en ASSIGNMENT): allowed_extensions
  (TEXT[], vacio = las del servidor por defecto), max_file_size_mb (NULL = el
  tope del servidor), max_files (por defecto 1) y late_until (hasta cuando se
  aceptan tardias; NULL = sin tope). open_at y due_at ya eran TIMESTAMPTZ
  desde la fase 0.
- assignment_submissions.current_version: version vigente de la entrega.
- submission_files: los archivos de cada version de una entrega. Volver a
  entregar agrega una version; las anteriores quedan de historial.

Las entregas que ya existieran (un archivo en user_files, via file_id) pasan a
ser la version 1 en submission_files. 2026-10-09b_fase3_tareas.sql es el
espejo en SQL.

Revision ID: fase3_tareas
Revises: fase2_concurrencia
Create Date: 2026-10-09 16:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase3_tareas'
down_revision = 'fase2_concurrencia'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Reglas de la tarea
    op.execute("ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS late_until TIMESTAMPTZ;")
    op.execute(
        "ALTER TABLE course_content_items "
        "ADD COLUMN IF NOT EXISTS allowed_extensions VARCHAR(10)[] NOT NULL DEFAULT '{}';"
    )
    op.execute("ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS max_file_size_mb INTEGER;")
    op.execute("ALTER TABLE course_content_items ADD COLUMN IF NOT EXISTS max_files INTEGER NOT NULL DEFAULT 1;")
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_course_content_items_limites_tarea') THEN
                ALTER TABLE course_content_items
                ADD CONSTRAINT ck_course_content_items_limites_tarea
                CHECK (max_files >= 1 AND (max_file_size_mb IS NULL OR max_file_size_mb >= 1));
            END IF;
        END $$;
        """
    )

    # 2. Version vigente de la entrega
    op.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0;")

    # 3. Archivos por version
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS submission_files (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            submission_id UUID NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
            version INTEGER NOT NULL,
            position INTEGER NOT NULL DEFAULT 0,
            file_key VARCHAR(500) NOT NULL UNIQUE,
            original_name VARCHAR(255) NOT NULL,
            mime_type VARCHAR(150),
            size_bytes BIGINT,
            is_late BOOLEAN NOT NULL DEFAULT false,
            uploaded_at TIMESTAMPTZ DEFAULT now(),
            CONSTRAINT uq_submission_files_version_position UNIQUE (submission_id, version, position)
        );
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_submission_files_submission_version ON submission_files (submission_id, version);"
    )

    # 4. Las entregas anteriores (un archivo en user_files) pasan a ser la version 1
    op.execute(
        """
        INSERT INTO submission_files
            (submission_id, version, position, file_key, original_name, mime_type, size_bytes, is_late, uploaded_at)
        SELECT s.id, 1, 0, f.storage_key, f.nombre, f.mime_type, f.size_bytes, s.is_late, s.submitted_at
        FROM assignment_submissions s
        JOIN user_files f ON f.id = s.file_id
        WHERE NOT EXISTS (SELECT 1 FROM submission_files x WHERE x.submission_id = s.id)
          AND NOT EXISTS (SELECT 1 FROM submission_files y WHERE y.file_key = f.storage_key);
        """
    )
    op.execute(
        """
        UPDATE assignment_submissions s
        SET current_version = 1
        WHERE s.current_version = 0
          AND EXISTS (SELECT 1 FROM submission_files x WHERE x.submission_id = s.id);
        """
    )


def downgrade():
    # Se pierde el historial de versiones (las filas; los objetos en R2 quedan).
    op.execute("DROP TABLE IF EXISTS submission_files;")
    op.execute("ALTER TABLE assignment_submissions DROP COLUMN IF EXISTS current_version;")
    op.execute("ALTER TABLE course_content_items DROP CONSTRAINT IF EXISTS ck_course_content_items_limites_tarea;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS max_files;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS max_file_size_mb;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS allowed_extensions;")
    op.execute("ALTER TABLE course_content_items DROP COLUMN IF EXISTS late_until;")
