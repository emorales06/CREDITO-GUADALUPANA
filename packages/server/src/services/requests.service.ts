import {
  STATUS_LABELS,
  buildAmortizationSchedule,
  canTransition,
  evaluateRecentHistory,
  exceedsDebtLimit,
  toCents,
  type AuditEntryDTO,
  type CreateRequestInput,
  type CreditRequestDTO,
  type Eligibility,
  type RequestStatus,
  type UserDTO,
} from '@guadalupana/shared';
import { inTransaction, isUniqueViolation, type Db } from '../db/database.ts';
import { AppError, businessRule, conflict, forbidden, notFound } from '../domain/errors.ts';
import type { AuditRepository } from '../repositories/audit.repository.ts';
import type { BudgetRepository } from '../repositories/budget.repository.ts';
import type { IdempotencyRepository } from '../repositories/idempotency.repository.ts';
import type { RequestsRepository } from '../repositories/requests.repository.ts';
import type { BureauService } from './bureau/bureau.service.ts';
import type { Clock } from './clock.ts';
import type { EventBus } from './event-bus.ts';

export interface RequestsServiceDeps {
  db: Db;
  requests: RequestsRepository;
  budget: BudgetRepository;
  audit: AuditRepository;
  idempotency: IdempotencyRepository;
  bureau: BureauService;
  events: EventBus;
  clock: Clock;
}

export interface DecisionResult {
  request: CreditRequestDTO;
  replayed: boolean;
}

type Decision = { kind: 'APROBADA' } | { kind: 'RECHAZADA'; reason: string };

export class RequestsService {
  #d: RequestsServiceDeps;

  constructor(deps: RequestsServiceDeps) {
    this.#d = deps;
  }

