import { useCallback, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { formatUSD, type RequestStatus } from '@guadalupana/shared';
import { useBudget, useRequests } from '../api/hooks.ts';
import { RequestSheet } from '../components/RequestSheet.tsx';
import { RequestsTable } from '../components/RequestsTable.tsx';
import { AnimatedMoney, Banner, Icon, Segmented, easeOut, spring, type IconName } from '../components/ui.tsx';
import { useSelectedRequest } from './MyRequestsPage.tsx';

type Filter = 'TODAS' | RequestStatus;

const KPIS: ReadonlyArray<{ status: RequestStatus; label: string; icon: IconName; grad: string; glow: string }> = [
  { status: 'CREADA', label: 'Por revisar', icon: 'inbox', grad: 'var(--grad-slate)', glow: 'rgba(74, 90, 117, 0.3)' },
  { status: 'EN_REVISION', label: 'En revisión', icon: 'clock', grad: 'var(--grad-warn)', glow: 'rgba(224, 122, 0, 0.3)' },
  { status: 'APROBADA', label: 'Aprobadas', icon: 'check', grad: 'var(--grad-success)', glow: 'rgba(27, 125, 55, 0.3)' },
  { status: 'RECHAZADA', label: 'Rechazadas', icon: 'x', grad: 'var(--grad-danger)', glow: 'rgba(185, 38, 27, 0.3)' },
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
  const filters: ReadonlyArray<{ value: Filter; label: string; count: number }> = [
    { value: 'TODAS', label: 'Todas', count: requests?.length ?? 0 },
    { value: 'CREADA', label: 'Creadas', count: counts.CREADA },
    { value: 'EN_REVISION', label: 'En revisión', count: counts.EN_REVISION },
    { value: 'APROBADA', label: 'Aprobadas', count: counts.APROBADA },
    { value: 'RECHAZADA', label: 'Rechazadas', count: counts.RECHAZADA },
  ];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Analistas de crédito</span>
          <h1 className="large-title">Panel de aprobaciones</h1>
          <p>Revise, apruebe o rechace solicitudes. Los cambios de otros analistas aparecen al instante.</p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', alignItems: 'stretch' }} data-layout="hero">
        <motion.section className="budget" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring} aria-label="Presupuesto global">
          <div className="eyebrow"><Icon name="wallet" size={14} /> Presupuesto disponible</div>
          <div className="budget__amount">{budget ? <AnimatedMoney cents={budget.availableCents} /> : '—'}</div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.875rem' }}>USD · fondo global para desembolsos</div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usedRatio * 100)} aria-label="Presupuesto utilizado">
            <motion.div className="meter__fill" initial={{ scaleX: 0 }} animate={{ scaleX: usedRatio }} transition={{ type: 'spring', bounce: 0, duration: 0.9 }} />
          </div>
          <div className="budget__meta">
            <div><b className="tabular">{budget ? formatUSD(budget.totalCents) : '—'}</b>Presupuesto inicial</div>
            <div><b className="tabular">{budget ? formatUSD(budget.approvedCents) : '—'}</b>Desembolsado</div>
            <div><b className="tabular">{(usedRatio * 100).toFixed(1)}%</b>Utilizado</div>
          </div>
        </motion.section>

        <div className="kpis">
          {KPIS.map((k, i) => (
            <motion.div key={k.status} className="kpi" style={{ ['--kpi-grad' as string]: k.grad, ['--kpi-glow' as string]: k.glow }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: easeOut, delay: 0.05 + i * 0.05 }}>
              <div className="kpi__top">
                <span className="eyebrow">{k.label}</span>
                <span className="kpi__icon"><Icon name={k.icon} size={18} strokeWidth={2.4} /></span>
              </div>
              <div className="kpi__value tabular">{counts[k.status]}</div>
            </motion.div>
          ))}
        </div>
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <div className="card-head">
          <div>
            <h2 className="title-3">Solicitudes</h2>
            <span className="muted small">Haga clic en una fila para ver el detalle y decidir.</span>
          </div>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
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
