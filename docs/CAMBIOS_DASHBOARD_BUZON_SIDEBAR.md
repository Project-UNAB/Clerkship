# Cambios recientes: Dashboard (Carpetas/Documentos), Buzón y Sidebar

> Documentación técnica de todo lo construido/arreglado en esta tanda de trabajo: quién lo pidió, cómo funciona, qué código quedó, y qué falta. Complementa a `SISTEMA_GESTION_DOCUMENTAL_Y_VISTAS_PREVIAS.md` (que documenta las vistas previas de PDF/Word/Excel/PPT) — este documento se enfoca en carpetas/documentos como CRUD real, el Buzón y el Sidebar.

> ⚠️ **Actualización — Chats y Buzón archivados**: el proyecto decidió no seguir usando el Buzón de correo ni Chats. Todo lo que describen las secciones **4** (Buzón — wizard de consentimiento), **6.4** (mini buzón en las tarjetas del Dashboard) y **7** (Compartir por Chat/Buzón y selector estilo Drive en Chats) de este documento **ya no está activo** — el código se movió a `archivado_buzon_chats/` (frontend) y `pruebas/archivado_buzon_chats/` (backend, sigue gitignored por ser "de pruebas"). Se dejan esas secciones tal cual, como registro histórico de cómo funcionaba, pero **ver la sección 9** para el detalle del archivado y cómo restaurarlo si hiciera falta.

---

## 1. Resumen de lo que se hizo

| Área | Qué se hizo |
|---|---|
| Dashboard → Documentos | CRUD real de carpetas y documentos (Postgres + MongoDB), colores personalizados, **subcarpetas (carpeta dentro de carpeta)**, renombrar sin poder tocar la extensión, spinner de "Descargando..." |
| Selector de color | Color picker propio (cuadro de saturación/valor + slider de tono + hex manual), reemplaza el `<input type="color">` nativo del navegador, usado en carpetas y en el avatar del registro |
| Rendimiento | Backend Flask corría de a una petición a la vez (`threaded=True` faltante) — pantallas que pedían varias cosas en paralelo (carpetas+recientes, mensajes+chats) se sentían lentas sin serlo realmente. Se agregaron índices en Mongo. |
| Buzón (`/buzon`) | Se blindó el wizard de consentimiento: mientras no se confirma el estado real (`mailbox_created`) contra el backend, no se muestra nada del buzón — antes había un instante donde se filtraba la UI del buzón antes de saber si correspondía el wizard. |
| Sidebar | Arreglado el crash de pantalla blanca en `/buzon` (`Cannot read properties of undefined (reading 'groups')`) — faltaba la entrada `mailbox` en el objeto `PANEL`. |

---

## 2. Dashboard → Carpetas y Documentos

### 2.1 Modelo de datos (híbrido Postgres + Mongo, mismo patrón que Chats/Buzón)

- **PostgreSQL (Supabase)** — tabla `document_folders`: quién es dueño, nombre, color, y desde esta sesión también `parent_folder_id` (subcarpetas).
- **MongoDB Atlas** — colección `documents`: el archivo real como base64 (no hay bucket S3 conectado), con `folder_id` como string suelto (no FK real, se valida a mano en el backend).

```sql
-- pruebas/db/postgresql/21-document-folders.sql
CREATE TABLE document_folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL,
    name VARCHAR(150) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#0284C7',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folder_owner FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX idx_document_folders_owner ON document_folders(owner_user_id);

-- pruebas/db/postgresql/22-document-folders-nesting.sql  (aplicada en vivo contra Supabase)
ALTER TABLE document_folders ADD COLUMN parent_folder_id UUID NULL;
ALTER TABLE document_folders ADD CONSTRAINT fk_folder_parent
    FOREIGN KEY (parent_folder_id) REFERENCES document_folders(id) ON DELETE CASCADE;
CREATE INDEX idx_document_folders_parent ON document_folders(parent_folder_id);
```

`parent_folder_id` es `NULL` para carpetas de nivel raíz. `ON DELETE CASCADE` hace que Postgres borre solo las filas de las subcarpetas cuando se borra la carpeta padre — pero **no** borra los documentos de Mongo de esas subcarpetas (eso lo hace el backend a mano, ver 2.3).

Índices reales creados en Mongo (colección `documents`, sin migración versionada — se crearon a mano vía script durante la sesión, **pendiente** dejarlos en un script repetible):
```
owner_user_id_1_folder_id_1
owner_user_id_1_created_at_-1
```

### 2.2 Modelo SQLAlchemy

`pruebas/back/flask-api/app/models/document_folder.py`:
```python
class DocumentFolder(db.Model):
    __tablename__ = "document_folders"
    id = db.Column(UUID(as_uuid=True), primary_key=True, server_default=db.text("uuid_generate_v4()"))
    owner_user_id = db.Column(UUID(as_uuid=True), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_folder_id = db.Column(UUID(as_uuid=True), db.ForeignKey("document_folders.id", ondelete="CASCADE"), nullable=True)
    name = db.Column(db.String(150), nullable=False)
    color = db.Column(db.String(7), nullable=False, server_default="#0284C7")
    created_at = db.Column(db.DateTime, server_default=func.now())
    updated_at = db.Column(db.DateTime, server_default=func.now())
```

### 2.3 Endpoints (`pruebas/back/flask-api/app/routes/documentos.py`, prefijo `/api/documentos`)

