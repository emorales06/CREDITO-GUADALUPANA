import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { RetryPolicy } from '../src/config.ts';
import { BureauUnavailableError, HttpBureauClient, backoffDelay } from '../src/services/bureau/bureau.client.ts';

const policy: RetryPolicy = { maxAttempts: 4, baseDelayMs: 1000, maxDelayMs: 8000, timeoutMs: 1000 };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** fetch falso que devuelve las respuestas en orden; registra cuántas veces se llamó. */
function scriptedFetch(responses: Array<() => Response>) {
  let calls = 0;
  const fn = (async () => {
    const next = responses[Math.min(calls, responses.length - 1)];
    calls++;
    return next ? next() : json(500, {});
  }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}

describe('Resiliencia del cliente de Buró Crediticio', () => {
  it('reintenta ante 503 con espera progresiva y termina con éxito', async () => {
    const fetcher = scriptedFetch([() => json(503, {}), () => json(503, {}), () => json(200, { score: 701, rating: 'B' })]);
    const sleeps: number[] = [];
    const attempts: number[] = [];
    const client = new HttpBureauClient('http://buro', policy, { fetch: fetcher.fn, sleep: async (ms) => void sleeps.push(ms) });

    const result = await client.fetchScore('1234567890123', { onAttempt: (n) => attempts.push(n) });

    assert.deepEqual(result, { score: 701, rating: 'B' });
    assert.deepEqual(attempts, [1, 2, 3]);
    assert.equal(sleeps.length, 2);
    assert.ok(sleeps[1]! > sleeps[0]! || sleeps[1]! >= 1000, 'la espera crece entre intentos');
  });

  it('se rinde tras el máximo de intentos con un error explícito', async () => {
    const fetcher = scriptedFetch([() => json(503, {})]);
    const client = new HttpBureauClient('http://buro', policy, { fetch: fetcher.fn, sleep: async () => {} });

    await assert.rejects(client.fetchScore('1234567890123'), BureauUnavailableError);
    assert.equal(fetcher.calls(), policy.maxAttempts);
  });

  it('no reintenta errores no recuperables (4xx)', async () => {
    const fetcher = scriptedFetch([() => json(400, {})]);
    const client = new HttpBureauClient('http://buro', policy, { fetch: fetcher.fn, sleep: async () => {} });

    await assert.rejects(client.fetchScore('1234567890123'), /HTTP 400/);
    assert.equal(fetcher.calls(), 1);
  });

  it('el backoff es exponencial, con jitter y acotado', () => {
    const min = (attempt: number) => backoffDelay(attempt, policy, () => 0);
    const max = (attempt: number) => backoffDelay(attempt, policy, () => 1);
    assert.deepEqual([1, 2, 3, 4, 5].map(max), [1000, 2000, 4000, 8000, 8000]);
    assert.deepEqual([1, 2, 3].map(min), [500, 1000, 2000]);
  });
});
