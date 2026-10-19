import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * Utilidades compartidas por las pruebas e2e.
 *
 * Reglas de la suite:
 *  - Solo lectura: ninguna prueba crea, edita ni borra datos. La base es la
 *    real del proyecto, así que si una cuenta no tiene el dato que la prueba
 *    necesita, la prueba se OMITE (no lo crea).
 *  - Las credenciales vienen del entorno (ver e2e/README.md). Si faltan, la
 *    prueba se omite.
 *  - Cualquier window.confirm()/alert() se descarta: nunca se acepta un
 *    diálogo que podría borrar algo.
 */

export type Rol = 'docente' | 'estudiante' | 'admin'

interface Credenciales {
  email: string
  password: string
}

const VARIABLES: Record<Rol, { email: string; password: string }> = {
  docente: { email: 'E2E_DOCENTE_EMAIL', password: 'E2E_DOCENTE_PASS' },
  estudiante: { email: 'E2E_ESTUDIANTE_EMAIL', password: 'E2E_ESTUDIANTE_PASS' },
  admin: { email: 'E2E_ADMIN_EMAIL', password: 'E2E_ADMIN_PASS' },
}

/** Credenciales del rol, o null si falta alguna de las dos variables. */
export function credenciales(rol: Rol): Credenciales | null {
  const nombres = VARIABLES[rol]
  const email = process.env[nombres.email]?.trim()
  const password = process.env[nombres.password]
  if (!email || !password) return null
  return { email, password }
}

/** Mensaje para test.skip cuando faltan las credenciales. */
export function motivoOmision(rol: Rol): string {
  const nombres = VARIABLES[rol]
  return `Faltan ${nombres.email} y/o ${nombres.password} en el entorno; prueba omitida.`
}

/**
 * Inicia sesión con la cuenta del rol. Si la cuenta todavía no aceptó el
 * consentimiento informado, lo acepta en /consent (es un registro por cuenta,
 * no una escritura de datos del dominio).
 */
export async function iniciarSesion(page: Page, rol: Rol): Promise<void> {
  const datos = credenciales(rol)
  if (!datos) throw new Error(motivoOmision(rol))

  await page.goto('/login')
  await page.locator('input[type=email]').fill(datos.email)
  await page.locator('#auth-password').fill(datos.password)
  await page.locator('.auth-submit').click()

  // Firebase + API real: el login puede tardar unos segundos.
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 60_000 })

  if (new URL(page.url()).pathname === '/consent') {
    await page.locator('.cp-check-row').click()
    await page.locator('.cp-btn-accept').click()
    // La página de consentimiento tiene una transición de ~3 s.
    await page.waitForURL(url => !url.pathname.startsWith('/consent'), { timeout: 90_000 })
  }
}

/**
 * Espera a que el locator sea visible. Devuelve false (sin lanzar) si nunca
 * aparece, para que la prueba pueda omitirse en vez de fallar.
 */
export async function esperarVisible(locator: Locator, timeout = 20_000): Promise<boolean> {
  return locator
    .first()
    .waitFor({ state: 'visible', timeout })
    .then(() => true)
    .catch(() => false)
}

/**
 * Abre el primer curso del docente desde /mis-cursos. Devuelve false si la
 * cuenta no tiene cursos visibles (la prueba debe omitirse, no crearlos).
 */
export async function abrirPrimerCurso(page: Page): Promise<boolean> {
  await page.goto('/mis-cursos')
  const primeraTarjeta = page.locator('.mc-course-card').first()
  if (!(await esperarVisible(primeraTarjeta))) return false

  await primeraTarjeta.click()
  await page.waitForURL(/\/mis-cursos\/[0-9a-fA-F-]{8,}/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Módulos del curso' })).toBeVisible()
  return true
}

/* ── Contexto común ────────────────────────────────────────────────────────
 * - Tema claro forzado: la app guarda el tema en localStorage; se fija antes
 *   de cada navegación para que ninguna prueba dependa del tema del navegador.
 * - Diálogos: se descartan siempre (nunca se aceptan confirmaciones).
 */
test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('clerkship_theme', 'light')
    } catch {
      // Contexto sin almacenamiento: no es motivo para fallar.
    }
  })
  page.on('dialog', dialog => void dialog.dismiss())
})

export { test, expect }
