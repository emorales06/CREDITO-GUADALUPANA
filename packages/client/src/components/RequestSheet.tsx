import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { Banner, BureauIndicator, ConfirmDialog, Icon, Spinner, StatusBadge, formatDateTime, spring, useToast } from './ui.tsx';

export function RequestSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  useEffect(() => {
    if (id === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);

  return (
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
    </AnimatePresence>
  );
}

function SheetContent({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: request, isLoading, error } = useRequest(id);
  return (
    <>
      <header className="sheet__head">
        <div>
          <div className="eyebrow">Solicitud #{id}</div>
          <div className="title-3">{request?.applicantName ?? 'Cargando…'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {request && <StatusBadge status={request.status} />}
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
        </div>
      </header>
      {isLoading && <div className="sheet__body"><div className="empty"><Spinner /></div></div>}
      {error && <div className="sheet__body"><Banner tone="error">{error.message}</Banner></div>}
      {request && <Details request={request} />}
    </>
  );
}

function Details({ request }: { request: CreditRequestDTO }) {
  const { user } = useAuth();
  const isAnalyst = user?.role === 'ANALISTA';
  const schedule = useMemo(() => buildAmortizationSchedule(request.amountCents, request.termMonths), [request.amountCents, request.termMonths]);
  const { data: audit } = useRequestAudit(request.id);

  return (
    <>
      <div className="sheet__body">
        <section className="group">
          <Row label="Solicitante" value={request.applicantName} />
          <Row label="DPI" value={<span className="mono">{request.documentId}</span>} />
          <Row label="Registrada por" value={request.ownerName} />
          <Row label="Ingreso mensual" value={formatUSD(request.monthlyIncomeCents)} />
          <Row label="Monto solicitado" value={<span style={{ color: 'var(--brand)', fontSize: '1.0625rem' }}>{formatUSD(request.amountCents)}</span>} />
          <Row label="Plazo" value={`${request.termMonths} meses`} />
          <Row label="Cuota estimada" value={formatUSD(request.monthlyPaymentCents)} />
          <Row label="Fecha de registro" value={formatDateTime(request.createdAt)} />
        </section>

        {request.status === 'RECHAZADA' && request.rejectionReason && (
          <Banner tone="error" title="Motivo del rechazo">{request.rejectionReason}</Banner>
        )}

        <BureauSection request={request} />

        <section className="group">
          <AmortizationTable schedule={schedule} collapsible />
        </section>

        <section className="group">
          <div className="group__title title-3">Historial</div>
          <ol className="timeline">
            {(audit ?? []).slice().reverse().map((e) => (
              <li key={e.id}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  {e.fromStatus ? `${STATUS_LABELS[e.fromStatus]} → ` : ''}{STATUS_LABELS[e.toStatus]}
                </div>
                <div className="muted small">{e.actor.username} · {e.actor.role.toLowerCase()} · {formatDateTime(e.timestamp)}</div>
                {e.comment && <div className="small" style={{ marginTop: 2 }}>{e.comment}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>
      {isAnalyst && (request.status === 'CREADA' || request.status === 'EN_REVISION') && <AnalystActions request={request} />}
    </>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return <div className="row"><span className="label">{label}</span><span className="value">{value}</span></div>;
}

function BureauSection({ request }: { request: CreditRequestDTO }) {
  const action = useRequestAction(request.id);
  const toast = useToast();
  const { bureau } = request;
  const final = request.status === 'APROBADA' || request.status === 'RECHAZADA';

  return (
    <section className="group">
      <div className="row">
        <span className="title-3">Buró crediticio</span>
        <BureauIndicator bureau={bureau} />
      </div>
      {bureau.status === 'COMPLETADO' && (
        <>
          <Row label="Score" value={<span className="tabular">{bureau.score} / 850</span>} />
          <Row label="Calificación" value={bureau.rating} />
          {bureau.checkedAt && <Row label="Consultado" value={formatDateTime(bureau.checkedAt)} />}
        </>
      )}
      {(bureau.status === 'CONSULTANDO' || bureau.status === 'PENDIENTE') && (
        <div className="row muted small">
          El servicio externo puede tardar de 2 a 4 s por intento y fallar temporalmente; se reintenta automáticamente con espera progresiva. Puede seguir navegando.
        </div>
      )}
      {bureau.status === 'FALLIDO' && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="small" style={{ color: 'var(--red)' }}>{bureau.error}</span>
          {!final && (
            <button type="button" className="btn btn-tinted btn-sm" disabled={action.isPending}
              onClick={() => action.mutate({ kind: 'retry-bureau' }, { onError: (e) => toast(e.message, 'error') })}>
              {action.isPending ? <Spinner /> : <Icon name="refresh" size={16} />} Reintentar
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
    toast(e.message, 'error');
    if (e instanceof ApiError && e.status === 409) setConfirming(false);
  };

  if (request.status === 'CREADA') {
    return (
      <footer className="sheet__foot">
        <button type="button" className="btn btn-primary btn-block" disabled={action.isPending}
          onClick={() => action.mutate({ kind: 'review' }, { onSuccess: () => toast('Solicitud en revisión · consultando buró'), onError })}>
          {action.isPending && <Spinner />} Tomar en revisión
        </button>
      </footer>
    );
  }

  const bureauReady = request.bureau.status === 'COMPLETADO';
  const insufficient = budget !== undefined && budget.availableCents < request.amountCents;
  const parsedReason = rejectRequestSchema.safeParse({ reason });
  const reasonError = touched && !parsedReason.success ? parsedReason.error.issues[0]?.message : undefined;

  return (
    <footer className="sheet__foot">
      {!bureauReady && <Banner tone="info">La aprobación se habilita cuando la consulta al buró esté completa.</Banner>}
      {insufficient && budget && <Banner tone="warn">El presupuesto disponible ({formatUSD(budget.availableCents)}) no alcanza para este monto.</Banner>}

      <AnimatePresence initial={false}>
        {rejecting && (
          <motion.div className="field" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={spring} style={{ overflow: 'hidden' }}>
            <label htmlFor="reason">Justificación del rechazo</label>
            <textarea id="reason" className="input" value={reason} maxLength={500} autoFocus aria-invalid={reasonError ? true : undefined}
              placeholder="Explique el motivo (mínimo 15 caracteres)" onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} />
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="error">{reasonError}</span>
              <span className="hint tabular">{reason.trim().length}/{REJECTION_REASON_MIN_LENGTH} mín.</span>
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
                { onSuccess: () => toast(`Solicitud #${request.id} rechazada`), onError },
              )}>
              {action.isPending && <Spinner />} Confirmar rechazo
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-tinted" style={{ color: 'var(--red)' }} onClick={() => setRejecting(true)}>
              <Icon name="x" size={16} /> Rechazar
            </button>
            <button type="button" className="btn btn-success" disabled={!bureauReady || insufficient} onClick={() => setConfirming(true)}>
              <Icon name="check" size={16} /> Aprobar
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
        busy={action.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => action.mutate(
          { kind: 'approve', idempotencyKey: approveKey.current },
          { onSuccess: () => { setConfirming(false); toast(`Solicitud #${request.id} aprobada`); }, onError },
        )}
      />
    </footer>
  );
}
