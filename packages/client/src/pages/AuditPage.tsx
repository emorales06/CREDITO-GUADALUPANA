import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useAudit } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { Banner, EmptyState, Icon, SkeletonRows, StatusBadge } from '../components/ui.tsx';
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
          <h1 className="large-title">Registro de auditoría</h1>
          <p>Cada transición de estado queda registrada de forma inmutable y aparece aquí en tiempo real.</p>
        </div>
        <div className="input-wrap" style={{ width: 300, maxWidth: '100%' }}>
          <span className="lead-icon"><Icon name="search" size={18} /></span>
          <input className="input" placeholder="Filtrar por # solicitud o usuario" value={query}
            onChange={(e) => setQuery(e.target.value)} aria-label="Filtrar auditoría" />
        </div>
      </div>

      {error && <div style={{ marginBottom: 16 }}><Banner tone="error" title="No se pudo cargar la auditoría">{error.message}</Banner></div>}
      <section className="card" style={{ overflow: 'hidden' }}>
        <div className="card-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="title-3">Eventos</h2>
          </div>
          <span className="muted small">{entries.length} registro{entries.length === 1 ? '' : 's'} · solo lectura</span>
        </div>
        {isLoading ? (
          <SkeletonRows cols={6} />
        ) : entries.length === 0 ? (
          <EmptyState icon="search" title="Sin registros">No hay eventos que coincidan con el filtro.</EmptyState>
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
                      initial={{ opacity: 0, backgroundColor: 'rgba(43,171,78,0.14)' }}
                      animate={{ opacity: 1, backgroundColor: 'rgba(43,171,78,0)' }}
                      transition={{ opacity: { duration: 0.25 }, backgroundColor: { duration: 1.6 } }}>
                      <td className="mono muted" style={{ whiteSpace: 'nowrap' }}>{e.timestamp}</td>
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
