import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { loginSchema } from '@guadalupana/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { Banner, Spinner, spring } from '../components/ui.tsx';

// Usuarios de demostración (también documentados en el README). El servidor valida la contraseña.
const DEMO_USERS = [
  { username: 'ana.lopez', password: 'Analista2026!', name: 'Ana López', role: 'Analista' },
  { username: 'carlos.mendez', password: 'Analista2026!', name: 'Carlos Méndez', role: 'Analista' },
  { username: 'juan.perez', password: 'Socio2026!', name: 'Juan Pérez', role: 'Solicitante' },
  { username: 'maria.garcia', password: 'Socio2026!', name: 'María García', role: 'Solicitante' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(credentials: { username: string; password: string }) {
    const parsed = loginSchema.safeParse(credentials);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await login(parsed.data);
      navigate(user.role === 'ANALISTA' ? '/panel' : '/solicitudes/nueva', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit({ username, password });
  };

  return (
    <main className="login">
      <motion.div className="card login__card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
        <img src="/logo.png" alt="Cooperativa Guadalupana" className="login__logo" />
        <h1 className="title-2" style={{ textAlign: 'center' }}>Créditos y Desembolsos</h1>
        <p className="muted" style={{ textAlign: 'center', margin: '6px 0 24px', fontSize: '0.9375rem' }}>
          Inicie sesión para gestionar solicitudes
        </p>

        <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }} noValidate>
          {error && <Banner tone="error">{error}</Banner>}
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input id="username" className="input" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy && <Spinner />} Iniciar sesión
          </button>
        </form>

        <div className="divider">Usuarios de prueba</div>
        <div className="demo-users">
          {DEMO_USERS.map((u) => (
            <button key={u.username} type="button" className="demo-user" disabled={busy}
              onClick={() => { setUsername(u.username); setPassword(u.password); void submit({ username: u.username, password: u.password }); }}>
              <b>{u.name}</b>
              <span>{u.role}</span>
            </button>
          ))}
        </div>
        <p className="footer-note">Entorno de demostración · Prueba técnica</p>
      </motion.div>
    </main>
  );
}
