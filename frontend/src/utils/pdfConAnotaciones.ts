/**
 * Arma una copia del PDF de un libro con lo que el usuario hizo en el visor:
 * los trazos del lápiz y el resaltador dibujados en cada página, las zonas de
 * sus notas marcadas y numeradas, y al final unas páginas «Mis notas» con la
 * cita y el comentario de cada una. Corre en el navegador con pdf-lib, que se
 * carga solo cuando hace falta.
 */
import type { NotaLibro, TrazoAnotacion } from '../data/articulosApi';

const A4 = { ancho: 595.28, alto: 841.89 };
const MARGEN = 50;

function rgbDeHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}

export async function pdfConAnotaciones(
  urlDelPdf: string,
  trazosPorPagina: Record<string | number, TrazoAnotacion[]>,
  notas: NotaLibro[],
  titulo: string,
): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb, LineCapStyle, BlendMode } = await import('pdf-lib');
  const res = await fetch(urlDelPdf);
  if (!res.ok) throw new Error('No se pudo descargar el PDF del libro.');
  const doc = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
  const paginas = doc.getPages();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold);
  const cursiva = await doc.embedFont(StandardFonts.HelveticaOblique);

  // Las fuentes estándar solo traen el juego de caracteres WinAnsi (español sí, griego o emojis no).
  const cache = new Map<string, string>();
  const seguro = (texto: string) =>
    [...texto.replace(/\r/g, '')].map(c => {
      if (c === '\n') return c;
      let r = cache.get(c);
      if (r === undefined) {
        try { normal.encodeText(c); r = c; } catch { r = c.normalize('NFD').replace(/[̀-ͯ]/g, '') || '?'; }
        try { normal.encodeText(r); } catch { r = '?'; }
        cache.set(c, r);
      }
      return r;
    }).join('');

  /** Esquina inferior izquierda y tamaño visibles de la página (lo que muestra el visor). */
  const caja = (n: number) => {
    const p = paginas[n - 1];
    const { x, y, width, height } = p.getCropBox();
    return { p, x, y, w: width, h: height };
  };

  // ── Trazos del lápiz y del resaltador ──
  for (const [num, trazos] of Object.entries(trazosPorPagina)) {
    const n = Number(num);
    if (!paginas[n - 1] || !trazos?.length) continue;
    const { p, x, y, w, h } = caja(n);
    for (const t of trazos) {
      if (!t.puntos.length) continue;
      const [r, g, b] = rgbDeHex(t.color);
      const grosor = Math.max(0.6, t.grosor * w);
      const resaltador = t.herramienta === 'resaltador';
      if (t.puntos.length === 1) {
        const [px, py] = t.puntos[0];
        p.drawCircle({ x: x + px * w, y: y + h - py * h, size: grosor / 2, color: rgb(r, g, b), opacity: resaltador ? 0.45 : 1 });
        continue;
      }
      // En los caminos SVG de pdf-lib la y crece hacia abajo desde el origen dado.
      const camino = t.puntos.map(([px, py], i) => `${i ? 'L' : 'M'}${(px * w).toFixed(2)} ${(py * h).toFixed(2)}`).join(' ');
      p.drawSvgPath(camino, {
        x, y: y + h,
        borderColor: rgb(r, g, b),
        borderWidth: grosor,
        borderOpacity: resaltador ? 0.45 : 1,
        borderLineCap: LineCapStyle.Round,
        blendMode: resaltador ? BlendMode.Multiply : BlendMode.Normal,
      });
    }
  }

  // ── Zonas de las notas, numeradas como en el visor ──
  const ordenadas = [...notas].sort((a, b) => a.pagina - b.pagina || a.rect.y - b.rect.y);
  ordenadas.forEach((nota, i) => {
    if (!paginas[nota.pagina - 1]) return;
    const { p, x, y, w, h } = caja(nota.pagina);
    const [r, g, b] = rgbDeHex(nota.color);
    const rx = x + nota.rect.x * w;
    const arriba = y + h - nota.rect.y * h;
    const alto = nota.rect.h * h;
    p.drawRectangle({
      x: rx, y: arriba - alto, width: nota.rect.w * w, height: alto,
      color: rgb(r, g, b), opacity: 0.22, borderColor: rgb(r, g, b), borderWidth: 0.8, borderOpacity: 0.9,
      blendMode: BlendMode.Multiply,
    });
    const cx = Math.min(x + w - 8, rx + nota.rect.w * w);
    const cy = Math.min(y + h - 8, arriba);
    p.drawCircle({ x: cx, y: cy, size: 7, color: rgb(r, g, b), borderColor: rgb(1, 1, 1), borderWidth: 1 });
    const etiqueta = String(i + 1);
    p.drawText(etiqueta, { x: cx - negrita.widthOfTextAtSize(etiqueta, 7) / 2, y: cy - 2.5, size: 7, font: negrita, color: rgb(0.06, 0.09, 0.16) });
  });

  // ── Páginas finales «Mis notas» ──
  if (ordenadas.length) {
    let pagina = doc.addPage([A4.ancho, A4.alto]);
    let cursor = A4.alto - MARGEN;
    const nuevaSiFalta = (alto: number) => {
      if (cursor - alto < MARGEN) {
        pagina = doc.addPage([A4.ancho, A4.alto]);
        cursor = A4.alto - MARGEN;
      }
    };
    const parrafo = (texto: string, fuente: typeof normal, tam: number, color = rgb(0.12, 0.16, 0.23), sangria = 0) => {
      const ancho = A4.ancho - MARGEN * 2 - sangria;
      for (const bloque of seguro(texto).split('\n')) {
        let linea = '';
        for (const palabra of bloque.split(/\s+/)) {
          const prueba = linea ? `${linea} ${palabra}` : palabra;
          if (fuente.widthOfTextAtSize(prueba, tam) > ancho && linea) {
            nuevaSiFalta(tam * 1.45);
            pagina.drawText(linea, { x: MARGEN + sangria, y: cursor - tam, size: tam, font: fuente, color });
            cursor -= tam * 1.45;
            linea = palabra;
          } else {
            linea = prueba;
          }
        }
        if (linea) {
          nuevaSiFalta(tam * 1.45);
          pagina.drawText(linea, { x: MARGEN + sangria, y: cursor - tam, size: tam, font: fuente, color });
          cursor -= tam * 1.45;
        }
      }
    };
    parrafo('Mis notas', negrita, 20, rgb(0.06, 0.09, 0.16));
    parrafo(titulo, normal, 11, rgb(0.39, 0.45, 0.55));
    cursor -= 14;
    ordenadas.forEach((nota, i) => {
      nuevaSiFalta(60);
      const [r, g, b] = rgbDeHex(nota.color);
      pagina.drawRectangle({ x: MARGEN, y: cursor - 14, width: 4, height: 14, color: rgb(r, g, b) });
      parrafo(`Nota ${i + 1} · página ${nota.pagina}`, negrita, 11, rgb(0.06, 0.09, 0.16), 10);
      if (nota.cita) parrafo(`«${nota.cita}»`, cursiva, 9.5, rgb(0.39, 0.45, 0.55), 10);
      parrafo(nota.texto || '(Sin comentario)', normal, 10.5, rgb(0.12, 0.16, 0.23), 10);
      cursor -= 12;
    });
  }

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

/** Ofrece al navegador un archivo para guardar en el dispositivo. */
export function descargarBlob(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}
