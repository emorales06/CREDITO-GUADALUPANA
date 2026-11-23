import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { registerSchema } from '@guadalupana/shared';
import { ApiError } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { AuthShell, PasswordField, firstErrors } from '../components/auth.tsx';
import { Banner, Icon, Spinner } from '../components/ui.tsx';

export function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', username: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await register(parsed.data);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(firstErrors(err.fields));
      else setErrors({ form: err instanceof Error ? err.message : 'No se pudo crear la cuenta' });
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="large-title" style={{ margin: '0 0 6px' }}>Crear una cuenta</h2>
      <p className="muted" style={{ margin: '0 0 22px' }}>Las cuentas nuevas pueden registrar y consultar sus solicitudes de crédito.</p>

      <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }} noValidate>
        {errors.form && <Banner tone="error">{errors.form}</Banner>}
        <div className="field">
          <label htmlFor="fullName">Nombre completo</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="user" /></span>
            <input id="fullName" className="input" autoComplete="name" value={form.fullName} aria-invalid={errors.fullName ? true : undefined} onChange={(e) => set('fullName')(e.target.value)} />
          </div>
          {errors.fullName && <span className="error"><Icon name="alert" size={14} /> {errors.fullName}</span>}
        </div>
        <div className="field">
          <label htmlFor="username">Usuario</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="key" /></span>
            <input id="username" className="input" autoComplete="username" placeholder="ej. lucia.tzoc" value={form.username}
              aria-invalid={errors.username ? true : undefined} onChange={(e) => set('username')(e.target.value.toLowerCase())} />
          </div>
          {errors.username ? <span className="error"><Icon name="alert" size={14} /> {errors.username}</span> : <span className="hint">4 a 30 caracteres: letras, números, punto o guion.</span>}
        </div>
        <PasswordField id="password" label="Contraseña" value={form.password} onChange={set('password')} autoComplete="new-password" error={errors.password} showRules />
        <PasswordField id="confirmPassword" label="Confirmar contraseña" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" error={errors.confirmPassword} />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy} style={{ marginTop: 4 }}>{busy && <Spinner />} Crear cuenta</button>
      </form>

      <div className="auth__links"><span className="muted">¿Ya tiene cuenta?</span><Link to="/login">Iniciar sesión</Link></div>
    </AuthShell>
  );
}
