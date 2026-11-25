import type { Cell, Dataset, DatasetSource, Field, FieldKind } from '../types';

const LAT_NAMES = /^(lat|latitude|lat_dd|y_lat|ycoord|y|point_y|.*_lat|.*latitude)$/i;
const LON_NAMES = /^(lon|lng|long|longitude|lon_dd|x_lon|xcoord|x|point_x|.*_lon|.*_lng|.*longitude)$/i;
const TIME_NAMES = /(date|time|timestamp|datetime|occurred|reported|created|when|day)/i;
const ID_NAMES = /(^id$|_id$|^id_|number$|^uuid|^uid|incident.?no|reference)/i;

/** Parse a cell into a number when it plainly is one ("1,204" and "12.5%" included). */
export function toNumber(v: Cell): number {
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return NaN;
  const s = String(v).trim();
  if (s === '' || /^(null|na|n\/a|nan|none|-)$/i.test(s)) return NaN;
  const cleaned = s.replace(/,(?=\d{3}\b)/g, '').replace(/%$/, '').replace(/^[£$€]/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

const ISO_LIKE = /^\d{4}-\d{1,2}-\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parse common date formats to epoch ms. Day-first is assumed for d/m/y when the
 * first part exceeds 12; otherwise month-first (US) unless `dayFirst` is set.
 */
export function toTime(v: Cell, dayFirst = false): number {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') {
    // epoch seconds or ms
    if (v > 1e11 && v < 1e14) return v;
    if (v > 1e8 && v < 1e11) return v * 1000;
    return NaN;
  }
  const s = String(v).trim();
  if (!s) return NaN;
  if (ISO_LIKE.test(s)) {
    const norm = s.includes('T') || !s.includes(' ') ? s : s.replace(' ', 'T');
    // timestamps without a zone are kept exactly as recorded (read as UTC), so the
    // hour a clerk typed is the hour the data clock shows, wherever the viewer is
    const full = norm.length <= 10 ? norm + 'T00:00' : norm;
    const t = Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(full) ? full : full + 'Z');
    return Number.isFinite(t) ? t : NaN;
  }
  const m = s.match(DMY);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    if (a > 12 || dayFirst) [a, b] = [b, a];
    return Date.UTC(Number(m[3]), a - 1, b, Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0));
  }
  if (/^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}/.test(s) || /^\d{1,2} [A-Za-z]{3,9}\.? \d{4}/.test(s)) {
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : NaN;
  }
  return NaN;
}

interface ColumnScan {
  nonNull: number;
  numeric: number;
  times: number;
  distinct: Map<string, number>;
  min: number;
  max: number;
  sum: number;
  intLike: number;
}

function scanColumn(rows: Record<string, Cell>[], name: string, limit: number): ColumnScan {
  const scan: ColumnScan = { nonNull: 0, numeric: 0, times: 0, distinct: new Map(), min: Infinity, max: -Infinity, sum: 0, intLike: 0 };
  const step = Math.max(1, Math.floor(rows.length / limit));
  for (let i = 0; i < rows.length; i += step) {
    const raw = rows[i][name];
    if (raw === null || raw === undefined || String(raw).trim() === '') continue;
    scan.nonNull++;
    const key = String(raw).trim();
    if (scan.distinct.size < 5000) scan.distinct.set(key, (scan.distinct.get(key) ?? 0) + 1);
    const n = toNumber(raw);
    if (Number.isFinite(n)) {
      scan.numeric++;
      scan.sum += n;
      if (n < scan.min) scan.min = n;
      if (n > scan.max) scan.max = n;
      if (Number.isInteger(n)) scan.intLike++;
    } else if (Number.isFinite(toTime(raw))) {
      scan.times++;
    }
  }
  return scan;
}

export interface CoordinateGuess {
  lat: string | null;
  lon: string | null;
}

