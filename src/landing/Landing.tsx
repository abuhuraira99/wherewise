import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Wordmark } from '../ui/Wordmark';
import { DropWell, SampleList } from '../ui/Intake';
import { navigate } from '../router';
import { LivePlate, type PlateStats } from './LivePlate';
import { STATIONS } from '../studio/stations';
import { loadSample, SAMPLES } from '../lib/data/load';
import type { Dataset } from '../lib/types';
import { binHexes, studyArea } from '../lib/stats/hex';
import { getisOrd } from '../lib/stats/gistar';
import { classBreaks, classOf } from '../lib/stats/classify';
import { rampById, sampleRamp } from '../lib/palettes';
import { GI_COLORS } from '../map/layers';
import { hexPaths } from './hexsvg';
import { audit, grade, type Finding } from '../lib/honesty/audit';
import { defaultSym, defaultLabels } from '../state/store';

const GITHUB = 'https://github.com/abuhuraira99/wherewise';

function goStudio(e?: React.MouseEvent) {
  e?.preventDefault();
  navigate('/studio');
}

export function Landing() {
  const [stats, setStats] = useState<PlateStats | null>(null);
  const onStats = useCallback((s: PlateStats) => setStats(s), []);
  useEffect(() => {
    document.title = 'Wherewise · A heat map is not evidence';
  }, []);

  return (
    <div className="landing">
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="collar" aria-label="Sheet information">
        <a href="/" className="collar-brand" onClick={(e) => e.preventDefault()} aria-label="Wherewise">
          <Wordmark size={17} />
        </a>
        <p className="collar-meta num">
          <span>Sheet 01</span>
          <span>WGS 84</span>
          <span>{stats ? (stats.live ? 'Live' : 'Archive') : 'Surveying'}</span>
          {stats && <span>{stats.n.toLocaleString('en-GB')} events</span>}
          {stats?.updated && <span>Updated {new Date(stats.updated).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</span>}
        </p>
        <nav className="collar-nav" aria-label="Primary">
          <a href="/guide" onClick={(e) => { e.preventDefault(); navigate('/guide'); }}>Field guide</a>
          <a href={GITHUB} target="_blank" rel="noreferrer">Source</a>
          <a href="/studio" className="btn btn--ink btn--sm" onClick={goStudio}>Open the studio</a>
        </nav>
      </header>

      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="cover">
            <div className="cover-band" aria-hidden />
            <h1 id="hero-title">A heat map is not evidence.</h1>
            <p className="cover-lead">
              Drop in a spreadsheet of events with locations. Wherewise draws it the way a cartographer would, tests which patterns are real and which are noise, and hands you a map, brief or dashboard you can stand behind.
            </p>
            <DropWell variant="book" onPicked={() => navigate('/studio')} />
            <div className="cover-samples">
              <span className="caps">Or open a real survey</span>
              <SampleList compact onPicked={() => navigate('/studio')} />
            </div>
            <p className="cover-privacy"><ShieldCheck size={14} aria-hidden /> Your file is read inside this tab. It is never uploaded.</p>
          </div>

          <figure className="plate" aria-labelledby="plate-cap">
            <div className="plate-ruler plate-ruler--top" aria-hidden />
            <div className="plate-ruler plate-ruler--left" aria-hidden />
            <LivePlate onStats={onStats} />
            <figcaption id="plate-cap" className="plate-cap">
              <span className="plate-cap-title">{stats?.dataset ?? 'Live survey'}</span>
              <span className="plate-cap-body">
                {stats
                  ? `Getis-Ord Gi* on ${stats.cells.toLocaleString('en-GB')} hexagons, corrected for false discovery. ${stats.hot} hot and ${stats.cold} cold. Computed in your browser a moment ago.`
                  : 'Fetching the latest records and testing them for clusters.'}
              </span>
            </figcaption>
            {stats && (
              <div className="stamp" aria-label="Map honesty score for this plate">
                <span className="caps">Map honesty</span>
                <span className="stamp-num num">{stats.score}</span>
                <span className="stamp-grade">{grade(stats.score)}</span>
              </div>
            )}
          </figure>
        </section>

        <ComparePlates />
        <HonestyDemo />
        <Traverse />
        <Users />
        <Privacy />
        <Provenance />

        <section className="close" aria-labelledby="close-title">
          <h2 id="close-title">Bring the spreadsheet you already have.</h2>
          <p>Latitude, longitude and a date are enough. Everything else is optional.</p>
          <div className="close-actions">
            <DropWell variant="book" onPicked={() => navigate('/studio')} />
            <a className="btn btn--ink" href="/studio" onClick={goStudio}>Open the studio <ArrowRight size={15} /></a>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="foot-grid">
          <Wordmark size={16} />
          <p>Built by Abu Huraira from the practice taught in Esri's <em>The Power of Where: Communicating with Maps</em> (2026). Wherewise is independent and not affiliated with or endorsed by Esri.</p>
          <nav aria-label="Footer">
            <a href="/studio" onClick={goStudio}>Studio</a>
            <a href="/guide" onClick={(e) => { e.preventDefault(); navigate('/guide'); }}>Field guide</a>
            <a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
        </div>
        <p className="foot-credits small">Basemap © OpenStreetMap contributors, OpenFreeMap, OpenMapTiles. Sample data: London Fire Brigade (Open Government Licence v3.0), U.S. Geological Survey (public domain), City of Chicago Data Portal.</p>
      </footer>
    </div>
  );
}

/* ---------- the London comparison: what looks dense vs what is significant ---------- */

function useLondon(): Dataset | null {
  const [ds, setDs] = useState<Dataset | null>(null);
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    ref.current = true;
    const ctrl = new AbortController();
    loadSample(SAMPLES[0], ctrl.signal).then(setDs).catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return ds;
}

function useInView<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && setSeen(true), { rootMargin: '400px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

function ComparePlates() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <section className="compare" ref={ref} aria-labelledby="compare-title">
      <div className="section-head">
        <h2 id="compare-title">Bright is not the same as significant.</h2>
        <p>
          Seventeen years of animal rescues by the London Fire Brigade, counted into equal-area hexagons. On the left, raw counts: the centre glows because that is where people and pets live. On the right, the same counts after a Getis-Ord Gi* test: only clusters stronger than chance survive.
        </p>
      </div>
      {seen ? <CompareBody /> : <div className="compare-wait" />}
    </section>
  );
}

