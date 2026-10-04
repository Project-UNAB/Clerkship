# 📁 Guía Técnica: Animación de Carpetas 3D con Vista Previa de Archivos Asomándose (Peek Effect)

Esta guía explica en detalle la arquitectura visual, la geometría 3D, el algoritmo de distribución pseudo-aleatoria y las animaciones CSS detrás del componente de carpetas de **Clinical**.

---

## 🌟 1. Anatomía Visual y Capas de Profundidad (Z-Index)

La carpeta está construida con **3 capas tridimensionales** superpuestas:

```text
┌────────────────────────────────────────────────────────┐
│  CAPA 1 (z-index: 1): Pestaña trasera (Tab shape)      │
│  .bib2-folder-tab-shape                                │
├────────────────────────────────────────────────────────┤
│  CAPA 2 (z-index: 2): Documentos flotantes (Peek)      │
│  .bib2-folder-peek-container                           │
│  └─ .bib2-mini-doc-sheet (--peek-rot, x, y, z)         │
├────────────────────────────────────────────────────────┤
│  CAPA 3 (z-index: 3): Solapa frontal 3D (Front flap)   │
│  .bib2-folder-front-flap (rotateX al hacer hover)      │
└────────────────────────────────────────────────────────┘
```

---

## 🎨 2. Estructura HTML / JSX

```tsx
<div className="bib2-folder-card-wrap">
  <button 
    type="button" 
    className="bib2-folder-3d" 
    onClick={() => openFolder(folder)}
  >
    {/* Capa 1: Pestaña superior con color traslúcido */}
    <div 
      className="bib2-folder-tab-shape" 
      style={{
        background: `${folderColor}BF`,       // 75% opacidad
        borderColor: `${folderColor}E6`,      // 90% opacidad
      }} 
    />

    {/* Capa 2: Contenedor de mini-documentos internos */}
    <div className="bib2-folder-peek-container">
      {peekDocs.map((doc, idx) => (
        <div 
          key={doc.id}
          className="bib2-mini-doc-sheet" 
          style={{
            '--peek-rot': `${doc.rotation}deg`,
            '--peek-x': `${doc.xOffset}px`,
            '--peek-y': `${doc.yOffset}px`,
            '--peek-z': idx + 1,
          } as React.CSSProperties}
        >
          {/* Badge del tipo (PDF, DOC, XLS, IMG, etc.) */}
          <span className={`bib2-mini-doc-badge ${doc.typeClass}`}>
            {doc.typeLabel}
          </span>
          {/* Líneas simuladas de texto */}
          <div className="bib2-mini-doc-lines">
            <span className="bmd-line bmd-line-1" />
            <span className="bmd-line bmd-line-2" />
            <span className="bmd-line bmd-line-3" />
          </div>
          {/* Nombre truncado del archivo */}
          <span className="bib2-mini-doc-name">{doc.name}</span>
        </div>
      ))}
    </div>

    {/* Capa 3: Solapa frontal que se abre hacia adelante en 3D */}
    <div 
      className="bib2-folder-front-flap" 
      style={{
        background: `linear-gradient(135deg, ${folderColor}D9 0%, ${folderColor}B3 100%)`,
        borderColor: `${folderColor}E6`,
      }}
    >
      <div className="bib2-folder-front-info">
        <h3 className="bib2-folder-title-front">{folder.name}</h3>
        <p className="bib2-folder-meta-front">
          {folder.file_count} archivos · {formatFileSize(folder.total_size_bytes)}
        </p>
      </div>
    </div>
  </button>
</div>
```

---

## 🎲 3. Algoritmo Determinista de Posición y Rotación "Aleatoria"

Para evitar que los archivos cambien de posición o salten entre re-renders de React, se utiliza una **semilla matemática (Seed)** basada en el `folderId`. Así, cada carpeta tiene un abanico de archivos único y persistente.

### Código del Algoritmo:

