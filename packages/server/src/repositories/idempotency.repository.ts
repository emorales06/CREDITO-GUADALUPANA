import { execute, queryOne, type Db } from '../db/database.ts';

export interface StoredResponse {
  action: string;
  requestId: number;
  statusCode: number;
  body: unknown;
}

interface IdempotencyRow {
  action: string;
  request_id: number;
  status_code: number;
  response_json: string;
}

export class IdempotencyRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  find(userId: number, key: string): StoredResponse | undefined {
    const row = queryOne<IdempotencyRow>(
      this.#db,
      'SELECT action, request_id, status_code, response_json FROM idempotency_keys WHERE user_id = ? AND idem_key = ?',
      userId,
      key,
    );
    return (
      row && {
        action: row.action,
        requestId: row.request_id,
        statusCode: row.status_code,
        body: JSON.parse(row.response_json) as unknown,
      }
    );
  }

  save(userId: number, key: string, response: StoredResponse, now: string): void {
    execute(
      this.#db,
      `INSERT INTO idempotency_keys (user_id, idem_key, action, request_id, status_code, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      userId,
      key,
      response.action,
      response.requestId,
      response.statusCode,
      JSON.stringify(response.body),
      now,
    );
  }
}
