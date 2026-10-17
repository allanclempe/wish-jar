import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import {
  getActiveKidId,
  getKidSavings,
  listKids,
  setActiveKidId,
  useFamilyJar,
  useJarVersion,
  type FamilyJar,
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

// The kids, and the one playing on this device. When that kid was deleted
// (here or on another device), the first kid left takes over.
async function loadKids(jar: FamilyJar): Promise<{ kids: Kid[]; activeKidId: number | null }> {
  const [kids, savedId] = await Promise.all([listKids(jar), getActiveKidId()]);
  if (savedId != null && !kids.some((kid) => kid.id === savedId) && kids.length > 0) {
    await setActiveKidId(kids[0].id);
    return { kids, activeKidId: kids[0].id };
  }
  return { kids, activeKidId: savedId };
}

export function ActiveKidProvider({ children }: PropsWithChildren) {
  const jar = useFamilyJar();
  // Kids and coins another device changed load again (WJ-50).
  const kidsVersion = useJarVersion('kids');
  const savingsVersion = useJarVersion('kid_savings');
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
    const loaded = await loadKids(jar);
    setKids(loaded.kids);
    setActiveKidIdState(loaded.activeKidId);
  }, [jar]);

  // A load that fails brings up the jar's reconnecting screen, and runs again
  // with the new handle once the jar is back.
  useEffect(() => {
    let cancelled = false;
    loadKids(jar).then(
      (loaded) => {
        if (cancelled) return;
        // The same kids keep the same array, so a reload that found nothing
        // new (another device changed something else) re-renders nothing.
        setKids((current) => (JSON.stringify(current) === JSON.stringify(loaded.kids) ? current : loaded.kids));
        setActiveKidIdState(loaded.activeKidId);
        setReady(true);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar, kidsVersion]);

  useEffect(() => {
    if (activeKidId == null) return;
    let cancelled = false;
    getKidSavings(jar, activeKidId).then(
      (amount) => {
        if (cancelled) return;
        setSavings((previous) =>
          previous[activeKidId] === amount ? previous : { ...previous, [activeKidId]: amount },
        );
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [jar, activeKidId, savingsVersion]);

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
