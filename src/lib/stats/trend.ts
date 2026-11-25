import type { TimeStep } from '../types';
import { getisOrd, twoTailedP, type GiBin } from './gistar';

export interface MannKendall {
  s: number;
  z: number;
  p: number;
  /** Sen's slope (change per step) */
  slope: number;
  direction: 'up' | 'down' | 'none';
}

/** Mann-Kendall trend test with tie correction, plus Sen's slope. */
export function mannKendall(series: number[], alpha = 0.05): MannKendall {
  const n = series.length;
  let s = 0;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = series[j] - series[i];
      s += Math.sign(d);
      slopes.push(d / (j - i));
    }
  }
  const ties = new Map<number, number>();
  for (const v of series) ties.set(v, (ties.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  let z = 0;
  if (variance > 0) z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  const p = n >= 3 ? twoTailedP(z) : 1;
  slopes.sort((a, b) => a - b);
  const slope = slopes.length ? slopes[Math.floor(slopes.length / 2)] : 0;
  const direction = p <= alpha ? (z > 0 ? 'up' : 'down') : 'none';
  return { s, z, p, slope, direction };
}

/* ---------------- time slicing ---------------- */

const DAY = 86400_000;

export const STEP_MS: Record<Exclude<TimeStep, 'auto'>, number> = {
  hour: 3600_000,
  day: DAY,
  week: 7 * DAY,
  month: 30.44 * DAY,
  quarter: 91.31 * DAY,
  year: 365.25 * DAY,
};

export function autoStep(minT: number, maxT: number): Exclude<TimeStep, 'auto'> {
  const span = maxT - minT;
  const order: Exclude<TimeStep, 'auto'>[] = ['hour', 'day', 'week', 'month', 'quarter', 'year'];
  for (const s of order) if (span / STEP_MS[s] <= 36) return s;
  return 'year';
}

/** Start of the calendar bucket containing t (UTC). */
export function bucketStart(t: number, step: Exclude<TimeStep, 'auto'>): number {
  const d = new Date(t);
  switch (step) {
    case 'hour':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours());
    case 'day':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    case 'week': {
      const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const dow = (d.getUTCDay() + 6) % 7; // Monday start
      return day - dow * DAY;
    }
    case 'month':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
    case 'quarter':
      return Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1);
    case 'year':
      return Date.UTC(d.getUTCFullYear(), 0, 1);
  }
}

export function nextBucket(t: number, step: Exclude<TimeStep, 'auto'>): number {
  const d = new Date(t);
  switch (step) {
    case 'hour':
      return t + 3600_000;
    case 'day':
      return t + DAY;
    case 'week':
      return t + 7 * DAY;
    case 'month':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    case 'quarter':
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1);
    case 'year':
      return Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  }
}

export interface TimeSlices {
  step: Exclude<TimeStep, 'auto'>;
  starts: number[];
  /** slice index per row, -1 when the row has no time */
  sliceOf: Int32Array;
  /** true when the last slice is incomplete (data ends mid-bucket) */
  partialLast: boolean;
}

