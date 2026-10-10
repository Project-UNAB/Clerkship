import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Plus, ArrowUpDown, FileText, FileSpreadsheet,
  Presentation, Image as ImageIcon, FileCode, File,
  MoreVertical, Pencil, Trash2, ArrowLeft, FolderPlus, UploadCloud, Loader2, Download, Eye,
  LayoutGrid, List, Search, X, Folder, HardDrive, Check, BookUp,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import WelcomeOverlay from '../../components/shared/WelcomeOverlay';
import FolderModal from '../../components/dashboard/FolderModal';
import UploadDocumentModal from '../../components/dashboard/UploadDocumentModal';
import DocumentPreviewView from '../../components/dashboard/DocumentPreviewView';
import PublicarEnBibliotecaModal from '../../components/dashboard/PublicarEnBibliotecaModal';
import { formatFileSize, readFileAsBase64 } from '../../utils/fileUpload';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import {
  listFolders, createFolder, updateFolder, deleteFolder,
  listDocuments, getDocument, uploadDocument, updateDocument, deleteDocument,
  type DocumentFolder, type DocumentSummary,
} from '../../data/documentosApi';
import { getStorageUsage, type StorageUsage } from '../../data/usuariosApi';
import { publicarEnBiblioteca } from '../../data/almacenamientoApi';

const SORT_OPTIONS = ['Más reciente', 'Más antiguo', 'Nombre A–Z', 'Tamaño (Mayor)'] as const;
type SortOption = typeof SORT_OPTIONS[number];

type FilterType = 'ALL' | 'PDF' | 'DOC' | 'XLS' | 'PPT' | 'IMG' | 'TXT';

const FILTER_CHIPS: { id: FilterType; label: string; color?: string }[] = [
  { id: 'ALL', label: 'Todos' },
  { id: 'PDF', label: 'PDFs', color: '#EF4444' },
  { id: 'DOC', label: 'Word', color: '#2563EB' },
  { id: 'XLS', label: 'Hojas de cálculo', color: '#10B981' },
  { id: 'PPT', label: 'Presentaciones', color: '#F97316' },
  { id: 'IMG', label: 'Imágenes', color: '#9333EA' },
  { id: 'TXT', label: 'Texto y Código', color: '#0284C7' },
];

function splitExtension(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { base: name, ext: '' };
  return { base: name.slice(0, dot), ext: name.slice(dot) };
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function sortFolders(folders: DocumentFolder[], sort: SortOption): DocumentFolder[] {
  const copy = [...folders];
  if (sort === 'Nombre A–Z') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'Más antiguo') return copy.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  if (sort === 'Tamaño (Mayor)') return copy.sort((a, b) => (b.total_size_bytes || 0) - (a.total_size_bytes || 0));
  return copy.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function sortDocs(docs: DocumentSummary[], sort: SortOption): DocumentSummary[] {
  const copy = [...docs];
  if (sort === 'Nombre A–Z') return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === 'Más antiguo') return copy.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  if (sort === 'Tamaño (Mayor)') return copy.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
  return copy.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

function getDocTypeInfo(name: string, mime: string) {
  const n = (name || '').trim().toLowerCase();
  const m = (mime || '').trim().toLowerCase();
  
  // Extraer extensión de forma ultra robusta
  const lastDot = n.lastIndexOf('.');
  const ext = lastDot >= 0 ? n.slice(lastDot + 1).toLowerCase() : '';

  // 1. PDF
  if (
    ext === 'pdf' ||
    m.includes('pdf') ||
    m.includes('postscript')
  ) {
    return { typeClass: 'bmd-pdf', typeLabel: 'PDF' as FilterType };
  }

  // 2. WORD / DOCUMENTOS DE TEXTO
  if (
    ['doc', 'docx', 'docm', 'dot', 'dotx', 'dotm', 'rtf', 'odt', 'pages', 'wpd'].includes(ext) ||
    m.includes('word') ||
    m.includes('wordprocessing') ||
    m.includes('officedocument.word') ||
    m.includes('msword') ||
    m.includes('opendocument.text')
  ) {
    return { typeClass: 'bmd-doc', typeLabel: 'DOC' as FilterType };
  }

  // 3. EXCEL / HOJAS DE CÁLCULO
  if (
    ['xls', 'xlsx', 'xlsm', 'xlsb', 'xlt', 'xltx', 'xltm', 'csv', 'tsv', 'ods', 'numbers'].includes(ext) ||
    m.includes('excel') ||
    m.includes('spreadsheet') ||
    m.includes('officedocument.spreadsheet') ||
    m.includes('csv') ||
    m.includes('tab-separated') ||
    m.includes('opendocument.spreadsheet')
  ) {
    return { typeClass: 'bmd-xls', typeLabel: 'XLS' as FilterType };
  }

  // 4. POWERPOINT / PRESENTACIONES
  if (
    ['ppt', 'pptx', 'pptm', 'pps', 'ppsx', 'pot', 'potx', 'odp', 'key', 'keynote'].includes(ext) ||
    m.includes('presentation') ||
    m.includes('powerpoint') ||
    m.includes('officedocument.presentation') ||
    m.includes('slides') ||
    m.includes('opendocument.presentation')
  ) {
    return { typeClass: 'bmd-ppt', typeLabel: 'PPT' as FilterType };
  }

  // 5. IMÁGENES
  if (
    ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'heif', 'avif'].includes(ext) ||
    m.startsWith('image/')
  ) {
    return { typeClass: 'bmd-img', typeLabel: 'IMG' as FilterType };
  }

  // 6. TEXTO PLANO / CÓDIGO
  if (
    ['txt', 'json', 'md', 'markdown', 'js', 'jsx', 'ts', 'tsx', 'py', 'html', 'htm', 'css', 'scss', 'xml', 'log', 'sql', 'sh', 'c', 'cpp', 'h', 'java', 'cs', 'yaml', 'yml'].includes(ext) ||
    m.startsWith('text/') ||
    m.includes('json') ||
    m.includes('javascript') ||
    m.includes('xml')
  ) {
    return { typeClass: 'bmd-txt', typeLabel: 'TXT' as FilterType };
  }

  return { typeClass: 'bmd-file', typeLabel: 'ALL' as FilterType };
}

