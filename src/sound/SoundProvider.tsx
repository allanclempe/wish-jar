import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';

import { getSoundEnabled, setSoundEnabled, useFamilyJar } from '../db';

// Short clips from Kenney's CC0 packs (assets/sounds/CREDITS.md): a ding for
// every tick, a fanfare for the last one of the period, a pluck for the taps
// that move around the app (tabs, kids, buttons), so a kid hears that a tap
// landed, and a bong for a wish that's still locked.
const CLIPS = {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  coin: require('../../assets/sounds/coin.ogg'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fanfare: require('../../assets/sounds/fanfare.ogg'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  tap: require('../../assets/sounds/tap.ogg'),
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  locked: require('../../assets/sounds/locked.ogg'),
};

type Clip = keyof typeof CLIPS;

type SoundContextValue = {
  // The grown-ups' setting; on until they turn it off.
  soundOn: boolean;
  setSoundOn: (on: boolean) => Promise<void>;
  playCoin: () => void;
  playFanfare: () => void;
  playTap: () => void;
  playLocked: () => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

// Sound effects for the kid screens. The players are made once and kept, so a
// tap replays its clip from the start with no load in between. Calls must
// come from inside a tap handler, before any await: the frame's WebView (and
// browsers in general) only start audio in response to a gesture. Anything
// that goes wrong just means silence.
export function SoundProvider({ children }: PropsWithChildren) {
  const jar = useFamilyJar();
  const [soundOn, setSoundOnState] = useState(true);
  const players = useRef<Record<Clip, AudioPlayer> | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSoundEnabled(jar).then((enabled) => {
      if (!cancelled) setSoundOnState(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [jar]);

  useEffect(() => {
    try {
      // Short effects: they mix with whatever else is playing and follow the
      // phone's silent switch, like a game's sounds do.
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
      players.current = {
        coin: createAudioPlayer(CLIPS.coin),
        fanfare: createAudioPlayer(CLIPS.fanfare),
        tap: createAudioPlayer(CLIPS.tap),
        locked: createAudioPlayer(CLIPS.locked),
      };
    } catch {
      players.current = null;
    }
    return () => {
      try {
        for (const player of Object.values(players.current ?? {})) player.remove();
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

  const play = useCallback((which: Clip) => {
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
  const playTap = useCallback(() => play('tap'), [play]);
  const playLocked = useCallback(() => play('locked'), [play]);

  const setSoundOn = useCallback(
    async (on: boolean) => {
      setSoundOnState(on);
      try {
        await setSoundEnabled(jar, on);
      } catch (error) {
        setSoundOnState(!on);
        throw error;
      }
    },
    [jar],
  );

  const value = useMemo<SoundContextValue>(
    () => ({ soundOn, setSoundOn, playCoin, playFanfare, playTap, playLocked }),
    [soundOn, setSoundOn, playCoin, playFanfare, playTap, playLocked],
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
