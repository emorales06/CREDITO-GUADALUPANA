import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AdminAuditDTO,
  AdminCreateUserInput,
  AdminOverviewDTO,
  AdminUpdateUserInput,
  AdminUserDTO,
  PasswordResetRequestDTO,
  ThemeSettings,
} from '@guadalupana/shared';
import { themeKey } from '../theme/ThemeProvider.tsx';
import { api } from './client.ts';

const adminKeys = {
  overview: ['admin', 'overview'] as const,
  users: ['admin', 'users'] as const,
  resets: ['admin', 'resets'] as const,
  audit: ['admin', 'audit'] as const,
};

export const useAdminOverview = () =>
  useQuery({ queryKey: adminKeys.overview, queryFn: () => api<{ overview: AdminOverviewDTO }>('/admin/overview').then((r) => r.overview), refetchInterval: 15_000 });

export const useAdminUsers = () =>
  useQuery({ queryKey: adminKeys.users, queryFn: () => api<{ users: AdminUserDTO[] }>('/admin/users').then((r) => r.users) });

export const useResetRequests = () =>
  useQuery({ queryKey: adminKeys.resets, queryFn: () => api<{ requests: PasswordResetRequestDTO[] }>('/admin/password-resets').then((r) => r.requests), refetchInterval: 20_000 });

export const useAdminAudit = () =>
  useQuery({ queryKey: adminKeys.audit, queryFn: () => api<{ entries: AdminAuditDTO[] }>('/admin/audit?limit=100').then((r) => r.entries) });

function useAdminMutation<TVars, TResult>(fn: (v: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });
}

export const useCreateUser = () =>
  useAdminMutation((input: AdminCreateUserInput) =>
    api<{ user: AdminUserDTO; temporaryPassword: string }>('/admin/users', { method: 'POST', body: input }));

export const useUpdateUser = () =>
  useAdminMutation(({ id, changes }: { id: number; changes: AdminUpdateUserInput }) =>
    api<{ user: AdminUserDTO }>(`/admin/users/${id}`, { method: 'PATCH', body: changes }).then((r) => r.user));

export const useResetPassword = () =>
  useAdminMutation((id: number) =>
    api<{ user: AdminUserDTO; temporaryPassword: string }>(`/admin/users/${id}/reset-password`, { method: 'POST' }));

export const useDismissReset = () =>
  useAdminMutation((id: number) => api<void>(`/admin/password-resets/${id}/dismiss`, { method: 'POST' }));

export function useSaveTheme() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (theme: ThemeSettings | 'reset') =>
      theme === 'reset'
        ? api<{ theme: ThemeSettings }>('/admin/settings/theme/reset', { method: 'POST' }).then((r) => r.theme)
        : api<{ theme: ThemeSettings }>('/admin/settings/theme', { method: 'PUT', body: theme }).then((r) => r.theme),
    onSuccess: (theme) => {
      qc.setQueryData(themeKey, theme);
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });
}
