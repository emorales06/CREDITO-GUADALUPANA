import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { STATUS_LABELS, formatUSD, type BureauResultDTO, type RequestStatus } from '@guadalupana/shared';

/** Resorte críticamente amortiguado (sin rebote) para superficies; ease-out fuerte para entradas pequeñas. */
export const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const;
export const easeOut = [0.23, 1, 0.32, 1] as const;

/* ───── Iconos (SVG en línea, heredan currentColor) ───── */
const paths = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 9v4m0 3.5v.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  refresh: 'M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0011.8 2.4L20 15M4 9l2.6-2.4A7 7 0 0118.4 9',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2-8z',
  logout: 'M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7',
  user: 'M20 21v-1a6 6 0 00-6-6h-4a6 6 0 00-6 6v1M12 11a4 4 0 100-8 4 4 0 000 8z',
  lock: 'M7 11V7a5 5 0 0110 0v4M5 11h14v10H5z',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
  clock: 'M12 7v5l3 2M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  file: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6M8 13h8M8 17h5',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  wallet: 'M20 7H5a2 2 0 010-4h13v4M3 5v14a2 2 0 002 2h15V7M16 14h.01',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  plus: 'M12 5v14M5 12h14',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  calc: 'M5 2h14a1 1 0 011 1v18a1 1 0 01-1 1H5a1 1 0 01-1-1V3a1 1 0 011-1zM8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h8',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z',
} as const;
export type IconName = keyof typeof paths;