export function guessCoordinates(columns: string[], rows: Record<string, Cell>[]): CoordinateGuess {
  const numericRange = (c: string, lo: number, hi: number) => {
    const s = scanColumn(rows, c, 2000);
    return s.nonNull > 0 && s.numeric / s.nonNull > 0.95 && s.min >= lo && s.max <= hi && s.max - s.min > 0;
  };
  const lat = columns.find((c) => LAT_NAMES.test(c) && numericRange(c, -90, 90)) ?? null;
  const lon = columns.find((c) => LON_NAMES.test(c) && c !== lat && numericRange(c, -180, 180)) ?? null;
  return { lat, lon };
}

export function profileFields(columns: string[], rows: Record<string, Cell>[], coords: CoordinateGuess): Field[] {
  const n = rows.length;
  return columns.map((name): Field => {
    const scan = scanColumn(rows, name, 20000);
    const sampled = scan.nonNull;
    const nulls = Math.max(0, Math.round(n - (sampled * n) / Math.max(1, Math.min(n, 20000))));
    const distinct = scan.distinct.size;
    const sample = [...scan.distinct.keys()].slice(0, 5);
    const base = { name, nulls, distinct, sample };
    if (name === coords.lat) return { ...base, kind: 'latitude', reason: 'Numbers between -90 and 90 in a column named like latitude.', min: scan.min, max: scan.max };
    if (name === coords.lon) return { ...base, kind: 'longitude', reason: 'Numbers between -180 and 180 in a column named like longitude.', min: scan.min, max: scan.max };

    const numShare = sampled ? scan.numeric / sampled : 0;
    const timeShare = sampled ? scan.times / sampled : 0;
    let kind: FieldKind;
    let reason: string;
    if (timeShare > 0.9 || (TIME_NAMES.test(name) && timeShare > 0.6)) {
      kind = 'datetime';
      reason = `${Math.round(timeShare * 100)}% of values read as dates or times.`;
    } else if (numShare > 0.9) {
      const uniqueRatio = distinct / Math.max(1, sampled);
      if (ID_NAMES.test(name) && uniqueRatio > 0.9) {
        kind = 'id';
        reason = 'Every row has its own number, so it identifies records rather than measuring them.';
      } else if (distinct <= 7 && scan.intLike === scan.numeric && scan.max - scan.min <= 10) {
        kind = 'quantitative';
        reason = `Whole numbers with only ${distinct} distinct values: an amount, but a coarse one. Treat breaks with care.`;
      } else {
        kind = 'quantitative';
        reason = 'Numbers that answer "how much" or "how many", so size and lightness can show magnitude.';
      }
    } else {
      const uniqueRatio = distinct / Math.max(1, sampled);
      if (distinct <= Math.max(60, Math.min(250, sampled * 0.02))) {
        kind = 'qualitative';
        reason = `${distinct} categories that answer "what kind", so hue or shape should tell them apart without implying order.`;
      } else if (ID_NAMES.test(name) && uniqueRatio > 0.9) {
        kind = 'id';
        reason = 'Unique text per row, used to identify records.';
      } else {
        kind = 'text';
        reason = 'Free text with many distinct values. Useful for labels and pop-ups, not for colour.';
      }
    }
    const field: Field = { ...base, kind, reason };
    if (kind === 'quantitative') {
      field.min = scan.min;
      field.max = scan.max;
      field.mean = scan.numeric ? scan.sum / scan.numeric : undefined;
    }
    if (kind === 'qualitative') {
      field.categories = [...scan.distinct.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);
    }
    return field;
  });
}

