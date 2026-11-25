import type { FeatureCollection, Polygon } from 'geojson';
import { hexPolygon, type HexGrid } from '../lib/stats/hex';
import { GI_LABELS, type GiBin, type GiSummary } from '../lib/stats/gistar';
import { EMERGING_LABELS, TREND_LABELS, type CellTrend, type EmergingClass, type TrendClass } from '../lib/stats/trend';
import { classBreaks, classOf } from '../lib/stats/classify';
import { DIVERGING_HOTCOLD, rampById, sampleRamp } from '../lib/palettes';

export interface LegendItem {
  label: string;
  color: string;
  count?: number;
  pattern?: 'outline';
}

export interface HexLayerData {
  fc: FeatureCollection<Polygon>;
  legend: LegendItem[];
  title: string;
  note?: string;
}

export const GI_COLORS: Record<GiBin, string> = {
  3: DIVERGING_HOTCOLD.hot3,
  2: DIVERGING_HOTCOLD.hot2,
  1: DIVERGING_HOTCOLD.hot1,
  0: DIVERGING_HOTCOLD.none,
  [-1]: DIVERGING_HOTCOLD.cold1,
  [-2]: DIVERGING_HOTCOLD.cold2,
  [-3]: DIVERGING_HOTCOLD.cold3,
} as Record<GiBin, string>;

export const TREND_COLORS: Record<TrendClass, string> = {
  'rising-hot': '#9e1238',
  'persistent-hot': '#e0533f',
  'falling-hot': '#f2a48c',
  rising: '#e9a21a',
  falling: '#5f8fbb',
  steady: '#e6e3dc',
  cold: '#2c5e8f',
};

export const EMERGING_COLORS: Record<EmergingClass, string> = {
  new: '#ffd400',
  consecutive: '#f5a623',
  intensifying: '#9e1238',
  persistent: '#d8404a',
  diminishing: '#f3a3a0',
  sporadic: '#c47ad8',
  oscillating: '#7d4aa6',
  historical: '#8a8f93',
  none: '#e6e3dc',
};

function poly(id: string, props: Record<string, unknown>) {
  return { type: 'Feature' as const, id: undefined, properties: { id, ...props }, geometry: { type: 'Polygon' as const, coordinates: [hexPolygon(id)] } };
}

/** Hexagon counts, classed with natural breaks. Equal-area cells make raw counts comparable. */
export function countLayer(grid: HexGrid, rampId: string, classes = 5): HexLayerData {
  const values = [...grid.cells.values()].map((b) => b.value);
  const breaks = classBreaks(values, classes, 'natural');
  const ramp = sampleRamp(rampById(rampId).stops, breaks.length);
  const counts = new Array(breaks.length).fill(0);
  const features = [...grid.cells.values()].map((b) => {
    const k = classOf(b.value, breaks);
    counts[k]++;
    return poly(b.id, { value: b.value, count: b.count, color: ramp[k], k });
  });
  const fmt = (x: number) => (x >= 100 ? Math.round(x).toLocaleString('en-GB') : String(Math.round(x * 10) / 10));
  const legend = breaks.map((b, k) => ({ label: `${fmt(k === 0 ? Math.min(...values) : breaks[k - 1] + (Number.isInteger(breaks[k - 1]) ? 1 : 0))} – ${fmt(b)}`, color: ramp[k], count: counts[k] }));
  return {
    fc: { type: 'FeatureCollection', features },
    legend,
    title: 'Events per hexagon',
    note: `Hexagons ${grid.edgeKm < 1 ? Math.round(grid.edgeKm * 1000) + ' m' : grid.edgeKm.toFixed(1) + ' km'} across each edge, equal in area, so counts compare fairly.`,
  };
}

export function giLayer(gi: GiSummary, area: string[]): HexLayerData {
  const counts: Record<string, number> = {};
  const features = area.map((id) => {
    const r = gi.results.get(id)!;
    counts[r.bin] = (counts[r.bin] ?? 0) + 1;
    return poly(id, { value: r.value, z: Math.round(r.z * 100) / 100, p: r.p, bin: r.bin, color: GI_COLORS[r.bin] });
  });
  const bins: GiBin[] = [3, 2, 1, 0, -1, -2, -3];
  return {
    fc: { type: 'FeatureCollection', features },
    legend: bins.map((b) => ({ label: GI_LABELS[b], color: GI_COLORS[b], count: counts[b] ?? 0 })),
    title: 'Hot spot analysis (Getis-Ord Gi*)',
    note: gi.fdr ? 'Corrected for false discovery across all hexagons.' : 'No false discovery correction.',
  };
}

