import { cellToBoundary, getHexagonEdgeLengthAvg, gridDisk, latLngToCell, UNITS } from 'h3-js';
import type { Dataset } from '../types';

export interface HexBin {
  id: string;
  count: number;
  /** sum of the weight field (count when unweighted) */
  value: number;
  /** row indices in this cell */
  members: number[];
}

export interface HexGrid {
  resolution: number;
  edgeKm: number;
  cells: Map<string, HexBin>;
}

/**
 * Pick an H3 resolution that gives a readable number of occupied cells for
 * the data's extent: coarse enough to aggregate, fine enough to show structure.
 */
export function autoResolution(ds: Dataset): number {
  const [w, s, e, n] = ds.bbox;
  const midLat = (s + n) / 2;
  const widthKm = Math.max(1, (e - w) * 111.32 * Math.cos((midLat * Math.PI) / 180));
  const heightKm = Math.max(1, (n - s) * 110.57);
  const span = Math.max(widthKm, heightKm);
  // aim for ~45 cells across the longer side, capped by point count
  const targetEdge = span / 45 / 1.73;
  let best = 0;
  let bestDiff = Infinity;
  for (let r = 0; r <= 10; r++) {
    const edge = getHexagonEdgeLengthAvg(r, UNITS.km);
    const diff = Math.abs(Math.log(edge / targetEdge));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = r;
    }
  }
  // avoid near-empty grids: with few points, coarsen
  if (ds.n < 400) best = Math.max(0, best - 1);
  return best;
}

export function binHexes(ds: Dataset, resolution: number, weightField: string | null = null, subset?: ArrayLike<number>): HexGrid {
  const cells = new Map<string, HexBin>();
  const idx = subset ?? null;
  const len = idx ? idx.length : ds.n;
  for (let k = 0; k < len; k++) {
    const i = idx ? idx[k] : k;
    const id = latLngToCell(ds.lat[i], ds.lon[i], resolution);
    let bin = cells.get(id);
    if (!bin) {
      bin = { id, count: 0, value: 0, members: [] };
      cells.set(id, bin);
    }
    bin.count++;
    if (weightField) {
      const w = Number(ds.rows[i][weightField]);
      bin.value += Number.isFinite(w) ? w : 0;
    } else bin.value++;
    bin.members.push(i);
  }
  return { resolution, edgeKm: getHexagonEdgeLengthAvg(resolution, UNITS.km), cells };
}

/**
 * Analysis universe: every occupied cell plus empty cells within `rings` of
 * one. Empty cells matter — a cluster is only a cluster against its quiet
 * surroundings.
 */
export function studyArea(grid: HexGrid, rings = 1): string[] {
  const set = new Set<string>();
  for (const id of grid.cells.keys()) for (const nb of gridDisk(id, rings)) set.add(nb);
  return [...set];
}

export function hexPolygon(id: string): [number, number][] {
  const ring = cellToBoundary(id, true) as [number, number][];
  // close ring; fix antimeridian crossing so polygons don't streak across the map
  const lons = ring.map((p) => p[0]);
  if (Math.max(...lons) - Math.min(...lons) > 180) {
    for (const p of ring) if (p[0] < 0) p[0] += 360;
  }
  return [...ring, ring[0]];
}
