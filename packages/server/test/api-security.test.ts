import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { CreditRequestDTO } from '@guadalupana/shared';
import { nextDocumentId, startTestServer, type TestContext } from './helpers.ts';

describe('API: permisos en servidor, validación y auditoría', () => {
  let t: TestContext;
  let analyst: string;
  let juan: string;
  let maria: string;

  before(async () => {
    t = await startTestServer();
    analyst = await t.login('ana.lopez');
    juan = await t.login('juan.perez');
    maria = await t.login('maria.garcia');
  });
  after(() => t.close());

  const newRequest = (overrides: Record<string, unknown> = {}) => ({
    applicantName: 'Juan Pérez',
    documentId: nextDocumentId(),
    monthlyIncome: 5_000,
    amount: 2_000,
    termMonths: 12,
    ...overrides,
  });

  it('sin sesión responde 401 y un token manipulado no sirve', async () => {
    assert.equal((await t.api('GET', '/api/requests')).status, 401);
    const forged = `${juan.split('.')[0]}.firma-falsa`;
    assert.equal((await t.api('GET', '/api/requests', { cookie: forged })).status, 401);
  });

  it('un solicitante no puede aprobar, revisar ni ver auditoría global (403)', async () => {
    const request = await t.createInReview(analyst, juan);
    const approve = await t.api('POST', `/api/requests/${request.id}/approve`, { cookie: juan, headers: { 'Idempotency-Key': 'hack-attempt-1' } });
    assert.equal(approve.status, 403);
    assert.equal((await t.api('POST', `/api/requests/${request.id}/review`, { cookie: juan })).status, 403);
    assert.equal((await t.api('GET', '/api/audit', { cookie: juan })).status, 403);
    assert.equal((await t.api('GET', '/api/budget', { cookie: juan })).status, 403);
  });

  it('un solicitante solo ve sus propias solicitudes', async () => {
    const res = await t.api('POST', '/api/requests', { cookie: juan, body: newRequest() });
    const { request } = (await res.json()) as { request: CreditRequestDTO };

    assert.equal((await t.api('GET', `/api/requests/${request.id}`, { cookie: maria })).status, 404);
    const list = (await (await t.api('GET', '/api/requests', { cookie: maria })).json()) as { requests: CreditRequestDTO[] };
    assert.equal(list.requests.some((r) => r.id === request.id), false);
  });

  it('el backend valida el 40 % aunque el cliente lo omita', async () => {
    const res = await t.api('POST', '/api/requests', { cookie: juan, body: newRequest({ amount: 2_500 }) });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: { fields: Record<string, string[]> } };
    assert.match(body.error.fields.amount?.[0] ?? '', /40%/);
  });

  it('bloquea una segunda solicitud del mismo documento mientras la primera está pendiente', async () => {
    const documentId = nextDocumentId();
    const first = await t.api('POST', '/api/requests', { cookie: juan, body: newRequest({ documentId }) });
    assert.equal(first.status, 201);

    const second = await t.api('POST', '/api/requests', { cookie: maria, body: newRequest({ documentId }) });
    assert.equal(second.status, 422);
    const body = (await second.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, 'RECENT_HISTORY_BLOCK');
    assert.match(body.error.message, /pendiente/);
  });

  it('el rechazo exige justificación de 15+ caracteres y queda auditado con ISO 8601', async () => {
    const request = await t.createInReview(analyst, juan);
    const short = await t.api('POST', `/api/requests/${request.id}/reject`, {
      cookie: analyst,
      headers: { 'Idempotency-Key': `reject-short-${request.id}` },
      body: { reason: 'No califica' },
    });
    assert.equal(short.status, 400);

    const ok = await t.api('POST', `/api/requests/${request.id}/reject`, {
      cookie: analyst,
      headers: { 'Idempotency-Key': `reject-ok-${request.id}` },
      body: { reason: 'Score crediticio por debajo del mínimo' },
    });
    assert.equal(ok.status, 200);

    const entries = t.c.audit.list({ requestId: request.id });
    assert.deepEqual(
      entries.map((e) => `${e.fromStatus ?? '∅'}→${e.toStatus}`).reverse(),
      ['∅→CREADA', 'CREADA→EN_REVISION', 'EN_REVISION→RECHAZADA'],
    );
    const last = entries[0];
    assert.equal(last?.actor.username, 'ana.lopez');
    assert.equal(last?.actor.role, 'ANALISTA');
    assert.equal(last?.comment, 'Score crediticio por debajo del mínimo');
    assert.match(last?.timestamp ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('el registro de auditoría es inmutable a nivel de base de datos', () => {
    assert.throws(() => t.c.db.exec("UPDATE audit_log SET comment = 'alterado'"), /inmutable/);
    assert.throws(() => t.c.db.exec('DELETE FROM audit_log'), /inmutable/);
  });
});
