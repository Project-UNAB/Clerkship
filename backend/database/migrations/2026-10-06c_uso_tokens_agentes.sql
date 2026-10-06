-- Registro de uso de tokens de los 3 agentes del simulador (Generador,
-- Paciente, Evaluador), para el panel de administrador. Aditiva.
BEGIN;
CREATE TABLE IF NOT EXISTS public.agente_uso_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agente VARCHAR(20) NOT NULL CHECK (agente IN ('GENERADOR', 'PACIENTE', 'EVALUADOR')),
    consultation_id UUID REFERENCES public.consultations(id) ON DELETE SET NULL,
    proveedor VARCHAR(40) NOT NULL,
    modelo VARCHAR(80),
    es_mock BOOLEAN NOT NULL DEFAULT false,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    latency_ms INTEGER,
    created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_agente_uso_tokens_agente ON public.agente_uso_tokens (agente);
CREATE INDEX IF NOT EXISTS ix_agente_uso_tokens_created ON public.agente_uso_tokens (created_at);
COMMIT;
