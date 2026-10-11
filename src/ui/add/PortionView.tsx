import { useEffect, useMemo, useState } from 'preact/hooks';
import { scaleNutrients } from '../../domain/nutrition';
import { buildEntry, localDateOf, makePortion, newId, unitOptions } from '../../domain/portion';
import { MEAL_SLOTS, NUTRIENTS, type Food, type ImageAsset, type MealEntry, type MealSlot } from '../../domain/types';
import { getFavorites, putCustomFood, putEntry, putImage, toggleFavorite } from '../../db/repo';
import { useApp, caloriesVisible } from '../store';
import { useUi } from '../ui';
import { Segmented, SourceChip, TextField, SelectField, Switch } from '../components';
import { Icon } from '../icons';
import { dayHeading, formatGrams, formatNutrient, mealLabel, parseDecimal, stateLabel } from '../helpers';

/** Amount + unit + meal + nutrients + provenance for one food; Save writes a diary entry snapshot. */
export function PortionView(props: {
  food: Food;
  initialMeal: MealSlot;
  photo?: Blob | null;
  onSaved(entry: MealEntry): void;
}) {
  const { state, actions } = useApp();
  const ui = useUi();
  const { food } = props;
  const opts = useMemo(() => unitOptions(food), [food]);
  const first = opts.find((o) => o.unit !== 'g');
  const [qty, setQty] = useState(first ? '1' : '100');
  const [unit, setUnit] = useState((first ?? opts[0])?.unit ?? 'g');
  const [meal, setMeal] = useState<MealSlot>(props.initialMeal);
  const [estimated, setEstimated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fav, setFav] = useState(false);
  const showKcal = caloriesVisible(state.settings);

  useEffect(() => {
    getFavorites(state.db).then((f) => setFav(f.includes(food.id)), () => undefined);
  }, [food.id]);

  const opt = opts.find((o) => o.unit === unit);
  const q = parseDecimal(qty);
  const qtyError = qty.trim() === '' ? 'Enter an amount.' : q === null ? 'Use numbers only, e.g. 1.5' : q <= 0 ? 'Enter an amount greater than 0.' : q > 100000 ? 'That amount is too large.' : null;
  const grams = q !== null && !qtyError && opt ? q * opt.gramsPerUnit : null;
  const totals = useMemo(() => scaleNutrients(food.per100g, grams ?? 0), [food, grams]);
  const gramsMeaningful = food.portionMode !== 'servings_only';
  const rows = NUTRIENTS.filter((n) => showKcal || n.code !== 'energy_kcal');
  const date = ui.date;
  const dh = dayHeading(date, localDateOf(new Date()));

  async function onFav() {
    const next = await toggleFavorite(state.db, food.id);
    const on = next.includes(food.id);
    setFav(on);
    ui.announce(on ? `${food.name} added to favourites` : `${food.name} removed from favourites`);
  }

  async function save() {
    setError(null);
    if (qtyError || q === null) {
      setError(qtyError ?? 'Enter an amount.');
      return;
    }
    setSaving(true);
    try {
      const portion = makePortion(food, q, unit);
      let imageId: string | undefined;
      if (props.photo && state.settings.keepPhotos) {
        const asset: ImageAsset = { id: newId('img:'), blob: props.photo, mime: props.photo.type || 'image/jpeg', createdAt: new Date().toISOString() };
        await putImage(state.db, asset);
        imageId = asset.id;
      }
      const entry = buildEntry({ food, portion, meal, localDate: date, estimate: estimated ? 'estimated' : 'measured', imageId });
      await putEntry(state.db, entry);
      if (food.source.kind === 'off' && !state.foodsById.has(food.id)) {
        await putCustomFood(state.db, food); // cache looked-up product for offline reuse
        await actions.refreshCatalog();
      }
      ui.bump();
      ui.announce(`Logged ${food.name} to ${mealLabel(meal)}`);
      props.onSaved(entry);
    } catch (e) {
      setError(`Could not save: ${(e as Error).message}. Your entries are still here, so you can try again.`);
    } finally {
      setSaving(false);
    }
  }

  const s = food.source;
  return (
    <div class="portion">
      <div class="food-head">
        <div>
          <h3 class="food-name">{food.name}</h3>
          <div class="meta-line">
            {stateLabel(food.state) ? <span>{stateLabel(food.state)}</span> : null}
            <SourceChip source={s} />
          </div>
        </div>
        <button type="button" class={'icon-btn fav' + (fav ? ' on' : '')} aria-pressed={fav} aria-label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={onFav}>
          <Icon name="star" filled={fav} />
        </button>
      </div>

      <div class="amount-row">
        <TextField label="Amount" value={qty} onInput={setQty} inputMode="decimal" autocomplete="off" error={qty !== '' ? qtyError : null} autofocus />
        <SelectField label="Unit" value={unit} onChange={setUnit} options={opts.map((o) => ({ value: o.unit, label: o.unit === 'g' ? 'grams (g)' : o.unit }))} />
      </div>
      <p class="equiv" aria-live="polite">
        {grams !== null && gramsMeaningful ? (
          <>
            <strong class="num">{formatGrams(grams)}</strong> · {opt?.evidence}
          </>
        ) : grams !== null ? (
          <>{opt?.evidence}</>
        ) : (
          <>Enter an amount to see the weight.</>
        )}
      </p>

      <Switch label="This amount is an estimate" hint="Marks the entry as estimated. Nothing is guessed for you." checked={estimated} onChange={setEstimated} />

      <Segmented name="meal" legend="Meal" value={meal} onChange={setMeal} options={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.label }))} />

      <section aria-labelledby="nt-h" class="block">
        <h4 id="nt-h">Nutrients for this portion</h4>
        <table class="ntable">
          <caption class="sr-only">Nutrients for {grams !== null ? formatGrams(grams) : 'this portion'} of {food.name}</caption>
          <tbody>
            {rows.map((n) => {
              const v = totals.values[n.code];
              const reason = food.per100g[n.code]?.missingReason;
              return (
                <tr key={n.code}>
                  <th scope="row">{n.label}</th>
                  {v !== undefined && grams !== null ? (
                    <td class="num">{formatNutrient(n.code, v)}</td>
                  ) : (
                    <td class="num muted">
                      <span aria-hidden="true">—</span> <span class="small">{grams === null ? '' : 'not reported'}</span>
                      <span class="sr-only">{reason ?? 'not reported by source'}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p class="hint">A dash means the source does not report that value. It is not zero.</p>
      </section>

      <details class="block prov">
        <summary>Source and details</summary>
        <dl>
          <dt>Source</dt><dd>{s.name}</dd>
          {s.recordId ? <><dt>Record ID</dt><dd class="num">{s.recordId}</dd></> : null}
          {s.edition ? <><dt>Edition</dt><dd>{s.edition}</dd></> : null}
          {s.license ? <><dt>Licence</dt><dd>{s.license}</dd></> : null}
          {s.retrievedAt ? <><dt>Retrieved</dt><dd>{s.retrievedAt}</dd></> : null}
          {s.url ? <><dt>Link (text only)</dt><dd class="break">{s.url}</dd></> : null}
          {food.notes ? <><dt>Notes</dt><dd>{food.notes}</dd></> : null}
          <dt>Basis</dt><dd>Values are per 100 g, scaled to your portion.</dd>
        </dl>
      </details>

      {props.photo ? (
        <p class="notice"><Icon name="camera" size={18} /> {state.settings.keepPhotos ? 'Your photo will be saved with this entry, on this device only.' : 'Photos are turned off in Settings, so this photo will not be kept.'}</p>
      ) : null}
      <p class="hint">Adding to {dh.main === 'Today' || dh.main === 'Yesterday' || dh.main === 'Tomorrow' ? dh.main : dh.sub}.</p>

      {error ? <p class="error" role="alert"><Icon name="alert" size={16} /> {error}</p> : null}
      <div class="form-actions">
        <button type="button" class="btn btn-primary btn-block" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : `Add to ${mealLabel(meal)}`}
        </button>
      </div>
    </div>
  );
}
