import { useEffect } from 'react';
import { Pause, Play } from 'lucide-react';
import { useStore } from '../../state/store';
import { Field, Group, Note, Section, Seg, Slider, Toggle } from '../../ui/controls';
import { resolutionFor, slices, trends } from '../../lib/compute';
import { EMERGING_LABELS, TREND_LABELS, formatSlice } from '../../lib/stats/trend';
import { Timeline } from '../../charts/Charts';
import type { TimeStep, TimeView } from '../../lib/types';

const VIEWS: { value: TimeView; label: string }[] = [
  { value: 'trend', label: 'Trend' },
  { value: 'emerging', label: 'Emerging' },
  { value: 'multiples', label: 'Multiples' },
  { value: 'animate', label: 'Animate' },
];

export function TimePanel() {
  const ds = useStore((s) => s.ds)!;
  const t = useStore((s) => s.time);
  const patch = useStore((s) => s.patchTime);
  const analysis = useStore((s) => s.analysis);
  const selection = useStore((s) => s.selection);
  const sl = slices(ds, t.step);

  // animation clock
  useEffect(() => {
    if (!t.playing || !sl) return;
    const id = window.setInterval(() => {
      const st = useStore.getState();
      st.patchTime({ frame: (st.time.frame + 1) % sl.starts.length });
    }, 900);
    return () => window.clearInterval(id);
  }, [t.playing, sl]);

  if (!ds.timeField || !sl) {
    return (
      <Section title="Time">
        <Note>This data has no usable date column, so there is nothing to compare over time. Pick a date column in Survey if one was missed.</Note>
      </Section>
    );
  }

  const res = resolutionFor(ds, analysis.resolution);
  const tr = t.view === 'trend' || t.view === 'emerging' ? trends(ds, res, t.step, analysis.neighbourRings, analysis.fdr, selection) : null;
  const counts = new Map<string, number>();
  if (tr) for (const c of tr.trends.values()) {
    const k = t.view === 'trend' ? c.trend : c.emerging;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  return (
    <>
      <Section title="Change over time">
        <Group label="Show change as">
          <Seg label="Time view" value={t.view} options={VIEWS} onChange={(view) => patch({ view, playing: false })} />
        </Group>
        <Field label="Time step">
          {(id) => (
            <select id={id} className="select" value={t.step} onChange={(e) => patch({ step: e.target.value as TimeStep, frame: 0 })}>
              <option value="auto">Automatic ({sl.step})</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
              <option value="year">Year</option>
            </select>
          )}
        </Field>
        <p className="panel-lead">
          {t.view === 'trend' && 'Each hexagon gets a Mann-Kendall test for a steady rise or fall, combined with its Gi* hot spot result: rising, easing, consistently high, or no change.'}
          {t.view === 'emerging' && 'Gi* is run for every period, then each hexagon is classed by its run of hot periods: new, consecutive, intensifying, persistent, diminishing, sporadic, oscillating or historical.'}
          {t.view === 'multiples' && 'The same map once per period, side by side, so the eye compares them directly. Breaks must stay the same in every panel.'}
          {t.view === 'animate' && 'Play the periods in sequence. Good for showing movement. Bad for comparing, because each frame is gone before the next arrives.'}
        </p>
      </Section>

      {t.view === 'multiples' && (
        <Section title="Panels">
          <Toggle checked={t.lockBreaks} onChange={(lockBreaks) => patch({ lockBreaks })}>Same class breaks in every panel</Toggle>
          {!t.lockBreaks && <Note tone="flag">Each panel now has its own breaks. Dark means something different in every period, so the comparison is no longer true.</Note>}
        </Section>
      )}

      {t.view === 'animate' && (
        <Section title="Playback">
          <div className="row">
            <button className="btn btn--ink btn--sm" onClick={() => patch({ playing: !t.playing })} aria-label={t.playing ? 'Pause' : 'Play'}>
              {t.playing ? <Pause size={14} /> : <Play size={14} />} {t.playing ? 'Pause' : 'Play'}
            </button>
          </div>
          <Slider label="Period" value={Math.min(t.frame, sl.starts.length - 1)} min={0} max={sl.starts.length - 1} onChange={(frame) => patch({ frame, playing: false })} format={(f) => formatSlice(sl.starts[f], sl.step)} />
        </Section>
      )}

      {tr && (
        <Section title="Result">
          <ul className="tally">
            {[...counts].filter(([k]) => k !== 'none' && k !== 'steady').sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k}><span>{t.view === 'trend' ? TREND_LABELS[k as keyof typeof TREND_LABELS] : EMERGING_LABELS[k as keyof typeof EMERGING_LABELS]}</span><span className="num">{v}</span></li>
            ))}
          </ul>
          <p className="field-hint">{tr.slices.starts.length} periods tested{sl.partialLast ? ', the incomplete final period left out' : ''}.</p>
        </Section>
      )}

      <Section title="All events per period">
        <Timeline ds={ds} />
      </Section>
    </>
  );
}
