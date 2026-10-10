"""Inventario de seguridad de los endpoints: para cada ruta, qué rol exige y
cómo comprueba que el recurso sea de quien lo pide.

Se saca del propio código (decoradores y cuerpo de cada vista), así que no se
desactualiza: tests/test_fase8_checklist.py lo corre y falla si aparece una
ruta sin autenticación que no esté en la lista de públicas, o una ruta con
sesión pero sin validación de propiedad que nadie haya justificado.

Uso (desde backend/flask-api):

    python scripts/tabla_endpoints.py            # imprime la tabla en Markdown
    python scripts/tabla_endpoints.py --escribir # regenera backend/docs/ENDPOINTS_SEGURIDAD.md
"""
import inspect
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

DESTINO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "ENDPOINTS_SEGURIDAD.md"))

# Rutas que a propósito no piden sesión, y por qué.
PUBLICAS = {
    "/api/health": "Chequeo de salud para el balanceador; no devuelve datos de usuarios ni detalles de errores.",
    "/api/auth/register": "Crear la cuenta. Limitado a 5 por hora por IP.",
    "/api/auth/login": "Iniciar sesión. Limitado por IP y por cuenta.",
    "/api/auth/resend-code": "Reenviar el código de verificación (con espera entre envíos).",
    "/api/auth/forgot-password": "Pedir el código de recuperación. Limitado a 5 por hora; no revela si el correo existe.",
    "/api/auth/reset-password": "Cambiar la contraseña con el código de recuperación. Limitado a 10 por minuto.",
    "/api/notificaciones/recordatorios": "Para un programador de tareas: exige la cabecera X-Cron-Secret; sin CRON_SECRET configurado responde 404.",
    "/api/docs": "Swagger UI. Solo se registra fuera de producción.",
    "/api": "Swagger UI. Solo se registra fuera de producción.",
    "/api/openapi.json": "Especificación de la API. Solo se registra fuera de producción.",
    "/api/openapi.yaml": "Especificación de la API. Solo se registra fuera de producción.",
    "/docs": "Swagger UI. Solo se registra fuera de producción.",
    "/simulador": "Consola de desarrollo del simulador. Solo se registra en development y testing.",
    "/api/email/status": "Dice si el servicio de correo está configurado y con qué remitente (el mismo que se ve en cualquier correo enviado).",
    "/api/validacion/inicio": "Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP.",
    "/api/validacion/casos": "Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP.",
    "/api/validacion/historial": "Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP.",
    "/api/validacion/biblioteca": "Formulario de validación por expertos, que no tienen cuenta. Solo escribe; 20 por hora por IP.",
}

# Qué comprobación de propiedad hace una vista, según lo que aparece en su código.
# El orden importa: gana la primera que coincida.
PROPIEDAD = [
    ("Docente dueño del curso", (
        r"_curso_del_docente\(", r"_curso_en_papelera\(", r"_entrega_para_docente\(", r"_resolver_solicitud\(",
        r"not _es_docente_dueno\(", r"teacher_id\) != str\(user\.id\)",
    )),
    ("Docente dueño o estudiante matriculado en el curso", (r"_puede_ver\(",)),
    ("Docente dueño del curso o estudiante autor de la entrega", (r"_archivo_de_entrega_o_error\(",)),
    ("Estudiante matriculado en el curso", (r"_es_estudiante_matriculado\(", r"_iniciar_intento\(", r"_matricula_bloqueada\(")),
    ("Dueño de la consulta, o docente del curso al que pertenece", (r"puede_ver_consulta\(", r"_consulta_del_usuario\(", r"_get_consultation_or_404\(")),
    ("Autor del recurso (o administrador)", (r"author_id\) != str\(", r"author_id != ", r"\.author_id\)? ?[!=]=")),
    ("Solo datos del propio usuario", (
        r"student_id ?== ?user\.id", r"student_id=user\.id", r"user_id=user\.id", r"owner_id", r"get_jwt_identity\(\)",
        r"current_user\.id", r"get_current_user\(\)\.id", r"== user\.id", r"=user\.id", r"user\.id",
        # El token de la propia petición (logout) y los campos del usuario de la sesión.
        r"get_jwt\(\)", r"user\.(first_name|last_name|email_notifications) = ",
        r"get_current_user\(\)\.email_notifications",
    )),
]

