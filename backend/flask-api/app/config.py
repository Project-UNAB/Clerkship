import os

from dotenv import load_dotenv

load_dotenv()


class Config:
<<<<<<< HEAD
=======
    # Por defecto "production": si no se define FLASK_ENV, el modo simulado de
    # correo (que escribe códigos en los logs) queda APAGADO. Ver app/mailer.py.
    FLASK_ENV = os.environ.get("FLASK_ENV", "production")

    RATELIMIT_ENABLED = os.environ.get("FLASK_ENV") != "testing"
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

>>>>>>> main
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    MONGODB_URI = os.environ.get("MONGODB_URI")
    MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME")

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 60)) * 60
    JWT_REFRESH_TOKEN_EXPIRES = int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 30)) * 86400

    CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

    # Correo de verificación por Mailgun — si MAILGUN_API_KEY no está seteado
    # (todavía no se verificó el dominio en Mailgun), el envío queda en modo
    # simulado: el código se imprime en la consola del backend en vez de
    # mandarse de verdad. Ver app/mailer.py.
    MAILGUN_API_KEY = os.environ.get("MAILGUN_API_KEY")
    MAILGUN_DOMAIN = os.environ.get("MAILGUN_DOMAIN")  # ej. mail.clerk-ship.online
    MAILGUN_FROM = os.environ.get("MAILGUN_FROM", "Clerkship <no-reply@clerk-ship.online>")