/** Recount categories over every row (profiling samples large files). */
export function exactCategories(rows: Record<string, Cell>[], name: string) {
  const m = new Map<string, number>();
  for (const r of rows) {
    const v = r[name];
    const key = v === null || v === undefined || String(v).trim() === '' ? '(blank)' : String(v).trim();
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export class DatasetError extends Error {
  constructor(message: string, readonly hint: string) {
    super(message);
  }
}

export interface BuildOptions {
  id?: string;
  name: string;
  source: DatasetSource;
  latField?: string;
  lonField?: string;
  timeField?: string | null;
}

/** Turn parsed rows into a Dataset with coordinate and time arrays. */
export function buildDataset(columns: string[], rowsIn: Record<string, Cell>[], opts: BuildOptions): Dataset {
  if (!rowsIn.length) throw new DatasetError('The file has no rows.', 'Check that the first line holds column names and the rest hold records.');
  const guess = opts.latField && opts.lonField ? { lat: opts.latField, lon: opts.lonField } : guessCoordinates(columns, rowsIn);
  if (!guess.lat || !guess.lon) {
    throw new DatasetError(
      'No latitude and longitude columns found.',
      'Wherewise needs two columns with decimal degrees, named like "latitude" and "longitude" (or "lat"/"lon"). Addresses must be geocoded first.',
    );
  }
  const latName = guess.lat;
  const lonName = guess.lon;
  const fields = profileFields(columns, rowsIn, guess);
  const timeField =
    opts.timeField !== undefined
      ? opts.timeField
      : (fields.find((f) => f.kind === 'datetime' && TIME_NAMES.test(f.name)) ?? fields.find((f) => f.kind === 'datetime'))?.name ?? null;

  const dayFirst = timeField ? detectDayFirst(rowsIn, timeField) : false;
  const keep: Record<string, Cell>[] = [];
  const lat: number[] = [];
  const lon: number[] = [];
  const time: number[] = [];
  const dropped = { missingCoords: 0, nullIsland: 0, outOfRange: 0 };
  let w = 180, s = 90, e = -180, nn = -90;
  for (const r of rowsIn) {
    const la = toNumber(r[latName]);
    const lo = toNumber(r[lonName]);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) { dropped.missingCoords++; continue; }
    if (Math.abs(la) < 1e-6 && Math.abs(lo) < 1e-6) { dropped.nullIsland++; continue; }
    if (la < -90 || la > 90 || lo < -180 || lo > 180) { dropped.outOfRange++; continue; }
    keep.push(r);
    lat.push(la);
    lon.push(lo);
    time.push(timeField ? toTime(r[timeField], dayFirst) : NaN);
    if (lo < w) w = lo;
    if (lo > e) e = lo;
    if (la < s) s = la;
    if (la > nn) nn = la;
  }
  if (!keep.length) {
    throw new DatasetError('None of the rows have usable coordinates.', `Every value in "${latName}"/"${lonName}" was empty, zero or out of range.`);
  }
  for (const f of fields) {
    if (f.kind === 'qualitative') f.categories = exactCategories(keep, f.name);
  }
  return {
    id: opts.id ?? `ds-${Date.now().toString(36)}`,
    name: opts.name,
    source: opts.source,
    rows: keep,
    fields,
    latField: latName,
    lonField: lonName,
    timeField,
    lat: Float64Array.from(lat),
    lon: Float64Array.from(lon),
    time: Float64Array.from(time),
    n: keep.length,
    dropped,
    bbox: [w, s, e, nn],
  };
}

function detectDayFirst(rows: Record<string, Cell>[], field: string): boolean {
  let firstOver12 = 0;
  let secondOver12 = 0;
  for (let i = 0; i < Math.min(rows.length, 3000); i++) {
    const m = String(rows[i][field] ?? '').match(DMY);
    if (!m) continue;
    if (Number(m[1]) > 12) firstOver12++;
    if (Number(m[2]) > 12) secondOver12++;
  }
  return firstOver12 > secondOver12;
}

/** Fields that can drive colour or size, grouped by kind, for pickers. */
export function fieldsOfKind(ds: Dataset, ...kinds: FieldKind[]) {
  return ds.fields.filter((f) => kinds.includes(f.kind));
}
