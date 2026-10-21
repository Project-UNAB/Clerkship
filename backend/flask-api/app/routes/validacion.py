"""Validación por expertos. Rutas públicas (sin sesión): los expertos no tienen cuenta.
El formulario abierto por pestaña y el portal con enlace personal. Límite por IP."""
import uuid
from datetime import datetime, timezone

from flask import Blueprint, jsonify

from app import db, get_mongo_db, limiter
from app.models import (
    Consultation, RevisionCaso, User,
    ValidacionBiblioteca, ValidacionCasos, ValidacionHistorial, ValidacionInicio, ValidacionInvitacion,
)
from app.schemas import validate_body
from app.schemas.validacion import (
    GuardarRevisionRequest,
    GuardarSeccionRequest,
    PerfilExpertoRequest,
    ValidacionBibliotecaRequest,
    ValidacionCasosRequest,
    ValidacionHistorialRequest,
    ValidacionInicioRequest,
)
from app.services.revision_casos import CRITERIOS_CASO, nombres_a_ocultar, vista_caso

validacion_bp = Blueprint("validacion", __name__)


def _guardar(modelo, validated_body):
    registro = modelo(**validated_body.model_dump())
    db.session.add(registro)
    db.session.commit()
    return jsonify({"ok": True, "message": "Gracias por tu validación."}), 201


@validacion_bp.post("/inicio")
@limiter.limit("20 per hour")
@validate_body(ValidacionInicioRequest)
def validar_inicio(validated_body: ValidacionInicioRequest):
    return _guardar(ValidacionInicio, validated_body)


@validacion_bp.post("/casos")
@limiter.limit("20 per hour")
@validate_body(ValidacionCasosRequest)
def validar_casos(validated_body: ValidacionCasosRequest):
    return _guardar(ValidacionCasos, validated_body)


@validacion_bp.post("/historial")
@limiter.limit("20 per hour")
@validate_body(ValidacionHistorialRequest)
def validar_historial(validated_body: ValidacionHistorialRequest):
    return _guardar(ValidacionHistorial, validated_body)


@validacion_bp.post("/biblioteca")
@limiter.limit("20 per hour")
@validate_body(ValidacionBibliotecaRequest)
def validar_biblioteca(validated_body: ValidacionBibliotecaRequest):
    return _guardar(ValidacionBiblioteca, validated_body)


# ── Portal del experto con su enlace personal ──
# Sin sesión: el token del enlace (aleatorio, 32 caracteres) identifica la
# invitación. Un enlace revocado o inexistente responde lo mismo (404).

MODELOS_VALIDACION = {
    "inicio": ValidacionInicio, "casos": ValidacionCasos,
    "historial": ValidacionHistorial, "biblioteca": ValidacionBiblioteca,
}
_NO_SON_ITEMS = {"id", "nombre_experto", "id_experto", "profesion", "anos_experiencia", "especialidad", "comentario", "created_at"}


def items_de(seccion: str) -> list[str]:
    """Claves de los ítems de una sección, en el orden del formulario."""
    return [c.name for c in MODELOS_VALIDACION[seccion].__table__.columns if c.name not in _NO_SON_ITEMS]


def _ahora():
    return datetime.now(timezone.utc)


def _error(status, mensaje):
    return jsonify({"error": "Validación", "message": mensaje, "status_code": status}), status


def _invitacion(token):
    inv = ValidacionInvitacion.query.filter_by(token=token).first() if 16 <= len(token) <= 64 else None
    if inv is None or inv.estado == "REVOCADA":
        return None, _error(404, "Este enlace no es válido o fue desactivado. Pide uno nuevo a quien te invitó.")
    return inv, None


def _editable(token):
    inv, err = _invitacion(token)
    if err:
        return None, err
    if inv.estado == "COMPLETADA":
        return None, _error(409, "Ya finalizaste esta evaluación. Si necesitas cambiar algo, pide que la reabran.")
    if inv.estado == "PENDIENTE":
        inv.estado = "EN_CURSO"
    return inv, None


def _casos_de(inv) -> list[dict]:
    """Casos clínicos asignados a la invitación, con su avance (sin datos del estudiante)."""
    filas = (db.session.query(RevisionCaso, Consultation)
             .join(Consultation, Consultation.id == RevisionCaso.consultation_id)
             .filter(RevisionCaso.invitacion_id == inv.id)
             .order_by(RevisionCaso.created_at).all())
    return [{
        "id": str(r.id), "subtema": c.subtema, "dificultad": c.difficulty, "estado": r.estado,
        "respondidos": sum(1 for k in CRITERIOS_CASO if k in (r.respuestas or {})), "total": len(CRITERIOS_CASO),
        "puntaje_experto": r.puntaje_experto, "enviada_at": r.enviada_at.isoformat() if r.enviada_at else None,
    } for r, c in filas]


