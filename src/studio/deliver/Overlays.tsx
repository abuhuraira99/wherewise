import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Printer, RefreshCw, X } from 'lucide-react';
import { useStore } from '../../state/store';
import { useScene } from '../useScene';
import { useAudit } from '../useAudit';
import { mapSnapshot, renderPoster } from './poster';
import { overallSeries, writeFindings } from './narrative';
import { CategoryBars, DataClock, Timeline } from '../../charts/Charts';
import { grade } from '../../lib/honesty/audit';
import { giStar, resolutionFor } from '../../lib/compute';
import { sparkPath } from '../../charts/spark';
import { mannKendall } from '../../lib/stats/trend';
import { niceNumber } from '../../lib/stats/classify';
import { openSample } from '../../ui/Intake';
import { SAMPLES } from '../../lib/data/load';
import { Wordmark } from '../../ui/Wordmark';

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function useEscape(close: () => void) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [close]);
}

/* ---------------- poster ---------------- */

export function PosterOverlay() {
  const ds = useStore((s) => s.ds)!;
  const deliver = useStore((s) => s.deliver);
  const close = () => useStore.getState().setOverlay('none');
  useEscape(close);
  const scene = useScene();
  const result = useAudit();
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    // give the map a frame to settle before capturing
    const t = setTimeout(async () => {
      const c = await renderPoster(ds, deliver, scene, result?.score ?? 0);
      if (!cancelled) {
        setUrl(c.toDataURL('image/png'));
        setBusy(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ds, deliver, scene, result?.score]);
  const file = `${(deliver.title || ds.name).replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 60)}-map.png`;
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Print map">
      <div className="overlay-bar">
        <h2>Print map</h2>
        <div className="row">
          <a className={`btn btn--book ${busy ? 'is-disabled' : ''}`} href={url ?? undefined} download={file} aria-disabled={busy}>
            <Download size={15} /> Download PNG
          </a>
          <button className="btn" onClick={close}><X size={15} /> Close</button>
        </div>
      </div>
      <div className="poster-stage">
        {busy ? <div className="plotting"><span className="plotting-line" />Composing the sheet</div> : url && <img src={url} alt={`Print map: ${deliver.title || ds.name}`} className="poster-img" />}
      </div>
      <p className="overlay-foot">2400 × 1697 px, A-series proportions. The map is captured as it is framed in the studio, with scale bar and north arrow measured from that view.</p>
    </div>
  );
}

/* ---------------- story brief ---------------- */

export function BriefOverlay() {
  const ds = useStore((s) => s.ds)!;
  const deliver = useStore((s) => s.deliver);
  const stakes = useStore((s) => s.stakes);
  const sym = useStore((s) => s.sym);
  const selection = useStore((s) => s.selection);
  const close = () => useStore.getState().setOverlay('none');
  useEscape(close);
  const result = useAudit();
  const scene = useScene();
  const findings = useMemo(() => writeFindings(ds, selection), [ds, selection]);
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setImg(mapSnapshot(1)?.toDataURL('image/png') ?? null), 250);
    return () => clearTimeout(t);
  }, []);
  const cat = ds.fields.find((f) => f.name === sym.field && f.kind === 'qualitative') ?? ds.fields.find((f) => f.kind === 'qualitative');
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="overlay overlay--doc" role="dialog" aria-modal="true" aria-label="Story brief">
      <div className="overlay-bar no-print">
        <h2>Story brief</h2>
        <div className="row">
          <button className="btn btn--book" onClick={() => window.print()}><Printer size={15} /> Print or save as PDF</button>
          <button className="btn" onClick={close}><X size={15} /> Close</button>
        </div>
      </div>
      <article className="brief">
        <header className="brief-head">
          <p className="brief-meta mono">{date} · {ds.n.toLocaleString('en-GB')} events</p>
          <h1>{deliver.title || ds.name}</h1>
          {deliver.subtitle && <p className="brief-dek">{deliver.subtitle}</p>}
        </header>
        {img && (
          <figure className="brief-map">
            <img src={img} alt={`Map: ${scene.legend.title}`} />
            <figcaption>
              <strong>{cap(scene.legend.title.replace(/_/g, ' '))}.</strong> {scene.legend.note ?? ''} Key:{' '}
              {scene.legend.items.slice(0, 7).map((l, k) => (
                <span key={l.label} className="brief-key"><span className="swatch" style={{ background: l.color }} />{l.label}{k < Math.min(6, scene.legend.items.length - 1) ? '; ' : ''}</span>
              ))}
            </figcaption>
          </figure>
        )}
        <section className="brief-body">
          {findings.map((f) => (
            <div key={f.heading} className="brief-finding">
              <h2>{f.heading}</h2>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
        <section className="brief-charts">
          {cat && (
            <figure>
              <h3>By {cat.name.replace(/_/g, ' ')}</h3>
              <CategoryBars ds={ds} field={cat.name} limit={6} compact />
            </figure>
          )}
          {ds.timeField && (
            <figure>
              <h3>Over time</h3>
              <Timeline ds={ds} width={340} />
            </figure>
          )}
          {ds.timeField && (
            <figure>
              <h3>Hour and weekday</h3>
              <DataClock ds={ds} size={240} />
            </figure>
          )}
        </section>
        {stakes.length > 0 && (
          <section className="brief-notes">
            <h2>Field notes</h2>
            <ol>
              {stakes.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}.</strong> {s.lines.join('. ')}.
                </li>
              ))}
            </ol>
          </section>
        )}
        <footer className="brief-method">
          <h2>Method and honesty</h2>
          <p>
            Mapped with Wherewise. Hot spots use Getis-Ord Gi* on an H3 hexagon grid{scene.edgeKm ? ` (${scene.edgeKm < 1 ? Math.round(scene.edgeKm * 1000) + ' m' : scene.edgeKm.toFixed(1) + ' km'} edges)` : ''} with {useStore.getState().analysis.fdr ? 'false discovery rate correction' : 'no multiple-testing correction'}; trends use the Mann-Kendall test with Sen's slope. Map honesty score {result?.score ?? '–'}/100 (grade {grade(result?.score ?? 0)}).
            {result && result.findings.filter((f) => f.severity === 'warn' || f.severity === 'fail').length > 0 &&
              ` Open issues: ${result.findings.filter((f) => f.severity === 'warn' || f.severity === 'fail').map((f) => f.title.toLowerCase()).join('; ')}.`}
          </p>
          <p>Source: {ds.source.publisher}, {ds.source.title}. {ds.source.licence}.{ds.source.note ? ` ${ds.source.note}` : ''}</p>
        </footer>
      </article>
    </div>
  );
}

