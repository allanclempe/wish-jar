import { MAX_IMPORT_ROWS_PER_TABLE } from './limits';
import { SETTING_KEYS } from './settings';
import { type Db, run } from './sql';
import {
  bad,
  coins,
  dayKey,
  emoji,
  id,
  integer,
  name,
  period,
  photoUri,
  pin,
  record,
  time,
} from './validate';

type Value = string | number | null;

// Each table's columns as the app's version 10 database has them, and how to
// check a value. Listed in the order they're filled, so every reference points
// at a row that's already there.
const TABLES: Record<string, Record<string, (value: unknown, what: string) => Value>> = {
  kids: { id, name, photo_uri: photoUri, created_at: time },
  tasks: {
    id,
    name,
    period,
    coin_amount: coins,
    icon_emoji: emoji,
    icon_photo_uri: photoUri,
    created_at: time,
  },
  consequence_types: {
    id,
    name,
    coin_amount: coins,
    icon_emoji: emoji,
    icon_photo_uri: photoUri,
    created_at: time,
  },
  wishes: {
    id,
    kid_id: id,
    name,
    coin_amount: coins,
    icon_emoji: emoji,
    icon_photo_uri: photoUri,
    created_at: time,
    claimed_at: (value, what) => (value === null ? null : time(value, what)),
  },
  completions: { kid_id: id, task_id: id, day_key: dayKey, coin_amount: coins, created_at: time },
  // Consequences can take a kid below zero.
  kid_savings: { kid_id: id, amount: (value, what) => integer(value, what, -1e12, 1e12) },
  consequences: {
    id,
    kid_id: id,
    consequence_type_id: (value, what) => (value === null ? null : id(value, what)),
    name,
    coin_amount: coins,
    day_key: dayKey,
    created_at: time,
  },
  app_settings: { key: settingKey, value: (value) => (typeof value === 'string' ? value : bad('value should be text')) },
};

function settingKey(value: unknown): string {
  if (typeof value !== 'string' || !(SETTING_KEYS as readonly string[]).includes(value)) {
    bad('app_settings key is not one the app keeps');
  }
  return value;
}

// The setting's value must be what the app would have written.
function checkSetting(key: Value, value: Value): void {
  if (key === 'parent_pin') pin(value);
  if (key === 'sound_enabled' && value !== '0' && value !== '1') bad('sound_enabled should be 0 or 1');
  if (key === 'active_kid_id' && !/^[1-9]\d{0,15}$/.test(String(value))) bad('active_kid_id should be an id');
}

// Copies an existing jar in, ids and all. Runs inside the family's creation,
// so a jar that doesn't hold together (a wish for a kid that isn't there)
// leaves nothing behind. Every column must be given and none added: a jar from
// another version is turned away rather than half read.
export function importJar(db: Db, value: unknown): void {
  const jar = record(value, 'jar');
  for (const table of Object.keys(jar)) {
    if (!Object.hasOwn(TABLES, table)) bad(`jar has no table ${table}`);
  }
  for (const [table, columns] of Object.entries(TABLES)) {
    const rows = jar[table];
    if (rows === undefined) continue;
    if (!Array.isArray(rows)) bad(`jar.${table} should be a list`);
    if (rows.length > MAX_IMPORT_ROWS_PER_TABLE) bad(`jar.${table} has too many rows`);
    const names = Object.keys(columns);
    const statement = `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`;
    for (const [index, entry] of rows.entries()) {
      const row = record(entry, `jar.${table}[${index}]`);
      for (const column of Object.keys(row)) {
        if (!Object.hasOwn(columns, column)) bad(`jar.${table} has no column ${column}`);
      }
      const values = names.map((column) => {
        if (!Object.hasOwn(row, column)) bad(`jar.${table}[${index}] has no ${column}`);
        return columns[column](row[column], `jar.${table}[${index}].${column}`);
      });
      if (table === 'app_settings') checkSetting(values[0], values[1]);
      run(db, statement, ...values);
    }
  }
}
