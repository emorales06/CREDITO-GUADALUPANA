import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { loginSchema } from '@guadalupana/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { Banner, Icon, Spinner, easeOut, initials, spring, type IconName } from '../components/ui.tsx';

// Usuarios de demostración (también documentados en el README). El servidor valida la contraseña.
const DEMO_USERS = [
  { username: 'ana.lopez', password: 'Analista2026!', name: 'Ana López', role: 'Analista' },
  { username: 'carlos.mendez', password: 'Analista2026!', name: 'Carlos Méndez', role: 'Analista' },
  { username: 'juan.perez', password: 'Socio2026!', name: 'Juan Pérez', role: 'Solicitante' },
  { username: 'maria.garcia', password: 'Socio2026!', name: 'María García', role: 'Solicitante' },
];

const FEATURES: ReadonlyArray<{ icon: IconName; title: string; text: string }> = [
  { icon: 'calc', title: 'Simulación al instante', text: 'Tabla de amortización con cuota fija al 1.5 % mensual.' },
  { icon: 'activity', title: 'Buró crediticio en tiempo real', text: 'Consulta resiliente con reintentos automáticos.' },
  { icon: 'shield', title: 'Aprobación segura y auditada', text: 'Sin dobles desembolsos y con trazabilidad inmutable.' },
];

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  async function submit(credentials: { username: string; password: string }, source: string) {
    const parsed = loginSchema.safeParse(credentials);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setBusyUser(source);
    setError(null);
    try {
      const user = await login(parsed.data);
      navigate(user.role === 'ANALISTA' ? '/panel' : '/solicitudes/nueva', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setBusyUser(null);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit({ username, password }, 'form');
  };

  return (
    <main className="login">
      <section className="login__brand">
        <img src="/logo-white.png" alt="Cooperativa Guadalupana" className="login__brand-logo" />
        <div>
          <motion.h1 className="login__headline" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: easeOut }}>
            Créditos y desembolsos, <span>con total trazabilidad.</span>
          </motion.h1>
          <p className="login__lead">Registre solicitudes, consulte el buró y apruebe desembolsos desde un solo lugar.</p>
          <div className="features">
            {FEATURES.map((f, i) => (
              <motion.div key={f.title} className="feature" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: easeOut, delay: 0.15 + i * 0.06 }}>
                <span className="feature__icon"><Icon name={f.icon} size={20} /></span>
                <div><b>{f.title}</b><span>{f.text}</span></div>
              </motion.div>
            ))}
          </div>
        </div>
        <span className="login__legal">Entorno de demostración · Prueba técnica Full-Stack</span>
      </section>

      <section className="login__form-side">
        <motion.div className="card login__card" initial={{ opacity: 0, y: 12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={spring}>
          <span className="eyebrow">Bienvenido</span>
          <h2 className="large-title" style={{ margin: '4px 0 6px' }}>Iniciar sesión</h2>
          <p className="muted" style={{ margin: '0 0 22px' }}>Ingrese sus credenciales para continuar.</p>

          <form onSubmit={onSubmit} className="grid" style={{ gap: 14 }} noValidate>
            {error && <Banner tone="error" title="No se pudo iniciar sesión">{error}</Banner>}
            <div className="field">
              <label htmlFor="username">Usuario</label>
              <div className="input-wrap">
                <span className="lead-icon"><Icon name="user" size={18} /></span>
                <input id="username" className="input" autoComplete="username" placeholder="Ingrese su usuario" value={username} onChange={(e) => setUsername(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="password">Contraseña</label>
              <div className="input-wrap">
                <span className="lead-icon"><Icon name="lock" size={18} /></span>
                <input id="password" className="input" type="password" autoComplete="current-password" placeholder="Ingrese su contraseña" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busyUser !== null} style={{ marginTop: 4 }}>
              {busyUser === 'form' && <Spinner />} Ingresar
            </button>
          </form>

          <div className="divider">Acceso rápido de prueba</div>
          <div className="demo-users">
            {DEMO_USERS.map((u) => (
              <button key={u.username} type="button" className="demo-user" disabled={busyUser !== null}
                onClick={() => { setUsername(u.username); setPassword(u.password); void submit({ username: u.username, password: u.password }, u.username); }}>
                <span className={`avatar${u.role === 'Analista' ? ' avatar--analyst' : ''}`}>
                  {busyUser === u.username ? <Spinner size={14} /> : initials(u.name)}
                </span>
                <span style={{ textTransform: 'none', letterSpacing: 0 }}>
                  <b>{u.name}</b>
                  <span>{u.role}</span>
                </span>
              </button>
            ))}
          </div>
        </motion.div>
      </section>
    </main>
  );
}
