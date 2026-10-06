from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models import Article, ArticleTag, StudentLibrary
from app.models.article import ARTICLE_TYPES
from app.models.student_library import SHELF_STATUSES
from app.schemas import (
    ArticleResponse,
    CreateArticleRequest,
    StudentShelfItem,
    UpdateShelfRequest,
    validate_body,
)
from app.utils import get_current_user, role_required

articulos_bp = Blueprint("articulos", __name__)


def _tags_for(article_id):
    return [t.tag for t in ArticleTag.query.filter_by(article_id=article_id).all()]


@articulos_bp.get("")
@jwt_required()
def listar():
    query = Article.query

    type_filter = request.args.get("type")
    if type_filter:
        query = query.filter(Article.type == type_filter.upper())

    specialty = request.args.get("specialty")
    if specialty:
        query = query.filter(Article.specialty.ilike(f"%{specialty}%"))

    search = request.args.get("q")
    if search:
        query = query.filter(Article.title.ilike(f"%{search}%"))

    tag = request.args.get("tag")
    if tag:
        query = query.join(ArticleTag, ArticleTag.article_id == Article.id).filter(ArticleTag.tag == tag)

    articles = query.order_by(Article.created_at.desc()).all()
    return jsonify([a.to_dict(tags=_tags_for(a.id)) for a in articles]), 200


@articulos_bp.post("")
@role_required("TEACHER", "ADMIN")
@validate_body(CreateArticleRequest)
def crear(validated_body: CreateArticleRequest):
    user = get_current_user()

    article = Article(
        type="GUIA",
        title=validated_body.title.strip(),
        description=validated_body.summary or (validated_body.content[:200] if validated_body.content else ""),
        specialty=validated_body.specialty,
        url=f"/library/{validated_body.title.lower().replace(' ', '-')}",
        created_by=user.id,
    )
    db.session.add(article)
    db.session.flush()

    for tag in validated_body.tags:
        db.session.add(ArticleTag(article_id=article.id, tag=tag.strip().upper()))

    db.session.commit()
    res = article.to_dict(tags=_tags_for(article.id))
    res["content"] = validated_body.content
    res["summary"] = validated_body.summary
    return jsonify(res), 201


@articulos_bp.get("/<article_id>")
@jwt_required()
def obtener(article_id):
    article = Article.query.get(article_id)
    if article is None:
        return jsonify({
            "error": "Not Found",
            "message": "Artículo no encontrado",
            "status_code": 404
        }), 404
    return jsonify(article.to_dict(tags=_tags_for(article.id))), 200


@articulos_bp.get("/estante")
@role_required("STUDENT")
def obtener_estante():
    user = get_current_user()
    entries = StudentLibrary.query.filter_by(student_id=user.id).all()
    return jsonify([e.to_dict() for e in entries]), 200


@articulos_bp.post("/<article_id>/estante")
@role_required("STUDENT")
@validate_body(UpdateShelfRequest)
def guardar_en_estante(article_id, validated_body: UpdateShelfRequest):
    user = get_current_user()
    status = validated_body.status

    if Article.query.get(article_id) is None:
        return jsonify({
            "error": "Not Found",
            "message": "Artículo no encontrado",
            "status_code": 404
        }), 404

    entry = StudentLibrary.query.filter_by(student_id=user.id, article_id=article_id).first()
    if entry is None:
        entry = StudentLibrary(student_id=user.id, article_id=article_id, status=status)
        db.session.add(entry)
    else:
        entry.status = status

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@articulos_bp.delete("/<article_id>/estante")
@role_required("STUDENT")
def quitar_de_estante(article_id):
    user = get_current_user()
    entry = StudentLibrary.query.filter_by(student_id=user.id, article_id=article_id).first()
    if entry is None:
        return jsonify({
            "error": "Not Found",
            "message": "Ese artículo no está en tu estante",
            "status_code": 404
        }), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Quitado del estante"}), 200

