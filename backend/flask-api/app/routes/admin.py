"""Panel de administrador. Todas las rutas exigen rol ADMIN.

Cuentas ADMIN no se crean por el registro público — se asignan a mano
(cambiando el rol de una cuenta ya existente, desde este mismo panel o
directo en Supabase la primera vez)."""
import uuid
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request

from app import db
from app.models import (
    AgenteUsoTokens, Article, CommunityComment, CommunityLike, CommunityPost, Consultation, Course,
    FeedbackBiblioteca, FeedbackCasos, FeedbackHistorial,
    FeedbackInicio, Student, Teacher, User, UserFile,
    ValidacionBiblioteca, ValidacionCasos, ValidacionHistorial, ValidacionInicio,
)
from app.schemas import ActualizarUsuarioRequest, validate_body
from app.utils import get_current_user, role_required

admin_bp = Blueprint("admin", __name__)

FEEDBACK_MODELOS = {
    "inicio": FeedbackInicio, "casos": FeedbackCasos,
    "historial": FeedbackHistorial, "biblioteca": FeedbackBiblioteca,
}
VALIDACION_MODELOS = {
    "inicio": ValidacionInicio, "casos": ValidacionCasos,
    "historial": ValidacionHistorial, "biblioteca": ValidacionBiblioteca,
}
AGENTES_SIMULADOR = ("GENERADOR", "PACIENTE", "EVALUADOR")


def _error(status: int, mensaje: str):
    nombres = {400: "Bad Request", 403: "Forbidden", 404: "Not Found"}
    return jsonify({"error": nombres.get(status, "Error"), "message": mensaje, "status_code": status}), status


def _fila_a_dict(fila) -> dict:
    """Convierte cualquier fila de SQLAlchemy a dict, genérico — lo usan
    feedback y validación, que tienen columnas distintas por pestaña."""
    d = {}
    for col in fila.__table__.columns:
        valor = getattr(fila, col.name)
        if hasattr(valor, "isoformat"):
            valor = valor.isoformat()
        elif isinstance(valor, uuid.UUID):
            valor = str(valor)
        d[col.name] = valor
    return d


@admin_bp.get("/estadisticas")
@role_required("ADMIN")
def estadisticas():
    usuarios_por_rol = dict(
        db.session.query(User.role, db.func.count(User.id)).group_by(User.role).all()
    )
    hace_7_dias = datetime.now(timezone.utc) - timedelta(days=7)
    sesiones_7_dias = Consultation.query.filter(Consultation.started_at >= hace_7_dias).count()
    espacio_usado = int(
        db.session.query(db.func.coalesce(db.func.sum(UserFile.size_bytes), 0))
        .filter(UserFile.estado == "LISTO").scalar() or 0
    )

    return jsonify({
        "usuarios": {
            "total": sum(usuarios_por_rol.values()),
            "por_rol": usuarios_por_rol,
            "activos": User.query.filter_by(activo=True).count(),
            "desactivados": User.query.filter_by(activo=False).count(),
        },
        "casos_clinicos": {
            "total": Consultation.query.count(),
            "completados": Consultation.query.filter_by(status="COMPLETED").count(),
            "en_progreso": Consultation.query.filter_by(status="IN_PROGRESS").count(),
            "ultimos_7_dias": sesiones_7_dias,
        },
        "cursos": Course.query.count(),
        "biblioteca": {
            "articulos": Article.query.count(),
        },
        "comunidad": {
            "publicaciones": CommunityPost.query.count(),
            "comentarios": CommunityComment.query.count(),
        },
        "retroalimentacion": {p: m.query.count() for p, m in FEEDBACK_MODELOS.items()},
        "validacion_expertos": {p: m.query.count() for p, m in VALIDACION_MODELOS.items()},
        "almacenamiento": {
            "archivos": UserFile.query.filter_by(estado="LISTO").count(),
            "bytes_usados": espacio_usado,
        },
    }), 200


