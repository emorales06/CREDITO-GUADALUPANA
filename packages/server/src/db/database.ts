import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { INITIAL_BUDGET_CENTS } from '@guadalupana/shared';

export type Db = DatabaseSync;
export type Params = SQLInputValue[];

const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT    NOT NULL UNIQUE,
    full_name     TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK (role IN ('SOLICITANTE', 'ANALISTA')),
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL
  );

  CREATE TABLE credit_requests (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id              INTEGER NOT NULL REFERENCES users(id),
    applicant_name        TEXT    NOT NULL,
    document_id           TEXT    NOT NULL,
    monthly_income_cents  INTEGER NOT NULL CHECK (monthly_income_cents > 0),
    amount_cents          INTEGER NOT NULL CHECK (amount_cents > 0),
    term_months           INTEGER NOT NULL CHECK (term_months IN (6, 12, 24, 36)),
    monthly_payment_cents INTEGER NOT NULL,
    status                TEXT    NOT NULL DEFAULT 'CREADA'
                          CHECK (status IN ('CREADA', 'EN_REVISION', 'APROBADA', 'RECHAZADA')),
    rejection_reason      TEXT,
    bureau_status         TEXT    NOT NULL DEFAULT 'PENDIENTE'
                          CHECK (bureau_status IN ('PENDIENTE', 'CONSULTANDO', 'COMPLETADO', 'FALLIDO')),
    bureau_score          INTEGER,
    bureau_rating         TEXT,
    bureau_attempts       INTEGER NOT NULL DEFAULT 0,
    bureau_error          TEXT,
    bureau_checked_at     TEXT,
    version               INTEGER NOT NULL DEFAULT 1,
    created_at            TEXT    NOT NULL,
    updated_at            TEXT    NOT NULL,
    decided_at            TEXT,
    CHECK (amount_cents * 100 <= monthly_income_cents * 40),
    CHECK (status <> 'RECHAZADA' OR length(trim(rejection_reason)) >= 15)
  );

  CREATE INDEX idx_requests_document ON credit_requests (document_id, created_at);
  CREATE INDEX idx_requests_owner ON credit_requests (owner_id, created_at);
  CREATE INDEX idx_requests_status ON credit_requests (status);

  -- Garantía a nivel de BD: un documento no puede tener dos solicitudes abiertas a la vez.
  CREATE UNIQUE INDEX uq_requests_open_document
    ON credit_requests (document_id) WHERE status IN ('CREADA', 'EN_REVISION');

  CREATE TABLE budget (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    total_cents     INTEGER NOT NULL,
    available_cents INTEGER NOT NULL CHECK (available_cents >= 0),
    updated_at      TEXT    NOT NULL
  );

  CREATE TABLE audit_log (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id     INTEGER NOT NULL REFERENCES credit_requests(id),
    actor_id       INTEGER NOT NULL REFERENCES users(id),
    actor_username TEXT    NOT NULL,
    actor_role     TEXT    NOT NULL,
    from_status    TEXT,
    to_status      TEXT    NOT NULL,
    comment        TEXT,
    created_at     TEXT    NOT NULL
  );
  CREATE INDEX idx_audit_request ON audit_log (request_id, id);

  -- El registro de auditoría es append-only: la propia BD rechaza modificaciones y borrados.
  CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log es inmutable'); END;
  CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
  BEGIN SELECT RAISE(ABORT, 'audit_log es inmutable'); END;

  CREATE TABLE idempotency_keys (
    user_id       INTEGER NOT NULL REFERENCES users(id),
    idem_key      TEXT    NOT NULL,
    action        TEXT    NOT NULL,
    request_id    INTEGER NOT NULL,
    status_code   INTEGER NOT NULL,
    response_json TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    PRIMARY KEY (user_id, idem_key)
  );
  `,
  // v2 · rol ADMIN, estado de la cuenta, ajustes de apariencia, restablecimientos y auditoría administrativa.
  // SQLite no permite alterar un CHECK: se reconstruye la tabla con el procedimiento oficial de 12 pasos.
  `
  CREATE TABLE users_v2 (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT    NOT NULL UNIQUE,
    full_name            TEXT    NOT NULL,
    role                 TEXT    NOT NULL CHECK (role IN ('SOLICITANTE', 'ANALISTA', 'ADMIN')),
    password_hash        TEXT    NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 0 CHECK (must_change_password IN (0, 1)),
    is_active            INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    password_changed_at  TEXT    NOT NULL,
    created_at           TEXT    NOT NULL
  );
  INSERT INTO users_v2 (id, username, full_name, role, password_hash, password_changed_at, created_at)
    SELECT id, username, full_name, role, password_hash, created_at, created_at FROM users;
  DROP TABLE users;
  ALTER TABLE users_v2 RENAME TO users;

  CREATE TABLE app_settings (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    theme_json TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    updated_by INTEGER REFERENCES users(id)
  );

  CREATE TABLE password_reset_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    status      TEXT    NOT NULL DEFAULT 'PENDIENTE' CHECK (status IN ('PENDIENTE', 'RESUELTA', 'DESCARTADA')),
    created_at  TEXT    NOT NULL,
    resolved_at TEXT,
    resolved_by INTEGER REFERENCES users(id)
  );
  CREATE UNIQUE INDEX uq_reset_pending ON password_reset_requests (user_id) WHERE status = 'PENDIENTE';

  CREATE TABLE admin_audit (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id       INTEGER REFERENCES users(id),
    actor_username TEXT    NOT NULL,
    action         TEXT    NOT NULL,
    target         TEXT    NOT NULL,
    detail         TEXT,
    created_at     TEXT    NOT NULL
  );
  CREATE TRIGGER admin_audit_no_update BEFORE UPDATE ON admin_audit
  BEGIN SELECT RAISE(ABORT, 'admin_audit es inmutable'); END;
  CREATE TRIGGER admin_audit_no_delete BEFORE DELETE ON admin_audit
  BEGIN SELECT RAISE(ABORT, 'admin_audit es inmutable'); END;
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