export function trendLayer(trends: Map<string, CellTrend>, mode: 'trend' | 'emerging'): HexLayerData {
  const counts: Record<string, number> = {};
  const features = [...trends.values()]
    .filter((t) => t.series.some((v) => v > 0) || t.overall !== 0)
    .map((t) => {
      const cls = mode === 'trend' ? t.trend : t.emerging;
      counts[cls] = (counts[cls] ?? 0) + 1;
      const color = mode === 'trend' ? TREND_COLORS[t.trend] : EMERGING_COLORS[t.emerging];
      return poly(t.id, { cls, color, total: t.series.reduce((a, b) => a + b, 0), slope: Math.round(t.mk.slope * 100) / 100, p: t.mk.p, z: t.mk.z });
    });
  const order = mode === 'trend' ? (Object.keys(TREND_LABELS) as TrendClass[]) : (Object.keys(EMERGING_LABELS) as EmergingClass[]);
  const legend = order
    .filter((k) => counts[k])
    .map((k) => ({
      label: mode === 'trend' ? TREND_LABELS[k as TrendClass] : EMERGING_LABELS[k as EmergingClass],
      color: mode === 'trend' ? TREND_COLORS[k as TrendClass] : EMERGING_COLORS[k as EmergingClass],
      count: counts[k],
    }));
  return {
    fc: { type: 'FeatureCollection', features },
    legend,
    title: mode === 'trend' ? 'Where it is rising, falling or staying high' : 'Emerging hot spots',
    note: 'Mann-Kendall trend test per hexagon, combined with Gi* hot spots.',
  };
}

/** One box per hexagon per time slice, stacked upward: time becomes height. */
export function cubeLayer(
  series: Map<string, number[]>,
  trends: Map<string, CellTrend> | null,
  edgeKm: number,
  exaggeration: number,
  colorBy: 'count' | 'emerging',
  limitCells = 450,
): HexLayerData & { sliceHeight: number } {
  const cells = [...series.entries()].map(([id, s]) => ({ id, s, total: s.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total).slice(0, limitCells);
  const all = cells.flatMap((c) => c.s).filter((v) => v > 0);
  const breaks = classBreaks(all, 5, 'natural');
  const ramp = sampleRamp(rampById('ember').stops, breaks.length);
  const sliceHeight = edgeKm * 1000 * 0.55 * exaggeration;
  const features = [];
  const present = new Map<EmergingClass, number>();
  for (const c of cells) {
    const em = trends?.get(c.id)?.emerging ?? 'none';
    present.set(em, (present.get(em) ?? 0) + 1);
    for (let t = 0; t < c.s.length; t++) {
      const v = c.s[t];
      if (v <= 0) continue;
      const color = colorBy === 'emerging' ? (em === 'none' ? '#d3d7d2' : EMERGING_COLORS[em]) : ramp[classOf(v, breaks)];
      features.push(poly(c.id, { t, v, base: t * sliceHeight, top: (t + 1) * sliceHeight - sliceHeight * 0.18, color }));
    }
  }
  const legend =
    colorBy === 'emerging'
      ? (Object.keys(EMERGING_COLORS) as EmergingClass[])
          .filter((k) => present.has(k))
          .map((k) => ({ label: k === 'none' ? 'No hot spot pattern' : EMERGING_LABELS[k], color: k === 'none' ? '#d3d7d2' : EMERGING_COLORS[k], count: present.get(k) }))
      : breaks.map((b, k) => ({ label: `≤ ${Math.round(b)} events in the period`, color: ramp[k] }));
  return {
    fc: { type: 'FeatureCollection', features },
    legend,
    title: 'Space-time cube',
    note: 'Each layer of boxes is one time period, oldest at the bottom. Empty periods leave a gap.',
    sliceHeight,
  };
}

export function extrudeLayer(base: HexLayerData, edgeKm: number, exaggeration: number): HexLayerData {
  const max = Math.max(1, ...base.fc.features.map((f) => Number((f.properties as { value?: number }).value ?? 0)));
  const top = edgeKm * 1000 * 14 * exaggeration;
  return {
    ...base,
    fc: {
      type: 'FeatureCollection',
      features: base.fc.features.map((f) => ({
        ...f,
        properties: { ...f.properties, base: 0, top: Math.max(top * 0.004, (Number((f.properties as { value?: number }).value ?? 0) / max) * top) },
      })),
    },
    note: `${base.note ?? ''} Height is proportional to the count.`.trim(),
  };
}
