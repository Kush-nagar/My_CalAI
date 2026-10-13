import { useState } from 'preact/hooks';
import { putEntry } from '../../db/repo';
import { buildQuickEntry } from '../../domain/portion';
import { MEAL_SLOTS, type MealSlot } from '../../domain/types';
import { Segmented, TextField } from '../components';
import { Icon } from '../icons';
import { mealLabel, parseDecimal } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { useUi } from '../ui';

/** Log calories/macros directly for anything: a café smoothie, a restaurant dish, a label in hand. */
export function QuickAdd(props: { meal: MealSlot; onMeal(m: MealSlot): void; onSaved(): void }) {
  const { state } = useApp();
  const ui = useUi();
  const showKcal = caloriesVisible(state.settings);
  const [name, setName] = useState('');
  const [v, setV] = useState({ energy_kcal: '', protein_g: '', carb_g: '', fat_g: '' });
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const num = (s: string) => (s.trim() === '' ? null : parseDecimal(s));
  const bad = (s: string) => s.trim() !== '' && num(s) === null;
  const p = num(v.protein_g), c = num(v.carb_g), f = num(v.fat_g);
  const fromMacros = p !== null || c !== null || f !== null ? Math.round((p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9) : null;

  async function save() {
    setErr(null);
    if (Object.values(v).some(bad)) return setErr('Use numbers only, e.g. 12.5');
    setSaving(true);
    try {
      const e = buildQuickEntry({
        name,
        values: { energy_kcal: showKcal ? num(v.energy_kcal) : null, protein_g: p, carb_g: c, fat_g: f },
        meal: props.meal,
        localDate: ui.date,
      });
      await putEntry(state.db, e);
      ui.bump();
      ui.announce(`Logged ${e.item.name} to ${mealLabel(props.meal)}`);
      props.onSaved();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form class="pad stack" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <p class="hint">For anything not in the list. Enter what you know; blanks stay unknown, not zero.</p>
      <TextField label="What did you have? (optional)" value={name} onInput={setName} autocomplete="off" maxLength={200} />
      <div class="nutr-grid">
        {showKcal ? (
          <TextField label="Calories" value={v.energy_kcal} onInput={(x) => setV({ ...v, energy_kcal: x })} inputMode="decimal" suffix="kcal" error={bad(v.energy_kcal) ? 'Numbers only' : null} autocomplete="off" />
        ) : null}
        <TextField label="Protein" value={v.protein_g} onInput={(x) => setV({ ...v, protein_g: x })} inputMode="decimal" suffix="g" error={bad(v.protein_g) ? 'Numbers only' : null} autocomplete="off" />
        <TextField label="Carbs" value={v.carb_g} onInput={(x) => setV({ ...v, carb_g: x })} inputMode="decimal" suffix="g" error={bad(v.carb_g) ? 'Numbers only' : null} autocomplete="off" />
        <TextField label="Fat" value={v.fat_g} onInput={(x) => setV({ ...v, fat_g: x })} inputMode="decimal" suffix="g" error={bad(v.fat_g) ? 'Numbers only' : null} autocomplete="off" />
      </div>
      {showKcal && v.energy_kcal.trim() === '' && fromMacros ? (
        <button type="button" class="link" onClick={() => setV({ ...v, energy_kcal: String(fromMacros) })}>
          Use {fromMacros} kcal (calculated from the macros: 4/4/9 kcal per gram)
        </button>
      ) : null}
      <Segmented name="qa-meal" legend="Meal" value={props.meal} onChange={props.onMeal} options={MEAL_SLOTS.map((m) => ({ value: m.id, label: m.label }))} />
      {err ? <p class="error" role="alert"><Icon name="alert" size={16} /> {err}</p> : null}
      <button type="submit" class="btn btn-primary btn-block" disabled={saving}>{saving ? 'Saving…' : `Add to ${mealLabel(props.meal)}`}</button>
      <p class="hint">Making something from several ingredients, like a protein smoothie? Build it once as a recipe in Foods and it calculates everything from the weights.</p>
    </form>
  );
}
