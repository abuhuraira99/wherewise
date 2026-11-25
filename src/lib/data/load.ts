import Papa from 'papaparse';
import type { Cell, Dataset, DatasetSource } from '../types';
import { buildDataset, DatasetError } from './profile';

export interface SampleDef {
  id: string;
  title: string;
  short: string;
  place: string;
  rowsHint: string;
  url: string;
  live: boolean;
  source: DatasetSource;
  story: string;
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'lfb',
    title: 'Animal rescues by the London Fire Brigade',
    short: 'Animal rescues',
    place: 'London, 2009 to 2026',
    rowsHint: '14,484 rescues',
    url: '/data/lfb_animal_rescues.csv',
    live: false,
    story: 'Cats in trees, swans in playgrounds, deer in canals. Seventeen years of calls, with animal, place type, borough, crew hours and cost.',
    source: {
      kind: 'sample',
      title: 'Animal rescue incidents attended by LFB',
      publisher: 'London Fire Brigade via London Datastore',
      licence: 'Open Government Licence v3.0',
      url: 'https://data.london.gov.uk/dataset/animal-rescue-incidents-attended-by-lfb-2ogkn',
      note: 'Coordinates converted from British National Grid (rounded to 50 m by the publisher) to WGS84.',
    },
  },
  {
    id: 'usgs',
    title: 'Earthquakes recorded worldwide, past 30 days',
    short: 'Earthquakes',
    place: 'World, live',
    rowsHint: 'about 9,000 events',
    url: '/api/feeds/usgs',
    live: true,
    story: 'Every event in the USGS catalogue for the last month, refreshed every ten minutes, with magnitude, depth and significance.',
    source: {
      kind: 'live',
      title: 'USGS earthquake summary feed, all events, past 30 days',
      publisher: 'U.S. Geological Survey',
      licence: 'Public domain (U.S. Government work)',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php',
    },
  },
  {
    id: 'chicago',
    title: 'Traffic crashes in Chicago, past 90 days',
    short: 'Traffic crashes',
    place: 'Chicago, live',
    rowsHint: 'about 25,000 crashes',
    url: '/api/feeds/chicago',
    live: true,
    story: 'Police-reported crashes on city streets with crash type, primary cause, weather, lighting and injuries, updated daily.',
    source: {
      kind: 'live',
      title: 'Traffic Crashes – Crashes',
      publisher: 'City of Chicago Data Portal',
      licence: 'City of Chicago Data Portal terms of use',
      url: 'https://data.cityofchicago.org/Transportation/Traffic-Crashes-Crashes/85ca-t3if',
    },
  },
];

const MAX_BYTES = 60 * 1024 * 1024;
const MAX_ROWS = 250_000;

function parseCsvText(text: string): Promise<{ columns: string[]; rows: Record<string, Cell>[] }> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: 'greedy',
      dynamicTyping: false,
      transformHeader: (h) => h.replace(/^﻿/, '').trim(),
      complete: (res) => {
        const columns = (res.meta.fields ?? []).filter(Boolean);
        if (!columns.length) return reject(new DatasetError('Could not find column names.', 'The first row of the file should hold the column names.'));
        if (res.data.length > MAX_ROWS)
          return reject(new DatasetError(`The file has ${res.data.length.toLocaleString('en-GB')} rows.`, `Wherewise keeps everything in your browser and handles up to ${MAX_ROWS.toLocaleString('en-GB')} rows. Filter the file first.`));
        resolve({ columns, rows: res.data as Record<string, Cell>[] });
      },
      error: (err: Error) => reject(new DatasetError('The file could not be read as CSV.', err.message)),
    });
  });
}

