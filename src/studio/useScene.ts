import { useMemo } from 'react';
import { useStore } from '../state/store';
import { cellSeries, colorScheme, giStar, grid, resolutionFor, selectedRows, sizeScale, slices, timeExtent, trends } from '../lib/compute';
import { countLayer, cubeLayer, extrudeLayer, giLayer, trendLayer, type HexLayerData, type LegendItem } from '../map/layers';
import type { PointStyle } from '../map/pointsOverlay';
import { formatSlice } from '../lib/stats/trend';

export type SceneMode = 'points' | 'heat' | 'hex' | 'extrude' | 'cube' | 'multiples' | 'none';

export interface Scene {
  mode: SceneMode;
  hex: HexLayerData | null;
  points: PointStyle | null;
  legend: { title: string; items: LegendItem[]; note?: string; sizes?: { label: string; r: number }[] };
  frameLabel: string | null;
  resolution: number;
  edgeKm: number;
  giCells?: { cells: number; hot: number; cold: number };
  sliceCount?: number;
  sliceHeight?: number;
}

export function useScene(): Scene {
  const ds = useStore((s) => s.ds);
  const station = useStore((s) => s.station);
  const sym = useStore((s) => s.sym);
  const analysis = useStore((s) => s.analysis);
  const time = useStore((s) => s.time);
  const relief = useStore((s) => s.relief);
  const selection = useStore((s) => s.selection);

  return useMemo<Scene>(() => {
    const empty: Scene = { mode: 'none', hex: null, points: null, legend: { title: '', items: [] }, frameLabel: null, resolution: 0, edgeKm: 0 };
    if (!ds) return empty;
    const res = resolutionFor(ds, analysis.resolution);
    const sel = selection;
    const subset = selectedRows(ds, sel);
    const g = grid(ds, res, analysis.weightField, sel);

    const scheme = colorScheme(ds, sym);
    const sizes = sizeScale(ds, sym);
    const ext = timeExtent(ds);
    const fade = sym.fadeByRecency && ext && ext[1] > ext[0]
      ? (i: number) => {
          const t = ds.time[i];
          return Number.isFinite(t) ? 0.25 + 0.75 * ((t - ext[0]) / (ext[1] - ext[0])) : 0.25;
        }
      : null;
    const basePoints = (rows: Uint32Array | null, highlight: Uint8Array | null): PointStyle => ({
      colorOf: scheme.colorOf,
      radiusOf: sizes ? sizes.radiusOf : () => sym.size,
      opacity: sym.opacity,
      alphaOf: fade,
      featureBlend: sym.featureBlend,
      layerBlend: sym.layerBlend,
      outline: !!sizes,
      subset: rows,
      highlight,
    });
    const highlight = subset ? (() => { const m = new Uint8Array(ds.n); for (const i of subset) m[i] = 1; return m; })() : null;
    const pointLegend = {
      title: sym.kind === 'single' ? 'Events' : (sym.kind === 'multivariate' ? sym.colorField : sym.field) ?? 'Events',
      items: scheme.legend,
      sizes: sizes?.legend,
      note: fade ? 'Faded symbols are older; solid symbols are recent.' : undefined,
    };

    // ---- time station ----
    if (station === 'time' && ds.timeField) {
      const sl = slices(ds, time.step);
      if (time.view === 'animate' && sl) {
        const frame = Math.min(time.frame, sl.starts.length - 1);
        const rows: number[] = [];
        for (let i = 0; i < ds.n; i++) if (sl.sliceOf[i] === frame && (!highlight || highlight[i])) rows.push(i);
        return {
          ...empty,
          mode: 'points',
          points: basePoints(Uint32Array.from(rows), null),
          legend: { ...pointLegend, note: `${rows.length.toLocaleString('en-GB')} events in this period.` },
          frameLabel: formatSlice(sl.starts[frame], sl.step),
          resolution: res,
          edgeKm: g.edgeKm,
          sliceCount: sl.starts.length,
        };
      }
      if (time.view === 'multiples') {
        return { ...empty, mode: 'multiples', legend: { title: 'Small multiples', items: [] }, resolution: res, edgeKm: g.edgeKm, sliceCount: sl?.starts.length };
      }
      const tr = trends(ds, res, time.step, analysis.neighbourRings, analysis.fdr, sel);
      if (tr) {
        const hex = trendLayer(tr.trends, time.view === 'emerging' ? 'emerging' : 'trend');
        return {
          ...empty,
          mode: 'hex',
          hex,
          legend: { title: hex.title, items: hex.legend, note: `${tr.slices.starts.length} ${tr.slices.step}ly periods. ${hex.note}` },
          resolution: res,
          edgeKm: g.edgeKm,
          sliceCount: tr.slices.starts.length,
        };
      }
    }

    // ---- relief station ----
    if (station === 'relief' && relief.view !== 'flat') {
      if (relief.view === 'cube' && ds.timeField) {
        const series = cellSeries(ds, res, time.step, sel);
        const tr = trends(ds, res, time.step, analysis.neighbourRings, analysis.fdr, sel);
        if (series) {
          const cube = cubeLayer(series, tr?.trends ?? null, g.edgeKm, relief.exaggeration, tr ? 'emerging' : 'count');
          return {
            ...empty,
            mode: 'cube',
            hex: cube,
            legend: { title: cube.title, items: cube.legend, note: cube.note },
            resolution: res,
            edgeKm: g.edgeKm,
            sliceHeight: cube.sliceHeight,
            sliceCount: slices(ds, time.step)?.starts.length,
          };
        }
      }
      const base = analysis.view === 'gistar' ? (() => { const { gi, area } = giStar(ds, res, analysis.neighbourRings, analysis.fdr, analysis.weightField, sel); return giLayer(gi, area); })() : countLayer(g, sym.ramp);
      // give Gi* cells their count as height
      if (analysis.view === 'gistar') {
        for (const f of base.fc.features) {
          const p = f.properties as { id: string; value: number };
          p.value = g.cells.get(p.id)?.value ?? 0;
        }
      }
      const ex = extrudeLayer(base, g.edgeKm, relief.exaggeration);
      return { ...empty, mode: 'extrude', hex: ex, legend: { title: ex.title, items: ex.legend, note: ex.note }, resolution: res, edgeKm: g.edgeKm };
    }

    // ---- analysis view everywhere else ----
    if (analysis.view === 'heat') {
      return { ...empty, mode: 'heat', legend: { title: 'Density of events (kernel heat map)', items: [], note: 'Brighter means more events nearby. Density, not significance.' }, resolution: res, edgeKm: g.edgeKm };
    }
    if (analysis.view === 'hex') {
      const hex = countLayer(g, sym.ramp);
      return { ...empty, mode: 'hex', hex, legend: { title: hex.title, items: hex.legend, note: hex.note }, resolution: res, edgeKm: g.edgeKm };
    }
    if (analysis.view === 'gistar') {
      const { gi, area } = giStar(ds, res, analysis.neighbourRings, analysis.fdr, analysis.weightField, sel);
      const hex = giLayer(gi, area);
      return {
        ...empty,
        mode: 'hex',
        hex,
        legend: { title: hex.title, items: hex.legend.filter((l) => l.count || l.label === 'Not significant'), note: hex.note },
        resolution: res,
        edgeKm: g.edgeKm,
        giCells: { cells: area.length, hot: gi.hot, cold: gi.cold },
      };
    }
    return { ...empty, mode: 'points', points: basePoints(null, highlight), legend: pointLegend, resolution: res, edgeKm: g.edgeKm };
  }, [ds, station, sym, analysis, time, relief, selection]);
}
