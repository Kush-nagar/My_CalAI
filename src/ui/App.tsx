import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { AppCtx, buildState, loadState, persistSettings, type AppState } from './store';
import { deleteOrphanImages, listCustomFoods, listRecipes } from '../db/repo';
import { localDateOf } from '../domain/portion';
import type { MealSlot, Settings as SettingsT } from '../domain/types';
import { Icon, type IconName } from './icons';
import { defaultMeal } from './helpers';
import { navigate, TABS, UiCtx, useRoute, type AddMode, type Tab, type UiApi } from './ui';
import { Today } from './screens/Today';
import { Foods } from './screens/Foods';
import { Trends } from './screens/Trends';
import { Settings } from './screens/Settings';
import { Onboarding } from './screens/Onboarding';
import { AddFlow } from './add/AddFlow';

const TAB_META: Record<Tab, { label: string; icon: IconName }> = {
  today: { label: 'Today', icon: 'today' },
  foods: { label: 'Foods', icon: 'foods' },
  trends: { label: 'Trends', icon: 'trends' },
  settings: { label: 'Settings', icon: 'settings' },
};

export function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef<AppState | null>(null);
  stateRef.current = state;

  useEffect(() => {
    loadState().then((s) => {
      setState(s);
      // Clean up photos left behind by an interrupted save (image and entry are written separately).
      deleteOrphanImages(s.db).catch(() => undefined);
    }, (e) => setError(String(e?.message ?? e)));
  }, []);

  // theme: data-theme on <html>; "system" removes the override so the media query applies
  useEffect(() => {
    const t = state?.settings.theme ?? 'system';
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }, [state?.settings.theme]);

  const ctx = useMemo(() => {
    if (!state) return null;
    return {
      state,
      actions: {
        async refreshCatalog() {
          const cur = stateRef.current!;
          const [custom, recipes] = await Promise.all([listCustomFoods(cur.db), listRecipes(cur.db)]);
          setState((p) => {
            const next = buildState(cur.db, (p ?? cur).settings, cur.seed, custom, recipes);
            stateRef.current = next;
            return next;
          });
        },
        async updateSettings(patch: Partial<SettingsT>) {
          const cur = stateRef.current!;
          // Update the ref synchronously so back-to-back calls compose instead of clobbering.
          const settings = { ...cur.settings, ...patch };
          stateRef.current = { ...cur, settings };
          await persistSettings(cur.db, settings);
          setState((p) => (p ? { ...p, settings: { ...p.settings, ...patch } } : p));
        },
      },
    };
    // state identity changes on settings/catalog updates; actions read the latest via ref
  }, [state]);

  if (error) return <main class="boot-error" role="alert"><h1>Thali</h1><p>Could not open local storage: {error}</p><p>Private browsing can block it. Try a normal window.</p></main>;
  if (!ctx) return <main class="boot" aria-busy="true"><p>Loading…</p></main>;
  return (
    <AppCtx.Provider value={ctx}>
      {ctx.state.settings.onboarded ? <Shell /> : <Onboarding />}
    </AppCtx.Provider>
  );
}

function Shell() {
  const path = useRoute();
  const tab: Tab = (TABS as readonly string[]).includes(path[0]) ? (path[0] as Tab) : 'today';
  const [date, setDate] = useState(() => localDateOf(new Date()));
  const [version, setVersion] = useState(0);
  const [add, setAdd] = useState<{ meal: MealSlot; mode: AddMode } | null>(null);
  const [msg, setMsg] = useState('');
  const timer = useRef<number>();
  const mainRef = useRef<HTMLElement>(null);
  const first = useRef(true);

  // If the app stays open past midnight, move "today" forward when it is next shown.
  const todayRef = useRef(date);
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      const now = localDateOf(new Date());
      if (now !== todayRef.current) {
        setDate((d) => (d === todayRef.current ? now : d));
        todayRef.current = now;
      }
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, []);

  const announce = useCallback((m: string) => {
    setMsg('');
    // re-set on next tick so identical consecutive messages are re-announced
    setTimeout(() => setMsg(m), 30);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(''), 3800);
  }, []);

  const ui: UiApi = useMemo(
    () => ({
      date,
      setDate,
      version,
      bump: () => setVersion((v) => v + 1),
      announce,
      openAdd: (o) => setAdd({ meal: o?.meal ?? defaultMeal(), mode: o?.mode ?? 'search' }),
    }),
    [date, version, announce],
  );

  useEffect(() => {
    if (!path.length) navigate('today');
  }, [path.length]);

  useEffect(() => {
    document.title = `${TAB_META[tab].label} — Thali`;
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [tab]);

  return (
    <UiCtx.Provider value={ui}>
      <a
        class="skip"
        href="#/today"
        onClick={(e) => {
          e.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <main id="main" ref={mainRef} tabIndex={-1} class="main">
        {tab === 'today' ? <Today /> : null}
        {tab === 'foods' ? <Foods path={path} /> : null}
        {tab === 'trends' ? <Trends /> : null}
        {tab === 'settings' ? <Settings /> : null}
      </main>

      <nav class="tabbar" aria-label="Main">
        <ul>
          {(['today', 'foods'] as Tab[]).map((t) => <TabLink key={t} tab={t} current={tab} />)}
          <li class="tab-add">
            <button type="button" class="add-fab" onClick={() => ui.openAdd()} aria-label="Add food" aria-haspopup="dialog">
              <Icon name="plus" size={28} />
            </button>
          </li>
          {(['trends', 'settings'] as Tab[]).map((t) => <TabLink key={t} tab={t} current={tab} />)}
        </ul>
      </nav>

      <div class="sr-only" role="status" aria-live="polite">{msg}</div>
      {msg ? <div class="toast" aria-hidden="true"><Icon name="check" size={18} /> {msg}</div> : null}

      {add ? <AddFlow initialMeal={add.meal} initialMode={add.mode} onClose={() => setAdd(null)} /> : null}
    </UiCtx.Provider>
  );
}

function TabLink({ tab, current }: { tab: Tab; current: Tab }) {
  const m = TAB_META[tab];
  return (
    <li>
      <a href={`#/${tab}`} class="tablink" aria-current={current === tab ? 'page' : undefined}>
        <Icon name={m.icon} size={24} />
        <span>{m.label}</span>
      </a>
    </li>
  );
}
