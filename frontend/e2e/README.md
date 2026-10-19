# Pruebas de extremo a extremo (Playwright)

Pruebas **de solo lectura** sobre el frontend real: navegan la aplicación con
sesiones reales, pero no crean, editan ni borran datos. La base de datos es la
del proyecto, así que si una cuenta no tiene cursos o módulos, la prueba se
**omite** en vez de crear contenido.

- Navegador: el **Chrome ya instalado** en la máquina (`channel: 'chrome'`), no
  se descargan los navegadores de Playwright.
- URL por defecto: `http://localhost:5173` (se cambia con `E2E_BASE_URL`).
- Modo claro forzado: cada prueba escribe `clerkship_theme = light` en
  `localStorage` antes de navegar.
- Los `window.confirm()` se descartan automáticamente: la suite nunca acepta un
  diálogo que pueda borrar algo.

## Requisitos

1. Backend Flask en `http://localhost:5001`.
2. Frontend Vite en `http://localhost:5173`.
3. Google Chrome instalado (el de escritorio normal).

## Credenciales (variables de entorno)

Nunca van en el código ni en el repositorio.

| Rol        | Variables                                              |
| ---------- | ------------------------------------------------------ |
| Docente    | `E2E_DOCENTE_EMAIL`, `E2E_DOCENTE_PASS`                |
| Estudiante | `E2E_ESTUDIANTE_EMAIL`, `E2E_ESTUDIANTE_PASS`          |
| Admin      | `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASS`                    |

Si falta el par de un rol, las pruebas de ese rol se omiten (`test.skip`); las
de los demás roles corren igual. La prueba de "sin sesión" no necesita
credenciales.

### PowerShell (Windows)

```powershell
cd frontend
$env:E2E_DOCENTE_EMAIL    = "docente@ejemplo.com"
$env:E2E_DOCENTE_PASS     = "********"
$env:E2E_ESTUDIANTE_EMAIL = "estudiante@ejemplo.com"
$env:E2E_ESTUDIANTE_PASS  = "********"
$env:E2E_ADMIN_EMAIL      = "admin@ejemplo.com"
$env:E2E_ADMIN_PASS       = "********"
npm run test:e2e
```

### Bash

```bash
cd frontend
E2E_DOCENTE_EMAIL="docente@ejemplo.com" E2E_DOCENTE_PASS="********" \
E2E_ESTUDIANTE_EMAIL="estudiante@ejemplo.com" E2E_ESTUDIANTE_PASS="********" \
E2E_ADMIN_EMAIL="admin@ejemplo.com" E2E_ADMIN_PASS="********" \
npm run test:e2e
```

Para un solo archivo o una sola prueba:

```bash
npx playwright test e2e/docente.spec.ts
npx playwright test -g "abre un módulo"
```

Para ver qué pruebas hay sin ejecutarlas (no necesita servidores):

```bash
npx playwright test --list
```

## Qué cubre

| Archivo                  | Prueba                                                                 |
| ------------------------ | ---------------------------------------------------------------------- |
| `docente.spec.ts`        | Ve `/mis-cursos`, abre su curso y el título "Módulos del curso".        |
|                          | Abre un módulo (`.cdl-mod-btn`), ve su panel y lo cierra.               |
|                          | Pulsa "Editar curso", aparece la barra `.cdl-editbar` y cancela.        |
| `estudiante.spec.ts`     | Entra a `/biblioteca` y ve el catálogo.                                 |
| `admin.spec.ts`          | Entra a `/admin`, abre "Biblioteca" y ve Pendientes/Aprobados/Rechazados. |
| `sin-sesion.spec.ts`     | `/mis-cursos` sin sesión redirige a `/login`.                           |

Utilidades compartidas en `helpers.ts`: `credenciales()`, `motivoOmision()`,
`iniciarSesion()` (incluye aceptar el consentimiento si redirige a `/consent`),
`esperarVisible()` y `abrirPrimerCurso()`.

## Reglas al agregar pruebas

- **Solo lectura.** No uses acciones de crear, guardar, aprobar, rechazar ni
  borrar. Si necesitas un dato que no existe, la prueba debe omitirse.
- Si un `window.confirm` aparece, ya se descarta solo; no lo aceptes.
- Usa los helpers de `helpers.ts` para el login y las credenciales, nunca
  correos o contraseñas en el código.
- Prefiere selectores estables ya existentes en la app (`#auth-password`,
  `.mc-course-card`, `.cdl-mod-btn`, `.cdl-mod-panel`, `.bib-shelves`,
  `.adm-toolbar`).

## Resultados

Al fallar se guardan captura y traza en `frontend/test-results/` (carpeta
generada; conviene añadirla al `.gitignore` del frontend). No hay `webServer` en
la configuración: los servidores se levantan aparte, para no interferir con el
entorno de desarrollo que ya esté corriendo.