function CompareBody() {
  const ds = useLondon();
  const data = useMemo(() => {
    if (!ds) return null;
    const res = 8;
    const grid = binHexes(ds, res);
    const area = studyArea(grid, 1);
    const values = new Map([...grid.cells].map(([id, b]) => [id, b.value]));
    const gi = getisOrd(values, area, 1, true);
    const occupied = [...grid.cells.keys()];
    const counts = occupied.map((id) => grid.cells.get(id)!.value);
    const breaks = classBreaks(counts, 5, 'natural');
    const ramp = sampleRamp(rampById('ember').stops, breaks.length);
    const giIds = area.filter((id) => gi.results.get(id)!.bin !== 0 || grid.cells.has(id));
    const giSvg = hexPaths(giIds, 560);
    const pathOf = new Map(giIds.map((id, k) => [id, giSvg.paths[k]]));
    const brightest = counts.filter((c) => classOf(c, breaks) >= breaks.length - 2).length;
    return {
      left: occupied.map((id, k) => ({ d: pathOf.get(id) ?? '', fill: ramp[classOf(counts[k], breaks)] })),
      right: giIds.map((id, k) => ({ d: giSvg.paths[k], fill: GI_COLORS[gi.results.get(id)!.bin] })),
      height: giSvg.height,
      rightHeight: giSvg.height,
      brightest,
      hot: gi.hot,
      cold: gi.cold,
      cells: area.length,
      ramp,
      breaks,
    };
  }, [ds]);
  if (!data) return <div className="compare-wait"><span className="plotting-line" /></div>;
  return (
    <div className="compare-grid">
      <figure className="cplate">
        <svg viewBox={`0 0 560 ${data.height}`} role="img" aria-label="Raw rescue counts per hexagon in London">
          {data.left.map((h, k) => <path key={k} d={h.d} fill={h.fill} />)}
        </svg>
        <figcaption>
          <span className="tape">What it looks like</span>
          <p><strong className="num">{data.brightest}</strong> hexagons fall in the two darkest classes of raw counts.</p>
        </figcaption>
      </figure>
      <figure className="cplate">
        <svg viewBox={`0 0 560 ${data.rightHeight}`} role="img" aria-label="Statistically significant hot and cold spots of rescues in London">
          {data.right.map((h, k) => <path key={k} d={h.d} fill={h.fill} />)}
        </svg>
        <figcaption>
          <span className="tape">What the test says</span>
          <p><strong className="num">{data.hot}</strong> hot and <strong className="num">{data.cold}</strong> cold hexagons out of {data.cells.toLocaleString('en-GB')}, after false discovery correction.</p>
        </figcaption>
      </figure>
    </div>
  );
}

/* ---------- honesty demo, computed from the real audit ---------- */

function HonestyDemo() {
  const [ref, seen] = useInView<HTMLElement>();
  return (
    <section className="honesty" ref={ref} aria-labelledby="honesty-title">
      <div className="section-head">
        <h2 id="honesty-title">It argues with your map before anyone else can.</h2>
        <p>Every view gets a Map Honesty score. Each finding names the problem, the cartographic principle behind it, and a one-click fix. Below, the same London data drawn two ways and scored by the real audit.</p>
      </div>
      {seen ? <HonestyBody /> : <div className="compare-wait" />}
    </section>
  );
}

