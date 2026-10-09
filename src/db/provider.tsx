import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import type { PropsWithChildren } from 'react';

import { migrateDatabase } from './migrations';

export const DATABASE_NAME = 'wish-jar.db';

export function DatabaseProvider({ children }: PropsWithChildren) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDatabase}>
      {children}
    </SQLiteProvider>
  );
}

export function useDatabase(): SQLiteDatabase {
  return useSQLiteContext();
}

export type { SQLiteDatabase };
