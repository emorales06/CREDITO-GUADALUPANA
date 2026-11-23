import { statSync } from 'node:fs';
import {
  BUREAU_STATUSES,
  DEFAULT_THEME,
  REQUEST_STATUSES,
  ROLE_LABELS,
  type AdminCreateUserInput,
  type AdminOverviewDTO,
  type AdminUpdateUserInput,
  type AdminUserDTO,
  type ThemeSettings,
  type UserDTO,
} from '@guadalupana/shared';
import { SCHEMA_VERSION, inTransaction, isUniqueViolation, queryAll, queryOne, type Db } from '../db/database.ts';
import { businessRule, conflict, notFound } from '../domain/errors.ts';
import type { AdminAuditRepository, PasswordResetRepository, SettingsRepository } from '../repositories/admin.repository.ts';
import type { BudgetRepository } from '../repositories/budget.repository.ts';
import type { UsersRepository } from '../repositories/users.repository.ts';
import { generateTemporaryPassword, hashPassword } from './auth.service.ts';
import type { Clock } from './clock.ts';
import type { EventBus } from './event-bus.ts';

export interface AdminDeps {
  db: Db;
  dbPath: string;
  users: UsersRepository;
  settings: SettingsRepository;
  resets: PasswordResetRepository;
  adminAudit: AdminAuditRepository;
  budget: BudgetRepository;
  events: EventBus;
  clock: Clock;
}

const startedAt = new Date().toISOString();

/**
 * Operaciones exclusivas del rol ADMIN. Cada escritura va en una transacción junto con su
 * entrada en la bitácora administrativa: no existe un cambio sin rastro.
 */
export class AdminService {
  #d: AdminDeps;

  constructor(deps: AdminDeps) {
    this.#d = deps;
  }

  getTheme(): ThemeSettings {
    return this.#d.settings.getTheme();
  }

