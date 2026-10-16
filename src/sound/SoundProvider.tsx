import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getSoundEnabled, setSoundEnabled, useDatabase } from '../db';

// Two short clips from Kenney's CC0 packs (assets/sounds/CREDITS.md): a ding
// for every tick and a fanfare for the last one of the period.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const COIN = require('../../assets/sounds/coin.ogg');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FANFARE = require('../../assets/sounds/fanfare.ogg');

type SoundContextValue = {
  // The grown-ups' setting; on until they turn it off.
  soundOn: boolean;
  setSoundOn: (on: boolean) => Promise<void>;
  playCoin: () => void;
  playFanfare: () => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

// Sound effects for the kid screens. The players are made once and kept, so a
// tap replays its clip from the start with no load in between. Calls must
// come from inside a tap handler, before any await: the frame's WebView (and
// browsers in general) only start audio in response to a gesture. Anything
// that goes wrong just means silence.
export function SoundProvider({ children }: PropsWithChildren) {
  const db = useDatabase();
  const [soundOn, setSoundOnState] = useState(true);
  const players = useRef<{ coin: AudioPlayer; fanfare: AudioPlayer } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSoundEnabled(db).then((enabled) => {
      if (!cancelled) setSoundOnState(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [db]);

  useEffect(() => {
    try {
      // Short effects: they mix with whatever else is playing and follow the
      // phone's silent switch, like a game's sounds do.
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
      players.current = { coin: createAudioPlayer(COIN), fanfare: createAudioPlayer(FANFARE) };
    } catch {
      players.current = null;
    }
    return () => {
      try {
        players.current?.coin.remove();
        players.current?.fanfare.remove();
      } catch {
        // Already gone.
      }
      players.current = null;
    };
  }, []);

  // Read by the tap handlers, which must not wait for a render.
  const soundOnRef = useRef(soundOn);
  useEffect(() => {
    soundOnRef.current = soundOn;
  }, [soundOn]);

  const play = useCallback((which: 'coin' | 'fanfare') => {
    if (!soundOnRef.current) return;
    const player = players.current?.[which];
    if (!player) return;
    try {
      // From the start again, even if the last play hasn't finished.
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // No audio here; the tick is still fun to look at.
    }
  }, []);

  const playCoin = useCallback(() => play('coin'), [play]);
  const playFanfare = useCallback(() => play('fanfare'), [play]);

  const setSoundOn = useCallback(
    async (on: boolean) => {
      setSoundOnState(on);
      await setSoundEnabled(db, on);
    },
    [db],
  );

  const value = useMemo<SoundContextValue>(
    () => ({ soundOn, setSoundOn, playCoin, playFanfare }),
    [soundOn, setSoundOn, playCoin, playFanfare],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound(): SoundContextValue {
  const context = useContext(SoundContext);
  if (!context) {
    throw new Error('useSound must be used inside SoundProvider');
  }
  return context;
}
