import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.tsx';
import { useServerEvents } from '../realtime/useServerEvents.ts';
import { Icon, initials, type IconName } from './ui.tsx';

export function Layout() {
  const { user, logout } = useAuth();
  const live = useServerEvents(user !== null);
  if (!user) return null;

  const links: ReadonlyArray<{ to: string; label: string; icon: IconName }> =
    user.role === 'ANALISTA'
      ? [{ to: '/panel', label: 'Panel', icon: 'chart' }, { to: '/auditoria', label: 'Auditoría', icon: 'shield' }]
      : [{ to: '/solicitudes/nueva', label: 'Nueva solicitud', icon: 'plus' }, { to: '/solicitudes', label: 'Mis solicitudes', icon: 'list' }];

  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <img src="/logo-white.png" alt="Cooperativa Guadalupana" className="brand-logo" />
          <nav className="nav" aria-label="Principal">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end>
                <Icon name={l.icon} size={16} /> {l.label}
              </NavLink>
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
            <button type="button" className="icon-btn icon-btn--light" onClick={() => void logout()} aria-label="Cerrar sesión" title="Cerrar sesión">
              <Icon name="logout" size={16} />
            </button>
          </div>
        </div>
      </header>
      <div className="shell">
        <div className="hero-band" aria-hidden="true" />
        <Outlet />
      </div>
    </>
  );
}
