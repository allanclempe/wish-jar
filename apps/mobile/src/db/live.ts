import { AppState, Platform } from 'react-native';

import type { JarChange, JarTable } from '@wish-jar/jar';
import { API_URL } from '../apiUrl';

export type { JarTable };

// A change made on one of the family's devices shows on the others straight
// away (WJ-50): each running app keeps a WebSocket open to the family's jar,
// which names the tables every change touched (apps/api/src/live.ts). The jar's
// calls still go over HTTP, so the app works the same while the socket is
// down; it only hears of changes later.

// The protocol the API answers with; the token rides along as another one,
// as a browser can't set headers on a WebSocket.
const PROTOCOL = 'wish-jar';
// The close code for a token the jar doesn't know (apps/api/src/live.ts).
const REFUSED = 4401;

// Under the ~100 s Cloudflare lets a quiet WebSocket sit, and soon enough to
// notice a socket that died while the frame slept. The jar answers without
// waking up.
const PING_EVERY_MS = 30_000;
const PONG_WITHIN_MS = 10_000;
// Tries again sooner at first, then backs off to a minute, give or take, so a
// family's devices don't all come back at the same moment.
const FIRST_RETRY_MS = 1_000;
const LAST_RETRY_MS = 60_000;
// Changes that arrive together (a parent's quick edits, a reconnect) reload
// what's on screen once.
const SETTLE_MS = 300;

// Every table, for when changes may have been missed while the socket was down.
const ALL_TABLES: readonly JarTable[] = [
  'kids',
  'tasks',
  'completions',
  'kid_savings',
  'wishes',
  'consequence_types',
  'consequences',
  'app_settings',
  'devices',
];

// Which running app this is, so the jar doesn't tell it of its own changes:
// what it shows already has them. Not a secret.
export function newClientId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

type LiveEvents = {
  // Tables another device changed.
  onChange: (tables: readonly JarTable[]) => void;
  // The jar doesn't know this device's token any more. No more tries after.
  onRefused: () => void;
};

// Keeps the socket open until the returned function stops it: it reconnects
// by itself, and straight away when the app comes back to the front or the
// network returns.
export function connectLive(token: string, client: string, { onChange, onRefused }: LiveEvents): () => void {
  let socket: WebSocket | null = null;
  let stopped = false;
  let retries = 0;
  let openedBefore = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimer: ReturnType<typeof setTimeout> | null = null;

  function open() {
    retryTimer = null;
    let next: WebSocket;
    try {
      next = new WebSocket(`${API_URL.replace(/^http/, 'ws')}/jar/live?client=${client}`, [
        PROTOCOL,
        `bearer.${token}`,
      ]);
    } catch {
      retry();
      return;
    }
    socket = next;
    next.onopen = () => {
      retries = 0;
      // Whatever changed while the socket was down went unheard.
      if (openedBefore) onChange(ALL_TABLES);
      openedBefore = true;
      pingTimer = setInterval(ping, PING_EVERY_MS);
    };
    next.onmessage = (event) => {
      if (event.data === 'pong') {
        if (pongTimer) clearTimeout(pongTimer);
        pongTimer = null;
        return;
      }
      try {
        const change = JSON.parse(String(event.data)) as JarChange;
        if (change.type === 'changed' && Array.isArray(change.tables)) onChange(change.tables);
      } catch {
        // Not for this version of the app.
      }
    };
    // An error is always followed by a close.
    next.onclose = (event) => {
      if (socket !== next) return;
      socket = null;
      quiet();
      if (stopped) return;
      if (event.code === REFUSED) onRefused();
      else retry();
    };
  }

  // Asks the socket whether it's still there; one that doesn't answer is
  // given up on.
  function ping() {
    if (!socket || socket.readyState !== WebSocket.OPEN || pongTimer) return;
    socket.send('ping');
    pongTimer = setTimeout(() => {
      pongTimer = null;
      drop();
      retry();
    }, PONG_WITHIN_MS);
  }

  function quiet() {
    if (pingTimer) clearInterval(pingTimer);
    if (pongTimer) clearTimeout(pongTimer);
    pingTimer = null;
    pongTimer = null;
  }

  // Lets go of the socket without waiting for its close, which a dead
  // connection may take minutes to report.
  function drop() {
    const old = socket;
    socket = null;
    quiet();
    if (!old) return;
    old.onopen = old.onmessage = old.onclose = null;
    old.close();
  }

  function retry() {
    if (stopped || retryTimer) return;
    const backoff = Math.min(LAST_RETRY_MS, FIRST_RETRY_MS * 2 ** retries);
    retries += 1;
    retryTimer = setTimeout(open, backoff * (0.5 + Math.random() / 2));
  }

  // Back in front, or back online: a socket that's up is checked now, and one
  // that's waiting to retry doesn't wait any longer.
  function wake() {
    if (stopped) return;
    if (socket?.readyState === WebSocket.OPEN) {
      ping();
    } else if (!socket) {
      if (retryTimer) clearTimeout(retryTimer);
      retries = 0;
      open();
    }
  }

  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') wake();
  });
  if (Platform.OS === 'web') window.addEventListener('online', wake);
  open();

  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    appState.remove();
    if (Platform.OS === 'web') window.removeEventListener('online', wake);
    drop();
  };
}

// What the family's other devices changed, as a count per table that screens
// load again on (useJarVersion in provider.tsx). Changes that arrive within
// SETTLE_MS of each other count as one.
export type JarChanges = {
  subscribe: (listener: () => void) => () => void;
  // Goes up whenever any of `tables` changes.
  version: (tables: readonly JarTable[]) => number;
  heard: (tables: readonly JarTable[]) => void;
  // Drops changes still settling, once the app is done with them.
  stop: () => void;
};

export function createJarChanges(): JarChanges {
  const versions = new Map<JarTable, number>();
  const listeners = new Set<() => void>();
  let pending = new Set<JarTable>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function settle() {
    timer = null;
    for (const table of pending) versions.set(table, (versions.get(table) ?? 0) + 1);
    pending = new Set();
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version(tables) {
      return tables.reduce((sum, table) => sum + (versions.get(table) ?? 0), 0);
    },
    heard(tables) {
      for (const table of tables) pending.add(table);
      timer ??= setTimeout(settle, SETTLE_MS);
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      pending.clear();
    },
  };
}
