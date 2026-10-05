-- Amplía los formularios de retroalimentación: nombre obligatorio y más ítems.
-- Aditiva: conserva las columnas ya creadas en 2026-10-05_feedback_por_pestana.sql.
-- Las tablas estaban vacías al aplicar esta migración, por eso las columnas nuevas
-- son NOT NULL sin valor por defecto.
BEGIN;

-- Nombre obligatorio en todas las tablas.
ALTER TABLE public.feedback_inicio ADD COLUMN IF NOT EXISTS nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2);
ALTER TABLE public.feedback_casos ADD COLUMN IF NOT EXISTS nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2);
ALTER TABLE public.feedback_historial ADD COLUMN IF NOT EXISTS nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2);
ALTER TABLE public.feedback_biblioteca ADD COLUMN IF NOT EXISTS nombre VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre)) >= 2);

-- Inicio: 9 ítems nuevos.
ALTER TABLE public.feedback_inicio
    ADD COLUMN IF NOT EXISTS velocidad_carga SMALLINT NOT NULL CHECK (velocidad_carga BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS diseno_visual SMALLINT NOT NULL CHECK (diseno_visual BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS legibilidad_textos SMALLINT NOT NULL CHECK (legibilidad_textos BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS orden_menus SMALLINT NOT NULL CHECK (orden_menus BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS facilidad_uso_movil SMALLINT NOT NULL CHECK (facilidad_uso_movil BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS confianza_plataforma SMALLINT NOT NULL CHECK (confianza_plataforma BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS claridad_mensajes SMALLINT NOT NULL CHECK (claridad_mensajes BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS utilidad_avisos SMALLINT NOT NULL CHECK (utilidad_avisos BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS recomendaria_plataforma SMALLINT NOT NULL CHECK (recomendaria_plataforma BETWEEN 1 AND 5);

-- Casos clínicos: 8 ítems nuevos.
ALTER TABLE public.feedback_casos
    ADD COLUMN IF NOT EXISTS coherencia_sintomas SMALLINT NOT NULL CHECK (coherencia_sintomas BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS coherencia_examenes SMALLINT NOT NULL CHECK (coherencia_examenes BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS utilidad_educativa SMALLINT NOT NULL CHECK (utilidad_educativa BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS retroalimentacion_clara SMALLINT NOT NULL CHECK (retroalimentacion_clara BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS tiempo_adecuado SMALLINT NOT NULL CHECK (tiempo_adecuado BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS variedad_casos SMALLINT NOT NULL CHECK (variedad_casos BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS realismo_examenes SMALLINT NOT NULL CHECK (realismo_examenes BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS satisfaccion_general SMALLINT NOT NULL CHECK (satisfaccion_general BETWEEN 1 AND 5);

-- Historial: 7 ítems nuevos.
ALTER TABLE public.feedback_historial
    ADD COLUMN IF NOT EXISTS detalle_evaluacion SMALLINT NOT NULL CHECK (detalle_evaluacion BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS comprension_dimensiones SMALLINT NOT NULL CHECK (comprension_dimensiones BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS progreso_visible SMALLINT NOT NULL CHECK (progreso_visible BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS utilidad_para_estudiar SMALLINT NOT NULL CHECK (utilidad_para_estudiar BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS filtros_utiles SMALLINT NOT NULL CHECK (filtros_utiles BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS exportacion_util SMALLINT NOT NULL CHECK (exportacion_util BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS satisfaccion_general SMALLINT NOT NULL CHECK (satisfaccion_general BETWEEN 1 AND 5);

-- Biblioteca: 8 ítems nuevos.
ALTER TABLE public.feedback_biblioteca
    ADD COLUMN IF NOT EXISTS actualidad_contenido SMALLINT NOT NULL CHECK (actualidad_contenido BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS claridad_descripciones SMALLINT NOT NULL CHECK (claridad_descripciones BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS variedad_recursos SMALLINT NOT NULL CHECK (variedad_recursos BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS facilidad_descarga SMALLINT NOT NULL CHECK (facilidad_descarga BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS organizacion_por_temas SMALLINT NOT NULL CHECK (organizacion_por_temas BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS calidad_lectura SMALLINT NOT NULL CHECK (calidad_lectura BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS utilidad_para_estudio SMALLINT NOT NULL CHECK (utilidad_para_estudio BETWEEN 1 AND 5),
    ADD COLUMN IF NOT EXISTS satisfaccion_general SMALLINT NOT NULL CHECK (satisfaccion_general BETWEEN 1 AND 5);

COMMIT;
