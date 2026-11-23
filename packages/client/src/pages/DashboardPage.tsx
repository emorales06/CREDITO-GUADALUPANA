import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { formatUSD, type RequestStatus } from '@guadalupana/shared';
import { useBudget, useRequests } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { RequestsTable } from '../components/RequestsTable.tsx';
import { AnimatedMoney, Banner, Segmented, spring } from '../components/ui.tsx';
import { useSelectedRequest } from './MyRequestsPage.tsx';

type Filter = 'TODAS' | RequestStatus;

export function DashboardPage() {
  const { data: budget } = useBudget();
  const { data: requests, isLoading, error } = useRequests();
  const [filter, setFilter] = useState<Filter>('TODAS');
  const [selected, select] = useSelectedRequest();
  const close = useCallback(() => select(null), [select]);

  const { counts, queuedCents, queuedCount } = useMemo(() => {
    const c: Record<RequestStatus, number> = { CREADA: 0, EN_REVISION: 0, APROBADA: 0, RECHAZADA: 0 };
    let queued = 0;
    for (const r of requests ?? []) {
      c[r.status]++;
      if (r.status === 'CREADA' || r.status === 'EN_REVISION') queued += r.amountCents;
    }
    return { counts: c, queuedCents: queued, queuedCount: c.CREADA + c.EN_REVISION };
  }, [requests]);

  const visible = filter === 'TODAS' ? requests : requests?.filter((r) => r.status === filter);
  const filters: ReadonlyArray<{ value: Filter; label: string; count: number }> = [
    { value: 'TODAS', label: 'Todas', count: requests?.length ?? 0 },
    { value: 'CREADA', label: 'Por revisar', count: counts.CREADA },
    { value: 'EN_REVISION', label: 'En revisión', count: counts.EN_REVISION },
    { value: 'APROBADA', label: 'Aprobadas', count: counts.APROBADA },
    { value: 'RECHAZADA', label: 'Rechazadas', count: counts.RECHAZADA },
  ];

  // Barra de presupuesto en tres tramos: desembolsado · comprometido por la cola · libre.
  const total = budget?.totalCents ?? 1;
  const spentPct = budget ? budget.approvedCents / total : 0;
  const queuedPct = budget ? Math.min(queuedCents, budget.availableCents) / total : 0;
  const afterQueue = budget ? budget.availableCents - queuedCents : 0;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Panel de aprobaciones</h1>
          <p>Revise, apruebe o rechace solicitudes. Los cambios de otros analistas aparecen al instante.</p>
        </div>
      </div>

      <motion.section className="budget" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label="Presupuesto global">
        <div className="budget__main">
          <span className="budget__label">Presupuesto disponible</span>
          <div className="budget__amount">{budget ? <AnimatedMoney cents={budget.availableCents} /> : '—'}</div>
          <span className="budget__sub">de {budget ? formatUSD(budget.totalCents) : '—'} USD para desembolsos</span>
        </div>

        <dl className="budget__facts">
          <div>
            <dt><i className="swatch swatch--spent" /> Desembolsado</dt>
            <dd className="tabular">{budget ? formatUSD(budget.approvedCents) : '—'}</dd>
          </div>
          <div>
            <dt><i className="swatch swatch--queued" /> En cola</dt>
            <dd className="tabular">{formatUSD(queuedCents)} <small>· {queuedCount} solicitud{queuedCount === 1 ? '' : 'es'}</small></dd>
          </div>
          <div>
            <dt><i className="swatch swatch--free" /> Libre tras la cola</dt>
            <dd className={`tabular${afterQueue < 0 ? ' is-negative' : ''}`}>{budget ? formatUSD(afterQueue) : '—'}</dd>
          </div>
        </dl>

        <div className="meter" role="img"
          aria-label={`Desembolsado ${Math.round(spentPct * 100)} %, en cola ${Math.round(queuedPct * 100)} % del presupuesto`}>
          <motion.span className="meter__seg meter__seg--spent" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ width: `${spentPct * 100}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.8 }} />
          <motion.span className="meter__seg meter__seg--queued" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ width: `${queuedPct * 100}%` }}
            transition={{ type: 'spring', bounce: 0, duration: 0.8, delay: 0.08 }} />
        </div>
        {afterQueue < 0 && (
          <p className="budget__warn">Si se aprobara toda la cola faltarían {formatUSD(-afterQueue)}: priorice antes de aprobar.</p>
        )}
      </motion.section>

      <section className="card" style={{ marginTop: 20, overflow: 'hidden' }}>
        <div className="card-head">
          <h2 className="title-3">Solicitudes</h2>
          <div className="scroll-x">
            <Segmented label="Filtrar por estado" value={filter} options={filters} onChange={setFilter} />
          </div>
        </div>
        {error && <div style={{ padding: '0 20px 16px' }}><Banner tone="error" title="No se pudieron cargar las solicitudes">{error.message}</Banner></div>}
        <RequestsTable requests={visible} loading={isLoading} onOpen={select} showOwner
          emptyTitle="No hay solicitudes con este filtro" emptyText="Pruebe con otro estado o espere nuevas solicitudes." />
      </section>

      <RequestSheet id={selected} onClose={close} />
    </main>
  );
}
