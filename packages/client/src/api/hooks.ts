import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AuditEntryDTO,
  BudgetDTO,
  CreateRequestInput,
  CreditRequestDTO,
  Eligibility,
  RequestStatus,
} from '@guadalupana/shared';
import { api } from './client.ts';

export const keys = {
  requests: ['requests'] as const,
  request: (id: number) => ['requests', 'detail', id] as const,
  requestAudit: (id: number) => ['audit', 'request', id] as const,
  audit: ['audit'] as const,
  budget: ['budget'] as const,
  eligibility: (doc: string) => ['eligibility', doc] as const,
};

export const useRequests = (status?: RequestStatus) =>
  useQuery({
    queryKey: [...keys.requests, 'list', status ?? 'ALL'],
    queryFn: () => api<{ requests: CreditRequestDTO[] }>(`/requests${status ? `?status=${status}` : ''}`).then((r) => r.requests),
  });

export const useRequest = (id: number | null) =>
  useQuery({
    queryKey: keys.request(id ?? 0),
    queryFn: () => api<{ request: CreditRequestDTO }>(`/requests/${id}`).then((r) => r.request),
    enabled: id !== null,
  });

export const useRequestAudit = (id: number | null) =>
  useQuery({
    queryKey: keys.requestAudit(id ?? 0),
    queryFn: () => api<{ entries: AuditEntryDTO[] }>(`/requests/${id}/audit`).then((r) => r.entries),
    enabled: id !== null,
  });

export const useAudit = () =>
  useQuery({
    queryKey: keys.audit,
    queryFn: () => api<{ entries: AuditEntryDTO[] }>('/audit?limit=300').then((r) => r.entries),
  });

export const useBudget = () =>
  useQuery({
    queryKey: keys.budget,
    queryFn: () => api<{ budget: BudgetDTO }>('/budget').then((r) => r.budget),
  });

export const useEligibility = (documentId: string | null) =>
  useQuery({
    queryKey: keys.eligibility(documentId ?? ''),
    queryFn: () => api<Eligibility>(`/requests/eligibility?documentId=${encodeURIComponent(documentId ?? '')}`),
    enabled: documentId !== null,
    staleTime: 10_000,
  });

export function useCreateRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRequestInput) =>
      api<{ request: CreditRequestDTO }>('/requests', { method: 'POST', body: input }).then((r) => r.request),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.requests });
      void qc.invalidateQueries({ queryKey: ['eligibility'] });
    },
  });
}

type Action =
  | { kind: 'review' }
  | { kind: 'approve'; idempotencyKey: string }
  | { kind: 'reject'; idempotencyKey: string; reason: string }
  | { kind: 'retry-bureau' };

const actionPath: Record<Action['kind'], string> = {
  review: 'review',
  approve: 'approve',
  reject: 'reject',
  'retry-bureau': 'bureau/retry',
};

export function useRequestAction(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: Action) =>
      api<{ request: CreditRequestDTO }>(`/requests/${id}/${actionPath[action.kind]}`, {
        method: 'POST',
        ...(action.kind === 'reject' ? { body: { reason: action.reason } } : {}),
        ...('idempotencyKey' in action ? { headers: { 'Idempotency-Key': action.idempotencyKey } } : {}),
      }).then((r) => r.request),
    onSuccess: (request) => qc.setQueryData(keys.request(id), request),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.requests });
      void qc.invalidateQueries({ queryKey: keys.budget });
      void qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });
}
