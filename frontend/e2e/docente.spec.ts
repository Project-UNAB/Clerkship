import {
  test,
  expect,
  credenciales,
  motivoOmision,
  iniciarSesion,
  abrirPrimerCurso,
  esperarVisible,
} from './helpers'

/**
 * Recorrido de solo lectura de la vista del docente:
 * cursos, módulos y modo edición sin guardar.
 */
test.describe('Docente', () => {
  test('entra, ve /mis-cursos, abre su curso y ve "Módulos del curso"', async ({ page }) => {
    test.skip(!credenciales('docente'), motivoOmision('docente'))
    await iniciarSesion(page, 'docente')

    await page.goto('/mis-cursos')
    await expect(page).toHaveURL(/\/mis-cursos$/)

    const primeraTarjeta = page.locator('.mc-course-card').first()
    const hayCursos = await esperarVisible(primeraTarjeta)
    test.skip(!hayCursos, 'La cuenta docente no tiene cursos visibles; no hay nada que abrir.')

    await primeraTarjeta.click()
    await expect(page).toHaveURL(/\/mis-cursos\/[0-9a-fA-F-]{8,}/)
    await expect(page.getByRole('heading', { name: 'Módulos del curso' })).toBeVisible()
  })

  test('abre un módulo, ve su panel y lo cierra', async ({ page }) => {
    test.skip(!credenciales('docente'), motivoOmision('docente'))
    await iniciarSesion(page, 'docente')

    const hayCurso = await abrirPrimerCurso(page)
    test.skip(!hayCurso, 'La cuenta docente no tiene cursos visibles.')

    const primerModulo = page.locator('.cdl-mod-btn').first()
    const hayModulos = await esperarVisible(primerModulo)
    test.skip(!hayModulos, 'El curso abierto no tiene módulos; no hay panel que abrir.')

    await primerModulo.click()
    const panel = page.locator('.cdl-mod-panel')
    await expect(panel).toBeVisible()

    await panel.locator('.cdl-mod-close').click()
    await expect(panel).toHaveCount(0)
  })

  test('entra en "Editar curso", ve la barra flotante y cancela sin guardar', async ({ page }) => {
    test.skip(!credenciales('docente'), motivoOmision('docente'))
    await iniciarSesion(page, 'docente')

    const hayCurso = await abrirPrimerCurso(page)
    test.skip(!hayCurso, 'La cuenta docente no tiene cursos visibles.')

    await page.getByRole('button', { name: 'Editar curso', exact: true }).click()

    const barra = page.locator('.cdl-editbar')
    await expect(barra).toBeVisible()

    // Cancelar descarta el borrador: nunca se pulsa "Guardar".
    await barra.locator('.cdl-editbar-acciones').getByRole('button', { name: 'Cancelar' }).click()
    await expect(page.locator('.cdl-editbar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Editar curso', exact: true })).toBeVisible()
  })
})
