"""Anotaciones de los libros de la biblioteca: lo que cada usuario subraya o
dibuja en las páginas, y sus notas o comentarios sobre zonas de una página.
Son privadas: cada usuario lee y guarda solo las suyas, y solo en los libros
que puede ver (Article.visible_para)."""
import uuid

from flask import Blueprint, jsonify
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from app import db, limiter
from app.models import Article, ArticleAnnotation, ArticleNote
from app.schemas import ActualizarNotaRequest, CrearNotaRequest, GuardarAnotacionesRequest, validate_body
from app.services import limites

anotaciones_bp = Blueprint("anotaciones", __name__)

# Páginas posibles de un PDF de la biblioteca (Article.pages admite hasta 10000).
MAX_PAGINA = 10000


def _libro_visible(article_id):
    """(user_id, artículo) si el usuario puede ver el libro; (user_id, None) si no."""
    user_id = uuid.UUID(get_jwt_identity())
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return user_id, None
    article = Article.query.get(aid)
    if article is None or not article.visible_para(user_id, get_jwt().get("role")):
        return user_id, None
    return user_id, article


def _no_encontrado():
    return jsonify({"error": "Not Found", "message": "Artículo no encontrado", "status_code": 404}), 404


@anotaciones_bp.get("/<article_id>/anotaciones")
@jwt_required()
def listar(article_id):
    """Las anotaciones del usuario en ese libro, por número de página."""
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    filas = ArticleAnnotation.query.filter_by(user_id=user_id, article_id=article.id).all()
    return jsonify({"paginas": {str(f.page): f.strokes for f in filas}}), 200


@anotaciones_bp.put("/<article_id>/anotaciones/<pagina>")
@jwt_required()
@limiter.limit(limites.ANOTACIONES, key_func=limites.usuario_o_ip)
@validate_body(GuardarAnotacionesRequest)
def guardar(article_id, pagina, validated_body: GuardarAnotacionesRequest):
    """Reemplaza los trazos del usuario en una página. Sin trazos, la página queda limpia."""
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    try:
        pagina = int(pagina)
    except ValueError:
        pagina = 0
    if not 1 <= pagina <= MAX_PAGINA:
        return jsonify({"error": "Bad Request", "message": "Número de página fuera de rango.", "status_code": 400}), 400

    trazos = [t.model_dump() for t in validated_body.trazos]
    fila = ArticleAnnotation.query.get((user_id, article.id, pagina))
    if not trazos:
        if fila is not None:
            db.session.delete(fila)
    elif fila is None:
        db.session.add(ArticleAnnotation(user_id=user_id, article_id=article.id, page=pagina, strokes=trazos))
    else:
        fila.strokes = trazos
    db.session.commit()
    return jsonify({"pagina": pagina, "trazos": len(trazos)}), 200


# ── Notas y comentarios ──

def _nota_no_encontrada():
    return jsonify({"error": "Not Found", "message": "Nota no encontrada", "status_code": 404}), 404


def _nota_propia(user_id, article, nota_id):
    """La nota, si es de este usuario y de este libro; si no, None."""
    try:
        nid = uuid.UUID(nota_id)
    except (ValueError, AttributeError):
        return None
    return ArticleNote.query.filter_by(id=nid, user_id=user_id, article_id=article.id).first()


@anotaciones_bp.get("/<article_id>/notas")
@jwt_required()
def listar_notas(article_id):
    """Las notas del usuario en ese libro, por página."""
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    notas = (ArticleNote.query.filter_by(user_id=user_id, article_id=article.id)
             .order_by(ArticleNote.page.asc(), ArticleNote.created_at.asc()).all())
    return jsonify({"notas": [n.to_dict() for n in notas]}), 200


@anotaciones_bp.post("/<article_id>/notas")
@jwt_required()
@limiter.limit(limites.NOTAS, key_func=limites.usuario_o_ip)
@validate_body(CrearNotaRequest)
def crear_nota(article_id, validated_body: CrearNotaRequest):
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    nota = ArticleNote(
        id=uuid.uuid4(),
        user_id=user_id,
        article_id=article.id,
        page=validated_body.pagina,
        rect=validated_body.rect.model_dump(),
        quote=(validated_body.cita or "").strip() or None,
        body=validated_body.texto.strip(),
        color=validated_body.color,
    )
    db.session.add(nota)
    db.session.commit()
    return jsonify(nota.to_dict()), 201


@anotaciones_bp.patch("/<article_id>/notas/<nota_id>")
@jwt_required()
@limiter.limit(limites.NOTAS, key_func=limites.usuario_o_ip)
@validate_body(ActualizarNotaRequest)
def editar_nota(article_id, nota_id, validated_body: ActualizarNotaRequest):
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    nota = _nota_propia(user_id, article, nota_id)
    if nota is None:
        return _nota_no_encontrada()
    if validated_body.texto is not None:
        nota.body = validated_body.texto.strip()
    if validated_body.color is not None:
        nota.color = validated_body.color
    db.session.commit()
    return jsonify(nota.to_dict()), 200


@anotaciones_bp.delete("/<article_id>/notas/<nota_id>")
@jwt_required()
@limiter.limit(limites.NOTAS, key_func=limites.usuario_o_ip)
def borrar_nota(article_id, nota_id):
    user_id, article = _libro_visible(article_id)
    if article is None:
        return _no_encontrado()
    nota = _nota_propia(user_id, article, nota_id)
    if nota is None:
        return _nota_no_encontrada()
    db.session.delete(nota)
    db.session.commit()
    return jsonify({"mensaje": "Nota eliminada"}), 200
