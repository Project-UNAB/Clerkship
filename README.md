# Clerkship UNAB

> **Prototipo web basado en inteligencia artificial para entrenar el razonamiento clínico-diagnóstico en gastroenterología**

[![Licencia: GPL v3](https://img.shields.io/badge/Licencia-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Estado](https://img.shields.io/badge/Estado-En%20validaci%C3%B3n-yellow.svg)]()
[![TRL](https://img.shields.io/badge/TRL%20objetivo-4%20(sujeto%20a%20validaci%C3%B3n%20experta)-orange.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?logo=react)]()
[![Flask](https://img.shields.io/badge/Backend-Flask%20(Python)-000000?logo=flask)]()

---

## ¿Qué es?

**Clerkship UNAB** es una plataforma web (ambiente virtual de aprendizaje) donde un estudiante de ciencias de la salud entrevista a un paciente virtual, lo examina, solicita paraclínicos, formula su diagnóstico y recibe una calificación con retroalimentación por dimensión. Los casos son **simulados** (no hay datos de pacientes reales) y se limitan al **sistema gastrointestinal**.

Funciona con **tres agentes** sobre la **API de Google Gemini**, coordinados por el backend con funciones propias y reglas programadas:

| Agente | Qué hace |
|---|---|
| Generador de casos | Construye la viñeta clínica, el diagnóstico real y la rúbrica de referencia. El backend valida el caso antes de usarlo. |
| Paciente virtual | Responde la entrevista. Guardas del backend evitan que revele el diagnóstico o salga de su papel. |
| Evaluador | Clasifica el desempeño y redacta la retroalimentación. **El puntaje lo calcula una fórmula fija y auditable**, no el modelo. |

## Alcance y límites (léalos antes de interpretar resultados)

- El puntaje refleja sobre todo la **exhaustividad de la información recolectada** (anamnesis, hallazgos, examen físico y paraclínicos) y la **concordancia del diagnóstico final**. El sistema **no registra las hipótesis intermedias** del estudiante ni la justificación de su diagnóstico.
- **No detecta sesgos cognitivos** ni operacionaliza la teoría del doble proceso (quedan como trabajo futuro; son el marco teórico del proyecto).
- **No usa búsqueda vectorial ni entrena o ajusta modelos.** El generador puede apoyarse en *referencias clínicas por subtema* (tabla en PostgreSQL con herramienta de carga: `backend/flask-api/scripts/cargar_referencias.py`); su contenido está por cargar y validar.
- La adecuación clínica de los casos generados **aún no ha sido validada por expertos**; la validación está en curso (ver «Validación por expertos»).
- Las mediciones técnicas existentes son de confiabilidad (robustez, consistencia, latencia), no de validez.

## Módulos

| Módulo | Descripción |
|---|---|
| Simulador clínico | Casos, entrevista, exploración, paraclínicos, diagnóstico y evaluación. |
| Historial y seguimiento | Consultas del estudiante y vista de seguimiento para el docente. |
| Mis cursos | Aula virtual: tareas, cuestionarios, calificaciones y comentarios. |
| Biblioteca y almacenamiento | Recursos de lectura y espacio personal en la nube. |
| Panel de administración | Usuarios, opinión de usuarios y validación por expertos. |
| Validación por expertos | Portal público con enlace personal (`/evaluacion-experto/<token>`), sin cuenta: ítems de 1 a 4, revisión de casos con puntaje a ciegas y resultados (V de Aiken, I-CVI, concordancia, indicadores de la tesis) exportables a CSV. |

## Estructura del repositorio

```
├── frontend/              # React 19 + TypeScript + Vite
├── backend/
│   ├── flask-api/         # API principal (Flask): auth, simulador, cursos, validación
│   │   ├── app/           #   routes/, models/, schemas/, services/ (simulador, scoring, guardrails…)
│   │   ├── alembic/       #   migraciones
│   │   └── tests/         #   pytest (SQLite en memoria)
│   ├── gotenberg/         # Conversión de documentos a PDF (vistas previas)
│   ├── database/          # SQL de referencia (PostgreSQL)
│   └── fastapi-service/   # Prototipo inicial; no se usa en la versión actual
└── docs/                  # Guías, presentaciones y despliegue
```

## Tecnologías

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router 7, Framer Motion |
| Backend | Flask 3, SQLAlchemy, Flask-JWT-Extended, Flask-Limiter, Pydantic, Gunicorn |
| IA | API de Google Gemini (cadena de modelos con respaldo), instrucciones de sistema y salida estructurada |
| Datos | PostgreSQL (Supabase), MongoDB Atlas (conversaciones), Cloudflare R2 (archivos) |
| Correo | Mailgun |
| Despliegue | Vercel (frontend) y Google Cloud Run (backend). Ver [`docs/DESPLIEGUE_CLOUD_RUN.md`](docs/DESPLIEGUE_CLOUD_RUN.md) |

## Ejecutar en local

### Backend

```bash
cd backend/flask-api
python -m venv .venv && source .venv/bin/activate      # En Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env     # completar DATABASE_URL, MONGODB_URI, JWT_SECRET_KEY, GEMINI_API_KEY…
FLASK_ENV=development FLASK_RUN_PORT=5000 python app.py
```

Sin `GEMINI_API_KEY`, use `AI_AGENT_PROVIDER=mock` para un modo determinista sin consumir cuota.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env     # VITE_API_BASE_URL=http://localhost:5000
npm run dev
```

### Pruebas

```bash
cd backend/flask-api && pytest          # no toca ninguna base real
cd frontend && npm run build            # comprueba los tipos y compila
```

## Evaluación del prototipo

| Variable | Indicador de éxito |
|---|---|
| Pertinencia formativa de los casos | ≥ 70 % de las valoraciones en 3 o 4 (docente experto) |
| Referencia de evaluación adecuada | ≥ 80 % de los casos revisados (coherencia clínica y precisión de la evaluación en 3 o 4) |
| Calidad de la evaluación y la retroalimentación | ≥ 70 % de las valoraciones en 3 o 4 |
| Cobertura de los tres dominios (anamnesis, examen físico, paraclínicos) | ≥ 90 % de los casos |
| Robustez del paciente virtual | El diagnóstico no aparece y mantiene su papel en ≥ 90 % de los intentos |
| Consistencia de la calificación | Diferencia ≤ 10 puntos entre tres evaluaciones en ≥ 80 % de las consultas |
| Tiempo de respuesta | Chat ≤ 10 s y evaluación ≤ 45 s en el 90 % de las interacciones |
| Percepción de los usuarios | ≥ 70 % de valoraciones favorables |

Estado: las mediciones técnicas se ejecutaron con reservas (modelos de respaldo, un solo caso, entrevistas del equipo); la valoración por expertos y las pruebas con estudiantes están pendientes.

## Marco normativo

- **Ley 1581 de 2012** y **Decreto 1377 de 2013**: protección de datos personales y consentimiento informado (el consentimiento se registra en el servidor con su versión).
- **Resolución 8430 de 1993**: la clasificación del riesgo y la necesidad de aval del Comité de Ética se están consultando, porque el plan incluye pruebas con estudiantes.
- **Política de propiedad intelectual UNAB (2021)**.

> **Aviso:** Clerkship es un prototipo académico. No es una herramienta de diagnóstico médico ni reemplaza la enseñanza clínica formal ni el criterio de un docente.

## Equipo

| Nombre | Rol |
|---|---|
| **Juan Camilo Rojas** | Agentes de IA y arquitectura de IA |
| **Santiago Steven Arias Estupiñán** | Frontend y conexión de sistemas |
| **Camilo Andrés Bueno Rey** | Backend y conexión de sistemas |

**Universidad Autónoma de Bucaramanga (UNAB)** · Facultad de Ingeniería · Programa de Ingeniería de Sistemas · Bucaramanga, Santander, Colombia · 2026

## Referencias

- Norman et al. (2024). Dual process models of clinical reasoning. *Journal of Evaluation in Clinical Practice*.
- Hornos et al. (2024). Reliability and validity of an online clinical reasoning simulator. *Medical Teacher*.
- Cook et al. (2025). Virtual patients using large language models. *JMIR*.
- Savage et al. (2024). Diagnostic reasoning prompts for LLM interpretability. *npj Digital Medicine*.
- Kononowicz et al. (2019). Virtual patient simulations: Systematic review. *JMIR*.

## Licencia

Este proyecto está licenciado bajo la **GNU General Public License v3.0**. Cualquier derivación debe mantenerse de acceso abierto bajo los mismos términos. Ver [LICENSE](./LICENSE).

<div align="center">

**Clerkship UNAB** · Universidad Autónoma de Bucaramanga · 2026
Proyecto de Grado — Ingeniería de Sistemas · GPL-3.0

</div>
