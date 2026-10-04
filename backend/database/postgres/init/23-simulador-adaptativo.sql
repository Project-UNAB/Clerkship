-- ─── 23-simulador-adaptativo.sql ────────────────────────────────────────────
-- Integracion del simulador clinico de gastroenterologia adoptado de
-- jrojas710/proyectodegrado2 (antes un workflow de n8n): seleccion adaptativa
-- de subtema/dificultad por desempeno historico y RAG con fichas clinicas
-- curadas. Ver backend/flask-api/app/services/simulador/.

-- "subtema" identifica el area clinica puntual del caso (ej. "Colelitiasis /
-- colecistitis aguda") dentro de "specialty" (que sigue siendo siempre
-- "Gastroenterología"). Nullable: las consultas creadas antes de esta
-- migracion quedan sin subtema, pero el resto del flujo no se rompe. Se
-- consulta por estudiante (no global, a diferencia del prototipo original sin
-- cuentas) para elegir el siguiente subtema/dificultad — ver
-- app/services/simulador/adaptativo.py.
ALTER TABLE consultations
    ADD COLUMN IF NOT EXISTS subtema VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_consultations_student_subtema
    ON consultations(student_id, subtema);

-- Base documental curada para el Agente Generador (RAG): antes de escribir
-- cada caso se traen hasta 3 fichas del subtema elegido y se inyectan en el
-- prompt como anclaje factual. No almacena datos de pacientes ni de
-- estudiantes, solo contenido clinico de referencia editable por el equipo o
-- un docente.
CREATE TABLE IF NOT EXISTS referencias_clinicas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subtema VARCHAR(150) NOT NULL,
    contenido TEXT NOT NULL,
    creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_referencias_clinicas_subtema ON referencias_clinicas(subtema);

INSERT INTO referencias_clinicas (subtema, contenido)
SELECT * FROM (VALUES
    ('Enfermedad por reflujo gastroesofagico (ERGE)', 'Pirosis retroesternal y regurgitacion acida son los sintomas cardinales; empeoran en decubito y tras comidas copiosas o irritantes. Signos de alarma que ameritan endoscopia: disfagia, perdida de peso, anemia, hemorragia digestiva.'),
    ('Gastritis y enfermedad ulcerosa peptica', 'Dolor epigastrico urente asociado a la ingesta (mejora con alimento en ulcera duodenal, empeora en ulcera gastrica). Factores de riesgo principales: infeccion por H. pylori y uso de AINEs. Alarma: hemorragia digestiva, perdida de peso, anemia.'),
    ('Sindrome de intestino irritable (SII)', 'Dolor abdominal recurrente asociado a cambios en la frecuencia o consistencia de las deposiciones, sin hallazgos estructurales en estudios. Los criterios de Roma IV exigen sintomas al menos 1 dia por semana en los ultimos 3 meses.'),
    ('Enfermedad inflamatoria intestinal (Crohn / Colitis ulcerosa)', 'Diarrea cronica, a veces con sangre (mas tipica en colitis ulcerosa), dolor abdominal, perdida de peso y fatiga. Puede asociar manifestaciones extraintestinales articulares, cutaneas u oculares.'),
    ('Pancreatitis aguda', 'Dolor epigastrico intenso irradiado en banda hacia la espalda, de inicio agudo, frecuentemente asociado a litiasis biliar o consumo de alcohol. Se acompana de nauseas y vomito; la amilasa/lipasa elevadas apoyan el diagnostico.'),
    ('Hepatitis / hepatopatia', 'Ictericia, coluria, acolia, fatiga y malestar general. Puede haber dolor en hipocondrio derecho. Causas comunes: viral, autoinmune, toxica/medicamentosa, metabolica.'),
    ('Hemorragia digestiva alta o baja', 'Hematemesis o melena sugieren origen alto; hematoquecia sugiere origen bajo (aunque un sangrado alto masivo tambien puede presentarse asi). Signos de inestabilidad hemodinamica (taquicardia, hipotension) definen la urgencia del caso.'),
    ('Colelitiasis / colecistitis aguda', 'Dolor tipo colico en hipocondrio derecho o epigastrio, frecuentemente tras comidas grasas, con posible irradiacion a escapula derecha. Colecistitis aguda anade fiebre y signo de Murphy positivo.'),
    ('Colelitiasis / colecistitis aguda', 'Leucocitosis y PCR elevada apoyan colecistitis aguda; la ecografia abdominal muestra engrosamiento de la pared vesicular, calculos y liquido perivesicular.')
) AS v(subtema, contenido)
WHERE NOT EXISTS (SELECT 1 FROM referencias_clinicas LIMIT 1);