function HonestyBody() {
  const ds = useLondon();
  const result = useMemo(() => {
    if (!ds) return null;
    const base = {
      ds,
      labels: defaultLabels,
      relief: { view: 'flat' as const, exaggeration: 1, pitch: 50 },
      deliver: { audience: 'public' as const, purpose: 'story' as const, product: 'dashboard' as const, title: '', subtitle: '' },
      station: 'time' as const,
      overlap: 0.62,
      slices: 17,
    };
    const before = audit({
      ...base,
      sym: { ...defaultSym, kind: 'graduated', field: 'animal', classes: 11, opacity: 1 },
      analysis: { view: 'heat', resolution: 'auto', neighbourRings: 1, fdr: false, weightField: null },
      time: { view: 'multiples', step: 'year', lockBreaks: false, frame: 0, playing: false },
      gi: null,
    });
    const g = binHexes(ds, 8);
    const area = studyArea(g, 1);
    const gi = getisOrd(new Map([...g.cells].map(([id, b]) => [id, b.value])), area, 1, true);
    const after = audit({
      ...base,
      sym: { ...defaultSym, kind: 'unique', field: 'animal', categoryPalette: 'okabe', opacity: 0.4 },
      analysis: { view: 'gistar', resolution: 'auto', neighbourRings: 1, fdr: true, weightField: null },
      time: { view: 'multiples', step: 'year', lockBreaks: true, frame: 0, playing: false },
      deliver: { ...base.deliver, product: 'brief' },
      gi: { cells: area.length, hot: gi.hot, cold: gi.cold },
    });
    return { before, after };
  }, [ds]);
  if (!result) return <div className="compare-wait"><span className="plotting-line" /></div>;
  const list = (fs: Finding[]) => fs.filter((f) => f.id !== 'dropped').slice(0, 5);
  return (
    <div className="honesty-grid">
      <div className="hcol">
        <div className="hscore">
          <span className="hscore-num num">{result.before.score}</span>
          <span className={`hscore-grade grade--${grade(result.before.score)}`}>{grade(result.before.score)}</span>
          <span className="caps">Before</span>
        </div>
        <ul className="findings findings--static">
          {list(result.before.findings).map((f) => (
            <li key={f.id} className={`finding finding--${f.severity}`}>
              <span className="finding-mark" aria-hidden />
              <div>
                <h4>{f.title}</h4>
                <p className="finding-principle">{f.principle}</p>
                {f.fix && <span className="finding-fix">{f.fix.label}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="hcol hcol--after">
        <div className="hscore">
          <span className="hscore-num num">{result.after.score}</span>
          <span className={`hscore-grade grade--${grade(result.after.score)}`}>{grade(result.after.score)}</span>
          <span className="caps">After the suggested fixes</span>
        </div>
        <ul className="findings findings--static">
          {list(result.after.findings).map((f) => (
            <li key={f.id} className={`finding finding--${f.severity}`}>
              <span className="finding-mark" aria-hidden />
              <div>
                <h4>{f.title}</h4>
                <p className="finding-principle">{f.principle}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- the seven stations ---------- */

const STATION_TEXT: Record<string, string> = {
  survey: 'Reads every column and says what it is: a category, an amount, a date, a place. Rows it cannot place are counted, not silently dropped.',
  symbolize: 'Categories get hues, amounts get gradients and sizes. Natural breaks, colour-blind safe palettes, real blend modes, label classes in a serif and a sans, and an expression language for calculated fields.',
  test: 'Points, heat map, equal-area hexagons and Getis-Ord Gi* side by side, so the pattern you see is checked against the one that is really there.',
  time: 'Mann-Kendall trends and emerging hot spots per hexagon, small multiples with locked breaks, and an animation for movement.',
  relief: 'Hexagons extruded by count, a space-time cube where height is time, and camera bookmarks with a guided tour.',
  charts: 'Category bars, histogram, data clock and calendar heat chart. Click any part of a chart and the map filters to match.',
  deliver: 'Pick the audience and purpose. It recommends the product, then builds it: a print map, a story brief, a live dashboard or a shareable link.',
};

function Traverse() {
  return (
    <section className="stations" aria-labelledby="stations-title">
      <div className="section-head">
        <h2 id="stations-title">Seven stations from raw file to finished map.</h2>
        <p>Surveyors walk a traverse from one fixed station to the next. The studio works the same way, and you can step back to any station at any time.</p>
      </div>
      <ol className="traverse-line">
        {STATIONS.map((s, k) => (
          <li key={s.id} className="tstation">
            <span className="tstation-mark" aria-hidden />
            <span className="num tstation-num">STA {k + 1}</span>
            <h3>{s.name}</h3>
            <p className="tstation-q">{s.verb}</p>
            <p>{STATION_TEXT[s.id]}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const USERS = [
  { who: 'City service teams', file: '311 complaints, potholes, fly-tipping reports', question: 'Which streets are getting worse this quarter, and is that more than chance?' },
  { who: 'Humanitarian and NGO field staff', file: 'Distribution points, incident logs, beneficiary visits', question: 'Where are needs concentrating, and what should the weekly briefing show?' },
  { who: 'Delivery and retail operations', file: 'Orders, failed deliveries, store footfall', question: 'Where do failed deliveries cluster, and at what hour?' },
  { who: 'Clinics and public health', file: 'Cases, appointments, outreach visits', question: 'Is this cluster new, or has it been there all year?' },
  { who: 'Local newsrooms', file: 'Crashes, crime, evictions, fires', question: 'Can we publish this map without misleading readers?' },
  { who: 'Students and researchers', file: 'Field observations, survey points', question: 'Which visualization is right for this data and this audience?' },
];

function Users() {
  return (
    <section className="users" aria-labelledby="users-title">
      <div className="section-head">
        <h2 id="users-title">For the people who have the data but not the GIS analyst.</h2>
      </div>
      <div className="users-book">
        <div className="users-row users-row--head caps" aria-hidden>
          <span>Who</span>
          <span>What they bring</span>
          <span>What they need to know</span>
        </div>
        {USERS.map((u) => (
          <div key={u.who} className="users-row">
            <h3>{u.who}</h3>
            <p>{u.file}</p>
            <p className="users-q">{u.question}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  return (
    <section className="privacy" aria-labelledby="privacy-title">
      <div className="privacy-copy">
        <h2 id="privacy-title">Your data stays on your machine.</h2>
        <p>
          Parsing, profiling, statistics and rendering all run in the browser tab. There is no account, no upload and no database. The only server involved is a small edge worker that fetches the public sample feeds and keeps a cached copy, so the live samples keep working even when a source is down.
        </p>
      </div>
      <svg className="privacy-diagram" viewBox="0 0 520 220" role="img" aria-label="Diagram: your file goes only to the browser tab; the edge worker only serves public feeds">
        <rect x="10" y="40" width="170" height="140" className="pd-box pd-box--book" />
        <text x="26" y="72" className="pd-title">Your browser tab</text>
        <text x="26" y="98" className="pd-text">CSV parsing</text>
        <text x="26" y="118" className="pd-text">Gi*, Mann-Kendall</text>
        <text x="26" y="138" className="pd-text">Map, charts, export</text>
        <text x="26" y="164" className="pd-mono">your file stays here</text>
        <rect x="330" y="40" width="180" height="62" className="pd-box" />
        <text x="346" y="66" className="pd-title">Edge worker</text>
        <text x="346" y="88" className="pd-text">cached public feeds</text>
        <rect x="330" y="128" width="180" height="52" className="pd-box pd-box--muted" />
        <text x="346" y="152" className="pd-text">USGS · City of Chicago</text>
        <text x="346" y="170" className="pd-mono">public sources</text>
        <path d="M180 72 H330" className="pd-line" />
        <path d="M420 102 V128" className="pd-line" />
        <text x="198" y="64" className="pd-mono">sample data only</text>
        <path d="M180 150 H300" className="pd-line pd-line--blocked" />
        <path d="M294 142 l12 16 M306 142 l-12 16" className="pd-cross" />
        <text x="198" y="176" className="pd-mono">no upload</text>
      </svg>
    </section>
  );
}

function Provenance() {
  return (
    <section className="provenance" aria-labelledby="prov-title">
      <div className="prov-mark" aria-hidden>
        <span className="num">6</span>
        <span>sections</span>
        <span className="num">55</span>
        <span>lessons</span>
        <span className="num">13</span>
        <span>exercises</span>
      </div>
      <div>
        <h2 id="prov-title">Built from a course, then built for use.</h2>
        <p>
          Wherewise started as the final project for Esri's six-week MOOC <em>The Power of Where: Communicating with Maps</em>, taught by Flora Vale with John Nelson, Tommy Fauvell, Warren Davison and Ankita Bakshi. Every station puts one part of that course to work: symbology and labels, blending and expressions, 3D, visual versus geographic analysis, charts, change over time, and choosing the right product for an audience.
        </p>
        <p>
          <a href="/guide" onClick={(e) => { e.preventDefault(); navigate('/guide'); }}>Read the field guide</a>, the principles behind each station in plain language.
        </p>
      </div>
    </section>
  );
}
