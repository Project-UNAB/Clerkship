"""
Foro de avisos de un curso — equivalente al foro "Avisos" que Moodle crea
por defecto en todo curso. El docente dueño publica anuncios (puede
fijarlos arriba con `pinned`); cualquier matriculado (o el propio docente)
puede comentarlos.
"""
from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required

from app import db
from app.models import Course, CourseAnnouncement, CourseAnnouncementComment, StudentCourse, User
from app.schemas import ActualizarAvisoRequest, CrearAvisoRequest, CrearComentarioAvisoRequest, validate_body
from app.services import notificaciones, paginacion
from app.services.sanitize import sanitizar_html
from app.utils import get_current_user, role_required

curso_avisos_bp = Blueprint("curso_avisos", __name__)


def _curso_o_404(course_id):
    course = Course.query.get(course_id)
    if course is None:
        return None, (jsonify({"error": "Not Found", "message": "Curso no encontrado", "status_code": 404}), 404)
    return course, None


def _es_docente_dueno(user, course) -> bool:
    return user.role == "TEACHER" and str(course.teacher_id) == str(user.id)


def _puede_ver(user, course) -> bool:
    if _es_docente_dueno(user, course):
        return True
    if user.role == "STUDENT":
        return StudentCourse.query.filter_by(student_id=user.id, course_id=course.id).first() is not None
    return False


def _forbidden():
    return jsonify({"error": "Forbidden", "message": "No tienes acceso a este curso", "status_code": 403}), 403


def _aviso_o_404(course_id, announcement_id):
    aviso = CourseAnnouncement.query.filter_by(id=announcement_id, course_id=course_id).first()
    if aviso is None:
        return None, (jsonify({"error": "Not Found", "message": "Aviso no encontrado", "status_code": 404}), 404)
    return aviso, None


# ─────────────────────────── Avisos ───────────────────────────

@curso_avisos_bp.get("/<course_id>/avisos")
@jwt_required()
def listar_avisos(course_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    page, per_page = paginacion.parametros()
    avisos, total = paginacion.paginar(
        CourseAnnouncement.query.filter_by(course_id=course_id)
        # Fijados primero; el desempate por id deja el orden estable entre páginas.
        .order_by(CourseAnnouncement.pinned.desc(), CourseAnnouncement.created_at.desc(), CourseAnnouncement.id.asc()),
        page, per_page,
    )

    autor_ids = [a.author_id for a in avisos]
    autores = {str(u.id): u for u in User.query.filter(User.id.in_(autor_ids)).all()} if autor_ids else {}

    conteos = {}
    if avisos:
        filas = (
            db.session.query(CourseAnnouncementComment.announcement_id, db.func.count(CourseAnnouncementComment.id))
            .filter(CourseAnnouncementComment.announcement_id.in_([a.id for a in avisos]))
            .group_by(CourseAnnouncementComment.announcement_id)
            .all()
        )
        conteos = {str(aid): count for aid, count in filas}

    return jsonify({
        "avisos": [
            a.to_dict(author=autores.get(str(a.author_id)), comment_count=conteos.get(str(a.id), 0))
            for a in avisos
        ],
        **paginacion.meta(total, page, per_page),
    }), 200


@curso_avisos_bp.post("/<course_id>/avisos")
@role_required("TEACHER")
@validate_body(CrearAvisoRequest)
def crear_aviso(course_id, validated_body: CrearAvisoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()

    aviso = CourseAnnouncement(
        course_id=course_id,
        author_id=user.id,
        title=validated_body.title.strip(),
        body=sanitizar_html(validated_body.body),
        pinned=bool(validated_body.pinned),
    )
    db.session.add(aviso)
    db.session.commit()
    # Después del commit y en su propia transacción: avisar no puede tumbar la publicación.
    notificaciones.aviso_publicado(course, aviso)

    return jsonify(aviso.to_dict(author=user, comment_count=0)), 201


@curso_avisos_bp.patch("/<course_id>/avisos/<announcement_id>")
@role_required("TEACHER")
@validate_body(ActualizarAvisoRequest)
def actualizar_aviso(course_id, announcement_id, validated_body: ActualizarAvisoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    aviso, err = _aviso_o_404(course_id, announcement_id)
    if err:
        return err

    if validated_body.title is not None:
        aviso.title = validated_body.title.strip()
    if validated_body.body is not None:
        aviso.body = sanitizar_html(validated_body.body)
    if validated_body.pinned is not None:
        aviso.pinned = validated_body.pinned

    db.session.commit()
    return jsonify(aviso.to_dict(author=user)), 200


@curso_avisos_bp.delete("/<course_id>/avisos/<announcement_id>")
@role_required("TEACHER")
def borrar_aviso(course_id, announcement_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _es_docente_dueno(user, course):
        return _forbidden()
    aviso, err = _aviso_o_404(course_id, announcement_id)
    if err:
        return err

    db.session.delete(aviso)
    db.session.commit()
    return jsonify({"ok": True}), 200


# ─────────────────────────── Comentarios ───────────────────────────

@curso_avisos_bp.get("/<course_id>/avisos/<announcement_id>/comentarios")
@jwt_required()
def listar_comentarios(course_id, announcement_id):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    _aviso, err = _aviso_o_404(course_id, announcement_id)
    if err:
        return err

    comentarios = (
        CourseAnnouncementComment.query.filter_by(announcement_id=announcement_id)
        .order_by(CourseAnnouncementComment.created_at.asc())
        .all()
    )
    autor_ids = [c.author_id for c in comentarios]
    autores = {str(u.id): u for u in User.query.filter(User.id.in_(autor_ids)).all()} if autor_ids else {}

    return jsonify({
        "comentarios": [c.to_dict(author=autores.get(str(c.author_id))) for c in comentarios]
    }), 200


@curso_avisos_bp.post("/<course_id>/avisos/<announcement_id>/comentarios")
@jwt_required()
@validate_body(CrearComentarioAvisoRequest)
def crear_comentario(course_id, announcement_id, validated_body: CrearComentarioAvisoRequest):
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()
    _aviso, err = _aviso_o_404(course_id, announcement_id)
    if err:
        return err

    comentario = CourseAnnouncementComment(
        announcement_id=announcement_id,
        author_id=user.id,
        content=validated_body.content.strip(),
    )
    db.session.add(comentario)
    db.session.commit()

    return jsonify(comentario.to_dict(author=user)), 201


@curso_avisos_bp.delete("/<course_id>/avisos/<announcement_id>/comentarios/<comment_id>")
@jwt_required()
def borrar_comentario(course_id, announcement_id, comment_id):
    """El autor del comentario, o el docente dueño del curso, pueden borrarlo."""
    user = get_current_user()
    course, err = _curso_o_404(course_id)
    if err:
        return err
    if not _puede_ver(user, course):
        return _forbidden()

    comentario = CourseAnnouncementComment.query.filter_by(id=comment_id, announcement_id=announcement_id).first()
    if comentario is None:
        return jsonify({"error": "Not Found", "message": "Comentario no encontrado", "status_code": 404}), 404

    es_autor = str(comentario.author_id) == str(user.id)
    if not es_autor and not _es_docente_dueno(user, course):
        return _forbidden()

    db.session.delete(comentario)
    db.session.commit()
    return jsonify({"ok": True}), 200
