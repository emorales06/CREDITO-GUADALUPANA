import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'motion/react';
import { STATUS_LABELS, formatUSD, type BureauResultDTO, type RequestStatus } from '@guadalupana/shared';

export const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const;

/* ───── Iconos (SVG en línea, heredan currentColor) ───── */
const paths = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 8v5m0 3.5v.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 16v-4m0-4h.01M22 12a10 10 0 11-20 0 10 10 0 0120 0z',
  refresh: 'M4 4v5h5M20 20v-5h-5M5.6 15a7 7 0 0011.8 2.4L20 15M4 9l2.6-2.4A7 7 0 0118.4 9',
  inbox: 'M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2-8z',
  logout: 'M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7',
} as const;

export function Icon({ name, size = 20, className }: { name: keyof typeof paths; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}

export const Spinner = () => <span className="spinner" role="status" aria-label="Cargando" />;

export function StatusBadge({ status }: { status: RequestStatus }) {
  return <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>;
}

export function BureauIndicator({ bureau, maxAttempts = 4 }: { bureau: BureauResultDTO; maxAttempts?: number }) {
  switch (bureau.status) {
    case 'PENDIENTE':
      return <span className="bureau bureau--PENDIENTE"><Spinner /> En cola</span>;
    case 'CONSULTANDO':
      return (
        <span className="bureau bureau--CONSULTANDO">
          <Spinner /> Consultando{bureau.attempts > 1 ? ` · intento ${bureau.attempts}/${maxAttempts}` : '…'}
        </span>
      );
    case 'COMPLETADO':
      return (
        <span className="bureau bureau--COMPLETADO">
          <span className="score-pill tabular">{bureau.score}</span>
          <span className="muted small">{bureau.rating?.split(' · ')[0]}</span>
        </span>
      );
    case 'FALLIDO':
      return <span className="bureau bureau--FALLIDO"><Icon name="alert" size={16} /> No disponible</span>;
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

export function Banner({ tone, title, children }: { tone: 'error' | 'ok' | 'info' | 'warn'; title?: string; children: ReactNode }) {
  const icon = tone === 'ok' ? 'check' : tone === 'info' ? 'info' : 'alert';
  return (
    <motion.div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
      <Icon name={icon} className="banner__icon" />
      <div>{title && <strong>{title}</strong>}{children}</div>
    </motion.div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.value === value && <motion.span layoutId={`seg-${label}`} className="thumb" transition={spring} />}
          <span className="label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, tone = 'primary', busy, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel: string; tone?: 'primary' | 'success' | 'danger';
  busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="dialog-layer">
          <motion.div className="scrim" style={{ zIndex: 0 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={busy ? undefined : onCancel} />
          <motion.div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"
            initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring}>
            <h2 id="dialog-title" className="title-3">{title}</h2>
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
    </AnimatePresence>
  );
}

/* ───── Toasts ───── */
interface Toast { id: number; message: string; tone: 'ok' | 'error' }
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div key={t.id} layout className={`toast toast--${t.tone}`}
              initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16 }} transition={spring}>
              <Icon name={t.tone === 'ok' ? 'check' : 'alert'} size={18} /> {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

export const formatDate = (iso: string) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(new Date(iso));
