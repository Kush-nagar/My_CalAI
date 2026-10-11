import { useEffect, useMemo, useState } from 'preact/hooks';
import { deleteEntry, getImage, putEntry } from '../../db/repo';
import { scaleNutrients } from '../../domain/nutrition';
import { editEntryPortion, makePortion, unitOptions } from '../../domain/portion';
import { MEAL_SLOTS, NUTRIENTS, type MealEntry, type MealSlot } from '../../domain/types';
import { ConfirmButton, EstimateBadge, Segmented, SelectField, Sheet, SourceChip, Switch, TextField, useObjectUrl } from '../components';
import { Icon } from '../icons';
import { foodFromEntry, formatGrams, formatNutrient, mealLabel, parseDecimal } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { useUi } from '../ui';

/** Edit a logged entry: quantity/unit (recomputed from the entry's own snapshot), meal, note, delete. */
export function EntrySheet(props: { entry: MealEntry; onClose(): void }) {
  const { state } = useApp();
  const ui = useUi();
  const e = props.entry;
  const cat = state.foodsById.get(e.item.refId);
  const food = useMemo(() => foodFromEntry(e, cat), [e, cat]);
  const opts = unitOptions(food);
  const [qty, setQty] = useState(String(Number(e.portion.quantity.toFixed(3))));
  const [unit, setUnit] = useState(opts.some((o) => o.unit === e.portion.unit) ? e.portion.unit : (opts[0]?.unit ?? 'g'));
  const [meal, setMeal] = useState<MealSlot>(e.meal);
  const [note, setNote] = useState(e.note ?? '');
  const [estimated, setEstimated] = useState(e.estimate === 'estimated');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const photoUrl = useObjectUrl(blob);
  const showKcal = caloriesVisible(state.settings);

  useEffect(() => {
    if (e.imageId) getImage(state.db, e.imageId).then((i) => setBlob(i?.blob ?? null), () => undefined);
  }, [e.imageId]);

  const opt = opts.find((o) => o.unit === unit);
  const q = parseDecimal(qty);
  const qtyError = q === null ? 'Use numbers only, e.g. 1.5' : q <= 0 ? 'Enter an amount greater than 0.' : q > 100000 ? 'That amount is too large.' : null;
  const grams = q !== null && !qtyError && opt ? q * opt.gramsPerUnit : null;
  const totals = scaleNutrients(e.per100g, grams ?? 0);
  const hideGrams = food.portionMode === 'servings_only';

  async function save() {
    setError(null);
    if (qtyError || q === null) return setError(qtyError ?? 'Enter an amount.');
    setSaving(true);
    try {
      // Only recompute when the amount or unit actually changed; otherwise keep the snapshot.
      const unchanged = q === e.portion.quantity && unit === e.portion.unit;
      const next: MealEntry = {
        ...(unchanged ? { ...e, updatedAt: new Date().toISOString() } : editEntryPortion(e, makePortion(food, q, unit))),
        meal,
        note: note.trim() || undefined,
        estimate: estimated ? 'estimated' : 'measured',
      };
      await putEntry(state.db, next);
      ui.bump();
      ui.announce(`Updated ${e.item.name}`);
      props.onClose();
    } catch (err) {
      setError(`Could not save: ${(err as Error).message}. Your changes are still here.`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    try {
      await deleteEntry(state.db, e.id);
      ui.bump();
      ui.announce(`Deleted ${e.item.name}`);
      props.onClose();
    } catch (err) {
      setError(`Could not delete: ${(err as Error).message}`);
    }
  }

  return (
    <Sheet title="Edit entry" onClose={props.onClose}>
      <div class="portion">
        <div class="food-head">
          <div>
            <h3 class="food-name">{e.item.name}</h3>
            <div class="meta-line">
              <SourceChip source={e.item.source} />
              {e.estimate === 'estimated' ? <EstimateBadge /> : null}
            </div>
          </div>
        </div>

        <div class="amount-row">
          <TextField label="Amount" value={qty} onInput={setQty} inputMode="decimal" autocomplete="off" error={qtyError} autofocus />
          <SelectField label="Unit" value={unit} onChange={setUnit} options={opts.map((o) => ({ value: o.unit, label: o.unit === 'g' ? 'grams (g)' : o.unit }))} />
        </div>
        <p class="equiv" aria-live="polite">
          {grams !== null && !hideGrams ? <><strong class="num">{formatGrams(grams)}</strong> · {opt?.evidence}</> : opt?.evidence}
        </p>

        <Switch label="This amount is an estimate" checked={estimated} onChange={setEstimated} />
        <Segmented name="edit-meal" legend="Meal" value={meal} onChange={setMeal} options={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.label }))} />
        <TextField label="Note (optional)" value={note} onInput={setNote} multiline maxLength={500} />

        <section class="block" aria-labelledby="en-h">
          <h4 id="en-h">Nutrients for this portion</h4>
          <table class="ntable">
            <tbody>
              {NUTRIENTS.filter((n) => showKcal || n.code !== 'energy_kcal').map((n) => {
                const v = totals.values[n.code];
                return (
                  <tr key={n.code}>
                    <th scope="row">{n.label}</th>
                    {v !== undefined && grams !== null ? (
                      <td class="num">{formatNutrient(n.code, v)}</td>
                    ) : (
                      <td class="num muted"><span aria-hidden="true">—</span> <span class="small">not reported</span></td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p class="hint">Values come from the snapshot saved with this entry, so later catalog changes do not alter your history. Logged to {mealLabel(e.meal)}.</p>
        </section>

        {photoUrl ? (
          <figure class="photo-prev"><img src={photoUrl} alt="Photo attached to this entry, stored on this device" /></figure>
        ) : null}

        {error ? <p class="error" role="alert"><Icon name="alert" size={16} /> {error}</p> : null}
        <div class="form-actions">
          <button type="button" class="btn btn-primary btn-block" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          <ConfirmButton label="Delete entry" confirmLabel="Delete entry" message="Delete this entry? This cannot be undone." onConfirm={remove} />
        </div>
      </div>
    </Sheet>
  );
}
