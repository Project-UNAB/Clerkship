"""Reglas de una tarea (CourseContentItem tipo ASSIGNMENT): qué archivos
acepta, cuántos, de qué tamaño y en qué ventana de tiempo. El docente las
configura por tarea; acá se validan, se les aplican los topes del servidor y
se arma lo que ve el estudiante."""
import uuid
from datetime import datetime, timezone

from flask import current_app

from app.services.archivos import EXTENSIONES_PELIGROSAS, MIME_POR_EXTENSION

# Lo que el servidor sabe verificar por contenido real (magic bytes): es el
# universo del que el docente puede elegir.
EXTENSIONES_SOPORTADAS = tuple(sorted(e.lstrip(".") for e in MIME_POR_EXTENSION))
# Si el docente no elige ninguna: documentos de oficina, PDF e imágenes.
EXTENSIONES_POR_DEFECTO = ("doc", "docx", "jpeg", "jpg", "pdf", "png", "ppt", "pptx", "xls", "xlsx")

MAX_FILES_POR_DEFECTO = 1


class ReglaInvalida(ValueError):
    """La configuración que mandó el docente no se puede guardar."""


def _utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def limites_globales() -> dict:
    """Topes del servidor: ninguna tarea puede pedir más que esto."""
    cfg = current_app.config
    return {
        "max_file_size_mb": int(cfg.get("ASSIGNMENT_MAX_FILE_MB", 10)),
        "max_files": int(cfg.get("ASSIGNMENT_MAX_FILES", 5)),
        "max_total_mb": int(cfg.get("ASSIGNMENT_MAX_TOTAL_MB", 20)),
    }


def normalizar_extensiones(extensiones) -> list:
    """["PDF", ".docx", "pdf"] -> ["docx", "pdf"]. Lanza ReglaInvalida si
    alguna está en la lista negra o no es un tipo que el servidor verifique."""
    limpias = []
    for cruda in extensiones or []:
        ext = str(cruda).strip().lower().lstrip(".")
        if not ext:
            continue
        if ext in EXTENSIONES_PELIGROSAS:
            raise ReglaInvalida(f"La extensión .{ext} está bloqueada por seguridad y no se puede habilitar en ninguna tarea.")
        if ext not in EXTENSIONES_SOPORTADAS:
            raise ReglaInvalida(
                f"La extensión .{ext} no está soportada. Puedes elegir entre: {', '.join(EXTENSIONES_SOPORTADAS)}."
            )
        if ext not in limpias:
            limpias.append(ext)
    return sorted(limpias)


def validar_limites(max_file_size_mb, max_files) -> None:
    """Lanza ReglaInvalida si el docente pide más que los topes del servidor."""
    topes = limites_globales()
    if max_file_size_mb is not None and max_file_size_mb > topes["max_file_size_mb"]:
        raise ReglaInvalida(f"El tamaño máximo por archivo no puede superar {topes['max_file_size_mb']} MB.")
    if max_files is not None and max_files > topes["max_files"]:
        raise ReglaInvalida(f"Una entrega no puede tener más de {topes['max_files']} archivos.")


def validar_ventana(open_at, due_at, allow_late, late_until) -> None:
    """Coherencia de las fechas de una tarea (todas ya en UTC)."""
    open_at, due_at, late_until = _utc(open_at), _utc(due_at), _utc(late_until)
    if open_at and due_at and open_at >= due_at:
        raise ReglaInvalida("'open_at' debe ser anterior a 'due_at'")
    if late_until is not None:
        if not allow_late:
            raise ReglaInvalida("'late_until' solo aplica si la tarea acepta entregas tardías (allow_late)")
        if due_at is None:
            raise ReglaInvalida("'late_until' necesita una fecha de cierre ('due_at')")
        if late_until <= due_at:
            raise ReglaInvalida("'late_until' debe ser posterior a 'due_at'")


def reglas_efectivas(item) -> dict:
    """Las reglas que de verdad se aplican al subir: lo que configuró el
    docente, con los valores por defecto y sin pasar de los topes."""
    topes = limites_globales()
    extensiones = [e for e in (getattr(item, "allowed_extensions", None) or []) if e not in EXTENSIONES_PELIGROSAS]
    tamano = getattr(item, "max_file_size_mb", None) or topes["max_file_size_mb"]
    cantidad = getattr(item, "max_files", None) or MAX_FILES_POR_DEFECTO
    return {
        "allowed_extensions": sorted(extensiones) if extensiones else list(EXTENSIONES_POR_DEFECTO),
        "max_file_size_mb": min(int(tamano), topes["max_file_size_mb"]),
        "max_files": min(int(cantidad), topes["max_files"]),
        "max_total_mb": topes["max_total_mb"],
    }


