import { useRef, useState } from 'react';
import { FileUp, Radio, Archive } from 'lucide-react';
import { useStore } from '../state/store';
import { loadFile, loadSample, SAMPLES, type SampleDef } from '../lib/data/load';
import { DatasetError } from '../lib/data/profile';

export async function openSample(def: SampleDef) {
  const st = useStore.getState();
  st.setLoading({ label: `Opening ${def.short.toLowerCase()}`, detail: def.live ? 'Fetching the latest records' : 'Reading the survey file' });
  try {
    const ds = await loadSample(def);
    st.setDataset(ds);
  } catch (e) {
    st.setError(toUserError(e));
  }
}

export async function openFile(file: File) {
  const st = useStore.getState();
  st.setLoading({ label: `Reading ${file.name}`, detail: 'Your file stays in this browser tab' });
  try {
    const ds = await loadFile(file);
    st.setDataset(ds);
  } catch (e) {
    st.setError(toUserError(e));
  }
}

function toUserError(e: unknown) {
  if (e instanceof DatasetError) return { message: e.message, hint: e.hint };
  if (e instanceof SyntaxError) return { message: 'That file is not valid JSON.', hint: 'Check the export, or save the data as CSV instead.' };
  return { message: 'Something went wrong while reading the data.', hint: e instanceof Error ? e.message : 'Try again, or try another file.' };
}

export function DropWell({ variant = 'sheet', onPicked }: { variant?: 'sheet' | 'book'; onPicked?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined) => {
    if (!f) return;
    onPicked?.();
    void openFile(f);
  };
  return (
    <div
      className={`dropwell dropwell--${variant} ${over ? 'is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
    >
      <FileUp size={22} strokeWidth={1.6} aria-hidden />
      <div className="dropwell-text">
        <strong>Drop a CSV or GeoJSON of events</strong>
        <span>Needs latitude and longitude columns. A date column unlocks time analysis.</span>
      </div>
      <button className={`btn ${variant === 'book' ? 'btn--ink' : 'btn--book'}`} onClick={() => input.current?.click()}>
        Choose file
      </button>
      <input
        ref={input}
        type="file"
        accept=".csv,.tsv,.txt,.geojson,.json,text/csv,application/geo+json,application/json"
        className="visually-hidden"
        onChange={(e) => pick(e.target.files?.[0] ?? undefined)}
        aria-label="Choose a CSV or GeoJSON file"
      />
    </div>
  );
}

export function SampleList({ onPicked, compact = false }: { onPicked?: (s: SampleDef) => void; compact?: boolean }) {
  return (
    <ul className={`samples ${compact ? 'samples--compact' : ''}`}>
      {SAMPLES.map((s) => (
        <li key={s.id}>
          <button
            className="sample"
            onClick={() => {
              onPicked?.(s);
              void openSample(s);
            }}
          >
            <span className="sample-icon" aria-hidden>{s.live ? <Radio size={15} strokeWidth={1.8} /> : <Archive size={15} strokeWidth={1.8} />}</span>
            <span className="sample-body">
              <span className="sample-title">{s.short}</span>
              <span className="sample-meta">{s.place} · {s.rowsHint}</span>
              {!compact && <span className="sample-story">{s.story}</span>}
            </span>
            {s.live && <span className="sample-live caps">Live</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
