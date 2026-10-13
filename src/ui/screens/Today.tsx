import { useEffect, useMemo, useState } from 'preact/hooks';
import { entriesForDate } from '../../db/repo';
import { sumTotals } from '../../domain/nutrition';
import { localDateOf } from '../../domain/portion';
import { MEAL_SLOTS, type MealEntry } from '../../domain/types';
import { EmptyState, EstimateBadge, SourceChip } from '../components';
import { Icon } from '../icons';
import { dayHeading, formatNutrient, groupByMeal, nutrientMeta, portionLabel } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { useUi } from '../ui';
import { EntrySheet } from '../add/EntrySheet';
import { DailyCard, DateStrip, WaterCard } from './Dashboard';

export function Today() {
  const { state } = useApp();
  const ui = useUi();
  const [entries, setEntries] = useState<MealEntry[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const showKcal = caloriesVisible(state.settings);
  const today = localDateOf(new Date());

  useEffect(() => {
    let live = true;
    entriesForDate(state.db, ui.date).then((r) => live && setEntries(r), () => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [ui.date, ui.version, state.db]);

  const totals = useMemo(() => (entries?.length ? sumTotals(entries.map((e) => e.nutrients)) : null), [entries]);
  const groups = useMemo(() => groupByMeal(entries ?? []), [entries]);
  const h = dayHeading(ui.date, today);
  const shown = state.settings.summaryNutrients.filter((c) => showKcal || c !== 'energy_kcal');
  const editEntry = entries?.find((e) => e.id === editing);
  const anyIncomplete = !!totals && shown.some((c) => totals.values[c] !== undefined && totals.incomplete.includes(c));

  return (
    <section aria-labelledby="day-h" class="screen">
      <header class="day-head">
        <div class="day-title">
          <h1 id="day-h">{h.main}</h1>
          <p class="day-sub">{h.sub}</p>
        </div>
        {ui.date !== today ? (
          <button type="button" class="btn btn-tonal btn-sm" onClick={() => ui.setDate(today)}>Today</button>
        ) : null}
        <button type="button" class="icon-btn cam-btn" onClick={() => ui.openAdd({ mode: 'camera' })} aria-label="Log a meal with the camera">
          <Icon name="camera" />
        </button>
      </header>
      <DateStrip />

      {entries === null ? (
        <p class="hint pad" aria-busy="true">Loading…</p>
      ) : (
        <>
          <DailyCard totals={totals} />
          <WaterCard />

          {entries.length === 0 ? (
            <EmptyState
              title={ui.date === today ? 'Nothing logged yet' : 'Nothing logged this day'}
              body="Search any food from any cuisine, scan a barcode, snap a photo, or quick-add calories."
              action={<button type="button" class="btn btn-primary" onClick={() => ui.openAdd()}><Icon name="plus" size={20} /> Add food</button>}
            />
          ) : (
            <details class="more-nutr">
              <summary>More nutrients</summary>
          <section class="summary" aria-label="Nutrient summary for this day">
            <dl class="summary-grid">
              {shown.map((c) => {
                const v = totals?.values[c];
                const inc = totals?.incomplete.includes(c);
                const m = nutrientMeta(c);
                return (
                  <div class="sum-tile" key={c}>
                    <dt>{m.label}</dt>
                    <dd>
                      {v === undefined ? (
                        <>
                          <span class="sum-val muted" aria-hidden="true">—</span>
                          <span class="sum-unit">not reported</span>
                        </>
                      ) : (
                        <>
                          <span class="sum-val num">
                            {inc ? <span class="atleast" aria-hidden="true">≥</span> : null}
                            {formatNutrient(c, v).replace(' ' + m.unit, '')}
                          </span>
                          <span class="sum-unit">{m.unit}</span>
                          {inc ? <span class="sr-only">at least, some logged foods do not report this value</span> : null}
                        </>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {anyIncomplete ? (
              <p class="hint foot"><Icon name="info" size={14} /> ≥ means “at least”: some logged foods do not report that nutrient, so the true total could be higher.</p>
            ) : null}
          </section>
            </details>
          )}

          {MEAL_SLOTS.map((m) => {
            const list = groups[m.id];
            const mt = list.length ? sumTotals(list.map((e) => e.nutrients)) : null;
            const kcal = mt?.values.energy_kcal;
            return (
              <section class="meal" key={m.id} aria-labelledby={'m-' + m.id}>
                <div class="meal-head">
                  <h2 id={'m-' + m.id}>{m.label}</h2>
                  {showKcal && kcal !== undefined ? (
                    <span class="num muted small">{mt!.incomplete.includes('energy_kcal') ? '≥ ' : ''}{formatNutrient('energy_kcal', kcal)}</span>
                  ) : null}
                  <button type="button" class="icon-btn small-btn" onClick={() => ui.openAdd({ meal: m.id })} aria-label={`Add to ${m.label}`}>
                    <Icon name="plus" size={20} />
                  </button>
                </div>
                {list.length ? (
                  <ul class="list">
                    {list.map((e) => {
                      const cat = state.foodsById.get(e.item.refId);
                      const label = portionLabel(e.portion, { hideGrams: e.portion.servingsOnly ?? cat?.portionMode === 'servings_only' });
                      const kc = e.nutrients.values.energy_kcal;
                      const sr = `${e.item.name}, ${label}${showKcal && kc !== undefined ? `, ${formatNutrient('energy_kcal', kc)}` : ''}${e.estimate === 'estimated' ? ', estimated' : ''}. Edit entry`;
                      return (
                        <li key={e.id}>
                          <button type="button" class="row row-btn" onClick={() => setEditing(e.id)} aria-label={sr}>
                            <span class="row-main">
                              <span class="row-title">{e.item.name}</span>
                              <span class="row-portion">{label}</span>
                              <span class="row-sub">
                                <SourceChip source={e.item.source} />
                                {e.estimate === 'estimated' ? <EstimateBadge /> : null}
                                {e.imageId ? <span class="chip"><Icon name="camera" size={13} /> Photo</span> : null}
                              </span>
                            </span>
                            {showKcal ? (
                              <span class="row-end">
                                {kc !== undefined ? <span class="num strong">{formatNutrient('energy_kcal', kc).replace(' kcal', '')}<small> kcal</small></span> : <span class="small muted">kcal not reported</span>}
                              </span>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p class="meal-empty">Nothing here</p>
                )}
              </section>
            );
          })}
          <p class="hint foot center">Totals are calculated from the foods and amounts you logged.</p>
        </>
      )}

      {editEntry ? <EntrySheet entry={editEntry} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
