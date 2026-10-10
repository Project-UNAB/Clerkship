from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from app import db
from app.models import CommunityComment, CommunityLike, CommunityPost, User
from app.schemas import (
    CommunityCommentResponse,
    CommunityPostResponse,
    CreateCommentRequest,
    CreatePostRequest,
    LikeResponse,
    validate_body,
)
from app.utils import get_current_user

comunidad_bp = Blueprint("comunidad", __name__)


def _post_dict(post):
    like_count = CommunityLike.query.filter_by(post_id=post.id).count()
    comment_count = CommunityComment.query.filter_by(post_id=post.id).count()
    author = User.query.get(post.author_id)
    author_name = f"{author.first_name} {author.last_name}" if author else "Usuario"
    d = post.to_dict(like_count=like_count, comment_count=comment_count)
    d["author_name"] = author_name
    d["title"] = getattr(post, "title", post.content[:50] if post.content else "Discusión")
    d["likes_count"] = like_count
    d["comments_count"] = comment_count
    return d


@comunidad_bp.get("/posts")
@jwt_required()
def listar_posts():
    posts = CommunityPost.query.order_by(CommunityPost.created_at.desc()).all()
    return jsonify([_post_dict(p) for p in posts]), 200


@comunidad_bp.post("/posts")
@jwt_required()
@validate_body(CreatePostRequest)
def crear_post(validated_body: CreatePostRequest):
    user = get_current_user()
    content = validated_body.content.strip()

    post = CommunityPost(author_id=user.id, content=content)
    db.session.add(post)
    db.session.commit()

    return jsonify(_post_dict(post)), 201


@comunidad_bp.delete("/posts/<post_id>")
@jwt_required()
def eliminar_post(post_id):
    user = get_current_user()
    post = CommunityPost.query.get(post_id)

    if post is None:
        return jsonify({
            "error": "Not Found",
            "message": "Publicación no encontrada",
            "status_code": 404
        }), 404
    if str(post.author_id) != str(user.id):
        return jsonify({
            "error": "Forbidden",
            "message": "Solo puedes eliminar tus propias publicaciones",
            "status_code": 403
        }), 403

    db.session.delete(post)
    db.session.commit()
    return jsonify({"message": "Publicación eliminada"}), 200


@comunidad_bp.get("/posts/<post_id>/comentarios")
@jwt_required()
def listar_comentarios(post_id):
    comments = CommunityComment.query.filter_by(post_id=post_id).order_by(CommunityComment.created_at.asc()).all()
    # Los autores, en una sola consulta (antes era una por comentario).
    autor_ids = {c.author_id for c in comments}
    autores = {str(u.id): u for u in User.query.filter(User.id.in_(autor_ids)).all()} if autor_ids else {}
    res = []
    for c in comments:
        cd = c.to_dict()
        author = autores.get(str(c.author_id))
        cd["author_name"] = f"{author.first_name} {author.last_name}" if author else "Usuario"
        res.append(cd)
    return jsonify(res), 200


@comunidad_bp.post("/posts/<post_id>/comentarios")
@jwt_required()
@validate_body(CreateCommentRequest)
def crear_comentario(post_id, validated_body: CreateCommentRequest):
    user = get_current_user()
    content = validated_body.content.strip()

    if CommunityPost.query.get(post_id) is None:
        return jsonify({
            "error": "Not Found",
            "message": "Publicación no encontrada",
            "status_code": 404
        }), 404

    comment = CommunityComment(post_id=post_id, author_id=user.id, content=content)
    db.session.add(comment)
    db.session.commit()

    cd = comment.to_dict()
    cd["author_name"] = f"{user.first_name} {user.last_name}"
    return jsonify(cd), 201


@comunidad_bp.post("/posts/<post_id>/like")
@jwt_required()
def alternar_like(post_id):
    user = get_current_user()

    if CommunityPost.query.get(post_id) is None:
        return jsonify({
            "error": "Not Found",
            "message": "Publicación no encontrada",
            "status_code": 404
        }), 404

    like = CommunityLike.query.filter_by(post_id=post_id, user_id=user.id).first()
    if like is None:
        db.session.add(CommunityLike(post_id=post_id, user_id=user.id))
        db.session.commit()
        like_count = CommunityLike.query.filter_by(post_id=post_id).count()
        return jsonify({"liked": True, "likes_count": like_count}), 200

    db.session.delete(like)
    db.session.commit()
    like_count = CommunityLike.query.filter_by(post_id=post_id).count()
    return jsonify({"liked": False, "likes_count": like_count}), 200