function getPeekDocsForFolder(docsInFolder: DocumentSummary[], fileCount: number, folderId: string) {
  if (fileCount === 0) return [];

  const maxDocs = 6;
  let items = docsInFolder.slice(0, maxDocs);

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

  let hash = 0;
  for (let i = 0; i < folderId.length; i++) {
    hash = (hash << 5) - hash + folderId.charCodeAt(i);
    hash |= 0;
  }
  const seed = Math.abs(hash);
  const count = items.length;

  const baseSpans: Record<number, number[]> = {
    1: [0],
    2: [-34, 34],
    3: [-50, 0, 50],
    4: [-58, -20, 20, 58],
    5: [-64, -32, 0, 32, 64],
    6: [-70, -42, -14, 14, 42, 70],
  };

  const xList = baseSpans[count] || baseSpans[6];

  return items.map((doc, idx) => {
    const typeInfo = getDocTypeInfo(doc.name, doc.mime_type);

    const r1 = Math.sin(seed + idx * 17.13) * 10000;
    const rndRot = (r1 - Math.floor(r1)) * 26 - 13;

    const r2 = Math.sin(seed + idx * 31.41) * 10000;
    const rndXJitter = ((r2 - Math.floor(r2)) - 0.5) * 10;

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

/* ════════════════════════════════════════════════════════════
   Página Dashboard (Estilo Google Drive / Cloud 100% Responsivo)
   ════════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const [showWelcome, setShowWelcome] = useState(() => {
    return sessionStorage.getItem('clerkship_show_welcome') === 'true';
  });

  const [sortOpen, setSortOpen] = useState(false);
  const [sortLabel, setSortLabel] = useState<SortOption>('Más reciente');
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('clerkship_dash_view_mode') as 'grid' | 'list') || 'grid';
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('ALL');

  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [recent, setRecent] = useState<DocumentSummary[]>([]);
  const [allDocs, setAllDocs] = useState<DocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [folderModal, setFolderModal] = useState<'create' | DocumentFolder | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<DocumentFolder | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DocumentSummary | null>(null);
  const [publicandoDoc, setPublicandoDoc] = useState<DocumentSummary | null>(null);

  const [openFolder, setOpenFolder] = useState<DocumentFolder | null>(null);
  const [folderStack, setFolderStack] = useState<DocumentFolder[]>([]);
  const [folderDocs, setFolderDocs] = useState<DocumentSummary[]>([]);
  const [folderDocsLoading, setFolderDocsLoading] = useState(false);

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isDropUploading, setIsDropUploading] = useState(false);

  /* ── Datos de Almacenamiento, Trabajos y Calificaciones ── */
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  function handleWelcomeComplete() {
    sessionStorage.removeItem('clerkship_show_welcome');
    setShowWelcome(false);
  }

  function handleSetViewMode(mode: 'grid' | 'list') {
    setViewMode(mode);
    localStorage.setItem('clerkship_dash_view_mode', mode);
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [{ folders: f }, { documents: d }, { documents: fullDocs }, storageRes] = await Promise.all([
        listFolders(),
        listDocuments(undefined, 18),
        listDocuments(undefined, 300),
        getStorageUsage().catch(() => null),
      ]);
      setFolders(f);
      setRecent(d);
      setAllDocs(fullDocs || []);
      if (storageRes) setStorageUsage(storageRes);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refreshAll(); }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    }
    if (menuFor) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuFor]);

  async function loadFolder(folder: DocumentFolder) {
    setOpenFolder(folder);
    setFolderDocsLoading(true);
    try {
      const { documents } = await listDocuments(folder.id);
      setFolderDocs(documents);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setFolderDocsLoading(false);
    }
  }

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

  async function jumpToBreadcrumb(targetFolder: DocumentFolder | null, index?: number) {
    if (!targetFolder) {
      setOpenFolder(null);
      setFolderStack([]);
      return;
    }
    if (index !== undefined) {
      const newStack = folderStack.slice(0, index);
      setFolderStack(newStack);
      await loadFolder(targetFolder);
    }
  }

  function collectDescendantIds(allFolders: DocumentFolder[], rootId: string): string[] {
    const childrenOf: Record<string, string[]> = {};
    allFolders.forEach(f => {
      if (f.parent_folder_id) {
        (childrenOf[f.parent_folder_id] ||= []).push(f.id);
      }
    });
    const result: string[] = [];
    const stack = [...(childrenOf[rootId] || [])];
    while (stack.length) {
      const id = stack.pop()!;
      result.push(id);
      stack.push(...(childrenOf[id] || []));
    }
    return result;
  }

  async function handleSaveFolder(name: string, color: string) {
    if (folderModal === 'create') {
      const { folder } = await createFolder(name, color, openFolder?.id ?? null);
      setFolders(prev => [...prev, folder]);
    } else if (folderModal) {
      const { folder } = await updateFolder(folderModal.id, { name, color });
      setFolders(prev => prev.map(f => (f.id === folder.id ? folder : f)));
      if (openFolder?.id === folder.id) setOpenFolder(folder);
    }
    setFolderModal(null);
  }

  async function handleDeleteFolder(folder: DocumentFolder) {
    setBusyId(folder.id);
    try {
      await deleteFolder(folder.id);
      const toRemove = new Set([folder.id, ...collectDescendantIds(folders, folder.id)]);
      setFolders(prev => prev.filter(f => !toRemove.has(f.id)));
      if (openFolder && toRemove.has(openFolder.id)) {
        setOpenFolder(null);
        setFolderStack([]);
      }
      setConfirmDeleteFolder(null);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleUpload(
    file: { name: string; mime_type: string; data: string; size_bytes: number },
    folderId: string | null,
  ) {
    const { document } = await uploadDocument({ ...file, folder_id: folderId });
    setUploadModalOpen(false);
    if (folderId) {
      setFolders(prev => prev.map(f => (f.id === folderId ? { ...f, file_count: f.file_count + 1, total_size_bytes: f.total_size_bytes + file.size_bytes } : f)));
      if (openFolder?.id === folderId) setFolderDocs(prev => [document, ...prev]);
      setAllDocs(prev => [document, ...prev]);
    } else {
      setRecent(prev => [document, ...prev]);
      setAllDocs(prev => [document, ...prev]);
    }
    if (!folderId) setRecent(prev => prev.slice(0, 18));
    // Actualizar uso de almacenamiento local
    if (storageUsage) {
      setStorageUsage({
        ...storageUsage,
        used_bytes: storageUsage.used_bytes + file.size_bytes,
      });
    }
  }

  /* ── Drag and Drop Cloud Upload Handler ── */
  function handleDragEnter(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDraggingOver(true);
    }
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingOver(false);
    }
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
  }

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    dragCounterRef.current = 0;

    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    setIsDropUploading(true);
    setError(null);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 11 * 1024 * 1024) {
          setError(`El archivo "${file.name}" supera el límite de 11 MB.`);
          continue;
        }
        const data = await readFileAsBase64(file);
        await handleUpload({
          name: file.name,
          mime_type: file.type || 'application/octet-stream',
          data,
          size_bytes: file.size,
        }, openFolder?.id ?? null);
      }
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setIsDropUploading(false);
    }
  }

  async function handleDownload(doc: DocumentSummary) {
    setDownloadingId(doc.id);
    try {
      const { document } = await getDocument(doc.id);
      const link = window.document.createElement('a');
      link.href = `data:${document.mime_type};base64,${document.data}`;
      link.download = document.name;
      link.click();
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  }

  async function handlePublicarEnBiblioteca(titulo: string) {
    if (!publicandoDoc) return;
    await publicarEnBiblioteca(publicandoDoc.id, { titulo });
    setPublicandoDoc(null);
  }

  async function handleDeleteDocument(doc: DocumentSummary, fromFolder: boolean) {
    setBusyId(doc.id);
    try {
      await deleteDocument(doc.id);
      setAllDocs(prev => prev.filter(d => d.id !== doc.id));
      if (fromFolder) {
        setFolderDocs(prev => prev.filter(d => d.id !== doc.id));
        if (doc.folder_id) {
          setFolders(prev => prev.map(f => (f.id === doc.folder_id ? { ...f, file_count: Math.max(0, f.file_count - 1), total_size_bytes: Math.max(0, f.total_size_bytes - doc.size_bytes) } : f)));
        }
      } else {
        setRecent(prev => prev.filter(d => d.id !== doc.id));
      }
      setMenuFor(null);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function startRename(doc: DocumentSummary) {
    setRenamingId(doc.id);
    setRenameValue(splitExtension(doc.name).base);
    setMenuFor(null);
  }

  async function confirmRename(doc: DocumentSummary, fromFolder: boolean) {
    const { ext } = splitExtension(doc.name);
    const newBase = renameValue.trim();
    setRenamingId(null);
    if (!newBase) return;
    const newName = `${newBase}${ext}`;
    if (newName === doc.name) return;
    try {
      await updateDocument(doc.id, { name: newName });
      setAllDocs(prev => prev.map(d => (d.id === doc.id ? { ...d, name: newName } : d)));
      if (fromFolder) {
        setFolderDocs(prev => prev.map(d => (d.id === doc.id ? { ...d, name: newName } : d)));
      } else {
        setRecent(prev => prev.map(d => (d.id === doc.id ? { ...d, name: newName } : d)));
      }
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    }
  }

  /* ── Filtered & Sorted Data ── */
  const cleanSearch = searchQuery.trim().toLowerCase();

  // Unificar allDocs + recent de forma segura para no perder ningún archivo existente
  const universeDocs = useMemo(() => {
    const map = new Map<string, DocumentSummary>();
    allDocs.forEach(d => map.set(d.id, d));
    recent.forEach(d => map.set(d.id, d));
    return Array.from(map.values());
  }, [allDocs, recent]);

  const filteredFolders = useMemo(() => {
    // Si hay un filtro de tipo de archivo específico activo (ej. Word, Excel, PPT, PDF...),
    // no mostramos las carpetas generales porque el usuario quiere ver los archivos del tipo
    if (selectedFilter !== 'ALL') return [];

    let list = openFolder
      ? folders.filter(f => f.parent_folder_id === openFolder.id)
      : folders.filter(f => !f.parent_folder_id);

    if (cleanSearch) {
      list = list.filter(f => f.name.toLowerCase().includes(cleanSearch));
    }
    return sortFolders(list, sortLabel);
  }, [folders, openFolder, cleanSearch, selectedFilter, sortLabel]);

  const filteredDocs = useMemo(() => {
    let list = openFolder ? folderDocs : universeDocs;

    if (cleanSearch) {
      list = list.filter(d => d.name.toLowerCase().includes(cleanSearch));
    }

    if (selectedFilter !== 'ALL') {
      list = list.filter(d => {
        const info = getDocTypeInfo(d.name, d.mime_type);
        return info.typeLabel === selectedFilter;
      });
    }

    return sortDocs(list, sortLabel);
  }, [openFolder, folderDocs, universeDocs, cleanSearch, selectedFilter, sortLabel]);

  function getFileCardIcon(name: string, mime: string) {
    const info = getDocTypeInfo(name, mime);
    let IconComponent = FileText;
    let colorClass = 'fi-file';

    if (info.typeLabel === 'PDF') {
      IconComponent = FileText;
      colorClass = 'fi-pdf';
    } else if (info.typeLabel === 'DOC') {
      IconComponent = FileText;
      colorClass = 'fi-doc';
    } else if (info.typeLabel === 'XLS') {
      IconComponent = FileSpreadsheet;
      colorClass = 'fi-xls';
    } else if (info.typeLabel === 'PPT') {
      IconComponent = Presentation;
      colorClass = 'fi-ppt';
    } else if (info.typeLabel === 'IMG') {
      IconComponent = ImageIcon;
      colorClass = 'fi-img';
    } else if (info.typeLabel === 'TXT') {
      IconComponent = FileCode;
      colorClass = 'fi-txt';
    } else {
      IconComponent = File;
      colorClass = 'fi-file';
    }

    return { IconComponent, colorClass, label: info.typeLabel };
  }

  function getFolderInfoById(id: string | null | undefined): { name: string; color: string; isRoot: boolean } {
    if (!id) return { name: 'Mi Unidad', color: '#6366F1', isRoot: true };
    const match = folders.find(f => f.id === id);
    return match
      ? { name: match.name, color: match.color || '#10B981', isRoot: false }
      : { name: 'Carpeta', color: '#10B981', isRoot: false };
  }

  /* ── Cálculos de Almacenamiento ── */
  const usedBytes = storageUsage?.used_bytes ?? 0;
  const limitBytes = storageUsage?.limit_bytes ?? 5 * 1024 * 1024 * 1024;
  const percentUsed = Math.min(100, Math.max(0.2, (usedBytes / limitBytes) * 100));

  function renderFolderCard(f: DocumentFolder) {
    const c = f.color || '#10B981';
    const docsInFolder = allDocs.filter(doc => doc.folder_id === f.id);
    const peekDocs = getPeekDocsForFolder(docsInFolder, f.file_count, f.id);
    const metaParts = [
      f.subfolder_count > 0 ? `${f.subfolder_count} subcarpeta${f.subfolder_count === 1 ? '' : 's'}` : null,
      `${f.file_count} archivo${f.file_count === 1 ? '' : 's'}`,
      formatFileSize(f.total_size_bytes),
    ].filter(Boolean);

    return (
      <div key={f.id} className="bib2-folder-card-wrap">
        <button
          type="button"
          className="bib2-folder-3d"
          onClick={() => openFolderView(f)}
          title={`Abrir carpeta ${f.name}`}
        >
          <div
            className="bib2-folder-tab-shape"
            style={{
              background: `${c}BF`,
              borderColor: `${c}E6`,
            }}
          />

          {peekDocs.length > 0 && (
            <div className="bib2-folder-peek-container">
              {peekDocs.map((doc, idx) => (
                <div
                  key={doc.id || idx}
                  className="bib2-mini-doc-sheet"
                  style={{
                    '--peek-rot': `${doc.rotation}deg`,
                    '--peek-x': `${doc.xOffset}px`,
                    '--peek-y': `${doc.yOffset}px`,
                    '--peek-z': idx + 1,
                  } as any}
                >
                  <span className={`bib2-mini-doc-badge ${doc.typeClass}`}>
                    {doc.typeLabel}
                  </span>
                  <div className="bib2-mini-doc-lines">
                    <span className="bmd-line bmd-line-1" />
                    <span className="bmd-line bmd-line-2" />
                    <span className="bmd-line bmd-line-3" />
                  </div>
                  <span className="bib2-mini-doc-name">{doc.name}</span>
                </div>
              ))}
            </div>
          )}

          <div
            className="bib2-folder-front-flap"
            style={{
              background: `linear-gradient(135deg, ${c}D9 0%, ${c}B3 100%)`,
              borderColor: `${c}E6`,
            }}
          >
            <div className="bib2-folder-front-info">
              <h3 className="bib2-folder-title-front" style={{ color: '#FFFFFF', opacity: 0.95 }}>{f.name}</h3>
              <p className="bib2-folder-meta-front" style={{ color: '#FFFFFF', opacity: 0.85 }}>{metaParts.join(' · ')}</p>
            </div>
          </div>
        </button>

        <div className="bib2-file-kebab-wrap bib2-folder-kebab-wrap" ref={menuFor === f.id ? menuRef : undefined}>
          <button
            type="button"
            className="bib2-file-kebab-btn bib2-folder-kebab-btn"
            onClick={() => setMenuFor(menuFor === f.id ? null : f.id)}
            aria-label="Opciones de carpeta"
          >
            <MoreVertical size={15} color="#FFFFFF" />
          </button>
          {menuFor === f.id && (
            <div className="bib2-file-menu">
              <button type="button" onClick={() => { setFolderModal(f); setMenuFor(null); }}>
                <Pencil size={13} /> Editar
              </button>
              <button type="button" className="danger" onClick={() => { setConfirmDeleteFolder(f); setMenuFor(null); }}>
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderDocCard(doc: DocumentSummary, fromFolder: boolean) {
    const isRenaming = renamingId === doc.id;
    const { IconComponent, colorClass, label } = getFileCardIcon(doc.name, doc.mime_type);

    return (
      <div key={doc.id} className="bib2-file-card bib2-file-card-real">
        <button
          type="button"
          className="bib2-file-card-main"
          title="Ver vista previa del archivo"
          onClick={() => !isRenaming && setPreviewDoc(doc)}
        >
          <div className={`bib2-file-icon ${colorClass}`}>
            <IconComponent size={19} strokeWidth={1.8} />
            <span className={`bib2-file-icon-badge ${colorClass}`}>{label}</span>
          </div>
          <div className="bib2-file-info">
            {isRenaming ? (
              <span className="dfm-rename-row" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  className="dfm-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(doc, fromFolder)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(doc, fromFolder); if (e.key === 'Escape') setRenamingId(null); }}
                />
                {splitExtension(doc.name).ext && (
                  <span className="dfm-rename-ext" title="La extensión no se puede cambiar">
                    {splitExtension(doc.name).ext}
                  </span>
                )}
              </span>
            ) : (
              <p className="bib2-file-name">{doc.name}</p>
            )}
            <p className="bib2-file-meta">{formatDate(doc.created_at)} · {formatFileSize(doc.size_bytes)}</p>
          </div>
        </button>

        <div className="bib2-file-kebab-wrap" ref={menuFor === doc.id ? menuRef : undefined}>
          <button
            type="button"
            className="bib2-file-kebab-btn"
            onClick={() => setMenuFor(menuFor === doc.id ? null : doc.id)}
            aria-label="Opciones de archivo"
          >
            {busyId === doc.id ? <Loader2 size={15} className="dfm-spin" /> : <MoreVertical size={15} />}
          </button>
          {menuFor === doc.id && (
            <div className="bib2-file-menu">
              <button type="button" onClick={() => { setPreviewDoc(doc); setMenuFor(null); }}><Eye size={13} /> Vista previa</button>
              <button
                type="button"
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc.id}
              >
                {downloadingId === doc.id ? (
                  <><Loader2 size={13} className="dfm-spin" /> Descargando...</>
                ) : (
                  <><Download size={13} /> Descargar</>
                )}
              </button>
              <button type="button" onClick={() => startRename(doc)}><Pencil size={13} /> Renombrar</button>
              {doc.origen === 'r2' && doc.mime_type === 'application/pdf' && (
                <button type="button" onClick={() => { setPublicandoDoc(doc); setMenuFor(null); }}>
                  <BookUp size={13} /> Publicar en biblioteca
                </button>
              )}
              <button type="button" className="danger" onClick={() => handleDeleteDocument(doc, fromFolder)}>
                <Trash2 size={13} /> Eliminar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderDocTableRow(doc: DocumentSummary, fromFolder: boolean) {
    const isRenaming = renamingId === doc.id;
    const { IconComponent, colorClass, label } = getFileCardIcon(doc.name, doc.mime_type);
    const folderInfo = getFolderInfoById(doc.folder_id);

    return (
      <tr key={doc.id} className="gdrive-table-row" onClick={() => !isRenaming && setPreviewDoc(doc)}>
        <td className="gdrive-td-name">
          <div className="gdrive-file-cell">
            <div className={`bib2-file-icon gdrive-row-icon ${colorClass}`}>
              <IconComponent size={16} strokeWidth={1.8} />
              <span className={`bib2-file-icon-badge ${colorClass}`}>{label}</span>
            </div>
            {isRenaming ? (
              <span className="dfm-rename-row" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  className="dfm-rename-input"
                  value={renameValue}
                  autoFocus
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => confirmRename(doc, fromFolder)}
                  onKeyDown={e => { if (e.key === 'Enter') confirmRename(doc, fromFolder); if (e.key === 'Escape') setRenamingId(null); }}
                />
                {splitExtension(doc.name).ext && (
                  <span className="dfm-rename-ext">{splitExtension(doc.name).ext}</span>
                )}
              </span>
            ) : (
              <div className="gdrive-file-text-meta">
                <span className="gdrive-file-title" title={doc.name}>{doc.name}</span>
                <span className="gdrive-file-sub-meta">{formatFileSize(doc.size_bytes)}</span>
              </div>
            )}
          </div>
        </td>
        <td className="gdrive-td-folder">
          <span
            className="gdrive-folder-pill"
            style={{
              borderColor: `${folderInfo.color}35`,
              backgroundColor: `${folderInfo.color}10`,
            }}
          >
            {folderInfo.isRoot ? (
              <HardDrive size={13} style={{ color: folderInfo.color }} />
            ) : (
              <Folder size={13} style={{ color: folderInfo.color }} fill={`${folderInfo.color}30`} />
            )}
            <span className="gdrive-folder-pill-name" style={{ color: folderInfo.color }}>
              {folderInfo.name}
            </span>
          </span>
        </td>
        <td className="gdrive-td-date">{formatDate(doc.created_at)}</td>
        <td className="gdrive-td-size">{formatFileSize(doc.size_bytes)}</td>
        <td className="gdrive-td-actions" onClick={e => e.stopPropagation()}>
          <div className="gdrive-row-actions">
            <button
              type="button"
              className="gdrive-action-icon-btn"
              title="Vista previa"
              onClick={() => setPreviewDoc(doc)}
            >
              <Eye size={15} />
            </button>
            <button
              type="button"
              className="gdrive-action-icon-btn"
              title="Descargar"
              onClick={() => handleDownload(doc)}
              disabled={downloadingId === doc.id}
            >
              {downloadingId === doc.id ? <Loader2 size={15} className="dfm-spin" /> : <Download size={15} />}
            </button>
            <div className="bib2-file-kebab-wrap" ref={menuFor === doc.id ? menuRef : undefined}>
              <button
                type="button"
                className="gdrive-action-icon-btn"
                onClick={() => setMenuFor(menuFor === doc.id ? null : doc.id)}
                aria-label="Más opciones"
              >
                <MoreVertical size={15} />
              </button>
              {menuFor === doc.id && (
                <div className="bib2-file-menu gdrive-menu-fix">
                  <button type="button" onClick={() => startRename(doc)}><Pencil size={13} /> Renombrar</button>
                  {doc.origen === 'r2' && doc.mime_type === 'application/pdf' && (
                    <button type="button" onClick={() => { setPublicandoDoc(doc); setMenuFor(null); }}>
                      <BookUp size={13} /> Publicar en biblioteca
                    </button>
                  )}
                  <button type="button" className="danger" onClick={() => handleDeleteDocument(doc, fromFolder)}>
                    <Trash2 size={13} /> Eliminar
                  </button>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div
      className={`dash-root ${isDraggingOver ? 'is-dragging-active' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {showWelcome && <WelcomeOverlay onComplete={handleWelcomeComplete} />}
      <Sidebar />
      <FeedbackFab pestana="inicio" />

      {/* ── Drag & Drop Cloud Overlay ── */}
      <AnimatePresence>
        {isDraggingOver && (
          <motion.div
            className="gdrive-drop-overlay"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="gdrive-drop-card">
              <UploadCloud size={54} className="gdrive-drop-icon" />
              <h3>Suelta tus archivos aquí</h3>
              <p>Se subirán automáticamente a {openFolder ? `la carpeta "${openFolder.name}"` : 'tu Unidad'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`bib2-body ${previewDoc ? 'is-preview-mode' : ''}`}>
        {previewDoc ? (
          <DocumentPreviewView
            document={previewDoc}
            onBack={() => setPreviewDoc(null)}
          />
        ) : (
          <>
            {/* ── GOOGLE DRIVE / CLOUD TOP SEARCH & ACTION BAR ── */}
            <div className="gdrive-top-bar">
              <div className="gdrive-search-box">
                <Search size={18} className="gdrive-search-icon" />
                <input
                  type="search"
                  placeholder="Buscar en tu Unidad..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setSearchQuery('');
                  }}
                  className="gdrive-search-input"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-label="Buscar en tu Unidad"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="gdrive-search-clear"
                    onClick={() => setSearchQuery('')}
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>

              <div className="gdrive-top-right-actions">
                {/* Botón Nuevo con Dropdown */}
                <div className="bib2-sort-wrap">
                  <button
                    type="button"
                    className="bib2-btn-new gdrive-btn-new-glow"
                    onClick={() => setNewMenuOpen(v => !v)}
                  >
                    <Plus size={16} strokeWidth={2.5} />
                    <span>Nuevo</span>
                  </button>
                  {newMenuOpen && (
                    <div className="bib2-sort-dropdown gdrive-dropdown-modern">
                      <button
                        type="button"
                        className="bib2-sort-item"
                        onClick={() => { setFolderModal('create'); setNewMenuOpen(false); }}
                      >
                        <FolderPlus size={15} /> Nueva carpeta
                      </button>
                      <button
                        type="button"
                        className="bib2-sort-item"
                        onClick={() => { setUploadModalOpen(true); setNewMenuOpen(false); }}
                      >
                        <UploadCloud size={15} /> Subir documento
                      </button>
                    </div>
                  )}
                </div>

                {/* View Mode Toggle: Grid vs List */}
                <div className="gdrive-view-mode-toggle">
                  <button
                    type="button"
                    className={`gdrive-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => handleSetViewMode('grid')}
                    title="Vista en cuadrícula"
                    aria-label="Vista en cuadrícula"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    className={`gdrive-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => handleSetViewMode('list')}
                    title="Vista en lista"
                    aria-label="Vista en lista"
                  >
                    <List size={16} />
                  </button>
                </div>

                {/* Dropdown de Ordenamiento */}
                <div className="bib2-sort-wrap">
                  <button
                    type="button"
                    className="bib2-btn-outline gdrive-btn-sort"
                    onClick={() => setSortOpen(v => !v)}
                  >
                    <ArrowUpDown size={14} strokeWidth={1.8} />
                    <span className="gdrive-sort-label">{sortLabel}</span>
                  </button>
                  {sortOpen && (
                    <div className="bib2-sort-dropdown gdrive-dropdown-modern">
                      {SORT_OPTIONS.map(opt => (
                        <button
                          key={opt}
                          type="button"
                          className={`bib2-sort-item${sortLabel === opt ? ' active' : ''}`}
                          onClick={() => { setSortLabel(opt); setSortOpen(false); }}
                        >
                          {sortLabel === opt && <Check size={13} className="gdrive-check-icon" />}
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── QUICK FILTER CHIPS (TIPO DE ARCHIVO) ── */}
            <div className="gdrive-filter-scroll-row">
              <div className="gdrive-filter-chips">
                {FILTER_CHIPS.map(chip => {
                  const active = selectedFilter === chip.id;
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      className={`gdrive-filter-chip ${active ? 'active' : ''}`}
                      onClick={() => {
                        if (chip.id === 'ALL') {
                          setSelectedFilter('ALL');
                        } else {
                          setSelectedFilter(prev => prev === chip.id ? 'ALL' : chip.id);
                        }
                      }}
                    >
                      {chip.color && (
                        <span className="gdrive-chip-dot" style={{ background: chip.color }} />
                      )}
                      <span>{chip.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── BARRA UNIFICADA / ENCABEZADO DE CARPETA ACTIVA ── */}
            {openFolder ? (
              /* ── BARRA SIMPLE DE CARPETA ACTIVA (SOLO CARPETA Y NOMBRE) ── */
              <div className="gdrive-folder-nav-bar">
                <div className="gdrive-folder-nav-left">
                  <button
                    type="button"
                    className="gdrive-back-folder-btn"
                    onClick={goBackFolder}
                    title="Volver a la carpeta anterior"
                  >
                    <ArrowLeft size={15} />
                    <span>Volver</span>
                  </button>

                  <div className="gdrive-folder-breadcrumbs">
                    <button
                      type="button"
                      className="gdrive-crumb-link"
                      onClick={() => jumpToBreadcrumb(null)}
                    >
                      <HardDrive size={15} />
                      <span>Mi Unidad</span>
                    </button>

                    {folderStack.map((sf, idx) => (
                      <div key={sf.id} className="gdrive-crumb-group">
                        <span className="gdrive-crumb-sep">/</span>
                        <button
                          type="button"
                          className="gdrive-crumb-link"
                          onClick={() => jumpToBreadcrumb(sf, idx)}
                        >
                          <Folder size={14} style={{ color: sf.color || '#10B981' }} />
                          <span>{sf.name}</span>
                        </button>
                      </div>
                    ))}

                    <div className="gdrive-crumb-group">
                      <span className="gdrive-crumb-sep">/</span>
                      <span className="gdrive-crumb-current">
                        <Folder size={15} style={{ color: openFolder.color || '#10B981' }} />
                        <span className="gdrive-current-folder-name">{openFolder.name}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── BARRA UNIFICADA DE MI UNIDAD: BREADCRUMBS + ALMACENAMIENTO + WIDGETS ── */
              <div className="gdrive-breadcrumb-bar gdrive-unified-bar">
                {/* Izquierda: Mi Unidad + Información de Almacenamiento */}
                <div className="gdrive-bar-left">
                  <div className="gdrive-breadcrumbs">
                    <button
                      type="button"
                      className="gdrive-crumb-item active"
                      onClick={() => jumpToBreadcrumb(null)}
                    >
                      <HardDrive size={15} />
                      <span>Mi Unidad</span>
                    </button>
                  </div>

                  {/* Información de Almacenamiento al lado de Mi Unidad */}
                  <div className="gdrive-storage-pill" title={`${formatFileSize(usedBytes)} usados de ${formatFileSize(limitBytes)}`}>
                    <div className="gdrive-storage-text">
                      <span className="gdrive-storage-val">{formatFileSize(usedBytes)}</span>
                      <span className="gdrive-storage-of">de {formatFileSize(limitBytes)}</span>
                    </div>
                    <div className="gdrive-storage-track">
                      <div className="gdrive-storage-fill" style={{ width: `${percentUsed}%` }} />
                    </div>
                  </div>
                </div>

              </div>
            )}


            {error && (
              <div className="gdrive-error-banner">
                <p>{error}</p>
                <button type="button" onClick={() => setError(null)}><X size={14} /></button>
              </div>
            )}

            {isDropUploading && (
              <div className="gdrive-uploading-banner">
                <Loader2 size={16} className="dfm-spin" /> Subiendo archivos a tu unidad...
              </div>
            )}

            {loading && (
              <div className="bib2-loading">
                <Loader2 size={24} className="dfm-spin" />
                <span>Cargando tu almacenamiento en la nube...</span>
              </div>
            )}

            {/* ── SECCIÓN DE CARPETAS (Visible solo en vista general sin filtro de tipo) ── */}
            {!loading && selectedFilter === 'ALL' && (
              <section className="bib2-section gdrive-section">
                <div className="gdrive-section-header">
                  <h2 className="gdrive-section-title">
                    <span>{openFolder ? 'Subcarpetas' : 'Carpetas'}</span>
                    <span className="gdrive-section-badge">{filteredFolders.length}</span>
                  </h2>
                </div>

                {filteredFolders.length === 0 ? (
                  !openFolder && cleanSearch ? null : (
                    <div className="gdrive-empty-folder-box">
                      <FolderPlus size={24} />
                      <p>{openFolder ? 'No hay subcarpetas creadas.' : 'Aún no tienes carpetas creadas — crea una con "+ Nuevo".'}</p>
                    </div>
                  )
                ) : (
                  <div className="bib2-folders-row gdrive-folders-grid">
                    {filteredFolders.map(f => renderFolderCard(f))}
                  </div>
                )}
              </section>
            )}

            {/* ── SECCIÓN DE ARCHIVOS Y DOCUMENTOS (GRID / LIST VIEW) ── */}
            {!loading && (
              <section className="bib2-section gdrive-section">
                <div className="gdrive-section-header">
                  <h2 className="gdrive-section-title">
                    <span>
                      {openFolder
                        ? 'Archivos en esta carpeta'
                        : (cleanSearch || selectedFilter !== 'ALL' ? 'Resultados de archivos' : 'Archivos recientes')}
                    </span>
                    <span className="gdrive-section-badge">{filteredDocs.length}</span>
                  </h2>
                </div>

                {folderDocsLoading ? (
                  <div className="bib2-loading">
                    <Loader2 size={20} className="dfm-spin" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <div className="gdrive-empty-files-box">
                    <UploadCloud size={28} />
                    <p>
                      {cleanSearch || selectedFilter !== 'ALL'
                        ? 'No se encontraron archivos que coincidan con la búsqueda o filtro.'
                        : 'No hay documentos en esta ubicación — arrastra archivos aquí o haz clic en "+ Nuevo".'}
                    </p>
                  </div>
                ) : viewMode === 'grid' ? (
                  <div className="bib2-recent-row gdrive-files-grid">
                    {filteredDocs.map(doc => renderDocCard(doc, !!openFolder))}
                  </div>
                ) : (
                  <div className="gdrive-table-container">
                    <table className="gdrive-table">
                      <thead>
                        <tr>
                          <th className="gdrive-th-name">Nombre</th>
                          <th className="gdrive-th-folder">Ubicación</th>
                          <th className="gdrive-th-date">Fecha de subida</th>
                          <th className="gdrive-th-size">Tamaño</th>
                          <th className="gdrive-th-actions">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocs.map(doc => renderDocTableRow(doc, !!openFolder))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* ── Modales de Creación, Subida y Confirmación ── */}
      <AnimatePresence>
        {folderModal && (
          <FolderModal
            folder={folderModal === 'create' ? null : folderModal}
            onClose={() => setFolderModal(null)}
            onSave={handleSaveFolder}
          />
        )}
        {uploadModalOpen && (
          <UploadDocumentModal
            folders={folders}
            defaultFolderId={openFolder?.id}
            onClose={() => setUploadModalOpen(false)}
            onUpload={handleUpload}
          />
        )}
        {publicandoDoc && (
          <PublicarEnBibliotecaModal
            doc={publicandoDoc}
            onClose={() => setPublicandoDoc(null)}
            onPublish={handlePublicarEnBiblioteca}
          />
        )}
        {confirmDeleteFolder && (
          <motion.div
            className="dfm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmDeleteFolder(null)}
          >
            <motion.div
              className="dfm-modal dfm-confirm"
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.97 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="dfm-header">
                <span>Eliminar carpeta</span>
                <button type="button" className="dfm-close-btn" onClick={() => setConfirmDeleteFolder(null)}><ArrowLeft size={16} /></button>
              </div>
              <p className="dfm-confirm-text">
                ¿Deseas eliminar la carpeta <strong>{confirmDeleteFolder.name}</strong>? Contiene {confirmDeleteFolder.file_count} archivo
                {confirmDeleteFolder.file_count === 1 ? '' : 's'}: los archivos sincronizados en la nube permanecerán sin
                carpeta (no se eliminarán). Esta acción no se puede deshacer.
              </p>
              <button
                type="button"
                className="dfm-save-btn dfm-danger-btn"
                onClick={() => handleDeleteFolder(confirmDeleteFolder)}
                disabled={busyId === confirmDeleteFolder.id}
              >
                {busyId === confirmDeleteFolder.id ? 'Eliminando...' : 'Sí, eliminar todo'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
