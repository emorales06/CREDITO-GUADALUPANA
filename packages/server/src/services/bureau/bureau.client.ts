import { z } from 'zod';
import type { RetryPolicy } from '../../config.ts';

export interface BureauScore {
  score: number;
  rating: string;
}

export interface BureauHooks {
  onAttempt?: (attempt: number) => void;
}

export interface BureauClient {
  fetchScore(documentId: string, hooks?: BureauHooks): Promise<BureauScore>;
}

export class BureauUnavailableError extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause: unknown) {
    super(`Buró no disponible después de ${attempts} intento(s)`, { cause });
    this.name = 'BureauUnavailableError';
    this.attempts = attempts;
  }
}

class NonRetryableError extends Error {}

const responseSchema = z.object({
  score: z.number().int().min(0).max(1000),
  rating: z.string().min(1),
});

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/**
 * Backoff exponencial con "equal jitter": base·2^(n−1) acotado por maxDelay,
 * del cual se espera entre el 50 % y el 100 % para no sincronizar reintentos.
 */
export function backoffDelay(attempt: number, policy: RetryPolicy, random: () => number = Math.random): number {
  const exp = Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** (attempt - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class HttpBureauClient implements BureauClient {
  #baseUrl: string;
  #policy: RetryPolicy;
  #fetch: typeof fetch;
  #sleep: (ms: number) => Promise<void>;

  constructor(baseUrl: string, policy: RetryPolicy, deps: { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#policy = policy;
    this.#fetch = deps.fetch ?? fetch;
    this.#sleep = deps.sleep ?? defaultSleep;
  }

  async fetchScore(documentId: string, hooks: BureauHooks = {}): Promise<BureauScore> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.#policy.maxAttempts; attempt++) {
      hooks.onAttempt?.(attempt);
      try {
        const res = await this.#fetch(`${this.#baseUrl}/${encodeURIComponent(documentId)}`, {
          signal: AbortSignal.timeout(this.#policy.timeoutMs),
          headers: { accept: 'application/json' },
        });
        if (res.ok) return responseSchema.parse(await res.json());
        if (!RETRYABLE_STATUS.has(res.status)) {
          throw new NonRetryableError(`El buró respondió HTTP ${res.status}`);
        }
        lastError = new Error(`HTTP ${res.status}`);
      } catch (error) {
        if (error instanceof NonRetryableError || error instanceof z.ZodError) throw error;
        lastError = error; // timeout o error de red: reintentable
      }

      if (attempt < this.#policy.maxAttempts) await this.#sleep(backoffDelay(attempt, this.#policy));
    }

    throw new BureauUnavailableError(this.#policy.maxAttempts, lastError);
  }
}
