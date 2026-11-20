import type { Role, UserDTO } from '@guadalupana/shared';
import { execute, queryOne, type Db } from '../db/database.ts';

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  password_hash: string;
}

export interface UserWithHash extends UserDTO {
  passwordHash: string;
}

const toUser = (row: UserRow): UserWithHash => ({
  id: row.id,
  username: row.username,
  fullName: row.full_name,
  role: row.role,
  passwordHash: row.password_hash,
});

export class UsersRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  findByUsername(username: string): UserWithHash | undefined {
    const row = queryOne<UserRow>(this.#db, 'SELECT * FROM users WHERE username = ?', username);
    return row && toUser(row);
  }

  findById(id: number): UserWithHash | undefined {
    const row = queryOne<UserRow>(this.#db, 'SELECT * FROM users WHERE id = ?', id);
    return row && toUser(row);
  }

  insert(user: { username: string; fullName: string; role: Role; passwordHash: string }, now: string): number {
    return execute(
      this.#db,
      'INSERT INTO users (username, full_name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
      user.username,
      user.fullName,
      user.role,
      user.passwordHash,
      now,
    ).lastId;
  }
}
