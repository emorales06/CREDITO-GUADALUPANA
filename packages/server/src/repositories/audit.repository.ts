import type { AuditEntryDTO, RequestStatus, Role, UserDTO } from '@guadalupana/shared';
import { execute, queryAll, queryOne, type Db, type Params } from '../db/database.ts';

interface AuditRow {
  id: number;
  request_id: number;
  actor_id: number;
  actor_username: string;
  actor_role: Role;
  from_status: RequestStatus | null;
  to_status: RequestStatus;
  comment: string | null;
  created_at: string;
}

const toDTO = (r: AuditRow): AuditEntryDTO => ({
  id: r.id,
  requestId: r.request_id,
  actor: { id: r.actor_id, username: r.actor_username, role: r.actor_role },
  fromStatus: r.from_status,
  toStatus: r.to_status,
  comment: r.comment,
  timestamp: r.created_at,
});

export interface NewAuditEntry {
  requestId: number;
  actor: UserDTO;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  comment: string | null;
  timestamp: string;
}

/** Solo inserta y lee: no existe método de actualización ni borrado (y la BD los rechaza con triggers). */
export class AuditRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  append(entry: NewAuditEntry): AuditEntryDTO {
    const { lastId } = execute(
      this.#db,
      `INSERT INTO audit_log (request_id, actor_id, actor_username, actor_role, from_status, to_status, comment, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      entry.requestId,
      entry.actor.id,
      entry.actor.username,
      entry.actor.role,
      entry.fromStatus,
      entry.toStatus,
      entry.comment,
      entry.timestamp,
    );
    const row = queryOne<AuditRow>(this.#db, 'SELECT * FROM audit_log WHERE id = ?', lastId);
    if (!row) throw new Error('No se pudo leer la entrada de auditoría recién creada');
    return toDTO(row);
  }

  list(filter: { requestId?: number; limit?: number }): AuditEntryDTO[] {
    const params: Params = [];
    let where = '';
    if (filter.requestId !== undefined) {
      where = 'WHERE request_id = ?';
      params.push(filter.requestId);
    }
    params.push(Math.min(filter.limit ?? 200, 1000));
    return queryAll<AuditRow>(this.#db, `SELECT * FROM audit_log ${where} ORDER BY created_at DESC, id DESC LIMIT ?`, ...params).map(toDTO);
  }
}
