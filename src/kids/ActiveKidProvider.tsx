import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  getActiveKidId,
  getKidSavings,
  listKids,
  setActiveKidId,
  useFamilyJar,
  type Kid,
} from '../db';
import { savingsAfterTask } from './savings';

type ActiveKidContextValue = {
  ready: boolean;
  kids: Kid[];
  activeKid: Kid | null;
  refreshKids: () => Promise<void>;
  selectKid: (kidId: number) => Promise<void>;
  recordTaskCompletion: (kidId: number, coinAmount: number, completed: boolean) => void;
  recordSavingsChange: (kidId: number, delta: number) => void;
};

const ActiveKidContext = createContext<ActiveKidContextValue | null>(null);
// Savings change on every tick, so they have a context of their own: only the
// few screens that show coins re-render, not everything that knows the kid.
const SavingsContext = createContext<Record<number, number> | null>(null);

export function ActiveKidProvider({ children }: PropsWithChildren) {
  const jar = useFamilyJar();
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
    const [loadedKids, savedId] = await Promise.all([listKids(jar), getActiveKidId()]);
    let nextId = savedId;
    // The playing kid was deleted, so the first kid left takes over.
    if (savedId != null && !loadedKids.some((kid) => kid.id === savedId) && loadedKids.length > 0) {
      nextId = loadedKids[0].id;
      await setActiveKidId(nextId);
    }
    setKids(loadedKids);
    setActiveKidIdState(nextId);
  }, [jar]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listKids(jar), getActiveKidId()]).then(([loadedKids, savedId]) => {
      if (cancelled) return;
      setKids(loadedKids);
      setActiveKidIdState(savedId);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [jar]);

  useEffect(() => {
    if (activeKidId == null) return;
    let cancelled = false;
    getKidSavings(jar, activeKidId).then((amount) => {
      if (cancelled) return;
      setSavings((previous) => ({ ...previous, [activeKidId]: amount }));
    });
    return () => {
      cancelled = true;
    };
  }, [jar, activeKidId]);

  const selectKid = useCallback(
    async (kidId: number) => {
      await setActiveKidId(kidId);
      setActiveKidIdState(kidId);
    },
    [],
  );

  const value = useMemo<ActiveKidContextValue>(
    () => ({
      ready,
      kids,
      activeKid: kids.find((kid) => kid.id === activeKidId) ?? null,
      refreshKids,
      selectKid,
      recordTaskCompletion,
      recordSavingsChange,
    }),
    [ready, kids, activeKidId, refreshKids, selectKid, recordTaskCompletion, recordSavingsChange],
  );

  return (
    <ActiveKidContext.Provider value={value}>
      <SavingsContext.Provider value={savings}>{children}</SavingsContext.Provider>
    </ActiveKidContext.Provider>
  );
}

export function useActiveKid(): ActiveKidContextValue {
  const context = useContext(ActiveKidContext);
  if (!context) {
    throw new Error('useActiveKid must be used inside ActiveKidProvider');
  }
  return context;
}

// Each kid's coins, by kid id, as far as they have been loaded.
export function useSavings(): Record<number, number> {
  const context = useContext(SavingsContext);
  if (!context) {
    throw new Error('useSavings must be used inside ActiveKidProvider');
  }
  return context;
}
