import { useEffect, useState } from 'preact/hooks';
import { addWater, deleteWater, waterForDate } from '../../db/repo';
import { progress } from '../../domain/goals';
import { localDateOf, newId, shiftDate } from '../../domain/portion';
import type { Goals, NutrientTotals, WaterLog } from '../../domain/types';
import { Icon } from '../icons';
import { navigate, useUi } from '../ui';
import { useApp } from '../store';

const fmt = (n: number) => Math.round(n).toLocaleString();

/** Week strip (Mon–Sun) around the selected day. Day buttons are a radio group. */
export function DateStrip() {
  const ui = useUi();
  const today = localDateOf(new Date());
  const [y, m, d] = ui.date.split('-').map(Number);
  const dow = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  const monday = shiftDate(ui.date, -dow);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  return (
    <div class="datestrip">
      <button type="button" class="icon-btn" onClick={() => ui.setDate(shiftDate(ui.date, -7))} aria-label="Previous week">
        <Icon name="back" size={20} />
      </button>
      <div class="ds-days" role="radiogroup" aria-label="Choose a day">
        {days.map((day) => {
          const [yy, mm, dd] = day.split('-').map(Number);
          const dt = new Date(yy, mm - 1, dd);
          const sel = day === ui.date;
          return (
            <button
              key={day}
              type="button"
              role="radio"
              aria-checked={sel}
              class={'ds-day' + (sel ? ' on' : '') + (day === today ? ' today' : '')}
              aria-label={dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) + (day === today ? ', today' : '')}
              onClick={() => ui.setDate(day)}
            >
              <span class="ds-wd">{dt.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
              <span class="ds-d num">{dd}</span>
            </button>
          );
        })}
      </div>
      <button type="button" class="icon-btn" onClick={() => ui.setDate(shiftDate(ui.date, 7))} aria-label="Next week">
        <Icon name="next" size={20} />
      </button>
    </div>
  );
}

