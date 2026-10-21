import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../data/firebase';
import { logoutUserSession } from '../../utils/authConsent';
import { logoutMainSession } from '../../data/mainAuth';
import { useCurrentUser } from '../../utils/currentUser';
import {
  getEstadisticas,
  listarPostsAdmin, borrarPostAdmin,
  borrarArticuloAdmin,
  getEstadisticasTokens,
  type Estadisticas, type EstadisticasTokens,
} from '../../data/adminApi';
import {
  listarArticulosAdmin, aprobarArticulo, rechazarArticulo,
  type Articulo, type EstadoArticulo,
} from '../../data/articulosApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import {
  obtenerUso, listarArchivos, subirArchivo, borrarArchivo,
  TIPOS_PERMITIDOS, MAX_FILE_BYTES, type ArchivoR2, type UsoAlmacenamiento,
} from '../../data/almacenamientoApi';
import { formatFileSize } from '../../utils/fileUpload';
import AnalyticsDashboard from '../../components/admin/AnalyticsDashboard';
import TokensDashboard from '../../components/admin/TokensDashboard';
import UsersManagementDashboard from '../../components/admin/UsersManagementDashboard';
import ResultadosOpinion from '../../components/admin/ResultadosOpinion';
import ValidacionExpertos from '../../components/admin/ValidacionExpertos';
import AdminSidebar, { type AdminTab } from '../../components/admin/AdminSidebar';
import PublicarLibroModal, { type FuentePdf } from '../../components/biblioteca/PublicarLibroModal';
import '../../styles/admin.css';
import '../../styles/flipbook.css';

// El visor de libros (PDF.js) se descarga solo cuando el administrador abre uno.
const FlipbookViewer = lazy(() => import('../../components/biblioteca/FlipbookViewer'));

function PanelResumen() {
  const [datos, setDatos] = useState<Estadisticas | null>(null);
  const [tokens, setTokens] = useState<EstadisticasTokens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function cargar() {
    setLoading(true);
    setError(null);
    Promise.all([getEstadisticas(), getEstadisticasTokens()])
      .then(([est, tok]) => {
        setDatos(est);
        setTokens(tok);
      })
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { cargar(); }, []);

  if (error) return <p className="adm-error">{error}</p>;
  if (loading || !datos || !tokens) return <p className="adm-vacio">Cargando analíticas del sistema…</p>;

  return <AnalyticsDashboard estadisticas={datos} tokens={tokens} onRefresh={cargar} />;
}

function PanelUsuarios() {
  return <UsersManagementDashboard />;
}