def _faltantes(inv, casos=()) -> list[str]:
    """Lo que falta para poder finalizar, en palabras."""
    faltan = []
    if not inv.consentimiento_at:
        faltan.append("aceptar el consentimiento")
    if not (inv.registro_profesional or "").strip():
        faltan.append("escribir tu ID (documento o registro profesional)")
    if not inv.profesion or inv.anos_experiencia is None:
        faltan.append("completar tus datos profesionales")
    pendientes = [s for s in inv.secciones if s not in (inv.enviadas or {})]
    if pendientes:
        faltan.append("enviar las secciones: " + ", ".join(pendientes))
    sin_revisar = sum(1 for c in casos if c["estado"] != "ENVIADA")
    if sin_revisar:
        faltan.append(f"enviar la revisión de {sin_revisar} {'caso clínico' if sin_revisar == 1 else 'casos clínicos'}")
    if not inv.aplicabilidad:
        faltan.append("dar tu juicio de aplicabilidad")
    return faltan


def _respuesta(inv):
    casos = _casos_de(inv)
    return jsonify({**inv.para_experto(), "casos": casos, "faltantes": _faltantes(inv, casos)}), 200


@validacion_bp.get("/invitacion/<token>")
@limiter.limit("120 per hour")
def ver_invitacion(token):
    inv, err = _invitacion(token)
    if err:
        return err
    if inv.abierta_at is None:
        inv.abierta_at = _ahora()
        db.session.commit()
    return _respuesta(inv)


@validacion_bp.patch("/invitacion/<token>")
@limiter.limit("300 per hour")
@validate_body(PerfilExpertoRequest)
def actualizar_perfil_experto(token, validated_body: PerfilExpertoRequest):
    inv, err = _editable(token)
    if err:
        return err
    cambios = validated_body.model_dump(exclude_unset=True)
    consentimiento = cambios.pop("consentimiento", None)
    if consentimiento is not None:
        inv.consentimiento_at = _ahora() if consentimiento else None
    for campo, valor in cambios.items():
        valor = valor.strip() or None if isinstance(valor, str) else valor
        # La profesión y el ID no se vacían; el nombre sí, mientras quede el ID.
        if campo in ("profesion", "registro_profesional") and not valor:
            continue
        if campo == "nombre" and not valor and not (cambios.get("registro_profesional") or inv.registro_profesional):
            continue
        setattr(inv, campo, valor)
    db.session.commit()
    return _respuesta(inv)


@validacion_bp.put("/invitacion/<token>/secciones/<seccion>")
@limiter.limit("600 per hour")
@validate_body(GuardarSeccionRequest)
def guardar_seccion_experto(token, seccion, validated_body: GuardarSeccionRequest):
    inv, err = _editable(token)
    if err:
        return err
    if seccion not in (inv.secciones or []):
        return _error(404, "Esa sección no está en tu invitación.")
    claves = set(items_de(seccion))
    desconocidas = (set(validated_body.respuestas) - claves) | (set(validated_body.observaciones) - claves - {"_general"})
    if desconocidas:
        return _error(400, "Ítems que no existen en la sección: " + ", ".join(sorted(desconocidas)))
    # JSONB: se asigna un dict nuevo para que SQLAlchemy note el cambio.
    respuestas = dict(inv.respuestas or {})
    respuestas[seccion] = {**respuestas.get(seccion, {}), **validated_body.respuestas}
    inv.respuestas = respuestas
    observaciones = dict(inv.observaciones or {})
    propias = {**observaciones.get(seccion, {}), **validated_body.observaciones}
    observaciones[seccion] = {k: v for k, v in propias.items() if v.strip()}
    inv.observaciones = observaciones
    db.session.commit()
    return _respuesta(inv)


@validacion_bp.post("/invitacion/<token>/secciones/<seccion>/enviar")
@limiter.limit("120 per hour")
def enviar_seccion_experto(token, seccion):
    inv, err = _editable(token)
    if err:
        return err
    if seccion not in (inv.secciones or []):
        return _error(404, "Esa sección no está en tu invitación.")
    sin_responder = [k for k in items_de(seccion) if k not in (inv.respuestas or {}).get(seccion, {})]
    if sin_responder:
        return _error(400, f"Faltan {len(sin_responder)} ítems por calificar en esta sección.")
    inv.enviadas = {**(inv.enviadas or {}), seccion: _ahora().isoformat()}
    db.session.commit()
    return _respuesta(inv)


