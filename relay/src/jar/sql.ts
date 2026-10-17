// The jar's own SQLite, inside its Durable Object. Statements run
// synchronously, so one call's statements never interleave with another's;
// transactionSync makes the multi-statement ones all or nothing.
export type Db = DurableObjectStorage;

type Row = Record<string, SqlStorageValue>;

export function all<T extends Row>(db: Db, query: string, ...bindings: unknown[]): T[] {
  return db.sql.exec<T>(query, ...bindings).toArray();
}

export function first<T extends Row>(db: Db, query: string, ...bindings: unknown[]): T | null {
  return all<T>(db, query, ...bindings)[0] ?? null;
}

export function run(db: Db, query: string, ...bindings: unknown[]): void {
  db.sql.exec(query, ...bindings).toArray();
}

// The new row's id. The cursor has no lastInsertRowId, so inserts end in
// RETURNING id.
export function insert(db: Db, query: string, ...bindings: unknown[]): number {
  return all<{ id: number }>(db, `${query} RETURNING id`, ...bindings)[0].id;
}
