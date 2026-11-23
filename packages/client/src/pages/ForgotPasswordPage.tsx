import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { forgotPasswordSchema } from '@guadalupana/shared';
import { api } from '../api/client.ts';
import { AuthShell } from '../components/auth.tsx';
import { Banner, Icon, Spinner } from '../components/ui.tsx';

/**
 * Sin correo electrónico en el sistema, la recuperación es asistida: la solicitud llega al administrador,
 * que emite una contraseña temporal; al entrar, el sistema obliga a cambiarla.
 */
export function ForgotPasswordPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ username });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: parsed.data });
      setSent(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar la solicitud');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h2 className="large-title" style={{ margin: '0 0 6px' }}>Recuperar acceso</h2>
      <p className="muted" style={{ margin: '0 0 22px' }}>
        Indique su usuario. Un administrador revisará la solicitud y le entregará una contraseña temporal que deberá cambiar al entrar.
      </p>

      {sent ? (
        <div className="grid" style={{ gap: 16 }}>
          <Banner tone="ok" title="Solicitud registrada">{sent}</Banner>
          <Link to="/login" className="btn btn-primary btn-block">Volver a iniciar sesión</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }} noValidate>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <div className="input-wrap">
              <span className="lead-icon"><Icon name="user" /></span>
              <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>{busy && <Spinner />} Solicitar restablecimiento</button>
        </form>
      )}

      <div className="auth__links"><Link to="/login">Volver al inicio de sesión</Link></div>
    </AuthShell>
  );
}