export function sliceTime(time: Float64Array, step: TimeStep): TimeSlices | null {
  let min = Infinity;
  let max = -Infinity;
  for (const t of time) {
    if (!Number.isFinite(t)) continue;
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (!Number.isFinite(min) || max <= min) return null;
  const s = step === 'auto' ? autoStep(min, max) : step;
  const starts: number[] = [];
  let cursor = bucketStart(min, s);
  while (cursor <= max && starts.length < 400) {
    starts.push(cursor);
    cursor = nextBucket(cursor, s);
  }
  const sliceOf = new Int32Array(time.length).fill(-1);
  for (let i = 0; i < time.length; i++) {
    const t = time[i];
    if (!Number.isFinite(t)) continue;
    // binary search
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    sliceOf[i] = lo;
  }
  // the last bucket counts as complete only if the data reaches (almost) its end
  const lastStart = starts[starts.length - 1];
  const partialLast = (max - lastStart) / (nextBucket(lastStart, s) - lastStart) < 0.97;
  return { step: s, starts, sliceOf, partialLast };
}

export function formatSlice(t: number, step: Exclude<TimeStep, 'auto'>): string {
  const d = new Date(t);
  const mon = d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
  switch (step) {
    case 'hour':
      return `${d.getUTCDate()} ${mon} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
    case 'day':
    case 'week':
      return `${d.getUTCDate()} ${mon} ${d.getUTCFullYear()}`;
    case 'month':
      return `${mon} ${d.getUTCFullYear()}`;
    case 'quarter':
      return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
    case 'year':
      return String(d.getUTCFullYear());
  }
}

/* ---------------- trends per cell ---------------- */

export type TrendClass = 'rising-hot' | 'persistent-hot' | 'falling-hot' | 'rising' | 'falling' | 'steady' | 'cold';

export const TREND_LABELS: Record<TrendClass, string> = {
  'rising-hot': 'Hot spot, rising',
  'persistent-hot': 'Hot spot, consistently high',
  'falling-hot': 'Hot spot, easing',
  rising: 'Rising, not yet a hot spot',
  falling: 'Falling',
  steady: 'No significant change',
  cold: 'Cold spot',
};

export type EmergingClass =
  | 'new'
  | 'consecutive'
  | 'intensifying'
  | 'persistent'
  | 'diminishing'
  | 'sporadic'
  | 'oscillating'
  | 'historical'
  | 'none';

export const EMERGING_LABELS: Record<EmergingClass, string> = {
  new: 'New hot spot',
  consecutive: 'Consecutive hot spot',
  intensifying: 'Intensifying hot spot',
  persistent: 'Persistent hot spot',
  diminishing: 'Diminishing hot spot',
  sporadic: 'Sporadic hot spot',
  oscillating: 'Oscillating hot spot',
  historical: 'Historical hot spot',
  none: 'No pattern detected',
};

export interface CellTrend {
  id: string;
  series: number[];
  mk: MannKendall;
  overall: GiBin;
  trend: TrendClass;
  emerging: EmergingClass;
  hotShare: number;
}

/**
 * Per-cell space-time analysis. `seriesByCell` holds counts per time slice for
 * every cell in `area`. Overall Gi* uses totals; each slice also gets its own
 * Gi* so the emerging categories (after Esri's Emerging Hot Spot Analysis)
 * can be assigned from the run of significant slices.
 */
export function analyseTrends(
  seriesByCell: Map<string, number[]>,
  area: string[],
  slices: number,
  rings: number,
  fdr: boolean,
): Map<string, CellTrend> {
  const totals = new Map<string, number>();
  for (const id of area) totals.set(id, (seriesByCell.get(id) ?? []).reduce((a, b) => a + b, 0));
  const overall = getisOrd(totals, area, rings, fdr);

  const perSlice: GiBin[][] = [];
  for (let t = 0; t < slices; t++) {
    const m = new Map<string, number>();
    for (const id of area) m.set(id, seriesByCell.get(id)?.[t] ?? 0);
    const g = getisOrd(m, area, rings, fdr);
    perSlice.push(area.map((id) => g.results.get(id)?.bin ?? 0));
  }

  const out = new Map<string, CellTrend>();
  area.forEach((id, idx) => {
    const series = seriesByCell.get(id) ?? new Array(slices).fill(0);
    const mk = mannKendall(series);
    const bin = overall.results.get(id)?.bin ?? 0;
    const hotFlags = perSlice.map((s) => s[idx] > 0);
    const coldFlags = perSlice.map((s) => s[idx] < 0);
    const hotCount = hotFlags.filter(Boolean).length;
    const hotShare = slices ? hotCount / slices : 0;

    let trend: TrendClass;
    if (bin > 0) trend = mk.direction === 'up' ? 'rising-hot' : mk.direction === 'down' ? 'falling-hot' : 'persistent-hot';
    else if (bin < 0) trend = 'cold';
    else trend = mk.direction === 'up' ? 'rising' : mk.direction === 'down' ? 'falling' : 'steady';

    let emerging: EmergingClass = 'none';
    const last = hotFlags[slices - 1];
    const anyCold = coldFlags.some(Boolean);
    if (bin > 0 || hotCount > 0) {
      if (last && hotCount === 1) emerging = 'new';
      else if (!last && hotShare >= 0.9) emerging = 'historical';
      else if (hotShare >= 0.9 && mk.direction === 'up') emerging = 'intensifying';
      else if (hotShare >= 0.9 && mk.direction === 'down') emerging = 'diminishing';
      else if (hotShare >= 0.9) emerging = 'persistent';
      else if (last) {
        let run = 0;
        for (let t = slices - 1; t >= 0 && hotFlags[t]; t--) run++;
        if (run === hotCount && run >= 2) emerging = 'consecutive';
        else emerging = anyCold ? 'oscillating' : 'sporadic';
      }
    }
    out.set(id, { id, series, mk, overall: bin, trend, emerging, hotShare });
  });
  return out;
}