# Rutas con sesión que no restringen por dueño, revisadas una por una.
SIN_PROPIEDAD_JUSTIFICADO = {
    ("GET", "/api/cursos"): "Catálogo para «Unirme a un curso»: nombre, descripción y docente. El código de matrícula no sale acá.",
    ("GET", "/api/cursos/<course_id>"): "Ficha pública del curso (lo mismo que el catálogo). El contenido, el roster y las notas sí exigen matrícula o ser el dueño.",
    ("GET", "/api/cursos/opciones-tarea"): "Constantes del servidor (extensiones soportadas y topes); no son datos de nadie.",
    ("GET", "/api/usuarios/buscar"): "Buscador de usuarios por nombre de usuario: devuelve nombre y rol, nunca el correo.",
    ("GET", "/api/usuarios/<user_id>"): "Perfil público (nombre, rol, avatar); el correo solo se le devuelve al propio usuario.",
    ("GET", "/api/articulos"): "Biblioteca: artículos publicados, visibles para cualquier usuario con sesión.",
    ("GET", "/api/articulos/<article_id>"): "Biblioteca: artículo publicado, visible para cualquier usuario con sesión.",
    ("GET", "/api/almacenamiento/biblioteca/<article_id>/descarga"): "PDF de un artículo publicado en la biblioteca, visible para cualquier usuario con sesión.",
    ("GET", "/api/comunidad/posts"): "Muro de la comunidad: publicaciones visibles para cualquier usuario con sesión.",
    ("GET", "/api/comunidad/posts/<post_id>/comentarios"): "Comentarios de una publicación de la comunidad; trae nombre del autor, no su correo.",
    ("GET", "/api/consultas/ficha-previa"): "Genera una identidad de paciente ficticia al azar; no lee datos guardados.",
    ("POST", "/api/agentes/caso"): "Agente de IA sin estado: genera un caso y no lee ni guarda datos de nadie. PENDIENTE: no tiene límite de peticiones y cada llamada consume cuota del proveedor de IA.",
    ("POST", "/api/agentes/paciente/chat"): "Agente de IA sin estado: responde sobre el caso que va en la petición. PENDIENTE: sin límite de peticiones.",
    ("POST", "/api/agentes/evaluar"): "Agente de IA sin estado: evalúa la sesión que va en la petición. PENDIENTE: sin límite de peticiones.",
}

# Reglas que combinan dos condiciones y que la lectura automática del código
# resumiría mal: se escriben tal cual son.
PROPIEDAD_EXACTA = {
    ("GET", "/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos/<attempt_id>"):
        "Docente dueño del curso, o estudiante matriculado que además es el dueño del intento",
    ("GET", "/api/cursos/<course_id>/bloques/<block_id>/contenido/<item_id>/intentos"):
        "Docente dueño del curso (ve todos) o estudiante matriculado (ve solo los suyos)",
    ("DELETE", "/api/cursos/<course_id>/avisos/<announcement_id>/comentarios/<comment_id>"):
        "Autor del comentario, o docente dueño del curso",
    ("POST", "/api/cursos"): "No aplica: el curso nuevo queda a nombre del docente de la sesión",
}

ROLES_ADMIN = "ADMIN"


def _vista_original(vista):
    """La función de la vista sin sus decoradores."""
    while hasattr(vista, "__wrapped__"):
        vista = vista.__wrapped__
    return vista


def _codigo_de(vista) -> str:
    """El código de la vista y el de las funciones auxiliares de su módulo que
    llama (las comprobaciones de propiedad suelen vivir en un auxiliar)."""
    original = _vista_original(vista)
    try:
        codigo = inspect.getsource(original)
    except (OSError, TypeError):
        return ""
    modulo = inspect.getmodule(original)
    vistos = {original.__name__}
    pendientes = [codigo]
    while pendientes:
        actual = pendientes.pop()
        for nombre in set(re.findall(r"\b(_[a-z_0-9]+)\(", actual)):
            auxiliar = getattr(modulo, nombre, None)
            if nombre in vistos or not inspect.isfunction(auxiliar) or inspect.getmodule(auxiliar) is not modulo:
                continue
            vistos.add(nombre)
            try:
                extra = inspect.getsource(auxiliar)
            except (OSError, TypeError):
                continue
            codigo += "\n" + extra
            pendientes.append(extra)
    return codigo


def _rol_de(vista) -> str:
    """Rol que exige la vista, leído de sus decoradores."""
    try:
        cabecera = inspect.getsource(_vista_original(vista)).split("\ndef ")[0]
    except (OSError, TypeError):
        return "?"
    roles = re.search(r"@role_required\(([^)]*)\)", cabecera)
    if roles:
        return " o ".join(re.findall(r'"([A-Z]+)"', roles.group(1)))
    if re.search(r"@jwt_required\(optional=True\)", cabecera):
        return ""             # acepta sesión pero no la exige: cuenta como pública
    if re.search(r"@jwt_required\(refresh=True\)", cabecera):
        return "Cualquiera (refresh token)"
    if re.search(r"@jwt_required\(", cabecera):
        return "Cualquiera con sesión"
    return ""


def _propiedad_de(vista) -> str:
    codigo = _codigo_de(vista)
    for etiqueta, patrones in PROPIEDAD:
        if any(re.search(p, codigo) for p in patrones):
            return etiqueta
    return ""


