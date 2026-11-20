import type { BureauStatus, CreditRequestDTO, HistoryItem, RequestStatus } from '@guadalupana/shared';
import { execute, queryAll, queryOne, type Db, type Params } from '../db/database.ts';

interface RequestRow {
  id: number;
  owner_id: number;
  owner_name: string;
  applicant_name: string;
  document_id: string;
  monthly_income_cents: number;
  amount_cents: number;
  term_months: number;
  monthly_payment_cents: number;
  status: RequestStatus;
  rejection_reason: string | null;
  bureau_status: BureauStatus;
  bureau_score: number | null;
  bureau_rating: string | null;
  bureau_attempts: number;
  bureau_error: string | null;
  bureau_checked_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  decided_at: string | null;
}

const toDTO = (r: RequestRow): CreditRequestDTO => ({
  id: r.id,
  ownerId: r.owner_id,
  ownerName: r.owner_name,
  applicantName: r.applicant_name,
  documentId: r.document_id,
  monthlyIncomeCents: r.monthly_income_cents,
  amountCents: r.amount_cents,
  termMonths: r.term_months,
  monthlyPaymentCents: r.monthly_payment_cents,
  status: r.status,
  rejectionReason: r.rejection_reason,
  bureau: {
    status: r.bureau_status,
    score: r.bureau_score,
    rating: r.bureau_rating,
    attempts: r.bureau_attempts,
    error: r.bureau_error,
    checkedAt: r.bureau_checked_at,
  },
  version: r.version,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  decidedAt: r.decided_at,
});

const SELECT = `
  SELECT cr.*, u.full_name AS owner_name
  FROM credit_requests cr
  JOIN users u ON u.id = cr.owner_id`;

export interface NewRequest {
  ownerId: number;
  applicantName: string;
  documentId: string;
  monthlyIncomeCents: number;
  amountCents: number;
  termMonths: number;
  monthlyPaymentCents: number;
}

export interface StatusChange {
  id: number;
  from: RequestStatus;
  to: RequestStatus;
  expectedVersion: number;
  now: string;
  rejectionReason?: string;
}

export type BureauUpdate =
  | { status: 'CONSULTANDO'; attempts: number }
  | { status: 'COMPLETADO'; attempts: number; score: number; rating: string; checkedAt: string }
  | { status: 'FALLIDO'; attempts: number; error: string };

export class RequestsRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  insert(data: NewRequest, now: string): number {
    return execute(
      this.#db,
      `INSERT INTO credit_requests
        (owner_id, applicant_name, document_id, monthly_income_cents, amount_cents, term_months,
         monthly_payment_cents, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.ownerId,
      data.applicantName,
      data.documentId,
      data.monthlyIncomeCents,
      data.amountCents,
      data.termMonths,
      data.monthlyPaymentCents,
      now,
      now,
    ).lastId;
  }

  findById(id: number): CreditRequestDTO | undefined {
    const row = queryOne<RequestRow>(this.#db, `${SELECT} WHERE cr.id = ?`, id);
    return row && toDTO(row);
  }

  list(filter: { ownerId?: number; status?: RequestStatus }): CreditRequestDTO[] {
    const where: string[] = [];
    const params: Params = [];
    if (filter.ownerId !== undefined) {
      where.push('cr.owner_id = ?');
      params.push(filter.ownerId);
    }
    if (filter.status) {
      where.push('cr.status = ?');
      params.push(filter.status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return queryAll<RequestRow>(this.#db, `${SELECT} ${clause} ORDER BY cr.id DESC LIMIT 500`, ...params).map(toDTO);
  }

  historyForDocument(documentId: string): HistoryItem[] {
    return queryAll<{ id: number; status: RequestStatus; created_at: string; decided_at: string | null }>(
      this.#db,
      'SELECT id, status, created_at, decided_at FROM credit_requests WHERE document_id = ? ORDER BY id DESC',
      documentId,
    ).map((r) => ({ id: r.id, status: r.status, createdAt: r.created_at, decidedAt: r.decided_at }));
  }

  /**
   * Compare-and-set: solo actualiza si el estado y la versión siguen siendo los que se leyeron.
   * Devuelve false si otra operación cambió la solicitud primero (bloqueo optimista).
   */
  changeStatus(change: StatusChange): boolean {
    const isFinal = change.to === 'APROBADA' || change.to === 'RECHAZADA';
    const { changes } = execute(
      this.#db,
      `UPDATE credit_requests
          SET status = ?, rejection_reason = ?, version = version + 1, updated_at = ?, decided_at = ?
        WHERE id = ? AND status = ? AND version = ?`,
      change.to,
      change.rejectionReason ?? null,
      change.now,
      isFinal ? change.now : null,
      change.id,
      change.from,
      change.expectedVersion,
    );
    return changes === 1;
  }

  updateBureau(id: number, update: BureauUpdate): void {
    execute(
      this.#db,
      `UPDATE credit_requests
          SET bureau_status = ?, bureau_attempts = ?, bureau_score = ?, bureau_rating = ?,
              bureau_error = ?, bureau_checked_at = ?
        WHERE id = ?`,
      update.status,
      update.attempts,
      update.status === 'COMPLETADO' ? update.score : null,
      update.status === 'COMPLETADO' ? update.rating : null,
      update.status === 'FALLIDO' ? update.error : null,
      update.status === 'COMPLETADO' ? update.checkedAt : null,
      id,
    );
  }

  /** Consultas que quedaron a medias por un reinicio del servidor. */
  markInterruptedBureauChecks(): number {
    return execute(
      this.#db,
      `UPDATE credit_requests SET bureau_status = 'FALLIDO', bureau_error = 'Consulta interrumpida por reinicio del servidor'
        WHERE bureau_status = 'CONSULTANDO'`,
    ).changes;
  }

  count(): number {
    return queryOne<{ n: number }>(this.#db, 'SELECT COUNT(*) AS n FROM credit_requests')?.n ?? 0;
  }
}
