import uuid

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt, get_jwt_identity, jwt_required

from app import db, limiter, storage
from app.models import Article, ArticleFavorite, ArticleTag, StudentLibrary
from app.models.article import ARTICLE_TYPES
from app.models.student_library import SHELF_STATUSES
from app.schemas import (
    ActualizarArticuloRequest,
    ArticleResponse,
    CreateArticleRequest,
    StudentShelfItem,
    UpdateShelfRequest,
    validate_body,
)
from app.services import limites, paginacion, portadas
from app.utils import role_required

articulos_bp = Blueprint("articulos", __name__)


def _tags_for(article_id):
    return [t.tag for t in ArticleTag.query.filter_by(article_id=article_id).all()]


def _tags_de(article_ids) -> dict:
    """Etiquetas de varios artículos en una sola consulta (el listado completo de
    la biblioteca tiene cientos de recursos: una consulta por cada uno se notaba)."""
    ids = list(article_ids)
    tags = {aid: [] for aid in ids}
    if ids:
        for t in ArticleTag.query.filter(ArticleTag.article_id.in_(ids)).all():
            tags.setdefault(t.article_id, []).append(t.tag)
    return tags


def _quien():
    """(id, rol) del usuario, tal como vienen en el token: el mismo rol con el
    que role_required decide el acceso, sin otra consulta a la base."""
    return uuid.UUID(get_jwt_identity()), get_jwt().get("role")


def claves_en_r2(article) -> list:
    """El PDF, la portada y su miniatura de un recurso (las que existan)."""
    claves = [article.archivo_key]
    if article.portada_key:
        claves += [article.portada_key, portadas.clave_miniatura(article.portada_key)]
    return [c for c in claves if c]


def borrar_de_r2(claves) -> None:
    for clave in claves:
        try:
            storage.borrar(clave)
        except Exception:  # noqa: BLE001 — el cambio ya se confirmó; queda un objeto huérfano en R2
            current_app.logger.warning("No se pudo borrar un objeto de R2 de la biblioteca.")


def _no_encontrado():
    return jsonify({
        "error": "Not Found",
        "message": "Artículo no encontrado",
        "status_code": 404
    }), 404


@articulos_bp.get("")
@jwt_required()
def listar():
    user_id, rol = _quien()
    query = Article.query
    if rol != "ADMIN":
        # Solo para no traer de más: la regla de verdad es Article.visible_para.
        query = query.filter(db.or_(
            Article.estado == "APROBADO", Article.created_by == user_id, Article.publicado_por == user_id,
        ))

    type_filter = request.args.get("type")
    if type_filter:
        query = query.filter(Article.type == type_filter.upper())

    idioma = request.args.get("idioma")
    if idioma in ("es", "en"):
        query = query.filter(Article.language == idioma)

    specialty = request.args.get("specialty")
    if specialty:
        query = query.filter(Article.specialty.ilike(f"%{specialty}%"))

    search = request.args.get("q")
    if search:
        query = query.filter(Article.title.ilike(f"%{search}%"))

    tag = request.args.get("tag")
    if tag:
        query = query.join(ArticleTag, ArticleTag.article_id == Article.id).filter(ArticleTag.tag == tag)

    query_ordenada = query.order_by(Article.created_at.desc(), Article.id.asc())

    # Paginación opcional: si no se mandan parámetros, se devuelve la lista completa
    if paginacion.pidio_paginacion():
        page, per_page = paginacion.parametros()
        filas, total = paginacion.paginar(query_ordenada, page, per_page)
        tags = _tags_de(a.id for a in filas)
        return jsonify({
            "articulos": [
                a.to_dict(tags=tags.get(a.id, []), incluir_motivo=a.detalle_de_revision_para(user_id, rol))
                for a in filas
            ],
            **paginacion.meta(total, page, per_page),
        }), 200

    articles = [a for a in query_ordenada.all() if a.visible_para(user_id, rol)]
    tags = _tags_de(a.id for a in articles)
    return jsonify([
        a.to_dict(tags=tags.get(a.id, []), incluir_motivo=a.detalle_de_revision_para(user_id, rol))
        for a in articles
    ]), 200