function geojsonToRows(text: string): { columns: string[]; rows: Record<string, Cell>[] } {
  const gj = JSON.parse(text) as { type: string; features?: { geometry?: { type: string; coordinates: number[] }; properties?: Record<string, Cell> }[] };
  if (gj.type !== 'FeatureCollection' || !Array.isArray(gj.features)) throw new DatasetError('This JSON is not a GeoJSON FeatureCollection.', 'Export your layer as GeoJSON with point features.');
  const rows: Record<string, Cell>[] = [];
  let skipped = 0;
  for (const f of gj.features) {
    if (f.geometry?.type !== 'Point') { skipped++; continue; }
    const [lon, lat] = f.geometry.coordinates;
    rows.push({ ...(f.properties ?? {}), latitude: lat, longitude: lon });
  }
  if (!rows.length) throw new DatasetError('No point features found.', skipped ? `${skipped} features were lines or polygons. Wherewise maps point events.` : 'The collection is empty.');
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { columns, rows };
}

/** USGS summary GeoJSON -> the tidy columns the studio shows. */
function usgsToRows(text: string): { columns: string[]; rows: Record<string, Cell>[] } {
  const gj = JSON.parse(text) as { features: { properties: Record<string, unknown>; geometry: { coordinates: number[] } | null }[] };
  const columns = ['date_time', 'event_type', 'magnitude', 'magnitude_type', 'significance', 'depth_km', 'place', 'tsunami_flag', 'latitude', 'longitude'];
  const rows: Record<string, Cell>[] = [];
  for (const f of gj.features) {
    if (!f.geometry || !Array.isArray(f.geometry.coordinates)) continue;
    const p = f.properties;
    const [lon, lat, depth] = f.geometry.coordinates;
    rows.push({
      date_time: new Date(Number(p.time)).toISOString().slice(0, 16),
      event_type: String(p.type ?? ''),
      magnitude: typeof p.mag === 'number' ? p.mag : null,
      magnitude_type: String(p.magType ?? ''),
      significance: typeof p.sig === 'number' ? p.sig : null,
      depth_km: typeof depth === 'number' ? Math.round(depth * 10) / 10 : null,
      place: String(p.place ?? ''),
      tsunami_flag: typeof p.tsunami === 'number' ? p.tsunami : null,
      latitude: lat,
      longitude: lon,
    });
  }
  return { columns, rows };
}

export async function loadFile(file: File): Promise<Dataset> {
  if (file.size > MAX_BYTES) throw new DatasetError('That file is larger than 60 MB.', 'Filter it to the events you need, or split it by year.');
  const text = await file.text();
  const name = file.name.replace(/\.(csv|tsv|txt|geojson|json)$/i, '');
  const isJson = /\.(geo)?json$/i.test(file.name) || /^\s*\{/.test(text.slice(0, 50));
  const { columns, rows } = isJson ? geojsonToRows(text) : await parseCsvText(text);
  return buildDataset(columns, rows, {
    name,
    source: { kind: 'upload', title: file.name, publisher: 'Your file', licence: 'Yours. It stays in this browser tab.' },
  });
}

export async function loadSample(def: SampleDef, signal?: AbortSignal): Promise<Dataset> {
  const res = await fetch(def.url, { signal });
  if (!res.ok) {
    let msg = `The ${def.short.toLowerCase()} feed is not answering right now.`;
    try {
      const j = (await res.json()) as { message?: string };
      if (j.message) msg += ` (${j.message})`;
    } catch {
      /* not json */
    }
    throw new DatasetError(msg, 'Try again in a minute, or open the London sample, which is stored with the app.');
  }
  const text = await res.text();
  const { columns, rows } = def.id === 'usgs' ? usgsToRows(text) : await parseCsvText(text);
  if (def.id === 'chicago') {
    const title = (s: Cell) => (typeof s === 'string' ? s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()) : s);
    for (const r of rows) {
      r.date_time = typeof r.date_time === 'string' ? r.date_time.slice(0, 16) : r.date_time;
      for (const k of ['crash_type', 'primary_cause', 'weather', 'lighting']) r[k] = title(r[k]);
    }
  }
  return buildDataset(columns, rows, {
    id: def.id,
    name: def.title,
    source: {
      ...def.source,
      stale: res.headers.get('x-wherewise-stale') === '1',
      generatedAt: res.headers.get('x-wherewise-generated') ?? undefined,
    },
    latField: 'latitude',
    lonField: 'longitude',
    timeField: 'date_time',
  });
}
