import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    # Por defecto "production": si no se define FLASK_ENV, el modo simulado de
    # correo (que escribe códigos en los logs) queda APAGADO. Ver app/mailer.py.
    FLASK_ENV = os.environ.get("FLASK_ENV", "production")

    # El limitador se inicializa siempre. En testing queda apagado después de
    # inicializarse (ver create_app) para que la suite no se bloquee a sí
    # misma; los tests de límites lo prenden con `limiter.enabled = True`.
    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URI = os.environ.get("RATELIMIT_STORAGE_URI", "memory://")

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    MONGODB_URI = os.environ.get("MONGODB_URI")
    MONGODB_DB_NAME = os.environ.get("MONGODB_DB_NAME")

    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
    # Access token de vida corta: es el que viaja en cada petición, así que
    # si se filtra sirve pocos minutos. El refresh token dura más, solo sirve
    # para pedir otro access token y se puede revocar (logout).
    JWT_ACCESS_TOKEN_EXPIRES = int(os.environ.get("JWT_ACCESS_TOKEN_EXPIRES_MINUTES", 15)) * 60
    JWT_REFRESH_TOKEN_EXPIRES = int(os.environ.get("JWT_REFRESH_TOKEN_EXPIRES_DAYS", 7)) * 86400

    # Orígenes del frontend, separados por coma. Nunca "*": cada origen va
    # escrito completo (esquema + host + puerto).
    CORS_ORIGINS = [
        origen.strip().rstrip("/")
        for origen in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origen.strip() and origen.strip() != "*"
    ]

    # Secreto para que un programador de tareas externo (Cloud Scheduler)
    # dispare los recordatorios de fecha límite. Vacío = esa ruta no existe.
    CRON_SECRET = os.environ.get("CRON_SECRET", "")

    # Cabeceras X-RateLimit-* y Retry-After en las respuestas limitadas.
    RATELIMIT_HEADERS_ENABLED = True

    # Topes del servidor para las entregas de tareas: el docente configura
    # cada tarea por debajo de esto, nunca por encima. Los archivos viajan en
    # base64 dentro del JSON, así que el total por entrega tiene que caber en
    # el límite de petición de Cloud Run (32 MB).
    ASSIGNMENT_MAX_FILE_MB = int(os.environ.get("ASSIGNMENT_MAX_FILE_MB", 10))
    ASSIGNMENT_MAX_FILES = int(os.environ.get("ASSIGNMENT_MAX_FILES", 5))
    ASSIGNMENT_MAX_TOTAL_MB = int(os.environ.get("ASSIGNMENT_MAX_TOTAL_MB", 20))

    # Peso máximo de la imagen de portada que sube el docente (se recomprime
    # antes de guardarla, así que en R2 queda mucho más liviana).
    COURSE_COVER_MAX_MB = int(os.environ.get("COURSE_COVER_MAX_MB", 2))

    # Cuestionarios con tiempo límite. La tolerancia cubre la latencia de red
    # entre que el cronómetro del estudiante llega a cero y el envío llega al
    # servidor. Si el envío llega aún más tarde: GRADE_SAVED califica solo lo
    # que quedó guardado a tiempo, REJECT cierra el intento en cero.
    QUIZ_GRACE_SECONDS = int(os.environ.get("QUIZ_GRACE_SECONDS", 30))
    QUIZ_LATE_POLICY = os.environ.get("QUIZ_LATE_POLICY", "GRADE_SAVED").strip().upper()

    # Correo de verificación por Mailgun — si MAILGUN_API_KEY no está seteado
    # (todavía no se verificó el dominio en Mailgun), el envío queda en modo
    # simulado: el código se imprime en la consola del backend en vez de
    # mandarse de verdad. Ver app/mailer.py.
    MAILGUN_API_KEY = os.environ.get("MAILGUN_API_KEY")
    MAILGUN_DOMAIN = os.environ.get("MAILGUN_DOMAIN")  # ej. mail.clerk-ship.online
    MAILGUN_FROM = os.environ.get("MAILGUN_FROM", "Clerkship <no-reply@clerk-ship.online>")
