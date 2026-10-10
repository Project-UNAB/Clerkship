# Endpoints: rol requerido y validación de propiedad

Generado por `backend/flask-api/scripts/tabla_endpoints.py` a partir del código. No editar a mano:
`python scripts/tabla_endpoints.py --escribir` lo regenera, y `tests/test_fase8_checklist.py` falla si queda
desactualizado o si aparece una ruta sin control.

- **Rol**: lo que exige el decorador de la ruta (`role_required` / `jwt_required`). Además, en cada petición
  con sesión se comprueba contra la base que la cuenta siga activa, que el token no esté revocado y que el
  rol del token sea el rol actual del usuario.
- **Propiedad**: cómo se comprueba que el recurso de la URL le pertenece a quien lo pide.

Total: **169** rutas — 138 con rol y propiedad, 13 con sesión pero sin restricción por dueño (a propósito), 18 públicas, **0 sin control**.

## Públicas a propósito

| Método | Ruta | Rol | Propiedad | Nota |
|---|---|---|---|---|
| GET | `/api` | Pública | — | Swagger UI. Solo se registra fuera de producción. |
| POST | `/api/auth/forgot-password` | Pública | — | Pedir el código de recuperación. Limitado a 5 por hora; no revela si el correo existe. |
| POST | `/api/auth/login` | Pública | Solo datos del propio usuario | Iniciar sesión. Limitado por IP y por cuenta. |
| POST | `/api/auth/register` | Pública | Solo datos del propio usuario | Crear la cuenta. Limitado a 5 por hora por IP. |
| POST | `/api/auth/resend-code` | Pública | Solo datos del propio usuario | Reenviar el código de verificación (con espera entre envíos). |
| POST | `/api/auth/reset-password` | Pública | Solo datos del propio usuario | Cambiar la contraseña con el código de recuperación. Limitado a 10 por minuto. |
| GET | `/api/docs` | Pública | — | Swagger UI. Solo se registra fuera de producción. |
| GET | `/api/email/status` | Pública | — | Dice si el servicio de correo está configurado y con qué remitente (el mismo que se ve en cualquier correo enviado). |
| GET | `/api/health` | Pública | — | Chequeo de salud para el balanceador; no devuelve datos de usuarios ni detalles de errores. |
| POST | `/api/notificaciones/recordatorios` | Pública | — | Para un programador de tareas: exige la cabecera X-Cron-Secret; sin CRON_SECRET configurado responde 404. |
| GET | `/api/openapi.json` | Pública | — | Especificación de la API. Solo se registra fuera de producción. |
| GET | `/api/openapi.yaml` | Pública | — | Especificación de la API. Solo se registra fuera de producción. |
| POST | `/api/validacion/biblioteca` | Pública | — | Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP. |
| POST | `/api/validacion/casos` | Pública | — | Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP. |
| POST | `/api/validacion/historial` | Pública | — | Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP. |
| POST | `/api/validacion/inicio` | Pública | — | Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP. |
| GET | `/docs` | Pública | — | Swagger UI. Solo se registra fuera de producción. |
| GET | `/simulador` | Pública | — | Consola de desarrollo del simulador. Solo se registra en development y testing. |

## Con sesión, sin restricción por dueño (a propósito)

| Método | Ruta | Rol | Propiedad | Nota |
|---|---|---|---|---|
| POST | `/api/agentes/caso` | Cualquiera con sesión | Ninguna (a propósito) | Agente de IA sin estado: genera un caso y no lee ni guarda datos de nadie. PENDIENTE: no tiene límite de peticiones y cada llamada consume cuota del proveedor de IA. |
| POST | `/api/agentes/evaluar` | Cualquiera con sesión | Ninguna (a propósito) | Agente de IA sin estado: evalúa la sesión que va en la petición. PENDIENTE: sin límite de peticiones. |
| POST | `/api/agentes/paciente/chat` | Cualquiera con sesión | Ninguna (a propósito) | Agente de IA sin estado: responde sobre el caso que va en la petición. PENDIENTE: sin límite de peticiones. |
| GET | `/api/almacenamiento/biblioteca/<article_id>/descarga` | Cualquiera con sesión | Ninguna (a propósito) | PDF de un artículo publicado en la biblioteca, visible para cualquier usuario con sesión. |
| GET | `/api/articulos` | Cualquiera con sesión | Ninguna (a propósito) | Biblioteca: artículos publicados, visibles para cualquier usuario con sesión. |
| GET | `/api/articulos/<article_id>` | Cualquiera con sesión | Ninguna (a propósito) | Biblioteca: artículo publicado, visible para cualquier usuario con sesión. |
| GET | `/api/comunidad/posts` | Cualquiera con sesión | Ninguna (a propósito) | Muro de la comunidad: publicaciones visibles para cualquier usuario con sesión. |
| GET | `/api/comunidad/posts/<post_id>/comentarios` | Cualquiera con sesión | Ninguna (a propósito) | Comentarios de una publicación de la comunidad; trae nombre del autor, no su correo. |
| GET | `/api/consultas/ficha-previa` | STUDENT | Ninguna (a propósito) | Genera una identidad de paciente ficticia al azar; no lee datos guardados. |
| GET | `/api/cursos` | Cualquiera con sesión | Ninguna (a propósito) | Catálogo para «Unirme a un curso»: nombre, descripción y docente. El código de matrícula no sale acá. |
| GET | `/api/cursos/<course_id>` | Cualquiera con sesión | Ninguna (a propósito) | Ficha pública del curso (lo mismo que el catálogo). El contenido, el roster y las notas sí exigen matrícula o ser el dueño. |
| GET | `/api/cursos/opciones-tarea` | Cualquiera con sesión | Ninguna (a propósito) | Constantes del servidor (extensiones soportadas y topes); no son datos de nadie. |
| GET | `/api/usuarios/buscar` | Cualquiera con sesión | Ninguna (a propósito) | Buscador de usuarios por nombre de usuario: devuelve nombre y rol, nunca el correo. |

