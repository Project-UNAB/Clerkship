-- Validación por expertos: una tabla por pestaña, separada de los formularios de estudiantes.
-- Escala 1 (no pertinente / no claro) a 4 (totalmente pertinente / claro).
-- Los expertos no tienen cuenta: se identifican con datos escritos en el formulario.
BEGIN;

CREATE TABLE IF NOT EXISTS public.validacion_inicio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_experto VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre_experto)) >= 2),
    id_experto VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_experto)) >= 2),
    profesion VARCHAR(120) NOT NULL,
    anos_experiencia SMALLINT NOT NULL CHECK (anos_experiencia BETWEEN 0 AND 80),
    especialidad VARCHAR(120),
    claridad_informacion SMALLINT NOT NULL CHECK (claridad_informacion BETWEEN 1 AND 4),
    pertinencia_informacion SMALLINT NOT NULL CHECK (pertinencia_informacion BETWEEN 1 AND 4),
    organizacion_visual SMALLINT NOT NULL CHECK (organizacion_visual BETWEEN 1 AND 4),
    jerarquia_navegacion SMALLINT NOT NULL CHECK (jerarquia_navegacion BETWEEN 1 AND 4),
    accesibilidad SMALLINT NOT NULL CHECK (accesibilidad BETWEEN 1 AND 4),
    coherencia_terminologia SMALLINT NOT NULL CHECK (coherencia_terminologia BETWEEN 1 AND 4),
    suficiencia_accesos SMALLINT NOT NULL CHECK (suficiencia_accesos BETWEEN 1 AND 4),
    utilidad_general SMALLINT NOT NULL CHECK (utilidad_general BETWEEN 1 AND 4),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validacion_casos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_experto VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre_experto)) >= 2),
    id_experto VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_experto)) >= 2),
    profesion VARCHAR(120) NOT NULL,
    anos_experiencia SMALLINT NOT NULL CHECK (anos_experiencia BETWEEN 0 AND 80),
    especialidad VARCHAR(120),
    pertinencia_clinica SMALLINT NOT NULL CHECK (pertinencia_clinica BETWEEN 1 AND 4),
    redaccion_clara SMALLINT NOT NULL CHECK (redaccion_clara BETWEEN 1 AND 4),
    coherencia_diagnostica SMALLINT NOT NULL CHECK (coherencia_diagnostica BETWEEN 1 AND 4),
    coherencia_examenes SMALLINT NOT NULL CHECK (coherencia_examenes BETWEEN 1 AND 4),
    realismo_paciente SMALLINT NOT NULL CHECK (realismo_paciente BETWEEN 1 AND 4),
    dificultad_adecuada SMALLINT NOT NULL CHECK (dificultad_adecuada BETWEEN 1 AND 4),
    utilidad_formativa SMALLINT NOT NULL CHECK (utilidad_formativa BETWEEN 1 AND 4),
    suficiencia_contenido SMALLINT NOT NULL CHECK (suficiencia_contenido BETWEEN 1 AND 4),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validacion_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_experto VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre_experto)) >= 2),
    id_experto VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_experto)) >= 2),
    profesion VARCHAR(120) NOT NULL,
    anos_experiencia SMALLINT NOT NULL CHECK (anos_experiencia BETWEEN 0 AND 80),
    especialidad VARCHAR(120),
    claridad_puntajes SMALLINT NOT NULL CHECK (claridad_puntajes BETWEEN 1 AND 4),
    pertinencia_evaluacion SMALLINT NOT NULL CHECK (pertinencia_evaluacion BETWEEN 1 AND 4),
    retroalimentacion_util SMALLINT NOT NULL CHECK (retroalimentacion_util BETWEEN 1 AND 4),
    coherencia_dimensiones SMALLINT NOT NULL CHECK (coherencia_dimensiones BETWEEN 1 AND 4),
    suficiencia_informacion SMALLINT NOT NULL CHECK (suficiencia_informacion BETWEEN 1 AND 4),
    utilidad_formativa SMALLINT NOT NULL CHECK (utilidad_formativa BETWEEN 1 AND 4),
    comprension_estudiante SMALLINT NOT NULL CHECK (comprension_estudiante BETWEEN 1 AND 4),
    presentacion SMALLINT NOT NULL CHECK (presentacion BETWEEN 1 AND 4),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.validacion_biblioteca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_experto VARCHAR(120) NOT NULL CHECK (char_length(btrim(nombre_experto)) >= 2),
    id_experto VARCHAR(60) NOT NULL CHECK (char_length(btrim(id_experto)) >= 2),
    profesion VARCHAR(120) NOT NULL,
    anos_experiencia SMALLINT NOT NULL CHECK (anos_experiencia BETWEEN 0 AND 80),
    especialidad VARCHAR(120),
    pertinencia_recursos SMALLINT NOT NULL CHECK (pertinencia_recursos BETWEEN 1 AND 4),
    actualidad_fuentes SMALLINT NOT NULL CHECK (actualidad_fuentes BETWEEN 1 AND 4),
    calidad_fuentes SMALLINT NOT NULL CHECK (calidad_fuentes BETWEEN 1 AND 4),
    claridad_descripcion SMALLINT NOT NULL CHECK (claridad_descripcion BETWEEN 1 AND 4),
    organizacion_contenido SMALLINT NOT NULL CHECK (organizacion_contenido BETWEEN 1 AND 4),
    suficiencia_recursos SMALLINT NOT NULL CHECK (suficiencia_recursos BETWEEN 1 AND 4),
    utilidad_formativa SMALLINT NOT NULL CHECK (utilidad_formativa BETWEEN 1 AND 4),
    accesibilidad_archivos SMALLINT NOT NULL CHECK (accesibilidad_archivos BETWEEN 1 AND 4),
    comentario TEXT,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);

COMMIT;
