import { useStore } from '../../state/store';
import { Section, Note, Field } from '../../ui/controls';
import { DropWell, SampleList } from '../../ui/Intake';
import { timeExtent } from '../../lib/compute';
import { niceNumber } from '../../lib/stats/classify';
import type { FieldKind } from '../../lib/types';
import { toTime } from '../../lib/data/profile';

const KIND_LABEL: Record<FieldKind, string> = {
  latitude: 'Latitude',
  longitude: 'Longitude',
  datetime: 'Date',
  quantitative: 'Amount',
  qualitative: 'Category',
  text: 'Text',
  id: 'Identifier',
};

export function SurveyPanel() {
  const ds = useStore((s) => s.ds)!;
  const updateDataset = useStore((s) => s.updateDataset);
  const ext = timeExtent(ds);
  const lat = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'S' : 'N'}`;
  const lon = (v: number) => `${Math.abs(v).toFixed(2)}°${v < 0 ? 'W' : 'E'}`;
  const [w, s, e, n] = ds.bbox;
  const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const dropped = ds.dropped.missingCoords + ds.dropped.nullIsland + ds.dropped.outOfRange;

  const changeTime = (field: string) => {
    const time = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) time[i] = field ? toTime(ds.rows[i][field]) : NaN;
    updateDataset({ ...ds, timeField: field || null, time });
  };

  return (
    <>
      <Section title="The survey">
        <dl className="facts">
          <div><dt>Events placed</dt><dd className="num">{ds.n.toLocaleString('en-GB')}</dd></div>
          <div><dt>Not placed</dt><dd className="num">{dropped.toLocaleString('en-GB')}</dd></div>
          <div><dt>Extent</dt><dd className="num">{lat(s)} to {lat(n)}<br />{lon(w)} to {lon(e)}</dd></div>
          <div><dt>Period</dt><dd className="num">{ext ? <>{fmtDate(ext[0])}<br />{fmtDate(ext[1])}</> : 'no dates'}</dd></div>
        </dl>
        {dropped > 0 && (
          <Note>
            {ds.dropped.missingCoords > 0 && `${ds.dropped.missingCoords.toLocaleString('en-GB')} rows had no coordinates. `}
            {ds.dropped.nullIsland > 0 && `${ds.dropped.nullIsland} sat at 0°, 0°, a common sign of a failed geocode. `}
            {ds.dropped.outOfRange > 0 && `${ds.dropped.outOfRange} were out of range. `}
            They are left off the map and reported in the caption.
          </Note>
        )}
        <div className="source">
          <span className="caps">Source</span>
          <p>
            {ds.source.url ? <a href={ds.source.url} target="_blank" rel="noreferrer">{ds.source.title}</a> : ds.source.title}
            <br />
            <span className="muted">{ds.source.publisher} · {ds.source.licence}</span>
          </p>
          {ds.source.note && <p className="muted small">{ds.source.note}</p>}
          {ds.source.stale && <Note tone="flag">The live feed is down, so this is the last saved copy.</Note>}
        </div>
      </Section>

      <Section title="What each column is">
        <p className="panel-lead">Qualitative columns say what kind, quantitative columns say how much. The difference decides how each can be drawn.</p>
        <ul className="fieldlist">
          {ds.fields.map((f) => (
            <li key={f.name}>
              <div className="fieldlist-head">
                <span className="fieldlist-name">{f.name}</span>
                <span className={`kind kind--${f.kind}`}>{KIND_LABEL[f.kind]}</span>
              </div>
              <p className="fieldlist-reason">{f.reason}</p>
              {f.kind === 'quantitative' && f.min !== undefined && (
                <p className="fieldlist-range num">{niceNumber(f.min)} to {niceNumber(f.max!)}, mean {niceNumber(f.mean ?? NaN)}</p>
              )}
              {f.kind === 'qualitative' && f.categories && (
                <p className="fieldlist-range">{f.categories.length} values: {f.categories.slice(0, 3).map((c) => c.value).join(', ')}{f.categories.length > 3 ? '…' : ''}</p>
              )}
            </li>
          ))}
        </ul>
        <Field label="Date column for time analysis">
          {(id) => (
            <select id={id} className="select" value={ds.timeField ?? ''} onChange={(e) => changeTime(e.target.value)}>
              <option value="">None</option>
              {ds.fields.filter((f) => f.kind === 'datetime').map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
            </select>
          )}
        </Field>
      </Section>

      <Section title="Open different data">
        <DropWell />
        <SampleList compact />
      </Section>
    </>
  );
}
