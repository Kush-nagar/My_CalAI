import { useState } from 'preact/hooks';
import { putCustomFood } from '../../db/repo';
import { newId } from '../../domain/portion';
import { NUTRIENTS, type Food, type FoodState, type NutrientCode, type NutrientMap, type ServingConversion } from '../../domain/types';
import { Segmented, SelectField, TextField } from '../components';
import { Icon } from '../icons';
import { parseDecimal, splitAliases } from '../helpers';
import { caloriesVisible, useApp } from '../store';

const STATES: { value: FoodState; label: string }[] = [
  { value: 'cooked', label: 'Cooked' },
  { value: 'raw', label: 'Raw' },
  { value: 'prepared', label: 'Prepared dish' },
  { value: 'packaged', label: 'Packaged' },
  { value: 'dry', label: 'Dry' },
  { value: 'unknown', label: 'Not sure' },
];

type Basis = '100g' | 'serving';

/** Create or edit a custom food. Blank nutrient = unknown (saved as null with a reason), never 0. */
export function CustomFoodForm(props: { initial?: Food; prefillName?: string; prefillBarcode?: string; onSaved(food: Food): void }) {
  const { state, actions } = useApp();
  const init = props.initial;
  const showKcal = caloriesVisible(state.settings);
  const [name, setName] = useState(init?.name ?? props.prefillName ?? '');
  const [aliases, setAliases] = useState(init?.aliases.join(', ') ?? '');
  const [foodState, setFoodState] = useState<FoodState>(init?.state ?? 'cooked');
  const [basis, setBasis] = useState<Basis>('100g');
  const [servingGrams, setServingGrams] = useState('');
  const [servingLabel, setServingLabel] = useState('1 serving');
  const [barcode, setBarcode] = useState(init?.barcode ?? props.prefillBarcode ?? '');
  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const n of NUTRIENTS) {
      const a = init?.per100g[n.code]?.amount;
      o[n.code] = a === null || a === undefined ? '' : String(Math.round(a * 1000) / 1000);
    }
    return o;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fields = NUTRIENTS.filter((n) => showKcal || n.code !== 'energy_kcal');

  async function save() {
    const err: Record<string, string> = {};
    const nm = name.trim();
    if (!nm) err.name = 'Give this food a name.';
    else if (nm.length > 200) err.name = 'Keep the name under 200 characters.';
    const bc = barcode.trim();
    if (bc && !/^\d{8,14}$/.test(bc)) err.barcode = 'Barcodes are 8 to 14 digits.';

    let sg: number | null = null;
    if (basis === 'serving') {
      sg = parseDecimal(servingGrams);
      if (sg === null || sg <= 0 || sg > 5000) err.servingGrams = 'Enter the serving weight in grams from the label.';
      if (!servingLabel.trim()) err.servingLabel = 'Name the serving, e.g. "1 packet".';
    }
    const factor = basis === 'serving' && sg ? 100 / sg : 1;
    const per100g: NutrientMap = {};
    let anyValue = false;
    for (const n of fields) {
      const raw = vals[n.code] ?? '';
      if (raw.trim() === '') {
        per100g[n.code] = { amount: null, kind: 'user', missingReason: 'Not entered' };
        continue;
      }
      const v = parseDecimal(raw);
      if (v === null) {
        err[n.code] = 'Numbers only, e.g. 12.5';
        continue;
      }
      anyValue = true;
      per100g[n.code] = { amount: v * factor, kind: basis === 'serving' ? 'label' : 'user' };
    }
    // Keep energy from the original record if the field is hidden while editing.
    if (!showKcal && init?.per100g.energy_kcal) per100g.energy_kcal = init.per100g.energy_kcal;
    const g = (c: NutrientCode) => per100g[c]?.amount ?? 0;
    if (!Object.keys(err).some((k) => ['protein_g', 'carb_g', 'fat_g'].includes(k)) && g('protein_g') + g('carb_g') + g('fat_g') > 100.5) {
      err.protein_g = 'Protein, carbohydrate and fat together are more than 100 g per 100 g. Check basis and units.';
    }
    if (!anyValue && !Object.keys(err).length) err.protein_g = 'Enter at least one nutrient value.';
    setErrors(err);
    if (Object.keys(err).length) {
      setSaveError('Some fields need attention. Nothing was saved.');
      return;
    }
    setSaveError(null);
    setSaving(true);
    try {
      const servings: ServingConversion[] = [...(init?.servings ?? [])];
      if (basis === 'serving' && sg) {
        const label = servingLabel.trim();
        const i = servings.findIndex((s) => s.label === label);
        const conv: ServingConversion = { label, grams: sg, evidence: 'Serving size printed on the package label', source: 'package_label' };
        if (i >= 0) servings[i] = conv;
        else servings.push(conv);
      }
      const food: Food = {
        id: init?.id ?? newId('c:'),
        name: nm,
        aliases: splitAliases(aliases),
        state: foodState,
        tags: init?.tags ?? ['custom'],
        source: init?.source ?? (basis === 'serving' ? { kind: 'label', name: 'Package label (typed by you)' } : { kind: 'user', name: 'Entered by you' }),
        per100g,
        servings,
        notes: init?.notes,
        barcode: bc || undefined,
        revision: (init?.revision ?? 0) + 1,
        archived: init?.archived,
      };
      await putCustomFood(state.db, food);
      await actions.refreshCatalog();
      props.onSaved(food);
    } catch (e) {
      setSaveError(`Could not save: ${(e as Error).message}. Your entries are still here.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form class="form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <TextField label="Name" value={name} onInput={setName} error={errors.name} autocomplete="off" autofocus={!props.prefillName} />
      <TextField label="Other names (optional)" value={aliases} onInput={setAliases} hint="Comma-separated, e.g. dahi, curd" autocomplete="off" />
      <SelectField label="Food state" value={foodState} onChange={(v) => setFoodState(v as FoodState)} options={STATES} />

      <Segmented
        name="basis"
        legend="Values on the label are"
        value={basis}
        onChange={setBasis}
        options={[{ value: '100g', label: 'Per 100 g' }, { value: 'serving', label: 'Per serving' }]}
      />
      {basis === 'serving' ? (
        <div class="two">
          <TextField label="Serving weight" value={servingGrams} onInput={setServingGrams} inputMode="decimal" suffix="g" error={errors.servingGrams} hint="From the label" />
          <TextField label="Serving name" value={servingLabel} onInput={setServingLabel} error={errors.servingLabel} autocomplete="off" />
        </div>
      ) : null}

      <fieldset class="nutr-set">
        <legend>Nutrients {basis === 'serving' ? 'per serving' : 'per 100 g'}</legend>
        <p class="hint">Leave blank if it is not listed. Blank is saved as unknown, not zero.</p>
        <div class="nutr-grid">
          {fields.map((n) => (
            <TextField key={n.code} label={n.label} value={vals[n.code] ?? ''} onInput={(v) => setVals({ ...vals, [n.code]: v })} inputMode="decimal" suffix={n.unit} error={errors[n.code]} autocomplete="off" />
          ))}
        </div>
      </fieldset>

      <TextField label="Barcode (optional)" value={barcode} onInput={setBarcode} inputMode="numeric" error={errors.barcode} autocomplete="off" />

      {saveError ? <p class="error" role="alert"><Icon name="alert" size={16} /> {saveError}</p> : null}
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Saving…' : init ? 'Save changes' : 'Save food'}</button>
      </div>
    </form>
  );
}
