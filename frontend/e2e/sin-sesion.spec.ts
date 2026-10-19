import { test, expect } from './helpers'

/**
 * Rutas protegidas sin sesión: /mis-cursos debe mandar a /login.
 * No necesita credenciales porque el contexto de cada prueba arranca vacío.
 */
test.describe('Sin sesión', () => {
  test('/mis-cursos redirige a /login', async ({ page }) => {
    await page.goto('/mis-cursos')

    await expect(page).toHaveURL(/\/login$/)
    await expect(page.locator('input[type=email]')).toBeVisible()
    await expect(page.locator('#auth-password')).toBeVisible()
    await expect(page.locator('.auth-submit')).toBeVisible()
  })
})
