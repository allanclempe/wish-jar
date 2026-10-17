import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import { addStarterTasks } from '../tasks/starter';
import { migrateDatabase } from './migrations';

export const DATABASE_NAME = 'wish-jar.db';

async function initDatabase(db: SQLiteDatabase): Promise<void> {
  await migrateDatabase(db);
  await addStarterTasks(db);
}

export function DatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
      {children}
    </SQLiteProvider>
  );
}

export function useDatabase(): SQLiteDatabase {
  return useSQLiteContext();
}

export type { SQLiteDatabase };
