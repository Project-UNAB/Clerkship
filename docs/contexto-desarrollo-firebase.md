# Contexto — Módulo de Desarrollo, Firebase y Dashboard

Este documento resume todo lo que se implementó en la sesión de trabajo sobre:
1. El **Módulo de Desarrollo** (`/desarrollo`) — Cuestionario, Cronograma y Repositorio, usado por los 4 desarrolladores del proyecto para llevar registro del avance.
2. La integración con **Firebase** (Realtime Database + Authentication) que le da vida a ese módulo y al login principal.
3. Ajustes en el **Dashboard clínico** (Chats/Correo, login, avatares reales).
4. El despliegue en **Vercel** con dominio propio.

Está pensado como referencia rápida para retomar el trabajo sin tener que releer todo el historial de conversación.

---

## 1. Por qué existe todo esto

El equipo (4 desarrolladores + 2 directores de proyecto) necesitaba una forma de:
- Registrar qué tecnología está usando cada quien, para que el Cronograma la muestre automáticamente.
- Marcar entregas como completadas con evidencia real (commit de GitHub) en vez de un simple check sin respaldo.
- Que esos datos se vean **iguales para los 4**, sin depender de que cada quien tenga su propio `localStorage`.

La decisión explícita del usuario fue: **sin backend propio, sin Supabase para esto** (Supabase ya está siendo usado por otro equipo para la app clínica de producción). Se usa **Firebase** (Realtime Database + Authentication) exclusivamente como base de datos de **prueba/desarrollo interno** para estas 3 pestañas — nunca para la app clínica real.

---

## 2. Módulo de Desarrollo (`/desarrollo`, público — no requiere el login clínico)

Ruta: `frontend/src/pages/desarrollo/DesarrolloPage.tsx` — pestañas: **Cuestionario**, **Cronograma**, **Repositorio**.

> Importante: `/desarrollo` y `/cuestionario` están **fuera** del `ProtectedRoute` clínico en `App.tsx` — tienen su propia autenticación por integrante (ver sección 3), independiente del login de la app médica.

### 2.1 Cuestionario (`CuestionarioTab.tsx`)

- Paso 1: selección de perfil (tarjeta estilo Netflix) → dispara el login de Firebase de ese integrante (ver sección 3.2).
- Paso 2: por cada "hueco" `{tech}` que existe en el Cronograma de esa persona, un dropdown con **opciones curadas** (no toda la lista de tecnologías, solo las relevantes a ese punto específico) — con opciones extra **"Sin definir"** y **"Otro" (texto libre)**.
- Al guardar (`saveCuestionarioAnswers`), se hace un **merge parcial** en Firebase (`update()`, no `set()`) para no borrar lo que ya guardaron los demás integrantes.
- Los pares clave→tecnología viven en `frontend/src/data/techPlaceholders.ts`, con la clave exacta (`techPlaceholderKey`) que usa `CronogramaTab.tsx` para reemplazar `{tech}` en los títulos.

### 2.2 Cronograma (`CronogramaTab.tsx` + `data/cronogramaActivities.ts`)

- Los datos de actividades (`CRONOGRAMA_DATA`, `CATEGORIES`, tipo `CategoryId`) se movieron a `data/cronogramaActivities.ts` — **no deben vivir dentro de un archivo de componente** porque rompe el Fast Refresh de Vite (lección aprendida durante la sesión).
- `resolveTitleWithTech()` reemplaza `{tech}` leyendo las respuestas del Cuestionario desde Firebase (`subscribeCuestionarioAnswers`, tiempo real). Si no hay respuesta guardada, muestra `____`.
- **Botón "Entregado" / "Pendiente"**: al hacer clic, abre un modal de verificación que exige:
  1. **Repositorio** (Clerkship o AgentGrimoire — ver 2.4) — siempre editable manualmente, no se bloquea por categoría.
  2. **Rama** y **commit** (traídos en vivo de la API de GitHub).
  3. **Descripción** de la entrega.
  4. **Quién registra el cambio** + **contraseña** (Firebase Auth).
  - Si la cuenta nunca ha iniciado sesión, el mismo modal cambia a "Crea tu propia contraseña" antes de continuar (ver sección 3.3).
  - Al confirmar, se guarda la evidencia (`saveEvidence`) y el estado (`setCompleted`) en Firebase — visible en tiempo real para los 4.
  - Revertir a "Pendiente" **también** exige autenticación (mismo modal, sin los campos de rama/commit/descripción).

