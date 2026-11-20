import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRequests } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { RequestsTable } from '../components/RequestsTable.tsx';
import { Banner, Icon } from '../components/ui.tsx';

export function useSelectedRequest(): [number | null, (id: number | null) => void] {
  const [params, setParams] = useSearchParams();
  const raw = Number(params.get('id'));
  const selected = Number.isInteger(raw) && raw > 0 ? raw : null;
  const select = useCallback(
    (id: number | null) => setParams((p) => {
      const next = new URLSearchParams(p);
      if (id === null) next.delete('id');
      else next.set('id', String(id));
      return next;
    }),
    [setParams],
  );
  return [selected, select];
}

export function MyRequestsPage() {
  const { data, isLoading, error } = useRequests();
  const [selected, select] = useSelectedRequest();
  const close = useCallback(() => select(null), [select]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Mis solicitudes</h1>
          <p>El estado y la consulta al buró se actualizan en tiempo real.</p>
        </div>
        <Link to="/solicitudes/nueva" className="btn btn-light"><Icon name="plus" size={18} /> Nueva solicitud</Link>
      </div>
      {error && <div style={{ marginBottom: 16 }}><Banner tone="error" title="No se pudieron cargar sus solicitudes">{error.message}</Banner></div>}
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <h2 className="title-3">Historial</h2>
          <span className="muted small">{data ? `${data.length} solicitud${data.length === 1 ? '' : 'es'}` : ''}</span>
        </div>
        <RequestsTable requests={data} loading={isLoading} onOpen={select}
          emptyTitle="Aún no ha registrado solicitudes" emptyText="Cree su primera solicitud de desembolso para verla aquí." />
      </section>
      <RequestSheet id={selected} onClose={close} />
    </main>
  );
}
