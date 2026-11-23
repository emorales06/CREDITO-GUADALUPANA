import { AnimatePresence, motion } from 'motion/react';
import { formatUSD, type CreditRequestDTO } from '@guadalupana/shared';
import { BureauIndicator, EmptyState, SkeletonRows, StatusBadge, easeOut, formatDate } from './ui.tsx';

export function RequestsTable({ requests, loading, onOpen, showOwner = false, emptyTitle, emptyText }: {
  requests: CreditRequestDTO[] | undefined;
  loading: boolean;
  onOpen: (id: number) => void;
  showOwner?: boolean;
  emptyTitle: string;
  emptyText?: string;
}) {
  if (loading) return <SkeletonRows cols={showOwner ? 7 : 6} />;
  if (!requests?.length) return <EmptyState title={emptyTitle}>{emptyText}</EmptyState>;

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Solicitante</th>
            <th className="hide-sm">DPI</th>
            {showOwner && <th className="hide-sm">Registró</th>}
            <th className="num">Monto</th>
            <th className="num hide-sm">Plazo</th>
            <th className="num hide-sm">Cuota</th>
            <th>Buró</th>
            <th>Estado</th>
            <th className="hide-sm">Fecha</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {requests.map((r) => (
              <motion.tr key={r.id} layout="position" className="clickable" tabIndex={0}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: easeOut }}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(r.id)}>
                <td className="cell-id tabular">{r.id}</td>
                <td>
                  <span className="cell-strong">{r.applicantName}</span>
                </td>
                <td className="mono muted hide-sm">{r.documentId}</td>
                {showOwner && <td className="muted hide-sm">{r.ownerName}</td>}
                <td className="num cell-money">{formatUSD(r.amountCents)}</td>
                <td className="num hide-sm">{r.termMonths} m</td>
                <td className="num hide-sm">{formatUSD(r.monthlyPaymentCents)}</td>
                <td><BureauIndicator bureau={r.bureau} /></td>
                <td><StatusBadge status={r.status} /></td>
                <td className="muted hide-sm" style={{ whiteSpace: 'nowrap' }}>{formatDate(r.createdAt)}</td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
