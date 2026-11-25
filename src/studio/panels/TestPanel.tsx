import { getHexagonEdgeLengthAvg, UNITS } from 'h3-js';
import { useStore } from '../../state/store';
import { Field, Group, Note, Section, Seg, Slider, Toggle } from '../../ui/controls';
import type { AnalysisView } from '../../lib/types';
import { giStar, resolutionFor } from '../../lib/compute';

const VIEWS: { value: AnalysisView; label: string }[] = [
  { value: 'points', label: 'Points' },
  { value: 'heat', label: 'Heat map' },
  { value: 'hex', label: 'Hexagons' },
  { value: 'gistar', label: 'Hot spots' },
];

const EXPLAIN: Record<AnalysisView, string> = {
  points: 'Every event where it happened. Honest, but in busy places symbols pile up and hide how many there are.',
  heat: 'A kernel density surface. It shows where events are dense, which is often just where people, roads or sensors are. It does not test anything.',
  hex: 'Events counted into equal-area hexagons. Every cell covers the same ground, so counts compare fairly across the map.',
  gistar: 'Getis-Ord Gi* compares each hexagon and its neighbours with the whole study area. A hot spot is a cluster of high counts too strong to be chance.',
};

export function TestPanel() {
  const ds = useStore((s) => s.ds)!;
  const a = useStore((s) => s.analysis);
  const patch = useStore((s) => s.patchAnalysis);
  const selection = useStore((s) => s.selection);
  const res = resolutionFor(ds, a.resolution);
  const autoRes = resolutionFor(ds, 'auto');
  const edge = getHexagonEdgeLengthAvg(res, UNITS.km);
  const quant = ds.fields.filter((f) => f.kind === 'quantitative');
  const result = a.view === 'gistar' ? giStar(ds, res, a.neighbourRings, a.fdr, a.weightField, selection).gi : null;

  return (
    <>
      <Section title="Look, then test">
        <Group label="Show the data as">
          <Seg label="Analysis view" value={a.view} options={VIEWS} onChange={(view) => patch({ view })} />
        </Group>
        <p className="panel-lead">{EXPLAIN[a.view]}</p>
        {a.view === 'heat' && (
          <button className="btn btn--flag btn--sm" onClick={() => patch({ view: 'gistar' })}>
            Test this pattern
          </button>
        )}
      </Section>

      {(a.view === 'hex' || a.view === 'gistar') && (
        <Section title="Grid">
          <Slider
            label="Hexagon size"
            value={res}
            min={Math.max(0, autoRes - 3)}
            max={Math.min(10, autoRes + 3)}
            onChange={(r) => patch({ resolution: r })}
            format={() => (edge < 1 ? `${Math.round(edge * 1000)} m edge` : `${edge.toFixed(edge < 10 ? 1 : 0)} km edge`)}
          />
          {a.resolution !== 'auto' && <button className="linkish" onClick={() => patch({ resolution: 'auto' })}>Back to automatic size</button>}
          <Field label="Count or sum">
            {(id) => (
              <select id={id} className="select" value={a.weightField ?? ''} onChange={(e) => patch({ weightField: e.target.value || null })}>
                <option value="">Count of events</option>
                {quant.map((f) => <option key={f.name} value={f.name}>Sum of {f.name}</option>)}
              </select>
            )}
          </Field>
        </Section>
      )}

      {a.view === 'gistar' && (
        <Section title="Hot spot test">
          <Slider label="Neighbourhood" value={a.neighbourRings} min={1} max={3} onChange={(r) => patch({ neighbourRings: r })} format={(r) => `${r} ring${r > 1 ? 's' : ''} · ${1 + 3 * r * (r + 1)} cells`} />
          <Toggle checked={a.fdr} onChange={(fdr) => patch({ fdr })}>Correct for false discovery (FDR)</Toggle>
          {result && (
            <dl className="facts facts--tight">
              <div><dt>Hexagons tested</dt><dd className="num">{result.n.toLocaleString('en-GB')}</dd></div>
              <div><dt>Hot spots</dt><dd className="num hot">{result.hot.toLocaleString('en-GB')}</dd></div>
              <div><dt>Cold spots</dt><dd className="num cold">{result.cold.toLocaleString('en-GB')}</dd></div>
              <div><dt>95% threshold</dt><dd className="num">p ≤ {result.thresholds[1] ? result.thresholds[1].toPrecision(2) : '–'}</dd></div>
            </dl>
          )}
          <Note>Click any hexagon to stake a field note with its z-score, p-value and trend.</Note>
        </Section>
      )}
    </>
  );
}