### 2.3 Repositorio (`RepositorioTab.tsx`)

- Explorador de commits de GitHub (API pública, sin token — el repo debe ser **público**).
- Selector de **repositorio** + **rama**; lista de commits con distinción de *merge commits*.
- Botón "Marcar como evidencia" por commit → elige a qué hito del Cronograma corresponde → mismo flujo de autenticación (quién + contraseña, con cambio de contraseña forzado si es primer ingreso) antes de guardar.
- Permite quitar una evidencia ya etiquetada (también requiere autenticación).

### 2.4 Repositorios conectados (`data/repos.ts`)

```ts
REPOS = [
  { id: 'clerkship',     owner: 'Steven08Ar',   name: 'Clerkship' },      // Backend / Frontend
]
```

- `getReposForCategory(catId)` sugiere el repo por defecto según la categoría (IA→AgentGrimoire, Backend/Frontend→Clerkship, General→ambos), pero **el selector siempre deja cambiarlo manualmente** — no queda bloqueado.
- Se evaluó agregar un repo privado de IA pero es **privado**: exponer un repo privado desde el navegador (sin backend) implicaría filtrar un token de GitHub a cualquier visitante. Se decidió **ignorarlo por ahora**. Opciones futuras si se retoma: hacerlo público, o montar un proxy serverless (Vercel function) que guarde el token de forma segura.

---

## 3. Firebase

### 3.1 Configuración (`data/firebase.ts`)

- Proyecto de Firebase separado, **solo para pruebas** (Realtime Database + Authentication).
- Config vía variables de entorno de Vite (`frontend/.env`, no versionado — ver `frontend/.env.example`):
  ```
  VITE_FIREBASE_API_KEY
  VITE_FIREBASE_AUTH_DOMAIN
  VITE_FIREBASE_DATABASE_URL
  VITE_FIREBASE_PROJECT_ID
  VITE_FIREBASE_STORAGE_BUCKET
  VITE_FIREBASE_MESSAGING_SENDER_ID
  VITE_FIREBASE_APP_ID
  ```
- Estas mismas 7 variables deben estar configuradas en **Vercel → Settings → Environment Variables** (Vite las "hornea" en el build, así que cambiarlas exige un redeploy).

### 3.2 Cuentas y autenticación (`data/devAuth.ts`)

Mapeo fijo memberId → correo de Firebase Auth (cuentas creadas manualmente en la consola, sin registro self-service):

```ts
MEMBER_EMAILS = {
  'juan-camilo':  'jrojas@clerkship.dev',
  'camilo-bueno': 'cbueno@clerkship.dev',
  'santiago':     'sarias@clerkship.dev',
}
```

- `authenticateMember(memberId, password)` — login contra Firebase Auth.
- `memberIdForEmail(email)` — lookup inverso (usado para saber "quién eres" a partir de la sesión de Firebase, sin pedirlo de nuevo).
- **Pendiente**: faltan 2 cuentas para los **directores de proyecto** (no se crearon aún — se necesitan sus correos preferidos y luego darlos de alta en Firebase Console → Authentication → Users, con contraseña temporal).

### 3.3 Primer ingreso obligatorio con cambio de contraseña

Mecanismo (sin backend/Admin SDK): Firebase deja el mismo instante (o casi) en `user.metadata.creationTime` y `lastSignInTime` la **primera vez** que una cuenta inicia sesión.

```ts
isFirstLogin(user) // true si creationTime ≈ lastSignInTime (< 60s de diferencia)
```

Si es `true`, la UI (en **los 3 puntos de autenticación**: Cuestionario, verificar-entrega del Cronograma, y evidencia del Repositorio) cambia a un formulario "Crea tu propia contraseña" (`setNewPassword`, `validateNewPassword` — mínimo 6 caracteres) antes de dejar continuar con la acción original. Esto aplica a **cualquier cuenta**, no solo a los desarrolladores ya existentes — así que también protegerá a los 2 directores en cuanto se creen sus cuentas.

