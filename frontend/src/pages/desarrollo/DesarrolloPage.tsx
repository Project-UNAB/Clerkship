import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileQuestion, Calendar, Code, GitBranch } from 'lucide-react';
import Sidebar from '../../components/shared/Sidebar';
import CuestionarioTab from './CuestionarioTab';
import CronogramaTab from './CronogramaTab';
import RepositorioTab from './RepositorioTab';
import '../../styles/desarrollo.css';

type DesarrolloTab = 'cuestionario' | 'cronograma' | 'repositorio';

export default function DesarrolloPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = (searchParams.get('tab') as DesarrolloTab) || 'cuestionario';
  const [activeTab, setActiveTab] = useState<DesarrolloTab>(initialTab);

  const handleTabChange = (tab: DesarrolloTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B0F19' }}>
      <Sidebar />

      <main style={{ flex: 1, minWidth: 0 }}>
        <div className="desarrollo-container">
          {/* ── Header Bar ────────────────────────────────────────── */}
          <header className="desarrollo-header">
            <div className="desarrollo-header-title-box">
              <div className="desarrollo-title-wrap">
                <h1>
                  <Code size={26} style={{ color: '#60A5FA' }} /> Módulo de Desarrollo
                </h1>
                <p>
                  Registro de avances paso a paso, perfiles de integrantes y seguimiento del proyecto.
                </p>
              </div>
            </div>

            {/* ── Tab Switcher ─────────────────────────────────────── */}
            <div className="desarrollo-nav-tabs">
              <button
                type="button"
                className={`desarrollo-tab-btn ${activeTab === 'cuestionario' ? 'active' : ''}`}
                onClick={() => handleTabChange('cuestionario')}
              >
                <FileQuestion size={18} /> Cuestionario (Registro por Pasos)
                {activeTab === 'cuestionario' && (
                  <motion.div
                    className="desarrollo-tab-indicator"
                    layoutId="desarrollo-tab-indicator"
                  />
                )}
              </button>

              <button
                type="button"
                className={`desarrollo-tab-btn ${activeTab === 'cronograma' ? 'active' : ''}`}
                onClick={() => handleTabChange('cronograma')}
              >
                <Calendar size={18} /> Cronograma
                {activeTab === 'cronograma' && (
                  <motion.div
                    className="desarrollo-tab-indicator"
                    layoutId="desarrollo-tab-indicator"
                  />
                )}
              </button>

              <button
                type="button"
                className={`desarrollo-tab-btn ${activeTab === 'repositorio' ? 'active' : ''}`}
                onClick={() => handleTabChange('repositorio')}
              >
                <GitBranch size={18} /> Repositorio
                {activeTab === 'repositorio' && (
                  <motion.div
                    className="desarrollo-tab-indicator"
                    layoutId="desarrollo-tab-indicator"
                  />
                )}
              </button>
            </div>
          </header>

          {/* ── Body Container ────────────────────────────────────── */}
          <div className="desarrollo-body">
            <AnimatePresence mode="wait">
              {activeTab === 'cuestionario' && (
                <motion.div
                  key="cuestionario"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <CuestionarioTab />
                </motion.div>
              )}

              {activeTab === 'cronograma' && (
                <motion.div
                  key="cronograma"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <CronogramaTab />
                </motion.div>
              )}

              {activeTab === 'repositorio' && (
                <motion.div
                  key="repositorio"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                >
                  <RepositorioTab />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
