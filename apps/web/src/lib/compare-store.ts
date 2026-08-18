'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Comparison shortlist.
 *
 * Lives in localStorage rather than the URL: a buyer adds homes from several
 * different searches, and the selection has to survive navigating between them.
 * The comparison *page* still takes its ids from the URL, so a comparison stays
 * shareable and server-rendered — this store only drives the picking.
 *
 * `useSyncExternalStore` rather than useState + useEffect, because several
 * toggles and the floating bar are on screen at once and all have to agree the
 * instant any one of them changes. It also gives a correct server snapshot,
 * which avoids a hydration mismatch on a server-rendered page.
 */

const KEY = 'selleasy24:compare';
export const MAX_COMPARE = 4;

/** Fired on the same tab; the native `storage` event only reaches other tabs. */
const CHANGE_EVENT = 'selleasy24:compare-changed';

function readRaw(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === 'string').slice(0, MAX_COMPARE);
  } catch {
    // Corrupt or blocked storage must never break browsing.
    return [];
  }
}

/*
 * useSyncExternalStore compares snapshots by identity, so returning a fresh
 * array from every read would loop forever. The parsed value is cached against
 * the raw string and only replaced when that string actually changes.
 */
let cachedRaw: string | null = null;
let cachedValue: string[] = [];

function getSnapshot(): string[] {
  const raw = typeof window === 'undefined' ? '[]' : (window.localStorage.getItem(KEY) ?? '[]');
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedValue = readRaw();
  }
  return cachedValue;
}

const EMPTY: string[] = [];
/** Server render has no storage; the bar and toggles start empty and hydrate. */
function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

function write(ids: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_COMPARE)));
  } catch {
    // Private mode or a full quota. Selection is then per-page only, which is
    // degraded but still usable — not worth interrupting the buyer over.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface CompareApi {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
  isFull: boolean;
}

export function useCompare(): CompareApi {
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback((id: string) => {
    const current = getSnapshot();
    if (current.includes(id)) {
      write(current.filter((item) => item !== id));
      return;
    }
    // Silently dropping the click when full would look broken; the toggle is
    // disabled in that state instead, so this is only a safety net.
    if (current.length >= MAX_COMPARE) {
      return;
    }
    write([...current, id]);
  }, []);

  const remove = useCallback((id: string) => {
    write(getSnapshot().filter((item) => item !== id));
  }, []);

  const clear = useCallback(() => write([]), []);

  return {
    ids,
    has: (id) => ids.includes(id),
    toggle,
    remove,
    clear,
    isFull: ids.length >= MAX_COMPARE,
  };
}
