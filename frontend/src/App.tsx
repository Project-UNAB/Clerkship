import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/landing.css';
import './styles/auth.css';
import './styles/inner.css';
import './styles/dashboard.css';
import './styles/theme.css';

// Cada pantalla se descarga cuando se abre por primera vez, no todas al entrar.
const LandingPage = lazy(() => import('./pages/landing/LandingPage'));
const ProyectoPage = lazy(() => import('./pages/landing/ProyectoPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ValidacionExpertoPage = lazy(() => import('./pages/validacion/ValidacionExpertoPage'));
const AdminPage = lazy(() => import('./pages/admin/AdminPage'));
const CursosPage = lazy(() => import('./pages/cursos/CursosPage'));
const CursoDetallePage = lazy(() => import('./pages/cursos/CursoDetallePage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ConsentPage = lazy(() => import('./pages/auth/ConsentPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));

const ExplorarPage = lazy(() => import('./pages/explorar/ExplorarPage'));
const DesarrolladoresPage = lazy(() => import('./pages/equipo/DesarrolladoresPage'));
const DireccionPage = lazy(() => import('./pages/equipo/DireccionPage'));
const InstitucionPage = lazy(() => import('./pages/equipo/InstitucionPage'));
const TerminosPage = lazy(() => import('./pages/legal/TerminosPage'));
const PrivacidadPage = lazy(() => import('./pages/legal/PrivacidadPage'));
const LicenciaPage = lazy(() => import('./pages/legal/LicenciaPage'));
const DocumentacionPage = lazy(() => import('./pages/contenido/DocumentacionPage'));
const BibliotecaPage = lazy(() => import('./pages/contenido/BibliotecaPage'));
const SimulacionPage = lazy(() => import('./pages/simulacion/SimulacionPage'));
const CasosPage = lazy(() => import('./pages/simulacion/CasosPage'));
const HistorialPage = lazy(() => import('./pages/simulacion/HistorialPage'));
const CuestionarioPage = lazy(() => import('./pages/cuestionario/CuestionarioPage'));
const CronogramaPage = lazy(() => import('./pages/cronograma/CronogramaPage'));
const DesarrolloPage = lazy(() => import('./pages/desarrollo/DesarrolloPage'));
const SeguimientoPage = lazy(() => import('./pages/seguimiento/SeguimientoPage'));
import ThemeToggleFloating from './components/shared/ThemeToggleFloating';
import { isAuthenticated, hasUserAcceptedConsent } from './utils/authConsent';
import { getStoredUser } from './data/mainAuth';

function isAdmin(): boolean {
  return getStoredUser()?.role === 'ADMIN';
}

function isTeacher(): boolean {
  return getStoredUser()?.role === 'TEACHER';
}

/**
 * 🔒 Guard para Rutas Protegidas del Dashboard (estudiante/docente)
 * 1. Exige haber iniciado sesión en una cuenta válida.
 * 2. Exige haber realizado la autorización de consentimiento en esa cuenta.
 * 3. Un administrador no tiene esta vista — se lo manda a /admin.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  if (!hasUserAcceptedConsent()) {
    return <Navigate to="/consent" replace />;
  }

  return <>{children}</>;
}

/**
 * 🔒 Guard exclusivo para vistas de docente (/seguimiento)
 */
function TeacherRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  if (!hasUserAcceptedConsent()) {
    return <Navigate to="/consent" replace />;
  }

  if (!isTeacher()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * 🔒 Guard Exclusivo para la Pestaña de Consentimiento (/consent)
 * 1. Exige haber iniciado sesión (un usuario anónimo NO puede entrar).
 * 2. Un administrador no pasa por consentimiento — no es su vista.
 * 3. Si el usuario YA completó la autorización de tratamiento de datos de su cuenta,
 *    se bloquea el acceso y se redirige directamente a /dashboard (1 sola vez por cuenta).
 */
function ConsentRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (isAdmin()) {
    return <Navigate to="/admin" replace />;
  }

  if (hasUserAcceptedConsent()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/**
 * 🔒 Guard exclusivo del Panel de Administrador (/admin)
 * Solo exige sesión iniciada y rol ADMIN — no pasa por el consentimiento,
 * que es un trámite de la experiencia clínica (estudiante/docente), no de
 * quien administra la plataforma.
 */
function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

/** Rutas cuyas páginas ya traen su propio <Sidebar/> con toggle de tema en
 *  el riel — ahí el botón flotante global queda de más. */
const SIDEBAR_ROUTE_PREFIXES = ['/dashboard', '/biblioteca', '/casos', '/historial', '/desarrollo', '/mis-cursos', '/seguimiento'];

function GlobalThemeToggle() {
  const { pathname } = useLocation();
  if (SIDEBAR_ROUTE_PREFIXES.some(p => pathname.startsWith(p))) return null;
  return <ThemeToggleFloating />;
}

/**
 * 🔒 Guard para Páginas Públicas de Autenticación (/login, /register)
 * Si el usuario ya está autenticado, no lo deja volver a login/register:
 * lo envía a /dashboard si ya dió consentimiento, o a /consent si aún falta.
 */
function PublicAuthRoute({ children }: { children: React.ReactNode }) {
  if (isAuthenticated()) {
    if (hasUserAcceptedConsent()) {
      return <Navigate to="/dashboard" replace />;
    } else {
      return <Navigate to="/consent" replace />;
    }
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Botón Flotante Fijo a la Derecha — solo en páginas sin Sidebar propio
          (el Sidebar ya trae su propio toggle de tema en el riel). */}
      <GlobalThemeToggle />

      <Suspense fallback={<div className="app-cargando" aria-busy="true" />}>
      <Routes>
        {/* Landing Public Pages */}
        <Route path="/"                       element={<LandingPage />} />
        <Route path="/proyecto"               element={<ProyectoPage />} />
        <Route path="/cronograma"             element={<CronogramaPage />} />
        {/* Módulo de Desarrollo: público, tiene su propia autenticación
            por integrante (Firebase) — no depende del login clínico */}
        <Route path="/cuestionario"           element={<CuestionarioPage />} />
        <Route path="/desarrollo"             element={<DesarrolloPage />} />

        {/* Auth (Protegidas contra re-login si ya inició sesión) */}
        <Route path="/login"                  element={<PublicAuthRoute><LoginPage /></PublicAuthRoute>} />
        <Route path="/register"               element={<PublicAuthRoute><RegisterPage /></PublicAuthRoute>} />
        <Route path="/recuperar-contrasena"   element={<PublicAuthRoute><ForgotPasswordPage /></PublicAuthRoute>} />

        {/* Consentimiento Informado (Sólo usuarios logueados sin consentimiento) */}
        <Route path="/consent"                element={<ConsentRoute><ConsentPage /></ConsentRoute>} />

        {/* Protected Dashboard & Clinical App Routes */}
        <Route path="/dashboard"              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/explorar"               element={<ProtectedRoute><ExplorarPage /></ProtectedRoute>} />
        <Route path="/documentacion"          element={<ProtectedRoute><DocumentacionPage /></ProtectedRoute>} />
        <Route path="/biblioteca"             element={<ProtectedRoute><BibliotecaPage /></ProtectedRoute>} />
        <Route path="/mis-cursos"             element={<ProtectedRoute><CursosPage /></ProtectedRoute>} />
        <Route path="/mis-cursos/:id"         element={<ProtectedRoute><CursoDetallePage /></ProtectedRoute>} />
        <Route path="/seguimiento"            element={<TeacherRoute><SeguimientoPage /></TeacherRoute>} />
        <Route path="/seguimiento/:courseId"  element={<TeacherRoute><SeguimientoPage /></TeacherRoute>} />
        <Route path="/admin"                  element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="/simulacion"             element={<ProtectedRoute><SimulacionPage /></ProtectedRoute>} />
        <Route path="/simulacion/:id"         element={<ProtectedRoute><SimulacionPage /></ProtectedRoute>} />
        <Route path="/casos"                  element={<ProtectedRoute><CasosPage /></ProtectedRoute>} />
        <Route path="/historial"              element={<ProtectedRoute><HistorialPage /></ProtectedRoute>} />

        {/* Informative Pages */}
        <Route path="/equipo/desarrolladores" element={<DesarrolladoresPage />} />
        <Route path="/equipo/direccion"       element={<DireccionPage />} />
        <Route path="/equipo/institucion"     element={<InstitucionPage />} />
        <Route path="/validacion/:pestana"    element={<ValidacionExpertoPage />} />
        <Route path="/legal/terminos"         element={<TerminosPage />} />
        <Route path="/legal/privacidad"       element={<PrivacidadPage />} />
        <Route path="/legal/licencia"         element={<LicenciaPage />} />

        {/* Catch-all → landing */}
        <Route path="*"                       element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
