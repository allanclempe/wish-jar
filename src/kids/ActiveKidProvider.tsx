import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { getActiveKidId, listKids, setActiveKidId, useDatabase, type Kid } from '../db';

type ActiveKidContextValue = {
  ready: boolean;
  kids: Kid[];
  activeKid: Kid | null;
  refreshKids: () => Promise<void>;
  selectKid: (kidId: number) => Promise<void>;
};

const ActiveKidContext = createContext<ActiveKidContextValue | null>(null);

export function ActiveKidProvider({ children }: PropsWithChildren) {
  const db = useDatabase();
  const [ready, setReady] = useState(false);
  const [kids, setKids] = useState<Kid[]>([]);
  const [activeKidId, setActiveKidIdState] = useState<number | null>(null);

  const refreshKids = useCallback(async () => {
    setKids(await listKids(db));
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
      refreshKids,
      selectKid,
    }),
    [ready, kids, activeKidId, refreshKids, selectKid],
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