| Método | Ruta | Qué hace |
|---|---|---|
| `GET` | `/carpetas` | Lista carpetas del usuario, con `file_count`, `total_size_bytes` (agregación Mongo) y `subfolder_count` (contado en memoria a partir de todas sus carpetas). |
| `POST` | `/carpetas` | Crea carpeta. Acepta `parent_folder_id` opcional — si viene, valida que esa carpeta padre exista y sea del mismo usuario. |
| `PATCH` | `/carpetas/<id>` | Edita nombre/color, o **mueve** la carpeta cambiando `parent_folder_id`. Valida: no puede ser su propia padre, y no puede moverse dentro de una de sus propias subcarpetas (anti-ciclo, ver `_descendant_ids`). |
| `DELETE` | `/carpetas/<id>` | Borra la carpeta. Postgres cascadea las filas de subcarpetas solo; el backend calcula `_descendant_ids()` para borrar en Mongo los documentos de la carpeta **y de todas sus subcarpetas** a cualquier profundidad. |
| `GET`/`POST` | `/documentos` | Listar (con `folder_id` opcional) / subir documento. Límite `MAX_DOCUMENT_BASE64_CHARS = 15*1024*1024` (~11 MB reales). |
| `GET`/`PATCH`/`DELETE` | `/documentos/<id>` | Ver completo (con base64), renombrar/mover, borrar. |

**Anti-ciclo al mover carpetas** (`_descendant_ids`, recorrido iterativo con pila, no recursión):
```python
def _descendant_ids(user_id, root_id: str) -> list:
    """IDs de todas las subcarpetas (a cualquier profundidad) de root_id, sin incluirlo."""
    all_folders = DocumentFolder.query.filter_by(owner_user_id=user_id).all()
    children_of: dict = {}
    for f in all_folders:
        parent = str(f.parent_folder_id) if f.parent_folder_id else None
        children_of.setdefault(parent, []).append(str(f.id))

    result = []
    stack = list(children_of.get(root_id, []))
    while stack:
        fid = stack.pop()
        result.append(fid)
        stack.extend(children_of.get(fid, []))
    return result
```

**Extensión bloqueada al renombrar documentos** (mismo criterio en frontend y backend):
```python
def _extension_of(name: str) -> str:
    dot = name.rfind(".")
    return name[dot:] if dot > 0 else ""

# en actualizar_documento():
original_ext = _extension_of(doc.get("name") or "")
new_base = name[: len(name) - len(_extension_of(name))] if _extension_of(name) else name
updates["name"] = f"{new_base}{original_ext}"
```
El frontend ya no deja editar la extensión en el input (solo el nombre base), pero el backend **la vuelve a forzar igual sin confiar en el cliente** — se probó mandando `malicioso.exe` como nuevo nombre y el documento se quedó como `malicioso.pdf`.

### 2.4 Frontend

- `frontend/src/data/documentosApi.ts` — cliente tipado (`DocumentFolder` ahora incluye `parent_folder_id` y `subfolder_count`).
- `frontend/src/components/dashboard/FolderModal.tsx` — modal de crear/editar carpeta, con swatches de colores fijos + `ColorPickerPopover` para color personalizado.
- `frontend/src/components/dashboard/UploadDocumentModal.tsx` — modal de subida.
- `frontend/src/pages/dashboard/DashboardPage.tsx` — pantalla principal, ver detalle de subcarpetas abajo.

#### Navegación entre carpetas (breadcrumb con pila)

Antes solo existía un nivel ("carpeta abierta" ↔ "raíz"). Para soportar subcarpetas se agregó una pila de ancestros:

```typescript
const [openFolder, setOpenFolder] = useState<DocumentFolder | null>(null);
const [folderStack, setFolderStack] = useState<DocumentFolder[]>([]);

async function openFolderView(folder: DocumentFolder) {
  if (openFolder) setFolderStack(prev => [...prev, openFolder]);
  await loadFolder(folder);
}

async function goBackFolder() {
  if (folderStack.length > 0) {
    const stack = [...folderStack];
    const parent = stack.pop()!;
    setFolderStack(stack);
    await loadFolder(parent);
  } else {
    setOpenFolder(null);
    setFolderStack([]);
  }
}
```

El título de la página muestra la ruta completa cuando hay ancestros: `Padre / Hijo / ...`.

#### Filtrado raíz vs. subcarpetas

```typescript
const sortedFolders = useMemo(
  () => sortFolders(folders.filter(f => !f.parent_folder_id), sortLabel),
  [folders, sortLabel],
);
const sortedChildFolders = useMemo(
  () => (openFolder ? sortFolders(folders.filter(f => f.parent_folder_id === openFolder.id), sortLabel) : []),
  [folders, sortLabel, openFolder],
);
```

- La sección "Carpetas" del nivel raíz (`Documentos`) solo muestra carpetas sin padre.
- Al entrar a una carpeta, si tiene subcarpetas, aparecen primero (mismo diseño de tarjeta 3D) y debajo sus documentos.
- El botón **"Nuevo → Nueva carpeta"** crea la carpeta dentro de `openFolder` si estás parado dentro de una (pasa `openFolder?.id` como `parent_folder_id`); si estás en la raíz, crea una carpeta raíz.

#### Tarjeta de carpeta reutilizable

Se extrajo el JSX de la tarjeta (antes duplicado inline en el `.map`) a una función `renderFolderCard(f)` para poder usarla tanto en la lista raíz como dentro de una carpeta abierta:

```typescript
function renderFolderCard(f: DocumentFolder) {
  const c = f.color || '#10B981';
  const metaParts = [
    f.subfolder_count > 0 ? `${f.subfolder_count} carpeta${f.subfolder_count === 1 ? '' : 's'}` : null,
    `${f.file_count} archivo${f.file_count === 1 ? '' : 's'}`,
    formatFileSize(f.total_size_bytes),
  ].filter(Boolean);
  // ...JSX de la carpeta 3D con .bib2-folder-tab-shape / .bib2-folder-front-flap...
}
```

#### Borrado en cascada (frontend)

