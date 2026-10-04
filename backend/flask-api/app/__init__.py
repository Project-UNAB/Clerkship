from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from pymongo import MongoClient
from sqlalchemy import text

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

    db.init_app(app)
    jwt.init_app(app)

    @jwt.token_in_blocklist_loader
    def _sesion_invalidada(_header, payload):
        """Un cambio/recuperación de contraseña invalida los tokens emitidos antes.
        La marca vive en Mongo (colección user_security), sin cambiar el esquema SQL."""
        if mongo_client is None:
            return False
        doc = mongo_client[Config.MONGODB_DB_NAME]["user_security"].find_one({"user_id": payload.get("sub")})
        return bool(doc) and payload.get("iat", 0) < doc.get("sessions_valid_after", 0)
    limiter.init_app(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    if mongo_client is None and app.config["MONGODB_URI"]:
        mongo_client = MongoClient(app.config["MONGODB_URI"])

    # --- Endpoint de Salud / Comprobación del Servicio ---
    @app.route("/api/health", methods=["GET"])
    def health_check():
        db_status = "unconfigured"
        mongo_status = "unconfigured"

        # Verificar conexión con PostgreSQL
        if app.config.get("SQLALCHEMY_DATABASE_URI"):
            try:
                db.session.execute(text("SELECT 1"))
                db_status = "connected"
            except Exception as e:
                db_status = f"error: {str(e)[:80]}"

        # Verificar conexión con MongoDB
        if mongo_client:
            try:
                mongo_client.admin.command("ping")
                mongo_status = "connected"
            except Exception as e:
                mongo_status = f"error: {str(e)[:80]}"

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

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({
            "error": "Internal Server Error",
            "message": "Ocurrió un error interno en el servidor.",
            "status_code": 500
        }), 500

    from app.routes.auth import auth_bp
    from app.routes.usuarios import usuarios_bp
    from app.routes.cursos import cursos_bp
    from app.routes.articulos import articulos_bp
    from app.routes.comunidad import comunidad_bp
    from app.routes.documentos import documentos_bp
    from app.routes.consultas import consultas_bp
    from app.routes.historial import historial_bp
    from app.routes.email import email_bp
    from app.routes.agentes import agentes_bp
    from app.routes.docs import docs_bp, swagger_ui
    from app.routes.simulador import simulador_bp

    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(usuarios_bp, url_prefix="/api/usuarios")
    app.register_blueprint(cursos_bp, url_prefix="/api/cursos")
    app.register_blueprint(articulos_bp, url_prefix="/api/articulos")
    app.register_blueprint(comunidad_bp, url_prefix="/api/comunidad")
    app.register_blueprint(documentos_bp, url_prefix="/api/documentos")
    app.register_blueprint(consultas_bp, url_prefix="/api/consultas")
    app.register_blueprint(historial_bp, url_prefix="/api/historial")
    app.register_blueprint(email_bp, url_prefix="/api/email")
    app.register_blueprint(agentes_bp, url_prefix="/api/agentes")
    app.register_blueprint(docs_bp, url_prefix="/api")
    # Consola de desarrollo del simulador: nunca en producción.
    if app.config["FLASK_ENV"] in ("development", "testing"):
        app.register_blueprint(simulador_bp)

    # Acceso directo en /docs también
    app.add_url_rule("/docs", endpoint="root_docs", view_func=swagger_ui)

    @app.cli.command("seed-mock")
    def run_seed_mock():
        """Siembra datos clínicos mock para pruebas de desarrollo y frontend."""
        from seed_mock_data import seed_mock_data
        seed_mock_data(verbose=True)

    return app