@validacion_bp.post("/invitacion/<token>/finalizar")
@limiter.limit("60 per hour")
def finalizar_invitacion(token):
    inv, err = _editable(token)
    if err:
        return err
    faltan = _faltantes(inv, _casos_de(inv))
    if faltan:
        return _error(400, "Antes de finalizar falta: " + "; ".join(faltan) + ".")
    inv.estado = "COMPLETADA"
    inv.completada_at = _ahora()
    db.session.commit()
    return _respuesta(inv)


# ── Revisión de casos clínicos asignados ──

def _revision(inv, revision_id):
    try:
        r = db.session.get(RevisionCaso, uuid.UUID(str(revision_id)))
    except ValueError:
        r = None
    if r is None or r.invitacion_id != inv.id:
        return None, _error(404, "Ese caso no está asignado a tu invitación.")
    return r, None


def caso_para_revision(consultation_id) -> dict:
    """La consulta completada, anonimizada, con su conversación y su evaluación automática."""
    consulta = db.session.get(Consultation, consultation_id)
    try:
        doc = get_mongo_db().consultations.find_one({"consultation_id": str(consultation_id)}) or {}
    except Exception:  # noqa: BLE001
        doc = {}
    estudiante = db.session.get(User, consulta.student_id)
    ocultar = nombres_a_ocultar(*(getattr(estudiante, c, "") for c in ("first_name", "last_name", "username"))) if estudiante else []
    return vista_caso(consulta, doc, ocultar)


@validacion_bp.get("/invitacion/<token>/casos/<revision_id>")
@limiter.limit("300 per hour")
def ver_caso_experto(token, revision_id):
    inv, err = _invitacion(token)
    if err:
        return err
    r, err = _revision(inv, revision_id)
    if err:
        return err
    caso = caso_para_revision(r.consultation_id)
    # A ciegas: la evaluación automática y su puntaje se muestran solo después de
    # que el experto fije el suyo, para que no se ancle a ese número.
    caso["evaluacion_oculta"] = r.puntaje_experto is None
    if caso["evaluacion_oculta"]:
        caso["evaluacion"], caso["puntaje_ia"] = None, None
    return jsonify({"revision": r.to_dict(), "caso": caso}), 200


@validacion_bp.put("/invitacion/<token>/casos/<revision_id>")
@limiter.limit("600 per hour")
@validate_body(GuardarRevisionRequest)
def guardar_revision_caso(token, revision_id, validated_body: GuardarRevisionRequest):
    inv, err = _editable(token)
    if err:
        return err
    r, err = _revision(inv, revision_id)
    if err:
        return err
    desconocidos = (set(validated_body.respuestas) - set(CRITERIOS_CASO)) | (
        set(validated_body.observaciones) - set(CRITERIOS_CASO) - {"_general"})
    if desconocidos:
        return _error(400, "Criterios que no existen: " + ", ".join(sorted(desconocidos)))
    r.respuestas = {**(r.respuestas or {}), **validated_body.respuestas}
    propias = {**(r.observaciones or {}), **validated_body.observaciones}
    r.observaciones = {k: v for k, v in propias.items() if v.strip()}
    if "puntaje_experto" in validated_body.model_fields_set and validated_body.puntaje_experto != r.puntaje_experto:
        if r.puntaje_experto is not None:
            return _error(409, "Tu puntaje ya quedó fijado: se registró antes de ver la evaluación automática.")
        r.puntaje_experto = validated_body.puntaje_experto
    if r.estado == "PENDIENTE":
        r.estado = "EN_CURSO"
    db.session.commit()
    return jsonify({"revision": r.to_dict()}), 200


@validacion_bp.post("/invitacion/<token>/casos/<revision_id>/enviar")
@limiter.limit("120 per hour")
def enviar_revision_caso(token, revision_id):
    inv, err = _editable(token)
    if err:
        return err
    r, err = _revision(inv, revision_id)
    if err:
        return err
    sin = [k for k in CRITERIOS_CASO if k not in (r.respuestas or {})]
    if sin:
        return _error(400, f"Faltan {len(sin)} criterios por calificar en este caso.")
    if r.puntaje_experto is None:
        return _error(400, "Falta el puntaje que le darías al estudiante (0 a 100).")
    r.estado, r.enviada_at = "ENVIADA", _ahora()
    db.session.commit()
    return _respuesta(inv)