export function Icon({ name, size = 20, className, strokeWidth = 2 }: { name: IconName; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export const Spinner = ({ size = 16 }: { size?: number }) => (
  <span className="spinner" role="status" aria-label="Cargando" style={{ width: size, height: size }} />
);

/* ───── Estados ───── */
const STATUS_ICON: Record<RequestStatus, IconName> = { CREADA: 'file', EN_REVISION: 'clock', APROBADA: 'check', RECHAZADA: 'x' };
export const STATUS_GRADIENT: Record<RequestStatus, string> = {
  CREADA: 'var(--grad-slate)',
  EN_REVISION: 'var(--grad-warn)',
  APROBADA: 'var(--grad-success)',
  RECHAZADA: 'var(--grad-danger)',
};

export function StatusBadge({ status, onBrand = false }: { status: RequestStatus; onBrand?: boolean }) {
  return (
    <span className={`badge badge--${status}${onBrand ? ' badge--onbrand' : ''}`}>
      <Icon name={STATUS_ICON[status]} size={13} strokeWidth={2.6} /> {STATUS_LABELS[status]}
    </span>
  );
}

export const gradeOf = (rating: string | null) => (rating?.charAt(0) ?? '?') as 'A' | 'B' | 'C' | 'D';
const gradeColor = { A: '#2bab4e', B: '#0d5aa8', C: '#f08c00', D: '#e5493d' } as const;

export function ScoreGauge({ score, rating, size = 64 }: { score: number; rating: string | null; size?: number }) {
  const stroke = size >= 60 ? 7 : 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, (score - 300) / 550));
  const color = gradeColor[gradeOf(rating)] ?? '#0d5aa8';
  return (
    <span className="gauge" style={{ width: size, height: size }} aria-label={`Score ${score} de 850`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6ecf4" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
      </svg>
      <span className="gauge__value" style={{ fontSize: size >= 60 ? '1.05rem' : '0.62rem' }}>{score}</span>
    </span>
  );
}

export function AttemptDots({ attempts, max = 4 }: { attempts: number; max?: number }) {
  return (
    <span className="attempts" aria-label={`Intento ${attempts} de ${max}`}>
      {Array.from({ length: max }, (_, i) => <i key={i} className={i < attempts ? 'on' : ''} />)}
    </span>
  );
}

export function BureauIndicator({ bureau }: { bureau: BureauResultDTO }) {
  switch (bureau.status) {
    case 'PENDIENTE':
      return <span className="bureau-loading"><Spinner size={12} /> En cola</span>;
    case 'CONSULTANDO':
      return (
        <span className="bureau-loading">
          <Spinner size={12} /> {bureau.attempts > 1 ? 'Reintentando' : 'Consultando'} <AttemptDots attempts={Math.max(1, bureau.attempts)} />
        </span>
      );
    case 'COMPLETADO':
      return (
        <span className="score-chip" title={bureau.rating ?? undefined}>
          <span className="tabular">{bureau.score}</span>
          <span className={`grade grade--${gradeOf(bureau.rating)}`}>{gradeOf(bureau.rating)}</span>
        </span>
      );
    case 'FALLIDO':
      return <span className="bureau-failed"><Icon name="alert" size={13} strokeWidth={2.4} /> No disponible</span>;
  }
}

/** Número que interpola con un resorte críticamente amortiguado cuando cambia (p. ej. el presupuesto). */
export function AnimatedMoney({ cents }: { cents: number }) {
  const value = useMotionValue(cents);
  const text = useTransform(value, (v) => formatUSD(Math.round(v)));
  useEffect(() => {
    const controls = animate(value, cents, { type: 'spring', bounce: 0, duration: 0.8 });
    return () => controls.stop();
  }, [cents, value]);
  return <motion.span className="tabular">{text}</motion.span>;
}

/* ───── Alertas ───── */
type Tone = 'error' | 'ok' | 'info' | 'warn';
const TONE_ICON: Record<Tone, IconName> = { error: 'alert', ok: 'check', info: 'info', warn: 'alert' };

export function Banner({ tone, title, children }: { tone: Tone; title?: string; children: ReactNode }) {
  return (
    <motion.div className={`alert alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.22, ease: easeOut }}>
      <span className="alert__icon"><Icon name={TONE_ICON[tone]} size={17} strokeWidth={2.4} /></span>
      <div className={title ? '' : 'alert__body'}>{title && <strong className="alert__title">{title}</strong>}{children}</div>
    </motion.div>
  );
}

export function EmptyState({ icon = 'inbox', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty__icon"><Icon name={icon} size={28} /></span>
      <b>{title}</b>
      {children && <span className="small">{children}</span>}
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div style={{ padding: '8px 20px 20px', display: 'grid', gap: 18 }} aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `40px repeat(${cols - 1}, 1fr)`, gap: 16, alignItems: 'center' }}>
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className="skeleton" style={{ width: c === 0 ? 28 : `${60 + ((r * 7 + c * 13) % 35)}%`, height: c === 1 ? 16 : 12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: ReadonlyArray<{ value: T; label: string; count?: number }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${label}`} className="thumb" transition={spring} />}
          <span className="label">{o.label}</span>
          {o.count !== undefined && <span className="count tabular">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'primary', icon = 'check', busy, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel: string; tone?: 'primary' | 'success' | 'danger'; icon?: IconName;
  busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="dialog-layer">
          <motion.div className="scrim" style={{ zIndex: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }} onClick={busy ? undefined : onCancel} />
          <motion.div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring}>
            <span className={`dialog__icon dialog__icon--${tone}`}><Icon name={icon} size={28} strokeWidth={2.4} /></span>
            <h2 id="dialog-title" className="title-2">{title}</h2>
            <p>{message}</p>
            <div className="dialog__actions">
              <button type="button" className="btn btn-tinted" onClick={onCancel} disabled={busy}>Cancelar</button>
              <button type="button" className={`btn btn-${tone}`} onClick={onConfirm} disabled={busy} autoFocus>
                {busy && <Spinner />} {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ───── Toasts ───── */
type ToastTone = 'ok' | 'error' | 'info';
interface Toast { id: number; title: string; description: string | undefined; tone: ToastTone }
type PushToast = (title: string, tone?: ToastTone, description?: string) => void;
const ToastContext = createContext<PushToast>(() => {});
const TOAST_MS = 4500;
const TOAST_ICON: Record<ToastTone, IconName> = { ok: 'check', error: 'alert', info: 'info' };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback<PushToast>((title, tone = 'ok', description) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, title, description, tone }]);
    setTimeout(() => dismiss(id), TOAST_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div key={t.id} layout className={`toast toast--${t.tone}`} role={t.tone === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, x: -24, scale: 0.98 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: -24, scale: 0.98 }}
              transition={spring}>
              <span className="toast__icon"><Icon name={TOAST_ICON[t.tone]} size={18} strokeWidth={2.4} /></span>
              <div className="toast__text">
                <div className="toast__title">{t.title}</div>
                {t.description && <div className="toast__desc">{t.description}</div>}
              </div>
              <button type="button" className="icon-btn" aria-label="Cerrar notificación" onClick={() => dismiss(t.id)}>
                <Icon name="x" size={14} />
              </button>
              <motion.span className="toast__progress" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }}
                transition={{ duration: TOAST_MS / 1000, ease: 'linear' }} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export const initials = (name: string) =>
  name.split(' ').filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export const formatDate = (iso: string) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(iso));
