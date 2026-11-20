import type { RequestsRepository } from '../../repositories/requests.repository.ts';
import type { EventBus } from '../event-bus.ts';
import type { Clock } from '../clock.ts';
import { BureauUnavailableError, type BureauClient } from './bureau.client.ts';

/**
 * Orquesta la consulta al buró en segundo plano: la petición HTTP del usuario responde de
 * inmediato y el progreso (intentos, resultado, fallo) llega a la UI por eventos en tiempo real.
 */
export class BureauService {
  #client: BureauClient;
  #requests: RequestsRepository;
  #events: EventBus;
  #clock: Clock;
  #inFlight = new Map<number, Promise<void>>();

  constructor(client: BureauClient, requests: RequestsRepository, events: EventBus, clock: Clock) {
    this.#client = client;
    this.#requests = requests;
    this.#events = events;
    this.#clock = clock;
  }

  isRunning(requestId: number): boolean {
    return this.#inFlight.has(requestId);
  }

  /** Inicia la consulta; si ya hay una en curso para la solicitud, reutiliza la misma promesa. */
  start(requestId: number): Promise<void> {
    const existing = this.#inFlight.get(requestId);
    if (existing) return existing;

    const job = this.#run(requestId).finally(() => this.#inFlight.delete(requestId));
    this.#inFlight.set(requestId, job);
    return job;
  }

  async #run(requestId: number): Promise<void> {
    const request = this.#requests.findById(requestId);
    if (!request) return;
    const notify = () => this.#events.publish({ type: 'request.updated', requestId, ownerId: request.ownerId });

    let attempts = 0;
    try {
      const result = await this.#client.fetchScore(request.documentId, {
        onAttempt: (attempt) => {
          attempts = attempt;
          this.#requests.updateBureau(requestId, { status: 'CONSULTANDO', attempts });
          notify();
        },
      });
      this.#requests.updateBureau(requestId, {
        status: 'COMPLETADO',
        attempts,
        score: result.score,
        rating: result.rating,
        checkedAt: this.#clock().toISOString(),
      });
    } catch (error) {
      const message =
        error instanceof BureauUnavailableError
          ? `${error.message}. Puede reintentar la consulta.`
          : 'Respuesta inválida del buró crediticio';
      if (!(error instanceof BureauUnavailableError)) console.error('[bureau] error no reintentable', error);
      this.#requests.updateBureau(requestId, { status: 'FALLIDO', attempts, error: message });
    }
    notify();
  }
}
