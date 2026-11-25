import { useMemo } from 'react';
import { cellToBoundary } from 'h3-js';
import { useStore } from '../state/store';
import { cellSeries, resolutionFor, slices } from '../lib/compute';
import { classBreaks, classOf } from '../lib/stats/classify';
import { rampById, sampleRamp } from '../lib/palettes';
import { formatSlice } from '../lib/stats/trend';

/** Small multiples: one hexagon map per period, with locked (or deliberately unlocked) breaks. */
export function Multiples() {
  const ds = useStore((s) => s.ds)!;
  const time = useStore((s) => s.time);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const ramp = useStore((s) => s.sym.ramp);
  const res = resolutionFor(ds, analysis.resolution);
  const sl = slices(ds, time.step);
  const series = cellSeries(ds, res, time.step, selection);

  const data = useMemo(() => {
    if (!sl || !series) return null;
    const usable = sl.partialLast && sl.starts.length > 3 ? sl.starts.length - 1 : sl.starts.length;
    const panels = Math.min(12, usable);
    const first = usable - panels;
    const cells = [...series.keys()];
    const polys = new Map<string, [number, number][]>();
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const id of cells) {
      const ring = cellToBoundary(id, true) as [number, number][];
      polys.set(id, ring);
      for (const [x, y] of ring) { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; }
    }
    const kx = Math.cos(((s + n) / 2) * (Math.PI / 180));
    const all: number[] = [];
    for (const arr of series.values()) for (let t = first; t < usable; t++) if (arr[t] > 0) all.push(arr[t]);
    const shared = classBreaks(all, 5, 'natural');
    return { panels, first, polys, bbox: [w, s, e, n] as const, kx, shared };
  }, [sl, series]);

  if (!sl || !series || !data) return <div className="multiples-empty">No dates to split into periods.</div>;
  const colors = sampleRamp(rampById(ramp).stops, 5);
  const [w, s, e, n] = data.bbox;
  const W = 220;
  const H = Math.max(80, Math.min(260, (W * (n - s)) / Math.max(1e-9, (e - w) * data.kx)));
  const px = (x: number) => ((x - w) / (e - w || 1)) * W;
  const py = (y: number) => H - ((y - s) / (n - s || 1)) * H;
  const paths = new Map<string, string>();
  for (const [id, ring] of data.polys) paths.set(id, 'M' + ring.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L') + 'Z');

  return (
    <div className="multiples" role="region" aria-label="Small multiples">
      <div className="multiples-grid">
        {Array.from({ length: data.panels }, (_, k) => {
          const t = data.first + k;
          const own = time.lockBreaks ? data.shared : classBreaks([...series.values()].map((a) => a[t]).filter((v) => v > 0), 5, 'natural');
          let total = 0;
          return (
            <figure key={t} className="multiple">
              <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={formatSlice(sl.starts[t], sl.step)}>
                {[...series.entries()].map(([id, arr]) => {
                  const v = arr[t];
                  total += v;
                  if (!v) return null;
                  return <path key={id} d={paths.get(id)} fill={colors[Math.min(colors.length - 1, Math.max(0, classOf(v, own)))]} />;
                })}
              </svg>
              <figcaption>
                <span>{formatSlice(sl.starts[t], sl.step)}</span>
                <span className="num">{total.toLocaleString('en-GB')}</span>
              </figcaption>
            </figure>
          );
        })}
      </div>
      <div className="multiples-legend">
        {time.lockBreaks ? (
          <>
            <span className="caps">Events per hexagon, every panel</span>
            {data.shared.map((b, k) => (
              <span key={k} className="ml-item"><span className="swatch" style={{ background: colors[k] }} /> <span className="num">≤ {Math.round(b)}</span></span>
            ))}
          </>
        ) : (
          <span className="tape">Breaks differ per panel: do not compare colours</span>
        )}
      </div>
    </div>
  );
}
