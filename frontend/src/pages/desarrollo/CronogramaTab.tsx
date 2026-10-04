import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Flag, Clock, Filter, Layers, Eye, EyeOff, ChevronDown, Check,
  CheckCircle2, AlertTriangle, Lock,
  ChevronLeft, ChevronRight, X, GitCommit, GitBranch, ShieldCheck, Pencil, Trash2
} from 'lucide-react';
import {
  subscribeEvidenceMap, saveEvidence, removeEvidence, subscribeCompletedMap, setCompleted,
} from '../../data/repoEvidence';
import type { RepoEvidence } from '../../data/repoEvidence';
import { fetchBranches, fetchCommits, githubFetchErrorMessage } from '../../data/githubApi';
import type { GitHubBranch, GitHubCommit } from '../../data/githubApi';
import { CATEGORIES, CRONOGRAMA_DATA } from '../../data/cronogramaActivities';
import type { CategoryId, ActivityItem } from '../../data/cronogramaActivities';
import { subscribeCuestionarioAnswers } from '../../data/cuestionarioStore';
import { REPOS, getReposForCategory } from '../../data/repos';
import { authenticateMember, authErrorMessage, isFirstLogin, setNewPassword, validateNewPassword } from '../../data/devAuth';
import { TEAM_MEMBERS } from '../../data/teamData';
import NewPasswordFields from '../../components/shared/NewPasswordFields';

/* ══════════════════════════════════════════════════════
   View Modes (Right Dropdown)
══════════════════════════════════════════════════════ */
type ViewModeId = 'predeterminado' | 'semana' | 'mes';

interface ViewOption {
  id: ViewModeId;
  label: string;
  desc: string;
}

const VIEW_OPTIONS: ViewOption[] = [
  { id: 'predeterminado', label: 'Predeterminado', desc: 'Vista Gantt general de 14 semanas' },
  { id: 'semana',         label: 'Por Semana',     desc: 'Calendario semanal por días con entregas' },
  { id: 'mes',            label: 'Por Mes',        desc: 'Calendario mensual interactivo (Google Calendar)' },
];

/* ══════════════════════════════════════════════════════
   Timeline Grid Columns (17 Ago - 24 Nov 2026 = 14 semanas)
══════════════════════════════════════════════════════ */
const MONTHS = [
  { name: 'AGOSTO',     weeks: [3, 4] },
  { name: 'SEPTIEMBRE', weeks: [1, 2, 3, 4] },
  { name: 'OCTUBRE',    weeks: [1, 2, 3, 4] },
  { name: 'NOVIEMBRE',  weeks: [1, 2, 3, 4] },
];

const WEEKS_DETAIL = [
  { num: 1,  label: 'S1',  range: '17-23 ago' },
  { num: 2,  label: 'S2',  range: '24-30 ago' },
  { num: 3,  label: 'S3',  range: '31 ago-6 sep' },
  { num: 4,  label: 'S4',  range: '7-13 sep' },
  { num: 5,  label: 'S5',  range: '14-20 sep' },
  { num: 6,  label: 'S6',  range: '21-27 sep' },
  { num: 7,  label: 'S7',  range: '28 sep-4 oct' },
  { num: 8,  label: 'S8',  range: '5-11 oct' },
  { num: 9,  label: 'S9',  range: '12-18 oct' },
  { num: 10, label: 'S10', range: '19-25 oct' },
  { num: 11, label: 'S11', range: '26 oct-1 nov' },
  { num: 12, label: 'S12', range: '2-8 nov' },
  { num: 13, label: 'S13', range: '9-15 nov' },
  { num: 14, label: 'S14', range: '16-24 nov' },
];

interface WeekDayInfo {
  dayName: string;
  dayNum: number;
  monthName: string;
  fullDateStr: string;
}

const WEEKS_CALENDAR_DAYS: Record<number, WeekDayInfo[]> = {
  1: [
    { dayName: 'Lunes',     dayNum: 17, monthName: 'ago', fullDateStr: '17 ago' },
    { dayName: 'Martes',    dayNum: 18, monthName: 'ago', fullDateStr: '18 ago' },
    { dayName: 'Miércoles', dayNum: 19, monthName: 'ago', fullDateStr: '19 ago' },
    { dayName: 'Jueves',    dayNum: 20, monthName: 'ago', fullDateStr: '20 ago' },
    { dayName: 'Viernes',   dayNum: 21, monthName: 'ago', fullDateStr: '21 ago' },
    { dayName: 'Sábado',    dayNum: 22, monthName: 'ago', fullDateStr: '22 ago' },
    { dayName: 'Domingo',   dayNum: 23, monthName: 'ago', fullDateStr: '23 ago' },
  ],
  2: [
    { dayName: 'Lunes',     dayNum: 24, monthName: 'ago', fullDateStr: '24 ago' },
    { dayName: 'Martes',    dayNum: 25, monthName: 'ago', fullDateStr: '25 ago' },
    { dayName: 'Miércoles', dayNum: 26, monthName: 'ago', fullDateStr: '26 ago' },
    { dayName: 'Jueves',    dayNum: 27, monthName: 'ago', fullDateStr: '27 ago' },
    { dayName: 'Viernes',   dayNum: 28, monthName: 'ago', fullDateStr: '28 ago' },
    { dayName: 'Sábado',    dayNum: 29, monthName: 'ago', fullDateStr: '29 ago' },
    { dayName: 'Domingo',   dayNum: 30, monthName: 'ago', fullDateStr: '30 ago' },
  ],
  3: [
    { dayName: 'Lunes',     dayNum: 31, monthName: 'ago', fullDateStr: '31 ago' },
    { dayName: 'Martes',    dayNum: 1,  monthName: 'sep', fullDateStr: '1 sep' },
    { dayName: 'Miércoles', dayNum: 2,  monthName: 'sep', fullDateStr: '2 sep' },
    { dayName: 'Jueves',    dayNum: 3,  monthName: 'sep', fullDateStr: '3 sep' },
    { dayName: 'Viernes',   dayNum: 4,  monthName: 'sep', fullDateStr: '4 sep' },
    { dayName: 'Sábado',    dayNum: 5,  monthName: 'sep', fullDateStr: '5 sep' },
    { dayName: 'Domingo',   dayNum: 6,  monthName: 'sep', fullDateStr: '6 sep' },
  ],
  4: [
    { dayName: 'Lunes',     dayNum: 7,  monthName: 'sep', fullDateStr: '7 sep' },
    { dayName: 'Martes',    dayNum: 8,  monthName: 'sep', fullDateStr: '8 sep' },
    { dayName: 'Miércoles', dayNum: 9,  monthName: 'sep', fullDateStr: '9 sep' },
    { dayName: 'Jueves',    dayNum: 10, monthName: 'sep', fullDateStr: '10 sep' },
    { dayName: 'Viernes',   dayNum: 11, monthName: 'sep', fullDateStr: '11 sep' },
    { dayName: 'Sábado',    dayNum: 12, monthName: 'sep', fullDateStr: '12 sep' },
    { dayName: 'Domingo',   dayNum: 13, monthName: 'sep', fullDateStr: '13 sep' },
  ],
  5: [
    { dayName: 'Lunes',     dayNum: 14, monthName: 'sep', fullDateStr: '14 sep' },
    { dayName: 'Martes',    dayNum: 15, monthName: 'sep', fullDateStr: '15 sep' },
    { dayName: 'Miércoles', dayNum: 16, monthName: 'sep', fullDateStr: '16 sep' },
    { dayName: 'Jueves',    dayNum: 17, monthName: 'sep', fullDateStr: '17 sep' },
    { dayName: 'Viernes',   dayNum: 18, monthName: 'sep', fullDateStr: '18 sep' },
    { dayName: 'Sábado',    dayNum: 19, monthName: 'sep', fullDateStr: '19 sep' },
    { dayName: 'Domingo',   dayNum: 20, monthName: 'sep', fullDateStr: '20 sep' },
  ],
  6: [
    { dayName: 'Lunes',     dayNum: 21, monthName: 'sep', fullDateStr: '21 sep' },
    { dayName: 'Martes',    dayNum: 22, monthName: 'sep', fullDateStr: '22 sep' },
    { dayName: 'Miércoles', dayNum: 23, monthName: 'sep', fullDateStr: '23 sep' },
    { dayName: 'Jueves',    dayNum: 24, monthName: 'sep', fullDateStr: '24 sep' },
    { dayName: 'Viernes',   dayNum: 25, monthName: 'sep', fullDateStr: '25 sep' },
    { dayName: 'Sábado',    dayNum: 26, monthName: 'sep', fullDateStr: '26 sep' },
    { dayName: 'Domingo',   dayNum: 27, monthName: 'sep', fullDateStr: '27 sep' },
  ],
  7: [
    { dayName: 'Lunes',     dayNum: 28, monthName: 'sep', fullDateStr: '28 sep' },
    { dayName: 'Martes',    dayNum: 29, monthName: 'sep', fullDateStr: '29 sep' },
    { dayName: 'Miércoles', dayNum: 30, monthName: 'sep', fullDateStr: '30 sep' },
    { dayName: 'Jueves',    dayNum: 1,  monthName: 'oct', fullDateStr: '1 oct' },
    { dayName: 'Viernes',   dayNum: 2,  monthName: 'oct', fullDateStr: '2 oct' },
    { dayName: 'Sábado',    dayNum: 3,  monthName: 'oct', fullDateStr: '3 oct' },
    { dayName: 'Domingo',   dayNum: 4,  monthName: 'oct', fullDateStr: '4 oct' },
  ],
  8: [
    { dayName: 'Lunes',     dayNum: 5,  monthName: 'oct', fullDateStr: '5 oct' },
    { dayName: 'Martes',    dayNum: 6,  monthName: 'oct', fullDateStr: '6 oct' },
    { dayName: 'Miércoles', dayNum: 7,  monthName: 'oct', fullDateStr: '7 oct' },
    { dayName: 'Jueves',    dayNum: 8,  monthName: 'oct', fullDateStr: '8 oct' },
    { dayName: 'Viernes',   dayNum: 9,  monthName: 'oct', fullDateStr: '9 oct' },
    { dayName: 'Sábado',    dayNum: 10, monthName: 'oct', fullDateStr: '10 oct' },
    { dayName: 'Domingo',   dayNum: 11, monthName: 'oct', fullDateStr: '11 oct' },
  ],
  9: [
    { dayName: 'Lunes',     dayNum: 12, monthName: 'oct', fullDateStr: '12 oct' },
    { dayName: 'Martes',    dayNum: 13, monthName: 'oct', fullDateStr: '13 oct' },
    { dayName: 'Miércoles', dayNum: 14, monthName: 'oct', fullDateStr: '14 oct' },
    { dayName: 'Jueves',    dayNum: 15, monthName: 'oct', fullDateStr: '15 oct' },
    { dayName: 'Viernes',   dayNum: 16, monthName: 'oct', fullDateStr: '16 oct' },
    { dayName: 'Sábado',    dayNum: 17, monthName: 'oct', fullDateStr: '17 oct' },
    { dayName: 'Domingo',   dayNum: 18, monthName: 'oct', fullDateStr: '18 oct' },
  ],
  10: [
    { dayName: 'Lunes',     dayNum: 19, monthName: 'oct', fullDateStr: '19 oct' },
    { dayName: 'Martes',    dayNum: 20, monthName: 'oct', fullDateStr: '20 oct' },
    { dayName: 'Miércoles', dayNum: 21, monthName: 'oct', fullDateStr: '21 oct' },
    { dayName: 'Jueves',    dayNum: 22, monthName: 'oct', fullDateStr: '22 oct' },
    { dayName: 'Viernes',   dayNum: 23, monthName: 'oct', fullDateStr: '23 oct' },
    { dayName: 'Sábado',    dayNum: 24, monthName: 'oct', fullDateStr: '24 oct' },
    { dayName: 'Domingo',   dayNum: 25, monthName: 'oct', fullDateStr: '25 oct' },
  ],
  11: [
    { dayName: 'Lunes',     dayNum: 26, monthName: 'oct', fullDateStr: '26 oct' },
    { dayName: 'Martes',    dayNum: 27, monthName: 'oct', fullDateStr: '27 oct' },
    { dayName: 'Miércoles', dayNum: 28, monthName: 'oct', fullDateStr: '28 oct' },
    { dayName: 'Jueves',    dayNum: 29, monthName: 'oct', fullDateStr: '29 oct' },
    { dayName: 'Viernes',   dayNum: 30, monthName: 'oct', fullDateStr: '30 oct' },
    { dayName: 'Sábado',    dayNum: 31, monthName: 'oct', fullDateStr: '31 oct' },
    { dayName: 'Domingo',   dayNum: 1,  monthName: 'nov', fullDateStr: '1 nov' },
  ],
  12: [
    { dayName: 'Lunes',     dayNum: 2,  monthName: 'nov', fullDateStr: '2 nov' },
    { dayName: 'Martes',    dayNum: 3,  monthName: 'nov', fullDateStr: '3 nov' },
    { dayName: 'Miércoles', dayNum: 4,  monthName: 'nov', fullDateStr: '4 nov' },
    { dayName: 'Jueves',    dayNum: 5,  monthName: 'nov', fullDateStr: '5 nov' },
    { dayName: 'Viernes',   dayNum: 6,  monthName: 'nov', fullDateStr: '6 nov' },
    { dayName: 'Sábado',    dayNum: 7,  monthName: 'nov', fullDateStr: '7 nov' },
    { dayName: 'Domingo',   dayNum: 8,  monthName: 'nov', fullDateStr: '8 nov' },
  ],
  13: [
    { dayName: 'Lunes',     dayNum: 9,  monthName: 'nov', fullDateStr: '9 nov' },
    { dayName: 'Martes',    dayNum: 10, monthName: 'nov', fullDateStr: '10 nov' },
    { dayName: 'Miércoles', dayNum: 11, monthName: 'nov', fullDateStr: '11 nov' },
    { dayName: 'Jueves',    dayNum: 12, monthName: 'nov', fullDateStr: '12 nov' },
    { dayName: 'Viernes',   dayNum: 13, monthName: 'nov', fullDateStr: '13 nov' },
    { dayName: 'Sábado',    dayNum: 14, monthName: 'nov', fullDateStr: '14 nov' },
    { dayName: 'Domingo',   dayNum: 15, monthName: 'nov', fullDateStr: '15 nov' },
  ],
  14: [
    { dayName: 'Lunes',     dayNum: 16, monthName: 'nov', fullDateStr: '16 nov' },
    { dayName: 'Martes',    dayNum: 17, monthName: 'nov', fullDateStr: '17 nov' },
    { dayName: 'Miércoles', dayNum: 18, monthName: 'nov', fullDateStr: '18 nov' },
    { dayName: 'Jueves',    dayNum: 19, monthName: 'nov', fullDateStr: '19 nov' },
    { dayName: 'Viernes',   dayNum: 20, monthName: 'nov', fullDateStr: '20 nov' },
    { dayName: 'Sábado',    dayNum: 21, monthName: 'nov', fullDateStr: '21 nov' },
    { dayName: 'Domingo',   dayNum: 22, monthName: 'nov', fullDateStr: '22 nov' },
  ],
};

