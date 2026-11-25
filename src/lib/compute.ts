/**
 * Memoised analysis results. Every station reads from here so a hexagon grid
 * or a Gi* run is computed once per configuration, not once per component.
 */
import type { Selection } from '../state/store';
import { classBreaks } from './stats/classify';
import { getisOrd, type GiSummary } from './stats/gistar';
import { autoResolution, binHexes, studyArea, type HexGrid } from './stats/hex';
import { analyseTrends, sliceTime, type CellTrend, type TimeSlices } from './stats/trend';
import { toNumber } from './data/profile';
import type { Dataset, SymbologyConfig, TimeStep } from './types';
import { categoricalById, OTHER_COLOR, rampById, sampleRamp } from './palettes';

const cache = new Map<string, unknown>();
let cacheOwner: Dataset | null = null;

function memo<T>(ds: Dataset, key: string, fn: () => T): T {
  if (cacheOwner !== ds) {
    cache.clear();
    cacheOwner = ds;
  }
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key) as T;
}

export function selectionKey(sel: Selection | null): string {
  return sel ? JSON.stringify(sel) : 'all';
}

/** Row indices passing the current chart selection (null = all rows). */
export function selectedRows(ds: Dataset, sel: Selection | null): Uint32Array | null {
  if (!sel) return null;
  return memo(ds, `sel:${selectionKey(sel)}`, () => {
    const out: number[] = [];
    for (let i = 0; i < ds.n; i++) {
      let ok = false;
      switch (sel.kind) {
        case 'category':
          ok = String(ds.rows[i][sel.field] ?? '(blank)').trim() === sel.value || (sel.value === '(blank)' && (ds.rows[i][sel.field] ?? '') === '');
          break;
        case 'clock': {
          const t = ds.time[i];
          if (Number.isFinite(t)) {
            const d = new Date(t);
            ok = d.getUTCDay() === sel.weekday && d.getUTCHours() === sel.hour;
          }
          break;
        }
        case 'day': {
          const t = ds.time[i];
          ok = Number.isFinite(t) && Math.floor(t / 86400_000) === sel.day;
          break;
        }
        case 'slice': {
          const s = slices(ds, 'auto');
          ok = !!s && s.sliceOf[i] === sel.index;
          break;
        }
        case 'range': {
          const v = toNumber(ds.rows[i][sel.field]);
          ok = v >= sel.lo && v <= sel.hi;
          break;
        }
      }
      if (ok) out.push(i);
    }
    return Uint32Array.from(out);
  });
}

export function resolutionFor(ds: Dataset, r: number | 'auto'): number {
  return r === 'auto' ? memo(ds, 'autores', () => autoResolution(ds)) : r;
}

export function grid(ds: Dataset, res: number, weight: string | null, sel: Selection | null): HexGrid {
  return memo(ds, `grid:${res}:${weight}:${selectionKey(sel)}`, () => binHexes(ds, res, weight, selectedRows(ds, sel) ?? undefined));
}

export function giStar(ds: Dataset, res: number, rings: number, fdr: boolean, weight: string | null, sel: Selection | null): { gi: GiSummary; area: string[] } {
  return memo(ds, `gi:${res}:${rings}:${fdr}:${weight}:${selectionKey(sel)}`, () => {
    const g = grid(ds, res, weight, sel);
    const area = studyArea(g, Math.max(1, rings));
    const values = new Map<string, number>();
    for (const [id, b] of g.cells) values.set(id, b.value);
    return { gi: getisOrd(values, area, rings, fdr), area };
  });
}

export function slices(ds: Dataset, step: TimeStep): TimeSlices | null {
  if (!ds.timeField) return null;
  return memo(ds, `slices:${step}`, () => sliceTime(ds.time, step));
}

export function cellSeries(ds: Dataset, res: number, step: TimeStep, sel: Selection | null): Map<string, number[]> | null {
  const s = slices(ds, step);
  if (!s) return null;
  return memo(ds, `series:${res}:${step}:${selectionKey(sel)}`, () => {
    const g = grid(ds, res, null, sel);
    const out = new Map<string, number[]>();
    for (const [id, b] of g.cells) {
      const arr = new Array(s.starts.length).fill(0);
      for (const i of b.members) {
        const k = s.sliceOf[i];
        if (k >= 0) arr[k]++;
      }
      out.set(id, arr);
    }
    return out;
  });
}

export function trends(ds: Dataset, res: number, step: TimeStep, rings: number, fdr: boolean, sel: Selection | null): { trends: Map<string, CellTrend>; slices: TimeSlices } | null {
  const s = slices(ds, step);
  const series = cellSeries(ds, res, step, sel);
  if (!s || !series) return null;
  // drop a trailing partial slice so a half-finished month doesn't read as a fall
  const usable = s.partialLast && s.starts.length > 3 ? s.starts.length - 1 : s.starts.length;
  return memo(ds, `trends:${res}:${step}:${rings}:${fdr}:${selectionKey(sel)}`, () => {
    const g = grid(ds, res, null, sel);
    const area = studyArea(g, Math.max(1, rings));
    const trimmed = new Map<string, number[]>();
    for (const [id, arr] of series) trimmed.set(id, arr.slice(0, usable));
    return { trends: analyseTrends(trimmed, area, usable, rings, fdr), slices: { ...s, starts: s.starts.slice(0, usable) } };
  });
}

/* ---------------- symbology ---------------- */

