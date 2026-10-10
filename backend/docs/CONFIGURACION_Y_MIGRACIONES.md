# Módulo de cursos: configuración, límites y migraciones

Lo que agregaron las fases 0 a 8 de "Mis cursos". Los nombres y valores salen de
`backend/flask-api/app/config.py`; la plantilla para copiar es `backend/flask-api/.env.example`.

## 1. Variables de entorno nuevas

Todas son opcionales salvo las de R2: si no se definen, rige el valor predeterminado.

| Variable | Predeterminado | Para qué sirve |
|---|---|---|
| `JWT_ACCESS_TOKEN_EXPIRES_MINUTES` | `15` | Vida del access token (viaja en cada petición). |
| `JWT_REFRESH_TOKEN_EXPIRES_DAYS` | `7` | Vida del refresh token (solo renueva el access; se revoca al cerrar sesión). |
| `CORS_ORIGINS` | `http://localhost:5173` | Orígenes del frontend, separados por coma, completos (esquema + host + puerto). `*` se ignora. |
| `RATELIMIT_STORAGE_URI` | `memory://` | Dónde vive el contador de límites. En memoria solo sirve con un proceso; con varias instancias, `redis://…`. |
| `TRUST_PROXY` | sin definir | `1` detrás de un proxy (Cloud Run), para limitar por la IP real del cliente y no por la del proxy. |
| `R2_ENDPOINT_URL`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | sin definir | Almacenamiento de materiales, entregas y portadas. Si falta alguna, las subidas responden 503. |
| `R2_PUBLIC_BASE_URL` | sin definir | Dominio público del bucket para servir portadas sin firmar. Vacío: URL firmada de 1 hora. |
| `ASSIGNMENT_MAX_FILE_MB` | `10` | Tope de tamaño por archivo de una entrega. |
| `ASSIGNMENT_MAX_FILES` | `5` | Tope de archivos por entrega. |
| `ASSIGNMENT_MAX_TOTAL_MB` | `20` | Tope de la suma de archivos de una entrega. |
| `COURSE_COVER_MAX_MB` | `2` | Tope de tamaño de la imagen de portada. |
| `QUIZ_GRACE_SECONDS` | `30` | Tolerancia tras vencer el tiempo de un cuestionario. |
| `QUIZ_LATE_POLICY` | `GRADE_SAVED` | Entrega de quiz fuera de tiempo: `GRADE_SAVED` califica lo ya guardado, `REJECT` la rechaza. |
| `CRON_SECRET` | sin definir | Secreto de `POST /api/notificaciones/recordatorios` (cabecera `X-Cron-Secret`). Vacío: la ruta responde 404. |

Los tres topes `ASSIGNMENT_*` son el máximo de la plataforma: el docente configura cada tarea
por debajo de ellos, nunca por encima.

## 2. Límites configurables

### Por variable de entorno
Los de la tabla anterior.

### Límites de peticiones — `app/services/limites.py`
Se cuentan por usuario cuando hay sesión y por IP cuando no la hay. Para cambiarlos se edita la constante.

| Constante | Valor | Dónde aplica |
|---|---|---|
| `LOGIN_POR_IP` | 10 por minuto; 60 por hora | Inicio de sesión, por IP. |
| `LOGIN_POR_CUENTA` | 5 por minuto; 20 por hora | Inicio de sesión, por cuenta. |
| `REFRESH` | 30 por minuto | Renovar el access token. |
| `MATRICULA` | 10 por minuto; 40 por hora | Matricularse con código. |
| `SUBIDA_MATERIAL` | 20 por minuto; 120 por hora | Subir material al curso. |
| `SUBIDA_PORTADA` | 10 por minuto; 30 por hora | Subir la portada. |
| `ENTREGA` | 6 por minuto; 30 por hora | Entregar una tarea. |
| `INICIO_QUIZ` | 10 por minuto; 60 por hora | Iniciar un intento de cuestionario. |

Escritos en la propia ruta: registro y recuperación de contraseña (5 por hora), restablecer contraseña
(10 por minuto), `POST /api/email/notificar` (20 por hora) y los formularios de validación (20 por hora).
Al superar un límite la respuesta es 429.

