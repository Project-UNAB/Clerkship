import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './styles/landing.css';
import './styles/auth.css';
import './styles/inner.css';
import './styles/dashboard.css';
import './styles/theme.css';

import LandingPage from './pages/landing/LandingPage';
import ProyectoPage from './pages/landing/ProyectoPage';
import LoginPage from './pages/auth/LoginPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ValidacionExpertoPage from './pages/validacion/ValidacionExpertoPage';
import AdminPage from './pages/admin/AdminPage';
import RegisterPage from './pages/auth/RegisterPage';
import ConsentPage from './pages/auth/ConsentPage';
import DashboardPage from './pages/dashboard/DashboardPage';

import ExplorarPage from './pages/explorar/ExplorarPage';
import DesarrolladoresPage from './pages/equipo/DesarrolladoresPage';
import DireccionPage from './pages/equipo/DireccionPage';
import InstitucionPage from './pages/equipo/InstitucionPage';
import TerminosPage from './pages/legal/TerminosPage';
import PrivacidadPage from './pages/legal/PrivacidadPage';
import LicenciaPage from './pages/legal/LicenciaPage';
import DocumentacionPage from './pages/contenido/DocumentacionPage';
import BibliotecaPage from './pages/contenido/BibliotecaPage';
import SimulacionPage from './pages/simulacion/SimulacionPage';
import CasosPage from './pages/simulacion/CasosPage';
import HistorialPage from './pages/simulacion/HistorialPage';
import CuestionarioPage from './pages/cuestionario/CuestionarioPage';
import CronogramaPage from './pages/cronograma/CronogramaPage';
import DesarrolloPage from './pages/desarrollo/DesarrolloPage';
import ThemeToggleFloating from './components/shared/ThemeToggleFloating';
import { isAuthenticated, hasUserAcceptedConsent } from './utils/authConsent';
import { getStoredUser } from './data/mainAuth';

function isAdmin(): boolean {
  return getStoredUser()?.role === 'ADMIN';
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
const SIDEBAR_ROUTE_PREFIXES = ['/dashboard', '/biblioteca', '/casos', '/historial', '/desarrollo'];

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
    </BrowserRouter>
  );
}
