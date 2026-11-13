# Clerkship UNAB

> **Prototipo clínico basado en inteligencia artificial para entrenar y evaluar el razonamiento clínico**

[![Licencia: GPL v3](https://img.shields.io/badge/Licencia-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Estado](https://img.shields.io/badge/Estado-En%20desarrollo-yellow.svg)]()
[![TRL](https://img.shields.io/badge/TRL%20objetivo-4-orange.svg)]()
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?logo=react)]()
[![Node.js](https://img.shields.io/badge/Backend-Node.js-339933?logo=node.js)]()

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/circle-info.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/circle-info.svg?color=%23374151" width="22" alt=""/></picture> Descripción

**Clerkship UNAB** es una plataforma web interactiva que entrena y evalúa el **proceso de razonamiento clínico-diagnóstico** en estudiantes de ciencias de la salud, a través de la resolución guiada de casos clínicos simulados con retroalimentación formativa generada por inteligencia artificial.

A diferencia de los simuladores clínicos existentes (BodyInteract, Shadow Health, e-Clinic), este sistema no evalúa únicamente el diagnóstico final correcto o incorrecto. Evalúa y retroalimenta **cada decisión intermedia del estudiante**: qué hipótesis formuló, cuándo las descartó, qué pruebas solicitó y por qué, y qué sesgos cognitivos emergieron durante el proceso diagnóstico.

El sistema está fundamentado en la **teoría del procesamiento dual** (Norman et al., 2024) y en el modelo pedagógico de **Practicum Script** (Hornos et al., 2024), e implementa técnicas de **ingeniería de prompts Chain-of-Thought** y **arquitectura RAG** para garantizar la pertinencia clínica y reducir el riesgo de alucinaciones del modelo de lenguaje.

En esta fase, los casos clínicos se enfocan exclusivamente en el **sistema gastrointestinal**, dominio seleccionado como área de validación del prototipo.

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/bullseye.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/bullseye.svg?color=%23374151" width="22" alt=""/></picture> Problema que resuelve

El razonamiento clínico es la competencia más crítica en la formación médica y, paradójicamente, la menos enseñada de forma explícita. En Colombia:

- Los estudiantes reciben en promedio **6.4 horas** de enseñanza dedicada a razonamiento clínico durante toda su formación (Kononowicz et al., 2020)
- Los factores cognitivos están presentes en el **75% de los errores diagnósticos** (Hunter et al., 2024)
- La Ley 100 de 1993 ha reducido el tiempo disponible para retroalimentación clínica individualizada en hospitales universitarios
- Las plataformas existentes están en inglés, son comerciales y evalúan solo el resultado final

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/star.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/star.svg?color=%23374151" width="22" alt=""/></picture> Características principales

| Característica | Clerkship UNAB | BodyInteract | Shadow Health | e-Clinic (Rosario) |
|---|:---:|:---:|:---:|:---:|
| Idioma español | ✅ | ❌ | ❌ | ✅ |
| Retroalimentación del proceso | ✅ | ❌ | ❌ | ❌ |
| IA generativa (LLM) | ✅ | ❌ | ❌ | ❌ |
| Casos dinámicos/adaptativos | ✅ | ❌ | ❌ | ❌ |
| Detección de sesgos cognitivos | ✅ | ❌ | ❌ | ❌ |
| Contexto latinoamericano | ✅ | ❌ | ❌ | Parcial |
| Acceso libre para pregrado | ✅ | ❌ | ❌ | Institucional |

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/diagram-project.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/diagram-project.svg?color=%23374151" width="22" alt=""/></picture> Arquitectura del sistema

```
clerkship-unab/
├── frontend/          # React 18 + TypeScript + Tailwind CSS
│   └── src/
│       ├── pages/     # 13 pantallas organizadas por módulo
│       ├── components/# UI, layout, case, chat, feedback
│       ├── hooks/     # useAuth, useCaseSession, useLLM...
│       ├── context/   # AuthContext, CaseSessionContext
│       └── services/  # Comunicación con backend
│
└── backend/           # Node.js + Express
    └── src/
        ├── routes/    # auth, cases, llm, feedback
        ├── services/  # llm.service, rag.service, prompt.service
        ├── prompts/   # Templates Chain-of-Thought por módulo
        └── models/    # User, CaseSession, Decision, Feedback
```

**Flujo del sistema:**

```
Estudiante → Presentación del caso (LLM generativo)
           → Chat con paciente virtual (LLM como paciente estandarizado)
           → Solicitud de pruebas (resultados simulados)
           → Diagnóstico diferencial (razonamiento probabilístico)
           → Diagnóstico final + argumentación
           → Retroalimentación formativa del proceso (LLM + CoT)
           → Comparación con razonamiento de referencia
           → Resumen de sesión con puntaje por dominio
```

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/display.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/display.svg?color=%23374151" width="22" alt=""/></picture> Pantallas del sistema

### Módulo público
- `LandingPage` — Presentación del sistema, alcance, tecnología, equipo

### Módulo Auth
- `LoginPage` — Ingreso con correo institucional
- `ConsentPage` — Consentimiento informado (Decreto 1377/2013)

### Módulo Principal
- `DashboardPage` — Estadísticas, historial, acceso a nuevos casos

### Módulo Simulación — TRL 3
- `CasePresentationPage` — Viñeta clínica generada por LLM
- `PatientChatPage` — Conversación con paciente virtual

### Módulo Simulación — TRL 4
- `DiagnosticTestsPage` — Solicitud y justificación de exámenes
- `DifferentialDiagnosisPage` — Hipótesis ordenadas por probabilidad
- `FinalDiagnosisPage` — Diagnóstico definitivo con argumentación

### Módulo Retroalimentación — TRL 4
- `ReasoningFeedbackPage` — Línea de tiempo de decisiones + sesgos detectados
- `ReferenceComparisonPage` — Tu razonamiento vs razonamiento de referencia
- `SessionSummaryPage` — Puntaje por dominio, gráfico radar, recomendaciones

### Módulo Perfil
- `ProfilePage` — Datos, historial completo, configuración

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/gears.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/gears.svg?color=%23374151" width="22" alt=""/></picture> Stack tecnológico

### Frontend
| Tecnología | Uso |
|---|---|
| React 18 + TypeScript | Framework principal |
| React Router v6 | Navegación entre pantallas |
| Tailwind CSS | Estilos y utilidades |
| Zustand | Estado global de la sesión clínica |
| React Query | Manejo de estados asíncronos con LLM |
| Axios | Comunicación con el backend |
| Framer Motion | Animaciones e indicadores de carga |

### Backend
| Tecnología | Uso |
|---|---|
| Node.js + Express | Servidor API REST |
| LLM API (multi-proveedor) | Motor de lenguaje para generación y retroalimentación |
| Arquitectura RAG | Fundamentación en contenido médico curado |
| Chain-of-Thought prompts | Razonamiento clínico estructurado |

### Despliegue
| Servicio | Uso |
|---|---|
| Vercel | Frontend |
| Render / Railway | Backend |

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/rocket.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/rocket.svg?color=%23374151" width="22" alt=""/></picture> Instalación y ejecución local

### Prerrequisitos
- Node.js 18+
- npm o yarn
- API key del proveedor LLM configurado

### Frontend

```bash
cd frontend
npm install
cp .env.example .env        # Configurar variables de entorno
npm run dev
```

### Backend

```bash
cd backend
npm install
cp .env.example .env        # Agregar API key del LLM
npm run dev
```

### Variables de entorno requeridas

```env
# frontend/.env
VITE_API_BASE_URL=http://localhost:3000

# backend/.env
LLM_API_KEY=your-api-key-here
JWT_SECRET=your-jwt-secret-here
DATABASE_URL=your-database-url-here
```

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/list-check.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/list-check.svg?color=%23374151" width="22" alt=""/></picture> Metodología de desarrollo

El proyecto sigue una metodología **iterativa-incremental con Scrum**, integrada con el ciclo **PHVA** y las fases del **PMBOK**, organizada en dos incrementos con nivel de madurez tecnológica (TRL) verificable:

| Incremento | TRL | Entregable |
|---|---|---|
| Incremento 1 | TRL 3 | Motor de generación de casos + chat con paciente virtual |
| Incremento 2 | TRL 4 | Módulo de decisiones diagnósticas + retroalimentación formativa integrados |

**Sprints:** 2–3 semanas de duración  
**Gestión:** Tableros Kanban  
**Revisión:** Validación técnica interna al cierre de cada incremento

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/chart-bar.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/chart-bar.svg?color=%23374151" width="22" alt=""/></picture> Variables de evaluación

El prototipo se evalúa sobre las siguientes métricas (ISO/IEC 25010):

| Variable | Indicador de éxito |
|---|---|
| Calidad de casos clínicos generados | Puntuación media ≥ 5.0/6.0 (Cook et al., 2025) |
| Calidad de retroalimentación formativa | Puntuación media ≥ 4.5/6.0 |
| Tiempo de respuesta del sistema | ≤ 5 s en el 90% de interacciones |
| Disponibilidad del sistema | ≥ 95% durante sesiones de prueba |
| Cobertura de dominios del razonamiento | 3 dominios presentes en ≥ 90% de los casos |
| Activación diferenciada Sistema 1 / Sistema 2 | ≥ 85% de los casos validados |

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/scale-balanced.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/scale-balanced.svg?color=%23374151" width="22" alt=""/></picture> Marco normativo

Este proyecto cumple con:

- **Ley 1581 de 2012** — Protección de datos personales en Colombia
- **Resolución 8430 de 1993** — Investigación sin riesgo (sin datos clínicos reales)
- **Decreto 1377 de 2013** — Consentimiento informado para tratamiento de datos
- **ISO/IEC 25010** — Calidad de sistemas y productos de software
- **ISO/IEC 27001** — Seguridad de la información
- **Política de propiedad intelectual UNAB (2021)**

> <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/triangle-exclamation.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/triangle-exclamation.svg?color=%23374151" width="14" alt=""/></picture> **Aviso de transparencia:** La retroalimentación generada por este sistema proviene de un modelo de inteligencia artificial y no sustituye el criterio de un docente o clínico. El sistema es una herramienta de entrenamiento supervisado.

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/users.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/users.svg?color=%23374151" width="22" alt=""/></picture> Equipo

### Autores

| Nombre | Rol |
|---|---|
| **Juan Camilo Rojas** | Agentes de IA & Arquitectura de IA |
| **Santiago Steven Arias Estupiñan** | Desarrollador Frontend & Conexión de Sistemas |
| **Camilo Andres Bueno Rey** | Desarrollador Backend & Conexión de Sistemas |

### Dirección académica

| Rol |
|---|
| Director del proyecto de grado |
| Co-Director del proyecto de grado |

### Institución

**Universidad Autónoma de Bucaramanga (UNAB)**  
Facultad de Ingeniería — Programa de Ingeniería de Sistemas  
Bucaramanga, Santander, Colombia — 2026

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/book-open.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/book-open.svg?color=%23374151" width="22" alt=""/></picture> Referencias clave

- Norman et al. (2024). Dual process models of clinical reasoning. *Journal of Evaluation in Clinical Practice*
- Hornos et al. (2024). Reliability and validity of an online clinical reasoning simulator. *Medical Teacher*
- Cook et al. (2025). Virtual patients using large language models. *JMIR*
- Savage et al. (2024). Diagnostic reasoning prompts for LLM interpretability. *npj Digital Medicine*
- Kononowicz et al. (2019). Virtual patient simulations: Systematic review. *JMIR*

---

## <picture><source media="(prefers-color-scheme: dark)" srcset="https://api.iconify.design/fa6-solid/file-contract.svg?color=%23e2e8f0"/><img src="https://api.iconify.design/fa6-solid/file-contract.svg?color=%23374151" width="22" alt=""/></picture> Licencia

Este proyecto está licenciado bajo la **GNU General Public License v3.0**.

Cualquier derivación de este software debe mantenerse de acceso abierto bajo los mismos términos, garantizando que no pueda ser apropiado de forma privativa o comercial. Esto protege el principio de equidad pedagógica que fundamenta el proyecto.

Ver el archivo [LICENSE](./LICENSE) para el texto completo.

---

<div align="center">

**Clerkship UNAB** · Universidad Autónoma de Bucaramanga · 2026  
Proyecto de Grado — Ingeniería de Sistemas · GPL-3.0

</div>
