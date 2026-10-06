import { useEffect, useRef, useState } from 'react';
import {
  UploadCloud, FileText, Trash2, Pencil, Download, Loader2,
  X, Check, AlertCircle, BookUp, HardDrive,
} from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import FeedbackFab from '../../components/shared/FeedbackFab';
import { formatFileSize } from '../../utils/fileUpload';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import { listFolders, type DocumentFolder } from '../../data/documentosApi';
import {
  obtenerUso, listarArchivos, subirArchivo, actualizarArchivo, borrarArchivo,
  descargarArchivo, publicarEnBiblioteca, TIPOS_PERMITIDOS, MAX_FILE_BYTES,
  type ArchivoR2, type UsoAlmacenamiento,
} from '../../data/almacenamientoApi';
import '../../styles/almacenamiento.css';

function esPdf(archivo: ArchivoR2) {
  return archivo.mime_type === 'application/pdf';
}

export default function AlmacenamientoPage() {
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [carpetaId, setCarpetaId] = useState<string>('');
  const [archivos, setArchivos] = useState<ArchivoR2[]>([]);
  const [uso, setUso] = useState<UsoAlmacenamiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subiendo, setSubiendo] = useState(false);
  const [errorSubida, setErrorSubida] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [renombrando, setRenombrando] = useState<string | null>(null);
  const [nombreTemp, setNombreTemp] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [publicando, setPublicando] = useState<ArchivoR2 | null>(null);
  const [tituloPublicar, setTituloPublicar] = useState('');

  async function cargar() {
    setLoading(true);
    setError(null);
    try {
      const [{ folders: f }, { archivos: a }, usoRes] = await Promise.all([
        listFolders(),
        listarArchivos(carpetaId || undefined),
        obtenerUso().catch(() => null),
      ]);
      setFolders(f);
      setArchivos(a);
      if (usoRes) setUso(usoRes);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [carpetaId]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setErrorSubida(null);

    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setErrorSubida('Ese tipo de archivo no está permitido.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setErrorSubida('El archivo supera el máximo de 100 MB.');
      return;
    }
    if (uso && uso.usado_bytes + file.size > uso.limite_bytes) {
      setErrorSubida('No tienes espacio suficiente. Tu límite es de 5 GB.');
      return;
    }

    setSubiendo(true);
    try {
      const archivo = await subirArchivo(file, carpetaId || null);
      setArchivos(prev => [archivo, ...prev]);
      setUso(prev => prev ? { ...prev, usado_bytes: prev.usado_bytes + archivo.size_bytes } : prev);
    } catch (err) {
      setErrorSubida(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleDescargar(archivo: ArchivoR2) {
    setBusyId(archivo.id);
    try {
      const { url } = await descargarArchivo(archivo.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('No se pudo generar el enlace de descarga.');
    } finally {
      setBusyId(null);
    }
  }

  function empezarRenombrar(archivo: ArchivoR2) {
    setRenombrando(archivo.id);
    setNombreTemp(archivo.nombre);
  }

  async function confirmarRenombrar(archivo: ArchivoR2) {
    const nuevo = nombreTemp.trim();
    if (!nuevo || nuevo === archivo.nombre) {
      setRenombrando(null);
      return;
    }
    setBusyId(archivo.id);
    try {
      const { archivo: actualizado } = await actualizarArchivo(archivo.id, { nombre: nuevo });
      setArchivos(prev => prev.map(a => a.id === archivo.id ? actualizado : a));
    } catch {
      setError('No se pudo renombrar el archivo.');
    } finally {
      setBusyId(null);
      setRenombrando(null);
    }
  }

  async function handleMover(archivo: ArchivoR2, nuevaCarpetaId: string) {
    setBusyId(archivo.id);
    try {
      const { archivo: actualizado } = await actualizarArchivo(archivo.id, { carpeta_id: nuevaCarpetaId || null });
      // Si estamos filtrando por carpeta y lo movimos fuera, lo sacamos de la vista.
      setArchivos(prev =>
        carpetaId && actualizado.carpeta_id !== carpetaId
          ? prev.filter(a => a.id !== archivo.id)
          : prev.map(a => a.id === archivo.id ? actualizado : a)
      );
    } catch {
      setError('No se pudo mover el archivo.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleBorrar(archivo: ArchivoR2) {
    if (!window.confirm(`¿Borrar "${archivo.nombre}"? No se puede deshacer.`)) return;
    setBusyId(archivo.id);
    try {
      await borrarArchivo(archivo.id);
      setArchivos(prev => prev.filter(a => a.id !== archivo.id));
      setUso(prev => prev ? { ...prev, usado_bytes: Math.max(0, prev.usado_bytes - archivo.size_bytes) } : prev);
    } catch {
      setError('No se pudo borrar el archivo.');
    } finally {
      setBusyId(null);
    }
  }

  function abrirPublicar(archivo: ArchivoR2) {
    setPublicando(archivo);
    setTituloPublicar(archivo.nombre.replace(/\.pdf$/i, ''));
  }

  async function confirmarPublicar() {
    if (!publicando) return;
    setBusyId(publicando.id);
    try {
      await publicarEnBiblioteca(publicando.id, { titulo: tituloPublicar.trim() || undefined });
      setPublicando(null);
    } catch {
      setError('No se pudo publicar en la biblioteca.');
    } finally {
      setBusyId(null);
    }
  }

  const porcentaje = uso ? Math.min(100, Math.round((uso.usado_bytes / uso.limite_bytes) * 100)) : 0;

  return (
    <div className="dash-root">
      <Sidebar />
      <FeedbackFab pestana="biblioteca" />

      <div className="am-wrapper">
        <header className="am-header">
          <div>
            <h1 className="am-title"><HardDrive size={22} /> Mi nube</h1>
            <p className="am-subtitle">Tus archivos en Cloudflare R2. Hasta 5 GB, y podés publicar tus PDF en la biblioteca.</p>
          </div>
          <button type="button" className="am-upload-btn" onClick={() => fileInputRef.current?.click()} disabled={subiendo}>
            {subiendo ? <Loader2 size={18} className="am-spin" /> : <UploadCloud size={18} />}
            {subiendo ? 'Subiendo…' : 'Subir archivo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            accept={TIPOS_PERMITIDOS.join(',')}
            onChange={e => handleFile(e.target.files?.[0])}
          />
        </header>

        {uso && (
          <div className="am-uso">
            <div className="am-uso-bar"><div className="am-uso-fill" style={{ width: `${porcentaje}%` }} /></div>
            <span>{formatFileSize(uso.usado_bytes)} de {formatFileSize(uso.limite_bytes)} usados ({porcentaje}%)</span>
          </div>
        )}

        {errorSubida && <div className="am-error"><AlertCircle size={16} />{errorSubida}</div>}
        {error && <div className="am-error"><AlertCircle size={16} />{error}</div>}

        <div className="am-filtros">
          <label>Carpeta:</label>
          <select value={carpetaId} onChange={e => setCarpetaId(e.target.value)}>
            <option value="">Todas</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="am-loading"><Loader2 size={28} className="am-spin" /></div>
        ) : archivos.length === 0 ? (
          <p className="am-vacio">Todavía no subiste ningún archivo acá.</p>
        ) : (
          <ul className="am-lista">
            {archivos.map(archivo => (
              <li key={archivo.id} className="am-item">
                <FileText size={20} className="am-item-icon" />
                <div className="am-item-info">
                  {renombrando === archivo.id ? (
                    <div className="am-rename">
                      <input
                        autoFocus
                        value={nombreTemp}
                        onChange={e => setNombreTemp(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmarRenombrar(archivo); if (e.key === 'Escape') setRenombrando(null); }}
                      />
                      <button type="button" onClick={() => confirmarRenombrar(archivo)}><Check size={15} /></button>
                      <button type="button" onClick={() => setRenombrando(null)}><X size={15} /></button>
                    </div>
                  ) : (
                    <p className="am-item-nombre">{archivo.nombre}</p>
                  )}
                  <span className="am-item-meta">{formatFileSize(archivo.size_bytes)} · {archivo.created_at ? new Date(archivo.created_at).toLocaleDateString('es-CO') : ''}</span>
                </div>

                <select
                  className="am-mover"
                  value={archivo.carpeta_id || ''}
                  disabled={busyId === archivo.id}
                  onChange={e => handleMover(archivo, e.target.value)}
                >
                  <option value="">Sin carpeta</option>
                  {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>

                <div className="am-acciones">
                  <button type="button" title="Descargar" disabled={busyId === archivo.id} onClick={() => handleDescargar(archivo)}><Download size={16} /></button>
                  <button type="button" title="Renombrar" disabled={busyId === archivo.id} onClick={() => empezarRenombrar(archivo)}><Pencil size={16} /></button>
                  {esPdf(archivo) && (
                    <button type="button" title="Publicar en biblioteca" disabled={busyId === archivo.id} onClick={() => abrirPublicar(archivo)}><BookUp size={16} /></button>
                  )}
                  <button type="button" title="Borrar" disabled={busyId === archivo.id} onClick={() => handleBorrar(archivo)}><Trash2 size={16} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {publicando && (
        <div className="am-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setPublicando(null); }}>
          <div className="am-modal">
            <div className="am-modal-head">
              <span>Publicar en la biblioteca</span>
              <button type="button" onClick={() => setPublicando(null)}><X size={16} /></button>
            </div>
            <label className="am-label">Título</label>
            <input className="am-input" value={tituloPublicar} onChange={e => setTituloPublicar(e.target.value)} maxLength={255} />
            <button type="button" className="am-upload-btn" disabled={busyId === publicando.id} onClick={confirmarPublicar}>
              {busyId === publicando.id ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
