import { useState, type FormEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { z } from 'zod';
import { PASSWORD_RULES, changePasswordSchema } from '@guadalupana/shared';
import { ApiError } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { Banner, Icon, Spinner, Stripes, easeOut, spring, useToast, type IconName } from './ui.tsx';

/** Pantalla de carga de marca entre el acceso y el espacio de trabajo. */
export function Splash({ show, message }: { show: boolean; message: string }) {
  const { logoOnBrand } = useTheme();
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="splash" role="status" aria-live="polite" initial={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35, ease: easeOut }}>
          <Stripes />
          <Stripes className="stripes--top" />
          <motion.div className="splash__inner" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: easeOut }}>
            <img src={logoOnBrand.src} alt="Cooperativa Guadalupana" className={`splash__logo${logoOnBrand.custom ? ' splash__logo--custom' : ''}`} />
            <div className="splash__bar" aria-hidden="true">
              <motion.i initial={{ scaleX: reduce ? 1 : 0.08 }} animate={{ scaleX: 1 }} transition={{ duration: reduce ? 0 : 1, ease: easeOut }} />
            </div>
            <span className="splash__text">{message}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const FEATURES: ReadonlyArray<{ icon: IconName; title: string; text: string }> = [
  { icon: 'calc', title: 'Simulación al instante', text: 'Tabla de amortización con cuota fija al 1.5 % mensual.' },
  { icon: 'activity', title: 'Buró crediticio en tiempo real', text: 'Consulta resiliente con reintentos automáticos.' },
  { icon: 'shield', title: 'Aprobación segura y auditada', text: 'Sin dobles desembolsos y con trazabilidad inmutable.' },
];

/** Columna de marca + tarjeta: estructura compartida por acceso, registro y recuperación. */
export function AuthShell({ children }: { children: ReactNode }) {
  const { logoOnBrand } = useTheme();
  return (
    <main className="auth">
      <section className="auth__brand">
        <Stripes />
        <Stripes className="stripes--bottom" />
        <img src={logoOnBrand.src} alt="Cooperativa Guadalupana" className={`auth__logo${logoOnBrand.custom ? ' auth__logo--custom' : ''}`} />
        <div>
          <h1 className="auth__headline">Créditos y desembolsos, <span>con total trazabilidad.</span></h1>
          <p className="auth__lead">Registre solicitudes, consulte el buró y apruebe desembolsos desde un solo lugar.</p>
          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f.title} className="feature">
                <Icon name={f.icon} size={22} />
                <div><b>{f.title}</b><span>{f.text}</span></div>
              </li>
            ))}
          </ul>
        </div>
        <span className="auth__legal">Entorno de demostración · Prueba técnica Full-Stack</span>
      </section>
      <section className="auth__side">
        <motion.div className="card auth__card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
          {children}
        </motion.div>
      </section>
    </main>
  );
}

/** Campo de contraseña con botón mostrar/ocultar y, opcionalmente, la lista de requisitos en vivo. */
export function PasswordField({ id, label, value, onChange, autoComplete, error, showRules = false }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete: string; error?: string | undefined; showRules?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap">
        <span className="lead-icon"><Icon name="lock" /></span>
        <input id={id} className="input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} value={value}
          aria-invalid={error ? true : undefined} style={{ paddingRight: 46 }} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="icon-btn trail" onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={visible}>
          <Icon name={visible ? 'eyeOff' : 'eye'} />
        </button>
      </div>
      {error && <span className="error"><Icon name="alert" size={14} /> {error}</span>}
      {showRules && (
        <ul className="rules" aria-label="Requisitos de la contraseña">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(value);
            return <li key={r.id} className={ok ? 'ok' : ''}><Icon name={ok ? 'check' : 'info'} size={13} /> {r.label}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export const firstErrors = (fields: Record<string, string[] | undefined>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v?.[0]])) as Record<string, string | undefined>;

/** Cambio de contraseña: se usa en el diálogo del menú y en la pantalla obligatoria tras una contraseña temporal. */
export function ChangePasswordForm({ onDone, submitLabel = 'Guardar contraseña' }: { onDone: () => void; submitLabel?: string }) {
  const { changePassword } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = changePasswordSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(firstErrors(z.flattenError(parsed.error).fieldErrors));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      await changePassword(parsed.data);
      toast('Contraseña actualizada', 'ok', 'Las demás sesiones abiertas se cerraron por seguridad.');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setErrors(firstErrors(err.fields));
      else setErrors({ form: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid" style={{ gap: 14 }} onSubmit={submit} noValidate>
      {errors.form && <Banner tone="error">{errors.form}</Banner>}
      <PasswordField id="currentPassword" label="Contraseña actual" value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" error={errors.currentPassword} />
      <PasswordField id="newPassword" label="Nueva contraseña" value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" error={errors.newPassword} showRules />
      <PasswordField id="confirmPassword" label="Confirmar nueva contraseña" value={form.confirmPassword} onChange={set('confirmPassword')} autoComplete="new-password" error={errors.confirmPassword} />
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy && <Spinner />} {submitLabel}</button>
    </form>
  );
}
