import { useEffect, useMemo, useRef, useState } from 'react';

/** Width of an element in CSS pixels, so charts draw at true size and text never scales. */
function useWidth(fallback: number) {
  const ref = useRef<HTMLElement>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => { const next = Math.round(e.contentRect.width); if (next > 40) setW(next); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
import { arc } from 'd3-shape';
import type { Dataset } from '../lib/types';
import { useStore, type Selection } from '../state/store';
import { categoryCounts, colorScheme, selectedRows, slices, timeExtent } from '../lib/compute';
import { toNumber } from '../lib/data/profile';
import { classBreaks } from '../lib/stats/classify';
import { formatSlice, mannKendall } from '../lib/stats/trend';
import { rampById, sampleRamp } from '../lib/palettes';
import { niceNumber } from '../lib/stats/classify';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const sameSel = (a: Selection | null, b: Selection) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------- category bars ---------------- */

export function CategoryBars({ ds, field, limit = 8, compact = false }: { ds: Dataset; field: string; limit?: number; compact?: boolean }) {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const sym = useStore((s) => s.sym);
  const counts = categoryCounts(ds, field, null);
  const scheme = sym.field === field ? colorScheme(ds, sym) : null;
  const colorFor = (v: string) => scheme?.legend.find((l) => l.value === v)?.color ?? '#3a4148';
  const top = counts.slice(0, limit);
  const max = Math.max(1, ...top.map((c) => c.count));
  const total = counts.reduce((a, c) => a + c.count, 0);
  return (
    <div className={`bars ${compact ? 'bars--compact' : ''}`} role="list">
      {top.map((c) => {
        const sel: Selection = { kind: 'category', field, value: c.value };
        const active = sameSel(selection, sel);
        const dim = selection && selection.kind === 'category' && selection.field === field && !active;
        return (
          <button
            key={c.value}
            role="listitem"
            className={`bar ${active ? 'is-active' : ''} ${dim ? 'is-dim' : ''}`}
            onClick={() => setSelection(active ? null : sel)}
            aria-pressed={active}
            title={`Show only ${c.value} on the map`}
          >
            <span className="bar-label">{c.value}</span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(c.count / max) * 100}%`, background: colorFor(c.value) }} />
            </span>
            <span className="bar-value num">{c.count.toLocaleString('en-GB')}</span>
            <span className="bar-share num">{((c.count / total) * 100).toFixed(c.count / total < 0.1 ? 1 : 0)}%</span>
          </button>
        );
      })}
      {counts.length > limit && <p className="chart-foot">and {counts.length - limit} more categories</p>}
    </div>
  );
}

/* ---------------- histogram ---------------- */

export function Histogram({ ds, field, width: fallback = 300, height = 120 }: { ds: Dataset; field: string; width?: number; height?: number }) {
  const [box, width] = useWidth(fallback);
  const sym = useStore((s) => s.sym);
  const setSelection = useStore((s) => s.setSelection);
  const selection = useStore((s) => s.selection);
  const data = useMemo(() => {
    const vals: number[] = [];
    for (let i = 0; i < ds.n; i++) {
      const v = toNumber(ds.rows[i][field]);
      if (Number.isFinite(v)) vals.push(v);
    }
    if (!vals.length) return null;
    vals.sort((a, b) => a - b);
    // trim the extreme 0.5% so one outlier does not flatten the shape
    const lo = vals[Math.floor(vals.length * 0.002)];
    const hi = vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))];
    const bins = 28;
    const step = (hi - lo) / bins || 1;
    const counts = new Array(bins).fill(0);
    for (const v of vals) {
      if (v < lo || v > hi) continue;
      counts[Math.min(bins - 1, Math.floor((v - lo) / step))]++;
    }
    const breaks = sym.field === field && (sym.kind === 'graduated') ? classBreaks(vals, sym.classes, sym.method) : [];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const median = vals[Math.floor(vals.length / 2)];
    return { counts, lo, hi, step, breaks, mean, median, n: vals.length, trimmed: vals[0] < lo || vals[vals.length - 1] > hi };
  }, [ds, field, sym.field, sym.kind, sym.classes, sym.method]);
  if (!data) return <p className="chart-empty">No numbers in this field.</p>;
  const pad = { l: 4, r: 4, t: 8, b: 22 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(...data.counts);
  const x = (v: number) => pad.l + ((v - data.lo) / (data.hi - data.lo || 1)) * iw;
  const bw = iw / data.counts.length;
  return (
    <figure className="chart" ref={box as React.RefObject<HTMLElement>}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Distribution of ${field}`}>
        {data.counts.map((c, k) => {
          const lo = data.lo + k * data.step;
          const hi = lo + data.step;
          const active = selection?.kind === 'range' && selection.field === field && selection.lo === lo;
          return (
            <rect
              key={k}
              x={pad.l + k * bw + 0.5}
              y={pad.t + ih - (c / max) * ih}
              width={Math.max(1, bw - 1)}
              height={(c / max) * ih}
              className={`hist-bar ${active ? 'is-active' : ''}`}
              onClick={() => setSelection(active ? null : { kind: 'range', field, lo, hi })}
            >
              <title>{`${niceNumber(lo)} to ${niceNumber(hi)}: ${c.toLocaleString('en-GB')}`}</title>
            </rect>
          );
        })}
        {data.breaks.slice(0, -1).map((b, k) => (
          <line key={k} x1={x(b)} x2={x(b)} y1={pad.t - 4} y2={pad.t + ih} className="hist-break" />
        ))}
        <line x1={x(data.median)} x2={x(data.median)} y1={pad.t} y2={pad.t + ih} className="hist-median" />
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih + 0.5} y2={pad.t + ih + 0.5} className="axis" />
        <text x={pad.l} y={height - 6} className="tick">{niceNumber(data.lo)}</text>
        <text x={width - pad.r} y={height - 6} className="tick" textAnchor="end">{niceNumber(data.hi)}</text>
        <text x={x(data.median)} y={height - 6} className="tick tick--strong" textAnchor="middle">median {niceNumber(data.median)}</text>
      </svg>
      <figcaption>
        {data.n.toLocaleString('en-GB')} values{data.breaks.length > 1 ? '. Vertical rules are the class breaks on the map.' : '.'}
        {data.trimmed ? ' Extreme tails trimmed for display.' : ''}
      </figcaption>
    </figure>
  );
}

/* ---------------- data clock ---------------- */

export function DataClock({ ds, size = 260 }: { ds: Dataset; size?: number }) {
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (let i = 0; i < ds.n; i++) {
      const t = ds.time[i];
      if (!Number.isFinite(t)) continue;
      const d = new Date(t);
      g[d.getUTCDay()][d.getUTCHours()]++;
    }
    return g;
  }, [ds]);
  const flat = grid.flat();
  const max = Math.max(1, ...flat);
  const breaks = classBreaks(flat.filter((v) => v > 0), 5, 'quantile');
  const ramp = sampleRamp(rampById('ember').stops, Math.max(1, breaks.length));
  const color = (v: number) => {
    if (v === 0) return '#eef0ec';
    for (let k = 0; k < breaks.length; k++) if (v <= breaks[k]) return ramp[k];
    return ramp[ramp.length - 1];
  };
  const r0 = size * 0.2;
  const r1 = size * 0.42;
  const ring = (r1 - r0) / 7;
  const a = arc<{ inner: number; outer: number; start: number; end: number }>()
    .innerRadius((d) => d.inner)
    .outerRadius((d) => d.outer)
    .startAngle((d) => d.start)
    .endAngle((d) => d.end)
    .padAngle(0.004);
  // Monday outermost reads naturally; rings run Mon..Sun from outside in
  const order = [1, 2, 3, 4, 5, 6, 0];
  let peak = { d: 0, h: 0, v: 0 };
  grid.forEach((row, d) => row.forEach((v, h) => { if (v > peak.v) peak = { d, h, v }; }));
  return (
    <figure className="chart chart--clock">
      <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} overflow="visible" width="100%" role="img" aria-label="Data clock: events by weekday and hour">
        {order.map((day, ri) => {
          const outer = r1 - ri * ring;
          const inner = outer - ring + 0.6;
          return grid[day].map((v, h) => {
            const sel: Selection = { kind: 'clock', weekday: day, hour: h };
            const active = sameSel(selection, sel);
            return (
              <path
                key={`${day}-${h}`}
                d={a({ inner, outer, start: (h / 24) * Math.PI * 2, end: ((h + 1) / 24) * Math.PI * 2 }) ?? ''}
                fill={color(v)}
                className={`clock-cell ${active ? 'is-active' : ''}`}
                onClick={() => setSelection(active ? null : sel)}
              >
                <title>{`${WEEKDAYS[day]} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00 · ${v.toLocaleString('en-GB')} events`}</title>
              </path>
            );
          });
        })}
        {[0, 6, 12, 18].map((h) => {
          const ang = (h / 24) * Math.PI * 2 - Math.PI / 2;
          return (
            <text key={h} x={Math.cos(ang) * (r1 + 14)} y={Math.sin(ang) * (r1 + 14) + 3.5} textAnchor="middle" className="tick">
              {String(h).padStart(2, '0')}
            </text>
          );
        })}
        <text y={1} textAnchor="middle" className="clock-centre num">{max.toLocaleString('en-GB')}</text>
        <text y={14} textAnchor="middle" className="tick">peak</text>
      </svg>
      <figcaption>
        Rings run Monday (outside) to Sunday (inside), wedges are hours. Busiest: {WEEKDAYS[peak.d]} {String(peak.h).padStart(2, '0')}:00. Hours as recorded in the data.
      </figcaption>
    </figure>
  );
}

