"""Informe de una consulta simulada: verlo completo, descargarlo en Word o
PDF, compartirlo y dejar notas sobre él.

Quién puede ver un informe (siempre de una consulta completada):
- el estudiante dueño,
- el docente del curso al que pertenece la consulta,
- los usuarios con quienes se compartió: miembros de los cursos del
  estudiante elegidos por él, o cualquiera con sesión que abra el enlace.
Todos ellos pueden dejar notas; cada quien borra las suyas. Solo el dueño
comparte o deja de compartir; solo el docente del curso califica un caso
asignado."""
import secrets
import uuid
from datetime import datetime, timezone
from typing import Annotated, List, Optional

from flask import Blueprint, Response, jsonify, request
from flask_jwt_extended import jwt_required
from pydantic import Field

from app import db, limiter
from app.models import Consultation, ConsultationComment, ConsultationShare, Course, CourseContentItem, StudentCourse, User
from app.schemas.base import BaseSchema, validate_body
from app.services import conversion, informe_consulta, notificaciones
from app.utils import get_current_user

informes_bp = Blueprint("informes", __name__)

MAX_COMENTARIOS = 500
SECCIONES = ("general", "cierre", "anamnesis", "diagnostico", "evaluacion", "conversacion")


class ComentarioInformeRequest(BaseSchema):
    body: Annotated[str, Field(min_length=1, max_length=2000)]
    section: str = Field("general", max_length=40)


class CompartirInformeRequest(BaseSchema):
    user_ids: List[uuid.UUID] = Field(..., min_length=1, max_length=50)


class CalificarCasoRequest(BaseSchema):
    teacher_score: Optional[float] = Field(None, ge=0)
    teacher_feedback: Optional[str] = Field(None, max_length=4000)


