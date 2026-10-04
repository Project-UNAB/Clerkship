import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export interface ParsedDocxResult {
  html: string;
  messages: string[];
}

export interface ParsedSheet {
  name: string;
  rows: string[][];
  maxCols: number;
}

export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: Record<string, ParsedSheet>;
}

export interface ParsedSlide {
  slideNumber: number;
  title: string;
  paragraphs: string[];
}

/** Helper: convierte una cadena base64 en un ArrayBuffer */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/** 1. Parsea un archivo Word (.docx) convirtiendo su XML nativo a HTML enriquecido */
export async function parseDocxFile(base64Data: string): Promise<ParsedDocxResult> {
  const arrayBuffer = base64ToArrayBuffer(base64Data);
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return {
      html: result.value || '<p><em>El documento está vacío o no contiene párrafos con texto legible.</em></p>',
      messages: result.messages.map(m => m.message),
    };
  } catch (err: any) {
    console.error('Error procesando archivo .docx con mammoth:', err);
    throw new Error('No se pudo convertir el formato del documento Word. Verifique que sea un archivo .docx válido.');
  }
}

/** 2. Parsea un archivo Excel (.xlsx, .xls, .csv) extrayendo todas sus hojas y celdas reales */
export function parseExcelFile(base64Data: string): ParsedWorkbook {
  const arrayBuffer = base64ToArrayBuffer(base64Data);
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames || [];
  const sheets: Record<string, ParsedSheet> = {};

  for (const name of sheetNames) {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) continue;

    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const rows = rawRows.map(row =>
      Array.isArray(row)
        ? row.map(cell => (cell !== null && cell !== undefined ? String(cell) : ''))
        : []
    );

    let maxCols = 0;
    for (const r of rows) {
      if (r.length > maxCols) maxCols = r.length;
    }

    sheets[name] = {
      name,
      rows,
      maxCols: Math.max(maxCols, 6),
    };
  }

  return {
    sheetNames: sheetNames.length > 0 ? sheetNames : ['Hoja 1'],
    sheets,
  };
}

/** 3. Parsea un archivo PowerPoint (.pptx) extrayendo diapositivas, títulos y viñetas reales */
export async function parsePptxFile(base64Data: string): Promise<ParsedSlide[]> {
  const arrayBuffer = base64ToArrayBuffer(base64Data);
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slides: ParsedSlide[] = [];

  const slideFiles: string[] = [];
  zip.forEach(relativePath => {
    if (relativePath.match(/^ppt\/slides\/slide\d+\.xml$/i)) {
      slideFiles.push(relativePath);
    }
  });

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
    const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
    return numA - numB;
  });

  for (let i = 0; i < slideFiles.length; i++) {
    const fileName = slideFiles[i];
    const xmlContent = await zip.file(fileName)?.async('string');
    if (!xmlContent) continue;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlContent, 'application/xml');

    const pNodes = xmlDoc.getElementsByTagName('a:p');
    const paragraphs: string[] = [];
    for (let j = 0; j < pNodes.length; j++) {
      const pTextNodes = pNodes[j].getElementsByTagName('a:t');
      let pText = '';
      for (let k = 0; k < pTextNodes.length; k++) {
        pText += pTextNodes[k].textContent || '';
      }
      const trimmed = pText.trim();
      if (trimmed) paragraphs.push(trimmed);
    }

    let title = paragraphs[0] || `Diapositiva ${i + 1}`;
    let bodyParagraphs = paragraphs.length > 1 ? paragraphs.slice(1) : [];

    slides.push({
      slideNumber: i + 1,
      title,
      paragraphs: bodyParagraphs,
    });
  }

  if (slides.length === 0) {
    slides.push({
      slideNumber: 1,
      title: 'Presentación',
      paragraphs: ['No se detectaron diapositivas con texto en el archivo.'],
    });
  }

  return slides;
}