Al borrar una carpeta que tiene subcarpetas, el backend ya las borra todas — el frontend también tiene que limpiarlas de su propio estado local (si no, quedarían "fantasma" en pantalla hasta el próximo refresh):

```typescript
function collectDescendantIds(allFolders: DocumentFolder[], rootId: string): string[] { /* mismo algoritmo que el backend */ }

async function handleDeleteFolder(folder: DocumentFolder) {
  await deleteFolder(folder.id);
  const toRemove = new Set([folder.id, ...collectDescendantIds(folders, folder.id)]);
  setFolders(prev => prev.filter(f => !toRemove.has(f.id)));
  if (openFolder && toRemove.has(openFolder.id)) { setOpenFolder(null); setFolderStack([]); }
}
```

#### Renombrar sin tocar la extensión (frontend)

```typescript
function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function startRename(doc: DocumentSummary) {
  setRenamingId(doc.id);
  setRenameValue(splitExtension(doc.name).base);   // solo se edita la base
}
async function confirmRename(doc: DocumentSummary, fromFolder: boolean) {
  const { ext } = splitExtension(doc.name);
  const newName = `${renameValue.trim()}${ext}`;    // la extensión se pega de vuelta siempre
  await updateDocument(doc.id, { name: newName });
}
```
En el input de renombrar, la extensión se muestra como un sufijo fijo no editable (`.dfm-rename-ext`, `cursor: not-allowed`).

#### Spinner de "Descargando..."

La descarga trae el archivo completo (con los bytes en base64) recién al momento de descargar — el listado solo tiene metadata para que cargue rápido — así que en archivos grandes tarda un par de segundos. Sin feedback visual parecía que el botón no hacía nada:

```typescript
const [downloadingId, setDownloadingId] = useState<string | null>(null);

async function handleDownload(doc: DocumentSummary) {
  setDownloadingId(doc.id);
  try {
    const { document } = await getDocument(doc.id);
    const link = window.document.createElement('a');
    link.href = `data:${document.mime_type};base64,${document.data}`;
    link.download = document.name;
    link.click();
  } finally {
    setDownloadingId(null);
  }
}
```
El botón "Descargar" del menú se deshabilita y muestra `Loader2` + "Descargando..." mientras `downloadingId === doc.id`.

### 2.5 Colores de las carpetas (modo claro/oscuro)

Historial de este punto en la sesión (para que quede el razonamiento, no solo el resultado):

1. Primer intento: calcular el color del texto por luminancia perceptual del color de la carpeta (`getFolderTextColor`), para que fuera automáticamente blanco o casi-negro según qué tan clara fuera la carpeta. **Se descartó** — el usuario prefería texto siempre claro, nunca negro, sobre las carpetas.
2. Se probó subir la opacidad del fondo de la carpeta a valores casi sólidos. **Se revirtió** — el usuario pidió dejar el fondo como estaba originalmente (`BF`/`99`/`E6` de alpha).
3. Estado final: título y meta de la carpeta **siempre en blanco**, con distinta opacidad según el tema:

```css
/* frontend/src/styles/dashboard.css */
.bib2-folder-title-front {
  color: #FFFFFF;
  font-weight: 800;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}
.bib2-folder-meta-front {
  color: rgba(255, 255, 255, 0.96);
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.45);
}
[data-theme="light"] .bib2-folder-title-front,
[data-theme="light"] .bib2-folder-meta-front {
  color: rgba(255, 255, 255, 0.85);   /* blanco 85% en modo claro, pedido explícito */
}
```
En modo oscuro queda el blanco más intenso (96%/100%); en modo claro baja a 85% de opacidad. El color de fondo de la carpeta (`${c}BF`, `${c}99`, `${c}E6` sobre el `color` elegido por el usuario) **nunca se toca** — es decisión del usuario y no depende del tema.

### 2.6 Color picker propio

`frontend/src/utils/color.ts` (conversión HSV↔hex) + `frontend/src/components/shared/ColorPickerPopover.tsx` (cuadro de saturación/valor, slider de tono, input hex manual). Usa eventos `pointerdown/pointermove/pointerup` (no `mouse*`) para funcionar igual con mouse y touch. Reemplaza el `<input type="color">` nativo del navegador en:
- `FolderModal.tsx` (color de carpeta).
- `AvatarPickerStep.tsx` del registro (color de fondo del avatar DiceBear).

---

## 3. Rendimiento del backend

**Síntoma reportado**: carpetas y documentos del Dashboard tardaban mucho en aparecer.

**Causa real** (no percibida — se verificó con mediciones reales, no solo con el cliente de test de Flask que no simula concurrencia real): el servidor de desarrollo de Flask corría con `app.run(debug=True)` **sin `threaded=True`**. Eso significa que aunque el frontend pidiera varias cosas "en paralelo" con `Promise.all` (ej. carpetas + recientes), el servidor las procesaba **una por una, en fila**.

```python
# pruebas/back/flask-api/app.py
if __name__ == "__main__":
    app.run(debug=True, threaded=True)
```

Medido con un servidor real + `ThreadPoolExecutor` simulando el `Promise.all` del frontend: secuencial ~1400ms → en paralelo con `threaded=True` ~576–934ms (~2.4x). El resto de la latencia (~500-600ms) es el costo real de red hacia Supabase/MongoDB Atlas (ambos remotos) desde una máquina de desarrollo local — no se puede bajar más sin desplegar el backend cerca de las bases de datos.

Además se agregaron índices reales en Mongo (`documents`, y también `messages`/`mailbox_messages` para consistencia) — ver sección 2.1 para la lista exacta.

---

## 4. Buzón (`/buzon`) — wizard de consentimiento