/* ---------------- calendar heat chart ---------------- */

export function CalendarHeat({ ds }: { ds: Dataset }) {
  const [box, boxW] = useWidth(300);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const ext = timeExtent(ds);
  const data = useMemo(() => {
    if (!ext) return null;
    const end = Math.floor(ext[1] / 86400_000);
    const start = Math.max(Math.floor(ext[0] / 86400_000), end - 364);
    const counts = new Map<number, number>();
    for (let i = 0; i < ds.n; i++) {
      const t = ds.time[i];
      if (!Number.isFinite(t)) continue;
      const day = Math.floor(t / 86400_000);
      if (day >= start) counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return { start, end, counts };
  }, [ds, ext]);
  if (!data) return null;
  const values = [...data.counts.values()];
  const breaks = classBreaks(values, 5, 'quantile');
  const ramp = sampleRamp(rampById('tide').stops, Math.max(1, breaks.length));
  const color = (v: number) => {
    if (!v) return '#eef0ec';
    for (let k = 0; k < breaks.length; k++) if (v <= breaks[k]) return ramp[k];
    return ramp[ramp.length - 1];
  };
  const gap = 2;
  const weeksGuess = Math.ceil(((data.end - data.start + 1) + 6) / 7);
  const cell = Math.max(4, Math.min(12, Math.floor((boxW - 22) / weeksGuess) - gap));
  const firstDow = (new Date(data.start * 86400_000).getUTCDay() + 6) % 7;
  const days = data.end - data.start + 1;
  const weeks = Math.ceil((days + firstDow) / 7);
  const w = weeks * (cell + gap) + 22;
  const h = 7 * (cell + gap) + 16;
  const months: { x: number; label: string }[] = [];
  for (let d = data.start; d <= data.end; d++) {
    const dt = new Date(d * 86400_000);
    if (dt.getUTCDate() === 1) months.push({ x: 22 + Math.floor((d - data.start + firstDow) / 7) * (cell + gap), label: dt.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }) });
  }
  return (
    <figure className="chart chart--calendar" ref={box as React.RefObject<HTMLElement>}>
      <div className="calendar-scroll">
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label="Calendar heat chart of daily events">
          {['M', 'W', 'F'].map((l, k) => (
            <text key={l} x={0} y={16 + (k * 2) * (cell + gap) + cell - 1} className="tick">{l}</text>
          ))}
          {months.map((m) => <text key={m.x} x={m.x} y={8} className="tick">{m.label}</text>)}
          {Array.from({ length: days }, (_, k) => {
            const day = data.start + k;
            const pos = k + firstDow;
            const v = data.counts.get(day) ?? 0;
            const sel: Selection = { kind: 'day', day };
            const active = sameSel(selection, sel);
            return (
              <rect
                key={day}
                x={22 + Math.floor(pos / 7) * (cell + gap)}
                y={12 + (pos % 7) * (cell + gap)}
                width={cell}
                height={cell}
                fill={color(v)}
                className={`cal-cell ${active ? 'is-active' : ''}`}
                onClick={() => v && setSelection(active ? null : sel)}
              >
                <title>{`${new Date(day * 86400_000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}: ${v}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
      <figcaption>Each square is one day{days < 364 ? '' : ' of the last year in the data'}. Darker means more events. Click a day to see it on the map.</figcaption>
    </figure>
  );
}

/* ---------------- timeline with trend ---------------- */

export function Timeline({ ds, width: fallback = 320, height = 120 }: { ds: Dataset; width?: number; height?: number }) {
  const [box, width] = useWidth(fallback);
  const step = useStore((s) => s.time.step);
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const sl = slices(ds, step);
  const series = useMemo(() => {
    if (!sl) return null;
    const arr = new Array(sl.starts.length).fill(0);
    const rows = selection && selection.kind !== 'slice' ? selectedRows(ds, selection) : null;
    const len = rows ? rows.length : ds.n;
    for (let k = 0; k < len; k++) {
      const i = rows ? rows[k] : k;
      const s = sl.sliceOf[i];
      if (s >= 0) arr[s]++;
    }
    return arr;
  }, [ds, sl, selection]);
  if (!sl || !series) return null;
  const usable = sl.partialLast && series.length > 3 ? series.length - 1 : series.length;
  const mk = mannKendall(series.slice(0, usable));
  const pad = { l: 4, r: 4, t: 10, b: 22 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const max = Math.max(1, ...series);
  const bw = iw / series.length;
  const mid = (usable - 1) / 2;
  const medianY = [...series.slice(0, usable)].sort((a, b) => a - b)[Math.floor(usable / 2)];
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  return (
    <figure className="chart" ref={box as React.RefObject<HTMLElement>}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label="Events per period">
        {series.map((v, k) => {
          const active = selection?.kind === 'slice' && selection.index === k;
          return (
            <rect
              key={k}
              x={pad.l + k * bw + 0.5}
              y={y(v)}
              width={Math.max(1, bw - 1.5)}
              height={pad.t + ih - y(v)}
              className={`tl-bar ${k >= usable ? 'is-partial' : ''} ${active ? 'is-active' : ''}`}
              onClick={() => setSelection(active ? null : { kind: 'slice', index: k })}
            >
              <title>{`${formatSlice(sl.starts[k], sl.step)}: ${v.toLocaleString('en-GB')}${k >= usable ? ' (incomplete period)' : ''}`}</title>
            </rect>
          );
        })}
        {mk.direction !== 'none' && (
          <line
            x1={pad.l + bw / 2}
            x2={pad.l + (usable - 0.5) * bw}
            y1={y(medianY - mk.slope * mid)}
            y2={y(medianY + mk.slope * mid)}
            className={`tl-trend tl-trend--${mk.direction}`}
          />
        )}
        <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih + 0.5} y2={pad.t + ih + 0.5} className="axis" />
        <text x={pad.l} y={height - 6} className="tick">{formatSlice(sl.starts[0], sl.step)}</text>
        <text x={width - pad.r} y={height - 6} className="tick" textAnchor="end">{formatSlice(sl.starts[sl.starts.length - 1], sl.step)}</text>
      </svg>
      <figcaption>
        {mk.direction === 'none'
          ? `No significant trend across ${usable} ${sl.step}s (Mann-Kendall p = ${mk.p.toFixed(2)}).`
          : `${mk.direction === 'up' ? 'Rising' : 'Falling'} by about ${niceNumber(Math.abs(mk.slope))} events per ${sl.step} (Mann-Kendall p ${mk.p < 0.001 ? '< 0.001' : '= ' + mk.p.toFixed(3)}).`}
        {usable < series.length ? ' The last bar is an incomplete period and is left out of the test.' : ''}
      </figcaption>
    </figure>
  );
}