function Ring(props: { fraction: number; color: string; size?: number; stroke?: number; children?: preact.ComponentChildren }) {
  const size = props.size ?? 132;
  const sw = props.stroke ?? 12;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div class="ring" style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--tonal)" stroke-width={sw} />
        <circle
          class="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={props.color}
          stroke-width={sw}
          stroke-linecap="round"
          stroke-dasharray={`${c * props.fraction} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div class="ring-center">{props.children}</div>
    </div>
  );
}

/** Calorie ring + macro bars. Adults only show references; under-18 mode never shows energy targets. */
export function DailyCard(props: { totals: NutrientTotals | null }) {
  const { state } = useApp();
  const s = state.settings;
  const minor = s.ageBand === 'under18';
  const g: Goals = s.goals;
  const t = props.totals;
  const val = (c: 'energy_kcal' | 'protein_g' | 'carb_g' | 'fat_g') => t?.values[c] ?? 0;
  const inc = (c: 'energy_kcal' | 'protein_g' | 'carb_g' | 'fat_g') => !!t?.incomplete.includes(c) && t?.values[c] !== undefined;
  const kcal = val('energy_kcal');
  const kGoal = minor ? null : g.energy_kcal;
  const p = progress(kcal, kGoal);
  const showKcal = s.showCalories;

  const macros = [
    { code: 'protein_g' as const, label: 'Protein', color: 'var(--protein)', cls: 'm-protein' },
    { code: 'carb_g' as const, label: 'Carbs', color: 'var(--carb)', cls: 'm-carb' },
    { code: 'fat_g' as const, label: 'Fat', color: 'var(--fat)', cls: 'm-fat' },
  ];
  const noGoals = !minor && kGoal === null && g.protein_g === null && g.carb_g === null && g.fat_g === null;

  return (
    <section class="card daily" aria-label="Today's totals">
      {showKcal ? (
        <div class="daily-top">
          <Ring fraction={kGoal ? p.fraction : kcal > 0 ? 1 : 0} color={kGoal ? 'var(--forest)' : 'var(--tonal)'}>
            {kGoal ? (
              <>
                <span class="ring-num num">{fmt(p.left ?? p.over ?? 0)}</span>
                <span class="ring-cap">{p.over !== null ? 'kcal above' : 'kcal left'}</span>
              </>
            ) : (
              <>
                <span class="ring-num num">{inc('energy_kcal') ? '≥' : ''}{fmt(kcal)}</span>
                <span class="ring-cap">kcal eaten</span>
              </>
            )}
          </Ring>
          <dl class="daily-stats">
            <div>
              <dt>Eaten</dt>
              <dd class="num">{inc('energy_kcal') ? '≥ ' : ''}{fmt(kcal)} kcal</dd>
            </div>
            {kGoal ? (
              <div>
                <dt>Daily reference</dt>
                <dd class="num">{fmt(kGoal)} kcal</dd>
              </div>
            ) : null}
            <p class="sr-only">
              {kGoal
                ? `${fmt(kcal)} of ${fmt(kGoal)} kilocalories eaten, ${p.over !== null ? `${fmt(p.over)} above your reference` : `${fmt(p.left ?? 0)} left`}.`
                : `${fmt(kcal)} kilocalories eaten.`}
              {inc('energy_kcal') ? ' Some foods do not report energy, so the true total could be higher.' : ''}
            </p>
          </dl>
        </div>
      ) : null}

      <div class="macros">
        {macros.map((mm) => {
          const v = val(mm.code);
          const goal = minor ? null : g[mm.code];
          const pr = progress(v, goal);
          return (
            <div class={'macro ' + mm.cls} key={mm.code}>
              <div class="macro-line">
                <span class="macro-label"><span class="macro-dot" aria-hidden="true" />{mm.label}</span>
                <span class="num macro-val">
                  {inc(mm.code) ? '≥ ' : ''}{fmt(v)}{goal ? <span class="muted"> / {fmt(goal)}</span> : null} g
                </span>
              </div>
              {goal ? (
                <div
                  class="bar"
                  role="progressbar"
                  aria-label={`${mm.label} ${fmt(v)} of ${fmt(goal)} grams`}
                  aria-valuemin={0}
                  aria-valuemax={goal}
                  aria-valuenow={Math.min(v, goal)}
                >
                  <span style={{ width: `${pr.fraction * 100}%`, background: mm.color }} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {noGoals ? (
        <button type="button" class="link" onClick={() => navigate('settings/goals')}>Set daily references (optional)</button>
      ) : null}
    </section>
  );
}

/** Water: quick +250/+500 ml, undo last, optional daily goal. */
export function WaterCard() {
  const { state } = useApp();
  const ui = useUi();
  const [logs, setLogs] = useState<WaterLog[] | null>(null);
  const goal = state.settings.goals.water_ml;

  useEffect(() => {
    let live = true;
    waterForDate(state.db, ui.date).then((r) => live && setLogs(r), () => live && setLogs([]));
    return () => {
      live = false;
    };
  }, [ui.date, ui.version, state.db]);

  const total = (logs ?? []).reduce((s, w) => s + w.ml, 0);
  const pr = progress(total, goal);

  async function add(ml: number) {
    await addWater(state.db, { id: newId('w:'), localDate: ui.date, ml, at: new Date().toISOString() });
    ui.bump();
    ui.announce(`Added ${ml} ml of water`);
  }
  async function undo() {
    const last = logs?.slice().sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (!last) return;
    await deleteWater(state.db, last.id);
    ui.bump();
    ui.announce(`Removed ${last.ml} ml`);
  }

  return (
    <section class="card water" aria-labelledby="water-h">
      <div class="water-top">
        <h2 id="water-h" class="water-h"><Icon name="drop" size={20} /> Water</h2>
        <span class="num water-val">
          {fmt(total)}{goal ? <span class="muted"> / {fmt(goal)}</span> : null} ml
        </span>
      </div>
      {goal ? (
        <div class="bar" role="progressbar" aria-label={`Water ${fmt(total)} of ${fmt(goal)} millilitres`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(total, goal)}>
          <span style={{ width: `${pr.fraction * 100}%`, background: 'var(--water)' }} />
        </div>
      ) : null}
      <div class="btn-row water-btns">
        <button type="button" class="btn btn-tonal" onClick={() => void add(250)}>+ 250 ml</button>
        <button type="button" class="btn btn-tonal" onClick={() => void add(500)}>+ 500 ml</button>
        {logs?.length ? (
          <button type="button" class="link" onClick={() => void undo()}>Undo last</button>
        ) : null}
      </div>
    </section>
  );
}