  checkEligibility(documentId: string): Eligibility {
    return evaluateRecentHistory(this.#d.requests.historyForDocument(documentId), this.#d.clock());
  }

  create(actor: UserDTO, input: CreateRequestInput): CreditRequestDTO {
    const incomeCents = toCents(input.monthlyIncome);
    const amountCents = toCents(input.amount);
    // Defensa en profundidad: el esquema Zod ya lo validó, pero la regla vive también en el dominio.
    if (exceedsDebtLimit(amountCents, incomeCents)) {
      throw businessRule('DEBT_LIMIT_EXCEEDED', 'El monto no puede superar el 40% del ingreso mensual', 'amount');
    }

    const now = this.#d.clock().toISOString();
    let created: { request: CreditRequestDTO; entry: AuditEntryDTO };
    try {
      created = inTransaction(this.#d.db, () => {
        // Se evalúa dentro de la transacción de escritura: dos altas simultáneas del mismo
        // documento se serializan y la segunda ya ve a la primera.
        const eligibility = this.checkEligibility(input.documentId);
        if (!eligibility.eligible) {
          throw businessRule('RECENT_HISTORY_BLOCK', eligibility.reason ?? 'Documento bloqueado', 'documentId');
        }
        const id = this.#d.requests.insert(
          {
            ownerId: actor.id,
            applicantName: input.applicantName,
            documentId: input.documentId,
            monthlyIncomeCents: incomeCents,
            amountCents,
            termMonths: input.termMonths,
            monthlyPaymentCents: buildAmortizationSchedule(amountCents, input.termMonths).monthlyPaymentCents,
          },
          now,
        );
        const entry = this.#appendAudit(actor, id, null, 'CREADA', 'Solicitud registrada', now);
        return { request: this.#mustFind(id), entry };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw businessRule('RECENT_HISTORY_BLOCK', 'El documento ya tiene una solicitud pendiente', 'documentId');
      }
      throw error;
    }

    this.#publishChange(created.request, created.entry);
    void this.#d.bureau.start(created.request.id);
    return created.request;
  }

  list(actor: UserDTO, status?: RequestStatus): CreditRequestDTO[] {
    return this.#d.requests.list({ ownerId: actor.role === 'SOLICITANTE' ? actor.id : undefined, status });
  }

  /** Un solicitante solo ve sus solicitudes; para las ajenas responde 404 (no revela que existen). */
  getForActor(actor: UserDTO, id: number): CreditRequestDTO {
    const request = this.#d.requests.findById(id);
    if (!request || (actor.role === 'SOLICITANTE' && request.ownerId !== actor.id)) throw notFound('Solicitud no encontrada');
    return request;
  }

  startReview(actor: UserDTO, id: number): CreditRequestDTO {
    const now = this.#d.clock().toISOString();
    const updated = inTransaction(this.#d.db, () => {
      const current = this.#mustFind(id);
      this.#assertTransition(current.status, 'EN_REVISION');
      const ok = this.#d.requests.changeStatus({ id, from: current.status, to: 'EN_REVISION', expectedVersion: current.version, now });
      if (!ok) throw conflict('CONCURRENT_MODIFICATION', 'La solicitud fue modificada por otra operación. Actualice la vista.');
      const entry = this.#appendAudit(actor, id, current.status, 'EN_REVISION', 'Solicitud tomada para revisión', now);
      return { request: this.#mustFind(id), entry };
    });
    this.#publishChange(updated.request, updated.entry);
    void this.#d.bureau.start(id); // la revisión vuelve a consultar el buró con datos frescos
    return updated.request;
  }

  approve(actor: UserDTO, id: number, idempotencyKey: string): DecisionResult {
    return this.#decide(actor, id, idempotencyKey, { kind: 'APROBADA' });
  }

  reject(actor: UserDTO, id: number, idempotencyKey: string, reason: string): DecisionResult {
    return this.#decide(actor, id, idempotencyKey, { kind: 'RECHAZADA', reason });
  }

  retryBureau(actor: UserDTO, id: number): CreditRequestDTO {
    const request = this.getForActor(actor, id);
    if (request.status === 'APROBADA' || request.status === 'RECHAZADA') {
      throw conflict('REQUEST_CLOSED', 'La solicitud ya tiene una decisión final');
    }
    if (request.bureau.status === 'CONSULTANDO' || this.#d.bureau.isRunning(id)) {
      throw conflict('BUREAU_IN_PROGRESS', 'Ya hay una consulta al buró en curso');
    }
    void this.#d.bureau.start(id);
    return request;
  }

  /**
   * Aprobación / rechazo. Garantías frente a doble clic y peticiones simultáneas:
   *  1. Idempotency-Key: el mismo intento repetido devuelve la respuesta original sin re-ejecutar.
   *  2. BEGIN IMMEDIATE: la lectura-validación-escritura ocurre con el bloqueo de escritura tomado.
   *  3. Compare-and-set por estado + versión: solo una operación puede mover EN_REVISION → final.
   *  4. Débito condicional del presupuesto (available >= monto) + CHECK en BD: nunca queda negativo.
   * Si cualquier paso falla, la transacción completa se revierte (estado, presupuesto y auditoría).
   */
  #decide(actor: UserDTO, id: number, key: string, decision: Decision): DecisionResult {
    if (actor.role !== 'ANALISTA') throw forbidden();
    const now = this.#d.clock().toISOString();
    const action = decision.kind === 'APROBADA' ? 'approve' : 'reject';

    const result = inTransaction(this.#d.db, (): DecisionResult & { entry?: AuditEntryDTO } => {
      const previous = this.#d.idempotency.find(actor.id, key);
      if (previous) {
        if (previous.action !== action || previous.requestId !== id) {
          throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'La Idempotency-Key ya se usó para otra operación');
        }
        return { request: previous.body as CreditRequestDTO, replayed: true };
      }

      const current = this.#mustFind(id);
      this.#assertTransition(current.status, decision.kind);

      if (decision.kind === 'APROBADA' && current.bureau.status !== 'COMPLETADO') {
        throw conflict('BUREAU_NOT_READY', 'No se puede aprobar sin una consulta al buró completada');
      }

      const ok = this.#d.requests.changeStatus({
        id,
        from: current.status,
        to: decision.kind,
        expectedVersion: current.version,
        now,
        ...(decision.kind === 'RECHAZADA' ? { rejectionReason: decision.reason } : {}),
      });
      if (!ok) throw conflict('CONCURRENT_MODIFICATION', 'La solicitud fue procesada por otra operación');

      if (decision.kind === 'APROBADA' && !this.#d.budget.debit(current.amountCents, now)) {
        throw conflict('INSUFFICIENT_BUDGET', 'El presupuesto disponible no alcanza para aprobar esta solicitud');
      }

      const comment = decision.kind === 'APROBADA' ? 'Solicitud aprobada; monto descontado del presupuesto' : decision.reason;
      const entry = this.#appendAudit(actor, id, current.status, decision.kind, comment, now);

      const request = this.#mustFind(id);
      this.#d.idempotency.save(actor.id, key, { action, requestId: id, statusCode: 200, body: request }, now);
      return { request, replayed: false, entry };
    });

    // Los eventos se publican solo después del COMMIT: nunca se anuncia algo que luego se revierte.
    if (result.entry) {
      this.#publishChange(result.request, result.entry);
      if (decision.kind === 'APROBADA') this.#d.events.publish({ type: 'budget.updated', budget: this.#d.budget.get() });
    }
    return { request: result.request, replayed: result.replayed };
  }

  #assertTransition(from: RequestStatus, to: RequestStatus): void {
    if (canTransition(from, to)) return;
    const message =
      from === to
        ? `La solicitud ya está ${STATUS_LABELS[from].toLowerCase()}`
        : `Transición no permitida: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`;
    throw conflict('INVALID_TRANSITION', message);
  }

  #appendAudit(actor: UserDTO, requestId: number, from: RequestStatus | null, to: RequestStatus, comment: string, now: string): AuditEntryDTO {
    return this.#d.audit.append({ requestId, actor, fromStatus: from, toStatus: to, comment, timestamp: now });
  }

  #publishChange(request: CreditRequestDTO, entry: AuditEntryDTO): void {
    this.#d.events.publish({ type: 'request.updated', requestId: request.id, ownerId: request.ownerId });
    this.#d.events.publish({ type: 'audit.created', entry, ownerId: request.ownerId });
  }

  #mustFind(id: number): CreditRequestDTO {
    const request = this.#d.requests.findById(id);
    if (!request) throw notFound('Solicitud no encontrada');
    return request;
  }
}
