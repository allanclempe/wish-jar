import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import type { Period } from '../db';
import { dayKey } from './day';
import { currentPeriod } from './period';

const CLOCK_CHECK_INTERVAL_MS = 60_000;

// The period and day the tasks screen shows, re-read every minute and when
// the app comes back to the foreground. One clock for the screen, so the sky
// and the header never disagree at a period boundary.
export function useClock(): { period: Period; day: string } {
  const [period, setPeriod] = useState(currentPeriod);
  const [day, setDay] = useState(dayKey);

  const refresh = useCallback(() => {
    setPeriod(currentPeriod());
    setDay(dayKey());
  }, []);

  useEffect(() => {
    const timer = setInterval(refresh, CLOCK_CHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [refresh]);

  return { period, day };
}
