import { useState, useEffect, useMemo } from 'react';
import {
  Search, SlidersHorizontal, Plus, ChevronDown, ChevronUp, Pencil, Trash2,
  MapPin, Users, Calendar, Award, Compass, X, Check, RefreshCw, AlertCircle, CheckCircle2
} from 'lucide-react';
import {
  listarUsuarios,
  actualizarUsuario,
  type AdminUsuario
} from '../../data/adminApi';
import { API_BASE_URL } from '../../data/apiClient';

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Estudiante de Medicina',
  TEACHER: 'Docente · Preceptor Clínico',
  ADMIN: 'Administrador del Sistema',
};

const DEPARTMENT_BY_ROLE: Record<string, string> = {
  STUDENT: 'Facultad de Ciencias de la Salud',
  TEACHER: 'Departamento de Educación Médica',
  ADMIN: 'Dirección y Tecnología',
};

function formatUserAvatar(u: AdminUsuario): string {
  if (u.avatar_svg) {
    return `data:image/svg+xml,${encodeURIComponent(u.avatar_svg)}`;
  }
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(u.email || u.username)}&backgroundColor=0284c7`;
}

// Genera un teléfono o identificador institucional simulado y estético
function formatPhoneOrId(u: AdminUsuario): string {
  const hash = Math.abs(u.email.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0));
  const num = (hash % 900) + 100;
  return `(607) 555-0${num}`;
}

export default function UsersManagementDashboard() {
  const [usuarios, setUsuarios] = useState<AdminUsuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Filtros y búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Fila expandida (Acordeón como en el diseño de referencia)
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Modales
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUsuario | null>(null);

  // Formulario nuevo usuario
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'STUDENT' | 'TEACHER' | 'ADMIN'>('STUDENT');
  const [newStudentCode, setNewStudentCode] = useState('U00');
  const [newPassword, setNewPassword] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Formulario edición
  const [editRole, setEditRole] = useState<string>('STUDENT');
  const [editActivo, setEditActivo] = useState<boolean>(true);

  function cargar() {
    setLoading(true);
    setError(null);
    listarUsuarios({
      q: searchQuery.trim() || undefined,
      role: roleFilter !== 'ALL' ? roleFilter : undefined
    })
      .then(res => {
        setUsuarios(res.usuarios);
        // Si no hay fila expandida y hay usuarios, por defecto expandimos la 5ta o 1ra para mostrar el diseño
        if (!expandedRowId && res.usuarios.length > 0) {
          const defaultExpand = res.usuarios.length >= 5 ? res.usuarios[4].id : res.usuarios[0].id;
          setExpandedRowId(defaultExpand);
        }
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    cargar();
  }, [roleFilter]);

  // Manejo de mensaje temporal de éxito
  function flashSuccess(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  }

  // Filtrado reactivo en cliente (búsqueda rápida)
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return usuarios;
    return usuarios.filter(u => {
      const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
      const email = u.email.toLowerCase();
      const username = u.username.toLowerCase();
      const role = (ROLE_LABELS[u.role] || u.role).toLowerCase();
      return fullName.includes(q) || email.includes(q) || username.includes(q) || role.includes(q);
    });
  }, [usuarios, searchQuery]);

  // Selección individual y global
  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.id));
  const someFilteredSelected = filteredUsers.some(u => selectedIds.has(u.id)) && !allFilteredSelected;

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      const next = new Set(selectedIds);
      filteredUsers.forEach(u => next.add(u.id));
      setSelectedIds(next);
    }
  }

  function toggleSelectUser(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  }

  // Acordeón de detalles
  function toggleRowExpansion(id: string) {
    setExpandedRowId(prev => (prev === id ? null : id));
  }

  // Acciones: Alternar activo (estado)
  async function toggleUserActive(u: AdminUsuario, e: React.MouseEvent) {
    e.stopPropagation();
    const actionText = u.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`¿Seguro que deseas ${actionText} la cuenta de ${u.first_name} ${u.last_name}?`)) {
      return;
    }

    setBusyId(u.id);
    try {
      const { usuario } = await actualizarUsuario(u.id, { activo: !u.activo });
      setUsuarios(prev => prev.map(x => x.id === u.id ? usuario : x));
      flashSuccess(`Cuenta de ${u.first_name} ${u.activo ? 'desactivada' : 'activada'} correctamente.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    } finally {
      setBusyId(null);
    }
  }

  // Acciones en lote para seleccionados
  async function handleBulkActivate(activar: boolean) {
    if (selectedIds.size === 0) return;
    const confirmMsg = activar
      ? `¿Activar ${selectedIds.size} usuarios seleccionados?`
      : `¿Desactivar ${selectedIds.size} usuarios seleccionados?`;
    if (!window.confirm(confirmMsg)) return;

    setLoading(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await actualizarUsuario(id, { activo: activar });
      }
      flashSuccess(`${selectedIds.size} usuarios actualizados.`);
      setSelectedIds(new Set());
      cargar();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar en lote');
    } finally {
      setLoading(false);
    }
  }

  // Abrir modal de edición
  function openEditModal(u: AdminUsuario, e: React.MouseEvent) {
    e.stopPropagation();
    setEditingUser(u);
    setEditRole(u.role);
    setEditActivo(u.activo);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setModalSubmitting(true);
    setModalError(null);
    try {
      const { usuario } = await actualizarUsuario(editingUser.id, {
        role: editRole,
        activo: editActivo,
      });
      setUsuarios(prev => prev.map(x => x.id === editingUser.id ? usuario : x));
      flashSuccess(`Usuario ${usuario.first_name} ${usuario.last_name} actualizado.`);
      setEditingUser(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo actualizar el usuario.');
    } finally {
      setModalSubmitting(false);
    }
  }

  // Crear usuario desde modal
  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setModalSubmitting(true);
    setModalError(null);

    const payload: Record<string, any> = {
      first_name: newFirstName.trim(),
      last_name: newLastName.trim(),
      email: newEmail.trim().toLowerCase(),
      password: newPassword,
      role: newRole,
    };

    if (newRole === 'STUDENT') {
      if (!newStudentCode.trim().toUpperCase().startsWith('U00')) {
        setModalError('El código de estudiante debe iniciar con "U00"');
        setModalSubmitting(false);
        return;
      }
      payload.student_code = newStudentCode.trim().toUpperCase();
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Error al registrar el usuario');
      }

      flashSuccess(`Usuario ${payload.first_name} ${payload.last_name} creado con éxito.`);
      setShowAddModal(false);
      // Limpiar formulario
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('STUDENT');
      setNewStudentCode('U00');
      cargar();
    } catch (err) {
      setModalError(err instanceof Error ? err.message : 'No se pudo registrar el usuario.');
    } finally {
      setModalSubmitting(false);
    }
  }

  return (
    <div className="adm-users-wrapper">
      {/* ── Barra Superior de Controles (Search Task, Filter, Selection & Add User) ── */}
      <div className="adm-users-topbar">
        <div className="adm-users-left-controls">
          {/* Barra de Búsqueda */}
          <div className="adm-search-input-pill">
            <Search size={16} className="adm-search-icon" />
            <input
              type="text"
              placeholder="Buscar por nombre, correo o rol..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="adm-search-field"
            />
            <button
              type="button"
              className="adm-filter-trigger-btn"
              onClick={() => setShowFilterDropdown(prev => !prev)}
              title="Filtrar por rol"
            >
              <SlidersHorizontal size={14} />
            </button>

            {/* Dropdown de Filtro */}
            {showFilterDropdown && (
              <div className="adm-filter-dropdown-menu">
                <div className="adm-filter-menu-header">Filtrar por rol</div>
                <button
                  type="button"
                  className={`adm-filter-opt ${roleFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => { setRoleFilter('ALL'); setShowFilterDropdown(false); }}
                >
                  Todos los roles
                </button>
                <button
                  type="button"
                  className={`adm-filter-opt ${roleFilter === 'STUDENT' ? 'active' : ''}`}
                  onClick={() => { setRoleFilter('STUDENT'); setShowFilterDropdown(false); }}
                >
                  Estudiantes
                </button>
                <button
                  type="button"
                  className={`adm-filter-opt ${roleFilter === 'TEACHER' ? 'active' : ''}`}
                  onClick={() => { setRoleFilter('TEACHER'); setShowFilterDropdown(false); }}
                >
                  Docentes
                </button>
                <button
                  type="button"
                  className={`adm-filter-opt ${roleFilter === 'ADMIN' ? 'active' : ''}`}
                  onClick={() => { setRoleFilter('ADMIN'); setShowFilterDropdown(false); }}
                >
                  Administradores
                </button>
              </div>
            )}
          </div>

          {/* Indicador de Selección (como en la imagen: ☑ 2 Selected) */}
          <div className="adm-selection-pill-indicator">
            <label className="adm-checkbox-label">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                ref={el => {
                  if (el) el.indeterminate = someFilteredSelected;
                }}
                onChange={toggleSelectAll}
                className="adm-custom-checkbox-input"
              />
              <span className="adm-custom-checkbox-box">
                {(allFilteredSelected || someFilteredSelected) && <Check size={12} strokeWidth={3} />}
              </span>
            </label>
            <span className="adm-selection-text">
              {selectedIds.size} Seleccionado{selectedIds.size === 1 ? '' : 's'}
            </span>

            {/* Acciones en lote si hay selección */}
            {selectedIds.size > 0 && (
              <div className="adm-bulk-actions-group">
                <button
                  type="button"
                  className="adm-bulk-btn activate"
                  onClick={() => handleBulkActivate(true)}
                  title="Activar seleccionados"
                >
                  Activar
                </button>
                <button
                  type="button"
                  className="adm-bulk-btn deactivate"
                  onClick={() => handleBulkActivate(false)}
                  title="Desactivar seleccionados"
                >
                  Desactivar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Botón Derecho: + ADD USER */}
        <div className="adm-users-right-controls">
          <button
            type="button"
            className="adm-add-user-btn"
            onClick={() => { setShowAddModal(true); setModalError(null); }}
          >
            <Plus size={16} strokeWidth={2.4} />
            <span>+ AGREGAR USUARIO</span>
          </button>
        </div>
      </div>

      {/* Mensajes de feedback */}
      {error && (
        <div className="adm-banner-alert error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="adm-banner-alert success">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* ── Tabla Principal con Estilo de Tarjeta Redondeada ── */}
      <div className="adm-users-table-card">
        {loading ? (
          <div className="adm-table-loading-state">
            <RefreshCw size={24} className="adm-spin-icon" />
            <p>Cargando lista de usuarios…</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="adm-table-empty-state">
            <p>No se encontraron usuarios con los criterios seleccionados.</p>
          </div>
        ) : (
          <table className="adm-users-styled-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <label className="adm-checkbox-label">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={el => {
                        if (el) el.indeterminate = someFilteredSelected;
                      }}
                      onChange={toggleSelectAll}
                      className="adm-custom-checkbox-input"
                    />
                    <span className="adm-custom-checkbox-box">
                      {(allFilteredSelected || someFilteredSelected) && <Check size={12} strokeWidth={3} />}
                    </span>
                  </label>
                </th>
                <th className="adm-th-name">Nombre</th>
                <th className="adm-th-pos">Rol</th>
                <th className="adm-th-dept">Departamento</th>
                <th className="adm-th-email">Correo Electrónico</th>
                <th className="adm-th-phone">Teléfono</th>
                <th className="adm-th-status">Estado</th>
                <th className="adm-th-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => {
                const isSelected = selectedIds.has(u.id);
                const isExpanded = expandedRowId === u.id;
                const avatarSrc = formatUserAvatar(u);
                const roleLabel = ROLE_LABELS[u.role] || u.role;
                const department = DEPARTMENT_BY_ROLE[u.role] || 'Ciencias Clínicas';
                const phone = formatPhoneOrId(u);

                return (
                  <tr key={u.id} className="adm-user-row-wrapper-group">
                    <td colSpan={8} className="adm-user-row-wrapper-cell">
                      {/* Contenedor unificado para permitir el borde azul continuo de la fila expandida */}
                      <div className={`adm-user-row-container ${isExpanded ? 'is-expanded' : ''} ${isSelected ? 'is-selected' : ''}`}>
                        {/* Fila Principal de Datos */}
                        <div
                          className="adm-user-main-row"
                          onClick={() => toggleRowExpansion(u.id)}
                        >
                          {/* 1. Checkbox */}
                          <div className="adm-td-cell adm-cell-checkbox" onClick={e => e.stopPropagation()}>
                            <label className="adm-checkbox-label">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={e => toggleSelectUser(u.id, e as any)}
                                className="adm-custom-checkbox-input"
                              />
                              <span className="adm-custom-checkbox-box">
                                {isSelected && <Check size={12} strokeWidth={3} />}
                              </span>
                            </label>
                          </div>

                          {/* 2. Chevron + Avatar + Nombre */}
                          <div className="adm-td-cell adm-cell-name">
                            <button
                              type="button"
                              className="adm-row-chevron-btn"
                              aria-label={isExpanded ? 'Contraer detalles' : 'Expandir detalles'}
                              onClick={e => {
                                e.stopPropagation();
                                toggleRowExpansion(u.id);
                              }}
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            <div className="adm-user-avatar-wrap">
                              <img src={avatarSrc} alt={`${u.first_name} ${u.last_name}`} className="adm-user-avatar-img" />
                            </div>
                            <span className="adm-user-fullname">{u.first_name} {u.last_name}</span>
                          </div>

                          {/* 3. Posición / Rol */}
                          <div className="adm-td-cell adm-cell-pos">
                            <span>{roleLabel}</span>
                          </div>

                          {/* 4. Departamento */}
                          <div className="adm-td-cell adm-cell-dept">
                            <span>{department}</span>
                          </div>

                          {/* 5. Correo */}
                          <div className="adm-td-cell adm-cell-email">
                            <span>{u.email}</span>
                          </div>

                          {/* 6. Teléfono */}
                          <div className="adm-td-cell adm-cell-phone">
                            <span>{phone}</span>
                          </div>

                          {/* 7. Estado (Badge) */}
                          <div className="adm-td-cell adm-cell-status">
                            <span className={`adm-status-pill-badge ${u.activo ? 'active' : 'inactive'}`}>
                              {u.activo ? 'Activo' : 'Inactivo'}
                            </span>
                          </div>

                          {/* 8. Acciones (Editar y Papelera/Toggle) */}
                          <div className="adm-td-cell adm-cell-actions" onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              className="adm-icon-action-btn edit"
                              onClick={e => openEditModal(u, e)}
                              title="Editar rol y cuenta"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              className="adm-icon-action-btn delete"
                              disabled={busyId === u.id}
                              onClick={e => toggleUserActive(u, e)}
                              title={u.activo ? 'Desactivar usuario' : 'Activar usuario'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* ── Acordeón Expandido (Drawer como en el diseño de referencia) ── */}
                        {isExpanded && (
                          <div className="adm-user-accordion-drawer">
                            <div className="adm-accordion-grid">
                              {/* 1. Office Location */}
                              <div className="adm-acc-col">
                                <span className="adm-acc-title">Sede / Ubicación</span>
                                <div className="adm-acc-value-box">
                                  <MapPin size={15} className="adm-acc-icon" />
                                  <span>Campus El Jardín, UNAB, Bucaramanga</span>
                                </div>
                              </div>

                              {/* 2. Team Mates */}
                              <div className="adm-acc-col">
                                <span className="adm-acc-title">Equipo Clínico</span>
                                <div className="adm-acc-value-box">
                                  <Users size={15} className="adm-acc-icon" />
                                  <span>Rotación Hospitalaria · Simulación</span>
                                </div>
                              </div>

                              {/* 3. Birthday / Registro */}
                              <div className="adm-acc-col">
                                <span className="adm-acc-title">Fecha de Registro</span>
                                <div className="adm-acc-value-box">
                                  <Calendar size={15} className="adm-acc-icon" />
                                  <span>{u.email_verified ? 'Verificado · Activo' : 'Pendiente de validación'}</span>
                                </div>
                              </div>

                              {/* 4. HR Year */}
                              <div className="adm-acc-col">
                                <span className="adm-acc-title">Nivel Formativo</span>
                                <div className="adm-acc-value-box">
                                  <Award size={15} className="adm-acc-icon" />
                                  <span>{u.role === 'STUDENT' ? 'Pregrado Clínico' : u.role === 'TEACHER' ? 'Docencia Titular' : 'Gestión Global'}</span>
                                </div>
                              </div>

                              {/* 5. Address / Buzón */}
                              <div className="adm-acc-col">
                                <span className="adm-acc-title">Buzón Institucional</span>
                                <div className="adm-acc-value-box">
                                  <Compass size={15} className="adm-acc-icon" />
                                  <span>{u.username}@clerk-ship.online</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Modal de Agregar Usuario ── */}
      {showAddModal && (
        <div className="adm-modal-backdrop" onClick={() => setShowAddModal(false)}>
          <div className="adm-modal-card" onClick={e => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h2 className="adm-modal-title">Agregar Nuevo Usuario</h2>
              <button type="button" className="adm-modal-close" onClick={() => setShowAddModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="adm-modal-form">
              {modalError && (
                <div className="adm-banner-alert error">
                  <AlertCircle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="adm-form-row-2">
                <div className="adm-form-group">
                  <label className="adm-form-label">Nombre</label>
                  <input
                    type="text"
                    required
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder="Ej. Ana María"
                    className="adm-modal-input"
                  />
                </div>
                <div className="adm-form-group">
                  <label className="adm-form-label">Apellidos</label>
                  <input
                    type="text"
                    required
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder="Ej. Gómez Plata"
                    className="adm-modal-input"
                  />
                </div>
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Correo Institucional</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="usuario@unab.edu.co"
                  className="adm-modal-input"
                />
              </div>

              <div className="adm-form-row-2">
                <div className="adm-form-group">
                  <label className="adm-form-label">Rol en la Plataforma</label>
                  <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as any)}
                    className="adm-modal-select"
                  >
                    <option value="STUDENT">Estudiante de Medicina</option>
                    <option value="TEACHER">Docente · Preceptor</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                </div>

                {newRole === 'STUDENT' ? (
                  <div className="adm-form-group">
                    <label className="adm-form-label">Código Estudiante (Inicia con U00)</label>
                    <input
                      type="text"
                      required
                      value={newStudentCode}
                      onChange={e => setNewStudentCode(e.target.value)}
                      placeholder="U00123456"
                      className="adm-modal-input"
                    />
                  </div>
                ) : (
                  <div className="adm-form-group">
                    <label className="adm-form-label">Departamento</label>
                    <input
                      type="text"
                      disabled
                      value={newRole === 'TEACHER' ? 'Educación Médica' : 'Administración'}
                      className="adm-modal-input disabled"
                    />
                  </div>
                )}
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Contraseña Inicial</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="adm-modal-input"
                />
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-modal-btn cancel"
                  onClick={() => setShowAddModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="adm-modal-btn submit"
                >
                  {modalSubmitting ? 'Guardando…' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal de Edición de Usuario ── */}
      {editingUser && (
        <div className="adm-modal-backdrop" onClick={() => setEditingUser(null)}>
          <div className="adm-modal-card" onClick={e => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h2 className="adm-modal-title">Editar Usuario</h2>
              <button type="button" className="adm-modal-close" onClick={() => setEditingUser(null)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="adm-modal-form">
              {modalError && (
                <div className="adm-banner-alert error">
                  <AlertCircle size={15} />
                  <span>{modalError}</span>
                </div>
              )}

              <div className="adm-modal-user-summary">
                <img src={formatUserAvatar(editingUser)} alt={editingUser.first_name} className="adm-modal-user-avatar" />
                <div>
                  <h3 className="adm-modal-user-name">{editingUser.first_name} {editingUser.last_name}</h3>
                  <span className="adm-modal-user-sub">{editingUser.email}</span>
                </div>
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Rol en el Sistema</label>
                <select
                  value={editRole}
                  onChange={e => setEditRole(e.target.value)}
                  className="adm-modal-select"
                >
                  <option value="STUDENT">Estudiante de Medicina (STUDENT)</option>
                  <option value="TEACHER">Docente · Preceptor (TEACHER)</option>
                  <option value="ADMIN">Administrador (ADMIN)</option>
                </select>
              </div>

              <div className="adm-form-group">
                <label className="adm-form-label">Estado de la Cuenta</label>
                <select
                  value={editActivo ? 'true' : 'false'}
                  onChange={e => setEditActivo(e.target.value === 'true')}
                  className="adm-modal-select"
                >
                  <option value="true">Activo (Habilitado para ingresar)</option>
                  <option value="false">Inactivo (Acceso suspendido)</option>
                </select>
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-modal-btn cancel"
                  onClick={() => setEditingUser(null)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="adm-modal-btn submit"
                >
                  {modalSubmitting ? 'Guardando…' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