### Constantes en el código

| Qué | Valor | Dónde |
|---|---|---|
| Paginación | 20 por página, máximo 100 | `services/paginacion.py` |
| Portada | sale en WebP 1200×600 y miniatura 400×200; entrada de hasta 8000 px de lado y 40 megapíxeles | `services/portadas.py` |
| ZIP entregado | hasta 2000 entradas y 500 MB descomprimido | `services/archivos.py` |
| Extensiones nunca aceptadas | lista `EXTENSIONES_PELIGROSAS` | `services/archivos.py` |
| Tarea sin configurar | 1 archivo; pdf, Office e imágenes | `services/tareas.py` |
| Recordatorio de vencimiento | 24 horas antes del cierre | `services/notificaciones.py` |
| Reintentos de borrado en R2 | 10 | `services/limpieza_r2.py` |

## 3. Tareas programadas

Ninguna se ejecuta sola: hay que programarlas.

| Comando (desde `backend/flask-api`) | Frecuencia sugerida | Qué hace |
|---|---|---|
| `flask notificar-vencimientos` | cada hora | Avisa a quien no ha entregado una tarea que cierra en 24 h. Equivale a `POST /api/notificaciones/recordatorios` con `X-Cron-Secret`. |
| `flask limpiar-archivos` | diaria | Reintenta borrar de R2 los archivos que quedaron pendientes. |
| `flask limpiar-tokens` | diaria | Quita de la lista de revocación los tokens que ya vencieron. |

## 4. Migraciones, en orden

La base de Supabase ya está en `fase7_funcionalidades` (la última). Esto es para una base nueva o una copia.

Cada fase existe dos veces, con el mismo efecto. Se aplica **una** de las dos formas, no ambas.

| Orden | Revisión de Alembic | SQL equivalente (`backend/database/migrations/`) |
|---|---|---|
| 1 | `fase0_cursos` | `2026-10-08e_fase0_cimientos_cursos.sql` |
| 2 | `fase1_matricula` | `2026-10-08f_fase1_matricula_segura.sql` |
| 3 | `fase2_concurrencia` | `2026-10-09_fase2_concurrencia.sql` |
| 4 | `fase3_tareas` | `2026-10-09b_fase3_tareas.sql` |
| 5 | `fase4_portadas` | `2026-10-09c_fase4_portadas.sql` |
| 6 | `fase5_rendimiento` | `2026-10-10_fase5_rendimiento.sql` |
| 7 | `fase6_seguridad` | `2026-10-10b_fase6_seguridad.sql` |
| 8 | `fase7_funcionalidades` | `2026-10-11_fase7_funcionalidades.sql` |

La fase 8 no cambia la base.

**Requisito previo.** `fase0_cursos` parte de una base que ya tiene las tablas de cursos: antes van los
SQL anteriores de la misma carpeta, en orden de nombre (de `2026-10-04_…` a `2026-10-08d_…`).

**Forma A — Alembic** (desde `backend/flask-api`, con `DATABASE_URL` definido):

```bash
alembic current          # en qué revisión está la base
alembic upgrade head     # aplica todas las que falten, en orden
```

Para avanzar de a una: `alembic upgrade fase3_tareas`.

**Forma B — SQL a mano**: ejecutar los archivos de la tabla en ese orden (son idempotentes) y luego
dejar constancia en Alembic de que ya están aplicados:

```bash
alembic stamp fase7_funcionalidades
```

No ejecutar `alembic downgrade base` contra una base con datos: borra columnas y tablas de las fases.

## 5. Pruebas

```bash
cd backend/flask-api
./venv/Scripts/python.exe -m pytest -q                               # toda la suite
./venv/Scripts/python.exe -m pytest -q tests/test_fase8_checklist.py # checklist final
python scripts/tabla_endpoints.py --escribir                         # regenera docs/ENDPOINTS_SEGURIDAD.md
python scripts/prueba_concurrencia.py --help                         # peticiones en paralelo contra un servidor real
```

La suite no toca ninguna base real. `test_fase8_checklist.py` falla si aparece una ruta sin rol o sin
validación de propiedad, o si `ENDPOINTS_SEGURIDAD.md` queda desactualizado.
