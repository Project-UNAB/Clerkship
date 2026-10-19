-- Notas y comentarios en los libros de la biblioteca. Espejo en SQL de la
-- revisión de Alembic `notas_biblioteca`
-- (backend/flask-api/alembic/versions/20261023_notas_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade notas_biblioteca`, o este archivo y
-- después `alembic stamp notas_biblioteca`. Es idempotente.
BEGIN;

-- Nota o comentario de un usuario sobre una zona de una página (relativa, 0 a 1),
-- con el texto del PDF que quedó dentro. Se borra con el usuario o con el libro.
CREATE TABLE IF NOT EXISTS public.article_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  page INTEGER NOT NULL CHECK (page >= 1),
  rect JSONB NOT NULL,
  quote TEXT,
  body TEXT NOT NULL DEFAULT '',
  color VARCHAR(7) NOT NULL DEFAULT '#FACC15',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_article_notes_user_article ON public.article_notes (user_id, article_id, page);

COMMIT;
