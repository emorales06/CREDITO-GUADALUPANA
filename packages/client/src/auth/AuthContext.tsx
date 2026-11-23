import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordInput, LoginInput, RegisterInput, UserDTO } from '@guadalupana/shared';
import { api, setUnauthorizedHandler } from '../api/client.ts';

/** Duración mínima de la pantalla de carga: suficiente para leerse, no tanto como para estorbar. */
const SPLASH_MIN_MS = 1100;
const LOGOUT_MS = 900;
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

interface AuthState {
  user: UserDTO | null;
  /** true mientras se resuelve la sesión inicial, al entrar o al salir (pantalla de carga). */
  splash: boolean;
  /** true durante la salida, para que la pantalla de carga diga "Cerrando sesión". */
  leaving: boolean;
  /** Vuelve a consultar la sesión (p. ej. una cuenta en espera de que le asignen rol). */
  refresh: () => Promise<UserDTO | null>;
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
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const userRef = useRef(user);
  userRef.current = user;

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

  const refresh = useCallback(async () => {
    const next = await api<{ user: UserDTO }>('/auth/me').then((r) => r.user).catch(() => null);
    // Al recibir su primer rol, la cuenta pasa por la pantalla de carga hacia su espacio de trabajo.
    if (userRef.current?.role === null && next?.role) holdSplash(SPLASH_MIN_MS);
    setUser(next);
    return next;
  }, [holdSplash]);

  /** Salida con pantalla de marca: la sesión se cierra en el servidor mientras se muestra. */
  const logout = useCallback(async () => {
    clearTimeout(timer.current);
    setLeaving(true);
    setSplash(true);
    await Promise.all([api('/auth/logout', { method: 'POST' }).catch(() => undefined), wait(LOGOUT_MS)]);
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'theme' });
    setUser(null);
    holdSplash(250);
    // El texto de salida se mantiene hasta que termina el desvanecimiento.
    setTimeout(() => setLeaving(false), 700);
  }, [qc, holdSplash]);

  const value = useMemo(
    () => ({ user, splash, leaving, refresh, login, register, changePassword, logout }),
    [user, splash, leaving, refresh, login, register, changePassword, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
