# Contexto: Base de Datos (PostgreSQL / Supabase + MongoDB Atlas)

> Este documento resume la revisión del esquema actual en `pruebas/db/`, las decisiones ya confirmadas con el equipo, y lo que queda pendiente por definir/implementar. Es solo documentación — no se modificó ningún archivo SQL/JS al escribir esto.

## Arquitectura de datos

- **PostgreSQL → Supabase**: datos estructurados y relacionales (usuarios, cursos, matrículas, consultas/simulaciones, evaluaciones resumidas, biblioteca de artículos).
- **MongoDB → MongoDB Atlas**: contenido no estructurado / de tamaño variable de cada simulación clínica (chat, viñeta del caso, evaluación detallada de la IA).
- **Backend**: Flask (independiente de este frontend, se está construyendo en paralelo). Es quien habla con ambas bases de datos.
- **Puente entre las dos bases**: `consultations.id` (Postgres, UUID) == `consultation_id` (Mongo, indexado único).

## Autenticación — DECIDIDO

El login real lo maneja **Flask directamente contra `users.password_hash`**, no Supabase Auth (`auth.users`).

Implicaciones:
- El esquema actual de `01-users.sql` ya es correcto tal cual está, no se necesita migrar a `auth.users` + `profiles`.
- **RLS (Row Level Security) no es obligatorio** mientras el único cliente que toque Postgres sea el backend Flask con una connection string directa (no a través de la capa REST/PostgREST de Supabase). Si en el futuro el frontend llega a hablar directo con Supabase (como hoy pasa con Firebase), esto hay que revisarlo de nuevo.
- Supabase se usa aquí solo como *Postgres administrado* (hosting + backups + panel), no como plataforma de Auth.

## Esquema de PostgreSQL — estado actual

| Archivo | Tabla | Notas |
|---|---|---|
| `00-extensions.sql` | — | `uuid-ossp` |
| `01-users.sql` | `users` | id, nombre, apellido, email único, `password_hash`, `role` ENUM (`STUDENT`/`TEACHER`), timestamps |
| `02-students.sql` | `students` | 1:1 con `users`, código, semestre |
| `03-teachers.sql` | `teachers` | 1:1 con `users`, departamento |
| `04-courses.sql` | `courses` | FK a `teachers` |
| `05-students_courses.sql` | `student_courses` | tabla puente estudiante↔curso, PK compuesta |
| `06-consultations.sql` | `consultations` | simulación de un estudiante: curso, especialidad, dificultad ENUM, estado ENUM, score |
| `07-ai_evaluations.sql` | `ai_evaluations` | 1:1 con `consultations`, score final + resumen corto + tiempo de ejecución |
| `08-articles.sql` | `articles` | biblioteca médica |
| `09-triggers.sql` | — | trigger genérico `updated_at` en `users`, `courses`, `articles` |

### Pendientes técnicos detectados (no bloqueantes, pero a resolver antes de producción)

1. **Índices de FK faltantes**: Postgres no indexa automáticamente columnas FK (solo PK). Faltan índices explícitos en `courses.teacher_id`, `consultations.student_id`, `consultations.course_id`.
2. **`consultations` sin `ON DELETE`**: sus FKs a `students`/`courses` no especifican regla de borrado (Postgres usa `NO ACTION` por defecto), a diferencia del resto del esquema que usa `CASCADE` consistentemente. Hay que decidir si de verdad se quiere bloquear el borrado de un estudiante/curso con consultas asociadas, o si debería cascadear/anular igual que las demás tablas.
3. **`ai_evaluations` sin `updated_at`/trigger**: puede ser intencional (registro inmutable una vez generado), pero conviene confirmarlo explícitamente en vez de que sea una omisión.
4. **`articles` sin autoría**: no tiene `created_by`/`uploaded_by` — no queda registro de qué profesor sube cada artículo.
5. **Rol `role` ENUM incompleto para el negocio real**: solo contempla `STUDENT`/`TEACHER`. Si los "directores de proyecto" (hoy solo cuentas Firebase internas para el módulo de desarrollo) también necesitan existir como rol dentro del dashboard clínico real, falta agregarlo al ENUM.

