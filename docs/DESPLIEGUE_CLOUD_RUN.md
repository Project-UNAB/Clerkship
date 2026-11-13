# Despliegue: backend en Google Cloud Run y frontend en Vercel

Guía para dejar Clerkship funcionando en producción y para reiniciarlo o revertirlo. Los comandos son para una terminal con `gcloud` instalado (Google Cloud SDK) y ejecutarse desde la **raíz del repositorio**.

> **Nunca** pegue contraseñas, claves de API ni cadenas de conexión en el repositorio, en el chat del equipo ni en esta guía. Viven en **Secret Manager**.

## 0. Variables de la sesión

```bash
export PROJECT_ID=mi-proyecto-gcp          # ID del proyecto de Google Cloud (con facturación activa)
export REGION=us-central1                  # región de Cloud Run
export SERVICE=clerkship-api               # nombre del servicio
export FRONTEND_URL=https://clerkship.vercel.app   # dominio EXACTO del frontend, sin "/" final

gcloud auth login
gcloud config set project "$PROJECT_ID"
```

## 1. Habilitar las APIs (una sola vez)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com
```

## 2. Secretos (una sola vez)

El backend **no arranca en producción** sin `JWT_SECRET_KEY` (32 caracteres o más), `MAILGUN_API_KEY`, `MAILGUN_DOMAIN` y `CORS_ORIGINS`.

```bash
# Crea cada secreto leyendo el valor desde la entrada estándar (no queda en el historial con -n si lo escribe a mano).
for S in DATABASE_URL MONGODB_URI JWT_SECRET_KEY GEMINI_API_KEY MAILGUN_API_KEY \
         R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY CRON_SECRET; do
  read -r -s -p "Valor de $S: " V; echo
  printf %s "$V" | gcloud secrets create "$S" --data-file=- 2>/dev/null \
    || printf %s "$V" | gcloud secrets versions add "$S" --data-file=-
done

# Permiso para que Cloud Run lea los secretos
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role=roles/secretmanager.secretAccessor
```

Para **rotar** un secreto: `printf %s "NUEVO" | gcloud secrets versions add NOMBRE --data-file=-` y luego reiniciar (sección 5).

Generar un `JWT_SECRET_KEY` y un `CRON_SECRET` aleatorios: `openssl rand -base64 48`.

## 3. Desplegar el backend

```bash
export MAILGUN_DOMAIN=mail.clerk-ship.online
export R2_BUCKET=...            R2_ENDPOINT_URL=https://<cuenta>.r2.cloudflarestorage.com
export R2_PUBLIC_BASE_URL=https://<dominio-publico-del-bucket>
# opcional: export GOTENBERG_URL=https://<servicio-gotenberg>   (vistas previas de Word/Excel/PowerPoint)

bash backend/flask-api/deploy/cloud_run.sh
```

El script construye la imagen con el `Dockerfile` de `backend/flask-api`, despliega con **1 instancia mínima** (sin arranque en frío), 1 vCPU, 1 GiB y `TRUST_PROXY=1`, e imprime la URL del servicio y el resultado de `/api/health`.

Equivalente manual (si prefiere no usar el script):

```bash
gcloud run deploy "$SERVICE" --project "$PROJECT_ID" --region "$REGION" \
  --source backend/flask-api --allow-unauthenticated --port 8080 \
  --cpu 1 --memory 1Gi --cpu-boost --concurrency 20 --timeout 300 \
  --min-instances 1 --max-instances 3 \
  --set-env-vars "^|^FLASK_ENV=production|TRUST_PROXY=1|AI_AGENT_PROVIDER=gemini|CORS_ORIGINS=$FRONTEND_URL|MONGODB_DB_NAME=clerkship|MAILGUN_DOMAIN=$MAILGUN_DOMAIN|R2_BUCKET=$R2_BUCKET|R2_ENDPOINT_URL=$R2_ENDPOINT_URL|R2_PUBLIC_BASE_URL=$R2_PUBLIC_BASE_URL" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,MONGODB_URI=MONGODB_URI:latest,JWT_SECRET_KEY=JWT_SECRET_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,MAILGUN_API_KEY=MAILGUN_API_KEY:latest,R2_ACCESS_KEY_ID=R2_ACCESS_KEY_ID:latest,R2_SECRET_ACCESS_KEY=R2_SECRET_ACCESS_KEY:latest,CRON_SECRET=CRON_SECRET:latest"
```

Si el frontend tiene más de un dominio, sepárelos con comas en `CORS_ORIGINS` (cada uno completo, con `https://`; nunca `*`).

URL del servicio:

```bash
export API_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
echo "$API_URL"
```

### Migraciones de la base de datos

Si hubo cambios de esquema, aplíquelos **antes** de enviar tráfico a la nueva versión:

```bash
cd backend/flask-api
DATABASE_URL='postgresql+psycopg2://...' alembic upgrade head     # contra la base de producción
```

## 4. Frontend en Vercel

