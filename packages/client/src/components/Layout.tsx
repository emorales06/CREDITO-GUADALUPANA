import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ROLE_LABELS, type Role } from '@guadalupana/shared';
import { useAuth } from '../auth/AuthContext.tsx';
import { useServerEvents } from '../realtime/useServerEvents.ts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { ChangePasswordForm } from './auth.tsx';
import { Dialog, Icon, Stripes, initials, type IconName } from './ui.tsx';

const LINKS: Record<Role, ReadonlyArray<{ to: string; label: string; icon: IconName }>> = {
  SOLICITANTE: [
    { to: '/solicitudes/nueva', label: 'Nueva solicitud', icon: 'plus' },
    { to: '/solicitudes', label: 'Mis solicitudes', icon: 'list' },
  ],
  ANALISTA: [
    { to: '/panel', label: 'Panel', icon: 'chart' },
    { to: '/auditoria', label: 'Auditoría', icon: 'shield' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Resumen', icon: 'grid' },
    { to: '/panel', label: 'Solicitudes', icon: 'chart' },
    { to: '/auditoria', label: 'Auditoría', icon: 'shield' },
    { to: '/admin/usuarios', label: 'Usuarios', icon: 'users' },
    { to: '/admin/apariencia', label: 'Apariencia', icon: 'palette' },
  ],
};

export function Layout() {
  const { user, logout } = useAuth();
  const { theme, logo, logoOnBrand } = useTheme();
  const live = useServerEvents(user !== null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  if (!user) return null;
  const onBrandHeader = theme.headerStyle === 'marca';
  const headerLogo = onBrandHeader ? logoOnBrand.src : logo;

  return (
    <>
      <div className="topbar">
        <div className="topbar__inner">
          <span className="topbar__app">{theme.appName}</span>
          <span className={`live live--${live === 'live' ? 'on' : live}`} title="Actualizaciones en tiempo real">
            <i className="live__dot" /> {live === 'live' ? 'En vivo' : live === 'connecting' ? 'Conectando…' : 'Sin conexión'}
          </span>
        </div>
      </div>
      <header className="app-header">
        <div className="app-header__inner">
          <img src={headerLogo} alt="Cooperativa Guadalupana" className="brand-logo"
            style={onBrandHeader && logoOnBrand.custom ? { background: '#fff', padding: 4, borderRadius: 8 } : undefined} />
          <nav className="nav" aria-label="Principal">
            {LINKS[user.role].map((l) => (
              <NavLink key={l.to} to={l.to} end title={l.label}>
                <Icon name={l.icon} size={17} /> <span className="nav__label">{l.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="user-menu" ref={menuRef}>
            <button type="button" className="user-menu__btn" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
              <span className="avatar" aria-hidden="true">{initials(user.fullName)}</span>
              <span className="user-menu__meta">
                <span className="user-menu__name">{user.fullName}</span>
                <span className="user-menu__role">{ROLE_LABELS[user.role]}</span>
              </span>
              <Icon name="chevron" size={16} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div className="menu" role="menu" initial={{ opacity: 0, scale: 0.97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }} transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setPwdOpen(true); }}>
                    <Icon name="key" /> Cambiar contraseña
                  </button>
                  <hr />
                  <button type="button" role="menuitem" onClick={() => void logout()}>
                    <Icon name="logout" /> Cerrar sesión
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>
      <div className="shell">
        <div className="hero-band" aria-hidden="true"><Stripes /></div>
        <Outlet />
      </div>

      <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} labelledBy="pwd-title">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 id="pwd-title" className="title-2">Cambiar contraseña</h2>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setPwdOpen(false)}><Icon name="x" /></button>
        </div>
        <ChangePasswordForm onDone={() => setPwdOpen(false)} />
      </Dialog>
    </>
  );
}