## Esquema de MongoDB — pendiente de implementar

Hoy `01-init.js` solo crea la colección `consultations` y 3 índices (`consultation_id` único, `status`, `case.specialty`), **pero nunca define la forma del documento**. El equipo confirmó que el documento debe incluir:

- Historial del chat con la IA (conversación completa de la simulación).
- Viñeta del caso clínico completo (paciente simulado).
- Evaluación detallada de la IA (más allá del resumen corto que vive en `ai_evaluations.feedback_summary` en Postgres).

### Propuesta de estructura de documento (a validar con el equipo antes de implementar)

```jsonc
{
  "_id": ObjectId("..."),
  "consultation_id": "uuid-de-postgres-consultations.id",  // puente con Postgres
  "status": "IN_PROGRESS",   // duplicado/desnormalizado desde Postgres a propósito,
                              // para que el índice idx_status sirva sin tener que
                              // hacer join con Postgres en cada consulta

  "case": {
    "specialty": "Gastroenterología",
    "title": "Dolor abdominal urente y sangrado digestivo alto",
    "difficulty": "MEDIUM",
    "patient": {
      "age": 54,
      "sex": "M",
      "chief_complaint": "Dolor epigástrico urente de 3 días de evolución",
      "history": "...",
      "vitals": { "hr": 88, "bp": "120/80", "temp": 36.8 },
      "labs": [ /* resultados de laboratorio disponibles en el caso, si aplica */ ]
    },
    "vignette_text": "Texto completo de la viñeta clínica presentada al estudiante."
  },

  "chat_history": [
    {
      "role": "student" | "ai_patient" | "ai_tutor",
      "content": "Texto del mensaje",
      "type": "text" | "order_solicitada" | "diagnostico_propuesto",
      "timestamp": ISODate("...")
    }
  ],

  "ai_evaluation": {
    "final_score": 87.5,             // debe coincidir con ai_evaluations.final_score en Postgres
    "criteria_scores": {
      "anamnesis": 90,
      "diagnostico_diferencial": 85,
      "razonamiento_clinico": 88,
      "plan_de_manejo": 85
    },
    "strengths": ["..."],
    "areas_to_improve": ["..."],
    "detailed_feedback": "Texto largo de retroalimentación, la versión extendida del feedback_summary corto de Postgres."
  },

  "created_at": ISODate("..."),
  "updated_at": ISODate("...")
}
```

División de responsabilidad Postgres ↔ Mongo:
- **Postgres** guarda lo que se necesita para *listar, filtrar y reportar* rápido (quién, cuándo, score final, estado) — datos pequeños y de forma fija.
- **Mongo** guarda el *contenido* de cada simulación (chat completo, viñeta, evaluación detallada) — datos grandes y de forma variable entre casos.

### Pendientes técnicos en Mongo

1. Definir el documento real arriba propuesto con `$jsonSchema` validator en la colección (Mongo permite validación de esquema aunque sea NoSQL), para no depender solo de disciplina del backend.
2. Decidir si `status` se desnormaliza en Mongo (como en la propuesta) o si toda lectura de estado pasa siempre por Postgres — afecta si el índice `idx_status` sigue teniendo sentido.
3. Índice adicional a considerar: `chat_history.timestamp` si en algún momento se pagina/busca dentro del historial de una consulta muy larga.

## Infraestructura pendiente (no relacionada al modelo de datos, pero necesaria para trabajar)

- No existe `docker-compose.yml` para levantar Postgres + Mongo en local antes de migrar a Supabase/Atlas.
- No existe `.env.example` con las variables de conexión (`DATABASE_URL` de Supabase, `MONGODB_URI` de Atlas).
- No hay capa de conexión/ORM todavía (SQLAlchemy, motor de Mongo, etc.) — corresponde al repo del backend Flask, no a este frontend.
- No hay scripts de seed/datos de prueba.

## Resumen de decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Quién maneja login? | Flask + `users.password_hash` propio (no Supabase Auth) |
| ¿RLS obligatorio? | No, mientras solo Flask toque Postgres directamente |
| ¿Qué va en el documento de Mongo? | Chat con la IA + viñeta del caso + evaluación detallada de la IA |
