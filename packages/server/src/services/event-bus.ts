import type { ServerEvent } from '@guadalupana/shared';

type Listener = (event: ServerEvent) => void;

/** Bus en memoria que alimenta el stream SSE de tiempo real. */
export class EventBus {
  #listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  publish(event: ServerEvent): void {
    for (const listener of this.#listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('[events] listener falló', error);
      }
    }
  }
}
