import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { Role } from '@guadalupana/shared';
import { ApiError } from './api/client.ts';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import { Splash } from './components/auth.tsx';
import { Layout } from './components/Layout.tsx';
import { ToastProvider } from './components/ui.tsx';
import { AdminAppearancePage } from './pages/admin/AdminAppearancePage.tsx';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage.tsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ForcePasswordChangePage } from './pages/ForcePasswordChangePage.tsx';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { MyRequestsPage } from './pages/MyRequestsPage.tsx';
import { NewRequestPage } from './pages/NewRequestPage.tsx';
import { PendingApprovalPage } from './pages/PendingApprovalPage.tsx';
import { RegisterPage } from './pages/RegisterPage.tsx';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import '@fontsource-variable/inter';
import '@fontsource-variable/montserrat';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      // Solo se reintentan fallos transitorios (red / 5xx), nunca errores de negocio o permisos.
      retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
    },
  },
});

const HOME: Record<Role, string> = { SOLICITANTE: '/solicitudes/nueva', ANALISTA: '/panel', ADMIN: '/admin' };

/** Guardas de navegación (solo experiencia de usuario): la autorización real la aplica el servidor. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === null) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={HOME[user.role]} replace />;
  return children;
}

function AppRoutes() {
  const { user, splash, leaving } = useAuth();
  const message = leaving
    ? 'Cerrando sesión de forma segura…'
    : user?.role === null ? 'Verificando el estado de su cuenta…'
    : user ? `Preparando el espacio de ${user.fullName.split(' ')[0]}…` : 'Cargando…';
  const home = user?.role ? HOME[user.role] : '/login';

  return (
    <>
      <Splash show={splash} message={message} />
      {splash && !user ? null : user?.mustChangePassword ? (
        <ForcePasswordChangePage />
      ) : user && user.role === null ? (
        <PendingApprovalPage />
      ) : (
        <Routes>
          <Route path="/login" element={user ? <Navigate to={home} replace /> : <LoginPage />} />
          <Route path="/registro" element={user ? <Navigate to={home} replace /> : <RegisterPage />} />
          <Route path="/recuperar" element={user ? <Navigate to={home} replace /> : <ForgotPasswordPage />} />
          <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
            <Route path="/solicitudes/nueva" element={<RequireRole roles={['SOLICITANTE']}><NewRequestPage /></RequireRole>} />
            <Route path="/solicitudes" element={<RequireRole roles={['SOLICITANTE']}><MyRequestsPage /></RequireRole>} />
            <Route path="/panel" element={<RequireRole roles={['ANALISTA', 'ADMIN']}><DashboardPage /></RequireRole>} />
            <Route path="/auditoria" element={<RequireRole roles={['ANALISTA', 'ADMIN']}><AuditPage /></RequireRole>} />
            <Route path="/admin" element={<RequireRole roles={['ADMIN']}><AdminOverviewPage /></RequireRole>} />
            <Route path="/admin/usuarios" element={<RequireRole roles={['ADMIN']}><AdminUsersPage /></RequireRole>} />
            <Route path="/admin/apariencia" element={<RequireRole roles={['ADMIN']}><AdminAppearancePage /></RequireRole>} />
          </Route>
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
      )}
    </>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <BrowserRouter>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </BrowserRouter>
          </ToastProvider>
        </MotionConfig>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