def inventario(app) -> list:
    """[{metodo, ruta, rol, propiedad, nota, estado}] de todas las rutas de la API."""
    filas = []
    for regla in sorted(app.url_map.iter_rules(), key=lambda r: (r.rule, sorted(r.methods))):
        if regla.endpoint == "static":
            continue
        vista = app.view_functions[regla.endpoint]
        rol = _rol_de(vista)
        for metodo in sorted(regla.methods - {"HEAD", "OPTIONS"}):
            propiedad = PROPIEDAD_EXACTA.get((metodo, regla.rule)) or _propiedad_de(vista)
            nota, estado = "", "ok"
            if not rol:
                if regla.rule in PUBLICAS:
                    rol, nota, estado = "Pública", PUBLICAS[regla.rule], "publica"
                else:
                    rol, estado = "NINGUNO", "sin_autenticacion"
            elif ROLES_ADMIN in rol and "o" not in rol.split():
                propiedad = propiedad or "No aplica: el rol ADMIN administra toda la plataforma"
            elif not propiedad:
                justificacion = SIN_PROPIEDAD_JUSTIFICADO.get((metodo, regla.rule))
                if justificacion:
                    propiedad, nota, estado = "Ninguna (a propósito)", justificacion, "sin_propiedad_justificado"
                else:
                    propiedad, estado = "NINGUNA", "sin_propiedad"
            filas.append({
                "metodo": metodo, "ruta": regla.rule, "rol": rol, "propiedad": propiedad or "—", "nota": nota,
                "estado": estado, "modulo": inspect.getmodule(_vista_original(vista)).__name__.rsplit(".", 1)[-1],
            })
    return filas


def a_markdown(filas) -> str:
    por_estado = {}
    for fila in filas:
        por_estado.setdefault(fila["estado"], []).append(fila)

    lineas = [
        "# Endpoints: rol requerido y validación de propiedad",
        "",
        "Generado por `backend/flask-api/scripts/tabla_endpoints.py` a partir del código. No editar a mano:",
        "`python scripts/tabla_endpoints.py --escribir` lo regenera, y `tests/test_fase8_checklist.py` falla si queda",
        "desactualizado o si aparece una ruta sin control.",
        "",
        "- **Rol**: lo que exige el decorador de la ruta (`role_required` / `jwt_required`). Además, en cada petición",
        "  con sesión se comprueba contra la base que la cuenta siga activa, que el token no esté revocado y que el",
        "  rol del token sea el rol actual del usuario.",
        "- **Propiedad**: cómo se comprueba que el recurso de la URL le pertenece a quien lo pide.",
        "",
        f"Total: **{len(filas)}** rutas — {len(por_estado.get('ok', []))} con rol y propiedad, "
        f"{len(por_estado.get('sin_propiedad_justificado', []))} con sesión pero sin restricción por dueño (a propósito), "
        f"{len(por_estado.get('publica', []))} públicas, "
        f"**{len(por_estado.get('sin_autenticacion', [])) + len(por_estado.get('sin_propiedad', []))} sin control**.",
        "",
    ]

    def tabla(titulo, seleccion, con_nota):
        if not seleccion:
            return
        lineas.extend([f"## {titulo}", ""])
        encabezado = "| Método | Ruta | Rol | Propiedad |" + (" Nota |" if con_nota else "")
        lineas.append(encabezado)
        lineas.append("|---|---|---|---|" + ("---|" if con_nota else ""))
        for f in seleccion:
            fila = f"| {f['metodo']} | `{f['ruta']}` | {f['rol']} | {f['propiedad']} |"
            lineas.append(fila + (f" {f['nota']} |" if con_nota else ""))
        lineas.append("")

    tabla("Sin ningún control (hay que corregirlas)",
          por_estado.get("sin_autenticacion", []) + por_estado.get("sin_propiedad", []), False)
    tabla("Públicas a propósito", por_estado.get("publica", []), True)
    tabla("Con sesión, sin restricción por dueño (a propósito)", por_estado.get("sin_propiedad_justificado", []), True)

    modulos = {}
    for f in por_estado.get("ok", []):
        modulos.setdefault(f["modulo"], []).append(f)
    for modulo in sorted(modulos):
        tabla(f"Con rol y propiedad — {modulo}", modulos[modulo], False)
    return "\n".join(lineas).rstrip() + "\n"


def main():
    os.environ.setdefault("FLASK_ENV", "development")
    from app import create_app

    texto = a_markdown(inventario(create_app()))
    if "--escribir" in sys.argv:
        with open(DESTINO, "w", encoding="utf-8", newline="\n") as salida:
            salida.write(texto)
        print(f"Escrito: {DESTINO}")
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(texto)


if __name__ == "__main__":
    main()
