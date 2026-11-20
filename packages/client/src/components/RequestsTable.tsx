import { AnimatePresence, motion } from 'motion/react';
import { formatUSD, type CreditRequestDTO } from '@guadalupana/shared';
import { BureauIndicator, Icon, Spinner, StatusBadge, formatDate } from './ui.tsx';

export function RequestsTable({ requests, loading, onOpen, showOwner = false, emptyText }: {
  requests: CreditRequestDTO[] | undefined;
  loading: boolean;
  onOpen: (id: number) => void;
  showOwner?: boolean;
  emptyText: string;
}) {
  if (loading) return <div className="empty"><Spinner /></div>;
  if (!requests?.length) {
    return (
      <div className="empty">
        <Icon name="inbox" />
        <div>{emptyText}</div>
      </div>
    );
  }

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
                initial={{ opacity: 0, backgroundColor: 'rgba(4,50,98,0.08)' }}
                animate={{ opacity: 1, backgroundColor: 'rgba(4,50,98,0)' }}
                transition={{ duration: 0.8 }}
                onClick={() => onOpen(r.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen(r.id)}>
                <td className="tabular muted">{r.id}</td>
                <td style={{ fontWeight: 600 }}>{r.applicantName}</td>
                <td className="mono muted hide-sm">{r.documentId}</td>
                {showOwner && <td className="muted hide-sm">{r.ownerName}</td>}
                <td className="num" style={{ fontWeight: 600 }}>{formatUSD(r.amountCents)}</td>
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