function PanelComunidad() {
  const [posts, setPosts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    listarPostsAdmin().then(r => setPosts(r.posts)).catch(err => setError(mainAuthErrorMessage(err)));
  }
  useEffect(cargar, []);

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar esta publicación y sus comentarios?')) return;
    try {
      await borrarPostAdmin(id);
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    }
  }

  return (
    <div>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead><tr><th>Autor</th><th>Contenido</th><th>Likes</th><th>Comentarios</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {posts.map(p => (
              <tr key={p.id}>
                <td>{p.author_name}<br /><span className="adm-stat-sub">{p.author_email}</span></td>
                <td>{p.content}</td>
                <td>{p.likes_count}</td>
                <td>{p.comments_count}</td>
                <td>{p.created_at}</td>
                <td><button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => borrar(p.id)}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-stat-sub">Para borrar un comentario puntual, usa el endpoint /api/admin/comunidad/comentarios/&lt;id&gt; (no hay lista aparte todavía).</p>
    </div>
  );
}

/** Subir un PDF y publicarlo como recurso de biblioteca. El admin no tiene
 *  Dashboard, así que esto reemplaza el "Mi nube" que usan estudiantes y
 *  docentes — mismo backend (/api/almacenamiento), sin carpetas. Antes de
 *  publicar se piden los datos del recurso, el tipo y la portada, con el mismo
 *  cuadro que usan la biblioteca y el Dashboard. */
function SubirYPublicar({ onPublicado }: { onPublicado: () => void }) {
  const [uso, setUso] = useState<UsoAlmacenamiento | null>(null);
  const [archivos, setArchivos] = useState<ArchivoR2[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [aPublicar, setAPublicar] = useState<FuentePdf | null>(null);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    Promise.all([obtenerUso(), listarArchivos()])
      .then(([u, a]) => { setUso(u); setArchivos(a.archivos); })
      .catch(err => setError(mainAuthErrorMessage(err)));
  }
  useEffect(cargar, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!TIPOS_PERMITIDOS.includes(file.type)) {
      setError('Ese tipo de archivo no está permitido.');
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError('El archivo supera el máximo de 2 GB.');
      return;
    }
    // Un PDF va a la biblioteca: primero se piden sus datos (el cuadro lo sube y lo publica).
    if (file.type === 'application/pdf') {
      setAPublicar({ tipo: 'archivo', file });
      return;
    }
    setSubiendo(true);
    try {
      const archivo = await subirArchivo(file, null);
      setArchivos(prev => [archivo, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir el archivo.');
    } finally {
      setSubiendo(false);
    }
  }

  function handlePublicado() {
    // Si venía de la lista de subidos sin publicar, ya no está pendiente.
    if (aPublicar?.tipo === 'documento') {
      const id = aPublicar.id;
      setArchivos(prev => prev.filter(a => a.id !== id));
    }
    cargar();
    onPublicado();
  }

  async function quitar(archivo: ArchivoR2) {
    if (!window.confirm(`¿Borrar "${archivo.nombre}" sin publicarlo?`)) return;
    try {
      await borrarArchivo(archivo.id);
      setArchivos(prev => prev.filter(a => a.id !== archivo.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo borrar.');
    }
  }

  return (
    <div className="adm-upload-box">
      <div className="adm-toolbar">
        <label className="adm-btn">
          {subiendo ? 'Subiendo…' : 'Subir PDF / archivo'}
          <input type="file" style={{ display: 'none' }} disabled={subiendo} accept={TIPOS_PERMITIDOS.join(',')}
            onChange={e => { handleFile(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {uso && <span className="adm-stat-sub">{formatFileSize(uso.usado_bytes)} de {formatFileSize(uso.limite_bytes)} usados</span>}
      </div>
      {error && <p className="adm-error">{error}</p>}
      {archivos.length > 0 && (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead><tr><th>Archivo subido sin publicar</th><th>Tamaño</th><th></th></tr></thead>
            <tbody>
              {archivos.map(a => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td>{formatFileSize(a.size_bytes)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {a.mime_type === 'application/pdf' && (
                      <button type="button" className="adm-btn adm-btn-sm"
                        onClick={() => setAPublicar({ tipo: 'documento', id: a.id, nombre: a.nombre })}>
                        Publicar…
                      </button>
                    )}
                    <button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => quitar(a)}>Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aPublicar && (
        <PublicarLibroModal
          fuente={aPublicar}
          aviso="Como administrador, quedará publicado y visible en la biblioteca de inmediato."
          onClose={() => setAPublicar(null)}
          onPublicado={handlePublicado}
        />
      )}
    </div>
  );
}

const ESTADOS_BIBLIOTECA: { id: EstadoArticulo; label: string }[] = [
  { id: 'PENDIENTE', label: 'Pendientes' },
  { id: 'APROBADO', label: 'Aprobados' },
  { id: 'RECHAZADO', label: 'Rechazados' },
];

function PanelBiblioteca() {
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoArticulo>('PENDIENTE');
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [pendientesCount, setPendientesCount] = useState(0);
  const [rechazandoId, setRechazandoId] = useState<string | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [procesandoId, setProcesandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Recurso que el administrador está leyendo para decidir si lo aprueba.
  const [leyendo, setLeyendo] = useState<Articulo | null>(null);

  function cargar(estadoActual: EstadoArticulo = estadoFiltro) {
    setError(null);
    Promise.all([
      listarArticulosAdmin(estadoActual),
      estadoActual === 'PENDIENTE' ? Promise.resolve(null) : listarArticulosAdmin('PENDIENTE'),
    ])
      .then(([actual, pendientes]) => {
        setArticulos(actual.articulos);
        setPendientesCount(
          estadoActual === 'PENDIENTE'
            ? actual.articulos.length
            : (pendientes?.articulos.length ?? 0),
        );
      })
      .catch(err => setError(mainAuthErrorMessage(err)));
  }

  useEffect(() => {
    cargar(estadoFiltro);
  }, [estadoFiltro]);

  async function aprobar(id: string) {
    setProcesandoId(id);
    setError(null);
    try {
      await aprobarArticulo(id);
      if (rechazandoId === id) {
        setRechazandoId(null);
        setMotivoRechazo('');
      }
      cargar(estadoFiltro);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setProcesandoId(null);
    }
  }

  async function confirmarRechazo(id: string) {
    const motivo = motivoRechazo.trim();
    if (!motivo) {
      setError('Indica el motivo del rechazo (1 a 500 caracteres).');
      return;
    }
    setProcesandoId(id);
    setError(null);
    try {
      await rechazarArticulo(id, motivo);
      setRechazandoId(null);
      setMotivoRechazo('');
      cargar(estadoFiltro);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setProcesandoId(null);
    }
  }

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar este recurso de la biblioteca?')) return;
    try {
      await borrarArticuloAdmin(id);
      cargar(estadoFiltro);
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    }
  }

  return (
    <div>
      <SubirYPublicar onPublicado={() => cargar(estadoFiltro)} />

      <div className="adm-toolbar">
        {ESTADOS_BIBLIOTECA.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`adm-btn adm-btn-sm ${estadoFiltro === id ? 'adm-btn-active' : ''}`}
            onClick={() => {
              setEstadoFiltro(id);
              setRechazandoId(null);
              setMotivoRechazo('');
            }}
          >
            {id === 'PENDIENTE' ? `${label} (${pendientesCount})` : label}
          </button>
        ))}
      </div>

      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead>
            <tr>
              <th>Título</th>
              <th>Tipo</th>
              <th>Especialidad</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {articulos.map(a => (
              <tr key={a.id}>
                <td>
                  {a.title}
                  {a.estado === 'RECHAZADO' && a.motivo_rechazo && (
                    <div className="adm-stat-sub" style={{ color: '#b91c1c' }}>
                      Rechazado: {a.motivo_rechazo}
                    </div>
                  )}
                </td>
                <td>{a.type}</td>
                <td>{a.specialty}</td>
                <td>{a.estado ?? 'APROBADO'}</td>
                <td>{a.created_at}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="adm-btn adm-btn-sm"
                      disabled={!a.pdf_url}
                      title={a.pdf_url ? 'Leer el PDF antes de decidir' : 'Este recurso no tiene PDF'}
                      onClick={() => setLeyendo(a)}
                    >
                      Ver
                    </button>
                    {a.estado !== 'APROBADO' && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm"
                        disabled={procesandoId === a.id}
                        onClick={() => aprobar(a.id)}
                      >
                        Aprobar
                      </button>
                    )}
                    {a.estado !== 'RECHAZADO' && rechazandoId !== a.id && (
                      <button
                        type="button"
                        className="adm-btn adm-btn-sm"
                        disabled={procesandoId === a.id}
                        onClick={() => {
                          setRechazandoId(a.id);
                          setMotivoRechazo(a.motivo_rechazo ?? '');
                        }}
                      >
                        Rechazar
                      </button>
                    )}
                    {rechazandoId === a.id && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="adm-input"
                          placeholder="Motivo del rechazo (1-500 caracteres)"
                          maxLength={500}
                          value={motivoRechazo}
                          onChange={e => setMotivoRechazo(e.target.value)}
                        />
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm adm-btn-danger"
                          disabled={procesandoId === a.id || !motivoRechazo.trim()}
                          onClick={() => confirmarRechazo(a.id)}
                        >
                          Confirmar
                        </button>
                        <button
                          type="button"
                          className="adm-btn adm-btn-sm"
                          onClick={() => {
                            setRechazandoId(null);
                            setMotivoRechazo('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      className="adm-btn adm-btn-sm adm-btn-danger"
                      onClick={() => borrar(a.id)}
                    >
                      Borrar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {articulos.length === 0 && (
              <tr>
                <td colSpan={6} className="adm-vacio">
                  No hay recursos en este estado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {leyendo?.pdf_url && (
        <Suspense fallback={<div className="fb-backdrop fb-cargando-visor" aria-busy="true"><div className="fb-spinner" /></div>}>
          <FlipbookViewer
            articleId={leyendo.id}
            title={leyendo.title}
            authors={leyendo.authors}
            pdfUrl={leyendo.pdf_url}
            onClose={() => setLeyendo(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

function PanelTokens() {
  const [datos, setDatos] = useState<EstadisticasTokens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  function cargar() {
    setLoading(true);
    setError(null);
    getEstadisticasTokens()
      .then(setDatos)
      .catch(err => setError(mainAuthErrorMessage(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { cargar(); }, []);

  if (error) return <p className="adm-error">{error}</p>;
  if (loading || !datos) return <p className="adm-vacio">Cargando telemetría de tokens…</p>;

  return <TokensDashboard tokens={datos} onRefresh={cargar} />;
}

/** Panel de administrador. A propósito minimalista: tablas simples, sin
 *  animaciones ni componentes pesados — el trabajo real está en el backend. */
export default function AdminPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>('resumen');

  async function handleLogout() {
    logoutUserSession();
    // Revoca los tokens en el servidor además de limpiar el navegador.
    logoutMainSession();
    try {
      await signOut(auth);
    } catch {
      // Sin sesión de Firebase activa
    }
    navigate('/', { replace: true });
  }

  if (!user) return <div className="adm-root"><p className="adm-vacio">Cargando…</p></div>;

  if (user.role !== 'Administrador') {
    return (
      <div className="adm-root">
        <div className="adm-denegado">
          <h1>No tienes acceso</h1>
          <p>Esta pantalla es solo para administradores.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-root">
      <AdminSidebar
        currentTab={tab}
        onTabChange={setTab}
        userEmail={user.email || ''}
        onLogout={handleLogout}
      />
      <main className="adm-content">
        {tab === 'resumen' && <PanelResumen />}
        {tab === 'usuarios' && <PanelUsuarios />}
        {tab === 'comunidad' && <PanelComunidad />}
        {tab === 'biblioteca' && <PanelBiblioteca />}
        {tab === 'feedback' && <ResultadosOpinion />}
        {tab === 'validacion' && <ValidacionExpertos />}
        {tab === 'tokens' && <PanelTokens />}
      </main>
    </div>
  );
}
