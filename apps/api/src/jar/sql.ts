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

// The same jar, adding up the rows its statements write (each cursor's
// rowsWritten, which is what the Free plan counts), for the family's daily
// budget (src/jar/dailyWrites.ts). A cursor's count is final once it's read
// to the end, as all, first, run and insert do.
export function countingWrites(db: Db): { db: Db; written: () => number } {
  const cursors: SqlStorageCursor<Row>[] = [];
  const exec = <T extends Row>(query: string, ...bindings: unknown[]): SqlStorageCursor<T> => {
    const cursor = db.sql.exec<T>(query, ...bindings);
    cursors.push(cursor);
    return cursor;
  };
  const sql = withOwn(db.sql, { exec });
  return {
    db: withOwn(db, { sql }),
    written: () => cursors.reduce((rows, cursor) => rows + cursor.rowsWritten, 0),
  };
}

// `target` with `own` in place of some of its members. The rest are the
// target's own, its methods bound to it, as workerd's objects need.
function withOwn<T extends object>(target: T, own: Partial<T>): T {
  return new Proxy(target, {
    get(_, key) {
      if (key in own) return own[key as keyof T];
      const value: unknown = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
