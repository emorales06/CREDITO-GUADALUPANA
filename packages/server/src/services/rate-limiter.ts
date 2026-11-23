import { tooManyRequests } from '../domain/errors.ts';

/** Límite de intentos por clave en una ventana deslizante (en memoria, por proceso). */
export class RateLimiter {
  #hits = new Map<string, number[]>();
  #max: number;
  #windowMs: number;
  #message: string;

  constructor(max: number, windowMs: number, message: string) {
    this.#max = max;
    this.#windowMs = windowMs;
    this.#message = message;
  }

  consume(key: string, now = Date.now()): void {
    const recent = (this.#hits.get(key) ?? []).filter((t) => now - t < this.#windowMs);
    if (recent.length >= this.#max) {
      this.#hits.set(key, recent);
      throw tooManyRequests(this.#message);
    }
    recent.push(now);
    this.#hits.set(key, recent);
    if (this.#hits.size > 10_000) this.#hits.clear(); // cota de memoria ante abuso
  }
}
