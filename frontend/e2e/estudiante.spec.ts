import { test, expect, credenciales, motivoOmision, iniciarSesion } from './helpers'

/**
 * Vista del estudiante: la biblioteca (catálogo de libros y recursos).
 * Solo lectura; si el catálogo está vacío se comprueba el estado vacío.
 */
test.describe('Estudiante', () => {
  test('entra a /biblioteca y ve el catálogo', async ({ page }) => {
    test.skip(!credenciales('estudiante'), motivoOmision('estudiante'))
    await iniciarSesion(page, 'estudiante')

    await page.goto('/biblioteca')
    await expect(page).toHaveURL(/\/biblioteca$/)

    // Barra de búsqueda y estantes: la estructura de la biblioteca.
    await expect(page.locator('.bib-shelves')).toBeVisible()
    await expect(page.locator('.bib-sbar-input')).toBeVisible()

    // El estante del catálogo (para el estudiante se llama "Catálogo").
    await expect(
      page.getByRole('heading', { name: /^(Catálogo|Todos los recursos)$/ }),
    ).toBeVisible()
  })
})
