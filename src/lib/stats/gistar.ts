import { gridDisk } from 'h3-js';

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export function twoTailedP(z: number): number {
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
}

/** -3..3 : cold 99/95/90, not significant, hot 90/95/99 */
export type GiBin = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export interface GiResult {
  id: string;
  value: number;
  z: number;
  p: number;
  bin: GiBin;
  neighbours: number;
}

export interface GiSummary {
  results: Map<string, GiResult>;
  n: number;
  mean: number;
  sd: number;
  hot: number;
  cold: number;
  fdr: boolean;
  /** p-value thresholds actually applied for 90/95/99 after FDR */
  thresholds: [number, number, number];
}

/**
 * Getis-Ord Gi* over an H3 study area with binary k-ring weights (the cell
 * itself included, which is what puts the star in Gi*).
 */
export function getisOrd(values: Map<string, number>, area: string[], rings = 1, fdr = true): GiSummary {
  const n = area.length;
  const x = area.map((id) => values.get(id) ?? 0);
  const mean = x.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const sd = Math.sqrt(Math.max(0, x.reduce((a, b) => a + b * b, 0) / Math.max(1, n) - mean * mean));
  const index = new Map(area.map((id, i) => [id, i]));
  const raw: { id: string; value: number; z: number; p: number; w: number }[] = [];

  for (let i = 0; i < n; i++) {
    const nbrs = gridDisk(area[i], rings);
    let sumWx = 0;
    let w = 0;
    for (const nb of nbrs) {
      const j = index.get(nb);
      if (j === undefined) continue;
      sumWx += x[j];
      w++;
    }
    const denom = sd * Math.sqrt((n * w - w * w) / Math.max(1, n - 1));
    const z = denom > 0 ? (sumWx - mean * w) / denom : 0;
    raw.push({ id: area[i], value: x[i], z, p: twoTailedP(z), w });
  }

  const alphas: [number, number, number] = [0.1, 0.05, 0.01];
  let thresholds: [number, number, number] = [...alphas];
  if (fdr && n > 0) {
    // Benjamini–Hochberg: largest p(k) with p(k) <= k/n * alpha
    const ps = raw.map((r) => r.p).sort((a, b) => a - b);
    thresholds = alphas.map((a) => {
      let crit = 0;
      for (let k = 0; k < ps.length; k++) if (ps[k] <= ((k + 1) / ps.length) * a) crit = ps[k];
      return crit;
    }) as [number, number, number];
  }

  const results = new Map<string, GiResult>();
  let hot = 0;
  let cold = 0;
  for (const r of raw) {
    let level = 0;
    if (r.p <= thresholds[2] && thresholds[2] > 0) level = 3;
    else if (r.p <= thresholds[1] && thresholds[1] > 0) level = 2;
    else if (r.p <= thresholds[0] && thresholds[0] > 0) level = 1;
    const bin = (r.z > 0 ? level : -level) as GiBin;
    if (bin > 0) hot++;
    if (bin < 0) cold++;
    results.set(r.id, { id: r.id, value: r.value, z: r.z, p: r.p, bin, neighbours: r.w });
  }
  return { results, n, mean, sd, hot, cold, fdr, thresholds };
}

export const GI_LABELS: Record<GiBin, string> = {
  3: 'Hot spot, 99% confidence',
  2: 'Hot spot, 95% confidence',
  1: 'Hot spot, 90% confidence',
  0: 'Not significant',
  [-1]: 'Cold spot, 90% confidence',
  [-2]: 'Cold spot, 95% confidence',
  [-3]: 'Cold spot, 99% confidence',
} as Record<GiBin, string>;
