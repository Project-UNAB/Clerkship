/**
 * Convierte la primera página de un PDF en una imagen JPG, para usarla como
 * portada de un libro de la biblioteca. Corre en el navegador con PDF.js, que
 * se carga solo cuando hace falta (pesa cerca de 1 MB).
 */

/** Ancho de la imagen generada: de sobra para la portada (600×900). */
const ANCHO_IMAGEN = 1000;

export async function primeraPaginaComoImagen(pdf: File | string): Promise<File> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  // Con un archivo local, PDF.js lo lee por partes desde una URL temporal: no hace
  // falta cargar en memoria un PDF que puede pesar 2 GB.
  const url = typeof pdf === 'string' ? pdf : URL.createObjectURL(pdf);
  const tarea = pdfjsLib.getDocument({
    url,
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  });
  try {
    const documento = await tarea.promise;
    const pagina = await documento.getPage(1);
    const base = pagina.getViewport({ scale: 1 });
    const viewport = pagina.getViewport({ scale: ANCHO_IMAGEN / base.width });

    const lienzo = document.createElement('canvas');
    lienzo.width = Math.floor(viewport.width);
    lienzo.height = Math.floor(viewport.height);
    const ctx = lienzo.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('El navegador no pudo preparar la imagen de la portada.');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    await pagina.render({ canvasContext: ctx, viewport, canvas: lienzo }).promise;

    const blob = await new Promise<Blob | null>(resolve => lienzo.toBlob(resolve, 'image/jpeg', 0.9));
    lienzo.width = 0;
    await documento.destroy();
    if (!blob) throw new Error('No se pudo generar la imagen de la primera página.');
    return new File([blob], 'portada-primera-pagina.jpg', { type: 'image/jpeg' });
  } finally {
    if (typeof pdf !== 'string') URL.revokeObjectURL(url);
  }
}
