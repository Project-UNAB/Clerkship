-- Formularios de retroalimentación, una tabla por pestaña del dashboard.
-- Aditiva: solo crea tablas nuevas, no toca datos existentes.
-- Cada calificación va de 1 (muy mala) a 5 (muy buena).
BEGIN;

CREATE TABLE IF NOT EXISTS public.feedback_inicio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claridad_navegacion SMALLINT NOT NULL CHECK (claridad_navegacion BETWEEN 1 AND 5),
    informacion_util SMALLINT NOT NULL CHECK (informacion_util BETWEEN 1 AND 5),
    accesos_rapidos SMALLINT NOT NULL CHECK (accesos_rapidos BETWEEN 1 AND 5),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_casos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    realismo_caso SMALLINT NOT NULL CHECK (realismo_caso BETWEEN 1 AND 5),
    calidad_paciente_virtual SMALLINT NOT NULL CHECK (calidad_paciente_virtual BETWEEN 1 AND 5),
    claridad_instrucciones SMALLINT NOT NULL CHECK (claridad_instrucciones BETWEEN 1 AND 5),
    dificultad_percibida SMALLINT NOT NULL CHECK (dificultad_percibida BETWEEN 1 AND 5),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claridad_puntajes SMALLINT NOT NULL CHECK (claridad_puntajes BETWEEN 1 AND 5),
    utilidad_recomendacion SMALLINT NOT NULL CHECK (utilidad_recomendacion BETWEEN 1 AND 5),
    facilidad_revision SMALLINT NOT NULL CHECK (facilidad_revision BETWEEN 1 AND 5),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.feedback_biblioteca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    calidad_contenido SMALLINT NOT NULL CHECK (calidad_contenido BETWEEN 1 AND 5),
    facilidad_busqueda SMALLINT NOT NULL CHECK (facilidad_busqueda BETWEEN 1 AND 5),
    utilidad_recursos SMALLINT NOT NULL CHECK (utilidad_recursos BETWEEN 1 AND 5),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

COMMIT;