### 3.4 Almacenamiento (Realtime Database)

```
/desarrollo
  /cuestionario/answers        → { [techPlaceholderKey]: string }
  /cronograma/completedMap     → { [catId-actId]: boolean }
  /cronograma/evidence         → { [catId-actId]: RepoEvidence }
```

`RepoEvidence` (`data/repoEvidence.ts`) guarda: `repoId`, `sha`, `shortSha`, `branch`, `message`, `htmlUrl`, `author`, `date`, `milestoneLabel`, `description`, `registeredBy`, `taggedAt`. Todo lo que se ve en el modal de verificación queda persistido ahí — no es solo UI.

### 3.5 Reglas de seguridad recomendadas (Realtime Database)

```json
{
  "rules": {
    "desarrollo": {
      ".read": true,
      ".write": "auth != null"
    },
    "$other": { ".read": false, ".write": false }
  }
}
```

Cualquiera puede **leer** (para que el Cronograma público en `/cronograma` funcione sin login), pero solo las cuentas de Firebase Auth dadas de alta pueden **escribir**.

### 3.6 Componentes compartidos de autenticación

- `components/shared/DevAuthFields.tsx` — selector de integrante + contraseña (usado en Cronograma y Repositorio).
- `components/shared/PasswordInput.tsx` — input de contraseña con botón mostrar/ocultar (ojo).
- `components/shared/NewPasswordFields.tsx` — par "nueva contraseña" + "confirmar", reutilizado en los 3 puntos de primer-ingreso.

---

## 4. Login principal de la app clínica (`/login`)

- `data/mainAuth.ts` — `loginWithEmailPassword(email, password)`, capa separada a propósito: cuando el backend real (Flask + Supabase, en desarrollo aparte) esté listo, **solo hay que cambiar este archivo**, sin tocar `LoginPage.tsx`.
- `pages/auth/LoginPage.tsx` — ya no es un mock que "pasa" con cualquier dato: autentica de verdad contra Firebase, con el mismo flujo de primer-ingreso → cambiar contraseña que el resto del sistema.
- `pages/auth/RegisterPage.tsx` — **intencionalmente sin conectar** a nada (sigue siendo un mock que no crea cuentas reales), tal como se pidió: "que no sirva el registro".
- Las 6 cuentas de Firebase (4 devs + 2 directores, aún pendientes) sirven tanto para el Módulo de Desarrollo como para entrar al Dashboard clínico de prueba.

### Rutas relevantes en `App.tsx`

- `/cuestionario`, `/desarrollo`, `/cronograma` → **públicas**, autenticación propia (Firebase por integrante).
- `/login`, `/register` → con `PublicAuthRoute` (si ya hay sesión, redirige a `/dashboard` o `/consent`).
- `/dashboard`, `/chats`, `/casos`, etc. → `ProtectedRoute` (exige `isAuthenticated()` + `hasUserAcceptedConsent()`, ver `utils/authConsent.ts`).

---

## 5. Dashboard clínico — ajustes hechos

### 5.1 Usuario real en vez de "Santiago Arias" hardcodeado

`utils/currentUser.ts` — hook `useCurrentUser()` que escucha `onAuthStateChanged` de Firebase y resuelve, **para cualquier cuenta**:
1. Si el correo pertenece a uno de los 4 desarrolladores → reutiliza su nombre/avatar de `data/teamData.ts`.
2. Si no (directores, futuras cuentas) → usa `photoURL` de Firebase si existe, o genera un avatar consistente (DiceBear) a partir del correo.

Aplicado en: `components/shared/Sidebar.tsx` (avatar del riel + dropdown de perfil + nombre/rol), `pages/chats/ChatsPage.tsx` (avatar del topbar), `components/shared/WelcomeOverlay.tsx` (pantalla "¡Bienvenido de nuevo, [Nombre]!" — antes derivaba el nombre del correo, ej. "Sarias").

### 5.2 Cierre de sesión real

