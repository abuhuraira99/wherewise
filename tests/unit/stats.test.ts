import { describe, expect, it } from 'vitest';
import { latLngToCell, gridDisk } from 'h3-js';
import { classBreaks, classOf, equalBreaks, gvf, jenks, quantileBreaks } from '../../src/lib/stats/classify';
import { getisOrd, normalCdf, twoTailedP } from '../../src/lib/stats/gistar';
import { analyseTrends, bucketStart, mannKendall, sliceTime } from '../../src/lib/stats/trend';
import { contrastRatio, isMonotonicLightness, minPairDistance, sampleRamp, SEQUENTIAL, CATEGORICAL, simulateCvd } from '../../src/lib/palettes';
import { buildDataset, toNumber, toTime } from '../../src/lib/data/profile';

describe('classification', () => {
  it('finds the obvious natural breaks', () => {
    const v = [1, 2, 3, 2, 1, 50, 51, 52, 100, 101, 99];
    const b = jenks([...v].sort((a, b) => a - b), 3);
    expect(b).toEqual([3, 52, 101]);
    expect(gvf(v, b)).toBeGreaterThan(0.99);
  });
  it('quantile and equal interval behave', () => {
    const v = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(quantileBreaks(v, 4)).toEqual([25, 50, 75, 100]);
    expect(equalBreaks(v, 3)).toEqual([34, 67, 100]);
    expect(classOf(26, [25, 50, 75, 100])).toBe(1);
    expect(classOf(NaN, [1])).toBe(-1);
  });
  it('copes with constant data', () => {
    expect(classBreaks([5, 5, 5], 5, 'natural')).toEqual([5]);
  });
});

describe('normal distribution', () => {
  it('matches textbook values', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(twoTailedP(2.576)).toBeCloseTo(0.01, 3);
  });
});

describe('Getis-Ord Gi*', () => {
  const centre = latLngToCell(51.5, -0.12, 7);
  const area = gridDisk(centre, 6);
  it('flags a planted cluster as hot and leaves a flat field alone', () => {
    const values = new Map<string, number>();
    for (const id of area) values.set(id, 1);
    for (const id of gridDisk(centre, 1)) values.set(id, 30);
    const g = getisOrd(values, area, 1, true);
    expect(g.results.get(centre)!.bin).toBe(3);
    expect(g.results.get(centre)!.z).toBeGreaterThan(5);
    const far = area.find((id) => !gridDisk(centre, 3).includes(id))!;
    expect(g.results.get(far)!.bin).toBeLessThanOrEqual(0);

    const flat = getisOrd(new Map(area.map((id) => [id, 4])), area, 1, true);
    expect(flat.hot + flat.cold).toBe(0);
  });
  it('FDR is more conservative than raw p-values', () => {
    const values = new Map<string, number>();
    area.forEach((id, i) => values.set(id, (i * 7919) % 13));
    const raw = getisOrd(values, area, 1, false);
    const fdr = getisOrd(values, area, 1, true);
    expect(fdr.hot + fdr.cold).toBeLessThanOrEqual(raw.hot + raw.cold);
  });
});

describe('Mann-Kendall', () => {
  it('detects a rising series', () => {
    const r = mannKendall([1, 2, 3, 5, 4, 6, 8, 9, 10, 12]);
    expect(r.direction).toBe('up');
    expect(r.slope).toBeGreaterThan(0);
  });
  it('detects a falling series', () => {
    expect(mannKendall([20, 18, 17, 15, 15, 12, 10, 9, 7, 4]).direction).toBe('down');
  });
  it('stays quiet on noise and on ties', () => {
    expect(mannKendall([5, 3, 6, 4, 5, 3, 6, 4, 5, 4]).direction).toBe('none');
    expect(mannKendall([2, 2, 2, 2, 2, 2]).direction).toBe('none');
  });
});