```typescript
function getPeekDocsForFolder(docsInFolder: DocumentSummary[], fileCount: number, folderId: string) {
  if (fileCount === 0) return [];

  const maxDocs = 6; // Máximo 6 mini hojas para no saturar
  let items = docsInFolder.slice(0, maxDocs);

  // Si la carpeta tiene archivos pero aún no cargaron los detalles, generamos mocks tipados
  if (items.length === 0 && fileCount > 0) {
    const mockTypes = [
      { mime_type: 'application/pdf', name: 'Documento.pdf' },
      { mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', name: 'Informe.docx' },
      { mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', name: 'Datos.xlsx' },
      { mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', name: 'Presentacion.pptx' },
      { mime_type: 'image/png', name: 'Imagen.png' },
      { mime_type: 'application/pdf', name: 'Guia.pdf' },
    ];
    items = Array.from({ length: Math.min(fileCount, maxDocs) }, (_, i) => ({
      id: `mock-${folderId}-${i}`,
      folder_id: folderId,
      size_bytes: 1024,
      created_at: new Date().toISOString(),
      ...mockTypes[i % mockTypes.length],
    }));
  }

  // 1. Generar Hash / Semilla numérica del ID de la carpeta
  let hash = 0;
  for (let i = 0; i < folderId.length; i++) {
    hash = (hash << 5) - hash + folderId.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const count = items.length;

  // 2. Distribución en abanico horizontal según la cantidad de archivos
  const baseSpans: Record<number, number[]> = {
    1: [0],
    2: [-34, 34],
    3: [-50, 0, 50],
    4: [-58, -20, 20, 58],
    5: [-64, -32, 0, 32, 64],
    6: [-70, -42, -14, 14, 42, 70],
  };

  const xList = baseSpans[count] || baseSpans[6];

  // 3. Calcular offsets y rotaciones pseudo-aleatorias
  return items.map((doc, idx) => {
    const typeInfo = getDocTypeInfo(doc.name, doc.mime_type);

    // Rotación entre -13deg y +13deg usando función seno
    const r1 = Math.sin(seed + idx * 17.13) * 10000;
    const rndRot = (r1 - Math.floor(r1)) * 26 - 13;

    // Desplazamiento X adicional (Jitter ±5px)
    const r2 = Math.sin(seed + idx * 31.41) * 10000;
    const rndXJitter = ((r2 - Math.floor(r2)) - 0.5) * 10;

    // Elevación vertical Y (entre -29px y -34px para asomarse)
    const r3 = Math.sin(seed + idx * 53.87) * 10000;
    const rndY = -29 - (r3 - Math.floor(r3)) * 5;

    const baseX = xList[idx] ?? 0;

    return {
      id: doc.id,
      name: doc.name,
      ...typeInfo,
      rotation: Math.round(rndRot),
      xOffset: Math.round(baseX + rndXJitter),
      yOffset: Math.round(rndY),
    };
  });
}
```

---

## 🚀 4. Estilos CSS y Efectos de Animación

### A. Perspectiva 3D del Contenedor Padre
```css
.bib2-folder-3d {
  position: relative;
  width: 210px;
  min-height: 120px;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  text-align: left;
  font-family: inherit;

  /* Habilita el entorno 3D para los hijos */
  perspective: 700px;
  transform-style: preserve-3d;
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.24s;
}

/* Elevación general de la carpeta en hover */
.bib2-folder-3d:hover {
  transform: translateY(-5px) scale(1.02);
  filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.22));
}
```

### B. Pestaña Superior Trasera
```css
.bib2-folder-tab-shape {
  width: 76px;
  height: 12px;
  border-top-left-radius: 8px;
  border-top-right-radius: 8px;
  border-style: solid;
  border-width: 1.5px 1.5px 0 1.5px;
  box-shadow: inset 0 2px 2px rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  position: relative;
  z-index: 1;
}
```

