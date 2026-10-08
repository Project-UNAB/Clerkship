import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import Spreadsheet from 'x-data-spreadsheet';
import { workbookToXSpreadsheetData } from '../../utils/sheetToXSpreadsheet';

interface ExcelSpreadsheetViewerProps {
  base64Data: string;
}

export default function ExcelSpreadsheetViewer({ base64Data }: ExcelSpreadsheetViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<Spreadsheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    try {
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const workbook = XLSX.read(bytes, { type: 'array' });
      const data = workbookToXSpreadsheetData(workbook);

      container.innerHTML = '';
      instanceRef.current = new Spreadsheet(container, {
        mode: 'read',
        showToolbar: false,
        showContextmenu: false,
        showBottomBar: true,
        view: {
          height: () => container.clientHeight,
          width: () => container.clientWidth,
        },
      }).loadData(data as any);
    } catch (err: any) {
      setError(err?.message || 'No se pudo leer la hoja de cálculo.');
    }

    return () => {
      if (container) container.innerHTML = '';
      instanceRef.current = null;
    };
  }, [base64Data]);

  if (error) {
    return <div className="doc-preview-center-msg doc-preview-error"><p>{error}</p></div>;
  }

  return <div ref={containerRef} className="doc-excel-xspreadsheet" />;
}
