import { z } from 'zod';
import { hasAtMostTwoDecimals, toCents, formatUSD } from './money.ts';
import { LOAN_TERMS, REJECTION_REASON_MIN_LENGTH, exceedsDebtLimit, maxAmountForIncome } from './rules.ts';
import { ROLES } from './status.ts';

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

/* ───── Cuentas y contraseñas ───── */

export const PASSWORD_RULES: ReadonlyArray<{ id: string; label: string; test: (v: string) => boolean }> = [
  { id: 'length', label: 'Al menos 10 caracteres', test: (v) => v.length >= 10 },
  { id: 'letter', label: 'Al menos una letra', test: (v) => /\p{L}/u.test(v) },
  { id: 'number', label: 'Al menos un número', test: (v) => /\d/.test(v) },
  { id: 'symbol', label: 'Al menos un símbolo', test: (v) => /[^\p{L}\d\s]/u.test(v) },
];

export const passwordSchema = z
  .string({ error: 'La contraseña es obligatoria' })
  .max(128, { error: 'La contraseña no puede superar 128 caracteres' })
  .superRefine((v, ctx) => {
    const failed = PASSWORD_RULES.find((r) => !r.test(v));
    if (failed) ctx.addIssue({ code: 'custom', message: `Contraseña débil: ${failed.label.toLowerCase()}` });
  });

export const usernameSchema = z
  .string({ error: 'El usuario es obligatorio' })
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{3,29}$/, { error: 'Usuario de 4 a 30 caracteres: letras, números, punto, guion o guion bajo' });

const fullNameSchema = z
  .string({ error: 'El nombre es obligatorio' })
  .trim()
  .min(3, { error: 'El nombre debe tener al menos 3 caracteres' })
  .max(80, { error: 'El nombre no puede superar 80 caracteres' })
  .regex(/^\p{L}[\p{L} .'-]*$/u, { error: 'El nombre solo puede contener letras y espacios' });

export const registerSchema = z
  .strictObject({
    fullName: fullNameSchema,
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.password !== d.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });
    if (d.password.toLowerCase().includes(d.username.toLowerCase())) {
      ctx.addIssue({ code: 'custom', path: ['password'], message: 'La contraseña no puede contener el usuario' });
    }
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, { error: 'Ingrese su contraseña actual' }).max(200),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((d, ctx) => {
    if (d.newPassword !== d.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Las contraseñas no coinciden' });
    if (d.newPassword === d.currentPassword) ctx.addIssue({ code: 'custom', path: ['newPassword'], message: 'La nueva contraseña debe ser distinta de la actual' });
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.strictObject({ username: z.string().trim().toLowerCase().min(1, { error: 'Ingrese su usuario' }).max(50) });

export const adminCreateUserSchema = z.strictObject({
  fullName: fullNameSchema,
  username: usernameSchema,
  role: z.enum(ROLES, { error: 'Rol inválido' }),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const adminUpdateUserSchema = z
  .strictObject({
    fullName: fullNameSchema.optional(),
    role: z.enum(ROLES, { error: 'Rol inválido' }).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { error: 'No hay cambios' });
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
