import { MONTHLY_INTEREST_RATE } from './rules.ts';
import type { Cents } from './money.ts';

export interface AmortizationRow {
  month: number;
  paymentCents: Cents;
  interestCents: Cents;
  principalCents: Cents;
  balanceCents: Cents;
}

export interface AmortizationSchedule {
  monthlyPaymentCents: Cents;
  totalPaymentCents: Cents;
  totalInterestCents: Cents;
  rows: AmortizationRow[];
}

/** Cuota fija (sistema francés): P · i / (1 − (1 + i)^−n). */
export function monthlyPayment(principalCents: Cents, months: number, rate = MONTHLY_INTEREST_RATE): Cents {
  if (principalCents <= 0 || months <= 0) return 0;
  if (rate === 0) return Math.ceil(principalCents / months);
  return Math.round((principalCents * rate) / (1 - (1 + rate) ** -months));
}

export function buildAmortizationSchedule(
  principalCents: Cents,
  months: number,
  rate = MONTHLY_INTEREST_RATE,
): AmortizationSchedule {
  const payment = monthlyPayment(principalCents, months, rate);
  const rows: AmortizationRow[] = [];
  let balance = principalCents;

  for (let month = 1; month <= months && principalCents > 0; month++) {
    const interestCents = Math.round(balance * rate);
    // La última cuota absorbe el redondeo acumulado para que el saldo cierre exactamente en 0.
    const principalPart = month === months ? balance : payment - interestCents;
    balance -= principalPart;
    rows.push({
      month,
      paymentCents: principalPart + interestCents,
      interestCents,
      principalCents: principalPart,
      balanceCents: balance,
    });
  }

  const totalPaymentCents = rows.reduce((sum, r) => sum + r.paymentCents, 0);
  return {
    monthlyPaymentCents: payment,
    totalPaymentCents,
    totalInterestCents: totalPaymentCents - principalCents,
    rows,
  };
}