### C. Solapa Frontal con Apertura 3D (`rotateX`)
```css
.bib2-folder-front-flap {
  flex: 1;
  width: 100%;
  border-top-right-radius: 14px;
  border-bottom-left-radius: 14px;
  border-bottom-right-radius: 14px;
  padding: 16px 16px 14px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  border-style: solid;
  border-width: 1.5px;
  box-shadow:
    0 10px 24px rgba(0, 0, 0, 0.16),
    inset 0 1px 1px rgba(255, 255, 255, 0.3);
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
  z-index: 3;

  /* Eje de rotación en la base de la solapa */
  transform-origin: bottom center;
  transform: rotateX(0deg);
  transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.32s ease;
}

/* APERTURA: La solapa se inclina hacia adelante al pasar el cursor */
.bib2-folder-3d:hover .bib2-folder-front-flap,
.bib2-folder-card-wrap:hover .bib2-folder-front-flap {
  transform: rotateX(-14deg) translateY(2px);
  box-shadow:
    0 14px 28px rgba(0, 0, 0, 0.24),
    inset 0 1px 1px rgba(255, 255, 255, 0.4);
}
```

### D. Mini Documentos Asomándose (Efecto Resorte)
```css
.bib2-folder-peek-container {
  position: absolute;
  top: 12px;
  left: 0;
  right: 0;
  height: 0;
  pointer-events: none;
  z-index: 2;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.bib2-mini-doc-sheet {
  position: absolute;
  top: 0;
  width: 42px;
  height: 54px;
  background: #FFFFFF;
  border: 1.5px solid var(--border, #E2E8F0);
  border-radius: 6px;
  padding: 3px 3.5px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 2px;
  
  /* Estado de Reposo: Escondido detrás de la solapa frontal */
  transform: translate(var(--peek-x), 22px) rotate(0deg) scale(0.65);
  opacity: 0;
  transition: transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
  z-index: var(--peek-z);
}

/* Estado de Hover: Emerge con rebote elástico (Spring), rotación y elevación */
.bib2-folder-3d:hover .bib2-mini-doc-sheet,
.bib2-folder-card-wrap:hover .bib2-mini-doc-sheet {
  opacity: 1;
  transform: translate(var(--peek-x), var(--peek-y)) rotate(var(--peek-rot)) scale(1);
}
```

### E. Micro-detalles de los Mini Documentos
```css
/* Badge del formato de archivo (PDF, DOC, XLS, etc.) */
.bib2-mini-doc-badge {
  font-size: 0.46rem;
  font-weight: 900;
  padding: 1px 3px;
  border-radius: 3px;
  color: #FFFFFF;
  text-align: center;
  letter-spacing: 0.04em;
  width: fit-content;
  line-height: 1;
}

.bib2-mini-doc-badge.bmd-pdf { background: #EF4444; }
.bib2-mini-doc-badge.bmd-doc { background: #2563EB; }
.bib2-mini-doc-badge.bmd-xls { background: #10B981; }
.bib2-mini-doc-badge.bmd-ppt { background: #F97316; }
.bib2-mini-doc-badge.bmd-img { background: #9333EA; }
.bib2-mini-doc-badge.bmd-txt { background: #0284C7; }
.bib2-mini-doc-badge.bmd-file { background: #64748B; }

/* Líneas simuladas de texto */
.bib2-mini-doc-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 1px 0;
}
.bmd-line {
  height: 2px;
  border-radius: 2px;
  background: #CBD5E1;
}
.bmd-line-1 { width: 85%; }
.bmd-line-2 { width: 100%; }
.bmd-line-3 { width: 55%; }

/* Nombre del archivo */
.bib2-mini-doc-name {
  font-size: 0.44rem;
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.1;
}
```

---

## 🎯 5. Claves del Éxito de esta Animación

1. **Curva Bezier tipo "Resorte Elástico"**:
   `cubic-bezier(0.34, 1.56, 0.64, 1)` provoca que los documentos reboten ligeramente al asomarse, dando una sensación orgánica y dinámica.
2. **Transform-Origin en `bottom center`**:
   Permite que la solapa frontal rote como una bisagra física de una carpeta real.
3. **Variables CSS Inyectadas (`--peek-rot`, `--peek-x`, `--peek-y`, `--peek-z`)**:
   Separa la lógica matemática (en React) de la animación pura acelerada por GPU (en CSS).
4. **Semilla Hash**:
   Garantiza que la carpeta mantenga su mismo aspecto sin importar cuántas veces se redibuje la pantalla.
