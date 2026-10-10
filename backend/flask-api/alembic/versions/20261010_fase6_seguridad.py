"""Fase 6: rate limiting, auditoria y endurecimiento de JWT

- audit_logs: quien cambio que, cuando y desde que IP (notas, matriculas,
  borrado/restauracion de cursos, codigo de matricula, politica de notas,
  rol y estado de usuarios). Solo se agregan filas.
- revoked_tokens: lista de revocacion de JWT por jti (logout).
- users.tokens_valid_after: corte de sesiones del usuario; los JWT emitidos
  antes dejan de valer (cambio de rol, de contrasena, logout de todo).

El rate limiting no necesita tablas (contador en memoria o Redis).
2026-10-10b_fase6_seguridad.sql es el espejo en SQL.

Revision ID: fase6_seguridad
Revises: fase5_rendimiento
Create Date: 2026-10-10 15:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'fase6_seguridad'
down_revision = 'fase5_rendimiento'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Registro de auditoria
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            action VARCHAR(60) NOT NULL,
            entity_type VARCHAR(40) NOT NULL,
            entity_id VARCHAR(64),
            old_value JSONB,
            new_value JSONB,
            ip VARCHAR(45),
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_user_created ON audit_logs (user_id, created_at);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_audit_logs_created ON audit_logs (created_at);")

    # 2. Lista de revocacion de JWT
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS revoked_tokens (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            jti VARCHAR(64) NOT NULL UNIQUE,
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            token_type VARCHAR(10) NOT NULL,
            reason VARCHAR(40),
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_revoked_tokens_expires ON revoked_tokens (expires_at);")

    # 3. Corte de sesiones por usuario
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ;")


def downgrade():
    # Se pierde el registro de auditoria y los tokens revocados vuelven a valer hasta que venzan.
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS tokens_valid_after;")
    op.execute("DROP TABLE IF EXISTS revoked_tokens;")
    op.execute("DROP TABLE IF EXISTS audit_logs;")
