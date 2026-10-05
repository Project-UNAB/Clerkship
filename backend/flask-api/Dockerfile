FROM python:3.11-slim

# Evitar buffering para que los logs aparezcan de inmediato en Cloud Run
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Instalar dependencias
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar el código del backend
COPY . .

# Puerto dinámico de Cloud Run
ENV PORT=8080

# Iniciar Gunicorn:
# - Bind a 0.0.0.0 y al puerto dinámico $PORT
# - Timeout de 120s para permitir que los modelos de Gemini completen sus respuestas
# - 2 workers y 4 threads por worker
CMD exec gunicorn --bind 0.0.0.0:${PORT:-8080} --workers 2 --threads 4 --timeout 120 "app:create_app()"