  updateTheme(actor: UserDTO, theme: ThemeSettings): ThemeSettings {
    const now = this.#now();
    const before = this.#d.settings.getTheme();
    const changed = (Object.keys(theme) as (keyof ThemeSettings)[]).filter((k) => theme[k] !== before[k]);
    inTransaction(this.#d.db, () => {
      this.#d.settings.saveTheme(theme, actor.id, now);
      const detail = changed.map((k) => (k === 'logoDataUrl' ? 'logo' : `${k}: ${String(before[k])} → ${String(theme[k])}`)).join(' · ');
      this.#d.adminAudit.append(actor, 'APARIENCIA', 'tema', detail || 'Sin cambios', now);
    });
    this.#d.events.publish({ type: 'theme.updated' });
    return this.#d.settings.getTheme();
  }

  resetTheme(actor: UserDTO): ThemeSettings {
    return this.updateTheme(actor, DEFAULT_THEME);
  }

  listUsers(): AdminUserDTO[] {
    return this.#d.users.listForAdmin();
  }

  /** Devuelve la contraseña temporal una sola vez; el usuario debe cambiarla al entrar. */
  createUser(actor: UserDTO, input: AdminCreateUserInput): { user: AdminUserDTO; temporaryPassword: string } {
    const temporaryPassword = generateTemporaryPassword();
    const now = this.#now();
    try {
      const id = inTransaction(this.#d.db, () => {
        const newId = this.#d.users.insert(
          { username: input.username, fullName: input.fullName, role: input.role, passwordHash: hashPassword(temporaryPassword), mustChangePassword: true },
          now,
        );
        this.#d.adminAudit.append(actor, 'USUARIO_CREADO', `usuario:${input.username}`, `Rol ${ROLE_LABELS[input.role]}`, now);
        return newId;
      });
      return { user: this.#mustFind(id), temporaryPassword };
    } catch (error) {
      if (isUniqueViolation(error)) throw businessRule('USERNAME_TAKEN', 'Ese usuario ya está en uso', 'username');
      throw error;
    }
  }

  updateUser(actor: UserDTO, id: number, input: AdminUpdateUserInput): AdminUserDTO {
    const now = this.#now();
    inTransaction(this.#d.db, () => {
      const target = this.#d.users.findById(id);
      if (!target) throw notFound('Usuario no encontrado');

      const losesAdmin = target.role === 'ADMIN' && target.isActive && ((input.role && input.role !== 'ADMIN') || input.isActive === false);
      if (losesAdmin && target.id === actor.id) {
        throw conflict('SELF_LOCKOUT', 'No puede quitarse a sí mismo el rol de administrador ni desactivar su cuenta');
      }
      if (losesAdmin && this.#d.users.countActiveAdmins() <= 1) {
        throw conflict('LAST_ADMIN', 'Debe existir al menos un administrador activo');
      }

      this.#d.users.update(id, input);
      // Un cambio de rol o una desactivación cierra las sesiones abiertas de ese usuario.
      if ((input.role && input.role !== target.role) || input.isActive === false) this.#d.users.revokeSessions(id, now);

      const detail = [
        input.fullName && input.fullName !== target.fullName ? `nombre: ${target.fullName} → ${input.fullName}` : null,
        input.role && input.role !== target.role ? `rol: ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[input.role]}` : null,
        input.isActive !== undefined && input.isActive !== target.isActive ? (input.isActive ? 'activado' : 'desactivado') : null,
      ].filter(Boolean).join(' · ');
      this.#d.adminAudit.append(actor, 'USUARIO_ACTUALIZADO', `usuario:${target.username}`, detail || 'Sin cambios', now);
    });
    return this.#mustFind(id);
  }

  resetPassword(actor: UserDTO, id: number): { user: AdminUserDTO; temporaryPassword: string } {
    const temporaryPassword = generateTemporaryPassword();
    const now = this.#now();
    inTransaction(this.#d.db, () => {
      const target = this.#d.users.findById(id);
      if (!target) throw notFound('Usuario no encontrado');
      this.#d.users.setPassword(id, hashPassword(temporaryPassword), true, now);
      this.#d.resets.resolveForUser(id, 'RESUELTA', actor.id, now);
      this.#d.adminAudit.append(actor, 'CONTRASENA_RESTABLECIDA', `usuario:${target.username}`, 'Contraseña temporal emitida', now);
    });
    return { user: this.#mustFind(id), temporaryPassword };
  }

  listResetRequests() {
    return this.#d.resets.listPending();
  }

  dismissResetRequest(actor: UserDTO, requestId: number): void {
    const now = this.#now();
    inTransaction(this.#d.db, () => {
      const request = this.#d.resets.findPending(requestId);
      if (!request) throw notFound('Solicitud de restablecimiento no encontrada');
      const target = this.#d.users.findById(request.userId);
      this.#d.resets.resolveForUser(request.userId, 'DESCARTADA', actor.id, now);
      this.#d.adminAudit.append(actor, 'RESTABLECIMIENTO_DESCARTADO', `usuario:${target?.username ?? request.userId}`, null, now);
    });
  }

  listAudit(limit?: number) {
    return this.#d.adminAudit.list(limit);
  }

  overview(): AdminOverviewDTO {
    const db = this.#d.db;
    const users = { SOLICITANTE: 0, ANALISTA: 0, ADMIN: 0, inactive: 0 };
    for (const r of this.#d.users.countByRole()) {
      users[r.role] = r.active;
      users.inactive += r.inactive;
    }

    const requests = Object.fromEntries(REQUEST_STATUSES.map((s) => [s, { count: 0, amountCents: 0 }])) as AdminOverviewDTO['requests'];
    for (const r of queryAll<{ status: keyof typeof requests; n: number; total: number }>(
      db, 'SELECT status, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total FROM credit_requests GROUP BY status',
    )) requests[r.status] = { count: r.n, amountCents: r.total };

    const bureau = { ...Object.fromEntries(BUREAU_STATUSES.map((s) => [s, 0])), avgAttempts: 0 } as AdminOverviewDTO['bureau'];
    for (const r of queryAll<{ bureau_status: (typeof BUREAU_STATUSES)[number]; n: number }>(
      db, 'SELECT bureau_status, COUNT(*) AS n FROM credit_requests GROUP BY bureau_status',
    )) bureau[r.bureau_status] = r.n;
    bureau.avgAttempts = Number(
      (queryOne<{ a: number | null }>(db, 'SELECT AVG(bureau_attempts) AS a FROM credit_requests WHERE bureau_attempts > 0')?.a ?? 0).toFixed(2),
    );

    // En modo WAL los cambios recientes viven en el archivo -wal: se suman ambos.
    const sizeOf = (path: string) => { try { return statSync(path).size; } catch { return 0; } };
    let dbSizeBytes = sizeOf(this.#d.dbPath) + sizeOf(`${this.#d.dbPath}-wal`);
    if (dbSizeBytes === 0) {
      dbSizeBytes = queryOne<{ s: number }>(db, 'SELECT page_count * page_size AS s FROM pragma_page_count(), pragma_page_size()')?.s ?? 0;
    }

    return {
      users,
      requests,
      bureau,
      budget: this.#d.budget.get(),
      auditEntries: queryOne<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM audit_log')?.n ?? 0,
      adminEntries: this.#d.adminAudit.count(),
      pendingResets: this.#d.resets.countPending(),
      system: { node: process.version, uptimeSeconds: Math.round(process.uptime()), dbSizeBytes, startedAt, schemaVersion: SCHEMA_VERSION },
    };
  }

  #mustFind(id: number): AdminUserDTO {
    const user = this.#d.users.listForAdmin().find((u) => u.id === id);
    if (!user) throw notFound('Usuario no encontrado');
    return user;
  }

  #now(): string {
    return this.#d.clock().toISOString();
  }
}
