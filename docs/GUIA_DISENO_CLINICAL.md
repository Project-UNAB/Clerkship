# 🏛️ Guía Maestra del Sistema de Diseño - Clinical UI

Esta guía documenta la arquitectura de diseño, filosofía visual, paleta de colores, tokens, tipografía, componentes y patrones interactivos desarrollados en la plataforma **Clinical**.

---

## 1. 🎨 Filosofía y Principios de Diseño

El diseño de Clinical está inspirado en las mejores interfaces modernas de productividad (estilo Linear, Raycast, Google Drive moderno y Apple Human Interface Guidelines). Sus pilares fundamentales son:

1. **Jerarquía Visual Clara y Sin Saturación**:
   - Espaciado generoso con sistema métrico de 4px / 8px / 12px / 16px / 24px / 32px.
   - Fondos en capas (`Canvas` → `Surface 1` → `Surface 2` → `Card Elevation`).
   - Contraste accesible (WCAG AA) tanto en modo claro como en modo oscuro.

2. **Geometría Suave (Squircle & Rounded)**:
   - Bordes redondeados modernos: `10px` para botones/inputs, `14px` a `18px` para tarjetas/modales, `9999px` para píldoras y chips de estado.

3. **Micro-interacciones y Animaciones Fluidas**:
   - Curva de transición suave estándar: `cubic-bezier(0.16, 1, 0.3, 1)`.
   - Efectos *hover* táctiles: elevación sutil de -2px (`transform: translateY(-2px)`), brillo de borde o cambio de opacidad.
   - Transiciones de entrada y salida consistentes mediante `framer-motion`:
     ```tsx
     initial={{ opacity: 0, scale: 0.97, y: 8 }}
     animate={{ opacity: 1, scale: 1, y: 0 }}
     exit={{ opacity: 0, scale: 0.97, y: 4 }}
     transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
     ```

4. **Glassmorphism y Elevaciones**:
   - Modales, popovers y toasters flotantes con fondo translúcido y desenfoque:
     `background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px);`
   - Sombras multicapa difusas que evitan bordes duros y dan sensación de profundidad premium.

---

## 2. 🌈 Paleta de Colores y Tokens

### Variables CSS Principales (Light & Dark)

```css
:root {
  /* ── Tipografía ── */
  --font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

  /* ── Marca y Primario (Indigo) ── */
  --p: #4F46E5;
  --p-hover: #4338CA;
  --p-light: #EEF2FF;
  --p-glow: rgba(79, 70, 229, 0.25);

  /* ── Superficies (Modo Claro) ── */
  --canvas: #F8FAFC;
  --surface: #FFFFFF;
  --surface2: #F1F5F9;
  --surface3: #E2E8F0;
  --border: #E2E8F0;
  --border-focus: #6366F1;

  /* ── Textos / Tintas ── */
  --ink: #0F172A;       /* Títulos principales / Texto fuerte */
  --ink2: #334155;      /* Texto de lectura */
  --ink3: #64748B;      /* Subtítulos y metadatos */
  --ink4: #94A3B8;      /* Placeholders y deshabilitados */

  /* ── Estados Semánticos ── */
  --success: #10B981;
  --success-bg: #ECFDF5;
  --success-border: #A7F3D0;

  --warning: #F59E0B;
  --warning-bg: #FFFBEB;
  --warning-border: #FDE68A;

  --danger: #EF4444;
  --danger-bg: #FEF2F2;
  --danger-border: #FECACA;

  --info: #0EA5E9;
  --info-bg: #F0F9FF;
  --info-border: #BAE6FD;

  /* ── Formatos de Archivos y Badges ── */
  --badge-pdf: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
  --badge-word: linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%);
  --badge-excel: linear-gradient(135deg, #10B981 0%, #059669 100%);
  --badge-ppt: linear-gradient(135deg, #FB923C 0%, #EA580C 100%);
  --badge-img: linear-gradient(135deg, #A855F7 0%, #7C3AED 100%);
  --badge-code: linear-gradient(135deg, #64748B 0%, #475569 100%);
}

/* ── Modo Oscuro (Dark Theme) ── */
[data-theme="dark"] {
  --canvas: #0B1120;
  --surface: #0F172A;
  --surface2: #1E293B;
  --surface3: #334155;
  --border: rgba(255, 255, 255, 0.08);
  --border-focus: #818CF8;

  --ink: #F8FAFC;
  --ink2: #E2E8F0;
  --ink3: #94A3B8;
  --ink4: #64748B;

  --success-bg: rgba(16, 185, 129, 0.12);
  --success-border: rgba(16, 185, 129, 0.3);

  --warning-bg: rgba(245, 158, 11, 0.12);
  --warning-border: rgba(245, 158, 11, 0.3);

  --danger-bg: rgba(239, 68, 68, 0.12);
  --danger-border: rgba(239, 68, 68, 0.3);

  --info-bg: rgba(14, 165, 233, 0.12);
  --info-border: rgba(14, 165, 233, 0.3);
}
```

---

## 3. 🧩 Componentes Clave

### A. Sistema de Toasts Flotantes (Notificaciones)
- **Posición**: Superior derecha o centrado en móvil.
- **Aspecto**: Píldora redondeada (`14px`), borde sutil, sombra multicapa `0 12px 30px rgba(0, 0, 0, 0.12)`, ícono con halo suave del color temático y barra de progreso de autodestrucción.
- **Acciones**: Botón de cierre `X` con respuesta táctil.

### B. Tarjetas y Contenedores (Cards)
```css
.clinical-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.clinical-card:hover {
  transform: translateY(-2px);
  border-color: var(--border-focus);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.06);
}
```

### C. Botones Modernos (Buttons)
- **Botón Primario**: Degradado índigo suave, sombra de color tenue y texto blanco de 800 de grosor.
- **Botón Secundario / Outline**: Fondo de superficie, borde de `1.5px`, ícono nítido y texto ink2.
- **Botón Peligro / Danger**: Fondo rojo sutil con texto rojo vivo o fondo rojo sólido para confirmaciones destructivas.

### D. Píldoras y Badges (Pills)
- Píldoras con ícono a la izquierda, texto de 700 de peso y fondo con opacidad del 10% del color temático:
  ```css
  .clinical-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    border: 1px solid transparent;
  }
  ```

---

## 4. 📱 Reglas Responsivas y Móvil

1. **Prevenir Zoom Automático en iOS/Android**:
   Todos los inputs de búsqueda y formularios tienen `font-size: 16px` en móvil para evitar que Safari/Chrome hagan zoom no deseado.
2. **Tablas con `table-layout: fixed`**:
   Las columnas secundarias (fecha, peso) se ocultan en móvil y se colocan como subtítulo debajo del nombre principal para evitar que la tabla se rompa horizontalmente.
3. **Distribución en 2 Filas de Barras de Herramientas**:
   En pantallas pequeñas, las barras con múltiples controles (zoom, volver, título, descargar) se dividen limpiamente para evitar solapamientos.

---

## 5. 🛠️ Modo de Trabajo y Convenciones de Código

- **CSS Puro + Variables**: Estilos centralizados y mantenibles en `theme.css` y `dashboard.css`.
- **Iconografía**: Lucide React con trazos estándar (`strokeWidth: 1.8` a `2.2`).
- **Control de Versiones**: Commits atómicos con formato:
  `git commit -m "feat(modulo): resumen corto" -m "Detalle exhaustivo de cambios"` en español.