describe('time slicing', () => {
  it('buckets by calendar month in UTC', () => {
    const t = Date.UTC(2026, 4, 17, 13);
    expect(bucketStart(t, 'month')).toBe(Date.UTC(2026, 4, 1));
    expect(new Date(bucketStart(t, 'week')).getUTCDay()).toBe(1);
  });
  it('slices a year of daily data into months', () => {
    const times = Float64Array.from({ length: 365 }, (_, i) => Date.UTC(2026, 0, 1) + i * 86400_000);
    const s = sliceTime(times, 'auto')!;
    expect(s.step).toBe('month');
    expect(s.starts.length).toBe(12);
    expect(s.sliceOf[0]).toBe(0);
    expect(s.sliceOf[364]).toBe(11);
  });
});

describe('emerging hot spots', () => {
  it('classifies a cluster that grows every period as intensifying', () => {
    const centre = latLngToCell(41.88, -87.63, 7);
    const area = gridDisk(centre, 5);
    const series = new Map<string, number[]>();
    for (const id of area) series.set(id, Array.from({ length: 12 }, () => 1));
    for (const id of gridDisk(centre, 1)) series.set(id, Array.from({ length: 12 }, (_, t) => 20 + t * 6));
    const res = analyseTrends(series, area, 12, 1, true);
    expect(res.get(centre)!.trend).toBe('rising-hot');
    expect(res.get(centre)!.emerging).toBe('intensifying');
  });
});

describe('palettes', () => {
  it('sequential ramps get darker step by step', () => {
    for (const r of SEQUENTIAL) expect(isMonotonicLightness(sampleRamp(r.stops, 7))).toBe(true);
  });
  it('the default categorical palette stays distinguishable under colour-vision deficiency', () => {
    const d = minPairDistance(CATEGORICAL[0].colors.slice(0, 6));
    expect(d.normal).toBeGreaterThan(15);
    expect(d.deutan).toBeGreaterThan(5);
  });
  it('simulation and contrast maths', () => {
    expect(simulateCvd('#ffffff', 'deutan')).toBe('#ffffff');
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('profiling', () => {
  it('reads numbers and dates people actually type', () => {
    expect(toNumber('1,204')).toBe(1204);
    expect(toNumber('12.5%')).toBe(12.5);
    expect(toNumber('NULL')).toBeNaN();
    expect(new Date(toTime('2026-03-04T10:15')).getMonth()).toBe(2);
    expect(new Date(toTime('25/12/2025')).getDate()).toBe(25);
  });
  it('builds a dataset, finds coordinates and time, drops null island', () => {
    const rows = [
      { when: '2026-01-01T10:00', Latitude: '51.5', Longitude: '-0.1', kind: 'Cat', cost: '300' },
      { when: '2026-01-02T10:00', Latitude: '0', Longitude: '0', kind: 'Dog', cost: '200' },
      { when: '2026-01-03T10:00', Latitude: '', Longitude: '-0.1', kind: 'Cat', cost: '' },
      { when: '2026-01-04T10:00', Latitude: '51.6', Longitude: '-0.2', kind: 'Bird', cost: '120' },
    ];
    const ds = buildDataset(Object.keys(rows[0]), rows, { name: 't', source: { kind: 'upload', title: 't', publisher: 'me', licence: 'own' } });
    expect(ds.latField).toBe('Latitude');
    expect(ds.timeField).toBe('when');
    expect(ds.n).toBe(2);
    expect(ds.dropped.nullIsland).toBe(1);
    expect(ds.dropped.missingCoords).toBe(1);
    expect(ds.fields.find((f) => f.name === 'kind')!.kind).toBe('qualitative');
  });
  it('explains a file without coordinates', () => {
    expect(() =>
      buildDataset(['a'], [{ a: 'x' }], { name: 't', source: { kind: 'upload', title: 't', publisher: 'me', licence: 'own' } }),
    ).toThrow(/latitude and longitude/);
  });
});
