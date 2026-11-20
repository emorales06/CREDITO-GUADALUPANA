import type { AppConfig } from './config.ts';
import { openDatabase, type Db } from './db/database.ts';
import { AuditRepository } from './repositories/audit.repository.ts';
import { BudgetRepository } from './repositories/budget.repository.ts';
import { IdempotencyRepository } from './repositories/idempotency.repository.ts';
import { RequestsRepository } from './repositories/requests.repository.ts';
import { UsersRepository } from './repositories/users.repository.ts';
import { AuthService } from './services/auth.service.ts';
import { HttpBureauClient, type BureauClient } from './services/bureau/bureau.client.ts';
import { BureauService } from './services/bureau/bureau.service.ts';
import { systemClock, type Clock } from './services/clock.ts';
import { EventBus } from './services/event-bus.ts';
import { RequestsService } from './services/requests.service.ts';

/** Composition root: aquí se cablean las dependencias (y en las pruebas se sustituyen). */
export function buildContainer(config: AppConfig, overrides: { db?: Db; bureauClient?: BureauClient; clock?: Clock } = {}) {
  const db = overrides.db ?? openDatabase(config.dbPath);
  const clock = overrides.clock ?? systemClock;
  const events = new EventBus();

  const users = new UsersRepository(db);
  const requests = new RequestsRepository(db);
  const budget = new BudgetRepository(db);
  const audit = new AuditRepository(db);
  const idempotency = new IdempotencyRepository(db);

  const bureauClient = overrides.bureauClient ?? new HttpBureauClient(config.bureauUrl, config.bureauRetry);
  const bureau = new BureauService(bureauClient, requests, events, clock);
  const auth = new AuthService(users, config.sessionSecret, config.sessionTtlHours);
  const requestsService = new RequestsService({ db, requests, budget, audit, idempotency, bureau, events, clock });

  return { config, db, clock, events, users, requests, budget, audit, idempotency, bureau, auth, requestsService };
}

export type Container = ReturnType<typeof buildContainer>;
