import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  REJECTION_REASON_MIN_LENGTH,
  STATUS_LABELS,
  buildAmortizationSchedule,
  formatUSD,
  rejectRequestSchema,
  type CreditRequestDTO,
} from '@guadalupana/shared';
import { useBudget, useRequest, useRequestAction, useRequestAudit } from '../api/hooks.ts';
import { ApiError } from '../api/client.ts';
import { useAuth } from '../auth/AuthContext.tsx';
import { AmortizationTable } from './AmortizationTable.tsx';
import {
  AttemptDots, Banner, ConfirmDialog, Icon, STATUS_GRADIENT, ScoreGauge, SkeletonRows, Spinner, StatusBadge,
  easeOut, formatDateTime, gradeOf, spring, useToast, type IconName,
} from './ui.tsx';

export function RequestSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  // Portal a <body>: el panel debe quedar por encima del header aunque la página cree su propia capa.
  return createPortal(
    <AnimatePresence>
      {id !== null && (
        <>
          <motion.div key="scrim" className="scrim" onClick={onClose}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.aside key="sheet" className="sheet" role="dialog" aria-modal="true" aria-label={`Solicitud #${id}`}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={spring}>
            <SheetContent id={id} onClose={onClose} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetContent({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: request, isLoading, error } = useRequest(id);
  return (
    <>
      <header className="sheet__head">
        <div className="sheet__head-top">
          <span className="eyebrow">Solicitud #{id}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {request && <StatusBadge status={request.status} onBrand />}
            <button type="button" className="icon-btn icon-btn--light" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
          </div>
        </div>
        <h2 className="sheet__title">{request?.applicantName ?? 'Cargando…'}</h2>
        {request && (
          <div className="sheet__amount">
            <b className="tabular">{formatUSD(request.amountCents)}</b>
            a {request.termMonths} meses · cuota {formatUSD(request.monthlyPaymentCents)}
          </div>
        )}
      </header>
      {isLoading && <div className="sheet__body"><div className="group"><SkeletonRows rows={6} cols={2} /></div></div>}
      {error && <div className="sheet__body"><Banner tone="error" title="No se pudo cargar la solicitud">{error.message}</Banner></div>}
      {request && <Details request={request} />}
    </>
  );
}

const TIMELINE_ICON: Record<string, IconName> = { CREADA: 'file', EN_REVISION: 'clock', APROBADA: 'check', RECHAZADA: 'x' };

function Details({ request }: { request: CreditRequestDTO }) {
  const { user } = useAuth();
  const isAnalyst = user?.role === 'ANALISTA';
  const schedule = useMemo(() => buildAmortizationSchedule(request.amountCents, request.termMonths), [request.amountCents, request.termMonths]);
  const { data: audit } = useRequestAudit(request.id);

  return (
    <>
      <div className="sheet__body">
        {request.status === 'RECHAZADA' && request.rejectionReason && (
          <Banner tone="error" title="Motivo del rechazo">{request.rejectionReason}</Banner>
        )}
        {request.status === 'APROBADA' && (
          <Banner tone="ok" title="Desembolso aprobado">
            {formatUSD(request.amountCents)} descontados del presupuesto{request.decidedAt ? ` el ${formatDateTime(request.decidedAt)}` : ''}.
          </Banner>
        )}

        <section className="group">
          <GroupTitle icon="user" title="Datos del solicitante" />
          <Row label="Solicitante" value={request.applicantName} />
          <Row label="DPI" value={<span className="mono">{request.documentId}</span>} />
          <Row label="Registrada por" value={request.ownerName} />
          <Row label="Ingreso mensual" value={formatUSD(request.monthlyIncomeCents)} />
          <Row label="Fecha de registro" value={formatDateTime(request.createdAt)} />
        </section>

        <BureauSection request={request} />

        <section className="group">
          <AmortizationTable schedule={schedule} collapsible />
        </section>

        <section className="group">
          <GroupTitle icon="activity" title="Historial de estados" />
          <ol className="timeline">
            {(audit ?? []).slice().reverse().map((e, i) => (
              <motion.li key={e.id} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25, ease: easeOut, delay: i * 0.04 }}>
                <span className="timeline__dot" style={{ ['--dot' as string]: STATUS_GRADIENT[e.toStatus] }}>
                  <Icon name={TIMELINE_ICON[e.toStatus] ?? 'file'} size={12} strokeWidth={2.6} />
                </span>
                <div style={{ fontWeight: 650, fontSize: '0.875rem' }}>
                  {e.fromStatus ? `${STATUS_LABELS[e.fromStatus]} → ` : ''}{STATUS_LABELS[e.toStatus]}
                </div>
                <div className="muted small">{e.actor.username} · {e.actor.role === 'ANALISTA' ? 'analista' : 'solicitante'} · {formatDateTime(e.timestamp)}</div>
                {e.comment && <div className="small" style={{ marginTop: 2 }}>{e.comment}</div>}
              </motion.li>
            ))}
          </ol>
        </section>
      </div>
      {isAnalyst && (request.status === 'CREADA' || request.status === 'EN_REVISION') && <AnalystActions request={request} />}
    </>
  );
}

function GroupTitle({ icon, title, right }: { icon: IconName; title: string; right?: ReactNode }) {
  return (
    <div className="group__title">
      <span className="group__icon"><Icon name={icon} size={16} /></span>
      <span className="title-3">{title}</span>
      {right}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="row"><span className="label">{label}</span><span className="value">{value}</span></div>;
}

const MAX_ATTEMPTS = 4;

function BureauSection({ request }: { request: CreditRequestDTO }) {
  const action = useRequestAction(request.id);
  const toast = useToast();
  const { bureau } = request;
  const final = request.status === 'APROBADA' || request.status === 'RECHAZADA';
  const loading = bureau.status === 'CONSULTANDO' || bureau.status === 'PENDIENTE';

  return (
    <section className="group">
      <GroupTitle icon="activity" title="Buró crediticio" right={loading ? <span className="bureau-loading"><Spinner size={12} /> En curso</span> : undefined} />

      {bureau.status === 'COMPLETADO' && bureau.score !== null && (
        <motion.div className="bureau-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: easeOut }}>
          <ScoreGauge score={bureau.score} rating={bureau.rating} size={76} />
          <div className="bureau-panel__info">
            <span className="eyebrow">Score crediticio</span>
            <span className="bureau-panel__score tabular">{bureau.score} <span className="muted small">/ 850</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`grade grade--${gradeOf(bureau.rating)}`}>{gradeOf(bureau.rating)}</span>
              <span className="small">{bureau.rating?.split(' · ')[1]}</span>
            </span>
            {bureau.checkedAt && <span className="muted small">Consultado {formatDateTime(bureau.checkedAt)}</span>}
          </div>
        </motion.div>
      )}

      {loading && (
        <div className="bureau-steps" aria-live="polite">
          {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
            const n = i + 1;
            const current = Math.max(1, bureau.attempts);
            const state = n < current ? 'failed' : n === current ? 'active' : 'pending';
            return (
              <div key={n} className={`step step--${state}`}>
                <span className="step__dot">{state === 'failed' ? <Icon name="x" size={11} strokeWidth={3} /> : state === 'active' ? <Spinner size={11} /> : n}</span>
                {state === 'failed' ? `Intento ${n}: servicio no disponible (503)` : state === 'active' ? `Intento ${n}: consultando… (2–4 s)` : `Intento ${n}: en espera`}
              </div>
            );
          })}
          <span className="muted small">Si el servicio falla se reintenta con espera progresiva. Puede seguir navegando.</span>
        </div>
      )}

      {bureau.status === 'FALLIDO' && (
        <div style={{ padding: '6px 16px 16px', display: 'grid', gap: 12 }}>
          <Banner tone="warn" title="El buró no respondió">
            {bureau.error} <span style={{ display: 'inline-flex', verticalAlign: 'middle', marginLeft: 4 }}><AttemptDots attempts={bureau.attempts} /></span>
          </Banner>
          {!final && (
            <button type="button" className="btn btn-tinted" disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'retry-bureau' }, {
                onSuccess: () => toast('Reintentando consulta al buró', 'info'),
                onError: (e) => toast('No se pudo reintentar', 'error', e.message),
              })}>
              {action.isPending ? <Spinner /> : <Icon name="refresh" size={16} />} Reintentar consulta
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function AnalystActions({ request }: { request: CreditRequestDTO }) {
  const action = useRequestAction(request.id);
  const toast = useToast();
  const { data: budget } = useBudget();
  const [confirming, setConfirming] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  // Una clave por intención de decisión: doble clic o reintentos de red reutilizan la misma.
  const approveKey = useRef(crypto.randomUUID());
  const rejectKey = useRef(crypto.randomUUID());

  const onError = (e: Error) => {
    toast('No se pudo completar la acción', 'error', e.message);
    if (e instanceof ApiError && e.status === 409) setConfirming(false);
  };

  if (request.status === 'CREADA') {
    return (
      <footer className="sheet__foot">
        <button type="button" className="btn btn-primary btn-block" disabled={action.isPending}
          onClick={() => action.mutate({ kind: 'review' }, {
            onSuccess: () => toast(`Solicitud #${request.id} en revisión`, 'info', 'Consultando el buró con datos actualizados.'),
            onError,
          })}>
          {action.isPending ? <Spinner /> : <Icon name="search" size={18} />} Tomar en revisión
        </button>
      </footer>
    );
  }

  const bureauReady = request.bureau.status === 'COMPLETADO';
  const insufficient = budget !== undefined && budget.availableCents < request.amountCents;
  const parsedReason = rejectRequestSchema.safeParse({ reason });
  const reasonError = touched && !parsedReason.success ? parsedReason.error.issues[0]?.message : undefined;
  const reasonLength = reason.trim().length;

  return (
    <footer className="sheet__foot">
      {!bureauReady && <Banner tone="info" title="Esperando al buró">La aprobación se habilita cuando la consulta esté completa.</Banner>}
      {insufficient && budget && (
        <Banner tone="warn" title="Presupuesto insuficiente">Disponible {formatUSD(budget.availableCents)}, se requieren {formatUSD(request.amountCents)}.</Banner>
      )}

      <AnimatePresence initial={false}>
        {rejecting && (
          <motion.div className="field" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={spring} style={{ overflow: 'hidden' }}>
            <label htmlFor="reason">Justificación del rechazo</label>
            <textarea id="reason" className="input" value={reason} maxLength={500} autoFocus aria-invalid={reasonError ? true : undefined}
              data-valid={parsedReason.success ? true : undefined}
              placeholder="Explique el motivo (mínimo 15 caracteres)" onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span className="error">{reasonError}</span>
              <span className={`hint tabular${parsedReason.success ? ' hint--ok' : ''}`}>
                {parsedReason.success && <Icon name="check" size={13} strokeWidth={2.6} />}
                {reasonLength}/{REJECTION_REASON_MIN_LENGTH} mín.
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {rejecting ? (
          <>
            <button type="button" className="btn btn-tinted" onClick={() => setRejecting(false)} disabled={action.isPending}>Cancelar</button>
            <button type="button" className="btn btn-danger" disabled={!parsedReason.success || action.isPending}
              onClick={() => action.mutate(
                { kind: 'reject', reason: parsedReason.data?.reason ?? '', idempotencyKey: rejectKey.current },
                { onSuccess: () => toast(`Solicitud #${request.id} rechazada`, 'ok', 'La justificación quedó registrada en auditoría.'), onError },
              )}>
              {action.isPending && <Spinner />} Confirmar rechazo
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost-danger" onClick={() => setRejecting(true)}>
              <Icon name="x" size={16} strokeWidth={2.4} /> Rechazar
            </button>
            <button type="button" className="btn btn-success" disabled={!bureauReady || insufficient} onClick={() => setConfirming(true)}>
              <Icon name="check" size={16} strokeWidth={2.4} /> Aprobar
            </button>
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`¿Aprobar ${formatUSD(request.amountCents)}?`}
        message={<>Se descontará del presupuesto global{budget ? <> (disponible: <b>{formatUSD(budget.availableCents)}</b>)</> : null}. Esta decisión es definitiva.</>}
        confirmLabel="Aprobar"
        tone="success"
        icon="wallet"
        busy={action.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => action.mutate(
          { kind: 'approve', idempotencyKey: approveKey.current },
          {
            onSuccess: () => {
              setConfirming(false);
              toast(`Solicitud #${request.id} aprobada`, 'ok', `${formatUSD(request.amountCents)} descontados del presupuesto.`);
            },
            onError,
          },
        )}
      />
    </footer>
  );
}
