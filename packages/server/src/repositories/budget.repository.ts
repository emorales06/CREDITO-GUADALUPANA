import type { BudgetDTO } from '@guadalupana/shared';
import { execute, queryOne, type Db } from '../db/database.ts';

interface BudgetRow {
  total_cents: number;
  available_cents: number;
  updated_at: string;
}

export class BudgetRepository {
  #db: Db;

  constructor(db: Db) {
    this.#db = db;
  }

  get(): BudgetDTO {
    const row = queryOne<BudgetRow>(this.#db, 'SELECT * FROM budget WHERE id = 1');
    if (!row) throw new Error('Presupuesto no inicializado');
    return {
      totalCents: row.total_cents,
      availableCents: row.available_cents,
      approvedCents: row.total_cents - row.available_cents,
      updatedAt: row.updated_at,
    };
  }

  /** Descuento atómico y condicional: nunca deja el disponible en negativo. */
  debit(amountCents: number, now: string): boolean {
    const { changes } = execute(
      this.#db,
      `UPDATE budget SET available_cents = available_cents - ?, updated_at = ?
        WHERE id = 1 AND available_cents >= ?`,
      amountCents,
      now,
      amountCents,
    );
    return changes === 1;
  }
}
