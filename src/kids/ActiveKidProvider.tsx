import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  getActiveKidId,
  getKidSavings,
  listKids,
  setActiveKidId,
  useDatabase,
  type Kid,
} from '../db';
import { savingsAfterTask } from './savings';

type ActiveKidContextValue = {
  ready: boolean;
  kids: Kid[];
  activeKid: Kid | null;
  savings: Record<number, number>;
  refreshKids: () => Promise<void>;
  selectKid: (kidId: number) => Promise<void>;
  recordTaskCompletion: (kidId: number, coinAmount: number, completed: boolean) => void;
  recordSavingsChange: (kidId: number, delta: number) => void;
};

const ActiveKidContext = createContext<ActiveKidContextValue | null>(null);

export function ActiveKidProvider({ children }: PropsWithChildren) {
  const db = useDatabase();
  const [ready, setReady] = useState(false);
  const [kids, setKids] = useState<Kid[]>([]);
  const [activeKidId, setActiveKidIdState] = useState<number | null>(null);
  const [savings, setSavings] = useState<Record<number, number>>({});

  const recordTaskCompletion = useCallback(
    (kidId: number, coinAmount: number, completed: boolean) => {
      setSavings((previous) => ({
        ...previous,
        [kidId]: savingsAfterTask(previous[kidId] ?? 0, coinAmount, completed),
      }));
    },
    [],
  );

  const recordSavingsChange = useCallback((kidId: number, delta: number) => {
    setSavings((previous) => ({ ...previous, [kidId]: (previous[kidId] ?? 0) + delta }));
  }, []);

  const refreshKids = useCallback(async () => {
    const [loadedKids, savedId] = await Promise.all([listKids(db), getActiveKidId(db)]);
    let nextId = savedId;
    // The playing kid was deleted, so the first kid left takes over.
    if (savedId != null && !loadedKids.some((kid) => kid.id === savedId) && loadedKids.length > 0) {
      nextId = loadedKids[0].id;
      await setActiveKidId(db, nextId);
    }
    setKids(loadedKids);
    setActiveKidIdState(nextId);
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listKids(db), getActiveKidId(db)]).then(([loadedKids, savedId]) => {
      if (cancelled) return;
      setKids(loadedKids);
      setActiveKidIdState(savedId);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    if (activeKidId == null) return;
    let cancelled = false;
    getKidSavings(db, activeKidId).then((amount) => {
      if (cancelled) return;
      setSavings((previous) => ({ ...previous, [activeKidId]: amount }));
    });
    return () => {
      cancelled = true;
    };
  }, [db, activeKidId]);

  const selectKid = useCallback(
    async (kidId: number) => {
      await setActiveKidId(db, kidId);
      setActiveKidIdState(kidId);
    },
    [db],
  );

  const value = useMemo<ActiveKidContextValue>(
    () => ({
      ready,
      kids,
      activeKid: kids.find((kid) => kid.id === activeKidId) ?? null,
      savings,
      refreshKids,
      selectKid,
      recordTaskCompletion,
      recordSavingsChange,
    }),
    [ready, kids, activeKidId, savings, refreshKids, selectKid, recordTaskCompletion, recordSavingsChange],
  );

  return <ActiveKidContext.Provider value={value}>{children}</ActiveKidContext.Provider>;
}

export function useActiveKid(): ActiveKidContextValue {
  const context = useContext(ActiveKidContext);
  if (!context) {
    throw new Error('useActiveKid must be used inside ActiveKidProvider');
  }
  return context;
}