function migrate(db: Db): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number };
  if (row.user_version >= MIGRATIONS.length) return seedBudget(db);

  // Las claves foráneas se desactivan solo durante la migración (no se puede dentro de una transacción)
  // y se verifica la integridad referencial antes de confirmar cada paso.
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    for (let v = row.user_version; v < MIGRATIONS.length; v++) {
      inTransaction(db, () => {
        db.exec(MIGRATIONS[v] as string);
        const broken = db.prepare('PRAGMA foreign_key_check').all();
        if (broken.length > 0) throw new Error(`Migración ${v + 1}: ${broken.length} referencias rotas`);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
  seedBudget(db);
}

function seedBudget(db: Db): void {
  db.prepare(
    'INSERT OR IGNORE INTO budget (id, total_cents, available_cents, updated_at) VALUES (1, ?, ?, ?)',
  ).run(INITIAL_BUDGET_CENTS, INITIAL_BUDGET_CENTS, new Date().toISOString());
}

export function openDatabase(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  migrate(db);
  db.exec('PRAGMA foreign_keys = ON;');
  return db;
}

/**
 * Ejecuta `fn` dentro de una transacción BEGIN IMMEDIATE: toma el bloqueo de escritura al inicio,
 * de modo que dos escritores (aunque sean procesos distintos) nunca leen el mismo estado y
 * deciden en paralelo. Cualquier excepción revierte todo.
 */
export function inTransaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // la transacción ya fue revertida por SQLite
    }
    throw error;
  }
}

export function queryOne<T>(db: Db, sql: string, ...params: Params): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function queryAll<T>(db: Db, sql: string, ...params: Params): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function execute(db: Db, sql: string, ...params: Params): { changes: number; lastId: number } {
  const result = db.prepare(sql).run(...params);
  return { changes: Number(result.changes), lastId: Number(result.lastInsertRowid) };
}

export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
