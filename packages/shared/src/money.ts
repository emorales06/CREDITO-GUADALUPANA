/** Todos los importes viajan y se guardan en centavos (enteros) para evitar errores de punto flotante. */
export type Cents = number;

export const toCents = (amount: number): Cents => Math.round(amount * 100);

export const fromCents = (cents: Cents): number => cents / 100;

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export const formatUSD = (cents: Cents): string => usd.format(cents / 100);

export const hasAtMostTwoDecimals = (value: number): boolean =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
