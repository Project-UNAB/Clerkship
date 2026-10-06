import { useEffect, useState } from 'react';
import { useCurrentUser } from '../../utils/currentUser';
import {
  getEstadisticas, listarUsuarios, actualizarUsuario,
  listarPostsAdmin, borrarPostAdmin,
  listarBibliotecaAdmin, borrarArticuloAdmin,
  listarFeedbackAdmin, listarValidacionAdmin,
  type Estadisticas, type AdminUsuario,
} from '../../data/adminApi';
import { mainAuthErrorMessage } from '../../data/mainAuth';
import {
  obtenerUso, listarArchivos, subirArchivo, publicarEnBiblioteca, borrarArchivo,
  TIPOS_PERMITIDOS, MAX_FILE_BYTES, type ArchivoR2, type UsoAlmacenamiento,
} from '../../data/almacenamientoApi';
import { formatFileSize } from '../../utils/fileUpload';
import '../../styles/admin.css';

type Tab = 'resumen' | 'usuarios' | 'comunidad' | 'biblioteca' | 'feedback' | 'validacion';
const TABS: { id: Tab; label: string }[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'comunidad', label: 'Comunidad' },
  { id: 'biblioteca', label: 'Biblioteca' },
  { id: 'feedback', label: 'Retroalimentación' },
  { id: 'validacion', label: 'Validación expertos' },
];
const PESTANAS = ['inicio', 'casos', 'historial', 'biblioteca'] as const;

/** Tabla genérica: cada fila puede tener columnas distintas (feedback y
 *  validación cambian de pestaña a pestaña), así que se arman solas. */
