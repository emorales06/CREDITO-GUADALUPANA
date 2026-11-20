import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { BudgetDTO, CreditRequestDTO } from '@guadalupana/shared';
import { RequestsRepository } from '../src/repositories/requests.repository.ts';
import { startTestServer, type TestContext } from './helpers.ts';

describe('Aprobación: idempotencia y condiciones de carrera', () => {
  let t: TestContext;
  let analyst: string;
  let analyst2: string;
  let applicant: string;

  before(async () => {
    t = await startTestServer();
    analyst = await t.login('ana.lopez');
    analyst2 = await t.login('carlos.mendez');
    applicant = await t.login('juan.perez');
  });
  after(() => t.close());

  const budget = () => t.c.budget.get();
  const approve = (id: number, key: string, cookie = analyst) =>
    t.api('POST', `/api/requests/${id}/approve`, { cookie, headers: { 'Idempotency-Key': key } });

  it('10 aprobaciones simultáneas (2 analistas, claves distintas) descuentan el presupuesto una sola vez', async () => {
    const request = await t.createInReview(analyst, applicant, { amount: 4_000 });
    const before = budget().availableCents;

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => approve(request.id, `race-${request.id}-${i}`, i % 2 ? analyst2 : analyst)),
    );
    const statuses = responses.map((r) => r.status).sort();

    assert.deepEqual(statuses, [200, 409, 409, 409, 409, 409, 409, 409, 409, 409]);
    assert.equal(budget().availableCents, before - 400_000);
    const approvals = t.c.audit.list({ requestId: request.id }).filter((e) => e.toStatus === 'APROBADA');
    assert.equal(approvals.length, 1, 'una sola entrada de auditoría APROBADA');
  });

  it('doble clic con la misma Idempotency-Key devuelve la respuesta original sin re-ejecutar', async () => {
    const request = await t.createInReview(analyst, applicant, { amount: 1_000, monthlyIncome: 2_500 });
    const before = budget().availableCents;
    const key = `double-click-${request.id}`;

    const [first, second] = await Promise.all([approve(request.id, key), approve(request.id, key)]);
    const third = await approve(request.id, key);

    for (const res of [first, second, third]) assert.equal(res.status, 200);
    assert.equal(third.headers.get('Idempotent-Replayed'), 'true');
    const body = (await third.json()) as { request: CreditRequestDTO };
    assert.equal(body.request.status, 'APROBADA');
    assert.equal(budget().availableCents, before - 100_000);
  });

  it('bloqueo optimista: una escritura con versión obsoleta no puede sobrescribir el estado', async () => {
    const request = await t.createInReview(analyst, applicant);
    // Dos lectores obtienen la misma versión; el primero gana, el segundo debe fallar.
    const repo = new RequestsRepository(t.c.db);
    const now = new Date().toISOString();
    const base = { id: request.id, from: 'EN_REVISION' as const, expectedVersion: request.version, now };

    assert.equal(repo.changeStatus({ ...base, to: 'RECHAZADA', rejectionReason: 'Rechazo concurrente de prueba' }), true);
    assert.equal(repo.changeStatus({ ...base, to: 'APROBADA' }), false);
    assert.equal(t.c.requests.findById(request.id)?.status, 'RECHAZADA');
  });

  it('presupuesto insuficiente: rechaza la aprobación y revierte todo (estado, presupuesto y auditoría)', async () => {
    const { availableCents } = budget();
    const income = (availableCents / 100 + 1_000) / 0.4;
    const request = await t.createInReview(analyst, applicant, { amount: availableCents / 100 + 1_000, monthlyIncome: income });

    const res = await approve(request.id, `too-big-${request.id}`);
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INSUFFICIENT_BUDGET');
    assert.equal(t.c.requests.findById(request.id)?.status, 'EN_REVISION');
    assert.equal(budget().availableCents, availableCents);
    assert.equal(t.c.audit.list({ requestId: request.id }).some((e) => e.toStatus === 'APROBADA'), false);
  });

  it('no permite aprobar una solicitud rechazada (sin reversiones de estado)', async () => {
    const request = await t.createInReview(analyst, applicant);
    const reject = await t.api('POST', `/api/requests/${request.id}/reject`, {
      cookie: analyst,
      headers: { 'Idempotency-Key': `reject-${request.id}` },
      body: { reason: 'Documentación incompleta del solicitante' },
    });
    assert.equal(reject.status, 200);

    const res = await approve(request.id, `approve-after-reject-${request.id}`);
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, 'INVALID_TRANSITION');
  });

  it('el presupuesto expuesto es coherente con lo aprobado', async () => {
    const res = await t.api('GET', '/api/budget', { cookie: analyst });
    const { budget: b } = (await res.json()) as { budget: BudgetDTO };
    assert.equal(b.totalCents, 5_000_000);
    assert.equal(b.totalCents - b.availableCents, b.approvedCents);
  });
});
