import { useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useRequests } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { RequestsTable } from '../components/RequestsTable.tsx';
import { Banner } from '../components/ui.tsx';

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
          <p className="muted">El estado y la consulta al buró se actualizan en tiempo real.</p>
        </div>
        <Link to="/solicitudes/nueva" className="btn btn-primary" style={{ textDecoration: 'none' }}>Nueva solicitud</Link>
      </div>
      {error && <Banner tone="error">{error.message}</Banner>}
      <section className="card">
        <RequestsTable requests={data} loading={isLoading} onOpen={select} emptyText="Aún no ha registrado solicitudes." />
      </section>
      <RequestSheet id={selected} onClose={close} />
    </main>
  );
}
