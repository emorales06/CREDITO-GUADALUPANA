import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAudit } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { Banner, Icon, Spinner, StatusBadge } from '../components/ui.tsx';
import { useSelectedRequest } from './MyRequestsPage.tsx';

export function AuditPage() {
  const { data, isLoading, error } = useAudit();
  const [query, setQuery] = useState('');
  const [selected, select] = useSelectedRequest();
  const close = useCallback(() => select(null), [select]);

  const entries = useMemo(() => {
    const q = query.trim().replace(/^#/, '');
    return q ? (data ?? []).filter((e) => String(e.requestId) === q || e.actor.username.includes(q.toLowerCase())) : data ?? [];
  }, [data, query]);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Auditoría</h1>
          <p className="muted">Registro inmutable de cada transición de estado, en tiempo real.</p>
        </div>
        <input className="input" style={{ width: 260 }} placeholder="Filtrar por # solicitud o usuario" value={query}
          onChange={(e) => setQuery(e.target.value)} aria-label="Filtrar auditoría" />
      </div>

      {error && <Banner tone="error">{error.message}</Banner>}
      <section className="card">
        {isLoading ? (
          <div className="empty"><Spinner /></div>
        ) : entries.length === 0 ? (
          <div className="empty"><Icon name="inbox" /><div>Sin registros.</div></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Marca de tiempo (ISO 8601)</th>
                  <th>Solicitud</th>
                  <th>Usuario / rol</th>
                  <th>Estado anterior</th>
                  <th>Estado nuevo</th>
                  <th>Comentario</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {entries.map((e) => (
                    <motion.tr key={e.id} layout="position"
                      initial={{ opacity: 0, backgroundColor: 'rgba(52,199,89,0.14)' }}
                      animate={{ opacity: 1, backgroundColor: 'rgba(52,199,89,0)' }}
                      transition={{ duration: 1.2 }}>
                      <td className="mono" style={{ whiteSpace: 'nowrap' }}>{e.timestamp}</td>
                      <td>
                        <button type="button" className="btn btn-plain btn-sm" onClick={() => select(e.requestId)}>#{e.requestId}</button>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.actor.username}</div>
                        <div className="muted small">{e.actor.role === 'ANALISTA' ? 'Analista' : 'Solicitante'}</div>
                      </td>
                      <td>{e.fromStatus ? <StatusBadge status={e.fromStatus} /> : <span className="muted">—</span>}</td>
                      <td><StatusBadge status={e.toStatus} /></td>
                      <td style={{ maxWidth: 360 }}>{e.comment ?? <span className="muted">—</span>}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </section>
      <RequestSheet id={selected} onClose={close} />
    </main>
  );
}
