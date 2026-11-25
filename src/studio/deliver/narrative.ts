/**
 * Plain-language findings for the story brief and the dashboard. Every
 * sentence is computed from the data; nothing is templated praise.
 */
import type { Dataset } from '../../lib/types';
import type { Selection } from '../../state/store';
import { categoryCounts, giStar, grid, resolutionFor, slices, timeExtent, trends } from '../../lib/compute';
import { mannKendall, formatSlice } from '../../lib/stats/trend';
import { niceNumber } from '../../lib/stats/classify';
import { useStore } from '../../state/store';

export interface Finding {
  heading: string;
  text: string;
}

const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function overallSeries(ds: Dataset): { series: number[]; labels: string[]; usable: number; step: string } | null {
  const sl = slices(ds, useStore.getState().time.step);
  if (!sl) return null;
  const series = new Array(sl.starts.length).fill(0);
  for (let i = 0; i < ds.n; i++) if (sl.sliceOf[i] >= 0) series[sl.sliceOf[i]]++;
  const usable = sl.partialLast && series.length > 3 ? series.length - 1 : series.length;
  return { series, labels: sl.starts.map((s) => formatSlice(s, sl.step)), usable, step: sl.step };
}

export function writeFindings(ds: Dataset, sel: Selection | null = null): Finding[] {
  const st = useStore.getState();
  const out: Finding[] = [];
  const ext = timeExtent(ds);
  const fmt = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  out.push({
    heading: 'What was mapped',
    text: `${ds.n.toLocaleString('en-GB')} events${ext ? ` between ${fmt(ext[0])} and ${fmt(ext[1])}` : ''}, from ${ds.source.publisher}.`,
  });

  const cat = ds.fields.find((f) => f.name === st.sym.field && f.kind === 'qualitative') ?? ds.fields.find((f) => f.kind === 'qualitative' && (f.categories?.length ?? 0) <= 40);
  if (cat) {
    const cc = categoryCounts(ds, cat.name, null);
    const total = cc.reduce((a, c) => a + c.count, 0);
    const top = cc.slice(0, 3);
    out.push({
      heading: `By ${cat.name.replace(/_/g, ' ')}`,
      text: `${top.map((c, k) => `${k === 0 ? '' : k === top.length - 1 ? 'and ' : ''}${c.value} (${Math.round((c.count / total) * 100)}%)`).join(top.length > 2 ? ', ' : ' ')} account for ${Math.round((top.reduce((a, c) => a + c.count, 0) / total) * 100)}% of all events.`,
    });
  }

  if (ds.timeField) {
    const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (let i = 0; i < ds.n; i++) {
      const t = ds.time[i];
      if (Number.isFinite(t)) { const d = new Date(t); g[d.getUTCDay()][d.getUTCHours()]++; }
    }
    let best = { d: 0, h: 0, v: -1 };
    g.forEach((r, d) => r.forEach((v, h) => { if (v > best.v) best = { d, h, v }; }));
    const byHour = new Array(24).fill(0);
    g.forEach((r) => r.forEach((v, h) => (byHour[h] += v)));
    const peakHour = byHour.indexOf(Math.max(...byHour));
    out.push({
      heading: 'When',
      text: `The busiest hour of the week is ${WEEKDAYS[best.d]} at ${String(best.h).padStart(2, '0')}:00. Across all days, activity peaks between ${String(peakHour).padStart(2, '0')}:00 and ${String((peakHour + 1) % 24).padStart(2, '0')}:00.`,
    });
    const os = overallSeries(ds);
    if (os && os.usable >= 4) {
      const mk = mannKendall(os.series.slice(0, os.usable));
      out.push({
        heading: 'Over time',
        text:
          mk.direction === 'none'
            ? `Across ${os.usable} ${os.step}s there is no statistically significant trend (Mann-Kendall p = ${mk.p.toFixed(2)}). Ups and downs are within what chance would produce.`
            : `Across ${os.usable} ${os.step}s, events are ${mk.direction === 'up' ? 'rising' : 'falling'} by about ${niceNumber(Math.abs(mk.slope))} per ${os.step} (Mann-Kendall p ${mk.p < 0.001 ? '< 0.001' : '= ' + mk.p.toFixed(3)}).`,
      });
    }
  }

  const res = resolutionFor(ds, st.analysis.resolution);
  const { gi, area } = giStar(ds, res, st.analysis.neighbourRings, st.analysis.fdr, st.analysis.weightField, sel);
  if (area.length >= 30) {
    const hotIds = [...gi.results.values()].filter((r) => r.bin >= 2).map((r) => r.id);
    let where = '';
    const placeField = ds.fields.find((f) => f.kind === 'qualitative' && /borough|district|ward|county|city|region|neighbou?rhood|area|place|state|country/i.test(f.name));
    if (placeField && hotIds.length) {
      const hot = new Set(hotIds);
      const counts = new Map<string, number>();
      const members = new Map<string, number[]>();
      const cells = grid(ds, res, st.analysis.weightField, sel).cells;
      for (const id of hot) members.set(id, cells.get(id)?.members ?? []);
      for (const arr of members.values()) for (const i of arr) {
        const v = String(ds.rows[i][placeField.name] ?? '').trim();
        if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k);
      if (top.length) where = ` They fall mostly in ${top.join(', ').replace(/, ([^,]*)$/, ' and $1')}.`;
    }
    out.push({
      heading: 'Where it clusters',
      text:
        gi.hot + gi.cold === 0
          ? `Hot spot analysis across ${area.length.toLocaleString('en-GB')} hexagons found no statistically significant clusters. The visual pattern is consistent with chance.`
          : `Hot spot analysis (Getis-Ord Gi*, ${gi.fdr ? 'FDR corrected' : 'uncorrected'}) found ${gi.hot.toLocaleString('en-GB')} hot and ${gi.cold.toLocaleString('en-GB')} cold hexagons out of ${area.length.toLocaleString('en-GB')}.${where}`,
    });
  }

  if (ds.timeField) {
    const tr = trends(ds, res, st.time.step, st.analysis.neighbourRings, st.analysis.fdr, sel);
    if (tr) {
      let rising = 0, persistent = 0, easing = 0, fresh = 0;
      for (const t of tr.trends.values()) {
        if (t.trend === 'rising-hot') rising++;
        if (t.trend === 'persistent-hot') persistent++;
        if (t.trend === 'falling-hot') easing++;
        if (t.emerging === 'new' || t.emerging === 'consecutive') fresh++;
      }
      if (rising + persistent + easing + fresh > 0)
        out.push({
          heading: 'What is changing',
          text: `${rising} hot spot hexagons are still rising, ${persistent} are consistently high and ${easing} are easing. ${fresh ? `${fresh} became hot only in the most recent periods, the places to watch.` : 'No new hot spots appeared in the latest periods.'}`,
        });
    }
  }
  return out;
}

