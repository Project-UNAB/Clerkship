import { test, expect, credenciales, motivoOmision, iniciarSesion } from './helpers'

/**
 * Panel de administración: la pestaña Biblioteca y sus filtros de moderación.
 * Solo lectura (no se aprueba ni se rechaza nada).
 */
test.describe('Administrador', () => {
  test('abre /admin, entra a "Biblioteca" y ve los filtros de moderación', async ({ page }) => {
    test.skip(!credenciales('admin'), motivoOmision('admin'))
    await iniciarSesion(page, 'admin')

    await page.goto('/admin')
    await expect(page).toHaveURL(/\/admin$/)

    const entradaBiblioteca = page.getByRole('button', { name: 'Biblioteca', exact: true })
    await expect(entradaBiblioteca).toBeVisible()
    await entradaBiblioteca.click()

    await expect(page.getByRole('button', { name: /^Pendientes/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Aprobados', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Rechazados', exact: true })).toBeVisible()

    // Filtro por defecto: Pendientes. Se mira el estado sin pulsar acciones.
    await expect(page.locator('.adm-toolbar .adm-btn-active')).toContainText('Pendientes')
  })
})
