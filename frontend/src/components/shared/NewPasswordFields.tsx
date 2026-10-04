import PasswordInput from './PasswordInput';

interface NewPasswordFieldsProps {
  password1: string;
  onPassword1Change: (value: string) => void;
  password2: string;
  onPassword2Change: (value: string) => void;
}

/**
 * Campos "Nueva contraseña" + "Confirmar contraseña", usados cuando se
 * detecta el primer ingreso de una cuenta (ver devAuth.isFirstLogin) en
 * cualquiera de los 3 puntos de autenticación del Módulo de Desarrollo.
 */
export default function NewPasswordFields({ password1, onPassword1Change, password2, onPassword2Change }: NewPasswordFieldsProps) {
  return (
    <>
      <div className="crono-verify-field">
        <label className="crono-verify-label">Nueva contraseña</label>
        <PasswordInput
          autoFocus
          placeholder="••••••••"
          autoComplete="new-password"
          value={password1}
          onChange={onPassword1Change}
        />
      </div>
      <div className="crono-verify-field">
        <label className="crono-verify-label">Confirmar contraseña</label>
        <PasswordInput
          placeholder="••••••••"
          autoComplete="new-password"
          value={password2}
          onChange={onPassword2Change}
        />
      </div>
    </>
  );
}
