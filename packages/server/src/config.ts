import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  timeoutMs: number;
}

export interface MockBureauOptions {
  minLatencyMs: number;
  maxLatencyMs: number;
  failureRate: number;
}

export interface AppConfig {
  port: number;
  isProduction: boolean;
  cookieSecure: boolean;
  dbPath: string;
  sessionSecret: string;
  sessionTtlHours: number;
  seedDemoData: boolean;
  bureauUrl: string;
  bureauRetry: RetryPolicy;
  mockBureau: MockBureauOptions;
  clientDistPath: string;
}

const num = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return value !== undefined && value !== '' && Number.isFinite(parsed) ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const port = num(env.PORT, 3000);
  const isProduction = env.NODE_ENV === 'production';

  let sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret) {
    if (isProduction) {
      sessionSecret = randomBytes(32).toString('hex');
      console.warn('[config] SESSION_SECRET no definido: se generó uno aleatorio (las sesiones se pierden al reiniciar).');
    } else {
      sessionSecret = 'dev-only-secret-no-usar-en-produccion';
    }
  }

  return {
    port,
    isProduction,
    // Activar detrás de HTTPS. En localhost por HTTP (docker-compose) debe quedar en false.
    cookieSecure: env.COOKIE_SECURE === 'true',
    dbPath: resolve(env.DB_PATH ?? 'data/creditos.db'),
    sessionSecret,
    sessionTtlHours: num(env.SESSION_TTL_HOURS, 8),
    seedDemoData: env.SEED_DEMO_DATA !== 'false',
    bureauUrl: env.BUREAU_URL ?? `http://127.0.0.1:${port}/api/mock-bureau`,
    bureauRetry: {
      maxAttempts: num(env.BUREAU_MAX_ATTEMPTS, 4),
      baseDelayMs: num(env.BUREAU_BASE_DELAY_MS, 1000),
      maxDelayMs: num(env.BUREAU_MAX_DELAY_MS, 8000),
      timeoutMs: num(env.BUREAU_TIMEOUT_MS, 6000),
    },
    mockBureau: {
      minLatencyMs: num(env.MOCK_BUREAU_MIN_LATENCY_MS, 2000),
      maxLatencyMs: num(env.MOCK_BUREAU_MAX_LATENCY_MS, 4000),
      failureRate: num(env.MOCK_BUREAU_FAILURE_RATE, 0.3),
    },
    clientDistPath: resolve(env.CLIENT_DIST ?? '../client/dist'),
  };
}
