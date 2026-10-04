<<<<<<< HEAD
import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <section id="center">
        <div className="hero">
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>
            Edit <code>src/App.tsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

      <div className="ticks"></div>
      <section id="spacer"></section>
    </>
  )
}

export default App
=======
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

/**
 * 🔒 Guard para Rutas Protegidas del Dashboard
 * 1. Exige haber iniciado sesión en una cuenta válida.
 * 2. Exige haber realizado la autorización de consentimiento en esa cuenta.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (!hasUserAcceptedConsent()) {
    return <Navigate to="/consent" replace />;
  }

  return <>{children}</>;
}

/**
 * 🔒 Guard Exclusivo para la Pestaña de Consentimiento (/consent)
 * 1. Exige haber iniciado sesión (un usuario anónimo NO puede entrar).
 * 2. Si el usuario YA completó la autorización de tratamiento de datos de su cuenta,
 *    se bloquea el acceso y se redirige directamente a /dashboard (1 sola vez por cuenta).
 */
function ConsentRoute({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  if (hasUserAcceptedConsent()) {
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
        <Route path="/simulacion"             element={<ProtectedRoute><SimulacionPage /></ProtectedRoute>} />
        <Route path="/simulacion/:id"         element={<ProtectedRoute><SimulacionPage /></ProtectedRoute>} />
        <Route path="/casos"                  element={<ProtectedRoute><CasosPage /></ProtectedRoute>} />
        <Route path="/historial"              element={<ProtectedRoute><HistorialPage /></ProtectedRoute>} />

        {/* Informative Pages */}
        <Route path="/equipo/desarrolladores" element={<DesarrolladoresPage />} />
        <Route path="/equipo/direccion"       element={<DireccionPage />} />
        <Route path="/equipo/institucion"     element={<InstitucionPage />} />
        <Route path="/legal/terminos"         element={<TerminosPage />} />
        <Route path="/legal/privacidad"       element={<PrivacidadPage />} />
        <Route path="/legal/licencia"         element={<LicenciaPage />} />

        {/* Catch-all → landing */}
        <Route path="*"                       element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
>>>>>>> main