function TablaGenerica({ filas }: { filas: Record<string, any>[] }) {
  if (filas.length === 0) return <p className="adm-vacio">Sin respuestas todavía.</p>;
  const columnas = Object.keys(filas[0]);
  return (
    <div className="adm-tabla-wrap">
      <table className="adm-tabla">
        <thead><tr>{columnas.map(c => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {filas.map((fila, i) => (
            <tr key={fila.id || i}>
              {columnas.map(c => <td key={c}>{String(fila[c] ?? '')}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelResumen() {
  const [datos, setDatos] = useState<Estadisticas | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getEstadisticas().then(setDatos).catch(err => setError(mainAuthErrorMessage(err))); }, []);

  if (error) return <p className="adm-error">{error}</p>;
  if (!datos) return <p className="adm-vacio">Cargando…</p>;

  return (
    <div className="adm-stats-grid">
      <div className="adm-stat-card">
        <h3>Usuarios</h3>
        <p className="adm-stat-num">{datos.usuarios.total}</p>
        <p className="adm-stat-sub">
          {Object.entries(datos.usuarios.por_rol).map(([r, n]) => `${r}: ${n}`).join(' · ')}
        </p>
        <p className="adm-stat-sub">{datos.usuarios.activos} activos · {datos.usuarios.desactivados} desactivados</p>
      </div>
      <div className="adm-stat-card">
        <h3>Casos clínicos</h3>
        <p className="adm-stat-num">{datos.casos_clinicos.total}</p>
        <p className="adm-stat-sub">{datos.casos_clinicos.completados} completados · {datos.casos_clinicos.en_progreso} en progreso</p>
        <p className="adm-stat-sub">{datos.casos_clinicos.ultimos_7_dias} en los últimos 7 días</p>
      </div>
      <div className="adm-stat-card">
        <h3>Cursos</h3>
        <p className="adm-stat-num">{datos.cursos}</p>
      </div>
      <div className="adm-stat-card">
        <h3>Biblioteca</h3>
        <p className="adm-stat-num">{datos.biblioteca.articulos}</p>
      </div>
      <div className="adm-stat-card">
        <h3>Comunidad</h3>
        <p className="adm-stat-num">{datos.comunidad.publicaciones}</p>
        <p className="adm-stat-sub">{datos.comunidad.comentarios} comentarios</p>
      </div>
      <div className="adm-stat-card">
        <h3>Almacenamiento (R2)</h3>
        <p className="adm-stat-num">{datos.almacenamiento.archivos}</p>
        <p className="adm-stat-sub">{(datos.almacenamiento.bytes_usados / 1024 / 1024).toFixed(1)} MB usados</p>
      </div>
      <div className="adm-stat-card">
        <h3>Retroalimentación</h3>
        {Object.entries(datos.retroalimentacion).map(([p, n]) => <p key={p} className="adm-stat-sub">{p}: {n}</p>)}
      </div>
      <div className="adm-stat-card">
        <h3>Validación por expertos</h3>
        {Object.entries(datos.validacion_expertos).map(([p, n]) => <p key={p} className="adm-stat-sub">{p}: {n}</p>)}
      </div>
    </div>
  );
}

function PanelUsuarios() {
  const [usuarios, setUsuarios] = useState<AdminUsuario[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function cargar() {
    listarUsuarios({ q: q || undefined }).then(r => setUsuarios(r.usuarios)).catch(err => setError(mainAuthErrorMessage(err)));
  }
  useEffect(cargar, []);

  async function cambiarRol(u: AdminUsuario, role: string) {
    setBusyId(u.id);
    try {
      const { usuario } = await actualizarUsuario(u.id, { role });
      setUsuarios(prev => prev.map(x => x.id === u.id ? usuario : x));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function alternarActivo(u: AdminUsuario) {
    setBusyId(u.id);
    try {
      const { usuario } = await actualizarUsuario(u.id, { activo: !u.activo });
      setUsuarios(prev => prev.map(x => x.id === u.id ? usuario : x));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="adm-toolbar">
        <input className="adm-input" placeholder="Buscar por nombre o correo…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()} />
        <button type="button" className="adm-btn" onClick={cargar}>Buscar</button>
      </div>
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Verificado</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td>{u.first_name} {u.last_name}</td>
                <td>{u.email}</td>
                <td>
                  <select className="adm-input" value={u.role} disabled={busyId === u.id} onChange={e => cambiarRol(u, e.target.value)}>
                    <option value="STUDENT">STUDENT</option>
                    <option value="TEACHER">TEACHER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </td>
                <td>{u.email_verified ? 'Sí' : 'No'}</td>
                <td>{u.activo ? 'Activo' : 'Desactivado'}</td>
                <td>
                  <button type="button" className="adm-btn adm-btn-sm" disabled={busyId === u.id} onClick={() => alternarActivo(u)}>
                    {u.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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

/** Subir un PDF propio y publicarlo como recurso de biblioteca. El admin no
 *  tiene Dashboard, así que esto reemplaza el "Mi nube" que usan estudiantes
 *  y docentes — mismo backend (/api/almacenamiento), sin carpetas. */
function SubirYPublicar({ onPublicado }: { onPublicado: () => void }) {
  const [uso, setUso] = useState<UsoAlmacenamiento | null>(null);
  const [archivos, setArchivos] = useState<ArchivoR2[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [publicandoId, setPublicandoId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState('');
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
      setError('El archivo supera el máximo de 100 MB.');
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

  async function publicar(archivo: ArchivoR2) {
    setPublicandoId(archivo.id);
    setError(null);
    try {
      await publicarEnBiblioteca(archivo.id, { titulo: titulo.trim() || undefined });
      setArchivos(prev => prev.filter(a => a.id !== archivo.id));
      setTitulo('');
      onPublicado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      setPublicandoId(null);
    }
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
          <input type="file" style={{ display: 'none' }} disabled={subiendo} accept={TIPOS_PERMITIDOS.join(',')} onChange={e => handleFile(e.target.files?.[0])} />
        </label>
        {uso && <span className="adm-stat-sub">{formatFileSize(uso.usado_bytes)} de {formatFileSize(uso.limite_bytes)} usados</span>}
      </div>
      {error && <p className="adm-error">{error}</p>}
      {archivos.length > 0 && (
        <div className="adm-tabla-wrap">
          <table className="adm-tabla">
            <thead><tr><th>Archivo</th><th>Tamaño</th><th>Título para publicar</th><th></th></tr></thead>
            <tbody>
              {archivos.map(a => (
                <tr key={a.id}>
                  <td>{a.nombre}</td>
                  <td>{formatFileSize(a.size_bytes)}</td>
                  <td><input className="adm-input" placeholder={a.nombre.replace(/\.pdf$/i, '')} value={titulo} onChange={e => setTitulo(e.target.value)} /></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    {a.mime_type === 'application/pdf' && (
                      <button type="button" className="adm-btn adm-btn-sm" disabled={publicandoId === a.id} onClick={() => publicar(a)}>
                        {publicandoId === a.id ? 'Publicando…' : 'Publicar'}
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
    </div>
  );
}

function PanelBiblioteca() {
  const [articulos, setArticulos] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  function cargar() {
    listarBibliotecaAdmin().then(r => setArticulos(r.articulos)).catch(err => setError(mainAuthErrorMessage(err)));
  }
  useEffect(cargar, []);

  async function borrar(id: string) {
    if (!window.confirm('¿Borrar este recurso de la biblioteca?')) return;
    try {
      await borrarArticuloAdmin(id);
      setArticulos(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      setError(mainAuthErrorMessage(err));
    }
  }

  return (
    <div>
      <SubirYPublicar onPublicado={cargar} />
      {error && <p className="adm-error">{error}</p>}
      <div className="adm-tabla-wrap">
        <table className="adm-tabla">
          <thead><tr><th>Título</th><th>Tipo</th><th>Especialidad</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            {articulos.map(a => (
              <tr key={a.id}>
                <td>{a.title}</td>
                <td>{a.type}</td>
                <td>{a.specialty}</td>
                <td>{a.created_at}</td>
                <td><button type="button" className="adm-btn adm-btn-sm adm-btn-danger" onClick={() => borrar(a.id)}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelFeedback() {
  const [pestana, setPestana] = useState<typeof PESTANAS[number]>('inicio');
  const [filas, setFilas] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarFeedbackAdmin(pestana).then(r => setFilas(r.respuestas)).catch(err => setError(mainAuthErrorMessage(err)));
  }, [pestana]);

  return (
    <div>
      <div className="adm-toolbar">
        {PESTANAS.map(p => (
          <button key={p} type="button" className={`adm-btn adm-btn-sm ${pestana === p ? 'adm-btn-active' : ''}`} onClick={() => setPestana(p)}>{p}</button>
        ))}
      </div>
      {error && <p className="adm-error">{error}</p>}
      <TablaGenerica filas={filas} />
    </div>
  );
}

function PanelValidacion() {
  const [pestana, setPestana] = useState<typeof PESTANAS[number]>('inicio');
  const [filas, setFilas] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listarValidacionAdmin(pestana).then(r => setFilas(r.respuestas)).catch(err => setError(mainAuthErrorMessage(err)));
  }, [pestana]);

  return (
    <div>
      <div className="adm-toolbar">
        {PESTANAS.map(p => (
          <button key={p} type="button" className={`adm-btn adm-btn-sm ${pestana === p ? 'adm-btn-active' : ''}`} onClick={() => setPestana(p)}>{p}</button>
        ))}
      </div>
      {error && <p className="adm-error">{error}</p>}
      <TablaGenerica filas={filas} />
    </div>
  );
}

/** Panel de administrador. A propósito minimalista: tablas simples, sin
 *  animaciones ni componentes pesados — el trabajo real está en el backend. */
export default function AdminPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>('resumen');

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
      <aside className="adm-sidebar">
        <h1 className="adm-logo">Panel admin</h1>
        <nav>
          {TABS.map(t => (
            <button key={t.id} type="button" className={`adm-nav-btn ${tab === t.id ? 'is-active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="adm-content">
        {tab === 'resumen' && <PanelResumen />}
        {tab === 'usuarios' && <PanelUsuarios />}
        {tab === 'comunidad' && <PanelComunidad />}
        {tab === 'biblioteca' && <PanelBiblioteca />}
        {tab === 'feedback' && <PanelFeedback />}
        {tab === 'validacion' && <PanelValidacion />}
      </main>
    </div>
  );
}
