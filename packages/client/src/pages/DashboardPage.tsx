import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { formatUSD, type RequestStatus } from '@guadalupana/shared';
import { useBudget, useRequests } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { RequestsTable } from '../components/RequestsTable.tsx';
import { AnimatedMoney, Banner, Segmented, spring } from '../components/ui.tsx';
import { useSelectedRequest } from './MyRequestsPage.tsx';

type Filter = 'TODAS' | RequestStatus;

const FILTERS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: 'TODAS', label: 'Todas' },
  { value: 'CREADA', label: 'Creadas' },
  { value: 'EN_REVISION', label: 'En revisión' },
  { value: 'APROBADA', label: 'Aprobadas' },
  { value: 'RECHAZADA', label: 'Rechazadas' },
];

export function DashboardPage() {
  const { data: budget } = useBudget();
  const { data: requests, isLoading, error } = useRequests();
  const [filter, setFilter] = useState<Filter>('TODAS');
  const [selected, select] = useSelectedRequest();
  const close = useCallback(() => select(null), [select]);

  const counts = useMemo(() => {
    const c: Record<RequestStatus, number> = { CREADA: 0, EN_REVISION: 0, APROBADA: 0, RECHAZADA: 0 };
    for (const r of requests ?? []) c[r.status]++;
    return c;
  }, [requests]);
  const visible = filter === 'TODAS' ? requests : requests?.filter((r) => r.status === filter);
  const usedRatio = budget ? budget.approvedCents / budget.totalCents : 0;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1 className="large-title">Panel de analistas</h1>
          <p className="muted">Revise, apruebe o rechace solicitudes. Los cambios de otros analistas aparecen al instante.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'stretch' }} data-layout="hero">
        <motion.section className="budget" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label="Presupuesto global">
          <div className="eyebrow">Presupuesto disponible</div>
          <div className="budget__amount">{budget ? <AnimatedMoney cents={budget.availableCents} /> : '—'}</div>
          <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: '0.875rem' }}>USD · global para desembolsos</div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedRatio * 100)} aria-label="Presupuesto utilizado">
            <motion.div className="meter__fill" initial={false} animate={{ scaleX: usedRatio }} transition={{ type: 'spring', bounce: 0, duration: 0.8 }} />
          </div>
          <div className="budget__meta">
            <div><b className="tabular">{budget ? formatUSD(budget.totalCents) : '—'}</b>Presupuesto inicial</div>
            <div><b className="tabular">{budget ? formatUSD(budget.approvedCents) : '—'}</b>Desembolsado</div>
            <div><b className="tabular">{(usedRatio * 100).toFixed(1)}%</b>Utilizado</div>
          </div>
        </motion.section>

        <div className="kpis" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <Kpi label="Por revisar" value={counts.CREADA} color="#3a4a63" />
          <Kpi label="En revisión" value={counts.EN_REVISION} color="var(--orange)" />
          <Kpi label="Aprobadas" value={counts.APROBADA} color="var(--green)" />
          <Kpi label="Rechazadas" value={counts.RECHAZADA} color="var(--red)" />
        </div>
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '18px 20px', flexWrap: 'wrap' }}>
          <h2 className="title-3">Solicitudes</h2>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <Segmented label="Filtrar por estado" value={filter} options={FILTERS} onChange={setFilter} />
          </div>
        </div>
        {error && <div style={{ padding: '0 20px 16px' }}><Banner tone="error">{error.message}</Banner></div>}
        <RequestsTable requests={visible} loading={isLoading} onOpen={select} showOwner emptyText="No hay solicitudes con este filtro." />
      </section>

      <RequestSheet id={selected} onClose={close} />
    </main>
  );
}

function Kpi({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="kpi">
      <div className="eyebrow">{label}</div>
      <div className="kpi__value tabular" style={{ color }}>{value}</div>
    </div>
  );
}