## Con rol y propiedad — admin

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/admin/auditoria` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/biblioteca` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| DELETE | `/api/admin/biblioteca/<article_id>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| DELETE | `/api/admin/comunidad/comentarios/<comentario_id>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/comunidad/posts` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| DELETE | `/api/admin/comunidad/posts/<post_id>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/estadisticas` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/feedback/<pestana>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/tokens` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/usuarios` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| PATCH | `/api/admin/usuarios/<user_id>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |
| GET | `/api/admin/validacion/<pestana>` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |

## Con rol y propiedad — almacenamiento

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/almacenamiento/archivos` | Cualquiera con sesión | Solo datos del propio usuario |
| DELETE | `/api/almacenamiento/archivos/<file_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/almacenamiento/archivos/<file_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/almacenamiento/archivos/<file_id>/descarga` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/almacenamiento/archivos/<file_id>/publicar` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/almacenamiento/subidas` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/almacenamiento/subidas/<file_id>/confirmar` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/almacenamiento/uso` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — articulos

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/articulos` | TEACHER o ADMIN | Solo datos del propio usuario |
| DELETE | `/api/articulos/<article_id>/estante` | STUDENT | Solo datos del propio usuario |
| POST | `/api/articulos/<article_id>/estante` | STUDENT | Solo datos del propio usuario |
| GET | `/api/articulos/estante` | STUDENT | Solo datos del propio usuario |

## Con rol y propiedad — auth

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/auth/avatar` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/auth/change-password` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/auth/logout` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/auth/logout-all` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/auth/me` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/auth/refresh` | Cualquiera (refresh token) | Solo datos del propio usuario |
| POST | `/api/auth/verify-email` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — comunidad

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/comunidad/posts` | Cualquiera con sesión | Solo datos del propio usuario |
| DELETE | `/api/comunidad/posts/<post_id>` | Cualquiera con sesión | Autor del recurso (o administrador) |
| POST | `/api/comunidad/posts/<post_id>/comentarios` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/comunidad/posts/<post_id>/like` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — consultas

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/consultas` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/consultas` | STUDENT | Solo datos del propio usuario |
| DELETE | `/api/consultas/<string:consultation_id>` | STUDENT | Solo datos del propio usuario |
| GET | `/api/consultas/<string:consultation_id>` | Cualquiera con sesión | Dueño de la consulta, o docente del curso al que pertenece |
| PATCH | `/api/consultas/<string:consultation_id>` | STUDENT | Solo datos del propio usuario |
| POST | `/api/consultas/<string:consultation_id>/explorar` | STUDENT | Solo datos del propio usuario |
| PATCH | `/api/consultas/<string:consultation_id>/finalizar` | STUDENT | Solo datos del propio usuario |
| POST | `/api/consultas/<string:consultation_id>/mensajes` | STUDENT | Solo datos del propio usuario |

## Con rol y propiedad — curso_avisos

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/cursos/<course_id>/avisos` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| POST | `/api/cursos/<course_id>/avisos` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/avisos/<announcement_id>` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>/avisos/<announcement_id>` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/avisos/<announcement_id>/comentarios` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| POST | `/api/cursos/<course_id>/avisos/<announcement_id>/comentarios` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| DELETE | `/api/cursos/<course_id>/avisos/<announcement_id>/comentarios/<comment_id>` | Cualquiera con sesión | Autor del comentario, o docente dueño del curso |

