import { useEffect, useMemo, useState } from 'preact/hooks';
import { AppCtx, buildState, loadState, persistSettings, type AppState } from './store';
import { listCustomFoods, listRecipes } from '../db/repo';
import type { Settings } from '../domain/types';

// Minimal shell; screens are implemented in src/ui/screens/* (UI worker).
export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadState().then(setState, (e) => setError(String(e?.message ?? e)));
  }, []);

  const ctx = useMemo(() => {
    if (!state) return null;
    return {
      state,
      actions: {
        async refreshCatalog() {
          const [custom, recipes] = await Promise.all([listCustomFoods(state.db), listRecipes(state.db)]);
          setState(buildState(state.db, state.settings, state.seed, custom, recipes));
        },
        async updateSettings(patch: Partial<Settings>) {
          const settings = { ...state.settings, ...patch };
          await persistSettings(state.db, settings);
          setState({ ...state, settings });
        },
      },
    };
  }, [state]);

  if (error) return <main class="boot-error" role="alert">Could not open local storage: {error}</main>;
  if (!ctx) return <main class="boot" aria-busy="true">Loading…</main>;
  return (
    <AppCtx.Provider value={ctx}>
      <main>Thali shell</main>
    </AppCtx.Provider>
  );
}