`Sidebar.tsx` → botón "Cerrar sesión": antes solo borraba `clerkship_consent` (dejando `clerkship_auth` activo, o sea que NO cerraba sesión de verdad). Ahora limpia el estado de sesión (`logoutUserSession()` en `utils/authConsent.ts`) **y** cierra la sesión real de Firebase (`signOut(auth)`).

### 5.3 Chats + Correo + Comunidad fusionados en una sola página

`pages/chats/ChatsPage.tsx` — **decisión explícita del usuario**: los 3 íconos superiores (Chats / Correo / Comunidad) **no deben cambiar de ruta**, todo pasa dentro del mismo panel.

- Un solo estado `section: 'chats' | 'mail' | 'community'` decide qué se renderiza en el `<aside>` (lista) y el `<main>` (detalle) — sin `navigate()`, sin remount de página.
- **Correo**: bandeja de entrada estilo Gmail (lista + detalle + adjunto + reply/continue + barra de respuesta), con contenido de ejemplo adaptado al contexto clínico (casos aprobados, guías WGO, biblioteca, etc.) en vez del contenido genérico de la referencia visual original.
- **Comunidad**: placeholder minimalista ("Estamos trabajando en este espacio...").
- Existió una página separada `pages/correo/CorreoPage.tsx` con ruta `/correo` en un punto intermedio — **se eliminó** al fusionar todo en `ChatsPage.tsx`, siguiendo la instrucción de no navegar entre rutas.

### 5.4 Limpieza visual (paleta y minimalismo)

- Selector de agentes de IA (en Chats): antes mostraba nombre + badge de modelo ("GPT-4o / Clinical Orchestrator") + descripción larga. Ahora solo el **nombre del agente** — se quitaron esos campos de los datos, no solo de la UI.
- El logo dentro del selector de agentes pasó de `<img>` fija a **SVG inline con `fill="currentColor"`**, así se pinta negro en modo claro / blanco en modo oscuro automáticamente (usa la variable `--ink`).
- Se quitaron los fondos grises fijos de botones circulares (+, micrófono, chips de herramientas) y de las tarjetas del dropdown de agentes — ahora transparentes por defecto, con hover sutil.
- El ícono activo de la fila superior (Chats/Correo/Comunidad) usaba un morado (`#9333EA`) que **no pertenece a la paleta de la app** — se cambió a `var(--p)` (azul oficial, `#1976D2`, definido en `landing.css`).
- Los 3 íconos + el avatar de perfil se juntaron (antes `justify-content: space-between` los separaba a todo lo ancho del panel); ahora usan `gap` pequeño y el avatar se empuja a la derecha con `margin-left: auto`.
- El área de mensajes tiene un difuminado (`mask-image`, alfa puro, sin cajas) arriba y abajo — la barra de escribir flota (`position: absolute`) por encima de las burbujas, con fondo transparente de verdad (antes solo estaba declarado transparente en CSS pero no flotaba realmente sobre nada).

> Nota técnica encontrada durante la sesión: varias clases CSS de Chats (`.chats-ai-plus-btn`, `.chats-agent-drop-item`, etc.) estaban **duplicadas** en `dashboard.css` con valores ligeramente distintos — probablemente de iteraciones de diseño anteriores sin limpiar. Se editaron ambas ocurrencias para evitar que el resultado dependa de cuál gane en cascada.

---

## 6. Despliegue (Vercel + dominio propio)

- `frontend/vercel.json` — necesario porque la app usa rutas del lado del cliente (React Router). Sin esto, entrar directo a una ruta como `/cuestionario` o refrescar en ella da 404 en Vercel.
  ```json
  { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
  ```