@articulos_bp.post("")
@role_required("TEACHER", "ADMIN")
@validate_body(CreateArticleRequest)
def crear(validated_body: CreateArticleRequest):
    uid, rol = _quien()
    # Lo que sube un ADMIN queda APROBADO; cualquier otro usuario queda PENDIENTE.
    estado = "APROBADO" if rol == "ADMIN" else "PENDIENTE"

    article = Article(
        type="GUIA",
        title=validated_body.title.strip(),
        description=validated_body.summary or (validated_body.content[:200] if validated_body.content else ""),
        specialty=validated_body.specialty,
        url=f"/library/{validated_body.title.lower().replace(' ', '-')}",
        created_by=uid,
        publicado_por=uid,
        estado=estado,
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
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()

    user_id, rol = _quien()
    article = Article.query.get(aid)
    if article is None or not article.visible_para(user_id, rol):
        return _no_encontrado()
    return jsonify(
        article.to_dict(tags=_tags_for(article.id), incluir_motivo=article.detalle_de_revision_para(user_id, rol))
    ), 200


@articulos_bp.patch("/<article_id>")
@jwt_required()
@validate_body(ActualizarArticuloRequest)
def editar(article_id, validated_body: ActualizarArticuloRequest):
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()

    user_id, rol = _quien()
    article = Article.query.get(aid)
    if article is None or not article.visible_para(user_id, rol):
        return _no_encontrado()

    # Solo el autor o un administrador pueden editar el recurso
    if not (article.es_autor(user_id) or rol == "ADMIN"):
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes permiso para modificar este artículo",
            "status_code": 403,
        }), 403

    if validated_body.title is not None:
        article.title = validated_body.title.strip()
    if validated_body.authors is not None:
        article.authors = validated_body.authors.strip() if validated_body.authors else None
    if validated_body.year is not None:
        article.year = validated_body.year
    if validated_body.pages is not None:
        article.pages = validated_body.pages
    if validated_body.description is not None:
        article.description = validated_body.description.strip() if validated_body.description else None
    if validated_body.idioma is not None:
        article.language = validated_body.idioma

    # Lo que edita el autor vuelve a revisión: si estaba aprobado, para revisar el cambio; si estaba
    # rechazado, porque corregirlo es volver a presentarlo. Lo que edita un ADMIN conserva su estado.
    if rol != "ADMIN" and article.estado in ("APROBADO", "RECHAZADO"):
        article.estado = "PENDIENTE"
        article.revisado_por = None
        article.revisado_en = None
        article.motivo_rechazo = None

    db.session.commit()
    return jsonify(
        article.to_dict(tags=_tags_for(article.id), incluir_motivo=article.detalle_de_revision_para(user_id, rol))
    ), 200


@articulos_bp.delete("/<article_id>")
@jwt_required()
def retirar(article_id):
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()

    user_id, rol = _quien()
    article = Article.query.get(aid)
    if article is None or not article.visible_para(user_id, rol):
        return _no_encontrado()

    # Solo el autor o un administrador pueden retirar el recurso
    if not (article.es_autor(user_id) or rol == "ADMIN"):
        return jsonify({
            "error": "Forbidden",
            "message": "No tienes permiso para retirar este artículo",
            "status_code": 403,
        }), 403

    # Etiquetas y estantes se borran solos (ON DELETE CASCADE). El PDF y la portada
    # de R2 se borran solo después de confirmar el cambio: si la base fallara, siguen ahí.
    claves = claves_en_r2(article)
    db.session.delete(article)
    db.session.commit()
    borrar_de_r2(claves)
    return jsonify({"message": "Artículo retirado correctamente"}), 200


@articulos_bp.get("/favoritos")
@jwt_required()
def listar_favoritos():
    """Ids de los recursos que el usuario marcó como favoritos (solo los que puede ver)."""
    uid, rol = _quien()
    favoritos = ArticleFavorite.query.filter_by(user_id=uid).all()
    visibles = []
    for f in favoritos:
        articulo = Article.query.get(f.article_id)
        if articulo is not None and articulo.visible_para(uid, rol):
            visibles.append(str(f.article_id))
    return jsonify({"favoritos": visibles}), 200


@articulos_bp.put("/<article_id>/favorito")
@jwt_required()
def marcar_favorito(article_id):
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()
    uid, rol = _quien()
    articulo = Article.query.get(aid)
    if articulo is None or not articulo.visible_para(uid, rol):
        return _no_encontrado()
    if ArticleFavorite.query.get((uid, aid)) is None:
        db.session.add(ArticleFavorite(user_id=uid, article_id=aid))
        db.session.commit()
    return jsonify({"article_id": str(aid), "favorito": True}), 200


@articulos_bp.delete("/<article_id>/favorito")
@jwt_required()
def quitar_favorito(article_id):
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()
    uid, _rol = _quien()
    favorito = ArticleFavorite.query.get((uid, aid))
    if favorito is not None:
        db.session.delete(favorito)
        db.session.commit()
    return jsonify({"article_id": str(aid), "favorito": False}), 200


@articulos_bp.get("/estante")
@role_required("STUDENT")
def obtener_estante():
    uid, rol = _quien()
    entries = StudentLibrary.query.filter_by(student_id=uid).all()
    # Un artículo que dejó de estar aprobado no se muestra, aunque siga guardado.
    visibles = []
    for e in entries:
        articulo = Article.query.get(e.article_id)
        if articulo is not None and articulo.visible_para(uid, rol):
            visibles.append(e.to_dict())
    return jsonify(visibles), 200


@articulos_bp.post("/<article_id>/estante")
@role_required("STUDENT")
@validate_body(UpdateShelfRequest)
def guardar_en_estante(article_id, validated_body: UpdateShelfRequest):
    uid, rol = _quien()
    status = validated_body.status

    article = Article.query.get(article_id)
    if article is None or not article.visible_para(uid, rol):
        return _no_encontrado()

    entry = StudentLibrary.query.filter_by(student_id=uid, article_id=article_id).first()
    if entry is None:
        entry = StudentLibrary(student_id=uid, article_id=article_id, status=status)
        db.session.add(entry)
    else:
        entry.status = status

    db.session.commit()
    return jsonify(entry.to_dict()), 200