export interface ColorScheme {
  kind: 'single' | 'categories' | 'classes';
  /** per-row colour */
  colorOf: (i: number) => string;
  legend: { label: string; color: string; count?: number; value?: string }[];
  breaks?: number[];
}

export function colorScheme(ds: Dataset, sym: SymbologyConfig): ColorScheme {
  const key = `color:${sym.kind}:${sym.field}:${sym.colorField}:${sym.method}:${sym.classes}:${sym.ramp}:${sym.categoryPalette}:${sym.maxCategories}`;
  return memo(ds, key, () => {
    const fieldName = sym.kind === 'multivariate' ? sym.colorField : sym.field;
    const field = fieldName ? ds.fields.find((f) => f.name === fieldName) : null;
    if (!field || sym.kind === 'single' || sym.kind === 'proportional') {
      return { kind: 'single', colorOf: () => '#1d4f73', legend: [{ label: `${ds.n.toLocaleString('en-GB')} events`, color: '#1d4f73' }] };
    }
    if (field.kind === 'qualitative' || field.kind === 'text' || sym.kind === 'unique') {
      const cats = field.categories ?? [];
      const palette = categoricalById(sym.categoryPalette).colors;
      const top = cats.slice(0, sym.maxCategories);
      const map = new Map(top.map((c, i) => [c.value, palette[i % palette.length]]));
      const otherCount = cats.slice(sym.maxCategories).reduce((a, c) => a + c.count, 0);
      const legend = top.map((c) => ({ label: c.value, color: map.get(c.value)!, count: c.count, value: c.value }));
      if (otherCount) legend.push({ label: `Other (${cats.length - top.length})`, color: OTHER_COLOR, count: otherCount, value: '__other' });
      const colors = new Array<string>(ds.n);
      for (let i = 0; i < ds.n; i++) colors[i] = map.get(String(ds.rows[i][field.name] ?? '').trim()) ?? OTHER_COLOR;
      return { kind: 'categories', colorOf: (i) => colors[i], legend };
    }
    const values = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) values[i] = toNumber(ds.rows[i][field.name]);
    const breaks = classBreaks(values, sym.classes, sym.method);
    const ramp = sampleRamp(rampById(sym.ramp).stops, breaks.length);
    const lo = field.min ?? breaks[0];
    const colors = new Array<string>(ds.n);
    const counts = new Array(breaks.length).fill(0);
    for (let i = 0; i < ds.n; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) { colors[i] = OTHER_COLOR; continue; }
      let k = breaks.length - 1;
      for (let b = 0; b < breaks.length; b++) if (v <= breaks[b]) { k = b; break; }
      colors[i] = ramp[k];
      counts[k]++;
    }
    const fmt = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en-GB') : String(Math.round(x * 100) / 100));
    const legend = breaks.map((b, k) => ({ label: `${fmt(k === 0 ? lo : breaks[k - 1])} – ${fmt(b)}`, color: ramp[k], count: counts[k] }));
    return { kind: 'classes', colorOf: (i) => colors[i], legend, breaks };
  });
}

/** Radius per row for proportional / multivariate symbols. */
export function sizeScale(ds: Dataset, sym: SymbologyConfig): { radiusOf: (i: number) => number; legend: { label: string; r: number }[] } | null {
  const fieldName = sym.kind === 'multivariate' ? sym.sizeField : sym.kind === 'proportional' ? sym.field : null;
  if (!fieldName) return null;
  return memo(ds, `size:${fieldName}:${sym.size}`, () => {
    const vals = new Float64Array(ds.n);
    let max = 0;
    let min = Infinity;
    for (let i = 0; i < ds.n; i++) {
      const v = toNumber(ds.rows[i][fieldName]);
      vals[i] = v;
      if (Number.isFinite(v)) {
        if (v > max) max = v;
        if (v < min) min = v;
      }
    }
    const lo = Math.max(0, min);
    const maxR = sym.size * 4.2;
    const minR = Math.max(1.2, sym.size * 0.45);
    // area-true: radius grows with the square root of the value
    const r = (v: number) => (Number.isFinite(v) && max > lo ? minR + (maxR - minR) * Math.sqrt(Math.max(0, v - lo) / (max - lo)) : minR);
    const steps = [lo + (max - lo) * 0.1, lo + (max - lo) * 0.45, max];
    return {
      radiusOf: (i) => r(vals[i]),
      legend: steps.map((v) => ({ label: Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-GB') : String(Math.round(v * 10) / 10), r: r(v) })),
    };
  });
}

export function timeExtent(ds: Dataset): [number, number] | null {
  return memo(ds, 'textent', () => {
    let a = Infinity;
    let b = -Infinity;
    for (const t of ds.time) {
      if (!Number.isFinite(t)) continue;
      if (t < a) a = t;
      if (t > b) b = t;
    }
    return Number.isFinite(a) ? ([a, b] as [number, number]) : null;
  });
}

export function categoryCounts(ds: Dataset, field: string, rows: Uint32Array | null): { value: string; count: number }[] {
  return memo(ds, `cc:${field}:${rows ? rows.length + ':' + rows[0] : 'all'}`, () => {
    const m = new Map<string, number>();
    const len = rows ? rows.length : ds.n;
    for (let k = 0; k < len; k++) {
      const i = rows ? rows[k] : k;
      const v = String(ds.rows[i][field] ?? '').trim() || '(blank)';
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
  });
}

export function invalidate() {
  cache.clear();
}
