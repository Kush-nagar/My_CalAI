import { useEffect, useRef, useState } from 'preact/hooks';
import { ACTIVITY, estimateMaintenanceKcal, macrosFromKcal, type Activity, type Sex } from '../../domain/goals';
import type { Goals } from '../../domain/types';
import { Segmented, SelectField, TextField } from '../components';
import { Icon } from '../icons';
import { parseDecimal } from '../helpers';
import { useApp } from '../store';
import { useRoute, useUi } from '../ui';

const str = (n: number | null) => (n === null ? '' : String(n));

/** Daily references the user chooses. Under-18 mode: water only (no energy or macro targets). */
export function GoalsCard() {
  const { state, actions } = useApp();
  const ui = useUi();
  const path = useRoute();
  const minor = state.settings.ageBand === 'under18';
  const g = state.settings.goals;
  const [v, setV] = useState({ energy_kcal: str(g.energy_kcal), protein_g: str(g.protein_g), carb_g: str(g.carb_g), fat_g: str(g.fat_g), water_ml: str(g.water_ml) });
  const [err, setErr] = useState<string | null>(null);
  const [est, setEst] = useState(false);
  const [e, setE] = useState({ sex: 'female' as Sex, age: '', height: '', weight: '', activity: 'light' as Activity });
  const [estKcal, setEstKcal] = useState<number | null>(null);
  const [estErr, setEstErr] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (path[1] === 'goals') {
      ref.current?.scrollIntoView({ block: 'start' });
      ref.current?.focus();
    }
  }, [path[1]]);

  const num = (s: string) => (s.trim() === '' ? null : parseDecimal(s));

  async function save() {
    setErr(null);
    const next: Goals = {
      energy_kcal: minor ? null : num(v.energy_kcal),
      protein_g: minor ? null : num(v.protein_g),
      carb_g: minor ? null : num(v.carb_g),
      fat_g: minor ? null : num(v.fat_g),
      water_ml: num(v.water_ml),
    };
    const limits: Record<keyof Goals, number> = { energy_kcal: 20000, protein_g: 1000, carb_g: 2000, fat_g: 1000, water_ml: 20000 };
    for (const k of Object.keys(next) as (keyof Goals)[]) {
      const raw = v[k];
      if (raw.trim() !== '' && (next[k] === null || !(next[k]! > 0) || next[k]! > limits[k])) return setErr('Use positive numbers only, or leave a field blank for no reference.');
    }
    await actions.updateSettings({ goals: next });
    ui.announce('Daily references saved');
  }

  function estimate() {
    setEstErr(null);
    try {
      setEstKcal(
        estimateMaintenanceKcal({ sex: e.sex, ageYears: num(e.age) ?? 0, heightCm: num(e.height) ?? 0, weightKg: num(e.weight) ?? 0, activity: e.activity }),
      );
    } catch (x) {
      setEstKcal(null);
      setEstErr((x as Error).message);
    }
  }

  return (
    <section class="card" aria-labelledby="s-goals" id="goals" ref={ref} tabIndex={-1}>
      <h2 id="s-goals">Daily references</h2>
      {minor ? (
        <p class="hint">In safety mode Thali doesn't set calorie or macro targets. You can still set a water reference.</p>
      ) : (
        <p class="hint">Optional. Today shows how much you've had next to these numbers. Leave a field blank for no reference. These are your choices, not advice.</p>
      )}
      <form class="stack" onSubmit={(ev) => { ev.preventDefault(); void save(); }} noValidate>
        {!minor ? (
          <>
            <div class="nutr-grid">
              <TextField label="Calories" value={v.energy_kcal} onInput={(x) => setV({ ...v, energy_kcal: x })} inputMode="decimal" suffix="kcal" autocomplete="off" />
              <TextField label="Protein" value={v.protein_g} onInput={(x) => setV({ ...v, protein_g: x })} inputMode="decimal" suffix="g" autocomplete="off" />
              <TextField label="Carbs" value={v.carb_g} onInput={(x) => setV({ ...v, carb_g: x })} inputMode="decimal" suffix="g" autocomplete="off" />
              <TextField label="Fat" value={v.fat_g} onInput={(x) => setV({ ...v, fat_g: x })} inputMode="decimal" suffix="g" autocomplete="off" />
            </div>
            {num(v.energy_kcal) ? (
              <button
                type="button"
                class="link"
                onClick={() => {
                  const m = macrosFromKcal(num(v.energy_kcal)!);
                  setV({ ...v, protein_g: String(m.protein_g), carb_g: String(m.carb_g), fat_g: String(m.fat_g) });
                }}
              >
                Fill protein, carbs and fat from calories (20% / 50% / 30%)
              </button>
            ) : null}
          </>
        ) : null}
        <TextField label="Water" value={v.water_ml} onInput={(x) => setV({ ...v, water_ml: x })} inputMode="decimal" suffix="ml" autocomplete="off" />
        {err ? <p class="error" role="alert"><Icon name="alert" size={16} /> {err}</p> : null}
        <button type="submit" class="btn btn-primary">Save references</button>
      </form>

      {!minor ? (
        <details class="block" open={est} onToggle={(x) => setEst((x.target as HTMLDetailsElement).open)}>
          <summary>Estimate the calories that maintain your weight</summary>
          <div class="stack">
            <p class="hint">Uses the Mifflin-St Jeor equation and an activity factor. It's a rough estimate for adults, not medical advice, and not a diet plan.</p>
            <Segmented name="sex" legend="Body (for the equation)" value={e.sex} onChange={(x: Sex) => setE({ ...e, sex: x })} options={[{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} />
            <div class="nutr-grid">
              <TextField label="Age" value={e.age} onInput={(x) => setE({ ...e, age: x })} inputMode="numeric" suffix="years" autocomplete="off" />
              <TextField label="Height" value={e.height} onInput={(x) => setE({ ...e, height: x })} inputMode="decimal" suffix="cm" autocomplete="off" />
              <TextField label="Weight" value={e.weight} onInput={(x) => setE({ ...e, weight: x })} inputMode="decimal" suffix="kg" autocomplete="off" />
            </div>
            <SelectField label="Activity" value={e.activity} onChange={(x) => setE({ ...e, activity: x as Activity })} options={ACTIVITY.map((a) => ({ value: a.id, label: a.label }))} />
            <button type="button" class="btn btn-secondary" onClick={estimate}>Estimate</button>
            {estErr ? <p class="error" role="alert">{estErr}</p> : null}
            {estKcal ? (
              <p class="notice" aria-live="polite">
                <Icon name="info" size={18} />
                <span>
                  About <strong class="num">{estKcal.toLocaleString()} kcal</strong> a day to maintain your current weight.{' '}
                  <button type="button" class="link" onClick={() => setV({ ...v, energy_kcal: String(estKcal) })}>Use this</button>
                </span>
              </p>
            ) : null}
            <p class="hint">Nothing you enter here is saved.</p>
          </div>
        </details>
      ) : null}
    </section>
  );
}
