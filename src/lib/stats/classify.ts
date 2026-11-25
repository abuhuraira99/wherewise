import type { ClassMethod } from '../types';

/** Sorted finite copy, sampled evenly to at most `cap` values. */
export function sortedSample(values: ArrayLike<number>, cap = 4000): number[] {
  const finite: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) finite.push(values[i]);
  finite.sort((a, b) => a - b);
  if (finite.length <= cap) return finite;
  const out: number[] = [];
  for (let i = 0; i < cap; i++) out.push(finite[Math.floor((i * (finite.length - 1)) / (cap - 1))]);
  return out;
}

/**
 * Fisher-Jenks natural breaks on a sorted sample. Returns the k-1 interior
 * upper bounds plus the max, i.e. `k` upper class limits.
 */
export function jenks(sorted: number[], k: number): number[] {
  const n = sorted.length;
  if (n === 0) return [];
  const uniq = [...new Set(sorted)];
  if (uniq.length <= k) return uniq;
  const lower: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0));
  const vari: number[][] = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(Infinity));
  for (let j = 1; j <= k; j++) {
    lower[1][j] = 1;
    vari[1][j] = 0;
  }
  for (let l = 2; l <= n; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0;
    for (let m = 1; m <= l; m++) {
      const i3 = l - m + 1;
      const val = sorted[i3 - 1];
      s2 += val * val;
      s1 += val;
      w++;
      v = s2 - (s1 * s1) / w;
      const i4 = i3 - 1;
      if (i4 !== 0) {
        for (let j = 2; j <= k; j++) {
          if (vari[l][j] >= v + vari[i4][j - 1]) {
            lower[l][j] = i3;
            vari[l][j] = v + vari[i4][j - 1];
          }
        }
      }
    }
    lower[l][1] = 1;
    vari[l][1] = v;
  }
  const breaks = new Array(k).fill(0);
  breaks[k - 1] = sorted[n - 1];
  let kk = n;
  for (let j = k; j >= 2; j--) {
    const id = lower[kk][j] - 2;
    breaks[j - 2] = sorted[Math.max(0, id)];
    kk = lower[kk][j] - 1;
  }
  return breaks;
}

export function quantileBreaks(sorted: number[], k: number): number[] {
  if (!sorted.length) return [];
  const out: number[] = [];
  for (let i = 1; i <= k; i++) {
    const idx = Math.min(sorted.length - 1, Math.ceil((i / k) * sorted.length) - 1);
    out.push(sorted[idx]);
  }
  return [...new Set(out)];
}

export function equalBreaks(sorted: number[], k: number): number[] {
  if (!sorted.length) return [];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (hi === lo) return [hi];
  const step = (hi - lo) / k;
  return Array.from({ length: k }, (_, i) => (i === k - 1 ? hi : lo + step * (i + 1)));
}

/** Upper limits for `k` classes. */
export function classBreaks(values: ArrayLike<number>, k: number, method: ClassMethod): number[] {
  const sorted = sortedSample(values, method === 'natural' ? 1200 : 20000);
  if (method === 'quantile') return quantileBreaks(sorted, k);
  if (method === 'equal') return equalBreaks(sorted, k);
  return jenks(sorted, k);
}

/** Index of the class a value falls into, given upper limits. */
export function classOf(value: number, breaks: number[]): number {
  if (!Number.isFinite(value)) return -1;
  for (let i = 0; i < breaks.length; i++) if (value <= breaks[i]) return i;
  return breaks.length - 1;
}

/** Goodness of variance fit (0..1) — how well the breaks describe the data. */
export function gvf(values: ArrayLike<number>, breaks: number[]): number {
  const v = sortedSample(values, 20000);
  if (v.length < 2 || breaks.length < 2) return 1;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sdam = v.reduce((a, b) => a + (b - mean) ** 2, 0);
  if (sdam === 0) return 1;
  const groups: number[][] = breaks.map(() => []);
  for (const x of v) groups[classOf(x, breaks)].push(x);
  let sdcm = 0;
  for (const g of groups) {
    if (!g.length) continue;
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    sdcm += g.reduce((a, b) => a + (b - m) ** 2, 0);
  }
  return (sdam - sdcm) / sdam;
}

export function niceNumber(x: number): string {
  if (!Number.isFinite(x)) return '–';
  const a = Math.abs(x);
  if (a >= 1e6) return (x / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e4) return Math.round(x / 1e3) + 'k';
  if (a >= 100) return Math.round(x).toLocaleString('en-GB');
  if (a >= 10) return x.toFixed(1).replace(/\.0$/, '');
  if (a >= 1) return x.toFixed(2).replace(/\.?0+$/, '');
  if (a === 0) return '0';
  return x.toPrecision(2);
}
