import { TEAM_MEMBERS } from '../../data/teamData';
import PasswordInput from './PasswordInput';

interface DevAuthFieldsProps {
  memberId: string;
  onMemberChange: (id: string) => void;
  password: string;
  onPasswordChange: (password: string) => void;
  label?: string;
}

/**
 * Campos reutilizables "¿Quién registra esto?" + contraseña, usados antes
 * de cualquier escritura al Módulo de Desarrollo (Cuestionario, Cronograma,
 * Repositorio). La verificación real ocurre en data/devAuth.ts contra
 * Firebase Authentication — esto es solo la UI de captura.
 */
export default function DevAuthFields({ memberId, onMemberChange, password, onPasswordChange, label }: DevAuthFieldsProps) {
  return (
    <div className="dev-auth-row">
      <div className="crono-verify-field dev-auth-field">
        <label className="crono-verify-label">{label || '¿Quién registra este cambio?'}</label>
        <select
          className="dev-auth-select"
          value={memberId}
          onChange={(e) => onMemberChange(e.target.value)}
        >
          <option value="" disabled>Selecciona tu nombre</option>
          {TEAM_MEMBERS.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="crono-verify-field dev-auth-field">
        <label className="crono-verify-label">Contraseña</label>
        <PasswordInput
          value={password}
          onChange={onPasswordChange}
          placeholder="••••••••"
          autoComplete="current-password"
        />
      </div>
    </div>
  );
}
