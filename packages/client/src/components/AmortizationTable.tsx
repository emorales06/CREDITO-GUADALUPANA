import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { MONTHLY_INTEREST_RATE, formatUSD, type AmortizationSchedule } from '@guadalupana/shared';
import { spring } from './ui.tsx';

export function AmortizationSummary({ schedule }: { schedule: AmortizationSchedule }) {
  return (
    <div className="summary">
      <div>
        <div className="eyebrow">Cuota mensual</div>
        <div className="summary__value summary__value--hero tabular">{formatUSD(schedule.monthlyPaymentCents)}</div>
      </div>
      <div>
        <div className="eyebrow">Total intereses</div>
        <div className="summary__value tabular">{formatUSD(schedule.totalInterestCents)}</div>
      </div>
      <div>
        <div className="eyebrow">Total a pagar</div>
        <div className="summary__value tabular">{formatUSD(schedule.totalPaymentCents)}</div>
      </div>
    </div>
  );
}

export function AmortizationTable({ schedule, collapsible = false }: { schedule: AmortizationSchedule; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px' }}>
        <div>
          <div className="title-3">Tabla de amortización</div>
          <div className="muted small">Sistema de cuota fija · interés {(MONTHLY_INTEREST_RATE * 100).toFixed(1)}% mensual</div>
        </div>
        {collapsible && (
          <button type="button" className="btn btn-plain btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? 'Ocultar' : `Ver ${schedule.rows.length} cuotas`}
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={spring} style={{ overflow: 'hidden' }}>
            <div className="amort-scroll">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th className="num">Cuota</th>
                    <th className="num">Interés</th>
                    <th className="num">Capital</th>
                    <th className="num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.rows.map((r) => (
                    <tr key={r.month}>
                      <td className="tabular">{r.month}</td>
                      <td className="num">{formatUSD(r.paymentCents)}</td>
                      <td className="num muted">{formatUSD(r.interestCents)}</td>
                      <td className="num">{formatUSD(r.principalCents)}</td>
                      <td className="num">{formatUSD(r.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
