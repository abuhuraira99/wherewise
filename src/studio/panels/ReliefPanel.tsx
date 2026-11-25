import { useRef, useState } from 'react';
import { Route } from 'lucide-react';
import { cellToLatLng } from 'h3-js';
import { useStore } from '../../state/store';
import { Group, Note, Section, Seg, Slider } from '../../ui/controls';
import type { ReliefView } from '../../lib/types';
import { mapRef } from '../MapView';
import { giStar, grid, resolutionFor } from '../../lib/compute';

interface Bookmark {
  name: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export function ReliefPanel() {
  const ds = useStore((s) => s.ds)!;
  const relief = useStore((s) => s.relief);
  const patch = useStore((s) => s.patchRelief);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const [touring, setTouring] = useState(false);
  const stop = useRef(false);

  const bookmarks = (): Bookmark[] => {
    const res = resolutionFor(ds, analysis.resolution);
    const g = grid(ds, res, analysis.weightField, selection);
    const top = [...g.cells.values()].sort((a, b) => b.value - a.value)[0];
    const [w, s, e, n] = ds.bbox;
    const span = Math.max(e - w, n - s);
    const baseZoom = Math.max(0.5, Math.min(13, Math.log2(360 / Math.max(0.01, span)) + 0.6));
    const out: Bookmark[] = [{ name: 'Overview', center: [(w + e) / 2, (s + n) / 2], zoom: baseZoom, pitch: 45, bearing: -15 }];
    if (top) {
      const [lat, lng] = cellToLatLng(top.id);
      out.push({ name: 'Tallest column', center: [lng, lat], zoom: Math.min(15, baseZoom + 2.4), pitch: 58, bearing: 25 });
    }
    const { gi } = giStar(ds, res, analysis.neighbourRings, analysis.fdr, analysis.weightField, selection);
    const hot = [...gi.results.values()].filter((r) => r.bin > 0).sort((a, b) => b.z - a.z)[0];
    if (hot) {
      const [lat, lng] = cellToLatLng(hot.id);
      out.push({ name: 'Strongest hot spot', center: [lng, lat], zoom: Math.min(15, baseZoom + 1.6), pitch: 50, bearing: -40 });
    }
    out.push({ name: 'Low angle', center: [(w + e) / 2, (s + n) / 2], zoom: baseZoom + 0.4, pitch: 72, bearing: 60 });
    return out;
  };

  const fly = (b: Bookmark) => mapRef.current?.flyTo({ center: b.center, zoom: b.zoom, pitch: b.pitch, bearing: b.bearing, duration: 2400, essential: true });

  const tour = async () => {
    if (touring) { stop.current = true; return; }
    setTouring(true);
    stop.current = false;
    for (const b of bookmarks()) {
      if (stop.current) break;
      fly(b);
      await new Promise((r) => setTimeout(r, 3600));
    }
    setTouring(false);
  };

  return (
    <>
      <Section title="Third dimension">
        <Group label="3D view">
          <Seg
            label="3D view"
            value={relief.view}
            onChange={(view: ReliefView) => patch({ view })}
            options={[
              { value: 'flat', label: 'Flat' },
              { value: 'extrude', label: 'Extrude' },
              ...(ds.timeField ? [{ value: 'cube' as ReliefView, label: 'Space-time cube' }] : []),
            ]}
          />
        </Group>
        <p className="panel-lead">
          {relief.view === 'flat' && 'Use 3D only when height says something 2D cannot. It costs the reader effort: some features will always hide behind others.'}
          {relief.view === 'extrude' && 'Hexagon height is proportional to the count. Colour repeats the message, so nobody depends on judging heights alone.'}
          {relief.view === 'cube' && 'Time becomes height. Each layer of boxes is one period, oldest at the bottom, coloured by its emerging hot spot class. Patterns in both place and time appear in one view.'}
        </p>
      </Section>
      {relief.view !== 'flat' && (
        <>
          <Section title="Camera">
            <Slider label="Height" value={relief.exaggeration} min={0.25} max={4} step={0.25} onChange={(exaggeration) => patch({ exaggeration })} format={(v) => `×${v}`} />
            <Slider label="Tilt" value={relief.pitch} min={0} max={75} onChange={(pitch) => patch({ pitch })} format={(v) => `${v}°`} />
            <Note>Drag with the right mouse button, or two fingers, to orbit.</Note>
          </Section>
          <Section title="Bookmarks">
            <p className="panel-lead">Not everyone navigates 3D comfortably. Bookmarks take the viewer straight to the views that matter.</p>
            <div className="bookmarks">
              {bookmarks().map((b) => (
                <button key={b.name} className="btn btn--sm" onClick={() => fly(b)}>{b.name}</button>
              ))}
            </div>
            <button className={`btn btn--sm ${touring ? 'btn--flag' : 'btn--ink'}`} onClick={tour}>
              <Route size={14} /> {touring ? 'Stop the tour' : 'Play a guided tour'}
            </button>
          </Section>
        </>
      )}
    </>
  );
}