const MONTH_CALENDARS = [
  { id: 'ago', name: 'AGOSTO',     monthIndex: 8,  startDayOfWeek: 5, totalDays: 31 }, // 5 = Sábado
  { id: 'sep', name: 'SEPTIEMBRE', monthIndex: 9,  startDayOfWeek: 1, totalDays: 30 }, // 1 = Martes
  { id: 'oct', name: 'OCTUBRE',    monthIndex: 10, startDayOfWeek: 3, totalDays: 31 }, // 3 = Jueves
  { id: 'nov', name: 'NOVIEMBRE',  monthIndex: 11, startDayOfWeek: 6, totalDays: 30 }, // 6 = Domingo
];

const isActivityOnDay = (dateLabel: string, dayNum: number, monthName: string): boolean => {
  const label = dateLabel.toLowerCase();
  const month = monthName.toLowerCase();

  if (label.includes('-') && (label.includes('ago') || label.includes('sep') || label.includes('oct') || label.includes('nov'))) {
    if (label.includes('28 ago - 6 sep')) {
      if (month === 'ago' && dayNum >= 28) return true;
      if (month === 'sep' && dayNum <= 6) return true;
      return false;
    }
    if (label.includes('17 ago - 27 ago')) {
      if (month === 'ago' && dayNum >= 17 && dayNum <= 27) return true;
      return false;
    }
    if (label.includes('8 sep - 24 sep')) {
      if (month === 'sep' && dayNum >= 8 && dayNum <= 24) return true;
      return false;
    }
    if (label.includes('28 sep - 8 oct')) {
      if (month === 'sep' && dayNum >= 28) return true;
      if (month === 'oct' && dayNum <= 8) return true;
      return false;
    }
    if (label.includes('13 oct - 30 oct')) {
      if (month === 'oct' && dayNum >= 13 && dayNum <= 30) return true;
      return false;
    }
    if (label.includes('2 nov - 13 nov')) {
      if (month === 'nov' && dayNum >= 2 && dayNum <= 13) return true;
      return false;
    }
    if (label.includes('16 nov - 20 nov')) {
      if (month === 'nov' && dayNum >= 16 && dayNum <= 20) return true;
      return false;
    }
    if (label.includes('2-6 nov')) {
      if (month === 'nov' && dayNum >= 2 && dayNum <= 6) return true;
      return false;
    }
    if (label.includes('13-16 oct')) {
      if (month === 'oct' && dayNum >= 13 && dayNum <= 16) return true;
      return false;
    }
    if (label.includes('28 sep - 16 oct')) {
      if (month === 'sep' && dayNum >= 28) return true;
      if (month === 'oct' && dayNum <= 16) return true;
      return false;
    }
    if (label.includes('19 oct - 6 nov')) {
      if (month === 'oct' && dayNum >= 19) return true;
      if (month === 'nov' && dayNum <= 6) return true;
      return false;
    }
    if (label.includes('9 nov - 20 nov')) {
      if (month === 'nov' && dayNum >= 9 && dayNum <= 20) return true;
      return false;
    }
    if (label.includes('19 oct - 20 nov')) {
      if (month === 'oct' && dayNum >= 19) return true;
      if (month === 'nov' && dayNum <= 20) return true;
      return false;
    }
  }

  if (label.includes(month)) {
    const numMatch = label.match(/\d+/);
    if (numMatch && parseInt(numMatch[0], 10) === dayNum) {
      return true;
    }
  }

  return false;
};



