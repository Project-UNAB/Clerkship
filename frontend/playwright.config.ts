import { defineConfig } from '@playwright/test'

/**
 * Pruebas de extremo a extremo del frontend contra el entorno local
 * (Vite en el puerto 5173 + API Flask en el 5001). Son de SOLO LECTURA: no
 * crean, editan ni borran datos de la base real del proyecto.
 *
 * Las credenciales se leen del entorno; si faltan, la prueba se omite.
 * Ver e2e/README.md.
 *
 * Por defecto usa el Chrome ya instalado en la máquina (`channel: 'chrome'`),
 * así no hay que descargar los navegadores de Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  // La app habla con la API real: sin paralelismo para no saturar el login.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Modo claro forzado (el tema real de la app vive en localStorage, lo
    // fija e2e/helpers.ts antes de cada navegación).
    colorScheme: 'light',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
