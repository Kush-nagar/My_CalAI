import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getFavorites, putEntry, recentItems } from '../../db/repo';
import { buildEntry, makePortion } from '../../domain/portion';
import { MEAL_SLOTS, type Food, type MealEntry, type MealSlot } from '../../domain/types';
import { Segmented, Sheet, Switch, useObjectUrl } from '../components';
import { Icon, type IconName } from '../icons';
import { foodFromEntry, formatNutrient, mealLabel, portionLabel } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { navigate, useUi, type AddMode } from '../ui';
import type { ComponentType } from 'preact';
import type { BarcodeSheetProps } from '../barcode/BarcodeSheet';
import { CustomFoodForm } from '../screens/CustomFoodForm';
import { FoodRow } from './FoodRow';
import { PortionView } from './PortionView';
import { QuickAdd } from './QuickAdd';
import { CameraCapture } from '../vision/CameraCapture';
import type { Candidate } from '../../vision/match';
import { ModelPanel } from '../vision/ModelPanel';
import { SuggestionReview } from '../vision/SuggestionReview';
import { refreshModelStatus, useModelStatus } from '../vision/model';
import { getRecognizer, resetRecognizer } from '../vision/suggest';

type Tab = 'search' | 'recent' | 'favs' | 'quick' | 'barcode' | 'photo';
const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'search', label: 'Search', icon: 'search' },
  { id: 'photo', label: 'Photo', icon: 'camera' },
  { id: 'barcode', label: 'Barcode', icon: 'barcode' },
  { id: 'quick', label: 'Quick add', icon: 'bolt' },
  { id: 'recent', label: 'Recent', icon: 'clock' },
  { id: 'favs', label: 'Favourites', icon: 'star' },
];

type Step =
  | { kind: 'list' }
  | { kind: 'portion'; food: Food; queue?: Food[]; pos?: number }
  | { kind: 'custom'; name?: string; barcode?: string }
  | { kind: 'review'; candidates: Candidate[]; unsure: boolean };

/**
 * Re-encode a photo as a downscaled JPEG. Re-encoding always happens because it strips EXIF
 * metadata (e.g. GPS location). If the browser cannot decode the file, it is not kept at all.
 */
async function shrink(file: Blob): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1280 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.82));
    bmp.close();
    return out;
  } catch {
    return null;
  }
}

