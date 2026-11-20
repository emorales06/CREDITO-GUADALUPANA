import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginInput, UserDTO } from '@guadalupana/shared';
import { api, setUnauthorizedHandler } from '../api/client.ts';

interface AuthState {
  user: UserDTO | null;
  loading: boolean;
  login: (input: LoginInput) => Promise<UserDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ user: UserDTO }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.clear();
    });
  }, [qc]);

  const login = useCallback(async (input: LoginInput) => {
    const { user: logged } = await api<{ user: UserDTO }>('/auth/login', { method: 'POST', body: input });
    qc.clear();
    setUser(logged);
    return logged;
  }, [qc]);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.clear();
    setUser(null);
  }, [qc]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