1. En el proyecto de Vercel → *Settings → Environment Variables* (entorno **Production**): `VITE_API_BASE_URL = <API_URL>` (la URL de Cloud Run, sin `/` final). Si no se define, el frontend llama a `http://localhost:5000` y **nada funciona**.
2. Vuelva a desplegar el frontend (un `git push` a `main` o *Redeploy* en Vercel). La variable se incorpora al compilar, así que cambiarla exige redeploy.
3. `frontend/vercel.json` ya reescribe todas las rutas a `index.html`, de modo que los enlaces directos (por ejemplo `/evaluacion-experto/<token>`) funcionan.

## 5. Reiniciar, revertir y ver los logs

Cloud Run no tiene un botón «reiniciar»: se crea una revisión nueva.

```bash
# Reiniciar (nueva revisión con la misma imagen y configuración)
gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "REINICIO=$(date +%s)"

# Ver las revisiones y volver a una anterior (rollback inmediato)
gcloud run revisions list --service "$SERVICE" --region "$REGION"
gcloud run services update-traffic "$SERVICE" --region "$REGION" --to-revisions NOMBRE_DE_LA_REVISION=100

# Logs
gcloud run services logs read "$SERVICE" --region "$REGION" --limit 100
gcloud beta run services logs tail "$SERVICE" --region "$REGION"

# Mantener una instancia siempre encendida (evita el arranque en frío) / dejar que escale a cero
gcloud run services update "$SERVICE" --region "$REGION" --min-instances 1
gcloud run services update "$SERVICE" --region "$REGION" --min-instances 0
```

## 6. Comprobaciones tras desplegar

```bash
curl -fsS "$API_URL/api/health"

# CORS: debe responder con access-control-allow-origin igual al dominio del frontend
curl -is -X OPTIONS "$API_URL/api/auth/login" \
  -H "Origin: $FRONTEND_URL" -H "Access-Control-Request-Method: POST" | grep -i "access-control"
```

Después, desde el navegador, en el dominio de producción: iniciar sesión, generar un caso, abrir el panel de administración y crear una invitación de experto **desde ese mismo dominio** (el enlace que se copia usa el dominio de la página: si se crea desde `localhost`, el enlace queda inservible).

## 7. Tareas programadas (recordatorios de tareas)

El backend expone `POST /api/notificaciones/recordatorios` protegido por la cabecera `X-Cron-Secret` (el valor de `CRON_SECRET`). Con Cloud Scheduler, cada hora:

```bash
gcloud scheduler jobs create http recordatorios-clerkship \
  --location "$REGION" --schedule "0 * * * *" --time-zone "America/Bogota" \
  --uri "$API_URL/api/notificaciones/recordatorios" --http-method POST \
  --headers "X-Cron-Secret=$(gcloud secrets versions access latest --secret CRON_SECRET)"
```

## 8. Gotenberg (opcional: vistas previas de documentos)

Convierte Word, Excel y PowerPoint a PDF. Sin él, esas vistas previas fallan (el resto funciona).

```bash
gcloud run deploy gotenberg --region "$REGION" --image gotenberg/gotenberg:8 \
  --port 3000 --cpu 1 --memory 1Gi --min-instances 0 --max-instances 2 \
  --args="gotenberg,--api-timeout=60s" --allow-unauthenticated
export GOTENBERG_URL=$(gcloud run services describe gotenberg --region "$REGION" --format='value(status.url)')
```

> `--allow-unauthenticated` deja el conversor abierto a cualquiera que conozca la URL. Es aceptable para el prototipo; para endurecerlo, use ingreso interno con un conector de acceso a VPC.

## 9. Lista de verificación antes de una validación con expertos

- [ ] `API_URL/api/health` responde y `VITE_API_BASE_URL` apunta a `API_URL` (con redeploy del frontend hecho).
- [ ] `CORS_ORIGINS` contiene el dominio real del frontend.
- [ ] `--min-instances 1` (sin arranque en frío) y la cuota de Gemini disponible (ver el apartado de latencia de la documentación).
- [ ] Las migraciones aplicadas en la base de producción.
- [ ] Hay consultas **completadas** para asignar al experto (Panel de administración → Revisión de casos).
- [ ] La invitación se creó **desde el dominio de producción** y se probó el enlace en una ventana privada.
- [ ] Solo las secciones que el experto debe evaluar (`casos` e `historial`, más la revisión de casos).

## 10. Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| El servicio no arranca: `En producción JWT_SECRET_KEY debe existir…` | Falta el secreto o tiene menos de 32 caracteres. |
| El servicio no arranca: `MAILGUN_API_KEY y MAILGUN_DOMAIN son obligatorios` | Faltan esos valores (se exigen en producción). |
| El navegador muestra errores de CORS | `CORS_ORIGINS` no incluye el dominio exacto del frontend (esquema, host y sin `/` final). |
| El frontend llama a `localhost:5000` | No se definió `VITE_API_BASE_URL` en Vercel o no se redesplegó. |
| Respuestas lentas o 429 de Gemini | Cuota por minuto del nivel gratuito; el sistema cae a los modelos de respaldo. Para operar con estudiantes, contratar un plan de pago. |
| Primera petición lenta tras un rato sin uso | Arranque en frío: use `--min-instances 1`. |
| Los límites de peticiones no se comparten entre instancias | Con más de una instancia, defina `RATELIMIT_STORAGE_URI=redis://…`; con una sola no hace falta. |
