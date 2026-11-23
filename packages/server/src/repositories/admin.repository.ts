import { DEFAULT_THEME, themeSchema, type AdminAuditDTO, type PasswordResetRequestDTO, type ThemeSettings, type UserDTO } from '@guadalupana/shared';
import { execute, queryAll, queryOne, type Db } from '../db/database.ts';

/** Ajustes de apariencia (fila única). Un JSON corrupto nunca rompe la app: se vuelve al tema por defecto. */
export class SettingsRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  getTheme(): ThemeSettings {
    const row = queryOne<{ theme_json: string }>(this.#db, 'SELECT theme_json FROM app_settings WHERE id = 1');
    if (!row) return DEFAULT_THEME;
    try {
      const parsed = themeSchema.safeParse({ ...DEFAULT_THEME, ...(JSON.parse(row.theme_json) as object) });
      return parsed.success ? parsed.data : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  saveTheme(theme: ThemeSettings, actorId: number, now: string): void {
    execute(
      this.#db,
      `INSERT INTO app_settings (id, theme_json, updated_at, updated_by) VALUES (1, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET theme_json = excluded.theme_json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
      JSON.stringify(theme),
      now,
      actorId,
    );
  }
}

export class PasswordResetRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  /** Idempotente: si ya hay una solicitud pendiente para el usuario, no crea otra. */
  requestFor(userId: number, now: string): void {
    execute(
      this.#db,
      'INSERT OR IGNORE INTO password_reset_requests (user_id, created_at) VALUES (?, ?)',
      userId,
      now,
    );
  }

  listPending(): PasswordResetRequestDTO[] {
    return queryAll<{ id: number; user_id: number; username: string; full_name: string; created_at: string }>(
      this.#db,
      `SELECT r.id, r.user_id, u.username, u.full_name, r.created_at
         FROM password_reset_requests r JOIN users u ON u.id = r.user_id
        WHERE r.status = 'PENDIENTE' ORDER BY r.id`,
    ).map((r) => ({ id: r.id, userId: r.user_id, username: r.username, fullName: r.full_name, createdAt: r.created_at }));
  }

  findPending(id: number): { id: number; userId: number } | undefined {
    const row = queryOne<{ id: number; user_id: number }>(
      this.#db,
      "SELECT id, user_id FROM password_reset_requests WHERE id = ? AND status = 'PENDIENTE'",
      id,
    );
    return row && { id: row.id, userId: row.user_id };
  }

  resolveForUser(userId: number, status: 'RESUELTA' | 'DESCARTADA', actorId: number, now: string): void {
    execute(
      this.#db,
      "UPDATE password_reset_requests SET status = ?, resolved_at = ?, resolved_by = ? WHERE user_id = ? AND status = 'PENDIENTE'",
      status,
      now,
      actorId,
      userId,
    );
  }

  countPending(): number {
    return queryOne<{ n: number }>(this.#db, "SELECT COUNT(*) AS n FROM password_reset_requests WHERE status = 'PENDIENTE'")?.n ?? 0;
  }
}

/** Bitácora administrativa de solo inserción (triggers impiden modificarla). */
export class AdminAuditRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  append(actor: Pick<UserDTO, 'id' | 'username'> | null, action: string, target: string, detail: string | null, now: string): void {
    execute(
      this.#db,
      'INSERT INTO admin_audit (actor_id, actor_username, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      actor?.id ?? null,
      actor?.username ?? 'sistema',
      action,
      target,
      detail,
      now,
    );
  }

  list(limit = 200): AdminAuditDTO[] {
    return queryAll<{ id: number; actor_username: string; action: string; target: string; detail: string | null; created_at: string }>(
      this.#db,
      'SELECT * FROM admin_audit ORDER BY id DESC LIMIT ?',
      Math.min(limit, 1000),
    ).map((r) => ({ id: r.id, actor: r.actor_username, action: r.action, target: r.target, detail: r.detail, timestamp: r.created_at }));
  }

  count(): number {
    return queryOne<{ n: number }>(this.#db, 'SELECT COUNT(*) AS n FROM admin_audit')?.n ?? 0;
  }
}