@admin_bp.get("/usuarios")
@role_required("ADMIN")
def listar_usuarios():
    query = User.query
    role = request.args.get("role")
    if role:
        query = query.filter(User.role == role.upper())
    activo = request.args.get("activo")
    if activo is not None:
        query = query.filter(User.activo == (activo.lower() in ("1", "true", "si", "sí")))
    q = request.args.get("q")
    if q:
        like = f"%{q}%"
        query = query.filter(db.or_(User.email.ilike(like), User.first_name.ilike(like), User.last_name.ilike(like), User.username.ilike(like)))

    limit = min(int(request.args.get("limit", 100)), 300)
    usuarios = query.order_by(User.created_at.desc()).limit(limit).all()
    return jsonify({"usuarios": [u.to_dict() for u in usuarios]}), 200


@admin_bp.patch("/usuarios/<user_id>")
@role_required("ADMIN")
@validate_body(ActualizarUsuarioRequest)
def actualizar_usuario(user_id, validated_body: ActualizarUsuarioRequest):
    admin = get_current_user()
    try:
        usuario = User.query.get(uuid.UUID(user_id))
    except ValueError:
        usuario = None
    if usuario is None:
        return _error(404, "Usuario no encontrado.")

    es_uno_mismo = str(usuario.id) == str(admin.id)

    if validated_body.activo is not None:
        if es_uno_mismo and not validated_body.activo:
            return _error(400, "No puedes desactivar tu propia cuenta.")
        usuario.activo = validated_body.activo

    if validated_body.role is not None:
        if es_uno_mismo and validated_body.role != "ADMIN":
            return _error(400, "No puedes quitarte el rol de administrador a ti mismo.")
        nuevo_rol = validated_body.role
        rol_anterior = usuario.role
        if nuevo_rol != rol_anterior:
            # STUDENT/TEACHER tienen una fila propia en students/teachers —
            # si cambia el rol, hay que mantenerlas en sincronía.
            if rol_anterior == "STUDENT":
                Student.query.filter_by(user_id=usuario.id).delete()
            elif rol_anterior == "TEACHER":
                Teacher.query.filter_by(user_id=usuario.id).delete()
            if nuevo_rol == "STUDENT" and Student.query.get(usuario.id) is None:
                db.session.add(Student(user_id=usuario.id, student_code=f"ADM-{str(usuario.id)[:8].upper()}"))
            elif nuevo_rol == "TEACHER" and Teacher.query.get(usuario.id) is None:
                db.session.add(Teacher(user_id=usuario.id))
            usuario.role = nuevo_rol

    db.session.commit()
    return jsonify({"usuario": usuario.to_dict()}), 200


@admin_bp.get("/comunidad/posts")
@role_required("ADMIN")
def listar_posts_admin():
    posts = CommunityPost.query.order_by(CommunityPost.created_at.desc()).limit(200).all()
    resultado = []
    for p in posts:
        autor = User.query.get(p.author_id)
        d = p.to_dict(
            like_count=CommunityLike.query.filter_by(post_id=p.id).count(),
            comment_count=CommunityComment.query.filter_by(post_id=p.id).count(),
        )
        d["author_name"] = f"{autor.first_name} {autor.last_name}" if autor else "Usuario"
        d["author_email"] = autor.email if autor else None
        resultado.append(d)
    return jsonify({"posts": resultado}), 200


@admin_bp.delete("/comunidad/posts/<post_id>")
@role_required("ADMIN")
def borrar_post_admin(post_id):
    post = CommunityPost.query.get(post_id)
    if post is None:
        return _error(404, "Publicación no encontrada.")
    db.session.delete(post)
    db.session.commit()
    return jsonify({"ok": True}), 200


@admin_bp.delete("/comunidad/comentarios/<comentario_id>")
@role_required("ADMIN")
def borrar_comentario_admin(comentario_id):
    comentario = CommunityComment.query.get(comentario_id)
    if comentario is None:
        return _error(404, "Comentario no encontrado.")
    db.session.delete(comentario)
    db.session.commit()
    return jsonify({"ok": True}), 200


@admin_bp.get("/biblioteca")
@role_required("ADMIN")
def listar_biblioteca_admin():
    articulos = Article.query.order_by(Article.created_at.desc()).limit(300).all()
    return jsonify({"articulos": [a.to_dict(tags=[]) for a in articulos]}), 200


