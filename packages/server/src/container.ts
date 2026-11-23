import type { AppConfig } from './config.ts';
import { openDatabase, type Db } from './db/database.ts';
import { AdminAuditRepository, PasswordResetRepository, SettingsRepository } from './repositories/admin.repository.ts';
import { AuditRepository } from './repositories/audit.repository.ts';
import { BudgetRepository } from './repositories/budget.repository.ts';
import { IdempotencyRepository } from './repositories/idempotency.repository.ts';
import { RequestsRepository } from './repositories/requests.repository.ts';
import { UsersRepository } from './repositories/users.repository.ts';
import { AdminService } from './services/admin.service.ts';
import { AuthService } from './services/auth.service.ts';
import { HttpBureauClient, type BureauClient } from './services/bureau/bureau.client.ts';
import { BureauService } from './services/bureau/bureau.service.ts';
import { systemClock, type Clock } from './services/clock.ts';
import { EventBus } from './services/event-bus.ts';
import { RateLimiter } from './services/rate-limiter.ts';
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
  const settings = new SettingsRepository(db);
  const resets = new PasswordResetRepository(db);
  const adminAudit = new AdminAuditRepository(db);

  const bureauClient = overrides.bureauClient ?? new HttpBureauClient(config.bureauUrl, config.bureauRetry);
  const bureau = new BureauService(bureauClient, requests, events, clock);
  const auth = new AuthService({ db, users, resets, adminAudit, clock, secret: config.sessionSecret, ttlHours: config.sessionTtlHours });
  const requestsService = new RequestsService({ db, requests, budget, audit, idempotency, bureau, events, clock });
  const admin = new AdminService({ db, dbPath: config.dbPath, users, settings, resets, adminAudit, budget, events, clock });

  const limits = {
    login: new RateLimiter(30, 15 * 60_000, 'Demasiados intentos de inicio de sesión desde esta red. Espere unos minutos.'),
    register: new RateLimiter(5, 60 * 60_000, 'Se alcanzó el límite de registros desde esta red. Intente más tarde.'),
    forgot: new RateLimiter(5, 15 * 60_000, 'Demasiadas solicitudes. Intente de nuevo en unos minutos.'),
  };

  return { config, db, clock, events, users, requests, budget, audit, idempotency, settings, resets, adminAudit, bureau, auth, requestsService, admin, limits };
}

export type Container = ReturnType<typeof buildContainer>;
