import os
import uuid

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from pymongo import MongoClient
from sqlalchemy import text
from werkzeug.exceptions import HTTPException

from app.config import Config

db = SQLAlchemy()
jwt = JWTManager()
# Límite por IP. Storage en memoria por defecto (sirve con 1 worker); con varios
# workers de gunicorn, pon RATELIMIT_STORAGE_URI=redis://... para compartirlo.
limiter = Limiter(key_func=get_remote_address, default_limits=[])
mongo_client: MongoClient | None = None


def get_mongo_db():
    """Handle de la base de Mongo (colecciones consultations, messages)."""
    return mongo_client[Config.MONGODB_DB_NAME]


def create_app():
    global mongo_client

    app = Flask(__name__)
    app.config.from_object(Config)

    if app.config["FLASK_ENV"] == "production":
        secret = app.config.get("JWT_SECRET_KEY") or ""
        if len(secret) < 32:
            raise RuntimeError("En producción JWT_SECRET_KEY debe existir y tener al menos 32 caracteres.")
        if not app.config.get("MAILGUN_API_KEY") or not app.config.get("MAILGUN_DOMAIN"):
            raise RuntimeError("En producción MAILGUN_API_KEY y MAILGUN_DOMAIN son obligatorios.")
        if not os.environ.get("CORS_ORIGINS") or not app.config["CORS_ORIGINS"]:
            raise RuntimeError("En producción CORS_ORIGINS debe listar explícitamente los orígenes del frontend.")

    # Detrás de un proxy (hosting), la IP real del cliente viene en X-Forwarded-For.
    # Sin esto, el rate limiting contaría todas las peticiones como la IP del proxy.
    if os.environ.get("TRUST_PROXY") == "1":
        from werkzeug.middleware.proxy_fix import ProxyFix
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    db.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def _sesion_invalidada(_header, payload):
        """Corre en CADA petición autenticada. El token se rechaza si fue
        revocado (logout), si es anterior al corte de sesiones del usuario
        (cambio de rol o de contraseña), si la cuenta está desactivada o si
        el rol del token ya no es el de la base. Ver app/services/sesiones.py."""
        from app.services import sesiones

        if sesiones.token_revocado(payload):
            return True
        # Marca anterior, en Mongo (colección user_security): se sigue
        # respetando para los cortes hechos antes de users.tokens_valid_after.
        if mongo_client is None:
            return False
        doc = mongo_client[Config.MONGODB_DB_NAME]["user_security"].find_one({"user_id": payload.get("sub")})
        return bool(doc) and payload.get("iat", 0) < doc.get("sessions_valid_after", 0)

    def _no_autorizado(mensaje):
        return jsonify({"error": "Unauthorized", "message": mensaje, "status_code": 401}), 401

    # Respuestas de sesión inválida: siempre el mismo formato y sin decir por
    # qué falló la firma ni qué había dentro del token.
    @jwt.revoked_token_loader
    def _token_revocado(_header, _payload):
        return _no_autorizado("La sesión ya no es válida. Inicia sesión de nuevo.")

    @jwt.expired_token_loader
    def _token_vencido(_header, _payload):
        return _no_autorizado("La sesión venció. Inicia sesión de nuevo.")

    @jwt.invalid_token_loader
    def _token_invalido(_motivo):
        return _no_autorizado("Token inválido.")

    @jwt.unauthorized_loader
    def _sin_token(_motivo):
        return _no_autorizado("Falta el token de autenticación.")

    limiter.init_app(app)
    if app.config["FLASK_ENV"] == "testing":
        limiter.enabled = False
    # CORS solo para la API, solo desde los orígenes del frontend y solo con
    # lo que el frontend usa. La sesión viaja en la cabecera Authorization
    # (no en cookies), así que no hacen falta credenciales entre orígenes.
    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        # Content-Disposition: para que el frontend lea el nombre del archivo al exportar calificaciones.
        expose_headers=[
            "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Content-Disposition",
        ],
        supports_credentials=False,
        max_age=600,
    )

    @app.after_request
    def _cabeceras_de_seguridad(response):
        """Cabeceras defensivas en todas las respuestas."""
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
        if request.path.startswith("/api/") and not request.path.startswith("/api/docs"):
            # La API solo devuelve datos: nada de ahí se ejecuta ni se enmarca,
            # y ningún intermediario debe guardar respuestas con datos de usuarios.
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
            response.headers.setdefault("Cache-Control", "no-store")
        if app.config["FLASK_ENV"] == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response

    if mongo_client is None and app.config["MONGODB_URI"]:
        mongo_client = MongoClient(app.config["MONGODB_URI"])

    # --- Endpoint de Salud / Comprobación del Servicio ---
    @app.route("/api/health", methods=["GET"])
    def health_check():
        db_status = "unconfigured"
        mongo_status = "unconfigured"

        # Verificar conexión con PostgreSQL
        if app.config.get("SQLALCHEMY_DATABASE_URI"):
            # El detalle del fallo va al log: este endpoint es público y el
            # mensaje del driver trae host, usuario y nombre de la base.
            try:
                db.session.execute(text("SELECT 1"))
                db_status = "connected"
            except Exception:
                app.logger.error("health: PostgreSQL no responde", exc_info=True)
                db_status = "error"

        # Verificar conexión con MongoDB
        if mongo_client:
            try:
                mongo_client.admin.command("ping")
                mongo_status = "connected"
            except Exception:
                app.logger.error("health: MongoDB no responde", exc_info=True)
                mongo_status = "error"

        is_healthy = db_status in ("connected", "unconfigured") and mongo_status in ("connected", "unconfigured")

        return jsonify({
            "status": "healthy" if is_healthy else "degraded",
            "service": "Clerkship Backend API",
            "framework": "Flask",
            "version": "1.0.0",
            "databases": {
                "postgresql": db_status,
                "mongodb": mongo_status,
            }
        }), 200

    # --- Manejadores Globales de Errores en formato JSON ---
    @app.errorhandler(400)
    def bad_request(error):
        return jsonify({
            "error": "Bad Request",
            "message": getattr(error, "description", "Solicitud inválida."),
            "status_code": 400
        }), 400

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({
            "error": "Not Found",
            "message": "El recurso solicitado no fue encontrado.",
            "status_code": 404
        }), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({
            "error": "Method Not Allowed",
            "message": "El método HTTP utilizado no está permitido en esta ruta.",
            "status_code": 405
        }), 405

    @app.errorhandler(429)
    def too_many_requests(error):
        """Límite de peticiones superado (Flask-Limiter). Retry-After lo agrega el limitador."""
        return jsonify({
            "error": "Too Many Requests",
            "message": "Demasiados intentos. Espera un momento antes de volver a intentarlo.",
            "status_code": 429
        }), 429

    @app.errorhandler(HTTPException)
    def error_http(error):
        """Cualquier otro error HTTP (401, 403, 413, 415...): mismo formato JSON,
        con el nombre estándar del error y sin el HTML por defecto de Werkzeug."""
        codigo = error.code or 500
        if codigo >= 500:
            return _error_interno(error)
        return jsonify({
            "error": error.name,
            "message": "No se pudo procesar la solicitud.",
            "status_code": codigo
        }), codigo

    def _error_interno(error):
        """El detalle (traza, SQL, rutas del servidor) va al log con un
        identificador; al cliente solo le llega ese identificador."""
        error_id = uuid.uuid4().hex[:12]
        app.logger.error("Error interno %s en %s %s", error_id, request.method, request.path, exc_info=error)
        return jsonify({
            "error": "Internal Server Error",
            "message": "Ocurrió un error interno en el servidor.",
            "status_code": 500,
            "error_id": error_id
        }), 500

    @app.errorhandler(500)
    def internal_server_error(error):
        return _error_interno(getattr(error, "original_exception", None) or error)

    @app.errorhandler(Exception)
    def error_no_controlado(error):
        return _error_interno(error)

    from app.routes.auth import auth_bp
    from app.routes.usuarios import usuarios_bp
    from app.routes.cursos import cursos_bp
    from app.routes.curso_contenido import curso_contenido_bp
    from app.routes.curso_avisos import curso_avisos_bp
    from app.routes.curso_quiz import curso_quiz_bp
    from app.routes.curso_calificaciones import curso_calificaciones_bp
    from app.routes.articulos import articulos_bp
    from app.routes.comunidad import comunidad_bp
    from app.routes.documentos import documentos_bp
    from app.routes.consultas import consultas_bp
    from app.routes.historial import historial_bp
    from app.routes.email import email_bp
    from app.routes.agentes import agentes_bp
    from app.routes.feedback import feedback_bp
    from app.routes.almacenamiento import almacenamiento_bp
    from app.routes.validacion import validacion_bp
    from app.routes.admin import admin_bp
    from app.routes.notificaciones import notificaciones_bp
    from app.routes.docs import docs_bp, swagger_ui
    from app.routes.simulador import simulador_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(usuarios_bp, url_prefix="/api/usuarios")
    app.register_blueprint(cursos_bp, url_prefix="/api/cursos")
    app.register_blueprint(curso_contenido_bp, url_prefix="/api/cursos")
    app.register_blueprint(curso_avisos_bp, url_prefix="/api/cursos")
    app.register_blueprint(curso_quiz_bp, url_prefix="/api/cursos")
    app.register_blueprint(curso_calificaciones_bp, url_prefix="/api/cursos")
    app.register_blueprint(articulos_bp, url_prefix="/api/articulos")
    app.register_blueprint(comunidad_bp, url_prefix="/api/comunidad")
    app.register_blueprint(documentos_bp, url_prefix="/api/documentos")
    app.register_blueprint(consultas_bp, url_prefix="/api/consultas")
    app.register_blueprint(historial_bp, url_prefix="/api/historial")
    app.register_blueprint(email_bp, url_prefix="/api/email")
    app.register_blueprint(agentes_bp, url_prefix="/api/agentes")
    app.register_blueprint(feedback_bp, url_prefix="/api/feedback")
    app.register_blueprint(almacenamiento_bp, url_prefix="/api/almacenamiento")
    app.register_blueprint(validacion_bp, url_prefix="/api/validacion")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(notificaciones_bp, url_prefix="/api/notificaciones")
    if app.config["FLASK_ENV"] != "production":
        app.register_blueprint(docs_bp, url_prefix="/api")
    # Consola de desarrollo del simulador: nunca en producción.
    if app.config["FLASK_ENV"] in ("development", "testing"):
        app.register_blueprint(simulador_bp)

    # Acceso directo en /docs también
    if app.config["FLASK_ENV"] != "production":
        app.add_url_rule("/docs", endpoint="root_docs", view_func=swagger_ui)

    @app.cli.command("notificar-vencimientos")
    def notificar_vencimientos():
        """Recordatorio de "cierra en 24 h" a quienes no han entregado. Para
        correr cada hora (cron); no repite el aviso a quien ya lo recibió."""
        from app.services import notificaciones

        resumen = notificaciones.recordar_vencimientos()
        print(f"Tareas por cerrar: {resumen['tareas']} · recordatorios enviados: {resumen['notificaciones']}")

    @app.cli.command("limpiar-tokens")
    def limpiar_tokens():
        """Borra de la lista de revocación los tokens que ya vencieron solos."""
        from app.services import sesiones

        print(f"Tokens revocados ya vencidos que se borraron: {sesiones.limpiar_vencidos()}")

    @app.cli.command("limpiar-archivos")
    def limpiar_archivos():
        """Reintenta borrar de R2 los archivos que quedaron pendientes
        (pending_file_deletions). Para correr a mano o desde un cron."""
        from app.services import limpieza_r2

        resumen = limpieza_r2.procesar(limite=1000)
        print(f"Borrados: {resumen['borrados']} · siguen pendientes: {resumen['fallidos']}")

    @app.cli.command("seed-mock")
    def run_seed_mock():
        """Siembra datos clínicos mock para pruebas de desarrollo y frontend."""
        from seed_mock_data import seed_mock_data
        seed_mock_data(verbose=True)

    return app
