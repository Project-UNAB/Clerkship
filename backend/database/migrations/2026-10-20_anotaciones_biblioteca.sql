-- Anotaciones privadas en los libros de la biblioteca. Espejo en SQL de la
-- revisión de Alembic `anotaciones_biblioteca`
-- (backend/flask-api/alembic/versions/20261020_anotaciones_biblioteca.py).
-- Aplica UNA de las dos: `alembic upgrade anotaciones_biblioteca`, o este archivo y
-- después `alembic stamp anotaciones_biblioteca`. Es idempotente.
BEGIN;

-- Lo que cada usuario subraya o dibuja en una página de un libro. Los trazos
-- van con coordenadas relativas a la página (0 a 1). Se borra con el usuario
-- o con el libro.
CREATE TABLE IF NOT EXISTS public.article_annotations (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  page INTEGER NOT NULL CHECK (page >= 1),
  strokes JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, article_id, page)
);

COMMIT;
