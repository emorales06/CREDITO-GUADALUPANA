import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import type { Role } from '@guadalupana/shared';
import { ApiError } from './api/client.ts';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import { Layout } from './components/Layout.tsx';
import { Spinner, ToastProvider } from './components/ui.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { MyRequestsPage } from './pages/MyRequestsPage.tsx';
import { NewRequestPage } from './pages/NewRequestPage.tsx';
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

const homeFor = (role: Role) => (role === 'ANALISTA' ? '/panel' : '/solicitudes/nueva');

/** Guardas de navegación (solo UX): la autorización real la aplica el servidor. */
function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={homeFor(user.role)} replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="login"><Spinner /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={homeFor(user.role)} replace /> : <LoginPage />} />
      <Route element={user ? <Layout /> : <Navigate to="/login" replace />}>
        <Route path="/solicitudes/nueva" element={<RequireRole role="SOLICITANTE"><NewRequestPage /></RequireRole>} />
        <Route path="/solicitudes" element={<RequireRole role="SOLICITANTE"><MyRequestsPage /></RequireRole>} />
        <Route path="/panel" element={<RequireRole role="ANALISTA"><DashboardPage /></RequireRole>} />
        <Route path="/auditoria" element={<RequireRole role="ANALISTA"><AuditPage /></RequireRole>} />
      </Route>
      <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