**Regla de negocio**: si el usuario nunca autorizó crear su buzón real (`users.mailbox_created = false`), tiene que ver siempre el wizard de 3 pasos (dirección real → fines educativos → uso responsable + checkbox de términos) antes de poder ver nada del correo. Si ya lo autorizó, debe ir directo al buzón.

**Bug encontrado**: `MailboxPage.tsx` pedía el estado real con `getMailboxStatus()` al montar, pero mientras esa petición estaba en vuelo (`status === null`), la condición `if (status && !status.mailbox_created)` era `false` (porque `status` era `null`, no `true`) — así que por un instante se renderizaba la pantalla completa del buzón (columnas de carpetas, lista, panel de lectura) antes de que llegara la respuesta real y recién ahí cambiara al wizard si correspondía.

**Arreglo** — se agregó un tercer estado explícito ("todavía no sé") antes de decidir entre wizard o buzón real:

```typescript
// frontend/src/pages/mailbox/MailboxPage.tsx
if (!status) {
  return (
    <div className="dash-root">
      <Sidebar />
      <div className="mbx-authorize-wrap">
        {setupError ? <p className="mbx-authorize-error">{setupError}</p> : <Loader2 size={26} className="mbx-spin" />}
      </div>
    </div>
  );
}

if (!status.mailbox_created) {
  // ...wizard de 3 pasos (sin cambios)...
}

// ...buzón real (sin cambios)...
```
Ahora nunca se muestra nada del buzón hasta confirmar el estado real contra el backend; si la petición de estado falla, se muestra el error en vez de quedar cargando para siempre.

---

## 5. Sidebar — crash de pantalla blanca en `/buzon`

**Error real que reportó el usuario**:
```
Sidebar.tsx:134 Uncaught TypeError: Cannot read properties of undefined (reading 'groups')
```

**Causa**: `frontend/src/data/dashNav.ts` (`DASH_NAV`) ya tenía una entrada `mailbox` con ruta `/buzon`, pero el objeto `PANEL` dentro de `Sidebar.tsx` (que define qué se muestra en el panel expandible por cada sección) **nunca tuvo una entrada `mailbox`**. Al entrar a `/buzon`, `activeId` se volvía `'mailbox'` y `PANEL['mailbox']` era `undefined` → `undefined.groups` explotaba.

**Arreglo**:
```typescript
// frontend/src/components/shared/Sidebar.tsx
const PANEL: Record<string, PanelSection> = {
  // ...overview, casos, historial, biblioteca, chats...
  mailbox: {
    flat: [
      { label: 'Buzón', route: '/buzon' },
    ],
  },
};
```
Además se blindaron los tres puntos donde el código asumía que `PANEL[activeId]` siempre existe (`section.groups` → `section?.groups`, y `PANEL[activeId]` → `PANEL[activeId] ?? { flat: [] }`), para que si en el futuro se agrega un tab nuevo a `DASH_NAV` sin su entrada correspondiente en `PANEL`, la app no vuelva a quedar en pantalla blanca — en el peor caso el panel expandible sale vacío en vez de tirar toda la página.

> Nota histórica: en un punto de la sesión, `Sidebar.tsx` se revirtió por completo a su última versión commiteada (`git checkout HEAD -- Sidebar.tsx`) a pedido explícito del usuario, quien fue advertido de que eso reintroducía este mismo crash. El arreglo de esta sección es el que finalmente lo resolvió, ahora sí, de forma permanente.

---

## 6. Tarjetas de información del Dashboard (Almacenamiento / Trabajos / Calificaciones / Buzón)

**Pedido del usuario**: darle a cada usuario un límite de almacenamiento "de cara al usuario" (5 GB, aunque el límite real de la base compartida sea mucho menor) y mostrar en el Dashboard unas tarjetas de información: uso de almacenamiento, trabajos que el usuario no ha hecho, calificaciones que no ha revisado, y un mini buzón con los correos que le han llegado — todas escondibles/mostrables individualmente sin que las demás se muevan de lugar.

### 6.1 Límite de almacenamiento — 5 GB cosmético

```python
# pruebas/back/flask-api/app/routes/usuarios.py
# Limite "de cara al usuario" — cosmetico/profesional para la tarjeta del
# Dashboard. El limite real de la base compartida (MongoDB Atlas M0, 512MB
# para TODOS los usuarios) es mucho mas chico; esto no lo hace cumplir nada
# en el backend, solo se muestra como referencia.
STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024  # 5 GB
```
No hay ninguna validación real que bloquee subir más de 5 GB — es puramente informativo en la tarjeta. El límite real (Atlas M0 free tier) sigue siendo 512 MB compartidos entre todos los usuarios y colecciones.

### 6.2 Endpoint real de uso de almacenamiento

`GET /api/usuarios/uso-almacenamiento` (nuevo, en `usuarios.py`) suma el uso real del usuario en las 3 colecciones de Mongo que guardan bytes en base64:

```python
@usuarios_bp.get("/uso-almacenamiento")
@jwt_required()
def uso_almacenamiento():
    user = get_current_user()
    mongo = get_mongo_db()
    uid = str(user.id)

    documentos_bytes = next(mongo.documents.aggregate([
        {"$match": {"owner_user_id": uid}},
        {"$group": {"_id": None, "total": {"$sum": {"$ifNull": ["$size_bytes", 0]}}}},
    ]), {}).get("total", 0)

    chats_result = next(mongo.messages.aggregate([
        {"$match": {"sender_id": uid}},
        {"$group": {
            "_id": None,
            "file_bytes": {"$sum": {"$ifNull": ["$file_attachment.size_bytes", 0]}},
            # audio no guarda size_bytes propio — se estima desde el largo del base64.
            "audio_bytes": {"$sum": {
                "$cond": [
                    {"$ifNull": ["$audio.data", False]},
                    {"$multiply": [{"$strLenBytes": "$audio.data"}, 0.75]},
                    0,
                ]
            }},
        }},
    ]), {})
    chats_bytes = int(chats_result.get("file_bytes", 0) + chats_result.get("audio_bytes", 0))

    buzon_bytes = next(mongo.mailbox_messages.aggregate([
        {"$match": {"owner_username": user.username.lower()}},
        {"$project": {"attach_bytes": {"$sum": {
            "$map": {"input": {"$ifNull": ["$attachments", []]}, "as": "a", "in": {"$ifNull": ["$$a.size_bytes", 0]}}
        }}}},
        {"$group": {"_id": None, "total": {"$sum": "$attach_bytes"}}},
    ]), {}).get("total", 0)

    return jsonify({
        "used_bytes": int(documentos_bytes + chats_bytes + buzon_bytes),
        "limit_bytes": STORAGE_LIMIT_BYTES,
        "breakdown": {"documentos": int(documentos_bytes), "chats": chats_bytes, "buzon": int(buzon_bytes)},
    }), 200
```
- **Documentos**: `size_bytes` ya está guardado en cada documento (colección `documents`).
- **Chats**: `file_attachment.size_bytes` ya está guardado; el **audio no guarda tamaño propio**, así que se estima con `$strLenBytes` (largo en bytes del string base64) `× 0.75` (relación real entre base64 y bytes decodificados).
- **Buzón**: cada mensaje puede tener varios adjuntos (`attachments: []`); se suman con `$map`+`$sum` sobre el arreglo.

Probado en vivo contra Atlas: la agregación de `documents` devolvió el total real de un usuario existente (2.226.015 bytes), y la de `mailbox_messages` se verificó con un documento de prueba insertado y borrado en el momento (`owner_username: '__test_uso_almacenamiento__'`, 2 adjuntos de 1000 y 2000 bytes → resultado `3000`, correcto), limpiado después con un `delete_many` acotado exactamente a ese username de prueba.

`frontend/src/data/usuariosApi.ts` (nuevo) expone `getStorageUsage()` tipado contra ese endpoint.

### 6.3 Trabajos pendientes y Calificaciones sin revisar — MOCK temporal, a propósito

A diferencia de todo lo demás en este documento, **estas dos tarjetas NO están conectadas a datos reales**. Al investigar de dónde saldrían "trabajos" y "calificaciones", se confirmó que:
- `CasosPage.tsx` y `HistorialPage.tsx` (Casos clínicos / Historial) son arreglos **hardcodeados en el frontend** (`GASTRO_CASES`, `SESSIONS`), sin ninguna tabla en Postgres detrás.
- No existe ningún modelo de "asignación" ni "calificación" en `app/models/` del backend — la propuesta de esquema de `consultations`/`ai_evaluations` en `docs/contexto-base-datos-postgresql-mongodb.md` nunca se implementó.

Se le presentó esto al usuario explícitamente (tres opciones: reusar el mock existente, construir el backend real ahora, o posponer esas dos tarjetas) y **eligió mostrar las 4 tarjetas ya, dejando trabajos/calificaciones como mockup por ahora, con la intención explícita de migrarlas a datos reales más adelante**.

Para no acoplar el Dashboard a los arreglos internos de esas dos páginas (y no arriesgar romper algo si alguien las edita), se creó un archivo aparte, claramente marcado como temporal:

```typescript
// frontend/src/data/mockAcademicData.ts
/**
 * MOCK TEMPORAL — Trabajos pendientes y Calificaciones sin revisar.
 * ... (ver comentario completo en el archivo) ...
 */
export const MOCK_PENDING_CASES: MockPendingCase[] = [ /* espejo de los casos no completados en CasosPage.tsx */ ];
export const MOCK_UNREVIEWED_GRADES: MockUnreviewedGrade[] = [ /* espejo de un subconjunto de SESSIONS en HistorialPage.tsx */ ];
```

**Cuando se implemente el backend real**, lo que hay que hacer es: crear tablas Postgres (`assignments`/`asignaciones`, `grades`/`calificaciones`, con FK a `students`/`courses` y una columna tipo `reviewed_at`/`revisado` nullable), endpoints en un blueprint nuevo (o dentro de `cursos.py`), y reemplazar el import de `mockAcademicData.ts` en `InfoCards.tsx` por llamadas reales — el resto del componente (layout, show/hide, loading state) no necesita cambiar.

### 6.4 Mini buzón — 100% real

La cuarta tarjeta sí es completamente real: usa `getMailboxStatus()` (ya existente) para saber si el usuario ya creó su buzón y cuántos correos sin leer tiene, y `listMailboxMessages('inbox', 3)` para traer los 3 correos más recientes (remitente, asunto, si tiene adjuntos, si está leído). Se le agregó un parámetro `limit` opcional a `listMailboxMessages()` en `mailboxApi.ts` — el backend (`GET /api/mailbox/messages`) ya soportaba `?limit=` desde antes, solo no estaba expuesto en el cliente:

```typescript
// frontend/src/data/mailboxApi.ts
export function listMailboxMessages(folder: MailboxFolder, limit?: number): Promise<{ messages: MailboxMessageSummary[] }> {
  const qs = limit ? `&limit=${limit}` : '';
  return apiFetch(`/api/mailbox/messages?folder=${folder}${qs}`);
}
```
Si el usuario todavía no autorizó crear su buzón, la tarjeta muestra un enlace directo a `/buzon` en vez de intentar traer mensajes.

### 6.5 Componente y layout (`InfoCards.tsx`)

Nuevo componente `frontend/src/components/dashboard/InfoCards.tsx`, montado en `DashboardPage.tsx` justo arriba de la sección "Carpetas" (solo en la vista raíz, no dentro de una carpeta abierta). Las 4 tarjetas (`almacenamiento`, `trabajos`, `calificaciones`, `buzon`) se recorren siempre en el mismo orden fijo (`CARD_ORDER`), cada una con su propio ícono/color y su propio cuerpo (`renderBody(id)`).