@admin_bp.delete("/biblioteca/<article_id>")
@role_required("ADMIN")
def borrar_articulo_admin(article_id):
    articulo = Article.query.get(article_id)
    if articulo is None:
        return _error(404, "Recurso no encontrado.")
    db.session.delete(articulo)
    db.session.commit()
    return jsonify({"ok": True}), 200


@admin_bp.get("/feedback/<pestana>")
@role_required("ADMIN")
def listar_feedback_admin(pestana):
    modelo = FEEDBACK_MODELOS.get(pestana)
    if modelo is None:
        return _error(404, "Pestaña no válida.")
    filas = modelo.query.order_by(modelo.created_at.desc()).limit(200).all()
    return jsonify({"respuestas": [_fila_a_dict(f) for f in filas]}), 200


@admin_bp.get("/validacion/<pestana>")
@role_required("ADMIN")
def listar_validacion_admin(pestana):
    modelo = VALIDACION_MODELOS.get(pestana)
    if modelo is None:
        return _error(404, "Pestaña no válida.")
    filas = modelo.query.order_by(modelo.created_at.desc()).limit(200).all()
    return jsonify({"respuestas": [_fila_a_dict(f) for f in filas]}), 200


@admin_bp.get("/tokens")
@role_required("ADMIN")
def estadisticas_tokens():
    """Uso de tokens de los 3 agentes del simulador (Generador, Paciente,
    Evaluador), divididos por agente, más un resumen general y una serie
    diaria de los últimos 14 días para graficar."""
    por_agente = {}
    for ag in AGENTES_SIMULADOR:
        total = AgenteUsoTokens.query.filter_by(agente=ag).count()
        reales = AgenteUsoTokens.query.filter_by(agente=ag, es_mock=False).count()
        prompt_t, completion_t, total_t, latencia_prom = db.session.query(
            db.func.coalesce(db.func.sum(AgenteUsoTokens.prompt_tokens), 0),
            db.func.coalesce(db.func.sum(AgenteUsoTokens.completion_tokens), 0),
            db.func.coalesce(db.func.sum(AgenteUsoTokens.total_tokens), 0),
            db.func.avg(AgenteUsoTokens.latency_ms),
        ).filter(AgenteUsoTokens.agente == ag).one()
        por_agente[ag] = {
            "llamadas": total,
            "llamadas_reales": reales,
            "llamadas_mock": total - reales,
            "prompt_tokens": int(prompt_t),
            "completion_tokens": int(completion_t),
            "total_tokens": int(total_t),
            "latencia_prom_ms": round(float(latencia_prom), 1) if latencia_prom is not None else None,
        }

    general = {
        "llamadas": sum(v["llamadas"] for v in por_agente.values()),
        "llamadas_reales": sum(v["llamadas_reales"] for v in por_agente.values()),
        "llamadas_mock": sum(v["llamadas_mock"] for v in por_agente.values()),
        "prompt_tokens": sum(v["prompt_tokens"] for v in por_agente.values()),
        "completion_tokens": sum(v["completion_tokens"] for v in por_agente.values()),
        "total_tokens": sum(v["total_tokens"] for v in por_agente.values()),
    }

    por_proveedor = dict(
        db.session.query(AgenteUsoTokens.proveedor, db.func.count(AgenteUsoTokens.id))
        .group_by(AgenteUsoTokens.proveedor).all()
    )

    desde = datetime.now(timezone.utc) - timedelta(days=14)
    filas = AgenteUsoTokens.query.filter(AgenteUsoTokens.created_at >= desde).all()
    serie: dict = {}
    for f in filas:
        if not f.created_at:
            continue
        dia = f.created_at.date().isoformat()
        bucket = serie.setdefault(dia, {"GENERADOR": 0, "PACIENTE": 0, "EVALUADOR": 0})
        bucket[f.agente] = bucket.get(f.agente, 0) + (f.total_tokens or 0)
    serie_diaria = [
        {"fecha": dia, **valores, "total": sum(valores.values())}
        for dia, valores in sorted(serie.items())
    ]

    return jsonify({
        "general": general,
        "por_agente": por_agente,
        "por_proveedor": por_proveedor,
        "serie_diaria": serie_diaria,
    }), 200