## Con rol y propiedad — curso_calificaciones

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/cursos/<course_id>/calificaciones` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/calificaciones/exportar` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/calificaciones/mias` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — curso_contenido

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/cursos/<course_id>/bloques` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| POST | `/api/cursos/<course_id>/bloques` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/bloques/<block_id>` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>/bloques/<block_id>` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| PATCH | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/archivo` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/descarga` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas` | Cualquiera con sesión | Estudiante matriculado en el curso |
| DELETE | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/archivo` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/archivos/<file_id>/descarga` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/descarga` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/<submission_id>/restaurar` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/entregas/mia` | Cualquiera con sesión | Estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/vista-previa` | Cualquiera con sesión | Docente dueño o estudiante matriculado en el curso |

## Con rol y propiedad — curso_quiz

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos` | Cualquiera con sesión | Docente dueño del curso (ve todos) o estudiante matriculado (ve solo los suyos) |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos` | Cualquiera con sesión | Estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>` | Cualquiera con sesión | Docente dueño del curso, o estudiante matriculado que además es el dueño del intento |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>/responder` | Cualquiera con sesión | Estudiante matriculado en el curso |
| PUT | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>/respuestas` | Cualquiera con sesión | Estudiante matriculado en el curso |
| GET | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas/<question_id>` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/preguntas/<question_id>` | TEACHER | Docente dueño del curso |

## Con rol y propiedad — cursos

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/cursos` | TEACHER | No aplica: el curso nuevo queda a nombre del docente de la sesión |
| DELETE | `/api/cursos/<course_id>` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/cover` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/estudiantes` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/estudiantes` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/estudiantes/<student_id>` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/matricula` | TEACHER | Docente dueño del curso |
| PATCH | `/api/cursos/<course_id>/matricula` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/matricula/codigo` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/matricula/codigo` | TEACHER | Docente dueño del curso |
| DELETE | `/api/cursos/<course_id>/matricular` | STUDENT | Solo datos del propio usuario |
| POST | `/api/cursos/<course_id>/matricular` | STUDENT | Solo datos del propio usuario |
| DELETE | `/api/cursos/<course_id>/permanente` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/restaurar` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/<course_id>/solicitudes` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/solicitudes/<request_id>/aprobar` | TEACHER | Docente dueño del curso |
| POST | `/api/cursos/<course_id>/solicitudes/<request_id>/rechazar` | TEACHER | Docente dueño del curso |
| GET | `/api/cursos/mios` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/cursos/mis-fechas` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/cursos/mis-solicitudes` | STUDENT | Solo datos del propio usuario |
| GET | `/api/cursos/papelera` | TEACHER | Solo datos del propio usuario |

## Con rol y propiedad — documentos

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/documentos/archivos` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/documentos/archivos` | Cualquiera con sesión | Solo datos del propio usuario |
| DELETE | `/api/documentos/archivos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/archivos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/documentos/archivos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/archivos/<document_id>/vista-previa` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/carpetas` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/documentos/carpetas` | Cualquiera con sesión | Solo datos del propio usuario |
| DELETE | `/api/documentos/carpetas/<folder_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/documentos/carpetas/<folder_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/documentos` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/documentos/documentos` | Cualquiera con sesión | Solo datos del propio usuario |
| DELETE | `/api/documentos/documentos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/documentos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/documentos/documentos/<document_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/documentos/documentos/<document_id>/vista-previa` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — email

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/email/notificar` | ADMIN | No aplica: el rol ADMIN administra toda la plataforma |

## Con rol y propiedad — feedback

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| POST | `/api/feedback/biblioteca` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/feedback/casos` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/feedback/historial` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/feedback/inicio` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — historial

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/historial` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/historial/<string:consultation_id>/retroalimentacion` | Cualquiera con sesión | Dueño de la consulta, o docente del curso al que pertenece |
| GET | `/api/historial/estadisticas` | STUDENT | Solo datos del propio usuario |
| GET | `/api/historial/recomendacion` | STUDENT | Solo datos del propio usuario |

## Con rol y propiedad — notificaciones

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/notificaciones` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/notificaciones/<notification_id>/leer` | Cualquiera con sesión | Solo datos del propio usuario |
| POST | `/api/notificaciones/leer-todas` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/notificaciones/no-leidas` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/notificaciones/preferencias` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/notificaciones/preferencias` | Cualquiera con sesión | Solo datos del propio usuario |

## Con rol y propiedad — usuarios

| Método | Ruta | Rol | Propiedad |
|---|---|---|---|
| GET | `/api/usuarios/<user_id>` | Cualquiera con sesión | Solo datos del propio usuario |
| PATCH | `/api/usuarios/me` | Cualquiera con sesión | Solo datos del propio usuario |
| GET | `/api/usuarios/uso-almacenamiento` | Cualquiera con sesión | Solo datos del propio usuario |