def _error(status, mensaje):
    nombres = {400: "Bad Request", 403: "Forbidden", 404: "Not Found", 409: "Conflict", 503: "Service Unavailable"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _acceso(user, consulta) -> Optional[str]:
    """'DUENO', 'DOCENTE', 'COMPARTIDO' o None."""
    if user.role == "STUDENT" and consulta.student_id == user.id:
        return "DUENO"
    if user.role == "TEACHER":
        curso = Course.query.get(consulta.course_id)
        if curso is not None and curso.teacher_id == user.id:
            return "DOCENTE"
    compartido = ConsultationShare.query.filter_by(consultation_id=consulta.id, user_id=user.id).first()
    return "COMPARTIDO" if compartido else None


def _informe_o_error(consultation_id):
    """(consulta, usuario, acceso, None) o (None, None, None, respuesta de error)."""
    user = get_current_user()
    try:
        cid = uuid.UUID(consultation_id)
    except ValueError:
        return None, None, None, _error(400, "ID de consulta inválido")
    consulta = Consultation.query.get(cid)
    if consulta is None:
        return None, None, None, _error(404, "Consulta no encontrada")
    acceso = _acceso(user, consulta)
    if acceso is None:
        return None, None, None, _error(403, "No tienes acceso a este informe")
    if consulta.status != "COMPLETED":
        return None, None, None, _error(409, "La consulta todavía no termina: el informe se genera al cerrarla.")
    return consulta, user, acceso, None


def _seguidores(consulta, excepto) -> list:
    """Dueño, docente del curso y usuarios con quienes se compartió, menos `excepto`."""
    ids = {consulta.student_id}
    curso = Course.query.get(consulta.course_id)
    if curso is not None:
        ids.add(curso.teacher_id)
    ids.update(s.user_id for s in ConsultationShare.query.filter_by(consultation_id=consulta.id).all())
    ids.discard(excepto)
    return list(ids)


def _usuario_publico(u, extra=None) -> dict:
    d = {"id": str(u.id), "nombre": f"{u.first_name} {u.last_name}".strip(), "role": u.role}
    if extra:
        d.update(extra)
    return d


@informes_bp.get("/<consultation_id>")
@jwt_required()
def obtener_informe(consultation_id):
    """El informe completo, con los permisos de quien lo pide."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    datos = informe_consulta.datos_informe(consulta)
    datos["acceso"] = {
        "tipo": acceso,
        "puede_compartir": acceso == "DUENO",
        "puede_calificar": acceso == "DOCENTE" and consulta.course_item_id is not None,
    }
    return jsonify(datos), 200


@informes_bp.get("/<consultation_id>/descarga")
@jwt_required()
@limiter.limit("20 per minute")
def descargar_informe(consultation_id):
    """El informe en Word (?formato=docx) o PDF (?formato=pdf, por defecto)."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    formato = (request.args.get("formato") or "pdf").lower()
    if formato not in ("pdf", "docx"):
        return _error(400, "formato debe ser pdf o docx")
    datos = informe_consulta.datos_informe(consulta)
    comentarios = informe_consulta.comentarios_de(consulta.id)
    nombre = f"Informe - {consulta.title}".replace('"', "")[:120]
    if formato == "docx":
        contenido = informe_consulta.generar_docx(datos, comentarios)
        mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else:
        try:
            contenido = informe_consulta.generar_pdf(datos, comentarios)
        except (conversion.ConversionNotConfigured, conversion.ConversionError):
            return _error(503, "No se pudo generar el PDF en este momento; descarga el informe en Word.")
        mime = "application/pdf"
    from urllib.parse import quote
    return Response(contenido, mimetype=mime, headers={
        "Content-Disposition": f"attachment; filename=\"informe.{formato}\"; filename*=UTF-8''{quote(nombre)}.{formato}",
        "Cache-Control": "no-store",
    })


# ─────────────────────────── Notas ───────────────────────────

@informes_bp.get("/<consultation_id>/comentarios")
@jwt_required()
def listar_comentarios_informe(consultation_id):
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    return jsonify({"comentarios": informe_consulta.comentarios_de(consulta.id)}), 200


@informes_bp.post("/<consultation_id>/comentarios")
@jwt_required()
@limiter.limit("30 per minute")
@validate_body(ComentarioInformeRequest)
def crear_comentario_informe(consultation_id, validated_body: ComentarioInformeRequest):
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    texto = validated_body.body.strip()
    if not texto:
        return _error(400, "La nota no puede estar vacía")
    seccion = validated_body.section if validated_body.section in SECCIONES else "general"
    if ConsultationComment.query.filter_by(consultation_id=consulta.id).count() >= MAX_COMENTARIOS:
        return _error(409, "Este informe ya tiene demasiadas notas.")
    comentario = ConsultationComment(consultation_id=consulta.id, author_id=user.id, section=seccion, body=texto)
    db.session.add(comentario)
    db.session.commit()
    notificaciones.nota_en_informe(consulta, user, _seguidores(consulta, user.id))
    return jsonify(comentario.to_dict(user)), 201


@informes_bp.delete("/<consultation_id>/comentarios/<comment_id>")
@jwt_required()
def borrar_comentario_informe(consultation_id, comment_id):
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    try:
        cid = uuid.UUID(comment_id)
    except ValueError:
        return _error(404, "Nota no encontrada")
    comentario = ConsultationComment.query.filter_by(id=cid, consultation_id=consulta.id).first()
    if comentario is None:
        return _error(404, "Nota no encontrada")
    if comentario.author_id != user.id:
        return _error(403, "Solo puedes borrar tus propias notas")
    db.session.delete(comentario)
    db.session.commit()
    return "", 204


# ─────────────────────────── Compartir ───────────────────────────

def _candidatos(consulta) -> list:
    """Compañeros y docentes de los cursos en que está matriculado el dueño."""
    cursos = [m.course_id for m in StudentCourse.query.filter_by(student_id=consulta.student_id).all()]
    if not cursos:
        return []
    por_usuario = {}
    nombres = {}
    for c in Course.query.filter(Course.id.in_(cursos)).all():
        nombres[c.id] = c.name
        por_usuario.setdefault(c.teacher_id, set()).add(c.name)
    for m in StudentCourse.query.filter(StudentCourse.course_id.in_(cursos)).all():
        if m.student_id != consulta.student_id:
            por_usuario.setdefault(m.student_id, set()).add(nombres.get(m.course_id, ""))
    usuarios = User.query.filter(User.id.in_(list(por_usuario))).all() if por_usuario else []
    return sorted(
        (_usuario_publico(u, {"cursos": sorted(n for n in por_usuario[u.id] if n)}) for u in usuarios if u.activo),
        key=lambda d: (d["role"] != "TEACHER", d["nombre"].lower()),
    )


def _estado_compartir(consulta) -> dict:
    filas = ConsultationShare.query.filter_by(consultation_id=consulta.id).order_by(ConsultationShare.created_at.asc()).all()
    usuarios = {u.id: u for u in User.query.filter(User.id.in_([f.user_id for f in filas])).all()} if filas else {}
    return {
        "compartido_con": [
            _usuario_publico(usuarios[f.user_id], {"via": f.via}) for f in filas if f.user_id in usuarios
        ],
        "enlace_token": consulta.share_token,
    }


@informes_bp.get("/<consultation_id>/compartir")
@jwt_required()
def estado_compartir(consultation_id):
    """Con quién está compartido, el enlace activo y a quién se le puede compartir (solo el dueño)."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DUENO":
        return _error(403, "Solo el estudiante dueño de la consulta puede compartirla")
    return jsonify({**_estado_compartir(consulta), "candidatos": _candidatos(consulta)}), 200


@informes_bp.post("/<consultation_id>/compartir")
@jwt_required()
@limiter.limit("30 per minute")
@validate_body(CompartirInformeRequest)
def compartir_informe(consultation_id, validated_body: CompartirInformeRequest):
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DUENO":
        return _error(403, "Solo el estudiante dueño de la consulta puede compartirla")
    permitidos = {c["id"] for c in _candidatos(consulta)}
    pedidos = {str(u) for u in validated_body.user_ids}
    if not pedidos <= permitidos:
        return _error(403, "Solo puedes compartir con compañeros y docentes de tus cursos")
    ya = {str(s.user_id) for s in ConsultationShare.query.filter_by(consultation_id=consulta.id).all()}
    nuevos = [uuid.UUID(u) for u in pedidos - ya]
    for uid in nuevos:
        db.session.add(ConsultationShare(consultation_id=consulta.id, user_id=uid, shared_by=user.id, via="DIRECTO"))
    db.session.commit()
    if nuevos:
        notificaciones.informe_compartido(consulta, user, nuevos)
    return jsonify(_estado_compartir(consulta)), 200


@informes_bp.delete("/<consultation_id>/compartir/<user_id>")
@jwt_required()
def dejar_de_compartir(consultation_id, user_id):
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DUENO":
        return _error(403, "Solo el estudiante dueño de la consulta puede dejar de compartirla")
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return _error(404, "Ese usuario no tiene acceso")
    ConsultationShare.query.filter_by(consultation_id=consulta.id, user_id=uid).delete()
    db.session.commit()
    return jsonify(_estado_compartir(consulta)), 200


@informes_bp.post("/<consultation_id>/compartir/enlace")
@jwt_required()
@limiter.limit("10 per minute")
def crear_enlace_informe(consultation_id):
    """Crea (o cambia) el enlace; el anterior deja de servir."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DUENO":
        return _error(403, "Solo el estudiante dueño de la consulta puede crear el enlace")
    consulta.share_token = secrets.token_urlsafe(24)
    db.session.commit()
    return jsonify(_estado_compartir(consulta)), 200


@informes_bp.delete("/<consultation_id>/compartir/enlace")
@jwt_required()
def quitar_enlace_informe(consultation_id):
    """Desactiva el enlace y quita el acceso a quienes entraron por él."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DUENO":
        return _error(403, "Solo el estudiante dueño de la consulta puede quitar el enlace")
    consulta.share_token = None
    ConsultationShare.query.filter_by(consultation_id=consulta.id, via="ENLACE").delete()
    db.session.commit()
    return jsonify(_estado_compartir(consulta)), 200


@informes_bp.post("/enlace/<token>")
@jwt_required()
@limiter.limit("20 per minute")
def abrir_enlace_informe(token):
    """Quien abre un enlace válido queda con acceso al informe."""
    user = get_current_user()
    consulta = Consultation.query.filter_by(share_token=token).first() if token and len(token) <= 64 else None
    if consulta is None or consulta.status != "COMPLETED":
        return _error(404, "El enlace no existe o ya no está activo")
    if _acceso(user, consulta) is None:
        db.session.add(ConsultationShare(consultation_id=consulta.id, user_id=user.id, shared_by=consulta.student_id, via="ENLACE"))
        db.session.commit()
    return jsonify({"consultation_id": str(consulta.id)}), 200


@informes_bp.get("/compartidos-conmigo")
@jwt_required()
def compartidos_conmigo():
    """Informes que otros compartieron con el usuario."""
    user = get_current_user()
    filas = (
        db.session.query(ConsultationShare, Consultation, User)
        .join(Consultation, Consultation.id == ConsultationShare.consultation_id)
        .join(User, User.id == Consultation.student_id)
        .filter(ConsultationShare.user_id == user.id, Consultation.status == "COMPLETED")
        .order_by(ConsultationShare.created_at.desc())
        .limit(200)
        .all()
    )
    return jsonify({"informes": [
        {**c.to_dict(), "estudiante": _usuario_publico(u), "via": s.via,
         "compartido_en": s.created_at.isoformat() if s.created_at else None}
        for s, c, u in filas
    ]}), 200


# ─────────────────────────── Nota del docente ───────────────────────────

@informes_bp.patch("/<consultation_id>/calificacion")
@jwt_required()
@limiter.limit("60 per minute")
@validate_body(CalificarCasoRequest)
def calificar_caso(consultation_id, validated_body: CalificarCasoRequest):
    """El docente del curso pone (o cambia) la nota de un caso asignado."""
    consulta, user, acceso, err = _informe_o_error(consultation_id)
    if err:
        return err
    if acceso != "DOCENTE":
        return _error(403, "Solo el docente del curso califica este caso")
    item = CourseContentItem.query.get(consulta.course_item_id) if consulta.course_item_id else None
    if item is None:
        return _error(409, "Esta consulta no es un caso asignado en un curso")
    maximo = float(item.max_score) if item.max_score is not None else 100.0
    if validated_body.teacher_score is not None and validated_body.teacher_score > maximo:
        return _error(400, f"La nota no puede superar {maximo:g}")
    nueva_nota = validated_body.teacher_score is not None and (
        consulta.teacher_score is None or float(consulta.teacher_score) != validated_body.teacher_score)
    consulta.teacher_score = validated_body.teacher_score
    if validated_body.teacher_feedback is not None:
        consulta.teacher_feedback = validated_body.teacher_feedback.strip() or None
    consulta.graded_at = datetime.now(timezone.utc) if consulta.teacher_score is not None else None
    db.session.commit()
    if nueva_nota:
        notificaciones.caso_calificado(consulta, item)
    return jsonify(informe_consulta.datos_informe(consulta)["caso_asignado"]), 200
