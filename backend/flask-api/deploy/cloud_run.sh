#!/usr/bin/env bash
# Despliega (o redespliega) el backend de Clerkship en Google Cloud Run.
#
# Uso:
#   export FRONTEND_URL=https://clerkship.vercel.app        # origen exacto del frontend, sin "/" final
#   (PROJECT_ID, REGION y SERVICE ya traen los valores de producción: clerkship / northamerica-south1 / clerkship)
#
# OJO: cada push a main ya despliega solo (Cloud Build). Use este script para forzar un despliegue manual o para
# cambiar variables. Usa --update-env-vars / --update-secrets: AÑADE o cambia lo indicado y conserva el resto.
#   export R2_BUCKET=... R2_ENDPOINT_URL=... R2_PUBLIC_BASE_URL=... MAILGUN_DOMAIN=...
#   bash backend/flask-api/deploy/cloud_run.sh              # desde la raíz del repositorio
#
# Los SECRETOS no van aquí: viven en Secret Manager (ver docs/DESPLIEGUE_CLOUD_RUN.md, paso 2).
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-clerkship}"
: "${FRONTEND_URL:?Falta FRONTEND_URL (el dominio del frontend en Vercel)}"
: "${MAILGUN_DOMAIN:?Falta MAILGUN_DOMAIN}"
: "${R2_BUCKET:?Falta R2_BUCKET}"
: "${R2_ENDPOINT_URL:?Falta R2_ENDPOINT_URL}"
: "${R2_PUBLIC_BASE_URL:?Falta R2_PUBLIC_BASE_URL}"

REGION="${REGION:-northamerica-south1}"
SERVICE="${SERVICE:-clerkship}"
MONGODB_DB_NAME="${MONGODB_DB_NAME:-clerkship}"
MAILGUN_FROM="${MAILGUN_FROM:-Clerkship <no-reply@${MAILGUN_DOMAIN}>}"
GOTENBERG_URL="${GOTENBERG_URL:-}"
MIN_INSTANCES="${MIN_INSTANCES:-1}"     # 1 = sin arranque en frío (recomendado el día de la validación)
MAX_INSTANCES="${MAX_INSTANCES:-3}"

# Las variables que contienen comas (CORS_ORIGINS, MAILGUN_FROM) se pasan con otro delimitador (^|^).
ENV_VARS="^|^FLASK_ENV=production|TRUST_PROXY=1|AI_AGENT_PROVIDER=gemini|CORS_ORIGINS=${FRONTEND_URL}|MONGODB_DB_NAME=${MONGODB_DB_NAME}|MAILGUN_DOMAIN=${MAILGUN_DOMAIN}|MAILGUN_FROM=${MAILGUN_FROM}|R2_BUCKET=${R2_BUCKET}|R2_ENDPOINT_URL=${R2_ENDPOINT_URL}|R2_PUBLIC_BASE_URL=${R2_PUBLIC_BASE_URL}"
if [ -n "${GOTENBERG_URL}" ]; then ENV_VARS="${ENV_VARS}|GOTENBERG_URL=${GOTENBERG_URL}"; fi

SECRETS="DATABASE_URL=DATABASE_URL:latest,MONGODB_URI=MONGODB_URI:latest,JWT_SECRET_KEY=JWT_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,MAILGUN_API_KEY=MAILGUN_API_KEY:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,CRON_SECRET=CRON_SECRET:latest"

cd "$(dirname "$0")/.."   # backend/flask-api (donde está el Dockerfile)

gcloud run deploy "${SERVICE}" \
  --project "${PROJECT_ID}" --region "${REGION}" \
  --source . \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 1Gi --cpu-boost \
  --concurrency 20 --timeout 300 \
  --min-instances "${MIN_INSTANCES}" --max-instances "${MAX_INSTANCES}" \
  --update-env-vars "${ENV_VARS}" \
  --update-secrets "${SECRETS}"

URL="$(gcloud run services describe "${SERVICE}" --project "${PROJECT_ID}" --region "${REGION}" --format='value(status.url)')"
echo
echo "Servicio desplegado en: ${URL}"
echo "Comprobando /api/health ..."
curl -fsS "${URL}/api/health" && echo
echo "Ahora define VITE_API_BASE_URL=${URL} en Vercel (Production) y vuelve a desplegar el frontend."
