import type { AdminUserDTO, Role, UserDTO } from '@guadalupana/shared';
import { execute, queryAll, queryOne, type Db, type Params } from '../db/database.ts';

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  password_hash: string;
  must_change_password: number;
  is_active: number;
  password_changed_at: string;
  created_at: string;
}

export interface UserRecord extends UserDTO {
  passwordHash: string;
  isActive: boolean;
  passwordChangedAt: string;
  createdAt: string;
}

const toRecord = (r: UserRow): UserRecord => ({
  id: r.id,
  username: r.username,
  fullName: r.full_name,
  role: r.role,
  mustChangePassword: r.must_change_password === 1,
  passwordHash: r.password_hash,
  isActive: r.is_active === 1,
  passwordChangedAt: r.password_changed_at,
  createdAt: r.created_at,
});

/** Proyección pública: el hash nunca sale del repositorio hacia la API. */
export const toPublicUser = (u: UserRecord): UserDTO => ({
  id: u.id,
  username: u.username,
  fullName: u.fullName,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
});

export interface NewUser {
  username: string;
  fullName: string;
  role: Role;
  passwordHash: string;
  mustChangePassword: boolean;
}

export class UsersRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  findByUsername(username: string): UserRecord | undefined {
    const row = queryOne<UserRow>(this.#db, 'SELECT * FROM users WHERE username = ? COLLATE NOCASE', username);
    return row && toRecord(row);
  }

  findById(id: number): UserRecord | undefined {
    const row = queryOne<UserRow>(this.#db, 'SELECT * FROM users WHERE id = ?', id);
    return row && toRecord(row);
  }

  insert(user: NewUser, now: string): number {
    return execute(
      this.#db,
      `INSERT INTO users (username, full_name, role, password_hash, must_change_password, password_changed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      user.username,
      user.fullName,
      user.role,
      user.passwordHash,
      user.mustChangePassword ? 1 : 0,
      now,
      now,
    ).lastId;
  }

  listForAdmin(): AdminUserDTO[] {
    return queryAll<UserRow & { pending_reset: number }>(
      this.#db,
      `SELECT u.*, EXISTS (SELECT 1 FROM password_reset_requests r WHERE r.user_id = u.id AND r.status = 'PENDIENTE') AS pending_reset
         FROM users u ORDER BY u.role, u.full_name`,
    ).map((r) => {
      const rec = toRecord(r);
      return { ...toPublicUser(rec), isActive: rec.isActive, createdAt: rec.createdAt, pendingReset: r.pending_reset === 1 };
    });
  }

  update(id: number, changes: { fullName?: string; role?: Role; isActive?: boolean }): void {
    const sets: string[] = [];
    const params: Params = [];
    if (changes.fullName !== undefined) { sets.push('full_name = ?'); params.push(changes.fullName); }
    if (changes.role !== undefined) { sets.push('role = ?'); params.push(changes.role); }
    if (changes.isActive !== undefined) { sets.push('is_active = ?'); params.push(changes.isActive ? 1 : 0); }
    if (sets.length === 0) return;
    execute(this.#db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params, id);
  }

  /** Cambiar la contraseña invalida todas las sesiones emitidas antes de `now`. */
  setPassword(id: number, passwordHash: string, mustChange: boolean, now: string): void {
    execute(
      this.#db,
      'UPDATE users SET password_hash = ?, must_change_password = ?, password_changed_at = ? WHERE id = ?',
      passwordHash,
      mustChange ? 1 : 0,
      now,
      id,
    );
  }

  /** Cerrar la sesión de un usuario (p. ej. al desactivarlo o cambiar su rol). */
  revokeSessions(id: number, now: string): void {
    execute(this.#db, 'UPDATE users SET password_changed_at = ? WHERE id = ?', now, id);
  }

  countActiveAdmins(): number {
    return queryOne<{ n: number }>(this.#db, "SELECT COUNT(*) AS n FROM users WHERE role = 'ADMIN' AND is_active = 1")?.n ?? 0;
  }

  countByRole(): { role: Role; active: number; inactive: number }[] {
    return queryAll<{ role: Role; active: number; inactive: number }>(
      this.#db,
      'SELECT role, SUM(is_active) AS active, SUM(1 - is_active) AS inactive FROM users GROUP BY role',
    );
  }
}