**Esconder sin reflow**: el primer intento escondía la tarjeta quitándola del arreglo antes de renderizar, lo que hacía que las demás se movieran a ocupar su lugar y las escondidas aparecieran como chips sueltos en una fila aparte — el usuario pidió explícitamente que la tarjeta se quede en su mismo puesto. La solución fue renderizar **siempre las 4**, pero condicionar el contenido interno:

```tsx
{CARD_ORDER.map(id => {
  const isHidden = hidden.has(id);
  return (
    <div key={id} className={`bib2-infocard${isHidden ? ' is-hidden' : ''}`}>
      <button onClick={() => toggleCard(id)}>{isHidden ? <Eye/> : <EyeOff/>}</button>
      {isHidden
        ? <span className="bib2-infocard-hidden-label">{CARD_LABELS[id]}</span>
        : <>{/* ícono + título + cuerpo normal */}</>}
    </div>
  );
})}
```
Con CSS, `.bib2-infocard.is-hidden` cambia de `flex: 1 1 260px` a `flex: 0 0 auto` y se achica a una franja angosta con solo el nombre — sigue ocupando su posición exacta en la fila (`display:flex` normal, no `flex-wrap` reordenando nada), no salta a una fila aparte. La preferencia (qué tarjetas están escondidas) se guarda en `localStorage` bajo `clerkship_dash_cards_hidden`, igual que otros estados de UI ya persistidos en la app (ej. `clerkship_sb_open` del Sidebar).

---

## 7. Compartir documentos (Chat/Buzón) y selector de archivos estilo Drive en Chats

**Pedido del usuario**: en el Dashboard, poder compartir un documento con un contacto (buscándolo o desde una lista), eligiendo si se manda por Chat o por Buzón — Buzón solo si el usuario ya autorizó el suyo propio. Y en Chats, que el botón de adjuntar archivo permita elegir un documento ya subido a la plataforma (navegando carpetas, estilo Google Drive) además de la opción de siempre de subir desde el escritorio.

**Importante**: no se tocó el backend para nada de esto — todo se armó reutilizando endpoints que ya existían (`/api/usuarios/buscar`, `/api/chats`, `/api/mailbox/messages`, `/api/documentos/*`).

### 7.1 Compartir documento — `ShareDocumentModal.tsx`

Nuevo componente `frontend/src/components/dashboard/ShareDocumentModal.tsx`, agregado como opción "Compartir" en el menú de cada documento (tanto en la vista de tarjetas como en la vista de tabla — `renderDocCard`/`renderDocTableRow` en `DashboardPage.tsx`).

**Flujo**:
1. Al abrir, pide `getMailboxStatus()` para saber si el usuario ya tiene su propio Buzón autorizado.
2. El usuario elige el método — **Chat** o **Buzón** — y busca un contacto por `@usuario` (reutiliza `searchUsers()`, el mismo buscador que ya usa "Nuevo chat" en Chats).
3. Al compartir: trae el documento completo con `getDocument(id)` (recién en este momento, no antes — igual que la descarga, solo el listado tiene metadata) y arma un `file_attachment` con `{name, mime_type, size_bytes, data}`.
   - **Chat**: `createDirectConversation(contactId)` + `sendMessage(conversationId, { content: '📎 Te compartí un documento: ...', file_attachment })` — el documento llega como un adjunto normal de chat, el receptor lo ve igual que cualquier archivo mandado por chat.
   - **Buzón**: `sendMailboxMessage({ to: ['{username}@clerk-ship.online'], subject, text, attachments: [file_attachment] })` — correo real con el documento adjunto.

**Los dos gates de Buzón**:
- **El botón "Buzón" se deshabilita** si `getMailboxStatus().mailbox_created` del usuario actual es `false`, con un tooltip/nota explicando que primero tiene que autorizar su propio Buzón — tal como se pidió ("buzon permite si ya hizo lo del buzon, de lo contrario no deja aun").
- **La búsqueda de contactos, cuando el método es "Buzón", solo muestra gente que YA tiene su propio Buzón creado** (`u.mailbox_created`). Esto no lo pidió explícitamente el usuario, pero es necesario: el backend solo sincroniza correo entrante hacia buzones de usuarios que ya lo autorizaron (`_usernames_with_mailbox()` en `mailbox.py`) — mandarle un correo a alguien que todavía no autorizó el suyo lo dejaría perdido en Mailgun, sin que nadie lo vea nunca. Filtrar evita compartir "hacia la nada".

```typescript
// frontend/src/components/dashboard/ShareDocumentModal.tsx (extracto)
async function handleShare() {
  const { document: full } = await getDocument(document.id);
  const attachment = { name: full.name, mime_type: full.mime_type, size_bytes: full.size_bytes, data: full.data };

  if (method === 'chat') {
    const { conversation } = await createDirectConversation(selected.id);
    await sendMessage(conversation.id, { content: `📎 Te compartí un documento: ${full.name}`, file_attachment: attachment });
  } else {
    await sendMailboxMessage({
      to: [`${selected.username}@clerk-ship.online`],
      subject: `Documento compartido: ${full.name}`,
      text: `${currentUser?.name || 'Un compañero'} te compartió el documento "${full.name}" desde Clerkship.`,
      attachments: [attachment],
    });
  }
}
```

Se agregó `mailbox_created?: boolean` a `ParticipantInfo` en `chatsApi.ts` — el backend ya lo mandaba siempre (`User.to_dict()` lo incluye), solo faltaba declararlo en el tipo del frontend.

