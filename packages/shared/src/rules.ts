import { OPEN_STATUSES, STATUS_LABELS, type RequestStatus } from './status.ts';
import type { Cents } from './money.ts';

export const LOAN_TERMS = [6, 12, 24, 36] as const;
export type LoanTerm = (typeof LOAN_TERMS)[number];

export const MONTHLY_INTEREST_RATE = 0.015;
export const MAX_AMOUNT_TO_INCOME_PERCENT = 40;
export const REJECTION_REASON_MIN_LENGTH = 15;
export const RECENT_HISTORY_DAYS = 30;
export const INITIAL_BUDGET_CENTS: Cents = 5_000_000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Monto máximo permitido: 40 % del ingreso mensual declarado (aritmética entera). */
export const maxAmountForIncome = (incomeCents: Cents): Cents =>
  Math.floor((incomeCents * MAX_AMOUNT_TO_INCOME_PERCENT) / 100);

export const exceedsDebtLimit = (amountCents: Cents, incomeCents: Cents): boolean =>
  amountCents * 100 > incomeCents * MAX_AMOUNT_TO_INCOME_PERCENT;

export interface HistoryItem {
  id: number;
  status: RequestStatus;
  createdAt: string;
  /** Fecha de la decisión final (aprobación / rechazo); null mientras esté pendiente. */
  decidedAt: string | null;
}

export interface Eligibility {
  eligible: boolean;
  reason: string | null;
  blockingRequestId: number | null;
}

const isoDate = (iso: string): string => iso.slice(0, 10);

/**
 * Regla de historial reciente. Bloquea la creación si el documento tiene:
 *  - una solicitud RECHAZADA en los últimos 30 días (contados desde la fecha del rechazo), o
 *  - una solicitud pendiente (CREADA / EN_REVISION). Las pendientes bloquean sin importar su
 *    antigüedad: dos solicitudes abiertas para el mismo documento no tienen sentido de negocio,
 *    y la base de datos lo garantiza además con un índice único parcial.
 */
export function evaluateRecentHistory(history: readonly HistoryItem[], now: Date): Eligibility {
  const cutoff = now.getTime() - RECENT_HISTORY_DAYS * DAY_MS;

  const pending = history.find((h) => OPEN_STATUSES.includes(h.status));
  if (pending) {
    return {
      eligible: false,
      blockingRequestId: pending.id,
      reason: `El documento ya tiene la solicitud #${pending.id} pendiente (${STATUS_LABELS[pending.status]}) desde el ${isoDate(pending.createdAt)}. Debe resolverse antes de registrar otra.`,
    };
  }

  const recentRejection = history
    .filter((h) => h.status === 'RECHAZADA')
    .map((h) => ({ ...h, rejectedAt: h.decidedAt ?? h.createdAt }))
    .filter((h) => new Date(h.rejectedAt).getTime() >= cutoff)
    .sort((a, b) => b.rejectedAt.localeCompare(a.rejectedAt))[0];

  if (recentRejection) {
    const availableFrom = new Date(new Date(recentRejection.rejectedAt).getTime() + RECENT_HISTORY_DAYS * DAY_MS);
    return {
      eligible: false,
      blockingRequestId: recentRejection.id,
      reason: `El documento tiene la solicitud #${recentRejection.id} RECHAZADA el ${isoDate(recentRejection.rejectedAt)}. Podrá solicitar nuevamente a partir del ${isoDate(availableFrom.toISOString())}.`,
    };
  }

  return { eligible: true, reason: null, blockingRequestId: null };
}