def estado_ventana(item, ahora=None) -> str:
    """NOT_OPEN: todavía no abre. OPEN: se entrega a tiempo. LATE: ya pasó
    due_at pero se acepta como tardía. CLOSED: ya no se reciben entregas."""
    ahora = _utc(ahora or datetime.now(timezone.utc))
    open_at = _utc(getattr(item, "open_at", None))
    due_at = _utc(getattr(item, "due_at", None))
    late_until = _utc(getattr(item, "late_until", None))

    if open_at and ahora < open_at:
        return "NOT_OPEN"
    if due_at is None or ahora <= due_at:
        return "OPEN"
    if not getattr(item, "allow_late", False):
        return "CLOSED"
    if late_until is not None and ahora > late_until:
        return "CLOSED"
    return "LATE"


def reglas_para_respuesta(item, ahora=None) -> dict:
    """Lo que la interfaz necesita para mostrarle la tarea al estudiante:
    reglas de archivos, fechas (UTC) y cuánto falta según el reloj del servidor."""
    ahora = _utc(ahora or datetime.now(timezone.utc))
    estado = estado_ventana(item, ahora)
    open_at = _utc(getattr(item, "open_at", None))
    due_at = _utc(getattr(item, "due_at", None))
    late_until = _utc(getattr(item, "late_until", None))

    def _segundos(hasta):
        return max(0, int((hasta - ahora).total_seconds())) if hasta is not None else None

    reglas = reglas_efectivas(item)
    reglas.update({
        "open_at": open_at.isoformat() if open_at else None,
        "due_at": due_at.isoformat() if due_at else None,
        "allow_late": bool(getattr(item, "allow_late", False)),
        "late_until": late_until.isoformat() if late_until else None,
        "status": estado,
        "accepts_submissions": estado in ("OPEN", "LATE"),
        "seconds_until_open": _segundos(open_at) if estado == "NOT_OPEN" else None,
        "seconds_until_due": _segundos(due_at) if estado in ("NOT_OPEN", "OPEN") and due_at else None,
        "seconds_until_late_close": _segundos(late_until) if estado == "LATE" and late_until else None,
        "server_now": ahora.isoformat(),
    })
    return reglas


# ─────────────────────────── Rúbrica ───────────────────────────

def normalizar_rubrica(criterios) -> list:
    """La rúbrica lista para guardar: cada criterio con su id (se conserva el
    que traía; a los nuevos se les asigna uno), título, descripción y puntos.
    Lanza ReglaInvalida si dos criterios comparten id."""
    rubrica, vistos = [], set()
    for criterio in criterios or []:
        ident = (getattr(criterio, "id", None) or "").strip() or uuid.uuid4().hex
        if ident in vistos:
            raise ReglaInvalida("La rúbrica tiene dos criterios con el mismo id.")
        vistos.add(ident)
        rubrica.append({
            "id": ident,
            "title": criterio.title.strip(),
            "description": (criterio.description or "").strip() or None,
            "max_points": float(criterio.max_points),
        })
    return rubrica


def puntaje_de_rubrica(rubrica) -> float:
    """El puntaje máximo de una tarea con rúbrica: la suma de sus criterios."""
    return round(sum(float(c["max_points"]) for c in rubrica or []), 2)


def calificar_con_rubrica(rubrica, notas) -> tuple:
    """(nota total, detalle por criterio) a partir de los puntos que puso el
    docente. Exige una nota para CADA criterio de la rúbrica, ninguna de un
    criterio ajeno, y que ninguna pase del máximo de su criterio."""
    por_id = {}
    for nota in notas or []:
        if nota.criterion_id in por_id:
            raise ReglaInvalida("Hay un criterio calificado dos veces.")
        por_id[nota.criterion_id] = nota

    ajenos = set(por_id) - {c["id"] for c in rubrica}
    if ajenos:
        raise ReglaInvalida("Se calificó un criterio que no es de la rúbrica de esta tarea.")

    detalle, total = [], 0.0
    for criterio in rubrica:
        nota = por_id.get(criterio["id"])
        if nota is None:
            raise ReglaInvalida(f"Falta la nota del criterio «{criterio['title']}».")
        maximo = float(criterio["max_points"])
        if nota.points > maximo:
            raise ReglaInvalida(f"El criterio «{criterio['title']}» vale como máximo {maximo:g} puntos.")
        total += float(nota.points)
        detalle.append({
            "criterion_id": criterio["id"],
            "title": criterio["title"],
            "max_points": maximo,
            "points": float(nota.points),
            "comment": (nota.comment or "").strip() or None,
        })
    return round(total, 2), detalle
