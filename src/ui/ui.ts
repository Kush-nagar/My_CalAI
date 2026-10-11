import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { MealSlot } from '../domain/types';

/** Cross-screen UI state: selected diary day, Add flow, refresh counter, polite announcements. */
export interface UiApi {
  date: string;
  setDate(d: string): void;
  openAdd(opts?: { meal?: MealSlot }): void;
  /** Bumped after any diary write so screens re-query. */
  version: number;
  bump(): void;
  announce(msg: string): void;
}

export const UiCtx = createContext<UiApi | null>(null);

export function useUi(): UiApi {
  const v = useContext(UiCtx);
  if (!v) throw new Error('UiCtx missing');
  return v;
}

// ---- hash routing: #/today, #/foods/recipe/new, ... ----
export const TABS = ['today', 'foods', 'trends', 'settings'] as const;
export type Tab = (typeof TABS)[number];

export function parseHash(hash: string): string[] {
  return hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
}

export function navigate(path: string) {
  location.hash = '#/' + path;
}

export function useRoute(): string[] {
  const [path, setPath] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setPath(parseHash(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return path;
}
