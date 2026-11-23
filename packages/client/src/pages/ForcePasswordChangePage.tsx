import { useAuth } from '../auth/AuthContext.tsx';
import { AuthShell, ChangePasswordForm } from '../components/auth.tsx';
import { Banner } from '../components/ui.tsx';

/** Tras una contraseña temporal el servidor bloquea toda la API excepto este cambio. */
export function ForcePasswordChangePage() {
  const { user, logout } = useAuth();
  return (
    <AuthShell>
      <h2 className="large-title" style={{ margin: '0 0 6px' }}>Defina su contraseña</h2>
      <p className="muted" style={{ margin: '0 0 18px' }}>
        Hola{user ? `, ${user.fullName.split(' ')[0]}` : ''}. Ingresó con una contraseña temporal; elija una nueva para continuar.
      </p>
      <div style={{ marginBottom: 16 }}>
        <Banner tone="info">Use la contraseña temporal que le entregó el administrador como contraseña actual.</Banner>
      </div>
      <ChangePasswordForm onDone={() => undefined} submitLabel="Guardar y continuar" />
      <div className="auth__links">
        <button type="button" className="btn btn-plain" style={{ padding: 0 }} onClick={() => void logout()}>Salir</button>
      </div>
    </AuthShell>
  );
}
