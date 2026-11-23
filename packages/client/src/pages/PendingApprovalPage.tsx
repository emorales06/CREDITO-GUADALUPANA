import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useAuth } from '../auth/AuthContext.tsx';
import { AuthShell } from '../components/auth.tsx';
import { Banner, Icon, Spinner } from '../components/ui.tsx';

const POLL_MS = 8000;

/**
 * Pantalla de espera para cuentas registradas sin rol. El servidor bloquea toda la API (403 ROLE_PENDING);
 * aquí solo se consulta la propia sesión hasta que un administrador asigne el rol.
 */
export function PendingApprovalPage() {
  const { user, refresh, logout } = useAuth();
  const reduce = useReducedMotion();
  const [checking, setChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(() => new Date());

  const check = async () => {
    setChecking(true);
    await refresh();
    setLastCheck(new Date());
    setChecking(false);
  };

  useEffect(() => {
    const id = setInterval(() => void check(), POLL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthShell>
      <div style={{ display: 'grid', justifyItems: 'start', gap: 6 }}>
        <span className="pending-mark" aria-hidden="true">
          <motion.span className="pending-mark__ring" animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 2.4, ease: 'linear', repeat: Infinity }} />
          <Icon name="clock" size={24} />
        </span>
        <h2 className="large-title" style={{ margin: '10px 0 0' }}>Cuenta en revisión</h2>
        <p className="muted" style={{ margin: '0 0 18px' }}>
          Hola{user ? `, ${user.fullName.split(' ')[0]}` : ''}. Su cuenta <b>@{user?.username}</b> se creó correctamente.
          Un administrador debe asignarle un rol antes de que pueda usar el sistema.
        </p>
      </div>

      <ol className="pending-steps">
        <li className="done"><Icon name="check" size={16} /> Cuenta creada</li>
        <li className="active">{reduce ? <Icon name="clock" size={16} /> : <Spinner size={14} />} Esperando asignación de rol</li>
        <li><Icon name="user" size={16} /> Acceso a su espacio de trabajo</li>
      </ol>

      <div style={{ margin: '18px 0' }}>
        <Banner tone="info">Esta pantalla se actualiza sola cada pocos segundos; puede dejarla abierta.</Banner>
      </div>

      <div className="dialog__actions">
        <button type="button" className="btn btn-secondary" onClick={() => void logout()}>Salir</button>
        <button type="button" className="btn btn-primary" disabled={checking} onClick={() => void check()}>
          {checking ? <Spinner /> : <Icon name="refresh" size={16} />} Comprobar ahora
        </button>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Última comprobación: {lastCheck.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>
    </AuthShell>
  );
}