- En Vercel: **Root Directory = `frontend`** (el repo es un monorepo con `frontend/`, `docs/`, etc. en la raíz).
- Las 7 variables `VITE_FIREBASE_*` deben estar en Vercel (Production/Preview/Development) — si se agregan después de un deploy, hay que **redeploy** manual (Vite las compila en build time, no las lee en runtime).
- **Firebase Auth requiere autorizar el dominio**: Firebase Console → Authentication → Settings → Authorized domains → agregar el dominio de Vercel (`*.vercel.app`) y el dominio propio.
- Dominio propio `clerk-ship.online` (GoDaddy):
  - El síntoma inicial ("el dominio redirige solo a `clerkship.vercel.app`") era por **GoDaddy Domain Forwarding** activo — hubo que desactivarlo (pestaña "Forwarding" en GoDaddy, no la de "DNS Records").
  - Los registros A "gemelos" (`15.197.225.128`, `3.33.251.168`) los crea GoDaddy automáticamente para ese forwarding y no se pueden borrar mientras esté activo — se liberan al quitar el forwarding.
  - Registros DNS finales: `A @ → 76.76.21.21` (Vercel) + `CNAME www → cname.vercel-dns.com.`
  - Además del DNS, el dominio se tuvo que **agregar explícitamente en Vercel → Settings → Domains** (antes solo existía `clerkship.vercel.app` ahí, por eso no bastaba con arreglar el DNS).

---

## 7. Pendientes / próximos pasos

1. **Crear las 2 cuentas de Firebase para los directores de proyecto** — falta decidir sus correos y darlos de alta manualmente en Firebase Console con contraseña temporal (el sistema los forzará a cambiarla en su primer ingreso, igual que a los devs).
2. **Repo `proyecto-grado`** — sigue sin conectar por ser privado. Decidir: hacerlo público, o construir un proxy serverless en Vercel que oculte el token de GitHub.
3. Confirmar visualmente en navegador real los últimos cambios de UI (agente picker minimalista, fusión Chats/Correo, difuminado de burbujas, colores de la fila de íconos) — no se pudieron verificar con navegador en el entorno de desarrollo donde se hicieron.
4. Cuando el backend real (Flask + Supabase) esté listo para producción: reemplazar la implementación de `data/mainAuth.ts` (login) y conectar `RegisterPage.tsx`, sin necesidad de tocar el resto de las pantallas.
5. Hay dos archivos de commit pendientes de subir a git al momento de escribir esto: `frontend/src/pages/chats/ChatsPage.tsx` y `frontend/src/styles/dashboard.css` (fusión Chats/Correo + ajustes de paleta/espaciado de los íconos).

---

## 8. Mapa de archivos clave

```
frontend/src/
├── data/
│   ├── firebase.ts              # init de Firebase (Realtime DB + Auth)
│   ├── devAuth.ts                # login por integrante, primer-ingreso, MEMBER_EMAILS
│   ├── mainAuth.ts                # login del Dashboard clínico (capa reemplazable por Supabase/Flask)
│   ├── cuestionarioStore.ts      # respuestas del Cuestionario en Firebase
│   ├── repoEvidence.ts           # evidencia de commits + completedMap en Firebase
│   ├── githubApi.ts              # fetch de branches/commits a la API pública de GitHub
│   ├── repos.ts                  # config de los repos conectados (Clerkship, AgentGrimoire)
│   ├── cronogramaActivities.ts   # datos del Cronograma (movido fuera de un .tsx por Fast Refresh)
│   └── techPlaceholders.ts       # opciones curadas por cada "____" del Cronograma
├── utils/
│   ├── currentUser.ts            # hook useCurrentUser() — usuario real de Firebase
│   └── authConsent.ts            # sesión/consentimiento del Dashboard clínico
├── components/shared/
│   ├── DevAuthFields.tsx         # integrante + contraseña (reutilizable)
│   ├── PasswordInput.tsx         # input con mostrar/ocultar
│   ├── NewPasswordFields.tsx     # nueva contraseña + confirmar
│   ├── Sidebar.tsx                # riel del dashboard — avatar real, logout real
│   └── WelcomeOverlay.tsx        # pantalla de bienvenida con nombre real
├── pages/
│   ├── desarrollo/                # Cuestionario, Cronograma, Repositorio
│   ├── auth/LoginPage.tsx        # login real contra Firebase
│   └── chats/ChatsPage.tsx       # Chats + Correo + Comunidad (una sola página)
└── App.tsx                        # rutas — /cuestionario y /desarrollo son públicas

frontend/vercel.json               # rewrite para SPA routing
frontend/.env.example              # plantilla de las 7 variables VITE_FIREBASE_*
```
