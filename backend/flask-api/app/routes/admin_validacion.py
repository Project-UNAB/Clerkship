"""Validación de la plataforma por expertos, lado del administrador: invitar a
cada profesional con su enlace personal, seguir su avance y ver los resultados
(V de Aiken con IC 95 %, I-CVI, kappa modificado y S-CVI por sección).
También asigna consultas completadas para que los expertos revisen el caso y
la evaluación automática, y calcula la concordancia IA ↔ experto."""
import secrets
import uuid

from flask import Blueprint, jsonify

from app import db, get_mongo_db
from app.models import Consultation, RevisionCaso, ValidacionInvitacion
from app.routes.validacion import MODELOS_VALIDACION, caso_para_revision, items_de
from app.schemas import validate_body
from app.schemas.validacion import ActualizarInvitacionRequest, AsignarCasosRequest, CrearInvitacionRequest
from app.services import auditoria
from app.services.revision_casos import CRITERIOS_CASO, concordancia
from app.services.validez_contenido import resumen_seccion
from app.utils import get_current_user, role_required

admin_validacion_bp = Blueprint("admin_validacion", __name__)

SECCIONES = list(MODELOS_VALIDACION)


def _error(status: int, mensaje: str):
    nombres = {400: "Bad Request", 404: "Not Found", 409: "Conflict"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _buscar(invitacion_id):
    try:
        return db.session.get(ValidacionInvitacion, uuid.UUID(str(invitacion_id)))
    except ValueError:
        return None


def _limpiar(datos: dict) -> dict:
    """Textos vacíos se guardan como nulos; el correo, en minúsculas; secciones sin repetir y en orden."""
    limpio = {}
    for campo, valor in datos.items():
        if isinstance(valor, str):
            valor = valor.strip() or None
            if campo == "email" and valor:
                valor = valor.lower()
        if campo == "secciones" and valor is not None:
            valor = [s for s in SECCIONES if s in valor]
        limpio[campo] = valor
    return limpio


def _items_por_seccion():
    return {s: len(items_de(s)) for s in SECCIONES}


@admin_validacion_bp.get("/invitaciones")
@role_required("ADMIN")
def listar_invitaciones():
    """Todas las invitaciones, de la más nueva a la más vieja, con sus respuestas."""
    filas = ValidacionInvitacion.query.order_by(ValidacionInvitacion.created_at.desc()).all()
    casos = {}
    for r in RevisionCaso.query.all():
        c = casos.setdefault(r.invitacion_id, {"asignados": 0, "enviados": 0})
        c["asignados"] += 1
        c["enviados"] += r.estado == "ENVIADA"
    return jsonify({
        "invitaciones": [{**i.para_admin(), "casos": casos.get(i.id, {"asignados": 0, "enviados": 0})} for i in filas],
        "items_por_seccion": _items_por_seccion(),
    }), 200


@admin_validacion_bp.post("/invitaciones")
@role_required("ADMIN")
@validate_body(CrearInvitacionRequest)
def crear_invitacion(validated_body: CrearInvitacionRequest):
    datos = _limpiar(validated_body.model_dump())
    inv = ValidacionInvitacion(token=secrets.token_urlsafe(24), creada_por=get_current_user().id,
                               respuestas={}, observaciones={}, enviadas={}, **datos)
    db.session.add(inv)
    db.session.commit()
    return jsonify({"invitacion": inv.para_admin()}), 201


@admin_validacion_bp.patch("/invitaciones/<invitacion_id>")
@role_required("ADMIN")
@validate_body(ActualizarInvitacionRequest)
def actualizar_invitacion(invitacion_id, validated_body: ActualizarInvitacionRequest):
    inv = _buscar(invitacion_id)
    if inv is None:
        return _error(404, "La invitación no existe.")
    cambios = _limpiar(validated_body.model_dump(exclude_unset=True))
    accion = cambios.pop("accion", None)
    for campo in ("profesion", "registro_profesional"):
        if campo in cambios and not cambios[campo]:
            cambios.pop(campo)
    if "nombre" in cambios and not cambios["nombre"] and not (cambios.get("registro_profesional") or inv.registro_profesional):
        cambios.pop("nombre")
    for campo, valor in cambios.items():
        setattr(inv, campo, valor)

    if accion == "revocar":
        auditoria.registrar(auditoria.VALIDATION_INVITE_REVOKE, "validacion_invitacion", inv.id,
                            old={"estado": inv.estado}, new={"estado": "REVOCADA"})
        inv.estado = "REVOCADA"
    elif accion == "reactivar":
        if inv.estado != "REVOCADA":
            return _error(409, "Solo se reactiva una invitación revocada.")
        inv.estado = "COMPLETADA" if inv.completada_at else ("EN_CURSO" if inv.abierta_at else "PENDIENTE")
    elif accion == "reabrir":
        if inv.estado != "COMPLETADA":
            return _error(409, "Solo se reabre una evaluación finalizada.")
        inv.estado, inv.completada_at = "EN_CURSO", None
    db.session.commit()
    return jsonify({"invitacion": inv.para_admin()}), 200


@admin_validacion_bp.post("/invitaciones/<invitacion_id>/nuevo-enlace")
@role_required("ADMIN")
def nuevo_enlace_invitacion(invitacion_id):
    """Cambia el token: el enlace anterior deja de funcionar (por si se compartió de más)."""
    inv = _buscar(invitacion_id)
    if inv is None:
        return _error(404, "La invitación no existe.")
    inv.token = secrets.token_urlsafe(24)
    db.session.commit()
    return jsonify({"invitacion": inv.para_admin()}), 200


@admin_validacion_bp.delete("/invitaciones/<invitacion_id>")
@role_required("ADMIN")
def borrar_invitacion(invitacion_id):
    inv = _buscar(invitacion_id)
    if inv is None:
        return _error(404, "La invitación no existe.")
    auditoria.registrar(auditoria.VALIDATION_INVITE_DELETE, "validacion_invitacion", inv.id,
                        old={"experto": inv.etiqueta, "estado": inv.estado, "enviadas": list((inv.enviadas or {}).keys())})
    db.session.delete(inv)
    db.session.commit()
    return jsonify({"ok": True}), 200


def calcular_resultados(invitaciones, filas_formulario: dict) -> dict:
    """Junta las secciones enviadas de cada invitación (no revocada) y las respuestas
    del formulario abierto, y calcula la validez de contenido por sección y global.
    `filas_formulario`: {seccion: [filas de validacion_<seccion>]}."""
    expertos, por_seccion = [], {s: [] for s in SECCIONES}

    for inv in invitaciones:
        if inv.estado == "REVOCADA":
            continue
        enviadas = [s for s in SECCIONES if s in (inv.secciones or []) and s in (inv.enviadas or {})]
        if not enviadas:
            continue
        clave = str(inv.id)
        expertos.append({"id": clave, "origen": "invitacion", "estado": inv.estado, **inv.datos_experto(),
                         "secciones": enviadas, "aplicabilidad": inv.aplicabilidad,
                         "comentario_final": inv.comentario_final,
                         "completada_at": inv.completada_at.isoformat() if inv.completada_at else None})
        for s in enviadas:
            por_seccion[s].append({"experto": clave, "valores": (inv.respuestas or {}).get(s, {}),
                                   "observaciones": (inv.observaciones or {}).get(s, {})})

    for s, filas in filas_formulario.items():
        for f in filas:
            clave = f"formulario-{f.id}"
            expertos.append({"id": clave, "origen": "formulario", "estado": "COMPLETADA",
                             "etiqueta": f.nombre_experto or f"ID {f.id_experto}", "nombre": f.nombre_experto,
                             "email": None, "profesion": f.profesion, "especialidad": f.especialidad,
                             "institucion": None, "registro_profesional": f.id_experto,
                             "anos_experiencia": f.anos_experiencia, "secciones": [s], "aplicabilidad": None,
                             "comentario_final": None,
                             "completada_at": f.created_at.isoformat() if f.created_at else None})
            por_seccion[s].append({"experto": clave, "valores": {k: getattr(f, k) for k in items_de(s)},
                                   "observaciones": {"_general": f.comentario} if (f.comentario or "").strip() else {}})

    secciones, todos = {}, {}
    for s in SECCIONES:
        claves = items_de(s)
        valores = {k: [r["valores"][k] for r in por_seccion[s] if k in r["valores"]] for k in claves}
        todos.update({f"{s}.{k}": v for k, v in valores.items()})
        observaciones = {k: [{"experto": r["experto"], "texto": r["observaciones"][k]}
                             for r in por_seccion[s] if (r["observaciones"].get(k) or "").strip()]
                         for k in [*claves, "_general"]}
        secciones[s] = {**resumen_seccion(valores), "respuestas": por_seccion[s],
                        "observaciones": {k: v for k, v in observaciones.items() if v}}

    glob = resumen_seccion(todos)
    aplicabilidad = {"APLICABLE": 0, "APLICABLE_CON_CAMBIOS": 0, "NO_APLICABLE": 0}
    for e in expertos:
        if e["aplicabilidad"] in aplicabilidad:
            aplicabilidad[e["aplicabilidad"]] += 1
    return {
        "expertos": expertos,
        "secciones": secciones,
        "global": {k: glob[k] for k in ("v_promedio", "s_cvi_ave", "s_cvi_ua")},
        "aplicabilidad": aplicabilidad,
    }


@admin_validacion_bp.get("/resultados")
@role_required("ADMIN")
def resultados_validacion():
    """Validez de contenido por ítem, sección y global, con las observaciones de los expertos."""
    invitaciones = ValidacionInvitacion.query.order_by(ValidacionInvitacion.created_at).all()
    formulario = {s: m.query.order_by(m.created_at).all() for s, m in MODELOS_VALIDACION.items()}
    return jsonify(calcular_resultados(invitaciones, formulario)), 200


# ── Revisión de casos clínicos ──

def _uuid(valor):
    try:
        return uuid.UUID(str(valor))
    except ValueError:
        return None


@admin_validacion_bp.get("/casos")
@role_required("ADMIN")
def listar_casos_para_revision():
    """Consultas completadas (sin datos del estudiante), sus revisiones y los expertos disponibles."""
    consultas = (Consultation.query.filter_by(status="COMPLETED")
                 .order_by(Consultation.finished_at.desc()).limit(500).all())
    ids = [c.id for c in consultas]
    revisiones = RevisionCaso.query.filter(RevisionCaso.consultation_id.in_(ids)).all() if ids else []
    invitaciones = {i.id: i for i in ValidacionInvitacion.query.all()}
    con_respuesta = set()
    try:
        for d in get_mongo_db().consultations.find(
                {"consultation_id": {"$in": [str(i) for i in ids]}, "respuesta_estudiante": {"$exists": True}},
                {"consultation_id": 1}):
            con_respuesta.add(d["consultation_id"])
    except Exception:  # noqa: BLE001
        pass
    por_caso = {}
    for r in revisiones:
        inv = invitaciones.get(r.invitacion_id)
        por_caso.setdefault(r.consultation_id, []).append({
            **r.to_dict(), "experto": inv.etiqueta if inv else None, "experto_estado": inv.estado if inv else None,
        })
    return jsonify({
        "casos": [{
            "consultation_id": str(c.id), "subtema": c.subtema, "especialidad": c.specialty, "dificultad": c.difficulty,
            "finalizada_at": c.finished_at.isoformat() if c.finished_at else None,
            "puntaje_ia": float(c.score) if c.score is not None else None,
            "con_respuesta_estudiante": str(c.id) in con_respuesta,
            "revisiones": por_caso.get(c.id, []),
        } for c in consultas],
        "expertos": [{"id": str(i.id), "nombre": i.etiqueta, "profesion": i.profesion, "estado": i.estado}
                     for i in sorted(invitaciones.values(), key=lambda i: i.etiqueta.lower()) if i.estado != "REVOCADA"],
    }), 200


@admin_validacion_bp.get("/casos/<consultation_id>")
@role_required("ADMIN")
def ver_caso_para_revision(consultation_id):
    """Lo mismo que verá el experto: el caso anonimizado."""
    cid = _uuid(consultation_id)
    consulta = db.session.get(Consultation, cid) if cid else None
    if consulta is None or consulta.status != "COMPLETED":
        return _error(404, "La consulta no existe o no está completada.")
    return jsonify({"caso": caso_para_revision(cid)}), 200


@admin_validacion_bp.post("/casos/<consultation_id>/asignaciones")
@role_required("ADMIN")
@validate_body(AsignarCasosRequest)
def asignar_caso(consultation_id, validated_body: AsignarCasosRequest):
    """Asigna la consulta a esos expertos (las que ya tenían se dejan igual). Si un experto
    ya había finalizado, su evaluación se reabre para que revise el caso nuevo."""
    cid = _uuid(consultation_id)
    consulta = db.session.get(Consultation, cid) if cid else None
    if consulta is None or consulta.status != "COMPLETED":
        return _error(404, "La consulta no existe o no está completada.")
    ya = {r.invitacion_id for r in RevisionCaso.query.filter_by(consultation_id=cid).all()}
    creadas = 0
    for inv_id in dict.fromkeys(validated_body.invitaciones):
        inv = db.session.get(ValidacionInvitacion, inv_id)
        if inv is None or inv.estado == "REVOCADA":
            return _error(400, "Una de las invitaciones no existe o está revocada.")
        if inv_id in ya:
            continue
        db.session.add(RevisionCaso(invitacion_id=inv_id, consultation_id=cid, respuestas={}, observaciones={},
                                    estado="PENDIENTE", asignada_por=get_current_user().id))
        if inv.estado == "COMPLETADA":
            inv.estado, inv.completada_at = "EN_CURSO", None
        creadas += 1
    db.session.commit()
    return jsonify({"ok": True, "asignadas": creadas}), 201


@admin_validacion_bp.delete("/revisiones/<revision_id>")
@role_required("ADMIN")
def quitar_revision(revision_id):
    """Quita la asignación (y lo que el experto haya respondido de ese caso)."""
    rid = _uuid(revision_id)
    r = db.session.get(RevisionCaso, rid) if rid else None
    if r is None:
        return _error(404, "La asignación no existe.")
    auditoria.registrar(auditoria.VALIDATION_INVITE_DELETE, "revision_caso", r.id,
                        old={"consultation_id": str(r.consultation_id), "estado": r.estado})
    db.session.delete(r)
    db.session.commit()
    return jsonify({"ok": True}), 200


def calcular_resultados_casos(revisiones, consultas: dict, invitaciones: dict) -> dict:
    """Revisiones enviadas → validez por criterio (V de Aiken, I-CVI), resumen por
    caso y concordancia entre el puntaje automático y el del experto.
    `consultas`: {consultation_id: Consultation}; `invitaciones`: {id: ValidacionInvitacion}."""
    validas = [r for r in revisiones if r.estado == "ENVIADA"
               and getattr(invitaciones.get(r.invitacion_id), "estado", "REVOCADA") != "REVOCADA"]
    criterios = resumen_seccion({k: [r.respuestas[k] for r in validas if k in (r.respuestas or {})] for k in CRITERIOS_CASO})

    observaciones = {}
    for r in validas:
        experto = invitaciones[r.invitacion_id].etiqueta
        c = consultas.get(r.consultation_id)
        for k, texto in (r.observaciones or {}).items():
            observaciones.setdefault(k, []).append({"experto": experto, "caso": getattr(c, "subtema", None), "texto": texto})

    casos, pares = [], []
    for cid, c in consultas.items():
        propias = [r for r in validas if r.consultation_id == cid]
        if not propias:
            continue
        ia = float(c.score) if c.score is not None else None
        puntajes = [r.puntaje_experto for r in propias if r.puntaje_experto is not None]
        pares += [(ia, p) for p in puntajes]
        resumen = resumen_seccion({k: [r.respuestas[k] for r in propias if k in (r.respuestas or {})] for k in CRITERIOS_CASO})
        casos.append({
            "consultation_id": str(cid), "subtema": c.subtema, "dificultad": c.difficulty, "puntaje_ia": ia,
            "revisiones": len(propias),
            "puntaje_expertos": round(sum(puntajes) / len(puntajes), 1) if puntajes else None,
            "v_promedio": resumen["v_promedio"],
            "medias": {i["key"]: i["media"] for i in resumen["items"]},
            "expertos": [{"experto": invitaciones[r.invitacion_id].etiqueta, "puntaje": r.puntaje_experto,
                          "respuestas": r.respuestas} for r in propias],
        })
    return {
        "revisiones": len(validas),
        "expertos": len({r.invitacion_id for r in validas}),
        "criterios": criterios,
        "casos": casos,
        "concordancia": concordancia(pares),
        "pares": [{"ia": a, "experto": b} for a, b in pares if a is not None],
        "observaciones": observaciones,
    }


@admin_validacion_bp.get("/casos/resultados")
@role_required("ADMIN")
def resultados_casos():
    revisiones = RevisionCaso.query.all()
    ids = {r.consultation_id for r in revisiones}
    consultas = {c.id: c for c in Consultation.query.filter(Consultation.id.in_(ids)).all()} if ids else {}
    invitaciones = {i.id: i for i in ValidacionInvitacion.query.all()}
    return jsonify(calcular_resultados_casos(revisiones, consultas, invitaciones)), 200
