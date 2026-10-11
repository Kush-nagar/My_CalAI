import { useEffect, useMemo, useState } from 'preact/hooks';
import { entriesInRange } from '../../db/repo';
import { formatAmount } from '../../domain/nutrition';
import { localDateOf } from '../../domain/portion';
import { NUTRIENTS, type MealEntry, type NutrientCode } from '../../domain/types';
import { Segmented, SelectField } from '../components';
import { dailySeries, dateRange, nutrientMeta, trendStats, type DayPoint } from '../helpers';
import { caloriesVisible, useApp } from '../store';
import { useUi } from '../ui';

function shortDay(d: string, withWeekday: boolean) {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, withWeekday ? { weekday: 'short', day: 'numeric' } : { day: 'numeric', month: 'short' });
}

function BarChart({ series, code }: { series: DayPoint[]; code: NutrientCode }) {
  const unit = nutrientMeta(code).unit;
  const W = 340;
  const H = 168;
  const top = 22;
  const bottom = 26;
  const n = series.length;
  const max = Math.max(...series.map((p) => p.value ?? 0), 0) || 1;
  const bw = W / n;
  const barW = Math.max(3, Math.min(30, bw * 0.62));
  const ph = H - top - bottom;
  const maxIdx = series.reduce((b, p, i) => ((p.value ?? -1) > (series[b].value ?? -1) ? i : b), 0);
  const label = (i: number) => n <= 7 || i === maxIdx || i === 0 || i === n - 1;
  return (
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="chart-t chart-d" preserveAspectRatio="xMidYMid meet">
      <title id="chart-t">Daily {nutrientMeta(code).label.toLowerCase()} over the last {n} days</title>
      <desc id="chart-d">Bar chart with one bar per day. The same values are listed in the table below.</desc>
      <defs>
        <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--forest)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--surface)" stroke-width="1.6" />
        </pattern>
      </defs>
      <line x1="0" y1={H - bottom} x2={W} y2={H - bottom} stroke="var(--border)" />
      {series.map((p, i) => {
        const cx = i * bw + bw / 2;
        const h = p.value === null ? 0 : Math.max(2, (p.value / max) * ph);
        const y = H - bottom - h;
        return (
          <g key={p.date}>
            {p.value !== null ? (
              <rect x={cx - barW / 2} y={y} width={barW} height={h} rx="2" fill={p.incomplete ? 'url(#hatch)' : 'var(--forest)'} />
            ) : (
              <line x1={cx - 3} x2={cx + 3} y1={H - bottom - 1} y2={H - bottom - 1} stroke="var(--secondary)" stroke-width="1.5" />
            )}
            {p.value !== null && label(i) ? (
              <text x={cx} y={y - 5} text-anchor="middle" class="chart-val">
                {p.incomplete ? '≥' : ''}{formatAmount(p.value, unit)}
              </text>
            ) : null}
            {n <= 7 || i % 5 === 0 || i === n - 1 ? (
              <text x={cx} y={H - 8} text-anchor="middle" class="chart-x">{n <= 7 ? shortDay(p.date, true).replace(/\s/g, ' ') : String(Number(p.date.slice(8)))}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function Trends() {
  const { state } = useApp();
  const ui = useUi();
  const showKcal = caloriesVisible(state.settings);
  const choices = NUTRIENTS.filter((n) => showKcal || n.code !== 'energy_kcal');
  const [days, setDays] = useState<'7' | '30'>('7');
  const first = state.settings.summaryNutrients.find((c) => showKcal || c !== 'energy_kcal') ?? choices[0].code;
  const [code, setCode] = useState<NutrientCode>(first);
  const [entries, setEntries] = useState<MealEntry[] | null>(null);
  const end = localDateOf(new Date());
  const dates = useMemo(() => dateRange(end, Number(days)), [days, end]);

  useEffect(() => {
    let live = true;
    entriesInRange(state.db, dates[0], dates[dates.length - 1]).then((r) => live && setEntries(r), () => live && setEntries([]));
    return () => {
      live = false;
    };
  }, [dates, ui.version, state.db]);

  const activeCode = !showKcal && code === 'energy_kcal' ? first : code;
  const meta = nutrientMeta(activeCode);
  const series = useMemo(() => dailySeries(entries ?? [], dates, activeCode), [entries, dates, activeCode]);
  const stats = useMemo(() => trendStats(entries ?? [], series), [entries, series]);

  return (
    <section class="screen" aria-labelledby="tr-h">
      <header class="page-head"><h1 id="tr-h">Trends</h1></header>
      <Segmented name="range" legend="Time range" hideLegend value={days} onChange={setDays} options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }]} />
      <SelectField label="Nutrient" value={activeCode} onChange={(v) => setCode(v as NutrientCode)} options={choices.map((n) => ({ value: n.code, label: `${n.label} (${n.unit})` }))} />

      {entries === null ? (
        <p class="hint pad" aria-busy="true">Loading…</p>
      ) : (
        <>
          <dl class="stat-row">
            <div><dt>Days logged</dt><dd class="num">{stats.daysLogged} <small>of {days}</small></dd></div>
            <div><dt>Different foods</dt><dd class="num">{stats.distinctFoods}</dd></div>
            <div>
              <dt>Average on logged days</dt>
              <dd class="num">{stats.average === null ? <span class="muted">—</span> : <>{stats.averageIncomplete ? '≥ ' : ''}{formatAmount(stats.average, meta.unit)} <small>{meta.unit}</small></>}</dd>
            </div>
          </dl>

          {stats.daysLogged === 0 ? (
            <p class="hint pad">Nothing logged in this period yet. Trends appear after you log some meals.</p>
          ) : (
            <>
              <figure class="chart-card">
                <figcaption>{meta.label} per day ({meta.unit})</figcaption>
                <BarChart series={series} code={activeCode} />
                <p class="hint">Hatched bars with ≥ are lower bounds: some logged foods do not report {meta.label.toLowerCase()}. A short dash means nothing logged.</p>
              </figure>
              <details class="block" open>
                <summary>Table version</summary>
                <table class="ntable">
                  <caption class="sr-only">{meta.label} by day</caption>
                  <thead><tr><th scope="col">Day</th><th scope="col" class="num">{meta.label}</th><th scope="col" class="num">Foods</th></tr></thead>
                  <tbody>
                    {[...series].reverse().map((p) => (
                      <tr key={p.date}>
                        <th scope="row">{shortDay(p.date, true)}</th>
                        <td class="num">
                          {p.entries === 0 ? <span class="muted">not logged</span> : p.value === null ? <span class="muted">not reported</span> : <>{p.incomplete ? '≥ ' : ''}{formatAmount(p.value, meta.unit)}</>}
                        </td>
                        <td class="num">{p.entries ? p.foods : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
