import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { loginSchema } from '@guadalupana/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { AuthShell, PasswordField } from '../components/auth.tsx';
import { Banner, Icon, Spinner, initials } from '../components/ui.tsx';

// Usuarios de demostración (también documentados en el README). El servidor valida cada contraseña.
const DEMO_USERS = [
  { username: 'admin', password: 'Admin2026!', name: 'Administración', role: 'Administrador' },
  { username: 'ana.lopez', password: 'Analista2026!', name: 'Ana López', role: 'Analista' },
  { username: 'carlos.mendez', password: 'Analista2026!', name: 'Carlos Méndez', role: 'Analista' },
  { username: 'juan.perez', password: 'Socio2026!', name: 'Juan Pérez', role: 'Solicitante' },
];

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(credentials: { username: string; password: string }, source: string) {
    const parsed = loginSchema.safeParse(credentials);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setBusy(source);
    setError(null);
    try {
      await login(parsed.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
      setBusy(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit({ username, password }, 'form');
  };

  return (
    <AuthShell>
      <h2 className="large-title" style={{ margin: '0 0 6px' }}>Iniciar sesión</h2>
      <p className="muted" style={{ margin: '0 0 22px' }}>Ingrese sus credenciales para continuar.</p>

      <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }} noValidate>
        {error && <Banner tone="error" title="No se pudo iniciar sesión">{error}</Banner>}
        <div className="field">
          <label htmlFor="username">Usuario</label>
          <div className="input-wrap">
            <span className="lead-icon"><Icon name="user" /></span>
            <input id="username" className="input" autoComplete="username" placeholder="Ingrese su usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
        </div>
        <PasswordField id="password" label="Contraseña" value={password} onChange={setPassword} autoComplete="current-password" />
        <button type="submit" className="btn btn-primary btn-block" disabled={busy !== null} style={{ marginTop: 4 }}>
          {busy === 'form' && <Spinner />} Ingresar
        </button>
      </form>

      <div className="auth__links">
        <Link to="/recuperar">¿Olvidó su contraseña?</Link>
        <Link to="/registro">Crear una cuenta</Link>
      </div>

      <div className="divider">Acceso rápido de prueba</div>
      <div className="demo-users">
        {DEMO_USERS.map((u) => (
          <button key={u.username} type="button" className="demo-user" disabled={busy !== null}
            onClick={() => { setUsername(u.username); setPassword(u.password); void submit({ username: u.username, password: u.password }, u.username); }}>
            <span className={`avatar${u.role === 'Solicitante' ? ' avatar--soft' : ''}`}>
              {busy === u.username ? <Spinner size={14} /> : initials(u.name)}
            </span>
            <span><b>{u.name}</b><span>{u.role}</span></span>
          </button>
        ))}
      </div>
    </AuthShell>
  );
}