export function AddFlow(props: { initialMeal: MealSlot; initialMode?: AddMode; onClose(): void }) {
  const { state, actions } = useApp();
  const ui = useUi();
  const showKcal = caloriesVisible(state.settings);
  const [tab, setTab] = useState<Tab>(props.initialMode === 'camera' ? 'photo' : props.initialMode === 'quick' ? 'quick' : 'search');
  const [camOpen, setCamOpen] = useState(props.initialMode === 'camera');
  const [query, setQuery] = useState('');
  const [meal, setMeal] = useState<MealSlot>(props.initialMeal);
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [recent, setRecent] = useState<MealEntry[] | null>(null);
  const [favs, setFavs] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [relogError, setRelogError] = useState<string | null>(null);
  const photoUrl = useObjectUrl(photo);
  const model = useModelStatus();
  const [suggesting, setSuggesting] = useState(false);
  const [suggestErr, setSuggestErr] = useState<string | null>(null);
  const [parts, setParts] = useState(false);
  const [photoUsed, setPhotoUsed] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const suggestRun = useRef(0);
  const [lastReview, setLastReview] = useState<Extract<Step, { kind: 'review' }> | null>(null);
  const [Scanner, setScanner] = useState<ComponentType<BarcodeSheetProps> | null>(null);
  const [scanErr, setScanErr] = useState<string | null>(null);
  useEffect(() => {
    // Load the scanner (large WASM) only when the user opens it.
    if (!scanOpen || Scanner) return;
    import('../barcode/BarcodeSheet').then(
      (m) => setScanner(() => m.BarcodeSheet as ComponentType<BarcodeSheetProps>),
      () => { setScanErr('The scanner could not be loaded. You can still create a custom food.'); setScanOpen(false); },
    );
  }, [scanOpen]);

  useEffect(() => {
    if (tab === 'recent' && recent === null) recentItems(state.db, 30).then(setRecent, () => setRecent([]));
    if (tab === 'favs' && favs === null) getFavorites(state.db).then(setFavs, () => setFavs([]));
  }, [tab]);

  // The catalog has ~13,700 foods: debounce so typing stays smooth on a phone.
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(query), query.length < 2 ? 0 : 120);
    return () => clearTimeout(t);
  }, [query]);
  const hits = useMemo(() => (q.trim() ? state.index.search(q, 40) : []), [q, state.index]);
  const pick = (food: Food) => setStep({ kind: 'portion', food });

  async function relog(e: MealEntry) {
    setRelogError(null);
    setBusy(e.id);
    try {
      const food = foodFromEntry(e, state.foodsById.get(e.item.refId));
      const portion = makePortion(food, e.portion.quantity, e.portion.unit);
      const entry = buildEntry({ food, portion, meal, localDate: ui.date, estimate: e.estimate, note: undefined });
      await putEntry(state.db, entry);
      ui.bump();
      ui.announce(`Logged ${food.name} to ${mealLabel(meal)}`);
      props.onClose();
    } catch (err) {
      setRelogError(`Could not log that again: ${(err as Error).message}`);
      setBusy(null);
    }
  }

  async function suggest(p: Blob | null = photo) {
    if (!p) return;
    setSuggestErr(null);
    setSuggesting(true);
    ui.announce('Looking at your photo on this device');
    const run = ++suggestRun.current;
    try {
      const rec = await getRecognizer();
      const ranked = await rec.suggest(p, { parts });
      const [{ toCandidates }, { isUnsure }] = await Promise.all([import('../../vision/match'), import('../../vision/scoring')]);
      if (run !== suggestRun.current) return; // cancelled meanwhile: ignore late results
      const candidates = toCandidates(ranked, state.foodsById, state.index);
      const review = { kind: 'review' as const, candidates, unsure: isUnsure(ranked) || candidates.length === 0 };
      setLastReview(review);
      setStep(review);
      ui.announce(review.unsure ? "Can't tell what this is. Search is available." : `${candidates.length} possible matches`);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'cancelled' && run === suggestRun.current) {
        setSuggestErr(
          code === 'missing'
            ? 'The suggestion model is no longer on this device. You can download it again, or search instead.'
            : code === 'image'
              ? 'This photo could not be read. Try another photo, or search instead.'
              : 'Suggestions are not available right now. You can search instead; your photo is still attached.',
        );
        if (code === 'missing' || code === 'load') {
          await resetRecognizer();
          await refreshModelStatus();
        }
      }
    } finally {
      if (run === suggestRun.current) setSuggesting(false);
    }
  }

  async function cancelSuggest() {
    suggestRun.current++;
    await resetRecognizer();
    setSuggesting(false);
  }

  /** Advance the photo-suggestion queue after a save or skip. */
  function nextInQueue(saved: boolean) {
    if (step.kind !== 'portion' || !step.queue) return props.onClose();
    if (saved) setPhotoUsed(true);
    const pos = (step.pos ?? 0) + 1;
    if (pos >= step.queue.length) return props.onClose();
    setStep({ kind: 'portion', food: step.queue[pos], queue: step.queue, pos });
  }

  const title = step.kind === 'portion' ? 'Amount' : step.kind === 'custom' ? 'New custom food' : step.kind === 'review' ? 'Photo suggestions' : 'Add food';
  const back =
    step.kind === 'list'
      ? undefined
      : step.kind === 'portion' && step.queue && lastReview
        ? { label: 'Back to possible matches', onClick: () => setStep(lastReview) }
        : step.kind === 'review'
          ? { label: 'Back to photo', onClick: () => { setStep({ kind: 'list' }); setTab('photo'); } }
          : { label: 'Back to search', onClick: () => setStep({ kind: 'list' }) };

  const body = () => {
    if (step.kind === 'portion') {
      if (step.queue) {
        const pos = step.pos ?? 0;
        return (
          <PortionView
            key={step.food.id + pos}
            food={step.food}
            initialMeal={meal}
            photo={photoUsed ? null : photo}
            suggested={{ pos: pos + 1, total: step.queue.length, onSkip: () => nextInQueue(false) }}
            onSaved={() => nextInQueue(true)}
          />
        );
      }
      return <PortionView food={step.food} initialMeal={meal} photo={photoUsed ? null : photo} onSaved={props.onClose} />;
    }
    if (step.kind === 'review') {
      return (
        <SuggestionReview
          photoUrl={photoUrl}
          candidates={step.candidates}
          unsure={step.unsure}
          onContinue={(foods) => setStep({ kind: 'portion', food: foods[0], queue: foods, pos: 0 })}
          onSearch={(q) => {
            setQuery(q);
            setTab('search');
            setStep({ kind: 'list' });
          }}
          onNotSure={() => {
            setStep({ kind: 'list' });
            setTab('photo');
            ui.announce('Nothing was logged. Your photo is still attached; you can search or log it later.');
          }}
        />
      );
    }
    if (step.kind === 'custom') {
      return <CustomFoodForm prefillName={step.name} prefillBarcode={step.barcode} onSaved={(food) => setStep({ kind: 'portion', food })} />;
    }
    return (
      <>
        <div class="tabs" role="tablist" aria-label="Ways to add food">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" id={'tab-' + t.id} aria-selected={tab === t.id} aria-controls="add-panel" class="tab" onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={18} /> {t.label}
            </button>
          ))}
        </div>
        <div id="add-panel" role="tabpanel" aria-labelledby={'tab-' + tab} class="tabpanel">
          {photo && tab !== 'photo' ? (
            <p class="notice">
              <Icon name="camera" size={18} /> Photo attached to the next entry.{' '}
              <button type="button" class="link" onClick={() => setPhoto(null)}>Remove photo</button>
            </p>
          ) : null}

          {tab === 'search' ? (
            <>
              <div class="search-box">
                <Icon name="search" size={20} />
                <input
                  type="search"
                  aria-label="Search foods by name or alias"
                  placeholder="Search foods, e.g. dal, dahi, roti"
                  value={query}
                  onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                  data-autofocus
                  autocomplete="off"
                  autocapitalize="off"
                  enterkeyhint="search"
                />
              </div>
              {!query.trim() ? (
                <p class="hint pad">
                  {state.foodsById.size === 0
                    ? 'The food catalog is empty. Create a custom food to start logging.'
                    : 'Search the food catalog on this device. Names, spellings and local aliases all work.'}
                </p>
              ) : hits.length ? (
                <ul class="list" aria-label={`${hits.length} results`}>
                  {hits.map((h) => (
                    <FoodRow key={h.item.id} food={h.item} matched={h.matched} showKcal={showKcal} onClick={() => pick(h.item)} />
                  ))}
                </ul>
              ) : null}
              {query.trim() && !hits.length ? (
                <div class="nomatch" role="status">
                  <p><strong>No match for “{query.trim()}”.</strong> Nothing is guessed. You can add it yourself.</p>
                  <div class="btn-row">
                    <button type="button" class="btn btn-primary" onClick={() => setStep({ kind: 'custom', name: query.trim() })}>Create custom food</button>
                    <button type="button" class="btn btn-secondary" onClick={() => { props.onClose(); navigate('foods/recipe/new'); }}>Create recipe</button>
                  </div>
                </div>
              ) : null}
              {query.trim() && hits.length ? (
                <p class="hint pad">Not listed? <button type="button" class="link" onClick={() => setStep({ kind: 'custom', name: query.trim() })}>Create custom food</button></p>
              ) : null}
            </>
          ) : null}

          {tab === 'recent' ? (
            <>
              <Segmented name="relog-meal" legend="Log again into" value={meal} onChange={setMeal} options={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.label }))} />
              {recent === null ? <p class="hint pad">Loading…</p> : null}
              {recent && !recent.length ? <p class="hint pad">Foods you log will show up here for one-tap logging.</p> : null}
              {relogError ? <p class="error" role="alert"><Icon name="alert" size={16} /> {relogError}</p> : null}
              <ul class="list">
                {recent?.map((e) => {
                  const cat = state.foodsById.get(e.item.refId);
                  const kcal = e.nutrients.values.energy_kcal;
                  return (
                    <li key={e.id} class="row row-split">
                      <button type="button" class="row-body" onClick={() => pick(foodFromEntry(e, cat))} aria-label={`${e.item.name}, last ${portionLabel(e.portion, { hideGrams: e.portion.servingsOnly ?? cat?.portionMode === 'servings_only' })}. Change amount`}>
                        <span class="row-title">{e.item.name}</span>
                        <span class="row-sub">
                          <span>{portionLabel(e.portion, { hideGrams: e.portion.servingsOnly ?? cat?.portionMode === 'servings_only' })}</span>
                          {showKcal && kcal !== undefined ? <span class="num">{formatNutrient('energy_kcal', kcal)}</span> : null}
                        </span>
                      </button>
                      <button type="button" class="btn btn-tonal" disabled={busy !== null} onClick={() => void relog(e)} aria-label={`Log ${e.item.name} again to ${mealLabel(meal)}`}>
                        <Icon name="plus" size={18} /> Log
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          {tab === 'favs' ? (
            <>
              {favs === null ? <p class="hint pad">Loading…</p> : null}
              {favs && !favs.filter((id) => state.foodsById.has(id)).length ? <p class="hint pad">Tap the star on a food to keep it here.</p> : null}
              <ul class="list">
                {favs?.map((id) => state.foodsById.get(id)).filter((f): f is Food => !!f).map((f) => (
                  <FoodRow key={f.id} food={f} showKcal={showKcal} onClick={() => pick(f)} />
                ))}
              </ul>
            </>
          ) : null}

          {tab === 'barcode' ? (
            <div class="pad stack">
              <p>Scan a packaged food. The camera image is processed on this device and never uploaded.</p>
              <p class="hint">
                {state.settings.onlineLookup
                  ? 'Online lookup is on: only the barcode number is sent to Open Food Facts.'
                  : 'Online lookup is off. Barcodes already saved on this device still match. You can turn lookup on in Settings.'}
              </p>
              <button type="button" class="btn btn-primary" onClick={() => setScanOpen(true)}>
                <Icon name="barcode" size={20} /> {scanOpen && !Scanner ? 'Loading scanner…' : 'Scan barcode'}
              </button>
              {scanErr ? <p class="error" role="alert"><Icon name="alert" size={16} /> {scanErr}</p> : null}
            </div>
          ) : null}

          {tab === 'quick' ? <QuickAdd meal={meal} onMeal={setMeal} onSaved={props.onClose} /> : null}

          {tab === 'photo' ? (
            <div class="pad stack">
              {photoUrl ? (
                <figure class="photo-prev">
                  <img src={photoUrl} alt="Your meal photo, shown only on this device" />
                </figure>
              ) : null}
              <div class="btn-row">
                <button type="button" class={'btn ' + (photo ? 'btn-secondary' : 'btn-primary')} onClick={() => setCamOpen(true)}>
                  <Icon name="camera" size={20} /> {photo ? 'Retake' : 'Open camera'}
                </button>
                <label class="btn btn-secondary file-btn">
                  <Icon name="image" size={20} /> {photo ? 'Choose a different photo' : 'Choose from library'}
                  <input type="file" accept="image/*" class="sr-only-input" onChange={(e) => void onFile(e)} />
                </label>
              </div>
              <p class="hint">
                {state.settings.keepPhotos
                  ? 'The photo is saved with your entry on this device only.'
                  : 'Keeping photos is off, so the photo is not saved with your entry.'}{' '}
                {!state.settings.keepPhotos ? (
                  <button type="button" class="link" onClick={() => void enablePhotos()}>Keep photos</button>
                ) : null}
              </p>

              {state.settings.photoSuggestions && model.kind === 'ready' ? (
                photo ? (
                  suggesting ? (
                    <div class="stack">
                      <p class="notice" aria-busy="true"><Icon name="clock" size={18} /> Looking at your photo on this device…</p>
                      <button type="button" class="btn btn-secondary" onClick={() => void cancelSuggest()}>Cancel</button>
                    </div>
                  ) : (
                    <div class="stack">
                      <Switch
                        label="Mixed plate or thali"
                        hint="Also looks at parts of the photo. Slower."
                        checked={parts}
                        onChange={setParts}
                      />
                      <div class="btn-row">
                        <button type="button" class="btn btn-primary" onClick={() => void suggest()}>
                          <Icon name="search" size={18} /> Suggest food names
                        </button>
                        <button type="button" class="btn btn-secondary" onClick={() => setTab('search')}>Search instead</button>
                      </div>
                    </div>
                  )
                ) : (
                  <p class="hint">Add a photo to get possible food names. You always choose the food and the amount.</p>
                )
              ) : state.settings.photoSuggestions || setupOpen ? (
                <ModelPanel />
              ) : (
                <div class="notice">
                  <Icon name="info" size={18} />
                  <span>
                    Optional: suggest food names from a photo, on this device.{' '}
                    <button type="button" class="link" onClick={() => setSetupOpen(true)}>Set up</button>
                  </span>
                </div>
              )}
              {suggestErr ? <p class="error" role="alert"><Icon name="alert" size={16} /> {suggestErr}</p> : null}
              {photo && !suggesting ? (
                <div class="btn-row">
                  {model.kind !== 'ready' || !state.settings.photoSuggestions ? (
                    <button type="button" class="btn btn-primary" onClick={() => setTab('search')}>Choose food</button>
                  ) : null}
                  <button type="button" class="btn btn-secondary" onClick={() => setPhoto(null)}>Remove photo</button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </>
    );
  };

  async function enablePhotos() {
    await actions.updateSettings({ keepPhotos: true });
  }
  async function onFile(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) await takePhoto(f);
  }

  /** New photo from camera or library: attach it, and look for matches right away when set up. */
  async function takePhoto(raw: Blob) {
    setCamOpen(false);
    setTab('photo');
    const img = await shrink(raw);
    if (!img) {
      ui.announce('This photo format could not be read, so it was not attached.');
      return;
    }
    setPhoto(img);
    setPhotoUsed(false);
    ui.announce('Photo attached');
    if (state.settings.photoSuggestions && model.kind === 'ready') void suggest(img);
  }

  return (
    <>
      <Sheet title={title} onClose={props.onClose} back={back} hold={scanOpen || camOpen} focusKey={step.kind}>
        {body()}
      </Sheet>
      {camOpen ? (
        <div class="ext-layer">
          <CameraCapture
            onCapture={(b) => void takePhoto(b)}
            onLibrary={(f) => void takePhoto(f)}
            onBarcode={() => {
              setCamOpen(false);
              setTab('barcode');
              setScanOpen(true);
            }}
            onClose={() => setCamOpen(false)}
          />
        </div>
      ) : null}
      {scanOpen && Scanner ? (
        <div class="ext-layer">
          <Scanner
            onClose={() => setScanOpen(false)}
            onFound={(food) => {
              setScanOpen(false);
              setStep({ kind: 'portion', food });
            }}
            onManualEntry={(barcode) => {
              setScanOpen(false);
              setStep({ kind: 'custom', barcode });
            }}
          />
        </div>
      ) : null}
    </>
  );
}
