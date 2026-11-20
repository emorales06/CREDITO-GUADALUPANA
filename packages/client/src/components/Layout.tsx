import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { useServerEvents } from '../realtime/useServerEvents.ts';
import { Icon } from './ui.tsx';

const initials = (name: string) =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function Layout() {
  const { user, logout } = useAuth();
  const live = useServerEvents(user !== null);
  if (!user) return null;

  const links =
    user.role === 'ANALISTA'
      ? [{ to: '/panel', label: 'Panel' }, { to: '/auditoria', label: 'Auditoría' }]
      : [{ to: '/solicitudes/nueva', label: 'Nueva solicitud' }, { to: '/solicitudes', label: 'Mis solicitudes' }];

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <img src="/logo.png" alt="Cooperativa Guadalupana" className="brand-logo" />
          <nav className="nav" aria-label="Principal">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end>{l.label}</NavLink>
            ))}
          </nav>
          <div className="header-right">
            <span className={`live live--${live === 'live' ? 'on' : live}`} title="Actualizaciones en tiempo real">
              <i className="live__dot" /> <span>{live === 'live' ? 'En vivo' : live === 'connecting' ? 'Conectando' : 'Sin conexión'}</span>
            </span>
            <div className="user-chip">
              <div className="avatar" aria-hidden="true">{initials(user.fullName)}</div>
              <div className="user-chip__meta">
                <div className="user-chip__name">{user.fullName}</div>
                <div className="user-chip__role">{user.role === 'ANALISTA' ? 'Analista' : 'Solicitante'}</div>
              </div>
            </div>
            <button type="button" className="icon-btn" onClick={() => void logout()} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </header>
      <Outlet />
    </>
  );
}
