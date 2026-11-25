import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../map/setup';
import { loadBasemap } from '../map/basemap';
import { PointsOverlay } from '../map/pointsOverlay';
import { useStore, type Stake } from '../state/store';
import { useScene } from './useScene';
import { cellSeries, giStar, grid, resolutionFor, slices, trends } from '../lib/compute';
import { GI_LABELS } from '../lib/stats/gistar';
import { EMERGING_LABELS, TREND_LABELS, formatSlice } from '../lib/stats/trend';
import { cellToLatLng } from 'h3-js';
import { niceNumber } from '../lib/stats/classify';
import { sparkPath } from '../charts/spark';
import { Legend } from './Legend';

export const mapRef: { current: MlMap | null; overlay: PointsOverlay | null } = { current: null, overlay: null };

const HEX_SRC = 'ww-hex';
const HEAT_SRC = 'ww-heat';

function ensureLayers(map: MlMap) {
  if (!map.getSource(HEX_SRC)) map.addSource(HEX_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  if (!map.getSource(HEAT_SRC)) map.addSource(HEAT_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  const before = map.getStyle().layers.find((l: { type: string }) => l.type === 'symbol')?.id;
  if (!map.getLayer('ww-heat'))
    map.addLayer(
      {
        id: 'ww-heat',
        type: 'heatmap',
        source: HEAT_SRC,
        paint: {
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 8, 14, 13, 26],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 2, 0.6, 12, 1.6],
          'heatmap-opacity': 0.85,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(255,243,196,0)', 0.12, 'rgba(253,211,122,0.55)', 0.3, '#f8a54b', 0.5, '#ea7041', 0.7, '#c9433f', 0.88, '#93263e', 1, '#5a1736',
          ],
        },
      },
      before,
    );
  if (!map.getLayer('ww-hex-fill'))
    map.addLayer({ id: 'ww-hex-fill', type: 'fill', source: HEX_SRC, paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.82 } }, before);
  if (!map.getLayer('ww-hex-line'))
    map.addLayer({ id: 'ww-hex-line', type: 'line', source: HEX_SRC, paint: { 'line-color': 'rgba(20,24,29,0.22)', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.2, 10, 0.7] } }, before);
  if (!map.getLayer('ww-hex-3d'))
    map.addLayer({
      id: 'ww-hex-3d',
      type: 'fill-extrusion',
      source: HEX_SRC,
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-base': ['coalesce', ['get', 'base'], 0],
        'fill-extrusion-height': ['coalesce', ['get', 'top'], 0],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    });
}

function setVisibility(map: MlMap, mode: string) {
  const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  vis('ww-heat', mode === 'heat');
  vis('ww-hex-fill', mode === 'hex');
  vis('ww-hex-line', mode === 'hex');
  vis('ww-hex-3d', mode === 'extrude' || mode === 'cube');
}

