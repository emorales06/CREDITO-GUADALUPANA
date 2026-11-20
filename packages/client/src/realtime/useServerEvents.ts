import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ServerEvent } from '@guadalupana/shared';
import { keys } from '../api/hooks.ts';

export type LiveStatus = 'connecting' | 'live' | 'offline';

/** Suscripción SSE: cada evento del servidor invalida o actualiza la caché correspondiente. */
export function useServerEvents(enabled: boolean): LiveStatus {
  const qc = useQueryClient();
  const [status, setStatus] = useState<LiveStatus>('connecting');

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource('/api/events');
    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting');
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as ServerEvent;
      switch (event.type) {
        case 'request.updated':
          void qc.invalidateQueries({ queryKey: keys.requests });
          break;
        case 'audit.created':
          void qc.invalidateQueries({ queryKey: ['audit'] });
          break;
        case 'budget.updated':
          qc.setQueryData(keys.budget, event.budget);
          break;
      }
    };
    return () => source.close();
  }, [enabled, qc]);

  return status;
}
