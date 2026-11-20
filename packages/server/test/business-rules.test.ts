import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAmortizationSchedule,
  canTransition,
  createRequestSchema,
  evaluateRecentHistory,
  rejectRequestSchema,
} from '@guadalupana/shared';

const NOW = new Date('2026-11-20T12:00:00.000Z');
const daysBefore = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

const validRequest = {
  applicantName: 'Juan Pérez',
  documentId: '2547896320101',
  monthlyIncome: 5000,
  amount: 2000,
  termMonths: 12,
};

describe('Regla: límite de endeudamiento (40 % del ingreso)', () => {
  it('acepta exactamente el 40 % y rechaza un centavo más', () => {
    assert.equal(createRequestSchema.safeParse(validRequest).success, true);

    const over = createRequestSchema.safeParse({ ...validRequest, amount: 2000.01 });
    assert.equal(over.success, false);
    assert.match(over.error?.issues[0]?.message ?? '', /40%/);
    assert.deepEqual(over.error?.issues[0]?.path, ['amount']);
  });

  it('solo admite plazos de 6, 12, 24 o 36 meses', () => {
    assert.equal(createRequestSchema.safeParse({ ...validRequest, termMonths: 18 }).success, false);
    for (const termMonths of [6, 12, 24, 36]) {
      assert.equal(createRequestSchema.safeParse({ ...validRequest, termMonths }).success, true);
    }
  });
});

describe('Regla: historial reciente por documento', () => {
  it('bloquea si hay un rechazo en los últimos 30 días e informa el motivo exacto', () => {
    const result = evaluateRecentHistory(
      [{ id: 7, status: 'RECHAZADA', createdAt: daysBefore(12), decidedAt: daysBefore(10) }],
      NOW,
    );
    assert.equal(result.eligible, false);
    assert.equal(result.blockingRequestId, 7);
    assert.match(result.reason ?? '', /#7 RECHAZADA el 2026-11-10.*a partir del 2026-12-10/);
  });

  it('permite solicitar si el rechazo tiene más de 30 días o la previa fue aprobada', () => {
    assert.equal(
      evaluateRecentHistory([{ id: 1, status: 'RECHAZADA', createdAt: daysBefore(40), decidedAt: daysBefore(31) }], NOW).eligible,
      true,
    );
    assert.equal(
      evaluateRecentHistory([{ id: 2, status: 'APROBADA', createdAt: daysBefore(3), decidedAt: daysBefore(2) }], NOW).eligible,
      true,
    );
  });

  it('bloquea si hay una solicitud pendiente (CREADA o EN_REVISION)', () => {
    for (const status of ['CREADA', 'EN_REVISION'] as const) {
      const result = evaluateRecentHistory([{ id: 3, status, createdAt: daysBefore(1), decidedAt: null }], NOW);
      assert.equal(result.eligible, false);
      assert.match(result.reason ?? '', /pendiente/);
    }
  });
});

describe('Regla: máquina de estados', () => {
  it('solo permite CREADA → EN_REVISION → APROBADA | RECHAZADA', () => {
    assert.equal(canTransition('CREADA', 'EN_REVISION'), true);
    assert.equal(canTransition('EN_REVISION', 'APROBADA'), true);
    assert.equal(canTransition('EN_REVISION', 'RECHAZADA'), true);

    assert.equal(canTransition('CREADA', 'APROBADA'), false, 'no se permiten saltos');
    assert.equal(canTransition('RECHAZADA', 'APROBADA'), false, 'no se permiten reversiones');
    assert.equal(canTransition('APROBADA', 'RECHAZADA'), false);
    assert.equal(canTransition('APROBADA', 'APROBADA'), false);
  });

  it('exige una justificación de rechazo de al menos 15 caracteres (sin contar espacios extremos)', () => {
    assert.equal(rejectRequestSchema.safeParse({ reason: '   muy corto    ' }).success, false);
    assert.equal(rejectRequestSchema.safeParse({ reason: 'Ingresos no verificables' }).success, true);
  });
});

describe('Simulación financiera: tabla de amortización (1.5 % mensual)', () => {
  it('calcula la cuota fija y el capital amortizado suma exactamente el monto', () => {
    const schedule = buildAmortizationSchedule(200_000, 12);
    assert.equal(schedule.monthlyPaymentCents, 18_336); // $2,000 a 12 meses → $183.36
    assert.equal(schedule.rows.length, 12);
    assert.equal(schedule.rows[0]?.interestCents, 3_000); // 1.5 % de $2,000
    assert.equal(schedule.rows.reduce((s, r) => s + r.principalCents, 0), 200_000);
    assert.equal(schedule.rows.at(-1)?.balanceCents, 0);
  });
});
