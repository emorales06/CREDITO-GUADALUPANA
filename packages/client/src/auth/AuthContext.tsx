import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordInput, LoginInput, RegisterInput, UserDTO } from '@guadalupana/shared';
import { api, setUnauthorizedHandler } from '../api/client.ts';

/** Duración mínima de la pantalla de carga: suficiente para leerse, no tanto como para estorbar. */
const SPLASH_MIN_MS = 1100;

interface AuthState {
  user: UserDTO | null;
  /** true mientras se resuelve la sesión inicial o tras iniciar sesión (pantalla de carga). */
  splash: boolean;
  login: (input: LoginInput) => Promise<UserDTO>;
  register: (input: RegisterInput) => Promise<UserDTO>;
  changePassword: (input: ChangePasswordInput) => Promise<UserDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<UserDTO | null>(null);
  const [splash, setSplash] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const holdSplash = useCallback((ms: number) => {
    setSplash(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSplash(false), ms);
  }, []);

  useEffect(() => {
    const started = Date.now();
    api<{ user: UserDTO }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => holdSplash(Math.max(0, 600 - (Date.now() - started))));
    return () => clearTimeout(timer.current);
  }, [holdSplash]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'theme' });
    });
  }, [qc]);

  const enter = useCallback((next: UserDTO) => {
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'theme' });
    holdSplash(SPLASH_MIN_MS);
    setUser(next);
    return next;
  }, [qc, holdSplash]);

  const login = useCallback(async (input: LoginInput) => {
    const { user: logged } = await api<{ user: UserDTO }>('/auth/login', { method: 'POST', body: input });
    return enter(logged);
  }, [enter]);

  const register = useCallback(async (input: RegisterInput) => {
    const { user: created } = await api<{ user: UserDTO }>('/auth/register', { method: 'POST', body: input });
    return enter(created);
  }, [enter]);

  const changePassword = useCallback(async (input: ChangePasswordInput) => {
    const { user: updated } = await api<{ user: UserDTO }>('/auth/change-password', { method: 'POST', body: input });
    setUser(updated);
    return updated;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'theme' });
    setUser(null);
  }, [qc]);

  const value = useMemo(() => ({ user, splash, login, register, changePassword, logout }), [user, splash, login, register, changePassword, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
