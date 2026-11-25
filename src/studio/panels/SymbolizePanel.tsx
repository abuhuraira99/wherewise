import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useStore } from '../../state/store';
import { Field, Group, Note, Section, Seg, Slider, Toggle } from '../../ui/controls';
import { CATEGORICAL, SEQUENTIAL, sampleRamp } from '../../lib/palettes';
import type { BlendMode, LabelClass, SymbologyKind } from '../../lib/types';
import { compile, FUNCTIONS, validateFields, valueToText, ExpressionError } from '../../lib/expr/expression';
import { classBreaks, gvf } from '../../lib/stats/classify';
import { toNumber } from '../../lib/data/profile';

const KINDS: { value: SymbologyKind; label: string; title: string }[] = [
  { value: 'single', label: 'Single', title: 'One symbol for every event: shows location only' },
  { value: 'unique', label: 'Categories', title: 'A hue per category (qualitative)' },
  { value: 'graduated', label: 'Graduated', title: 'Light to dark by amount (quantitative)' },
  { value: 'proportional', label: 'Size', title: 'Symbol area grows with the amount' },
  { value: 'multivariate', label: 'Several', title: 'Size, colour and transparency each carry a different attribute' },
];

const BLENDS: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'screen', label: 'Screen' },
  { value: 'darken', label: 'Darken' },
];

