import { z } from 'zod';
import { hasAtMostTwoDecimals, toCents, formatUSD } from './money.ts';
import { LOAN_TERMS, REJECTION_REASON_MIN_LENGTH, exceedsDebtLimit, maxAmountForIncome } from './rules.ts';

const MAX_MONEY = 10_000_000;

const money = (label: string) =>
  z
    .number({ error: `${label} debe ser un número válido` })
    .positive({ error: `${label} debe ser mayor que cero` })
    .max(MAX_MONEY, { error: `${label} excede el máximo permitido` })
    .refine(hasAtMostTwoDecimals, { error: `${label} admite como máximo 2 decimales` });

/** DPI guatemalteco: 13 dígitos. */
export const documentIdSchema = z
  .string({ error: 'El documento es obligatorio' })
  .trim()
  .regex(/^\d{13}$/, { error: 'El DPI debe tener exactamente 13 dígitos numéricos' });

export const createRequestSchema = z
  .strictObject({
    applicantName: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(3, { error: 'El nombre debe tener al menos 3 caracteres' })
      .max(120, { error: 'El nombre no puede superar 120 caracteres' })
      .regex(/^\p{L}[\p{L} .'-]*$/u, { error: 'El nombre solo puede contener letras y espacios' }),
    documentId: documentIdSchema,
    monthlyIncome: money('El ingreso mensual'),
    amount: money('El monto solicitado'),
    termMonths: z.literal(LOAN_TERMS, { error: 'El plazo debe ser de 6, 12, 24 o 36 meses' }),
  })
  .superRefine((data, ctx) => {
    const incomeCents = toCents(data.monthlyIncome);
    if (exceedsDebtLimit(toCents(data.amount), incomeCents)) {
      ctx.addIssue({
        code: 'custom',
        path: ['amount'],
        message: `El monto no puede superar el 40% del ingreso mensual (máximo ${formatUSD(maxAmountForIncome(incomeCents))})`,
      });
    }
  });
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

export const rejectRequestSchema = z.strictObject({
  reason: z
    .string({ error: 'La justificación es obligatoria' })
    .trim()
    .min(REJECTION_REASON_MIN_LENGTH, {
      error: `La justificación debe tener al menos ${REJECTION_REASON_MIN_LENGTH} caracteres`,
    })
    .max(500, { error: 'La justificación no puede superar 500 caracteres' }),
});
export type RejectRequestInput = z.infer<typeof rejectRequestSchema>;

export const loginSchema = z.strictObject({
  username: z.string().trim().min(1, { error: 'Ingrese su usuario' }).max(50),
  password: z.string().min(1, { error: 'Ingrese su contraseña' }).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const idSchema = z.coerce.number().int().positive();

export const idempotencyKeySchema = z
  .string({ error: 'Falta el encabezado Idempotency-Key' })
  .trim()
  .min(8, { error: 'Idempotency-Key inválida' })
  .max(100, { error: 'Idempotency-Key inválida' });
