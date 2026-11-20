import { buildAmortizationSchedule, type Role, type UserDTO } from '@guadalupana/shared';
import type { Container } from '../container.ts';
import { ratingFor, scoreFor } from '../http/mock-bureau.ts';
import { hashPassword } from '../services/auth.service.ts';
import { inTransaction } from './database.ts';

export const DEMO_USERS: ReadonlyArray<{ username: string; fullName: string; role: Role; password: string }> = [
  { username: 'ana.lopez', fullName: 'Ana López', role: 'ANALISTA', password: 'Analista2026!' },
  { username: 'carlos.mendez', fullName: 'Carlos Méndez', role: 'ANALISTA', password: 'Analista2026!' },
  { username: 'juan.perez', fullName: 'Juan Pérez', role: 'SOLICITANTE', password: 'Socio2026!' },
  { username: 'maria.garcia', fullName: 'María García', role: 'SOLICITANTE', password: 'Socio2026!' },
];

export function seedUsers(c: Container): void {
  const now = new Date().toISOString();
  for (const u of DEMO_USERS) {
    if (!c.users.findByUsername(u.username)) {
      c.users.insert({ username: u.username, fullName: u.fullName, role: u.role, passwordHash: hashPassword(u.password) }, now);
    }
  }
}

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Algunas solicitudes de ejemplo (con su auditoría) para que el panel no arranque vacío. */
export function seedDemoRequests(c: Container): void {
  if (c.requests.count() > 0) return;
  const user = (username: string): UserDTO => {
    const found = c.users.findByUsername(username);
    if (!found) throw new Error(`Usuario demo ${username} no existe`);
    return { id: found.id, username: found.username, fullName: found.fullName, role: found.role };
  };
  const juan = user('juan.perez');
  const maria = user('maria.garcia');
  const ana = user('ana.lopez');

  const samples = [
    { owner: juan, name: 'Juan Pérez', doc: '2547896320101', income: 650000, amount: 240000, term: 12, flow: ['CREADA'], ago: 1 },
    { owner: maria, name: 'María García', doc: '3012457890108', income: 900000, amount: 350000, term: 24, flow: ['CREADA', 'EN_REVISION'], ago: 2 },
    { owner: juan, name: 'Rosa Hernández', doc: '1987456320115', income: 1200000, amount: 480000, term: 36, flow: ['CREADA', 'EN_REVISION'], ago: 3 },
    { owner: maria, name: 'Pedro Ajú', doc: '2233445566778', income: 400000, amount: 160000, term: 6, flow: ['CREADA', 'EN_REVISION', 'RECHAZADA'], ago: 5 },
  ] as const;

  inTransaction(c.db, () => {
    for (const s of samples) {
      const createdAt = daysAgo(s.ago);
      const id = c.requests.insert(
        {
          ownerId: s.owner.id,
          applicantName: s.name,
          documentId: s.doc,
          monthlyIncomeCents: s.income,
          amountCents: s.amount,
          termMonths: s.term,
          monthlyPaymentCents: buildAmortizationSchedule(s.amount, s.term).monthlyPaymentCents,
        },
        createdAt,
      );
      const score = scoreFor(s.doc);
      c.requests.updateBureau(id, { status: 'COMPLETADO', attempts: 1, score, rating: ratingFor(score), checkedAt: createdAt });
      c.audit.append({ requestId: id, actor: s.owner, fromStatus: null, toStatus: 'CREADA', comment: 'Solicitud registrada', timestamp: createdAt });

      let version = 1;
      let from: 'CREADA' | 'EN_REVISION' = 'CREADA';
      for (const [step, to] of s.flow.slice(1).entries()) {
        const at = daysAgo(s.ago - 0.5 * (step + 1));
        const reason = to === 'RECHAZADA' ? 'Capacidad de pago insuficiente según el buró crediticio' : undefined;
        c.requests.changeStatus({ id, from, to, expectedVersion: version++, now: at, ...(reason ? { rejectionReason: reason } : {}) });
        c.audit.append({
          requestId: id,
          actor: ana,
          fromStatus: from,
          toStatus: to,
          comment: reason ?? 'Solicitud tomada para revisión',
          timestamp: at,
        });
        if (to === 'EN_REVISION') from = 'EN_REVISION';
      }
    }
  });
}
