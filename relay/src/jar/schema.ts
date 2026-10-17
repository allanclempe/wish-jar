// The family jar's tables. Version 1 is the app's SQLite database at version
// 10 (src/db/migrations.ts) as one step, plus the family's devices. Later
// changes are added as new versions here: old app builds (the frame's bundled
// APK) keep working because they only ever call the API, never the tables.
//
// A Durable Object's SQLite won't run PRAGMA user_version, so the version is
// kept in jar_meta. Foreign keys are always on there, so ON DELETE CASCADE
// works as it does in the app.

export const JAR_VERSION = 2;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS kids (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      photo_uri TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      icon_emoji TEXT,
      icon_photo_uri TEXT,
      period TEXT NOT NULL DEFAULT 'morning'
        CHECK (period IN ('morning', 'afternoon', 'evening'))
    );

    CREATE TABLE IF NOT EXISTS wishes (
      id INTEGER PRIMARY KEY NOT NULL,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL CHECK (coin_amount >= 0),
      icon_emoji TEXT,
      icon_photo_uri TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      claimed_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS wishes_kid_id_idx ON wishes (kid_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS completions (
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      day_key TEXT NOT NULL,
      coin_amount INTEGER NOT NULL CHECK (coin_amount >= 0),
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      PRIMARY KEY (kid_id, task_id, day_key)
    );

    CREATE TABLE IF NOT EXISTS kid_savings (
      kid_id INTEGER PRIMARY KEY NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS consequence_types (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL CHECK (coin_amount >= 0),
      icon_emoji TEXT,
      icon_photo_uri TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS consequences (
      id INTEGER PRIMARY KEY NOT NULL,
      kid_id INTEGER NOT NULL REFERENCES kids(id) ON DELETE CASCADE,
      consequence_type_id INTEGER REFERENCES consequence_types(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      coin_amount INTEGER NOT NULL CHECK (coin_amount >= 0),
      day_key TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS consequences_kid_day_idx ON consequences (kid_id, day_key);

    -- Only a hash of each device's secret: a leaked jar gives no way in.
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY NOT NULL,
      secret_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
  `,
  // An Echo Show's device row keeps the hash of its Alexa device id (WJ-45),
  // so the Show can get a new token for the same row at every skill launch.
  // Removing the row ends that, as it does for any device.
  2: `
    ALTER TABLE devices ADD COLUMN echo_show_hash TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS devices_echo_show_hash
      ON devices (echo_show_hash) WHERE echo_show_hash IS NOT NULL;
  `,
};

// The app's starter list (migration 10 there), for a new family that brings no
// jar of its own. Plain VALUES: a Durable Object's SQLite allows far fewer
// UNION terms than the app's.
export const STARTER_CONSEQUENCE_TYPES = `
  INSERT INTO consequence_types (name, coin_amount, icon_emoji) VALUES
    ('Give a hug', 0, '🤗'),
    ('Say sorry', 0, '🙏'),
    ('Tidy up the mess', 0, '🧹'),
    ('Write a sorry note', 0, '✍️'),
    ('Make up with a brother or sister', 0, '🤝'),
    ('Told a lie', 3, '🤥'),
    ('Too much screen time', 2, '📱'),
    ('Not in bed on time', 2, '⏰'),
    ('Hurt someone', 5, '😡')
`;

// Whether this object holds a family yet. An unknown family id must not
// leave tables behind, so nothing is created until the family is.
export function isJar(storage: DurableObjectStorage): boolean {
  return (
    storage.sql.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'jar_meta'").toArray()
      .length > 0
  );
}

export function jarVersion(storage: DurableObjectStorage): number {
  if (!isJar(storage)) return 0;
  const row = storage.sql
    .exec<{ value: string }>("SELECT value FROM jar_meta WHERE key = 'version'")
    .toArray()[0];
  return row ? Number(row.value) : 0;
}

// Brings the tables up to JAR_VERSION, all or nothing.
export function migrateJar(storage: DurableObjectStorage): void {
  let version = jarVersion(storage);
  if (version >= JAR_VERSION) return;
  storage.transactionSync(() => {
    storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS jar_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
    );
    for (let next = version + 1; next <= JAR_VERSION; next += 1) {
      const migration = MIGRATIONS[next];
      if (migration) storage.sql.exec(migration);
      version = next;
    }
    storage.sql.exec(
      "INSERT INTO jar_meta (key, value) VALUES ('version', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      String(version),
    );
  });
}
