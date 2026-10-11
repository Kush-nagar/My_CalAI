import { useMemo, useState } from 'preact/hooks';
import { archiveCustomFood, putCustomFood } from '../../db/repo';
import type { Food, Recipe } from '../../domain/types';
import { ConfirmButton, EmptyState, Segmented, Sheet } from '../components';
import { Icon } from '../icons';
import { allTags, defaultMeal } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { navigate, useUi } from '../ui';
import { FoodRow } from '../add/FoodRow';
import { PortionView } from '../add/PortionView';
import { CustomFoodForm } from './CustomFoodForm';
import { RecipeEditor } from './RecipeEditor';

type Sub = 'mine' | 'recipes' | 'catalog';

export function Foods(props: { path: string[] }) {
  const { state, actions } = useApp();
  const ui = useUi();
  const [sub, setSub] = useState<Sub>('mine');
  const [tag, setTag] = useState<string | null>(null);
  const [logging, setLogging] = useState<Food | null>(null);
  const showKcal = caloriesVisible(state.settings);

  const mine = state.custom.filter((f) => !f.archived && f.source.kind !== 'off');
  const cached = state.custom.filter((f) => !f.archived && f.source.kind === 'off');
  const archivedFoods = state.custom.filter((f) => f.archived);
  const recipes = state.recipes.filter((r) => !r.archived);
  const archivedRecipes = state.recipes.filter((r) => r.archived);
  const tags = useMemo(() => allTags(state.seed), [state.seed]);
  const tagged = tag ? state.seed.filter((f) => f.tags.includes(tag)).slice(0, 150) : [];

  // ----- editor routes -----
  const [, kind, id] = props.path;
  const done = () => navigate('foods');
  let editor = null;
  if (kind === 'food') {
    const init = id === 'new' ? undefined : state.custom.find((f) => f.id === id);
    if (id === 'new' || init) {
      editor = (
        <Sheet title={init ? 'Edit custom food' : 'New custom food'} onClose={done}>
          <CustomFoodForm initial={init} onSaved={() => { ui.announce('Food saved'); done(); }} />
          {init ? (
            <div class="form-actions">
              {init.archived ? (
                <button type="button" class="btn btn-secondary btn-block" onClick={async () => { await putCustomFood(state.db, { ...init, archived: false }); await actions.refreshCatalog(); ui.announce('Food restored'); done(); }}>Restore food</button>
              ) : (
                <ConfirmButton label="Archive food" confirmLabel="Archive" message="Archive this food? It leaves search, but past diary entries keep their saved values." onConfirm={async () => { await archiveCustomFood(state.db, init.id); await actions.refreshCatalog(); ui.announce('Food archived'); done(); }} />
              )}
            </div>
          ) : null}
        </Sheet>
      );
    }
  } else if (kind === 'recipe') {
    const init: Recipe | undefined = id === 'new' ? undefined : state.recipes.find((r) => r.id === id);
    if (id === 'new' || init) {
      editor = (
        <Sheet title={init ? 'Edit recipe' : 'New recipe'} onClose={done}>
          <RecipeEditor initial={init} onDone={done} />
        </Sheet>
      );
    }
  }

  const logRow = (f: Food, onEdit?: () => void) => (
    <li key={f.id} class="row row-split">
      <button type="button" class="row-body" onClick={() => setLogging(f)} aria-label={`Log ${f.name}`}>
        <span class="row-title">{f.name}</span>
        <FoodMeta food={f} showKcal={showKcal} />
      </button>
      {onEdit ? (
        <button type="button" class="icon-btn" onClick={onEdit} aria-label={`Edit ${f.name}`}>
          <Icon name="edit" size={20} />
        </button>
      ) : null}
    </li>
  );

  return (
    <section class="screen" aria-labelledby="foods-h">
      <header class="page-head">
        <h1 id="foods-h">Foods</h1>
      </header>
      <Segmented
        name="foods-sub"
        legend="Foods section"
        hideLegend
        value={sub}
        onChange={setSub}
        options={[{ value: 'mine', label: 'My foods' }, { value: 'recipes', label: 'My recipes' }, { value: 'catalog', label: 'Catalog' }]}
      />

      {sub === 'mine' ? (
        <>
          <button type="button" class="btn btn-secondary btn-block" onClick={() => navigate('foods/food/new')}><Icon name="plus" size={20} /> New custom food</button>
          {!mine.length && !cached.length ? (
            <EmptyState title="No custom foods yet" body="Add a packaged item from its label, or a dish you make often. Values you leave blank stay unknown." />
          ) : (
            <ul class="list">{[...mine, ...cached].map((f) => logRow(f, () => navigate('foods/food/' + encodeURIComponent(f.id))))}</ul>
          )}
          {archivedFoods.length ? (
            <details class="block">
              <summary>Archived ({archivedFoods.length})</summary>
              <ul class="list">
                {archivedFoods.map((f) => (
                  <FoodRow key={f.id} food={f} showKcal={showKcal} onClick={() => navigate('foods/food/' + encodeURIComponent(f.id))} />
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {sub === 'recipes' ? (
        <>
          <button type="button" class="btn btn-secondary btn-block" onClick={() => navigate('foods/recipe/new')}><Icon name="recipe" size={20} /> New recipe</button>
          {!recipes.length ? (
            <EmptyState title="No recipes yet" body="Build a dish from ingredient weights. Nutrients are calculated from what you enter and the cooked weight you measure." />
          ) : (
            <ul class="list">
              {recipes.map((r) => {
                const f = state.foodsById.get(r.id);
                return (
                  <li key={r.id} class="row row-split">
                    <button type="button" class="row-body" disabled={!f} onClick={() => f && setLogging(f)} aria-label={`Log ${r.name}`}>
                      <span class="row-title">{r.name}</span>
                      <span class="row-sub">
                        <span>{r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'}</span>
                        <span>{r.yieldGrams ? 'cooked weight set' : 'no cooked weight'}</span>
                        <span>revision {r.revision}</span>
                      </span>
                    </button>
                    <button type="button" class="icon-btn" onClick={() => navigate('foods/recipe/' + encodeURIComponent(r.id))} aria-label={`Edit ${r.name}`}>
                      <Icon name="edit" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {archivedRecipes.length ? (
            <details class="block">
              <summary>Archived ({archivedRecipes.length})</summary>
              <ul class="list">
                {archivedRecipes.map((r) => (
                  <li key={r.id}><button type="button" class="row row-btn" onClick={() => navigate('foods/recipe/' + encodeURIComponent(r.id))}><span class="row-main"><span class="row-title">{r.name}</span></span></button></li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      ) : null}

      {sub === 'catalog' ? (
        <>
          {!state.seed.length ? (
            <EmptyState title="Catalog is empty" body="The bundled food catalog has no entries in this build. Your own foods and recipes still work." />
          ) : (
            <>
              <div class="tagcloud" role="group" aria-label="Browse by tag">
                {tags.map((t) => (
                  <button key={t} type="button" class="chip-btn" aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
                ))}
              </div>
              {tag ? (
                <ul class="list" aria-label={`Foods tagged ${tag}`}>
                  {tagged.map((f) => <FoodRow key={f.id} food={f} showKcal={showKcal} onClick={() => setLogging(f)} />)}
                </ul>
              ) : (
                <p class="hint pad">Choose a tag to browse, or use Search from the Add button.</p>
              )}
            </>
          )}
        </>
      ) : null}

      {logging ? (
        <Sheet title="Add to diary" onClose={() => setLogging(null)}>
          <PortionView food={logging} initialMeal={defaultMeal()} onSaved={() => setLogging(null)} />
        </Sheet>
      ) : null}
      {editor}
    </section>
  );
}

function FoodMeta({ food, showKcal }: { food: Food; showKcal: boolean }) {
  const k = food.per100g.energy_kcal?.amount;
  return (
    <span class="row-sub">
      <span>{food.source.name}</span>
      {showKcal && k !== null && k !== undefined ? <span class="num">{Math.round(k)} kcal / 100 g</span> : null}
    </span>
  );
}
