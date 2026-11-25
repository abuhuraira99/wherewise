import { useState } from 'react';
import { useStore } from '../../state/store';
import { Field, Note, Section } from '../../ui/controls';
import { CalendarHeat, CategoryBars, DataClock, Histogram, Timeline } from '../../charts/Charts';

export function ChartsPanel() {
  const ds = useStore((s) => s.ds)!;
  const selection = useStore((s) => s.selection);
  const setSelection = useStore((s) => s.setSelection);
  const cats = ds.fields.filter((f) => f.kind === 'qualitative');
  const nums = ds.fields.filter((f) => f.kind === 'quantitative');
  const [cat, setCat] = useState(cats[0]?.name ?? '');
  const [num, setNum] = useState(nums[0]?.name ?? '');

  return (
    <>
      <Section
        title="Linked charts"
        aside={selection ? <button className="btn btn--sm" onClick={() => setSelection(null)}>Clear selection</button> : undefined}
      >
        <p className="panel-lead">Charts answer what the map cannot: how much of each kind, when, and how values are spread. Click any bar, wedge or day and the map shows only those events.</p>
        {selection && <Note tone="book">The map and every analysis now use the selected events only.</Note>}
      </Section>
      {cats.length > 0 && (
        <Section title="How much of each kind">
          <Field label="Category">
            {(id) => (
              <select id={id} className="select" value={cat} onChange={(e) => setCat(e.target.value)}>
                {cats.map((f) => <option key={f.name}>{f.name}</option>)}
              </select>
            )}
          </Field>
          {cat && <CategoryBars ds={ds} field={cat} />}
        </Section>
      )}
      {nums.length > 0 && (
        <Section title="How values are spread">
          <Field label="Amount">
            {(id) => (
              <select id={id} className="select" value={num} onChange={(e) => setNum(e.target.value)}>
                {nums.map((f) => <option key={f.name}>{f.name}</option>)}
              </select>
            )}
          </Field>
          {num && <Histogram ds={ds} field={num} />}
          <p className="field-hint">Check the shape before choosing class breaks: a long tail favours natural breaks or quantiles over equal intervals.</p>
        </Section>
      )}
      {ds.timeField && (
        <>
          <Section title="When: hour and weekday">
            <DataClock ds={ds} />
          </Section>
          <Section title="When: day by day">
            <CalendarHeat ds={ds} />
          </Section>
          <Section title="When: period by period">
            <Timeline ds={ds} />
          </Section>
        </>
      )}
    </>
  );
}