export function MapView() {
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const ds = useStore((s) => s.ds);
  const station = useStore((s) => s.station);
  const labels = useStore((s) => s.labels);
  const relief = useStore((s) => s.relief);
  const stakes = useStore((s) => s.stakes);
  const scene = useScene();
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const markers = useRef(new Map<string, maplibregl.Marker>());
  const popup = useRef<maplibregl.Popup | null>(null);

  // create the map once
  useEffect(() => {
    let disposed = false;
    let map: MlMap | null = null;
    loadBasemap().then((style) => {
      if (disposed || !el.current) return;
      try {
        map = new maplibregl.Map({
          container: el.current,
          style,
          center: [0, 20],
          zoom: 1.6,
          attributionControl: { compact: true },
          canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
          dragRotate: false,
          pitchWithRotate: false,
          maxPitch: 75,
        });
      } catch (e) {
        setMapError(e instanceof Error && /webgl/i.test(e.message) ? 'This browser cannot draw WebGL maps. Turn on hardware acceleration, or try Chrome, Edge, Firefox or Safari.' : 'The map could not start.');
        return;
      }
      const m = map;
      m.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showCompass: true }), 'top-right');
      m.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 120 }), 'bottom-right');
      m.touchZoomRotate.disableRotation();
      const overlay = new PointsOverlay(m, m.getCanvasContainer());
      overlay.onOverlap = (o) => useStore.getState().setOverlap(o);
      mapRef.current = m;
      mapRef.overlay = overlay;
      m.on('load', () => {
        ensureLayers(m);
        setReady(true);
      });
      m.on('error', (e) => {
        // tile hiccups are not fatal; keep the console quiet in production
        if (import.meta.env.DEV) console.warn(e.error);
      });
    });
    return () => {
      disposed = true;
      mapRef.overlay?.destroy();
      map?.remove();
      mapRef.current = null;
      mapRef.overlay = null;
    };
  }, []);

  // fit to new data
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !ds) return;
    mapRef.overlay?.setData(ds);
    const [w, s, e, n] = ds.bbox;
    const global = e - w > 300;
    if (global) {
      // centre on where the events are (circular mean of longitudes), not on Greenwich
      let sx = 0, sy = 0;
      for (let i = 0; i < ds.n; i += Math.max(1, Math.floor(ds.n / 5000))) { sx += Math.cos((ds.lon[i] * Math.PI) / 180); sy += Math.sin((ds.lon[i] * Math.PI) / 180); }
      const lng = (Math.atan2(sy, sx) * 180) / Math.PI;
      map.jumpTo({ center: [lng, 25], zoom: map.getContainer().clientWidth < 700 ? 0.6 : 1.4 });
    }
    else map.fitBounds([[w, s], [e, n]], { padding: 48, duration: 0, maxZoom: 14 });
    const heat = map.getSource(HEAT_SRC) as GeoJSONSource;
    const step = Math.max(1, Math.floor(ds.n / 60000));
    const feats = [];
    for (let i = 0; i < ds.n; i += step) feats.push({ type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [ds.lon[i], ds.lat[i]] } });
    heat.setData({ type: 'FeatureCollection', features: feats });
  }, [ds, ready]);

  // apply scene
  useEffect(() => {
    const map = mapRef.current;
    const overlay = mapRef.overlay;
    if (!map || !ready || !overlay) return;
    setVisibility(map, scene.mode);
    overlay.setVisible(scene.mode === 'points');
    if (scene.points) overlay.setStyle(scene.points);
    const src = map.getSource(HEX_SRC) as GeoJSONSource;
    src.setData(scene.hex?.fc ?? { type: 'FeatureCollection', features: [] });
  }, [scene, ready]);

  useEffect(() => {
    if (mapRef.overlay) mapRef.overlay.setLabels(labels);
  }, [labels, ready]);

  // 3D camera
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const threeD = station === 'relief' && relief.view !== 'flat';
    if (threeD) {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.easeTo({ pitch: relief.pitch, bearing: map.getBearing() || -18, duration: 900 });
    } else {
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      if (map.getPitch() !== 0 || map.getBearing() !== 0) map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  }, [station, relief.view, relief.pitch, ready]);

  // clicks: points -> attributes, hexes -> a stake with statistics
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const st = useStore.getState();
      const d = st.ds;
      if (!d) return;
      const sc = sceneRef.current;
      if (sc.mode === 'points' && mapRef.overlay) {
        const i = mapRef.overlay.hit(e.point.x, e.point.y);
        popup.current?.remove();
        if (i === null) return;
        const row = d.rows[i];
        const keys = d.fields.filter((f) => f.kind !== 'latitude' && f.kind !== 'longitude').slice(0, 9);
        const html = `<div class="pop"><div class="pop-title">${escapeHtml(String(row[keys.find((k) => k.kind === 'qualitative')?.name ?? keys[0]?.name] ?? 'Event'))}</div><dl>${keys
          .map((f) => `<dt>${escapeHtml(f.name.replace(/_/g, ' '))}</dt><dd class="${f.kind === 'quantitative' ? 'num' : ''}">${escapeHtml(String(row[f.name] ?? '–'))}</dd>`)
          .join('')}</dl><div class="pop-coord mono">${d.lat[i].toFixed(5)}, ${d.lon[i].toFixed(5)}</div></div>`;
        popup.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px', className: 'ww-popup' }).setLngLat([d.lon[i], d.lat[i]]).setHTML(html).addTo(map);
        return;
      }
      if (sc.mode === 'hex' || sc.mode === 'extrude' || sc.mode === 'cube') {
        const f = map.queryRenderedFeatures(e.point, { layers: sc.mode === 'hex' ? ['ww-hex-fill'] : ['ww-hex-3d'] })[0];
        if (!f) return;
        const id = String(f.properties?.id);
        st.addStake(buildStake(id));
        st.setRailTab('notes');
      }
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const sc = sceneRef.current;
      let hover = false;
      if (sc.mode === 'points' && mapRef.overlay) hover = mapRef.overlay.hit(e.point.x, e.point.y, 2) !== null;
      else if (sc.mode === 'hex' || sc.mode === 'extrude' || sc.mode === 'cube')
        hover = map.queryRenderedFeatures(e.point, { layers: sc.mode === 'hex' ? ['ww-hex-fill'] : ['ww-hex-3d'] }).length > 0;
      map.getCanvas().style.cursor = hover ? 'pointer' : '';
    };
    map.on('click', onClick);
    map.on('mousemove', onMove);
    return () => {
      map.off('click', onClick);
      map.off('mousemove', onMove);
    };
  }, [ready]);

  // stakes as markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const keep = new Set(stakes.map((s) => s.id));
    for (const [id, m] of markers.current) if (!keep.has(id)) { m.remove(); markers.current.delete(id); }
    for (const s of stakes) {
      if (markers.current.has(s.id)) continue;
      const node = document.createElement('div');
      node.className = `stake stake--${s.tone}`;
      node.innerHTML = `<span class="stake-pin"></span><span class="stake-tape">${escapeHtml(s.title)}</span>`;
      node.title = [s.title, ...s.lines].join('\n');
      const m = new maplibregl.Marker({ element: node, anchor: 'bottom-left' }).setLngLat([s.lng, s.lat]).addTo(map);
      markers.current.set(s.id, m);
    }
  }, [stakes, ready]);

  useEffect(() => {
    if (!ds) for (const m of markers.current.values()) m.remove();
    if (!ds) markers.current.clear();
  }, [ds]);

  return (
    <div className="mapframe">
      <div ref={el} className="map" role="region" aria-label="Map of the dataset" />
      {mapError && (
        <div className="map-error" role="alert">
          <strong>Map unavailable</strong>
          <p>{mapError}</p>
        </div>
      )}
      {scene.frameLabel && <div className="frame-label num" aria-live="polite">{scene.frameLabel}</div>}
      {ds && scene.mode !== 'multiples' && <Legend scene={scene} />}
    </div>
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Collect everything known about one hexagon into a field note. */
export function buildStake(id: string): Stake {
  const st = useStore.getState();
  const d = st.ds!;
  const res = sceneRes();
  const [lat, lng] = cellToLatLng(id);
  const g = grid(d, res, st.analysis.weightField, st.selection);
  const bin = g.cells.get(id);
  const lines: string[] = [];
  let tone: Stake['tone'] = 'neutral';
  let title = `${(bin?.count ?? 0).toLocaleString('en-GB')} events here`;
  const { gi } = giStar(d, res, st.analysis.neighbourRings, st.analysis.fdr, st.analysis.weightField, st.selection);
  const r = gi.results.get(id);
  if (r) {
    lines.push(`Gi* z = ${r.z.toFixed(2)}, ${r.p < 0.001 ? 'p < 0.001' : 'p = ' + r.p.toFixed(3)}`);
    lines.push(GI_LABELS[r.bin]);
    if (r.bin > 0) { tone = 'hot'; title = `${GI_LABELS[r.bin].replace('Hot spot, ', 'Hot ')}`; }
    if (r.bin < 0) { tone = 'cold'; title = `${GI_LABELS[r.bin].replace('Cold spot, ', 'Cold ')}`; }
  }
  if (tone !== 'neutral') lines.unshift(`${(bin?.count ?? 0).toLocaleString('en-GB')} events in this hexagon`);
  let series: number[] | undefined;
  const tr = d.timeField ? trends(d, res, st.time.step, st.analysis.neighbourRings, st.analysis.fdr, st.selection) : null;
  if (tr) {
    const t = tr.trends.get(id);
    if (t) {
      series = t.series;
      lines.push(`${TREND_LABELS[t.trend]}; ${EMERGING_LABELS[t.emerging].toLowerCase()}`);
      lines.push(`Sen's slope ${t.mk.slope >= 0 ? '+' : ''}${niceNumber(t.mk.slope)} per ${tr.slices.step}, Mann-Kendall p = ${t.mk.p.toFixed(3)}`);
      const sl = slices(d, st.time.step);
      if (sl) lines.push(`${formatSlice(sl.starts[0], sl.step)} to ${formatSlice(sl.starts[tr.slices.starts.length - 1], sl.step)}`);
    }
  } else {
    const ser = cellSeries(d, res, st.time.step, st.selection)?.get(id);
    if (ser) series = ser;
  }
  if (bin && st.sym.field) {
    const counts = new Map<string, number>();
    for (const i of bin.members) {
      const v = String(d.rows[i][st.sym.field] ?? '').trim();
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 2);
    if (top.length && d.fields.find((f) => f.name === st.sym.field)?.kind === 'qualitative')
      lines.push(`Mostly ${top.map(([k, v]) => `${k} (${v})`).join(', ')}`);
  }
  lines.push(`${lat.toFixed(4)}°, ${lng.toFixed(4)}°`);
  return { id, lat, lng, title, lines, series, tone };
}

function sceneRes(): number {
  const st = useStore.getState();
  return resolutionFor(st.ds!, st.analysis.resolution);
}

export { sparkPath };