### 7.2 Selector de archivos estilo Drive — `PlatformFilePicker.tsx`

Nuevo componente reutilizable `frontend/src/components/shared/PlatformFilePicker.tsx`: navega las carpetas y documentos reales del usuario (mismos endpoints que `DashboardPage.tsx`: `listFolders()` + `listDocuments()`) con breadcrumb, para elegir un documento ya existente en vez de volver a subirlo desde cero.

Carga **una sola vez** al abrir (`listFolders()` + `listDocuments(undefined, 300)`, hasta 300 documentos) y de ahí en adelante navega **en memoria** filtrando por `parent_folder_id`/`folder_id` — entrar y salir de carpetas es instantáneo, sin pedir nada al backend en cada clic (mismo patrón que ya usaba `DashboardPage.tsx` internamente con su propio estado `folders`/`allDocs`).

```typescript
const visibleFolders = useMemo(
  () => folders.filter(f => (f.parent_folder_id || null) === currentFolderId),
  [folders, currentFolderId],
);
const visibleDocs = useMemo(
  () => docs.filter(d => (d.folder_id || null) === currentFolderId),
  [docs, currentFolderId],
);
```

Al elegir un documento, el picker no manda los bytes — eso lo hace el componente que lo usa, recién cuando el usuario ya eligió (mismo patrón "traer el `data` al final" que en Compartir y en Descargar).

**Integración en Chats** (`ChatsPage.tsx`): el menú de adjuntar (`chats-dz-buttons-row`) ahora tiene un botón nuevo, **"Buscar en mis Documentos"** (ícono de carpeta), separado del botón de siempre **"Subir archivo... desde el escritorio"** (que ahora dice explícitamente "desde el escritorio" para diferenciarlo). Al elegir un documento de la plataforma:

```typescript
// frontend/src/pages/chats/ChatsPage.tsx
async function handlePlatformDocSelected(doc: DocumentSummary) {
  setLoadingPlatformDoc(true);
  try {
    const { document: full } = await getDocument(doc.id);
    setAttachedFile({ name: full.name, mime_type: full.mime_type, size_bytes: full.size_bytes, data: full.data });
    setShowPlatformPicker(false);
  } finally {
    setLoadingPlatformDoc(false);
  }
}
```
Esto reutiliza el mismo estado `attachedFile` que ya usaba el flujo de "subir desde el escritorio" — el resto del envío del mensaje (botón enviar, preview del adjunto antes de mandar, etc.) no tuvo que cambiar nada.

---

## 8. Qué falta / pendiente

- **Índices de Mongo sin script versionado**: `owner_user_id_1_folder_id_1` y `owner_user_id_1_created_at_-1` en `documents` (y los de `messages`/`mailbox_messages`) se crearon a mano contra Atlas durante la sesión, no existen en ningún archivo del repo. Falta un script tipo `pruebas/db/mongodb/ensure_indexes.py` que los cree de forma idempotente, para poder recrear el entorno desde cero.
- **Sin bucket de almacenamiento real**: documentos, adjuntos de chats y adjuntos del buzón viven como base64 dentro de Mongo. Funciona para el prototipo, pero no escala a archivos grandes ni es lo ideal en costo/rendimiento a largo plazo — pendiente evaluar S3/GCS/Supabase Storage si el proyecto avanza a producción.
- **Sin `docker-compose.yml` ni seeds**: sigue sin existir una forma de levantar Postgres+Mongo local reproducible para desarrollo, hay que apuntar siempre a Supabase/Atlas reales.
- **Subcarpetas — límite de profundidad**: no hay límite explícito de cuántos niveles de subcarpeta se pueden anidar. Funciona igual a cualquier profundidad, pero no se probó con jerarquías muy profundas ni se diseñó una UI para breadcrumbs muy largos (hoy se listan todos seguidos con `/`, sin truncar).
- **`UploadDocumentModal`**: el selector de carpeta destino al subir un documento sigue mostrando todas las carpetas del usuario en una sola lista plana (sin indentar por jerarquía) — con subcarpetas activas, valdría la pena mostrar la jerarquía visualmente ahí también.
- **Roles ENUM de `users`** (`STUDENT`/`TEACHER`) — pendiente desde antes de esta sesión, sigue sin resolverse si los perfiles de "director de proyecto" necesitan un rol real en el dashboard clínico (hoy son solo cuentas Firebase internas del módulo de desarrollo). Ver `contexto-base-datos-postgresql-mongodb.md`.
- **Esquema de Mongo para `consultations`** (chat con IA, viñeta clínica, evaluación detallada) sigue sin implementarse — es un módulo aparte (simulación clínica con IA), no tocado en esta sesión. Ver mismo documento de contexto de base de datos.
- **Tarjetas "Trabajos pendientes" y "Calificaciones sin revisar" siguen en mockup** (ver sección 6.3) — decisión explícita del usuario para no bloquear las otras dos tarjetas (que sí son reales) mientras se define el backend de asignaciones/calificaciones. Falta: tablas Postgres (`assignments`, `grades`), endpoints, y reemplazar `data/mockAcademicData.ts` por llamadas reales tanto en `InfoCards.tsx` como, idealmente, en `CasosPage.tsx`/`HistorialPage.tsx` (que hoy también son 100% mock, independiente de estas tarjetas).
- **Compartir documentos duplica el almacenamiento**: tanto "Compartir por Chat" como "Compartir por Buzón" (sección 7.1) vuelven a guardar el archivo completo (nueva copia en `messages`/`mailbox_messages` de Mongo) en vez de solo referenciar el documento original — mismo patrón de "todo como base64 embebido" que ya usa el resto de la plataforma, pero significa que compartir un archivo pesado también le come almacenamiento extra al receptor. Si el proyecto avanza a un bucket real de almacenamiento (ver punto de arriba), ahí valdría la pena migrar esto a "compartir por referencia" en vez de copiar bytes.
- **Compartir por Buzón no avisa si el destinatario no tiene Buzón** de forma proactiva en el buscador de contactos — hoy simplemente no aparece en los resultados al filtrar por `mailbox_created`, pero no hay ningún mensaje tipo "esta persona todavía no tiene Buzón" si el usuario esperaba encontrarla ahí.