export default function CronogramaTab() {
  const [selectedCat, setSelectedCat] = useState<CategoryId>('general');
  const [selectedView, setSelectedView] = useState<ViewModeId>('predeterminado');
  const [catOpen, setCatOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  // Estados para vista por semana y vista por mes (Google Calendar Style)
  const [activeWeekNum, setActiveWeekNum] = useState<number>(1);
  const [activeMonthIdx, setActiveMonthIdx] = useState<number>(0);

  // Estado para la expansión interactiva de avatares en responsables generales (duración 3s)
  const [activeAvatarId, setActiveAvatarId] = useState<string | null>(null);
  const [avatarTimeoutId, setAvatarTimeoutId] = useState<any>(null);

  const handleAvatarClick = (memberId: string) => {
    if (avatarTimeoutId) {
      clearTimeout(avatarTimeoutId);
    }

    if (activeAvatarId === memberId) {
      setActiveAvatarId(null);
      setAvatarTimeoutId(null);
      return;
    }

    setActiveAvatarId(memberId);
    const timer = setTimeout(() => {
      setActiveAvatarId(null);
      setAvatarTimeoutId(null);
    }, 3000);
    setAvatarTimeoutId(timer);
  };
  const [popover, setPopover] = useState<{
    act: ActivityItem;
    x: number;
    y: number;
    fullDateText: string;
  } | null>(null);

  const handleOpenPopover = (e: React.MouseEvent, act: ActivityItem, dateText: string) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      act,
      x: Math.min(window.innerWidth - 340, Math.max(16, rect.left)),
      y: Math.min(window.innerHeight - 260, rect.bottom + 8),
      fullDateText: dateText,
    });
  };

  // Estado interactivo para marcar actividades entregadas / finalizadas —
  // sincronizado en tiempo real vía Firebase (compartido entre los 4).
  const [completedMap, setCompletedMap] = useState<Record<string, boolean>>({});
  const [evidenceMap, setEvidenceMap] = useState<Record<string, RepoEvidence>>({});
  const [cuestionarioAnswers, setCuestionarioAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const unsubCompleted = subscribeCompletedMap(setCompletedMap);
    const unsubEvidence = subscribeEvidenceMap(setEvidenceMap);
    const unsubAnswers = subscribeCuestionarioAnswers(setCuestionarioAnswers);
    return () => { unsubCompleted(); unsubEvidence(); unsubAnswers(); };
  }, []);

  // ── Modal de Verificación de Entrega (repo + rama + commit + descripción + quién) ──
  const [verifyItemKey, setVerifyItemKey] = useState<string | null>(null);
  const [verifyMode, setVerifyMode] = useState<'complete' | 'revert'>('complete');
  const [verifyRepoId, setVerifyRepoId] = useState('');
  const [verifyRepoOpen, setVerifyRepoOpen] = useState(false);
  const [verifyBranches, setVerifyBranches] = useState<GitHubBranch[]>([]);
  const [verifyBranchesStatus, setVerifyBranchesStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [verifyBranch, setVerifyBranch] = useState('');
  const [verifyBranchOpen, setVerifyBranchOpen] = useState(false);
  const [verifyCommits, setVerifyCommits] = useState<GitHubCommit[]>([]);
  const [verifyCommitsStatus, setVerifyCommitsStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [verifyCommitSha, setVerifyCommitSha] = useState('');
  const [verifyCommitOpen, setVerifyCommitOpen] = useState(false);
  const [verifyDescription, setVerifyDescription] = useState('');
  const [verifyMemberId, setVerifyMemberId] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyErrorMsg, setVerifyErrorMsg] = useState('');
  const [verifyFormError, setVerifyFormError] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  // Flujo en 2 Pasos: Paso 1 (profile) -> Autenticación; Paso 2 (details) -> Formulario de entrega
  const [verifyStep, setVerifyStep] = useState<'profile' | 'details'>('profile');
  const [verifyShowPassword, setVerifyShowPassword] = useState(false);
  // Si la cuenta nunca ha iniciado sesión, se exige cambiar la contraseña
  // temporal antes de dejar continuar con la acción pendiente.
  const [verifyAuthPhase, setVerifyAuthPhase] = useState<'login' | 'newPassword'>('login');
  const [verifyNewPassword1, setVerifyNewPassword1] = useState('');
  const [verifyNewPassword2, setVerifyNewPassword2] = useState('');

  // Tooltip flotante siguiendo al cursor para entregas confirmadas
  const [cursorTooltip, setCursorTooltip] = useState<{
    show: boolean;
    x: number;
    y: number;
    text: string;
  }>({ show: false, x: 0, y: 0, text: '' });

  // Modal de Detalles de Entrega Confirmada (muestra la metadata guardada en Firebase)
  const [detailsItemKey, setDetailsItemKey] = useState<string | null>(null);

  const handleCompletedHover = (e: React.MouseEvent, isCompleted: boolean) => {
    if (isCompleted) {
      setCursorTooltip({ show: true, x: e.clientX, y: e.clientY, text: 'Click para ver detalles 🔍' });
    }
  };

  const handleCompletedMove = (e: React.MouseEvent, isCompleted: boolean) => {
    if (isCompleted) {
      setCursorTooltip((prev) => ({ ...prev, show: true, x: e.clientX, y: e.clientY }));
    }
  };

  const handleCompletedLeave = () => {
    setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
  };

  // ── Modal de Edición / Eliminación de Entrega Confirmada ──
  const [editItemKey, setEditItemKey] = useState<string | null>(null);
  const [editStep, setEditStep] = useState<'auth' | 'edit' | 'deleteConfirm'>('auth');
  const [editPassword, setEditPassword] = useState('');
  const [editShowPassword, setEditShowPassword] = useState(false);
  const [editFormError, setEditFormError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Campos de edición
  const [editRepoId, setEditRepoId] = useState('');
  const [editRepoOpen, setEditRepoOpen] = useState(false);
  const [editBranches, setEditBranches] = useState<GitHubBranch[]>([]);
  const [editBranchesStatus, setEditBranchesStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [editBranch, setEditBranch] = useState('');
  const [editBranchOpen, setEditBranchOpen] = useState(false);
  const [editCommits, setEditCommits] = useState<GitHubCommit[]>([]);
  const [editCommitsStatus, setEditCommitsStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [editCommitSha, setEditCommitSha] = useState('');
  const [editCommitOpen, setEditCommitOpen] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editErrorMsg, setEditErrorMsg] = useState('');

  // Campo para la confirmación de fecha de eliminación
  const [deleteDateInput, setDeleteDateInput] = useState('');

  const openEditModal = (itemKey: string) => {
    const evidence = evidenceMap[itemKey];
    setEditItemKey(itemKey);
    setEditStep('auth');
    setEditPassword('');
    setEditShowPassword(false);
    setEditFormError('');
    setEditSubmitting(false);

    setEditRepoId(evidence?.repoId || 'clerkship');
    setEditBranch(evidence?.branch || '');
    setEditCommitSha(evidence?.sha || '');
    setEditDescription(evidence?.description || '');
    setDeleteDateInput('');
  };

  const handleEditAuth = async () => {
    if (!editItemKey) return;
    const evidence = evidenceMap[editItemKey];

    const publisherMember = TEAM_MEMBERS.find((m) =>
      evidence?.registeredBy && (
        evidence.registeredBy.toLowerCase().includes(m.id) ||
        evidence.registeredBy.toLowerCase().includes(m.name.split(' ')[0].toLowerCase())
      )
    );

    if (!publisherMember) {
      setEditFormError(`No se pudo identificar la cuenta del autor "${evidence?.registeredBy || ''}".`);
      return;
    }

    if (!editPassword) {
      setEditFormError(`Ingresa la contraseña del perfil de ${publisherMember.name}.`);
      return;
    }

    setEditSubmitting(true);
    setEditFormError('');

    try {
      await authenticateMember(publisherMember.id, editPassword);
      setEditStep('edit');
    } catch (err) {
      setEditFormError(authErrorMessage(err));
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleStep1Auth = async () => {
    if (!verifyMemberId) {
      setVerifyFormError('Selecciona tu perfil de Mente Maestra para continuar.');
      return;
    }
    if (!verifyPassword) {
      setVerifyFormError('Ingresa tu contraseña para continuar.');
      return;
    }

    setVerifySubmitting(true);
    setVerifyFormError('');

    try {
      const user = await authenticateMember(verifyMemberId, verifyPassword);
      if (isFirstLogin(user)) {
        setVerifyAuthPhase('newPassword');
      } else {
        setVerifyStep('details');
      }
    } catch (err) {
      setVerifyFormError(authErrorMessage(err));
    } finally {
      setVerifySubmitting(false);
    }
  };

  const toggleCompleted = (actId: string) => {
    const act = activities.find(a => a.id === actId);
    if (act?.type === 'ulibro') return; // Bloqueado, no se altera estado

    const key = `${selectedCat}-${actId}`;
    const willComplete = !completedMap[key];

    const allowedRepos = getReposForCategory(selectedCat);
    setVerifyItemKey(key);
    setVerifyMode(willComplete ? 'complete' : 'revert');
    setVerifyStep('profile');
    setVerifyShowPassword(false);
    setVerifyRepoId(allowedRepos.length === 1 ? allowedRepos[0].id : '');
    setVerifyRepoOpen(false);
    setVerifyBranch('');
    setVerifyCommits([]);
    setVerifyCommitsStatus('idle');
    setVerifyCommitSha('');
    setVerifyDescription('');
    setVerifyMemberId('');
    setVerifyPassword('');
    setVerifyFormError('');
    setVerifyBranchOpen(false);
    setVerifyCommitOpen(false);
    setVerifyAuthPhase('login');
    setVerifyNewPassword1('');
    setVerifyNewPassword2('');
  };

  const closeVerifyModal = () => {
    setVerifyItemKey(null);
    setVerifyStep('profile');
    setVerifyShowPassword(false);
    setVerifyRepoOpen(false);
    setVerifyBranchOpen(false);
    setVerifyCommitOpen(false);
    setVerifyAuthPhase('login');
    setVerifyNewPassword1('');
    setVerifyNewPassword2('');
  };

  // Carga las ramas al abrir el modal, una vez se sabe el repo (solo hace falta al marcar como entregado)
  useEffect(() => {
    if (!verifyItemKey || verifyMode !== 'complete' || !verifyRepoId) return;
    const repo = REPOS.find((r) => r.id === verifyRepoId);
    if (!repo) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-open loading flag, guarded by `cancelled`
    setVerifyBranchesStatus('loading');
    setVerifyBranch('');
    fetchBranches(repo)
      .then((data) => {
        if (cancelled) return;
        setVerifyBranches(data);
        setVerifyBranchesStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setVerifyBranchesStatus('error');
        setVerifyErrorMsg(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [verifyItemKey, verifyMode, verifyRepoId]);

  // Carga los commits cada vez que cambia la rama seleccionada dentro del modal
  useEffect(() => {
    if (!verifyItemKey || verifyMode !== 'complete' || !verifyRepoId || !verifyBranch) return;
    const repo = REPOS.find((r) => r.id === verifyRepoId);
    if (!repo) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-branch-change loading flag, guarded by `cancelled`
    setVerifyCommitsStatus('loading');
    setVerifyCommitSha('');
    fetchCommits(repo, verifyBranch, 100)
      .then((data) => {
        if (cancelled) return;
        setVerifyCommits(data);
        setVerifyCommitsStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setVerifyCommitsStatus('error');
        setVerifyErrorMsg(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [verifyItemKey, verifyMode, verifyRepoId, verifyBranch]);

  // Carga las ramas al cambiar repo en la edición
  useEffect(() => {
    if (!editItemKey || editStep !== 'edit' || !editRepoId) return;
    const repo = REPOS.find((r) => r.id === editRepoId);
    if (!repo) return;

    let cancelled = false;
    setEditBranchesStatus('loading');
    fetchBranches(repo)
      .then((data) => {
        if (cancelled) return;
        setEditBranches(data);
        setEditBranchesStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setEditBranchesStatus('error');
        setEditErrorMsg(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [editItemKey, editStep, editRepoId]);

  // Carga los commits al cambiar la rama en la edición
  useEffect(() => {
    if (!editItemKey || editStep !== 'edit' || !editRepoId || !editBranch) return;
    const repo = REPOS.find((r) => r.id === editRepoId);
    if (!repo) return;

    let cancelled = false;
    setEditCommitsStatus('loading');
    fetchCommits(repo, editBranch, 100)
      .then((data) => {
        if (cancelled) return;
        setEditCommits(data);
        setEditCommitsStatus('ok');
      })
      .catch((err) => {
        if (cancelled) return;
        setEditCommitsStatus('error');
        setEditErrorMsg(githubFetchErrorMessage(err));
      });
    return () => { cancelled = true; };
  }, [editItemKey, editStep, editRepoId, editBranch]);

  const handleSaveEdit = async () => {
    if (!editItemKey) return;
    const commit = editCommits.find((c) => c.sha === editCommitSha);

    const dashIdx = editItemKey.indexOf('-');
    const catId = editItemKey.slice(0, dashIdx) as CategoryId;
    const actId = editItemKey.slice(dashIdx + 1);
    const act = (CRONOGRAMA_DATA[catId] || []).find((a) => a.id === actId);
    const cat = CATEGORIES.find((c) => c.id === catId);
    const existingEvidence = evidenceMap[editItemKey];

    setEditSubmitting(true);
    setEditFormError('');

    try {
      await saveEvidence(editItemKey, {
        repoId: editRepoId,
        sha: commit ? commit.sha : (existingEvidence?.sha || editCommitSha),
        shortSha: commit ? commit.sha.slice(0, 7) : (existingEvidence?.shortSha || editCommitSha.slice(0, 7)),
        branch: editBranch || existingEvidence?.branch || 'main',
        message: commit ? commit.commit.message.split('\n')[0] : (existingEvidence?.message || 'Commit editado'),
        htmlUrl: commit ? commit.html_url : (existingEvidence?.htmlUrl || `https://github.com/Steven08Ar/Clerkship/commit/${editCommitSha}`),
        author: commit ? commit.commit.author.name : (existingEvidence?.author || existingEvidence?.registeredBy || 'Mente Maestra'),
        date: commit ? commit.commit.author.date : (existingEvidence?.date || new Date().toISOString()),
        milestoneLabel: act ? `${cat?.label} — ${act.id}` : (existingEvidence?.milestoneLabel || 'Hito'),
        description: editDescription.trim(),
        registeredBy: existingEvidence?.registeredBy || 'Mente Maestra',
        taggedAt: existingEvidence?.taggedAt || new Date().toISOString(),
      });

      setEditItemKey(null);
      setDetailsItemKey(null);
    } catch (err) {
      setEditFormError('Error al guardar los cambios de la entrega.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!editItemKey) return;

    const dashIdx = editItemKey.indexOf('-');
    const catId = editItemKey.slice(0, dashIdx) as CategoryId;
    const actId = editItemKey.slice(dashIdx + 1);
    const act = (CRONOGRAMA_DATA[catId] || []).find((a) => a.id === actId);

    if (!act) return;

    if (deleteDateInput.trim().toLowerCase() !== act.dateLabel.trim().toLowerCase()) {
      setEditFormError(`La fecha ingresada "${deleteDateInput}" no coincide exactamente con "${act.dateLabel}".`);
      return;
    }

    setEditSubmitting(true);
    setEditFormError('');

    try {
      await removeEvidence(editItemKey);
      await setCompleted(editItemKey, false);
      setEditItemKey(null);
      setDetailsItemKey(null);
    } catch (err) {
      setEditFormError('Error al eliminar la entrega de Firebase.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const performVerifyWrite = async () => {
    if (!verifyItemKey) return;

    if (verifyMode === 'complete') {
      const commit = verifyCommits.find((c) => c.sha === verifyCommitSha);
      if (!commit) {
        setVerifyFormError('El commit seleccionado ya no está disponible, elige otro.');
        return;
      }

      const dashIdx = verifyItemKey.indexOf('-');
      const catId = verifyItemKey.slice(0, dashIdx) as CategoryId;
      const actId = verifyItemKey.slice(dashIdx + 1);
      const act = (CRONOGRAMA_DATA[catId] || []).find((a) => a.id === actId);
      const cat = CATEGORIES.find((c) => c.id === catId);
      const member = TEAM_MEMBERS.find((m) => m.id === verifyMemberId);

      await saveEvidence(verifyItemKey, {
        repoId: verifyRepoId,
        sha: commit.sha,
        shortSha: commit.sha.slice(0, 7),
        branch: verifyBranch,
        message: commit.commit.message.split('\n')[0],
        htmlUrl: commit.html_url,
        author: commit.commit.author.name,
        date: commit.commit.author.date,
        milestoneLabel: act && cat ? `${cat.label} — ${act.dateLabel}: ${act.title}` : verifyItemKey,
        description: verifyDescription.trim(),
        registeredBy: member?.name || verifyMemberId,
        taggedAt: new Date().toISOString(),
      });
      await setCompleted(verifyItemKey, true);
    } else {
      await setCompleted(verifyItemKey, false);
    }

    closeVerifyModal();
  };

  const handleConfirmVerification = async () => {
    if (!verifyItemKey) return;

    // ── Fase 2: ya autenticado, solo falta fijar la contraseña propia ──
    if (verifyAuthPhase === 'newPassword') {
      const validationError = validateNewPassword(verifyNewPassword1, verifyNewPassword2);
      if (validationError) {
        setVerifyFormError(validationError);
        return;
      }
      setVerifyFormError('');
      setVerifySubmitting(true);
      try {
        await setNewPassword(verifyNewPassword1);
        await performVerifyWrite();
      } catch (err) {
        setVerifyFormError(authErrorMessage(err));
      } finally {
        setVerifySubmitting(false);
      }
      return;
    }

    // ── Fase 1: identificar quién registra el cambio ──
    if (!verifyMemberId) {
      setVerifyFormError('Selecciona quién registra este cambio.');
      return;
    }
    if (!verifyPassword) {
      setVerifyFormError('Ingresa tu contraseña.');
      return;
    }
    if (verifyMode === 'complete') {
      if (!verifyRepoId) {
        setVerifyFormError('Selecciona el repositorio del commit.');
        return;
      }
      if (!verifyBranch || !verifyCommitSha) {
        setVerifyFormError('Selecciona una rama y un commit como evidencia.');
        return;
      }
      if (!verifyDescription.trim()) {
        setVerifyFormError('Escribe una breve descripción de la entrega.');
        return;
      }
    }

    setVerifyFormError('');
    setVerifySubmitting(true);
    try {
      const user = await authenticateMember(verifyMemberId, verifyPassword);
      if (isFirstLogin(user)) {
        // Primera vez que esta cuenta inicia sesión: la contraseña era temporal.
        setVerifyAuthPhase('newPassword');
        return;
      }
      await performVerifyWrite();
    } catch (err) {
      setVerifyFormError(authErrorMessage(err));
    } finally {
      setVerifySubmitting(false);
    }
  };

  const activeCategory = CATEGORIES.find(c => c.id === selectedCat) || CATEGORIES[0];
  const activeView = VIEW_OPTIONS.find(v => v.id === selectedView) || VIEW_OPTIONS[0];
  const activities = CRONOGRAMA_DATA[selectedCat] || [];

  const deliverables = activities.filter(act => act.type !== 'ulibro');
  const completedCount = deliverables.filter(act => completedMap[`${selectedCat}-${act.id}`]).length;
  const totalCount = deliverables.length;
  const progressPercent = Math.round((completedCount / (totalCount || 1)) * 100);

  // Resolving user questionnaire choices dynamically (vía Firebase)
  const resolveTitleWithTech = (act: ActivityItem) => {
    if (!act.title.includes('{tech}')) return act.title;
    const techValue = (act.techPlaceholderKey && cuestionarioAnswers[act.techPlaceholderKey]) || '____';
    return act.title.replace('{tech}', techValue);
  };

  return (
    <div className="crono-wrapper crono-compact-view">
      {/* ── Toolbar Superior con Filtros Izquierda & Derecha ── */}
      <div className="crono-top-toolbar">
        {/* Filtro Izquierdo: Módulo / Categoría */}
        <div className={`crono-dd-wrap ${catOpen ? 'dd-open' : ''}`}>
          <button
            className="crono-dd-trigger"
            onClick={() => { setCatOpen(!catOpen); setViewOpen(false); }}
          >
            <Layers size={16} style={{ color: activeCategory.color }} />
            <span className="crono-dd-text">{activeCategory.label}</span>
            <ChevronDown size={14} className={`crono-dd-chevron ${catOpen ? 'open' : ''}`} />
          </button>

          <AnimatePresence>
            {catOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="crono-dd-menu left"
              >
                <div className="crono-dd-header">SELECCIONAR MÓDULO O VISTA</div>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => { setSelectedCat(cat.id); setCatOpen(false); }}
                    className={`crono-dd-item ${cat.id === selectedCat ? 'active' : ''}`}
                  >
                    <span className="crono-dd-color-dot" style={{ backgroundColor: cat.color }} />
                    <span className="crono-dd-item-label">{cat.label}</span>
                    {cat.id === selectedCat && <Check size={14} className="crono-dd-check" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sección Central: Responsable(s) del Módulo o Equipo General */}
        <div className="crono-responsible-badge">
          {selectedCat === 'general' ? (
            (() => {
              const activeMember = TEAM_MEMBERS.find(m => m.id === activeAvatarId);
              return (
                <div
                  className={`crono-responsible-group ${activeMember ? 'has-active' : ''}`}
                  style={
                    activeMember
                      ? {
                          borderColor: activeMember.color,
                          backgroundColor: `${activeMember.color}1E`,
                          boxShadow: `0 4px 20px ${activeMember.color}45`,
                        }
                      : undefined
                  }
                >
                  <span
                    className="crono-responsible-label"
                    style={activeMember ? { color: activeMember.color } : undefined}
                  >
                    RESPONSABLES:
                  </span>
                  <div className="crono-responsible-avatars">
                    {TEAM_MEMBERS.map((member) => {
                      const isSelected = activeAvatarId === member.id;
                      return (
                        <div key={member.id} className={`crono-avatar-item-wrap ${isSelected ? 'is-active' : ''}`}>
                          <button
                            type="button"
                            className={`crono-avatar-circle ${isSelected ? 'active-pulse' : ''}`}
                            title={`${member.name} (${member.role})`}
                            style={{
                              borderColor: member.color,
                              boxShadow: isSelected ? `0 0 16px ${member.color}99` : `0 0 8px ${member.color}33`,
                              transform: isSelected ? 'scale(1.15)' : undefined,
                            }}
                            onClick={() => handleAvatarClick(member.id)}
                          >
                            <img src={member.avatarUrl} alt={member.name} />
                          </button>

                          <AnimatePresence mode="wait">
                            {isSelected && (
                              <motion.span
                                initial={{ opacity: 0, width: 0, x: -16 }}
                                animate={{ opacity: 1, width: 'auto', x: 0 }}
                                exit={{ opacity: 0, width: 0, x: 16 }}
                                transition={{
                                  duration: 0.35,
                                  ease: [0.25, 1, 0.5, 1],
                                  opacity: { duration: 0.3, ease: 'easeInOut' },
                                  width: { duration: 0.35, ease: [0.25, 1, 0.5, 1] },
                                  x: { duration: 0.35, ease: [0.25, 1, 0.5, 1] },
                                }}
                                className="crono-avatar-expanded-name"
                                style={{ color: member.color }}
                              >
                                {member.name}
                              </motion.span>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            (() => {
              const respMember =
                selectedCat === 'agentes' ? TEAM_MEMBERS.find(m => m.id === 'juan-camilo') :
                selectedCat === 'backend' ? TEAM_MEMBERS.find(m => m.id === 'camilo-bueno') :
                selectedCat === 'frontend' ? TEAM_MEMBERS.find(m => m.id === 'santiago') : null;

              if (!respMember) return null;

              return (
                <div
                  className="crono-responsible-single"
                  style={{ borderColor: `${respMember.color}50`, backgroundColor: `${respMember.color}15` }}
                >
                  <span className="crono-responsible-tag" style={{ color: respMember.color }}>RESPONSABLE:</span>
                  <div
                    className="crono-avatar-circle single"
                    style={{ borderColor: respMember.color, boxShadow: `0 0 12px ${respMember.color}44` }}
                  >
                    <img src={respMember.avatarUrl} alt={respMember.name} />
                  </div>
                  <span className="crono-responsible-name" style={{ color: respMember.color }}>
                    {respMember.name}
                  </span>
                </div>
              );
            })()
          )}
        </div>

        {/* Filtro Derecho: Visualización del Cronograma */}
        <div className={`crono-dd-wrap ${viewOpen ? 'dd-open' : ''}`}>
          <button
            className="crono-dd-trigger"
            onClick={() => { setViewOpen(!viewOpen); setCatOpen(false); }}
          >
            <Eye size={16} />
            <span className="crono-dd-text">Visualización: <strong>{activeView.label}</strong></span>
            <ChevronDown size={14} className={`crono-dd-chevron ${viewOpen ? 'open' : ''}`} />
          </button>

          <AnimatePresence>
            {viewOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="crono-dd-menu right"
              >
                <div className="crono-dd-header">MODO DE VISUALIZACIÓN</div>
                {VIEW_OPTIONS.map(v => (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedView(v.id); setViewOpen(false); }}
                    className={`crono-dd-item ${v.id === selectedView ? 'active' : ''}`}
                  >
                    <div>
                      <div className="crono-dd-item-title">{v.label}</div>
                      <div className="crono-dd-item-sub">{v.desc}</div>
                    </div>
                    {v.id === selectedView && <Check size={14} className="crono-dd-check" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Gantt / Calendar Card Container ── */}
      <motion.div
        key={`${selectedCat}-${selectedView}-${activeWeekNum}-${activeMonthIdx}`}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="crono-gantt-card"
      >
        {/* ══════════════════════════════════════════════════════
           MODO 1: PREDETERMINADO (Gantt Matrix Completo / Feed Móvil)
        ══════════════════════════════════════════════════════ */}
        {selectedView === 'predeterminado' && (
          <>
            {/* Vista Tabla Desktop */}
            <div className="crono-table-overflow crono-desktop-only">
              <div className="crono-table">
                {/* Header Matrix Row 1: Month Groups */}
                <div className="crono-row crono-header-row-top">
                  <div className="crono-col-id icon-col"><Filter size={15} /></div>
                  <div className="crono-col-date">FECHA</div>
                  <div className="crono-col-title">ENTREGA / ACTIVIDAD</div>
                  
                  <div className="crono-months-grid">
                    {MONTHS.map((m, idx) => (
                      <div
                        key={idx}
                        className="crono-month-cell"
                        style={{ gridColumn: `span ${m.weeks.length}` }}
                      >
                        {m.name}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Header Matrix Row 2: Week Numbers */}
                <div className="crono-row crono-header-row-bottom">
                  <div className="crono-col-id">#</div>
                  <div className="crono-col-date">RANGO</div>
                  <div className="crono-col-title">DESCRIPCIÓN TÉCNICA</div>

                  <div className="crono-weeks-grid">
                    {MONTHS.map((m) =>
                      m.weeks.map((w, wIdx) => (
                        <div key={`${m.name}-${wIdx}`} className="crono-week-cell">
                          {w}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Activities Rows */}
                <div className="crono-body">
                  {activities.map((act) => {
                    const itemKey = `${selectedCat}-${act.id}`;
                    const isCompleted = !!completedMap[itemKey];
                    const evidence = evidenceMap[itemKey];
                    const IconComponent = act.icon;

                    let barColor = act.color || activeCategory.color;
                    if (act.type === 'ulibro') barColor = '#F59E0B';
                    if (act.type === 'avance') barColor = '#EF4444';
                    if (act.type === 'candidata' || act.type === 'final') barColor = '#10B981';

                    const titleText = resolveTitleWithTech(act);

                    return (
                      <div
                        key={act.id}
                        className={`crono-row crono-activity-row ${act.type ? `crono-row-${act.type}` : ''} ${isCompleted ? 'is-completed' : ''}`}
                        onClick={() => {
                          if (isCompleted) {
                            setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                            setDetailsItemKey(itemKey);
                          }
                        }}
                        onMouseEnter={(e) => handleCompletedHover(e, isCompleted)}
                        onMouseMove={(e) => handleCompletedMove(e, isCompleted)}
                        onMouseLeave={handleCompletedLeave}
                        style={{ cursor: isCompleted ? 'pointer' : undefined }}
                      >
                        <div className="crono-col-id">{act.id}</div>
                        
                        <div className="crono-col-date">
                          <span className={`crono-date-badge ${act.type ? `badge-${act.type}` : ''} ${isCompleted ? 'badge-completed' : ''}`}>
                            {isCompleted && <Check size={12} style={{ marginRight: 3, display: 'inline-block', verticalAlign: 'middle' }} />}
                            {act.dateLabel}
                          </span>
                        </div>

                        <div className="crono-col-title">
                          <div className="crono-act-icon-box" style={{ color: isCompleted ? '#10B981' : barColor }}>
                            <IconComponent size={15} />
                          </div>
                          <span className={`crono-act-text ${isCompleted ? 'text-completed' : ''}`}>{titleText}</span>

                          {/* Columna de Estado: Commit Sha encima de Entregado */}
                          <div className="crono-status-column" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                            {evidence && (
                              <a
                                href={evidence.htmlUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="crono-evidence-badge"
                                title={`Evidencia: ${evidence.shortSha} en ${evidence.branch} — ${evidence.message}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <GitCommit size={11} />
                                <span>{evidence.shortSha}</span>
                              </a>
                            )}

                            {act.type === 'ulibro' ? (
                              <span className="crono-status-locked-badge">
                                <Lock size={12} />
                                <span>Bloqueado</span>
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  if (isCompleted) {
                                    e.stopPropagation();
                                    setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                                    setDetailsItemKey(itemKey);
                                  } else {
                                    toggleCompleted(act.id);
                                  }
                                }}
                                className={`crono-status-btn ${isCompleted ? 'completed' : 'pending'}`}
                                title={isCompleted ? 'Haz clic para ver detalles de la entrega' : 'Requiere verificación: rama + commit + descripción'}
                              >
                                {isCompleted ? (
                                  <>
                                    <CheckCircle2 size={12} />
                                    <span>Entregado</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock size={12} />
                                    <span>En progreso</span>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Timeline Grid (14 columns) */}
                        <div className="crono-weeks-grid crono-grid-bg">
                          {Array.from({ length: 14 }).map((_, i) => (
                            <div key={i} className="crono-grid-line-cell" />
                          ))}

                          <motion.div
                            className={`crono-pill-bar ${isCompleted ? 'pill-completed' : ''}`}
                            initial={{ opacity: 0, scaleX: 0.2 }}
                            animate={{ opacity: 1, scaleX: 1 }}
                            transition={{ duration: 0.35, ease: 'easeOut' }}
                            style={{
                              gridColumnStart: act.startWeek,
                              gridColumnEnd: `span ${act.duration}`,
                              backgroundColor: isCompleted ? '#10B981' : barColor,
                              boxShadow: isCompleted ? '0 4px 14px rgba(16, 185, 129, 0.45)' : `0 4px 12px ${barColor}35`,
                            }}
                          >
                            <span className="crono-pill-text">
                              {isCompleted && <Check size={12} style={{ marginRight: 4, display: 'inline-block', verticalAlign: 'middle' }} />}
                              {act.dateLabel}
                            </span>
                          </motion.div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Vista Feed de Tarjetas Móviles */}
            <div className="crono-mobile-feed crono-mobile-only">
              {activities.map((act) => {
                const itemKey = `${selectedCat}-${act.id}`;
                const isCompleted = !!completedMap[itemKey];
                const evidence = evidenceMap[itemKey];
                const IconComponent = act.icon;

                let barColor = act.color || activeCategory.color;
                if (act.type === 'ulibro') barColor = '#F59E0B';
                if (act.type === 'avance') barColor = '#EF4444';
                if (act.type === 'candidata' || act.type === 'final') barColor = '#10B981';

                const titleText = resolveTitleWithTech(act);

                return (
                  <div
                    key={act.id}
                    className={`crono-mobile-card ${act.type ? `crono-row-${act.type}` : ''} ${isCompleted ? 'is-completed' : ''}`}
                    style={{ borderLeft: `4px solid ${isCompleted ? '#10B981' : barColor}`, cursor: isCompleted ? 'pointer' : undefined }}
                    onClick={() => {
                      if (isCompleted) {
                        setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                        setDetailsItemKey(itemKey);
                      }
                    }}
                    onMouseEnter={(e) => handleCompletedHover(e, isCompleted)}
                    onMouseMove={(e) => handleCompletedMove(e, isCompleted)}
                    onMouseLeave={handleCompletedLeave}
                  >
                    <div className="crono-mobile-card-top">
                      <span className="crono-mobile-card-num">#{act.id}</span>
                      <span className={`crono-date-badge ${act.type ? `badge-${act.type}` : ''} ${isCompleted ? 'badge-completed' : ''}`}>
                        {isCompleted && <Check size={12} style={{ marginRight: 3, display: 'inline-block', verticalAlign: 'middle' }} />}
                        {act.dateLabel}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="crono-act-icon-box" style={{ color: isCompleted ? '#10B981' : barColor, flexShrink: 0 }}>
                        <IconComponent size={16} />
                      </div>
                      <span className={`crono-mobile-card-title ${isCompleted ? 'text-completed' : ''}`}>
                        {titleText}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                      <div className="crono-status-column" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, marginLeft: 'auto' }}>
                        {evidence && (
                          <a
                            href={evidence.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="crono-evidence-badge"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <GitCommit size={11} />
                            <span>{evidence.shortSha}</span>
                          </a>
                        )}

                        {act.type === 'ulibro' ? (
                          <span className="crono-status-locked-badge">
                            <Lock size={12} />
                            <span>Bloqueado</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              if (isCompleted) {
                                e.stopPropagation();
                                setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                                setDetailsItemKey(itemKey);
                              } else {
                                toggleCompleted(act.id);
                              }
                            }}
                            className={`crono-status-btn ${isCompleted ? 'completed' : 'pending'}`}
                          >
                            {isCompleted ? (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Entregado</span>
                              </>
                            ) : (
                              <>
                                <Clock size={12} />
                                <span>En progreso</span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════════════════
           MODO 2: POR SEMANA (Calendario de 7 Días con Navegación)
        ══════════════════════════════════════════════════════ */}
        {selectedView === 'semana' && (
          <div className="crono-week-view-wrapper">
            {/* Header de Navegación entre Semanas (Título centrado + Íconos sin texto) */}
            <div className="crono-cal-nav">
              <button
                type="button"
                className="crono-cal-nav-btn crono-icon-only-btn"
                disabled={activeWeekNum <= 1}
                onClick={() => setActiveWeekNum(w => Math.max(1, w - 1))}
                aria-label="Semana anterior"
              >
                <ChevronLeft size={18} />
              </button>

              <div className="crono-cal-title-wrap">
                <h3 className="crono-cal-main-title">
                  Semana {activeWeekNum}
                </h3>
                <div className="crono-cal-sub-title">
                  ({(WEEKS_DETAIL[activeWeekNum - 1]?.range || '').replace('ago', 'Ago').replace('sep', 'Sep').replace('oct', 'Oct').replace('nov', 'Nov').replace('-', ' - ')} 2026)
                </div>
              </div>

              <button
                type="button"
                className="crono-cal-nav-btn crono-icon-only-btn"
                disabled={activeWeekNum >= 14}
                onClick={() => setActiveWeekNum(w => Math.min(14, w + 1))}
                aria-label="Semana siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Fila de Accesos Rápidos a Semanas (S1 - S14) */}
            <div className="crono-week-pills-row">
              {WEEKS_DETAIL.map(wk => (
                <button
                  key={wk.num}
                  type="button"
                  onClick={() => setActiveWeekNum(wk.num)}
                  className={`crono-week-pill-btn ${wk.num === activeWeekNum ? 'active' : ''}`}
                >
                  {wk.label} ({wk.range})
                </button>
              ))}
            </div>

            {/* Grid de 7 Días de la Semana Seleccionada (Desktop) */}
            <div className="crono-week-days-grid crono-desktop-only">
              {(WEEKS_CALENDAR_DAYS[activeWeekNum] || []).map(day => {
                const dayActivities = activities.filter(act =>
                  isActivityOnDay(act.dateLabel, day.dayNum, day.monthName)
                );

                return (
                  <div key={`${day.dayNum}-${day.monthName}`} className="crono-week-day-col">
                    <div className="crono-week-day-header">
                      <div className="crono-week-day-name">{day.dayName}</div>
                      <div className="crono-week-day-number">{day.dayNum} {day.monthName}</div>
                    </div>

                    <div className="crono-week-day-body">
                      {dayActivities.length === 0 ? (
                        <div className="crono-empty-day-slot">Sin entregas</div>
                      ) : (
                        dayActivities.map(act => {
                          const itemKey = `${selectedCat}-${act.id}`;
                          const isCompleted = !!completedMap[itemKey];
                          const IconComponent = act.icon;

                          let badgeColor = act.color || activeCategory.color;
                          if (act.type === 'ulibro') badgeColor = '#F59E0B';
                          if (act.type === 'avance') badgeColor = '#EF4444';
                          if (act.type === 'candidata' || act.type === 'final') badgeColor = '#10B981';

                          const titleText = resolveTitleWithTech(act);

                          return (
                            <motion.div
                              key={act.id}
                              whileHover={{ scale: 1.02 }}
                              onClick={(e) => {
                                if (isCompleted) {
                                  e.stopPropagation();
                                  setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                                  setDetailsItemKey(itemKey);
                                } else {
                                  handleOpenPopover(e, act, `${day.dayName} ${day.dayNum} ${day.monthName} 2026`);
                                }
                              }}
                              onMouseEnter={(e) => handleCompletedHover(e, isCompleted)}
                              onMouseMove={(e) => handleCompletedMove(e, isCompleted)}
                              onMouseLeave={handleCompletedLeave}
                              className={`crono-week-event-card ${isCompleted ? 'is-completed' : ''}`}
                              style={{ borderLeft: `4px solid ${isCompleted ? '#10B981' : badgeColor}`, cursor: isCompleted ? 'pointer' : undefined }}
                            >
                              <div className="crono-week-event-top">
                                <span className="crono-week-event-tag" style={{ backgroundColor: `${badgeColor}20`, color: badgeColor }}>
                                  {act.dateLabel}
                                </span>
                                {isCompleted && (
                                  <span className="crono-completed-chip">
                                    <Check size={12} /> Entregado
                                  </span>
                                )}
                              </div>

                              <div className="crono-week-event-title-wrap">
                                <IconComponent size={14} style={{ color: isCompleted ? '#10B981' : badgeColor, flexShrink: 0 }} />
                                <span className="crono-week-event-title">{titleText}</span>
                              </div>

                              <div className="crono-week-event-actions">
                                {act.type === 'ulibro' ? (
                                  <span className="crono-status-locked-badge">
                                    <Lock size={12} />
                                    <span>Bloqueado</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); toggleCompleted(act.id); }}
                                    className={`crono-status-btn ${isCompleted ? 'completed' : 'pending'}`}
                                  >
                                    {isCompleted ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                                    <span>{isCompleted ? 'Entregado' : 'En progreso'}</span>
                                  </button>
                                )}
                              </div>
                            </motion.div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Vista Feed por Semana para Móvil (Google Calendar Mobile) */}
            <div className="crono-mobile-week-agenda crono-mobile-only">
              {(WEEKS_CALENDAR_DAYS[activeWeekNum] || []).map(day => {
                const dayActivities = activities.filter(act =>
                  isActivityOnDay(act.dateLabel, day.dayNum, day.monthName)
                );

                return (
                  <div key={`${day.dayNum}-${day.monthName}`} className="crono-mobile-day-block">
                    <div className="crono-mobile-day-header">
                      <span className="crono-mobile-day-name">{day.dayName}</span>
                      <span className="crono-mobile-day-date">{day.dayNum} {day.monthName}</span>
                    </div>

                    <div className="crono-mobile-day-content">
                      {dayActivities.length === 0 ? (
                        <div className="crono-mobile-empty-day">Sin entregas programadas</div>
                      ) : (
                        dayActivities.map(act => {
                          const itemKey = `${selectedCat}-${act.id}`;
                          const isCompleted = !!completedMap[itemKey];
                          const evidence = evidenceMap[itemKey];
                          const IconComponent = act.icon;

                          let badgeColor = act.color || activeCategory.color;
                          if (act.type === 'ulibro') badgeColor = '#F59E0B';
                          if (act.type === 'avance') badgeColor = '#EF4444';
                          if (act.type === 'candidata' || act.type === 'final') badgeColor = '#10B981';

                          const titleText = resolveTitleWithTech(act);

                          return (
                            <div
                              key={act.id}
                              className={`crono-mobile-card ${act.type ? `crono-row-${act.type}` : ''} ${isCompleted ? 'is-completed' : ''}`}
                              style={{ borderLeft: `4px solid ${isCompleted ? '#10B981' : badgeColor}`, cursor: isCompleted ? 'pointer' : undefined }}
                              onClick={() => {
                                if (isCompleted) {
                                  setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                                  setDetailsItemKey(itemKey);
                                }
                              }}
                              onMouseEnter={(e) => handleCompletedHover(e, isCompleted)}
                              onMouseMove={(e) => handleCompletedMove(e, isCompleted)}
                              onMouseLeave={handleCompletedLeave}
                            >
                              <div className="crono-mobile-card-top">
                                <span className="crono-mobile-card-num">#{act.id}</span>
                                <span className={`crono-date-badge ${act.type ? `badge-${act.type}` : ''} ${isCompleted ? 'badge-completed' : ''}`}>
                                  {isCompleted && <Check size={12} style={{ marginRight: 3, display: 'inline-block', verticalAlign: 'middle' }} />}
                                  {act.dateLabel}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div className="crono-act-icon-box" style={{ color: isCompleted ? '#10B981' : badgeColor, flexShrink: 0 }}>
                                  <IconComponent size={16} />
                                </div>
                                <span className={`crono-mobile-card-title ${isCompleted ? 'text-completed' : ''}`}>
                                  {titleText}
                                </span>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
                                {act.type === 'ulibro' ? (
                                  <span className="crono-status-locked-badge">
                                    <Lock size={12} />
                                    <span>Bloqueado</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => toggleCompleted(act.id)}
                                    className={`crono-status-btn ${isCompleted ? 'completed' : 'pending'}`}
                                  >
                                    {isCompleted ? (
                                      <>
                                        <CheckCircle2 size={12} />
                                        <span>Entregado</span>
                                      </>
                                    ) : (
                                      <>
                                        <Clock size={12} />
                                        <span>En progreso</span>
                                      </>
                                    )}
                                  </button>
                                )}

                                {evidence && (
                                  <a
                                    href={evidence.htmlUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="crono-evidence-badge"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <GitCommit size={11} />
                                    <span>{evidence.shortSha}</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════
           MODO 3: POR MES (Calendario Mensual Google Calendar Style)
        ══════════════════════════════════════════════════════ */}
        {selectedView === 'mes' && (
          <div className="crono-month-view-wrapper">
            {/* Header Fijo y Pegajoso del Mes (Navegación + Días de la semana) */}
            <div className="crono-month-sticky-header">
              {/* Header de Navegación por Meses (Título centrado + Íconos sin texto) */}
              <div className="crono-cal-nav">
                <button
                  type="button"
                  className="crono-cal-nav-btn crono-icon-only-btn"
                  disabled={activeMonthIdx <= 0}
                  onClick={() => setActiveMonthIdx(m => Math.max(0, m - 1))}
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={18} />
                </button>

                <div className="crono-cal-title-wrap">
                  <h3 className="crono-cal-main-title">
                    {MONTH_CALENDARS[activeMonthIdx]?.name} 2026
                  </h3>
                </div>

                <button
                  type="button"
                  className="crono-cal-nav-btn crono-icon-only-btn"
                  disabled={activeMonthIdx >= MONTH_CALENDARS.length - 1}
                  onClick={() => setActiveMonthIdx(m => Math.min(MONTH_CALENDARS.length - 1, m + 1))}
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* Días de la semana en la cabecera del Calendario */}
              <div className="crono-gcal-header-row">
                {['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'].map(d => (
                  <div key={d} className="crono-gcal-header-cell">{d}</div>
                ))}
              </div>
            </div>

            {/* Grilla Mensual de 35 o 42 Celdas (Google Calendar Style) */}
            <div className="crono-gcal-grid">
              {(() => {
                const monthMeta = MONTH_CALENDARS[activeMonthIdx];
                const cells = [];

                // Celdas vacías previas
                for (let i = 0; i < monthMeta.startDayOfWeek; i++) {
                  cells.push(
                    <div key={`empty-prev-${i}`} className="crono-gcal-day-cell empty-cell" />
                  );
                }

                // Celdas de días del mes
                for (let dayNum = 1; dayNum <= monthMeta.totalDays; dayNum++) {
                  const dayActivities = activities.filter(act =>
                    isActivityOnDay(act.dateLabel, dayNum, monthMeta.id)
                  );
                  const hasEvents = dayActivities.length > 0;

                  cells.push(
                    <div
                      key={`day-${dayNum}`}
                      className={`crono-gcal-day-cell ${hasEvents ? 'has-events' : ''}`}
                    >
                      <div className="crono-gcal-day-num">{dayNum}</div>

                      <div className="crono-gcal-day-events">
                        {dayActivities.map(act => {
                          const itemKey = `${selectedCat}-${act.id}`;
                          const isCompleted = !!completedMap[itemKey];

                          let chipColor = act.color || activeCategory.color;
                          if (act.type === 'ulibro') chipColor = '#F59E0B';
                          if (act.type === 'avance') chipColor = '#EF4444';
                          if (act.type === 'candidata' || act.type === 'final') chipColor = '#10B981';

                          const titleText = resolveTitleWithTech(act);

                          return (
                            <motion.div
                              key={act.id}
                              whileHover={{ scale: 1.03 }}
                              onClick={(e) => {
                                if (isCompleted) {
                                  e.stopPropagation();
                                  setCursorTooltip({ show: false, x: 0, y: 0, text: '' });
                                  setDetailsItemKey(itemKey);
                                } else {
                                  handleOpenPopover(e, act, `${dayNum} de ${monthMeta.name}`);
                                }
                              }}
                              onMouseEnter={(e) => handleCompletedHover(e, isCompleted)}
                              onMouseMove={(e) => handleCompletedMove(e, isCompleted)}
                              onMouseLeave={handleCompletedLeave}
                              className={`crono-gcal-chip ${isCompleted ? 'chip-completed' : ''}`}
                              style={{ backgroundColor: isCompleted ? '#10B981' : chipColor, cursor: isCompleted ? 'pointer' : undefined }}
                              title={`${titleText} (${isCompleted ? 'Entregado' : 'En progreso'})`}
                            >
                              {isCompleted ? <Check size={11} /> : <Clock size={11} />}
                              <span className="crono-gcal-chip-text">{titleText}</span>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                return cells;
              })()}
            </div>
          </div>
        )}

        {/* Popover Flotante Estilo Google Calendar al hacer click/hover */}
        <AnimatePresence>
          {popover && (
            <div className="crono-popover-overlay" onClick={() => setPopover(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 8 }}
                transition={{ duration: 0.2 }}
                style={{ top: popover.y, left: popover.x }}
                onClick={(e) => e.stopPropagation()}
                className="crono-gcal-popover"
              >
                <div className="crono-gcal-popover-header">
                  <div className="crono-gcal-tag" style={{ backgroundColor: `${activeCategory.color}20`, color: activeCategory.color }}>
                    <Layers size={13} />
                    <span>{activeCategory.label}</span>
                  </div>
                  <button type="button" onClick={() => setPopover(null)} className="crono-gcal-close">
                    <X size={14} />
                  </button>
                </div>

                <div className="crono-gcal-popover-body">
                  <div className="crono-gcal-popover-title">{resolveTitleWithTech(popover.act)}</div>
                  <div className="crono-gcal-popover-date">
                    <Calendar size={14} />
                    <span>{popover.fullDateText}</span>
                  </div>
                  <div className="crono-gcal-popover-meta">
                    Hito #{popover.act.id} • Rango de entrega: <strong>{popover.act.dateLabel}</strong>
                  </div>
                </div>

                <div className="crono-gcal-popover-footer">
                  {popover.act.type === 'ulibro' ? (
                    <div className="crono-ulibro-popover-msg">
                      <Lock size={14} style={{ color: '#F59E0B', flexShrink: 0 }} />
                      <span>Periodo bloqueado por Ulibro. No se programa trabajo ni presentación.</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleCompleted(popover.act.id)}
                      className={`crono-status-btn ${completedMap[`${selectedCat}-${popover.act.id}`] ? 'completed' : 'pending'}`}
                    >
                      {completedMap[`${selectedCat}-${popover.act.id}`] ? (
                        <>
                          <CheckCircle2 size={13} />
                          <span>Entregado / Finalizado</span>
                        </>
                      ) : (
                        <>
                          <Clock size={13} />
                          <span>En progreso / Pendiente</span>
                        </>
                      )}
                    </button>
                  )}

                  {evidenceMap[`${selectedCat}-${popover.act.id}`] && (
                    <a
                      href={evidenceMap[`${selectedCat}-${popover.act.id}`].htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="crono-evidence-badge crono-evidence-badge-popover"
                    >
                      <GitCommit size={12} />
                      <span>
                        Evidencia: {evidenceMap[`${selectedCat}-${popover.act.id}`].shortSha} en{' '}
                        {evidenceMap[`${selectedCat}-${popover.act.id}`].branch}
                      </span>
                    </a>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* ── Summary Footer Bar (With Dynamic Completion Progress) ── */}
        <div className="crono-summary-bar">
          <div className="crono-summary-item">
            <div className="crono-summary-icon">
              <Calendar size={17} />
            </div>
            <div>
              <span className="crono-summary-label">Inicio del proyecto:</span>
              <strong className="crono-summary-val">17 de agosto de 2026</strong>
            </div>
          </div>

          <div className="crono-summary-divider" />

          <div className="crono-summary-item">
            <div className="crono-summary-icon">
              <Flag size={17} />
            </div>
            <div>
              <span className="crono-summary-label">Fin del proyecto:</span>
              <strong className="crono-summary-val">24 de noviembre de 2026</strong>
            </div>
          </div>

          <div className="crono-summary-divider" />

          <div className="crono-summary-item">
            <div className="crono-summary-icon">
              <Clock size={17} />
            </div>
            <div>
              <span className="crono-summary-label">Duración total:</span>
              <strong className="crono-summary-val">3.5 meses / 14 semanas</strong>
            </div>
          </div>

          <div className="crono-summary-divider" />

          {/* Dynamic Completion Counter */}
          <div className="crono-summary-item crono-summary-progress">
            <div className="crono-summary-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
              <CheckCircle2 size={17} />
            </div>
            <div>
              <span className="crono-summary-label">Estado de Entregas:</span>
              <strong className="crono-summary-val" style={{ color: '#10B981' }}>
                {completedCount} de {totalCount} Finalizadas ({progressPercent}%)
              </strong>
              <div className="crono-progress-track">
                <div className="crono-progress-bar" style={{ width: `${progressPercent}%` }} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Modal de Verificación de Entrega (rama + commit + descripción) ── */}
      <AnimatePresence>
        {verifyItemKey && (() => {
          const dashIdx = verifyItemKey.indexOf('-');
          const vCatId = verifyItemKey.slice(0, dashIdx) as CategoryId;
          const vActId = verifyItemKey.slice(dashIdx + 1);
          const vAct = (CRONOGRAMA_DATA[vCatId] || []).find((a) => a.id === vActId);
          const vCat = CATEGORIES.find((c) => c.id === vCatId);
          const selectedCommit = verifyCommits.find((c) => c.sha === verifyCommitSha);
          const verifySelectedRepo = REPOS.find((r) => r.id === verifyRepoId);
          const selectedMember = TEAM_MEMBERS.find((m) => m.id === verifyMemberId);

          return (
            <div className="crono-verify-overlay" onClick={closeVerifyModal}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.2 }}
                className="crono-verify-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="crono-verify-header">
                  <div className="crono-verify-header-title">
                    <ShieldCheck size={18} style={{ color: verifyMode === 'complete' ? '#10B981' : '#64748B' }} />
                    <span>
                      {verifyAuthPhase === 'newPassword'
                        ? 'Crea tu propia contraseña'
                        : verifyStep === 'profile'
                          ? 'Autenticación de Integrante'
                          : verifyMode === 'complete' ? 'Verificar Entrega' : 'Confirmar Cambio a Pendiente'}
                    </span>
                  </div>
                  <button type="button" className="crono-gcal-close" onClick={closeVerifyModal}>
                    <X size={16} />
                  </button>
                </div>

                <p className="crono-verify-subtitle">
                  {vCat ? `${vCat.label} — ` : ''}{vAct ? vAct.title : verifyItemKey}
                </p>

                {/* ── PASO 1: Selección de Perfil de Mente Maestra + Contraseña ── */}
                {verifyStep === 'profile' && verifyAuthPhase === 'login' && (
                  <div className="crono-verify-step1">
                    <label className="crono-verify-label" style={{ marginBottom: 12, display: 'block' }}>
                      ¿Quién registra este cambio? Selecciona tu perfil:
                    </label>

                    <div className="crono-profile-grid">
                      {TEAM_MEMBERS.map((m) => {
                        const isSelected = verifyMemberId === m.id;
                        return (
                          <motion.button
                            key={m.id}
                            type="button"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => { setVerifyMemberId(m.id); setVerifyFormError(''); }}
                            className={`crono-profile-card ${isSelected ? 'selected' : ''}`}
                            style={{
                              borderColor: isSelected ? m.color : undefined,
                              boxShadow: isSelected ? `0 0 0 3px ${m.color}35, 0 8px 20px ${m.color}20` : undefined
                            }}
                          >
                            <div className="crono-profile-avatar" style={{ backgroundColor: `${m.color}20`, border: `2px solid ${m.color}` }}>
                              <img src={m.avatarUrl} alt={m.name} className="crono-profile-img" />
                            </div>
                            <div className="crono-profile-name" style={{ color: isSelected ? m.color : undefined }}>
                              {m.name.split(' ')[0]}
                            </div>
                            <div className="crono-profile-badge" style={{ backgroundColor: isSelected ? m.color : undefined, color: isSelected ? '#FFF' : undefined }}>
                              {m.initials}
                            </div>
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Formulario de Contraseña para el perfil seleccionado */}
                    {verifyMemberId && selectedMember && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="crono-verify-password-box"
                        style={{ marginTop: 16 }}
                      >
                        <label className="crono-verify-label">
                          Ingresa la contraseña de <strong>{selectedMember.name.split(' ')[0]}</strong>:
                        </label>
                        <div className="password-input-wrap" style={{ marginTop: 6 }}>
                          <input
                            type={verifyShowPassword ? 'text' : 'password'}
                            className="crono-verify-input dev-auth-input"
                            placeholder="••••••••"
                            value={verifyPassword}
                            onChange={(e) => setVerifyPassword(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleStep1Auth(); }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="password-toggle-btn"
                            onClick={() => setVerifyShowPassword(!verifyShowPassword)}
                            tabIndex={-1}
                          >
                            {verifyShowPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </div>
                )}

                {/* Cambiar contraseña si es primer ingreso */}
                {verifyAuthPhase === 'newPassword' && (
                  <>
                    <p className="crono-verify-subtitle">
                      Es tu primer ingreso: la contraseña que usaste era temporal. Crea una propia
                      (mínimo 6 caracteres) para seguir usándola de aquí en adelante.
                    </p>
                    <NewPasswordFields
                      password1={verifyNewPassword1}
                      onPassword1Change={setVerifyNewPassword1}
                      password2={verifyNewPassword2}
                      onPassword2Change={setVerifyNewPassword2}
                    />
                  </>
                )}

                {/* ── PASO 2: Formulario de Entrega (Una vez autenticado) ── */}
                {verifyStep === 'details' && verifyAuthPhase === 'login' && (
                  <>
                    {/* Badge de Identidad Verificada */}
                    <div className="crono-verified-user-badge" style={{ backgroundColor: `${selectedMember?.color}15`, border: `1px solid ${selectedMember?.color}40`, marginBottom: 16 }}>
                      <div className="crono-verified-avatar" style={{ backgroundColor: `${selectedMember?.color}20`, border: `1.5px solid ${selectedMember?.color}` }}>
                        <img src={selectedMember?.avatarUrl} alt="" className="crono-verified-img" />
                      </div>
                      <div>
                        <span className="crono-verified-label">Identidad Verificada:</span>
                        <strong className="crono-verified-name" style={{ color: selectedMember?.color }}>
                          {selectedMember?.name}
                        </strong>
                      </div>
                      <CheckCircle2 size={18} style={{ color: selectedMember?.color, marginLeft: 'auto' }} />
                    </div>

                    {verifyMode === 'complete' && (
                      <>
                        {/* Repositorio — siempre editable, no queda fijo por categoría */}
                        <div className="crono-verify-field">
                          <label className="crono-verify-label">Repositorio del commit</label>
                          <div className={`crono-dd-wrap ${verifyRepoOpen ? 'dd-open' : ''}`}>
                            <button
                              type="button"
                              className="crono-dd-trigger"
                              style={{ width: '100%', justifyContent: 'space-between' }}
                              onClick={() => {
                                setVerifyRepoOpen((o) => {
                                  const next = !o;
                                  if (next) {
                                    setVerifyBranchOpen(false);
                                    setVerifyCommitOpen(false);
                                  }
                                  return next;
                                });
                              }}
                            >
                              <span className="crono-dd-text">
                                <GitBranch size={13} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                                {verifySelectedRepo ? verifySelectedRepo.label : 'Selecciona un repositorio'}
                              </span>
                              <ChevronDown size={14} className={`crono-dd-chevron ${verifyRepoOpen ? 'open' : ''}`} />
                            </button>
                            <AnimatePresence>
                              {verifyRepoOpen && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                  transition={{ duration: 0.18 }}
                                  className="crono-dd-menu tech-select-menu"
                                  style={{ width: '100%' }}
                                >
                                  {REPOS.map((r) => (
                                    <button
                                      key={r.id}
                                      type="button"
                                      onClick={() => {
                                        setVerifyRepoId(r.id);
                                        setVerifyRepoOpen(false);
                                        setVerifyBranchOpen(false);
                                        setVerifyCommitOpen(false);
                                      }}
                                      className={`crono-dd-item ${r.id === verifyRepoId ? 'active' : ''}`}
                                    >
                                      <span className="crono-dd-item-label">{r.label}</span>
                                      {r.id === verifyRepoId && <Check size={14} className="crono-dd-check" />}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Rama */}
                        <div className="crono-verify-field">
                          <label className="crono-verify-label">Rama del commit</label>
                          <div className={`crono-dd-wrap ${verifyBranchOpen ? 'dd-open' : ''}`}>
                            <button
                              type="button"
                              className="crono-dd-trigger"
                              style={{ width: '100%', justifyContent: 'space-between' }}
                              onClick={() => {
                                setVerifyBranchOpen((o) => {
                                  const next = !o;
                                  if (next) {
                                    setVerifyRepoOpen(false);
                                    setVerifyCommitOpen(false);
                                  }
                                  return next;
                                });
                              }}
                              disabled={!verifyRepoId || verifyBranchesStatus !== 'ok'}
                            >
                              <span className="crono-dd-text">
                                <GitBranch size={13} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                                {!verifyRepoId
                                  ? 'Selecciona primero un repositorio'
                                  : verifyBranchesStatus === 'loading' ? 'Cargando ramas...' : (verifyBranch || 'Selecciona una rama')}
                              </span>
                              <ChevronDown size={14} className={`crono-dd-chevron ${verifyBranchOpen ? 'open' : ''}`} />
                            </button>
                            <AnimatePresence>
                              {verifyBranchOpen && verifyBranchesStatus === 'ok' && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                  transition={{ duration: 0.18 }}
                                  className="crono-dd-menu tech-select-menu"
                                  style={{ width: '100%' }}
                                >
                                  {verifyBranches.map((b) => (
                                    <button
                                      key={b.name}
                                      type="button"
                                      onClick={() => {
                                        setVerifyBranch(b.name);
                                        setVerifyBranchOpen(false);
                                        setVerifyCommitOpen(false);
                                      }}
                                      className={`crono-dd-item ${b.name === verifyBranch ? 'active' : ''}`}
                                    >
                                      <span className="crono-dd-item-label">{b.name}</span>
                                      {b.name === verifyBranch && <Check size={14} className="crono-dd-check" />}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {/* Commit */}
                        <div className="crono-verify-field">
                          <label className="crono-verify-label">Commit de evidencia</label>
                          <div className={`crono-dd-wrap ${verifyCommitOpen ? 'dd-open' : ''}`}>
                            <button
                              type="button"
                              className="crono-dd-trigger"
                              style={{ width: '100%', justifyContent: 'space-between' }}
                              onClick={() => {
                                setVerifyCommitOpen((o) => {
                                  const next = !o;
                                  if (next) {
                                    setVerifyRepoOpen(false);
                                    setVerifyBranchOpen(false);
                                  }
                                  return next;
                                });
                              }}
                              disabled={verifyCommitsStatus !== 'ok'}
                            >
                              <span className="crono-dd-text">
                                {verifyCommitsStatus === 'idle'
                                  ? 'Selecciona primero una rama'
                                  : verifyCommitsStatus === 'loading'
                                    ? 'Cargando commits...'
                                    : selectedCommit
                                      ? `${selectedCommit.sha.slice(0, 7)} — ${selectedCommit.commit.message.split('\n')[0].slice(0, 40)}`
                                      : 'Selecciona un commit'}
                              </span>
                              <ChevronDown size={14} className={`crono-dd-chevron ${verifyCommitOpen ? 'open' : ''}`} />
                            </button>
                            <AnimatePresence>
                              {verifyCommitOpen && verifyCommitsStatus === 'ok' && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.98 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 6, scale: 0.98 }}
                                  transition={{ duration: 0.18 }}
                                  className="crono-dd-menu tech-select-menu"
                                  style={{ width: '100%' }}
                                >
                                  {verifyCommits.map((c) => (
                                    <button
                                      key={c.sha}
                                      type="button"
                                      onClick={() => {
                                        setVerifyCommitSha(c.sha);
                                        setVerifyCommitOpen(false);
                                      }}
                                      className={`crono-dd-item ${c.sha === verifyCommitSha ? 'active' : ''}`}
                                    >
                                      <span className="crono-dd-item-label">
                                        <span className="crono-verify-commit-sha">{c.sha.slice(0, 7)}</span>
                                        <span className="crono-commit-msg-text">{c.commit.message.split('\n')[0]}</span>
                                      </span>
                                      {c.sha === verifyCommitSha && <Check size={14} className="crono-dd-check" />}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        </div>

                        {(verifyBranchesStatus === 'error' || verifyCommitsStatus === 'error') && (
                          <div className="crono-verify-error-box">
                            <AlertTriangle size={14} /> <span>{verifyErrorMsg}</span>
                          </div>
                        )}

                        {/* Descripción */}
                        <div className="crono-verify-field">
                          <label className="crono-verify-label">Descripción de la entrega</label>
                          <textarea
                            className="crono-verify-textarea"
                            placeholder="Describe qué se implementó, probó o corrigió en este commit..."
                            value={verifyDescription}
                            onChange={(e) => setVerifyDescription(e.target.value)}
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                {verifyFormError && <p className="crono-verify-form-error">{verifyFormError}</p>}

                {/* Acciones del Modal */}
                <div className="crono-verify-actions">
                  <button type="button" className="crono-cal-nav-btn" onClick={closeVerifyModal} disabled={verifySubmitting}>
                    Cancelar
                  </button>

                  {verifyStep === 'profile' && verifyAuthPhase === 'login' ? (
                    <button
                      type="button"
                      className="crono-verify-confirm-btn"
                      onClick={handleStep1Auth}
                      disabled={verifySubmitting || !verifyMemberId || !verifyPassword}
                    >
                      <ShieldCheck size={15} />
                      {verifySubmitting ? 'Autenticando...' : 'Verificar Contraseña y Continuar →'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="crono-verify-confirm-btn"
                      onClick={handleConfirmVerification}
                      disabled={verifySubmitting}
                    >
                      <ShieldCheck size={15} />
                      {verifyAuthPhase === 'newPassword'
                        ? (verifySubmitting ? 'Guardando...' : 'Guardar Contraseña y Continuar')
                        : verifySubmitting
                          ? 'Verificando...'
                          : verifyMode === 'complete'
                            ? 'Confirmar y Marcar como Entregado'
                            : 'Confirmar y Marcar como Pendiente'}
                    </button>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* ── Tooltip Flotante Siguiendo al Cursor para Entregas Confirmadas ── */}
      {cursorTooltip.show && (
        <div
          className="crono-cursor-tooltip"
          style={{
            position: 'fixed',
            left: cursorTooltip.x + 12,
            top: cursorTooltip.y + 16,
            pointerEvents: 'none',
            zIndex: 999999,
          }}
        >
          {cursorTooltip.text}
        </div>
      )}

      {/* ── Modal de Detalles de Entrega Confirmada ── */}
      <AnimatePresence>
        {detailsItemKey && (() => {
          const dashIdx = detailsItemKey.indexOf('-');
          const dCatId = detailsItemKey.slice(0, dashIdx) as CategoryId;
          const dActId = detailsItemKey.slice(dashIdx + 1);
          const dAct = (CRONOGRAMA_DATA[dCatId] || []).find((a) => a.id === dActId);
          const dCat = CATEGORIES.find((c) => c.id === dCatId);
          const evidence = evidenceMap[detailsItemKey];

          const registeredMember = TEAM_MEMBERS.find((m) =>
            evidence?.registeredBy && (
              evidence.registeredBy.toLowerCase().includes(m.id) ||
              evidence.registeredBy.toLowerCase().includes(m.name.split(' ')[0].toLowerCase())
            )
          );

          const formattedDate = evidence?.taggedAt
            ? new Date(evidence.taggedAt).toLocaleString('es-ES', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : null;

          return (
            <div className="crono-verify-overlay" onClick={() => setDetailsItemKey(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.2 }}
                className="crono-verify-modal crono-details-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="crono-verify-header">
                  <div className="crono-verify-header-title">
                    <CheckCircle2 size={20} style={{ color: '#10B981' }} />
                    <span>Detalles de la Entrega Confirmada</span>
                  </div>
                  <button type="button" className="crono-gcal-close" onClick={() => setDetailsItemKey(null)}>
                    <X size={16} />
                  </button>
                </div>

                {dCat && (
                  <div className="crono-details-tag" style={{ backgroundColor: `${dCat.color}18`, color: dCat.color }}>
                    <Layers size={13} />
                    <span>{dCat.label}</span> — Hito #{dActId} ({dAct?.dateLabel})
                  </div>
                )}

                <h3 className="crono-details-title">
                  {dAct ? resolveTitleWithTech(dAct) : detailsItemKey}
                </h3>

                {/* Registrado Por */}
                {evidence?.registeredBy && (
                  <div className="crono-details-section">
                    <label className="crono-details-label">Registrado por:</label>
                    <div className="crono-verified-user-badge" style={{ backgroundColor: `${registeredMember?.color || '#10B981'}15`, border: `1px solid ${registeredMember?.color || '#10B981'}40` }}>
                      <div className="crono-verified-avatar" style={{ backgroundColor: `${registeredMember?.color || '#10B981'}20`, border: `1.5px solid ${registeredMember?.color || '#10B981'}` }}>
                        <img src={registeredMember?.avatarUrl} alt="" className="crono-verified-img" />
                      </div>
                      <div>
                        <strong className="crono-verified-name" style={{ color: registeredMember?.color || '#10B981' }}>
                          {evidence.registeredBy}
                        </strong>
                        {formattedDate && (
                          <span className="crono-details-time">
                            Confirmado el {formattedDate}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Evidencia de Commit de GitHub */}
                {evidence && (
                  <div className="crono-details-commit-box">
                    <div className="crono-details-commit-row">
                      <span className="crono-details-meta-item">
                        <GitBranch size={13} />
                        <strong>Rama:</strong> {evidence.branch}
                      </span>
                      <span className="crono-details-meta-item">
                        <GitCommit size={13} />
                        <strong>Commit:</strong> <code className="crono-verify-commit-sha">{evidence.shortSha}</code>
                      </span>
                    </div>

                    {evidence.message && (
                      <div className="crono-details-commit-msg">
                        <strong>Mensaje de GitHub:</strong>
                        <p>{evidence.message}</p>
                      </div>
                    )}

                    {evidence.author && (
                      <div className="crono-details-commit-author">
                        <span>Autor del commit: <strong>{evidence.author}</strong></span>
                        {evidence.date && <span> ({new Date(evidence.date).toLocaleDateString('es-ES')})</span>}
                      </div>
                    )}
                  </div>
                )}

                {/* Descripción Personal de la Entrega */}
                {evidence?.description ? (
                  <div className="crono-details-section">
                    <label className="crono-details-label">Descripción de la entrega:</label>
                    <div className="crono-details-desc-box">
                      <p>{evidence.description}</p>
                    </div>
                  </div>
                ) : (
                  <div className="crono-details-section">
                    <label className="crono-details-label">Descripción de la entrega:</label>
                    <p className="crono-details-no-desc">Sin descripción personalizada registrada.</p>
                  </div>
                )}

                {/* Acciones */}
                <div className="crono-details-actions">
                  {evidence?.htmlUrl && (
                    <a
                      href={evidence.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="crono-details-gh-btn"
                    >
                      <GitCommit size={15} />
                      Ver en GitHub ↗
                    </a>
                  )}

                  <button
                    type="button"
                    className="crono-details-edit-btn"
                    onClick={() => {
                      const keyToEdit = detailsItemKey;
                      setDetailsItemKey(null);
                      if (keyToEdit) openEditModal(keyToEdit);
                    }}
                  >
                    <Pencil size={14} />
                    Editar / Eliminar Entrega
                  </button>

                  <button
                    type="button"
                    className="crono-verify-confirm-btn"
                    onClick={() => setDetailsItemKey(null)}
                  >
                    Cerrar
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal de Edición / Eliminación de Entrega Confirmada ── */}
      <AnimatePresence>
        {editItemKey && (() => {
          const dashIdx = editItemKey.indexOf('-');
          const eCatId = editItemKey.slice(0, dashIdx) as CategoryId;
          const eActId = editItemKey.slice(dashIdx + 1);
          const eAct = (CRONOGRAMA_DATA[eCatId] || []).find((a) => a.id === eActId);
          const eCat = CATEGORIES.find((c) => c.id === eCatId);
          const evidence = evidenceMap[editItemKey];

          const publisherMember = TEAM_MEMBERS.find((m) =>
            evidence?.registeredBy && (
              evidence.registeredBy.toLowerCase().includes(m.id) ||
              evidence.registeredBy.toLowerCase().includes(m.name.split(' ')[0].toLowerCase())
            )
          );

          const editSelectedRepo = REPOS.find((r) => r.id === editRepoId);
          const editSelectedCommit = editCommits.find((c) => c.sha === editCommitSha);

          return (
            <div className="crono-verify-overlay" onClick={() => setEditItemKey(null)}>
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 12 }}
                transition={{ duration: 0.2 }}
                className="crono-verify-modal crono-details-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="crono-verify-header">
                  <div className="crono-verify-header-title">
                    <Pencil size={18} style={{ color: '#3B82F6' }} />
                    <span>Editar o Eliminar Entrega</span>
                  </div>
                  <button type="button" className="crono-gcal-close" onClick={() => setEditItemKey(null)}>
                    <X size={16} />
                  </button>
                </div>

                {eCat && (
                  <div className="crono-details-tag" style={{ backgroundColor: `${eCat.color}18`, color: eCat.color }}>
                    <Layers size={13} />
                    <span>{eCat.label}</span> — Hito #{eActId} ({eAct?.dateLabel})
                  </div>
                )}

                <h3 className="crono-details-title">
                  {eAct ? resolveTitleWithTech(eAct) : editItemKey}
                </h3>

                {/* PASO 1 DE EDICIÓN: Autenticación con contraseña del AUTOR */}
                {editStep === 'auth' && (
                  <>
                    <div className="crono-verify-subtitle" style={{ marginBottom: 14 }}>
                      Para editar o eliminar esta entrega, debes ingresar la contraseña de <strong>{publisherMember?.name || evidence?.registeredBy || 'quien la publicó'}</strong>:
                    </div>

                    {publisherMember && (
                      <div className="crono-verified-user-badge" style={{ backgroundColor: `${publisherMember.color}15`, border: `1px solid ${publisherMember.color}40`, marginBottom: 16 }}>
                        <div className="crono-verified-avatar" style={{ backgroundColor: `${publisherMember.color}20`, border: `1.5px solid ${publisherMember.color}` }}>
                          <img src={publisherMember.avatarUrl} alt="" className="crono-verified-img" />
                        </div>
                        <div>
                          <strong className="crono-verified-name" style={{ color: publisherMember.color }}>
                            {publisherMember.name}
                          </strong>
                          <span className="crono-details-time">
                            Autor original de la entrega
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="crono-verify-field">
                      <label className="crono-verify-label">Contraseña de <strong>{publisherMember?.name.split(' ')[0] || 'Autor'}</strong>:</label>
                      <div className="password-input-wrap" style={{ marginTop: 6 }}>
                        <input
                          type={editShowPassword ? 'text' : 'password'}
                          className="crono-verify-input dev-auth-input"
                          placeholder="Ingresa la contraseña del autor..."
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleEditAuth(); }}
                        />
                        <button
                          type="button"
                          className="password-toggle-btn"
                          onClick={() => setEditShowPassword((v) => !v)}
                          tabIndex={-1}
                        >
                          {editShowPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* PASO 2 DE EDICIÓN: Formulario de edición */}
                {editStep === 'edit' && (
                  <>
                    {/* Repositorio */}
                    <div className="crono-verify-field">
                      <label className="crono-verify-label">Repositorio del commit</label>
                      <div className={`crono-dd-wrap ${editRepoOpen ? 'dd-open' : ''}`}>
                        <button
                          type="button"
                          className="crono-dd-trigger"
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          onClick={() => {
                            setEditRepoOpen((o) => {
                              const next = !o;
                              if (next) { setEditBranchOpen(false); setEditCommitOpen(false); }
                              return next;
                            });
                          }}
                        >
                          <span className="crono-dd-text">
                            <GitBranch size={13} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                            {editSelectedRepo ? editSelectedRepo.label : 'Selecciona un repositorio'}
                          </span>
                          <ChevronDown size={14} className={`crono-dd-chevron ${editRepoOpen ? 'open' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {editRepoOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.98 }}
                              transition={{ duration: 0.18 }}
                              className="crono-dd-menu tech-select-menu"
                              style={{ width: '100%' }}
                            >
                              {REPOS.map((r) => (
                                <button
                                  key={r.id}
                                  type="button"
                                  onClick={() => {
                                    setEditRepoId(r.id);
                                    setEditRepoOpen(false);
                                    setEditBranchOpen(false);
                                    setEditCommitOpen(false);
                                  }}
                                  className={`crono-dd-item ${r.id === editRepoId ? 'active' : ''}`}
                                >
                                  <span className="crono-dd-item-label">{r.label}</span>
                                  {r.id === editRepoId && <Check size={14} className="crono-dd-check" />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Rama */}
                    <div className="crono-verify-field">
                      <label className="crono-verify-label">Rama del commit</label>
                      <div className={`crono-dd-wrap ${editBranchOpen ? 'dd-open' : ''}`}>
                        <button
                          type="button"
                          className="crono-dd-trigger"
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          onClick={() => {
                            setEditBranchOpen((o) => {
                              const next = !o;
                              if (next) { setEditRepoOpen(false); setEditCommitOpen(false); }
                              return next;
                            });
                          }}
                          disabled={!editRepoId || editBranchesStatus !== 'ok'}
                        >
                          <span className="crono-dd-text">
                            <GitBranch size={13} style={{ marginRight: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                            {!editRepoId
                              ? 'Selecciona primero un repositorio'
                              : editBranchesStatus === 'loading' ? 'Cargando ramas...' : (editBranch || 'Selecciona una rama')}
                          </span>
                          <ChevronDown size={14} className={`crono-dd-chevron ${editBranchOpen ? 'open' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {editBranchOpen && editBranchesStatus === 'ok' && (
                            <motion.div
                              initial={{ opacity: 0, y: 6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.98 }}
                              transition={{ duration: 0.18 }}
                              className="crono-dd-menu tech-select-menu"
                              style={{ width: '100%' }}
                            >
                              {editBranches.map((b) => (
                                <button
                                  key={b.name}
                                  type="button"
                                  onClick={() => {
                                    setEditBranch(b.name);
                                    setEditBranchOpen(false);
                                    setEditCommitOpen(false);
                                  }}
                                  className={`crono-dd-item ${b.name === editBranch ? 'active' : ''}`}
                                >
                                  <span className="crono-dd-item-label">{b.name}</span>
                                  {b.name === editBranch && <Check size={14} className="crono-dd-check" />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Commit */}
                    <div className="crono-verify-field">
                      <label className="crono-verify-label">Commit de evidencia</label>
                      <div className={`crono-dd-wrap ${editCommitOpen ? 'dd-open' : ''}`}>
                        <button
                          type="button"
                          className="crono-dd-trigger"
                          style={{ width: '100%', justifyContent: 'space-between' }}
                          onClick={() => {
                            setEditCommitOpen((o) => {
                              const next = !o;
                              if (next) { setEditRepoOpen(false); setEditBranchOpen(false); }
                              return next;
                            });
                          }}
                          disabled={editCommitsStatus !== 'ok'}
                        >
                          <span className="crono-dd-text">
                            {editCommitsStatus === 'idle'
                              ? 'Selecciona primero una rama'
                              : editCommitsStatus === 'loading'
                                ? 'Cargando commits...'
                                : editSelectedCommit
                                  ? `${editSelectedCommit.sha.slice(0, 7)} — ${editSelectedCommit.commit.message.split('\n')[0].slice(0, 40)}`
                                  : (editCommitSha ? `${editCommitSha.slice(0, 7)} — Actual` : 'Selecciona un commit')}
                          </span>
                          <ChevronDown size={14} className={`crono-dd-chevron ${editCommitOpen ? 'open' : ''}`} />
                        </button>
                        <AnimatePresence>
                          {editCommitOpen && editCommitsStatus === 'ok' && (
                            <motion.div
                              initial={{ opacity: 0, y: 6, scale: 0.98 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 6, scale: 0.98 }}
                              transition={{ duration: 0.18 }}
                              className="crono-dd-menu tech-select-menu"
                              style={{ width: '100%' }}
                            >
                              {editCommits.map((c) => (
                                <button
                                  key={c.sha}
                                  type="button"
                                  onClick={() => {
                                    setEditCommitSha(c.sha);
                                    setEditCommitOpen(false);
                                  }}
                                  className={`crono-dd-item ${c.sha === editCommitSha ? 'active' : ''}`}
                                >
                                  <span className="crono-dd-item-label">
                                    <span className="crono-verify-commit-sha">{c.sha.slice(0, 7)}</span>
                                    <span className="crono-commit-msg-text">{c.commit.message.split('\n')[0]}</span>
                                  </span>
                                  {c.sha === editCommitSha && <Check size={14} className="crono-dd-check" />}
                                </button>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {(editBranchesStatus === 'error' || editCommitsStatus === 'error') && (
                      <div className="crono-verify-error-box">
                        <AlertTriangle size={14} /> <span>{editErrorMsg}</span>
                      </div>
                    )}

                    {/* Descripción */}
                    <div className="crono-verify-field">
                      <label className="crono-verify-label">Descripción de la entrega</label>
                      <textarea
                        className="crono-verify-textarea"
                        placeholder="Edita la descripción de la entrega..."
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                      />
                    </div>
                  </>
                )}

                {/* PASO 3 DE EDICIÓN: Confirmación de Eliminación con Fecha */}
                {editStep === 'deleteConfirm' && (
                  <div className="crono-delete-confirm-box">
                    <div className="crono-delete-confirm-title">
                      <AlertTriangle size={18} />
                      <span>¿Confirmas que deseas eliminar esta entrega?</span>
                    </div>
                    <p className="crono-delete-confirm-text">
                      Esta acción borrará permanentemente la evidencia registrada y cambiará el estado del hito a <strong>En progreso / Pendiente</strong>.
                    </p>
                    <div className="crono-verify-field" style={{ marginTop: 12 }}>
                      <label className="crono-verify-label">
                        Escribe exactamente la fecha del hito <span className="crono-delete-date-target">{eAct?.dateLabel}</span> para autorizar:
                      </label>
                      <input
                        type="text"
                        className="crono-verify-input dev-auth-input"
                        placeholder={`Escribe "${eAct?.dateLabel}" para confirmar...`}
                        value={deleteDateInput}
                        onChange={(e) => setDeleteDateInput(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {editFormError && <p className="crono-verify-form-error">{editFormError}</p>}

                {/* ACCIONES DEL MODAL DE EDICIÓN */}
                <div className="crono-details-actions">
                  <button type="button" className="crono-cal-nav-btn" onClick={() => setEditItemKey(null)} disabled={editSubmitting}>
                    Cancelar
                  </button>

                  {editStep === 'auth' && (
                    <button
                      type="button"
                      className="crono-verify-confirm-btn"
                      onClick={handleEditAuth}
                      disabled={editSubmitting || !editPassword}
                    >
                      <ShieldCheck size={15} />
                      {editSubmitting ? 'Verificando...' : 'Autenticar Autor →'}
                    </button>
                  )}

                  {editStep === 'edit' && (
                    <>
                      <button
                        type="button"
                        className="crono-edit-delete-btn"
                        onClick={() => { setEditFormError(''); setEditStep('deleteConfirm'); }}
                        disabled={editSubmitting}
                      >
                        <Trash2 size={14} />
                        Eliminar Entrega
                      </button>

                      <button
                        type="button"
                        className="crono-verify-confirm-btn"
                        onClick={handleSaveEdit}
                        disabled={editSubmitting}
                      >
                        <ShieldCheck size={15} />
                        {editSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                      </button>
                    </>
                  )}

                  {editStep === 'deleteConfirm' && (
                    <>
                      <button
                        type="button"
                        className="crono-cal-nav-btn"
                        onClick={() => { setEditFormError(''); setEditStep('edit'); }}
                        disabled={editSubmitting}
                      >
                        ← Volver a Edición
                      </button>

                      <button
                        type="button"
                        className="crono-delete-confirm-btn"
                        onClick={handleConfirmDelete}
                        disabled={editSubmitting || deleteDateInput.trim().toLowerCase() !== (eAct?.dateLabel || '').trim().toLowerCase()}
                      >
                        <Trash2 size={14} />
                        {editSubmitting ? 'Eliminando...' : 'Confirmar y Eliminar'}
                      </button>
                    </>
                  )}
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
