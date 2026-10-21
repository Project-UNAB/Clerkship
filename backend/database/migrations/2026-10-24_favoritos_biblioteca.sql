-- Favoritos de la biblioteca. Espejo en SQL de la revisión de Alembic
-- `favoritos_biblioteca` (backend/flask-api/alembic/versions/20261024_favoritos_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade favoritos_biblioteca`, o este archivo y
-- después `alembic stamp favoritos_biblioteca`. Es idempotente.
BEGIN;

-- Recursos que cada usuario marcó como favoritos. Se borra con el usuario o con el recurso.
CREATE TABLE IF NOT EXISTS public.article_favorites (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, article_id)
);

COMMIT;