export function SymbolizePanel() {
  const ds = useStore((s) => s.ds)!;
  const sym = useStore((s) => s.sym);
  const patch = useStore((s) => s.patchSym);
  const analysis = useStore((s) => s.analysis);
  const patchAnalysis = useStore((s) => s.patchAnalysis);
  const usable = ds.fields.filter((f) => f.kind !== 'latitude' && f.kind !== 'longitude' && f.kind !== 'id');
  const quant = ds.fields.filter((f) => f.kind === 'quantitative');
  const cat = ds.fields.filter((f) => f.kind === 'qualitative');
  const field = ds.fields.find((f) => f.name === sym.field);

  const fit = useMemo(() => {
    if (sym.kind !== 'graduated' || !field || field.kind !== 'quantitative') return null;
    const vals = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) vals[i] = toNumber(ds.rows[i][field.name]);
    return gvf(vals, classBreaks(vals, sym.classes, sym.method));
  }, [ds, sym.kind, field, sym.classes, sym.method]);

  const setKind = (kind: SymbologyKind) => {
    const next: Partial<typeof sym> = { kind };
    if (kind === 'unique' && (!field || field.kind !== 'qualitative')) next.field = cat[0]?.name ?? sym.field;
    if ((kind === 'graduated' || kind === 'proportional') && (!field || field.kind !== 'quantitative')) next.field = quant[0]?.name ?? sym.field;
    if (kind === 'multivariate') {
      next.sizeField = sym.sizeField ?? quant[0]?.name ?? null;
      next.colorField = sym.colorField ?? quant[1]?.name ?? cat[0]?.name ?? null;
      next.fadeByRecency = !!ds.timeField;
    }
    patch(next);
  };

  return (
    <>
      <Section title="Symbols">
        {analysis.view !== 'points' && (
          <Note tone="book">
            The map is showing {analysis.view === 'gistar' ? 'hot spots' : analysis.view === 'hex' ? 'hexagons' : 'a heat map'}.{' '}
            <button className="linkish" onClick={() => patchAnalysis({ view: 'points' })}>Show the points</button> to see symbol changes.
          </Note>
        )}
        <Group label="Symbology">
          <Seg label="Symbology" value={sym.kind} options={KINDS} onChange={setKind} />
        </Group>
        {sym.kind !== 'single' && sym.kind !== 'multivariate' && (
          <Field label={sym.kind === 'unique' ? 'Colour by' : sym.kind === 'proportional' ? 'Size by' : 'Shade by'}>
            {(id) => (
              <select id={id} className="select" value={sym.field ?? ''} onChange={(e) => patch({ field: e.target.value })}>
                {usable.map((f) => (
                  <option key={f.name} value={f.name}>{f.name} · {f.kind === 'quantitative' ? 'amount' : f.kind === 'qualitative' ? 'category' : f.kind}</option>
                ))}
              </select>
            )}
          </Field>
        )}
        {sym.kind === 'multivariate' && (
          <>
            <Field label="Size by">
              {(id) => (
                <select id={id} className="select" value={sym.sizeField ?? ''} onChange={(e) => patch({ sizeField: e.target.value || null })}>
                  {quant.map((f) => <option key={f.name}>{f.name}</option>)}
                </select>
              )}
            </Field>
            <Field label="Colour by">
              {(id) => (
                <select id={id} className="select" value={sym.colorField ?? ''} onChange={(e) => patch({ colorField: e.target.value || null })}>
                  {usable.map((f) => <option key={f.name}>{f.name}</option>)}
                </select>
              )}
            </Field>
            {ds.timeField && <Toggle checked={sym.fadeByRecency} onChange={(v) => patch({ fadeByRecency: v })}>Transparency shows age (older is fainter)</Toggle>}
            <Note>One attribute per visual variable: size for magnitude, colour for kind or intensity, transparency for recency. Readers can decode all three at once.</Note>
          </>
        )}

        {(sym.kind === 'graduated' || (sym.kind === 'multivariate' && ds.fields.find((f) => f.name === sym.colorField)?.kind === 'quantitative')) && (
          <>
            <Group label="Class breaks">
              <Seg
                label="Classification"
                value={sym.method}
                onChange={(method) => patch({ method })}
                options={[
                  { value: 'natural', label: 'Natural breaks', title: 'Jenks: groups similar values, splits at gaps' },
                  { value: 'quantile', label: 'Quantile', title: 'Same number of events in each class' },
                  { value: 'equal', label: 'Equal interval', title: 'Same width of value range in each class' },
                ]}
              />
            </Group>
            <Slider label="Classes" value={sym.classes} min={3} max={9} onChange={(classes) => patch({ classes })} />
            {fit !== null && <p className="field-hint">Goodness of variance fit <span className="num">{(fit * 100).toFixed(1)}%</span>. Above 80% the classes describe the data well.</p>}
            <Group label="Colour ramp">
              <div className="ramps">
                {SEQUENTIAL.map((r) => (
                  <button key={r.id} className={`ramp ${sym.ramp === r.id ? 'is-active' : ''}`} onClick={() => patch({ ramp: r.id })} aria-pressed={sym.ramp === r.id} title={r.name}>
                    {sampleRamp(r.stops, sym.classes).map((c) => <span key={c} style={{ background: c }} />)}
                    <span className="visually-hidden">{r.name}</span>
                  </button>
                ))}
              </div>
            </Group>
          </>
        )}
        {(sym.kind === 'unique' || (sym.kind === 'multivariate' && ds.fields.find((f) => f.name === sym.colorField)?.kind !== 'quantitative')) && (
          <>
            <Field label="Palette">
              {(id) => (
                <select id={id} className="select" value={sym.categoryPalette} onChange={(e) => patch({ categoryPalette: e.target.value })}>
                  {CATEGORICAL.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
            </Field>
            <Slider label="Categories with their own colour" value={sym.maxCategories} min={3} max={8} onChange={(maxCategories) => patch({ maxCategories })} />
          </>
        )}
        <Slider label={sym.kind === 'proportional' || sym.kind === 'multivariate' ? 'Largest symbol' : 'Symbol size'} value={sym.size} min={1.5} max={10} step={0.5} onChange={(size) => patch({ size })} format={(v) => `${v}px`} />
        <Slider label="Opacity" value={Math.round(sym.opacity * 100)} min={10} max={100} step={5} onChange={(v) => patch({ opacity: v / 100 })} format={(v) => `${v}%`} />
      </Section>

      <Section title="Blending">
        <p className="panel-lead">Layer blending mixes the symbols with the basemap below, so labels and roads stay readable. Feature blending mixes overlapping symbols with each other, so stacks show up.</p>
        <Field label="Layer blend">
          {(id) => (
            <select id={id} className="select" value={sym.layerBlend} onChange={(e) => patch({ layerBlend: e.target.value as BlendMode })}>
              {BLENDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Feature blend">
          {(id) => (
            <select id={id} className="select" value={sym.featureBlend} onChange={(e) => patch({ featureBlend: e.target.value as BlendMode })}>
              {BLENDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          )}
        </Field>
      </Section>

      <LabelsSection />
      <ExpressionSection />
    </>
  );
}

function LabelsSection() {
  const ds = useStore((s) => s.ds)!;
  const labels = useStore((s) => s.labels);
  const patch = useStore((s) => s.patchLabels);
  const text = ds.fields.find((f) => f.kind === 'text') ?? ds.fields.find((f) => f.kind === 'qualitative');
  const num = ds.fields.find((f) => f.kind === 'quantitative');

  const addClass = () => {
    const id = `lc${Date.now().toString(36)}`;
    const first = labels.classes.length === 0;
    const cls: LabelClass = {
      id,
      name: first ? 'All events' : `Class ${labels.classes.length + 1}`,
      expression: text ? `$feature["${text.name}"]` : num ? `Text($feature["${num.name}"], 0)` : '"Event"',
      where: '',
      face: first ? 'sans' : 'serif',
      italic: false,
      bold: false,
      size: 11,
      color: '#14181d',
      halo: true,
      caps: false,
    };
    patch({ enabled: true, classes: [...labels.classes, cls] });
  };
  const update = (id: string, p: Partial<LabelClass>) => patch({ classes: labels.classes.map((c) => (c.id === id ? { ...c, ...p } : c)) });

  return (
    <Section title="Labels" aside={<Toggle checked={labels.enabled} onChange={(enabled) => (enabled && !labels.classes.length ? addClass() : patch({ enabled }))}>On</Toggle>}>
      <p className="panel-lead">Two typefaces at most: a serif and a sans that complement each other. Use one for each kind of feature, and italics for water.</p>
      {labels.enabled && (
        <>
          <Field label="Typeface pair">
            {(id) => (
              <select id={id} className="select" value={labels.pair} onChange={(e) => patch({ pair: e.target.value as typeof labels.pair })}>
                <option value="georgia-verdana">Georgia + Verdana</option>
                <option value="archivo-georgia">Georgia + Archivo</option>
              </select>
            )}
          </Field>
          <Slider label="Show labels from zoom" value={labels.minZoom} min={2} max={16} onChange={(minZoom) => patch({ minZoom })} />
          {labels.classes.map((c) => (
            <div key={c.id} className="labelclass">
              <div className="labelclass-head">
                <input className="input input--bare" value={c.name} onChange={(e) => update(c.id, { name: e.target.value })} aria-label="Label class name" />
                <button className="btn btn--sm btn--ghost" onClick={() => patch({ classes: labels.classes.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.name}`}>
                  <Trash2 size={14} />
                </button>
              </div>
              <ExprInput label="Text" value={c.expression} onChange={(expression) => update(c.id, { expression })} />
              <ExprInput label="Only where (optional)" value={c.where} onChange={(where) => update(c.id, { where })} placeholder={'$feature.animal == "Cat"'} />
              <div className="labelclass-row">
                <Seg label="Typeface" value={c.face} onChange={(face) => update(c.id, { face })} options={[{ value: 'serif', label: 'Serif' }, { value: 'sans', label: 'Sans' }]} />
                <button className={`chip ${c.italic ? 'is-on' : ''}`} aria-pressed={c.italic} onClick={() => update(c.id, { italic: !c.italic })}><em>I</em></button>
                <button className={`chip ${c.bold ? 'is-on' : ''}`} aria-pressed={c.bold} onClick={() => update(c.id, { bold: !c.bold })}><strong>B</strong></button>
                <button className={`chip ${c.caps ? 'is-on' : ''}`} aria-pressed={c.caps} onClick={() => update(c.id, { caps: !c.caps })}>AA</button>
                <input type="color" className="colorpick" value={c.color} onChange={(e) => update(c.id, { color: e.target.value })} aria-label="Label colour" />
              </div>
              <div className="labelclass-row">
                <Slider label="Size" value={c.size} min={8} max={20} onChange={(size) => update(c.id, { size })} format={(v) => `${v}px`} />
                <Toggle checked={c.halo} onChange={(halo) => update(c.id, { halo })}>Halo</Toggle>
              </div>
            </div>
          ))}
          <button className="btn btn--sm" onClick={addClass}><Plus size={14} /> Add label class</button>
        </>
      )}
    </Section>
  );
}

function ExprInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const ds = useStore((s) => s.ds)!;
  let error: string | null = null;
  if (value.trim()) {
    try {
      error = validateFields(compile(value), ds.fields.map((f) => f.name));
    } catch (e) {
      error = e instanceof ExpressionError ? e.message : 'Invalid expression';
    }
  }
  return (
    <Field label={label} hint={error ? <span className="err">{error}</span> : undefined}>
      {(id) => <input id={id} className={`input mono ${error ? 'is-error' : ''}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />}
    </Field>
  );
}

function ExpressionSection() {
  const ds = useStore((s) => s.ds)!;
  const add = useStore((s) => s.addDerivedField);
  const num = ds.fields.filter((f) => f.kind === 'quantitative');
  const starter = num.length >= 2
    ? `var ratio = $feature["${num[0].name}"] / Max($feature["${num[1].name}"], 1);\nreturn Round(ratio, 2);`
    : ds.timeField
      ? `Weekday($feature["${ds.timeField}"])`
      : num.length
        ? `Round($feature["${num[0].name}"] * 1.0, 1)`
        : '"Event"';
  const [src, setSrc] = useState(starter);
  const [name, setName] = useState('calculated');
  const [open, setOpen] = useState(false);
  const result = useMemo(() => {
    try {
      const c = compile(src);
      const missing = validateFields(c, ds.fields.map((f) => f.name));
      if (missing) return { error: missing };
      const preview = [0, 1, 2].filter((i) => i < ds.n).map((i) => valueToText(c.run(ds.rows[i])));
      return { c, preview };
    } catch (e) {
      return { error: e instanceof ExpressionError ? e.message : 'Invalid expression' };
    }
  }, [src, ds]);

  const apply = () => {
    if (!('c' in result) || !result.c) return;
    const values = ds.rows.map((r) => {
      try {
        const v = result.c!.run(r);
        return typeof v === 'boolean' ? String(v) : (v as string | number | null);
      } catch {
        return null;
      }
    });
    add(name.trim().replace(/\s+/g, '_') || 'calculated', src, values);
  };

  return (
    <Section title="Calculated field">
      <p className="panel-lead">Write an expression to derive a new column: a rate, a conversion, a day of the week. It becomes available for colour, size and labels.</p>
      <Field label="Field name">{(id) => <input id={id} className="input" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Expression" hint={'error' in result ? <span className="err">{result.error}</span> : <span className="num">→ {result.preview?.join(' · ')}</span>}>
        {(id) => <textarea id={id} className="textarea" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} rows={4} />}
      </Field>
      <div className="row">
        <button className="btn btn--sm btn--ink" onClick={apply} disabled={'error' in result}>Add field</button>
        <button className="btn btn--sm btn--ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Hide' : 'Show'} functions</button>
      </div>
      {open && (
        <dl className="fnref">
          {Object.entries(FUNCTIONS).map(([k, f]) => (
            <div key={k}><dt className="mono">{f.sig}</dt><dd>{f.doc}</dd></div>
          ))}
        </dl>
      )}
    </Section>
  );
}
