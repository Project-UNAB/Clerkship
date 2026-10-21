/** Piezas comunes de los resultados de validación por expertos (plataforma y casos). */
import type { ItemValidez } from '../../data/adminApi';

export const num = (n: number | null | undefined, d = 2) => (n == null ? '—' : n.toFixed(d).replace('.', ','));
export const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

/** Descarga filas como CSV con «;» y BOM, para que Excel en español lo abra con tildes. */
export function descargarCsv(nombre: string, filas: (string | number | null | undefined)[][]) {
  const escapar = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = filas.map(f => f.map(escapar).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${nombre}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Decisión por ítem: V de Aiken frente al umbral y, con 6 o más expertos, I-CVI ≥ 0,78 (Polit y Beck);
 * con menos, I-CVI = 1. */
export function decision(item: ItemValidez, umbral: number): { texto: string; clase: string } {
  if (!item.n || item.v == null) return { texto: 'Sin datos', clase: 'is-gris' };
  const icviOk = item.i_cvi != null && (item.n >= 6 ? item.i_cvi >= 0.78 : item.i_cvi === 1);
  if (item.v >= umbral && icviOk) return { texto: 'Válido', clase: 'is-verde' };
  if (item.v >= umbral || icviOk) return { texto: 'Revisar', clase: 'is-ambar' };
  return { texto: 'Modificar', clase: 'is-rojo' };
}

/** V de Aiken con su intervalo del 95 % y la línea del criterio. */
export function BarraAiken({ item, umbral }: { item: ItemValidez; umbral: number }) {
  if (item.v == null) return <span className="va-sin">—</span>;
  const l = (item.ic_inferior ?? item.v) * 100;
  const u = (item.ic_superior ?? item.v) * 100;
  return (
    <div className="va-aiken" title={`V = ${num(item.v)} · IC 95 % [${num(item.ic_inferior)} – ${num(item.ic_superior)}]`}>
      <div className="va-aiken-pista">
        <span className="va-aiken-ic" style={{ left: `${l}%`, width: `${Math.max(1, u - l)}%` }} />
        <span className={`va-aiken-v${item.v >= umbral ? ' is-ok' : ''}`} style={{ left: `${item.v * 100}%` }} />
        <span className="va-aiken-umbral" style={{ left: `${umbral * 100}%` }} />
      </div>
      <span className="va-aiken-num"><strong>{num(item.v)}</strong> <small>[{num(item.ic_inferior)}–{num(item.ic_superior)}]</small></span>
    </div>
  );
}
