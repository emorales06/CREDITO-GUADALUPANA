import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { CreditRequestDTO } from '@guadalupana/shared';
import { createApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { buildContainer, type Container } from '../src/container.ts';
import { openDatabase } from '../src/db/database.ts';
import { seedUsers } from '../src/db/seed.ts';
import type { BureauClient } from '../src/services/bureau/bureau.client.ts';
import type { Clock } from '../src/services/clock.ts';

export const instantBureau: BureauClient = {
  async fetchScore(_documentId, hooks) {
    hooks?.onAttempt?.(1);
    return { score: 720, rating: 'B · Riesgo moderado' };
  },
};

export interface TestContext {
  c: Container;
  baseUrl: string;
  close: () => Promise<void>;
  login: (username: string) => Promise<string>;
  api: (method: string, path: string, opts?: { cookie?: string; body?: unknown; headers?: Record<string, string> }) => Promise<Response>;
  createInReview: (analystCookie: string, applicantCookie: string, data?: Partial<NewRequestBody>) => Promise<CreditRequestDTO>;
}

interface NewRequestBody {
  applicantName: string;
  documentId: string;
  monthlyIncome: number;
  amount: number;
  termMonths: number;
}

const PASSWORDS: Record<string, string> = {
  admin: 'Admin2026!',
  'ana.lopez': 'Analista2026!',
  'carlos.mendez': 'Analista2026!',
  'juan.perez': 'Socio2026!',
  'maria.garcia': 'Socio2026!',
};

let docCounter = 1_000_000_000_000;
export const nextDocumentId = () => String(docCounter++);

export async function startTestServer(opts: { clock?: Clock } = {}): Promise<TestContext> {
  process.env.SESSION_SECRET ??= 'test-secret';
  const config = loadConfig({ ...process.env, DB_PATH: ':memory:', SEED_DEMO_DATA: 'false', CLIENT_DIST: '/nonexistent' });
  const c = buildContainer(config, { db: openDatabase(':memory:'), bureauClient: instantBureau, ...(opts.clock ? { clock: opts.clock } : {}) });
  seedUsers(c);

  const server: Server = await new Promise((resolve) => {
    const s = createApp(c).listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api: TestContext['api'] = (method, path, o = {}) =>
    fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(o.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(o.cookie ? { cookie: o.cookie } : {}),
        ...o.headers,
      },
      ...(o.body !== undefined ? { body: JSON.stringify(o.body) } : {}),
    });

  const login = async (username: string) => {
    const res = await api('POST', '/api/auth/login', { body: { username, password: PASSWORDS[username] } });
    if (res.status !== 200) throw new Error(`login ${username} falló: ${res.status}`);
    return (res.headers.get('set-cookie') ?? '').split(';')[0] as string;
  };

  const createInReview: TestContext['createInReview'] = async (analyst, applicant, data = {}) => {
    const body: NewRequestBody = {
      applicantName: 'Persona de Prueba',
      documentId: nextDocumentId(),
      monthlyIncome: 10_000,
      amount: 4_000,
      termMonths: 12,
      ...data,
    };
    const created = await api('POST', '/api/requests', { cookie: applicant, body });
    if (created.status !== 201) throw new Error(`crear falló: ${created.status} ${await created.text()}`);
    const { request } = (await created.json()) as { request: CreditRequestDTO };
    await c.bureau.start(request.id);
    const reviewed = await api('POST', `/api/requests/${request.id}/review`, { cookie: analyst });
    if (reviewed.status !== 200) throw new Error(`revisar falló: ${reviewed.status}`);
    await c.bureau.start(request.id);
    return c.requests.findById(request.id) as CreditRequestDTO;
  };

  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => {
        c.db.close();
        resolve();
      });
    });

  return { c, baseUrl, close, login, api, createInReview };
}