/* ---------------- dashboard chrome (map stays in place) ---------------- */

export function DashboardTop() {
  const ds = useStore((s) => s.ds)!;
  const deliver = useStore((s) => s.deliver);
  const [refreshed, setRefreshed] = useState(() => new Date());
  const sample = SAMPLES.find((s) => s.id === ds.id && s.live);
  const timer = useRef<number>(0);
  useEffect(() => {
    if (!sample) return;
    timer.current = window.setInterval(() => {
      void openSample(sample).then(() => {
        setRefreshed(new Date());
        const st = useStore.getState();
        st.setOverlay('dashboard');
        st.patchAnalysis({ view: 'gistar' });
      });
    }, 10 * 60 * 1000);
    return () => window.clearInterval(timer.current);
  }, [sample]);
  return (
    <header className="dash-top">
      <div className="dash-title">
        <Wordmark size={15} />
        <h1>{deliver.title || ds.name}</h1>
        {sample && <span className="tape">Live · refreshes every 10 min</span>}
      </div>
      <div className="row">
        <span className="muted small mono">Updated {refreshed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
        {sample && (
          <button className="btn btn--sm" onClick={() => void openSample(sample).then(() => { setRefreshed(new Date()); useStore.getState().setOverlay('dashboard'); useStore.getState().patchAnalysis({ view: 'gistar' }); })}>
            <RefreshCw size={13} /> Refresh
          </button>
        )}
        <button className="btn btn--sm" onClick={() => useStore.getState().setOverlay('none')}><X size={13} /> Back to studio</button>
      </div>
    </header>
  );
}

export function DashboardSide() {
  const ds = useStore((s) => s.ds)!;
  const analysis = useStore((s) => s.analysis);
  const sym = useStore((s) => s.sym);
  const selection = useStore((s) => s.selection);
  const os = useMemo(() => overallSeries(ds), [ds]);
  const res = resolutionFor(ds, analysis.resolution);
  const { gi, area } = giStar(ds, res, analysis.neighbourRings, analysis.fdr, analysis.weightField, selection);
  const cat = ds.fields.find((f) => f.name === sym.field && f.kind === 'qualitative') ?? ds.fields.find((f) => f.kind === 'qualitative');

  const last = os ? os.series[os.usable - 1] : null;
  const prev = os && os.usable > 1 ? os.series[os.usable - 2] : null;
  const change = last !== null && prev ? ((last - prev) / prev) * 100 : null;
  const mk = os && os.usable >= 4 ? mannKendall(os.series.slice(0, os.usable)) : null;
  const sp = os ? sparkPath(os.series.slice(0, os.usable), 160, 34) : null;

  return (
    <aside className="dash-side" aria-label="Indicators">
      <div className="ind">
        <span className="caps">Events</span>
        <span className="ind-num num">{ds.n.toLocaleString('en-GB')}</span>
        {sp && (
          <svg viewBox="0 0 160 34" width="160" height="34" aria-hidden className="ind-spark">
            <path d={sp.area} className="spark-area" />
            <path d={sp.line} className="spark-line" />
          </svg>
        )}
        {os && <span className="ind-sub">{os.labels[0]} to {os.labels[os.usable - 1]}</span>}
      </div>
      {last !== null && os && (
        <div className="ind">
          <span className="caps">Last full {os.step}</span>
          <span className="ind-num num">{last.toLocaleString('en-GB')}</span>
          <span className={`ind-sub ${change !== null && change > 0 ? 'hot' : 'cold'}`}>
            {change === null ? '' : Math.abs(change) < 0.5 ? `Same as the ${os.step} before` : `${change > 0 ? '+' : ''}${change.toFixed(0)}% on the ${os.step} before`}
          </span>
          {mk && <span className="ind-sub">{mk.direction === 'none' ? 'No significant trend' : `Trend ${mk.direction === 'up' ? 'rising' : 'falling'} ${niceNumber(Math.abs(mk.slope))}/${os.step}`}</span>}
        </div>
      )}
      <div className="ind">
        <span className="caps">Hot spot hexagons</span>
        <span className="ind-num num hot">{gi.hot}</span>
        <span className="ind-sub">of {area.length.toLocaleString('en-GB')} tested, {gi.cold} cold</span>
      </div>
      {cat && (
        <div className="ind ind--chart">
          <span className="caps">By {cat.name.replace(/_/g, ' ')}</span>
          <CategoryBars ds={ds} field={cat.name} limit={6} compact />
        </div>
      )}
    </aside>
  );
}

export function DashboardBottom() {
  const ds = useStore((s) => s.ds)!;
  if (!ds.timeField) return null;
  return (
    <section className="dash-bottom" aria-label="Time charts">
      <div className="dash-cell"><span className="caps">Per period</span><Timeline ds={ds} width={420} height={110} /></div>
      <div className="dash-cell dash-cell--clock"><span className="caps">Hour × weekday</span><DataClock ds={ds} size={200} /></div>
    </section>
  );
}