@articulos_bp.delete("/<article_id>/estante")
@role_required("STUDENT")
def quitar_de_estante(article_id):
    uid, _rol = _quien()
    # Quitar del estante siempre se permite, aunque el artículo haya dejado de
    # estar aprobado: el estudiante tiene que poder limpiar su propio estante.
    entry = StudentLibrary.query.filter_by(student_id=uid, article_id=article_id).first()
    if entry is None:
        return jsonify({
            "error": "Not Found",
            "message": "Ese artículo no está en tu estante",
            "status_code": 404
        }), 404

    db.session.delete(entry)
    db.session.commit()
    return jsonify({"message": "Quitado del estante"}), 200



def _editable_por(article, user_id, rol):
    """(True, None) si el autor o el ADMIN pueden cambiarlo; si no, la respuesta de error."""
    if article is None or not article.visible_para(user_id, rol):
        return False, _no_encontrado()
    if not (article.es_autor(user_id) or rol == "ADMIN"):
        return False, (jsonify({
            "error": "Forbidden", "message": "No tienes permiso para modificar este recurso", "status_code": 403,
        }), 403)
    return True, None


def _volver_a_revision(article, rol):
    """Lo que cambia el autor (no el ADMIN) vuelve a la cola de revisión."""
    if rol != "ADMIN" and article.estado in ("APROBADO", "RECHAZADO"):
        article.estado = "PENDIENTE"
        article.revisado_por = None
        article.revisado_en = None
        article.motivo_rechazo = None


@articulos_bp.post("/<article_id>/portada")
@jwt_required()
@limiter.limit(limites.SUBIDA_PORTADA, key_func=limites.usuario_o_ip)
def subir_portada(article_id):
    """El autor o el ADMIN ponen la portada del libro: una imagen (o la primera
    página del PDF, que el navegador convierte en imagen) en el campo "cover",
    con focus_x / focus_y para encuadrarla. Se recorta a 2:3 vertical."""
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()
    user_id, rol = _quien()
    article = Article.query.get(aid)
    puede, error = _editable_por(article, user_id, rol)
    if not puede:
        return error

    archivo = request.files.get("cover")
    if archivo is None or not archivo.filename:
        return jsonify({"error": "Bad Request", "message": "Falta la imagen de la portada (campo cover).", "status_code": 400}), 400
    contenido = archivo.stream.read(portadas.tamano_maximo_bytes() + 1)
    try:
        portada, miniatura = portadas.procesar_portada(
            archivo.filename, contenido, request.form.get("focus_x"), request.form.get("focus_y"),
            tamano=portadas.PORTADA_LIBRO_TAMANO, tamano_miniatura=portadas.MINIATURA_LIBRO_TAMANO,
            minimo=portadas.MINIMO_LIBRO,
        )
    except portadas.PortadaInvalida as err:
        return jsonify({"error": "Bad Request", "message": str(err), "status_code": err.status_code, "code": err.codigo}), err.status_code

    clave, clave_mini = portadas.claves_nuevas("biblioteca/portadas")
    try:
        storage.subir_bytes(clave, portada, portadas.MIME_SALIDA)
        storage.subir_bytes(clave_mini, miniatura, portadas.MIME_SALIDA)
    except storage.StorageNotConfigured as serr:
        return jsonify({"error": "Service Unavailable", "message": str(serr), "status_code": 503}), 503

    anteriores = [article.portada_key, portadas.clave_miniatura(article.portada_key)] if article.portada_key else []
    try:
        article.portada_key = clave
        _volver_a_revision(article, rol)
        db.session.commit()
    except Exception:
        db.session.rollback()
        borrar_de_r2([clave, clave_mini])
        raise
    # La portada reemplazada se borra solo con el cambio ya confirmado.
    borrar_de_r2(anteriores)
    return jsonify(
        article.to_dict(tags=_tags_for(article.id), incluir_motivo=article.detalle_de_revision_para(user_id, rol))
    ), 200


@articulos_bp.delete("/<article_id>/portada")
@jwt_required()
def quitar_portada(article_id):
    """El libro vuelve a mostrarse con el color de su tipo."""
    try:
        aid = uuid.UUID(article_id)
    except (ValueError, AttributeError):
        return _no_encontrado()
    user_id, rol = _quien()
    article = Article.query.get(aid)
    puede, error = _editable_por(article, user_id, rol)
    if not puede:
        return error
    anteriores = [article.portada_key, portadas.clave_miniatura(article.portada_key)] if article.portada_key else []
    article.portada_key = None
    db.session.commit()
    borrar_de_r2(anteriores)
    return jsonify(
        article.to_dict(tags=_tags_for(article.id), incluir_motivo=article.detalle_de_revision_para(user_id, rol))
    ), 200
