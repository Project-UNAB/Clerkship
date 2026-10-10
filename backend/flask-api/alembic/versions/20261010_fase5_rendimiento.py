"""Fase 5: rendimiento, paginacion y borrado seguro

- Borrado suave: courses.deleted_at y assignment_submissions.deleted_at
  (NULL = vigente; con fecha = en la papelera, restaurable).
- pending_file_deletions: objetos de R2 pendientes de borrar, para reintentar
  cuando R2 falla despues de un borrado ya confirmado en la base.
- consultations.course_id pasa a ON DELETE RESTRICT explicito (estaba en
  NO ACTION): un curso con simulaciones clinicas no se borra definitivamente.
  El resto de la cascada del curso (bloques, items, entregas, intentos,
  preguntas, avisos, matriculas) ya era ON DELETE CASCADE y no se toca.
- Indices para los listados paginados y para el roster (ver cada uno).

2026-10-10_fase5_rendimiento.sql es el espejo en SQL.

Revision ID: fase5_rendimiento
Revises: fase4_portadas
Create Date: 2026-10-10 09:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase5_rendimiento'
down_revision = 'fase4_portadas'
branch_labels = None
depends_on = None

INDICES = [
    # /mios del docente: sus cursos vigentes, del mas nuevo al mas viejo.
    ("ix_courses_teacher_vigentes", "courses (teacher_id, created_at DESC) WHERE deleted_at IS NULL"),
    # Papelera del docente.
    ("ix_courses_teacher_papelera", "courses (teacher_id, deleted_at DESC) WHERE deleted_at IS NOT NULL"),
    # Roster: casos por estudiante dentro de un curso (COUNT ... FILTER ... GROUP BY student_id).
    ("ix_consultations_course_student_status", "consultations (course_id, student_id, status)"),
    # Roster paginado: matriculas de un curso por fecha.
    ("ix_student_courses_course_enrolled", "student_courses (course_id, enrolled_at DESC)"),
    # Avisos paginados: fijados primero, luego los mas recientes.
    ("ix_course_announcements_course_orden", "course_announcements (course_id, pinned DESC, created_at DESC)"),
    # Contenido de varios bloques ya ordenado (listar_bloques en una consulta).
    ("ix_course_content_items_block_position", "course_content_items (block_id, position)"),
    # Entregas paginadas de una tarea, sin las de la papelera.
    ("ix_assignment_submissions_item_submitted",
     "assignment_submissions (item_id, submitted_at DESC) WHERE deleted_at IS NULL"),
    # Cola de limpieza: los pendientes mas viejos primero.
    ("ix_pending_file_deletions_created", "pending_file_deletions (created_at)"),
]


def upgrade():
    # 1. Borrado suave
    op.execute("ALTER TABLE courses ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;")
    op.execute("ALTER TABLE assignment_submissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;")

    # 2. Cola de archivos pendientes de borrar en R2
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS pending_file_deletions (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            storage_key VARCHAR(500) NOT NULL UNIQUE,
            reason VARCHAR(120),
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TIMESTAMPTZ DEFAULT now(),
            last_attempt_at TIMESTAMPTZ
        );
        """
    )

    # 3. El bloqueo por simulaciones clinicas, explicito en la llave foranea
    op.execute(
        """
        DO $$
        DECLARE
            fk RECORD;
        BEGIN
            FOR fk IN
                SELECT c.conname
                FROM pg_constraint c
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                WHERE c.contype = 'f'
                  AND c.conrelid = 'consultations'::regclass
                  AND c.confrelid = 'courses'::regclass
                  AND a.attname = 'course_id'
                  AND c.confdeltype <> 'r'
            LOOP
                EXECUTE format('ALTER TABLE consultations DROP CONSTRAINT %I', fk.conname);
                EXECUTE format(
                    'ALTER TABLE consultations ADD CONSTRAINT %I FOREIGN KEY (course_id) '
                    'REFERENCES courses(id) ON DELETE RESTRICT', fk.conname
                );
            END LOOP;
        END $$;
        """
    )

    # 4. Indices
    for nombre, definicion in INDICES:
        op.execute(f"CREATE INDEX IF NOT EXISTS {nombre} ON {definicion};")


def downgrade():
    for nombre, _definicion in INDICES:
        op.execute(f"DROP INDEX IF EXISTS {nombre};")
    # La llave foranea de consultations se deja en RESTRICT: volver a NO ACTION no cambia nada util.
    # OJO: las filas en la papelera vuelven a verse como vigentes al quitar deleted_at.
    op.execute("DROP TABLE IF EXISTS pending_file_deletions;")
    op.execute("ALTER TABLE assignment_submissions DROP COLUMN IF EXISTS deleted_at;")
    op.execute("ALTER TABLE courses DROP COLUMN IF EXISTS deleted_at;")
