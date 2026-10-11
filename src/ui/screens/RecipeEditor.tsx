import { useMemo, useState } from 'preact/hooks';
import { archiveRecipe, putRecipe } from '../../db/repo';
import { calculateRecipe, formatAmount, type RecipeResult } from '../../domain/nutrition';
import { newId } from '../../domain/portion';
import type { Food, NutrientCode, Recipe, RecipeIngredient } from '../../domain/types';
import { ConfirmButton, SourceChip, TextField } from '../components';
import { Icon } from '../icons';
import { nutrientMeta, parseDecimal, splitAliases, stateLabel } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { useUi } from '../ui';

interface Row extends Omit<RecipeIngredient, 'grams'> {
  gramsStr: string;
}

export function RecipeEditor(props: { initial?: Recipe; onDone(): void }) {
  const { state, actions } = useApp();
  const ui = useUi();
  const init = props.initial;
  const showKcal = caloriesVisible(state.settings);
  const [name, setName] = useState(init?.name ?? '');
  const [aliases, setAliases] = useState(init?.aliases.join(', ') ?? '');
  const [rows, setRows] = useState<Row[]>(() => (init?.ingredients ?? []).map((i) => ({ ...i, gramsStr: String(i.grams) })));
  const [yieldStr, setYieldStr] = useState(init?.yieldGrams != null ? String(init.yieldGrams) : '');
  const [servStr, setServStr] = useState(init?.servings != null ? String(init.servings) : '');
  const [query, setQuery] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const hits = useMemo(
    () => (query.trim() ? state.index.search(query, 8).filter((h) => h.item.id !== init?.id) : []),
    [query, state.index],
  );

  const yieldG = yieldStr.trim() ? parseDecimal(yieldStr) : null;
  const servN = servStr.trim() ? parseDecimal(servStr) : null;
  const gramsOk = rows.length > 0 && rows.every((r) => (parseDecimal(r.gramsStr) ?? 0) > 0);
  const yieldBad = yieldStr.trim() !== '' && !(yieldG && yieldG > 0);
  const servBad = servStr.trim() !== '' && !(servN && servN > 0);

  const toIngredients = (): RecipeIngredient[] => rows.map(({ gramsStr, ...r }) => ({ ...r, grams: parseDecimal(gramsStr) ?? 0 }));

  const calc: RecipeResult | null = useMemo(() => {
    if (!gramsOk || yieldBad || servBad) return null;
    try {
      return calculateRecipe({ ingredients: toIngredients(), yieldGrams: yieldG, servings: servN });
    } catch {
      return null;
    }
  }, [rows, yieldStr, servStr]);

  const addIngredient = (f: Food) => {
    setRows([
      ...rows,
      { foodId: f.id, foodName: f.name, per100g: structuredClone(f.per100g), source: f.source, state: f.state, gramsStr: '' },
    ]);
    setQuery('');
    ui.announce(`Added ${f.name}. Enter its weight in grams.`);
  };

  async function save() {
    const err: Record<string, string> = {};
    if (!name.trim()) err.name = 'Give the recipe a name.';
    if (!rows.length) err.ingredients = 'Add at least one ingredient.';
    rows.forEach((r, i) => {
      if (!((parseDecimal(r.gramsStr) ?? 0) > 0)) err['g' + i] = 'Enter grams greater than 0.';
    });
    if (yieldBad) err.yield = 'Enter the cooked weight in grams, or leave blank.';
    if (servBad) err.servings = 'Enter a number of servings above 0, or leave blank.';
    setErrors(err);
    if (Object.keys(err).length) return setSaveError('Some fields need attention. Nothing was saved.');
    setSaveError(null);
    setSaving(true);
    try {
      const r: Recipe = {
        id: init?.id ?? newId('r:'),
        name: name.trim(),
        aliases: splitAliases(aliases),
        ingredients: toIngredients(),
        yieldGrams: yieldG,
        servings: servN,
        method: init?.method,
        revision: (init?.revision ?? 0) + 1,
        archived: init?.archived,
        updatedAt: new Date().toISOString(),
      };
      calculateRecipe(r);
      await putRecipe(state.db, r);
      await actions.refreshCatalog();
      ui.announce(`Recipe ${r.name} saved`);
      props.onDone();
    } catch (e) {
      setSaveError(`Could not save: ${(e as Error).message}. Your entries are still here.`);
    } finally {
      setSaving(false);
    }
  }

  const codes: NutrientCode[] = state.settings.summaryNutrients.filter((c) => showKcal || c !== 'energy_kcal');
  const cell = (c: NutrientCode, t: { values: Partial<Record<NutrientCode, number>>; incomplete: NutrientCode[] } | null) => {
    const v = t?.values[c];
    if (v === undefined) return <td class="num muted">—</td>;
    return <td class="num">{t!.incomplete.includes(c) ? '≥ ' : ''}{formatAmount(v, nutrientMeta(c).unit)}</td>;
  };
  const cell100 = (c: NutrientCode) => {
    const v = calc?.per100gCooked?.[c]?.amount;
    return v === null || v === undefined ? <td class="num muted">—</td> : <td class="num">{formatAmount(v, nutrientMeta(c).unit)}</td>;
  };

  return (
    <form class="form" onSubmit={(e) => { e.preventDefault(); void save(); }} noValidate>
      <TextField label="Recipe name" value={name} onInput={setName} error={errors.name} autocomplete="off" autofocus={!init} />
      <TextField label="Other names (optional)" value={aliases} onInput={setAliases} hint="Comma-separated" autocomplete="off" />

      <section class="block" aria-labelledby="ing-h">
        <h3 id="ing-h">Ingredients</h3>
        {rows.length === 0 ? <p class="hint">Search below and add each ingredient with its weight in grams.</p> : null}
        <ul class="ing-list">
          {rows.map((r, i) => (
            <li key={i} class="ing">
              <div class="ing-name">
                <strong>{r.foodName}</strong>
                <span class="row-sub">{stateLabel(r.state) ? <span>{stateLabel(r.state)}</span> : null}<SourceChip source={r.source} /></span>
              </div>
              <TextField
                label={`Weight of ${r.foodName}`}
                value={r.gramsStr}
                onInput={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, gramsStr: v } : x)))}
                inputMode="decimal"
                suffix="g"
                error={errors['g' + i]}
                autocomplete="off"
              />
              <button type="button" class="icon-btn" aria-label={`Remove ${r.foodName}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Icon name="trash" size={20} />
              </button>
            </li>
          ))}
        </ul>
        {errors.ingredients ? <p class="error"><Icon name="alert" size={16} /> {errors.ingredients}</p> : null}
        <div class="search-box">
          <Icon name="search" size={20} />
          <input type="search" aria-label="Search for an ingredient" placeholder="Search to add an ingredient" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} autocomplete="off" />
        </div>
        {query.trim() && !hits.length ? <p class="hint">No match. Create a custom food first, then add it here.</p> : null}
        {hits.length ? (
          <ul class="list" aria-label="Ingredient results">
            {hits.map((h) => (
              <li key={h.item.id}>
                <button type="button" class="row row-btn" onClick={() => addIngredient(h.item)}>
                  <span class="row-main">
                    <span class="row-title">{h.item.name}</span>
                    <span class="row-sub">{stateLabel(h.item.state) ? <span>{stateLabel(h.item.state)}</span> : null}<SourceChip source={h.item.source} /></span>
                  </span>
                  <span class="row-end"><Icon name="plus" size={20} /><span class="sr-only">Add</span></span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <div class="two">
        <TextField label="Cooked weight (optional)" value={yieldStr} onInput={setYieldStr} inputMode="decimal" suffix="g" error={errors.yield} hint="Weigh the finished dish" autocomplete="off" />
        <TextField label="Servings (optional)" value={servStr} onInput={setServStr} inputMode="decimal" error={errors.servings} hint="How many portions" autocomplete="off" />
      </div>

      {rows.length > 0 && yieldG === null ? (
        <p class="notice warn" role="status">
          <Icon name="alert" size={18} /> Cooked weight is missing. Without it, gram portions of the finished dish cannot be calculated, so you will only be able to log servings.
        </p>
      ) : null}

      <section class="block" aria-labelledby="calc-h" aria-live="polite">
        <h3 id="calc-h">Calculated from ingredient weights</h3>
        {calc ? (
          <>
            <div class="table-scroll">
              <table class="ntable ntable-wide">
                <thead>
                  <tr>
                    <th scope="col"><span class="sr-only">Nutrient</span></th>
                    <th scope="col">Whole batch</th>
                    {calc.perServing ? <th scope="col">Per serving</th> : null}
                    {calc.per100gCooked ? <th scope="col">Per 100 g cooked</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c}>
                      <th scope="row">{nutrientMeta(c).label} <span class="muted small">({nutrientMeta(c).unit})</span></th>
                      {cell(c, calc.batch)}
                      {calc.perServing ? cell(c, calc.perServing) : null}
                      {calc.per100gCooked ? cell100(c) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p class="hint">≥ means at least: an ingredient does not report that nutrient. A dash means unknown, not zero.</p>
            <h4>Assumptions</h4>
            <ul class="bullets">{calc.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </>
        ) : (
          <p class="hint">Add ingredients with weights above 0 g to see the calculation.</p>
        )}
      </section>

      {saveError ? <p class="error" role="alert"><Icon name="alert" size={16} /> {saveError}</p> : null}
      <div class="form-actions">
        <button class="btn btn-primary btn-block" type="submit" disabled={saving}>{saving ? 'Saving…' : init ? 'Save recipe (new revision)' : 'Save recipe'}</button>
        {init ? (
          <ConfirmButton
            label="Archive recipe"
            confirmLabel="Archive"
            message="Archive this recipe? It leaves search and lists, but past diary entries are unchanged."
            onConfirm={async () => {
              await archiveRecipe(state.db, init.id);
              await actions.refreshCatalog();
              ui.announce('Recipe archived');
              props.onDone();
            }}
          />
        ) : null}
      </div>
    </form>
  );
}
