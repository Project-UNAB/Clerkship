import {
  LayoutDashboard, FileText,
  Clock, Library,
} from 'lucide-react';
import type { ComponentType } from 'react';

export interface NavTab {
  id: string;
  label: string;
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  route: string | null;
}

// La Carpeta de Documentos en /dashboard ES el almacenamiento (Cloudflare R2
// por debajo, ver backend/app/routes/documentos.py). No hay una pestaña
// aparte para evitar duplicar la misma pantalla dos veces.
export const DASH_NAV: NavTab[] = [
  { id: 'overview',   label: 'Inicio',     Icon: LayoutDashboard, route: '/dashboard'  },
  { id: 'casos',      label: 'Casos',      Icon: FileText,        route: '/casos'      },
  { id: 'historial',  label: 'Historial',  Icon: Clock,           route: '/historial'  },
  { id: 'biblioteca', label: 'Biblioteca', Icon: Library,         route: '/biblioteca' },
];
