import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../map/setup';
import { cellToLatLng } from 'h3-js';
import { loadBasemap } from '../map/basemap';
import { loadSample, SAMPLES } from '../lib/data/load';
import { autoResolution, binHexes, studyArea } from '../lib/stats/hex';
import { getisOrd } from '../lib/stats/gistar';
import { giLayer } from '../map/layers';
import type { Dataset } from '../lib/types';
import { audit } from '../lib/honesty/audit';
import { defaultLabels, defaultSym } from '../state/store';

export interface PlateStats {
  dataset: string;
  n: number;
  hot: number;
  cold: number;
  cells: number;
  updated: string | null;
  live: boolean;
  score: number;
}

interface Flag {
  id: string;
  lng: number;
  lat: number;
  title: string;
  sub: string;
}

const US_STATES: Record<string, string> = { CA: 'California', NV: 'Nevada', AK: 'Alaska', HI: 'Hawaii', WA: 'Washington', OR: 'Oregon', UT: 'Utah', MT: 'Montana', ID: 'Idaho', WY: 'Wyoming', TX: 'Texas', OK: 'Oklahoma', NM: 'New Mexico', AZ: 'Arizona', PR: 'Puerto Rico', 'B.C.': 'British Columbia' };

/** Most common place phrase in a cell ("near Alaska" from "12 km SW of Sand Point, Alaska"). */
function placeOf(ds: Dataset, members: number[]): string {
  const field = ds.fields.find((f) => f.name === 'place' || f.name === 'borough' || f.name === 'Borough');
  if (!field) return '';
  const m = new Map<string, number>();
  for (const i of members) {
    let v = String(ds.rows[i][field.name] ?? '').trim();
    if (field.name === 'place') v = v.split(',').pop()!.trim().replace(/^.*\bof\s+/i, '');
    v = US_STATES[v] ?? v;
    if (v) m.set(v, (m.get(v) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function LivePlate({ onStats }: { onStats: (s: PlateStats) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const [flags, setFlags] = useState<(Flag & { x: number; y: number })[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  useEffect(() => {
    let map: maplibregl.Map | null = null;
    let disposed = false;
    const ctrl = new AbortController();
    let flagData: Flag[] = [];
    const place = () => {
      if (!map) return;
      const c = map.getCenter().lng;
      setFlags(flagData.map((f) => { const lng = f.lng + 360 * Math.round((c - f.lng) / 360); const p = map!.project([lng, f.lat]); return { ...f, x: p.x, y: p.y }; }));
    };

    (async () => {
      const style = await loadBasemap();
      if (disposed || !el.current) return;
      try {
        map = new maplibregl.Map({
          container: el.current,
          style,
          center: [150, 18],
          zoom: 1.05,
          interactive: true,
          scrollZoom: false,
          dragRotate: false,
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true },
        });
      } catch {
        setState('failed');
        return;
      }
      map.touchZoomRotate.disableRotation();
      map.on('move', place);
      await new Promise<void>((r) => map!.once('load', () => r()));

      let ds: Dataset;
      let live = true;
      try {
        ds = await loadSample(SAMPLES[1], ctrl.signal);
      } catch {
        live = false;
        ds = await loadSample(SAMPLES[0], ctrl.signal);
      }
      if (disposed) return;
      const res = Math.max(0, autoResolution(ds) + (live ? 1 : 0));
      const grid = binHexes(ds, res);
      const area = studyArea(grid, 1);
      const values = new Map([...grid.cells].map(([id, b]) => [id, b.value]));
      const gi = getisOrd(values, area, 1, true);
      const layer = giLayer(gi, area);
      layer.fc.features = layer.fc.features.filter((f) => (f.properties as { bin: number }).bin !== 0 || (grid.cells.get((f.properties as { id: string }).id)?.count ?? 0) > 0);
      map.addSource('plate', { type: 'geojson', data: layer.fc });
      const before = map.getStyle().layers.find((l: { type: string }) => l.type === 'symbol')?.id;
      map.addLayer({ id: 'plate-fill', type: 'fill', source: 'plate', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['==', ['get', 'bin'], 0], 0.55, 0.88] } }, before);
      map.addLayer({ id: 'plate-line', type: 'line', source: 'plate', paint: { 'line-color': 'rgba(20,24,29,0.25)', 'line-width': 0.4 } }, before);
      (map.getSource('plate') as GeoJSONSource).setData(layer.fc);
      if (!live) map.fitBounds([[ds.bbox[0], ds.bbox[1]], [ds.bbox[2], ds.bbox[3]]], { padding: 30, duration: 0 });

      // stake the three strongest, well-separated hot spots
      const hot = [...gi.results.values()].filter((r) => r.bin === 3).sort((a, b) => b.z - a.z);
      const picked: typeof hot = [];
      for (const h of hot) {
        const [la, lo] = cellToLatLng(h.id);
        if (picked.every((p) => { const [a, b] = cellToLatLng(p.id); return Math.hypot(a - la, b - lo) > (live ? 25 : 0.08); })) picked.push(h);
        if (picked.length === 3) break;
      }
      flagData = picked.map((h) => {
        const [lat, lng] = cellToLatLng(h.id);
        const members = grid.cells.get(h.id)?.members ?? [];
        const where = placeOf(ds, members);
        return { id: h.id, lat, lng, title: where || 'Hot spot', sub: `99% · z ${h.z.toFixed(1)} · ${members.length} events` };
      });
      // frame every significant hot spot on any screen size (flags sit up and to the right)
      if (live) {
        const hotIds = [...gi.results.values()].filter((r) => r.bin > 0).map((r) => r.id);
        if (hotIds.length) {
          const pts = hotIds.map((id) => cellToLatLng(id));
          const ref = pts[0][1];
          const lngs = pts.map(([, lo]) => lo + 360 * Math.round((ref - lo) / 360));
          const lats = pts.map(([la]) => la);
          const narrow = (el.current?.clientWidth ?? 800) < 560;
          map.fitBounds(
            [[Math.min(...lngs) - 8, Math.min(...lats) - 8], [Math.max(...lngs) + 8, Math.max(...lats) + 8]],
            { padding: narrow ? { top: 110, bottom: 40, left: 20, right: 70 } : { top: 130, bottom: 60, left: 60, right: 200 }, maxZoom: 4, duration: 0 },
          );
        }
      }
      place();
      setState('ready');
      const score = audit({ ds, sym: defaultSym, labels: defaultLabels, analysis: { view: 'gistar', resolution: res, neighbourRings: 1, fdr: true, weightField: null }, time: { view: 'trend', step: 'auto', lockBreaks: true, frame: 0, playing: false }, relief: { view: 'flat', exaggeration: 1, pitch: 0 }, deliver: { audience: 'public', purpose: 'explore', product: null, title: '', subtitle: '' }, station: 'test', overlap: 0, gi: { cells: area.length, hot: gi.hot, cold: gi.cold } }).score;
      onStats({
        score,
        dataset: live ? 'USGS earthquakes, past 30 days' : 'London Fire Brigade animal rescues',
        n: ds.n,
        hot: gi.hot,
        cold: gi.cold,
        cells: area.length,
        updated: ds.source.generatedAt ?? null,
        live,
      });
    })().catch(() => !disposed && setState('failed'));

    return () => {
      disposed = true;
      ctrl.abort();
      map?.remove();
    };
  }, [onStats]);

  return (
    <div className="plate-map">
      <div ref={el} className="plate-canvas" aria-label="Live hot spot map of recent earthquakes" role="img" />
      {flags.map((f, k) => (
        <div key={f.id} className="plate-flag" style={{ transform: `translate(${Math.round(f.x)}px, ${Math.round(f.y)}px)`, animationDelay: `${0.9 + k * 0.25}s` }}>
          <span className="stake-pin" />
          <span className="plate-flag-tape">
            <strong>{f.title}</strong>
            <span className="num">{f.sub}</span>
          </span>
        </div>
      ))}
      {state === 'loading' && <div className="plate-loading"><span className="plotting-line" />Surveying the latest records</div>}
      {state === 'failed' && <div className="plate-loading">The live map could not load here. The studio still works with your own files.</div>}
    </div>
  );
}