---

## 9. Archivado de Chats y Buzón (ya no se usan en el proyecto)

**Pedido del usuario**: "Deja en una carpeta todo el backend y frontend que sea de buzón de correo y chats envío! ya que esto ya no se va a usar en el proyecto." Se confirmó el alcance con el usuario antes de tocar nada (dada la magnitud del cambio): **todo el módulo Chats** (no solo la función de compartir/enviar archivos que se había agregado en la sección 7) y **todo el Buzón**, con las rutas y accesos de navegación removidos del todo (no solo el código movido de carpeta).

### 9.1 Qué se movió y a dónde

Todo el detalle archivo-por-archivo, con la razón de cada uno, está en **`archivado_buzon_chats/README.md`** (frontend) — no se duplica acá para no tener dos fuentes de verdad que se puedan desactualizar. Resumen rápido:

- **Frontend** → `archivado_buzon_chats/` (carpeta nueva en la raíz del repo, sí versionada en git — son archivos de frontend, no del backend de pruebas): páginas de Chats y Buzón, sus componentes, clientes de API (`chatsApi.ts`, `mailboxApi.ts`), utilidades exclusivas (audio, link preview, indicadores de no-leído), y dos componentes que quedaron sin sentido al no tener destino (`ShareDocumentModal.tsx`, que compartía por Chat o Buzón) o sin consumidor (`PlatformFilePicker.tsx`, que solo lo usaba el adjuntador de Chats; `InfoCards.tsx`, que ya estaba huérfano desde antes — ver nota abajo).
- **Backend** → `pruebas/archivado_buzon_chats/` (**dentro** de `pruebas/`, no en la carpeta de arriba) — para que se mantenga gitignored igual que el resto del backend, que es de pruebas: `chats.py`, `mailbox.py` (rutas), `app/mailbox.py` (integración con Mailgun), y los modelos `Conversation`/`ConversationParticipant`/`AiAgent`.

### 9.2 Hallazgo durante el archivado: el Dashboard ya no usaba `InfoCards.tsx`

Al revisar qué dependía de `mailboxApi.ts` antes de moverlo, se encontró que **`DashboardPage.tsx` ya no renderizaba el componente `InfoCards.tsx`** documentado en la sección 6 — en algún punto se había reemplazado por un sistema de widgets construido directamente adentro de `DashboardPage.tsx` (`gdrive-widget-chip`, `gdrive-bar-right`, con un popover centrado por widget), que reusa los mismos datos (`getStorageUsage()`, `mockAcademicData.ts`) pero con otra UI. `InfoCards.tsx` había quedado huérfano (sin ningún import activo) — se archivó junto con el resto porque además importaba `mailboxApi.ts` directamente y hubiera roto la compilación si se dejaba suelto.

**Lo que se conserva intacto** de ese sistema de widgets: los chips de "Trabajos pendientes" y "Calificaciones" (mock, sección 6.3) — no dependen de Chats ni Buzón. Solo se quitó el tercer chip ("Buzón", con su punto de no-leídos) y el estado/fetch que lo alimentaba.

### 9.3 Ajustes de navegación y rutas

Por decisión explícita del usuario (no dejar accesos rotos ni pestañas fantasma), además de mover el código se limpiaron todas las referencias:

- `App.tsx`: rutas `/chats`, `/buzon`, `/buzon/terminos` eliminadas, junto con sus imports y sus entradas en `SIDEBAR_ROUTE_PREFIXES`.
- `data/dashNav.ts`: entradas `chats`/`mailbox` eliminadas de `DASH_NAV` — dejan de aparecer como íconos en el riel del Sidebar.
- `components/shared/Sidebar.tsx`: entradas `chats`/`mailbox` eliminadas de `PANEL`, y la condición que ocultaba el panel expandible solo en `/chats` ya no hace falta (se simplificó).
- `usuarios.py` / `usuariosApi.ts`: el endpoint de uso de almacenamiento (sección 6.2) ya no suma bytes de `messages` ni `mailbox_messages` — solo `documents`.
- `app/__init__.py` / `app/models/__init__.py` (backend): blueprints e imports de modelos correspondientes, removidos.

### 9.4 Qué se dejó tal cual, a propósito

- **Nada se borró de las bases de datos**: las tablas de Postgres (`conversations`, `conversation_participants`, `ai_agents`, la columna `users.mailbox_created`) y las colecciones de Mongo (`messages`, `mailbox_messages`) siguen existiendo con sus datos — solo se archivó el código que las usaba. Esto es intencional: archivar código es reversible con un simple "mover de vuelta"; borrar datos/esquema no lo es.
- **El CSS de Chats dentro de `dashboard.css` no se tocó** — está mezclado en un archivo compartido enorme con Documentos/Dashboard (7000+ líneas), y separarlo a mano tenía un riesgo real de romper estilos que sí siguen en uso. Queda como CSS muerto (no se aplica a ningún elemento del DOM ya que `ChatsPage`/`MailboxPage` no se renderizan más). Pendiente de limpieza si alguna vez se justifica el esfuerzo.

**Verificación**: `tsc --noEmit` y `vite build` del frontend limpios; `py_compile` de todo `app/` del backend limpio; y un arranque real de `create_app()` confirmando que `/api/chats` y `/api/mailbox` ya no aparecen en las rutas registradas de Flask.
