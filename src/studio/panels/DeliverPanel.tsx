import { FileText, Image, LayoutDashboard, Link2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../../state/store';
import { Field, Group, Note, Section, Seg } from '../../ui/controls';
import { labelAudience, labelPurpose, PRODUCT_FIT } from '../../lib/honesty/audit';
import type { Audience, Product, Purpose } from '../../lib/types';

const PRODUCTS: { id: Product; name: string; icon: typeof Image; what: string }[] = [
  { id: 'poster', name: 'Print map', icon: Image, what: 'A static map with title, legend, north arrow, scale bar and sources. For reference, reports and walls.' },
  { id: 'brief', name: 'Story brief', icon: FileText, what: 'A written narrative with the map, charts and your field notes, in plain language. For a story with a beginning and an end.' },
  { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, what: 'Map, indicators, charts and a list in one view, for checking a situation at a glance. Live data refreshes itself.' },
  { id: 'app', name: 'Explorer link', icon: Link2, what: 'A link that reopens this exact view, so others can pan, filter and click for themselves.' },
];

export function DeliverPanel() {
  const ds = useStore((s) => s.ds)!;
  const d = useStore((s) => s.deliver);
  const patch = useStore((s) => s.patchDeliver);
  const setOverlay = useStore((s) => s.setOverlay);
  const [copied, setCopied] = useState(false);
  const fit = PRODUCT_FIT[d.purpose][d.audience];

  const open = (p: Product) => {
    patch({ product: p });
    if (p === 'poster') setOverlay('poster');
    if (p === 'brief') setOverlay('brief');
    if (p === 'dashboard') setOverlay('dashboard');
    if (p === 'app') {
      const st = useStore.getState();
      const params = new URLSearchParams({
        sample: ds.id,
        sta: st.station === 'deliver' ? 'test' : st.station,
        view: st.analysis.view,
        sym: st.sym.kind,
        ...(st.sym.field ? { field: st.sym.field } : {}),
        time: st.time.view,
      });
      const url = `${location.origin}/studio?${params}`;
      void navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2400); });
    }
  };

  return (
    <>
      <Section title="Who is it for?">
        <Group label="Audience">
          <Seg<Audience>
            label="Audience"
            value={d.audience}
            onChange={(audience) => patch({ audience })}
            options={[
              { value: 'public', label: 'Public' },
              { value: 'decision', label: 'Decision makers' },
              { value: 'analyst', label: 'Analysts' },
              { value: 'field', label: 'Field team' },
            ]}
          />
        </Group>
        <Group label="They need to">
          <Seg<Purpose>
            label="Purpose"
            value={d.purpose}
            onChange={(purpose) => patch({ purpose })}
            options={[
              { value: 'story', label: 'Follow a story' },
              { value: 'monitor', label: 'Monitor' },
              { value: 'reference', label: 'Reference' },
              { value: 'explore', label: 'Explore' },
            ]}
          />
        </Group>
        <Note tone="book">
          For {labelAudience(d.audience)} who need to {labelPurpose(d.purpose)}, the best fit is a <strong>{PRODUCTS.find((p) => p.id === fit)!.name.toLowerCase()}</strong>.
        </Note>
      </Section>

      <Section title="Words on the product">
        <Field label="Title">{(id) => <input id={id} className="input" value={d.title} onChange={(e) => patch({ title: e.target.value })} />}</Field>
        <Field label="Subtitle (what the reader should take away)">{(id) => <input id={id} className="input" value={d.subtitle} placeholder="e.g. Rescues are rising in three east London boroughs" onChange={(e) => patch({ subtitle: e.target.value })} />}</Field>
      </Section>

      <Section title="Make it">
        <ul className="products">
          {PRODUCTS.map((p) => (
            <li key={p.id}>
              <button className={`product ${p.id === fit ? 'is-fit' : ''}`} onClick={() => open(p.id)} disabled={p.id === 'app' && ds.source.kind === 'upload'}>
                <p.icon size={18} strokeWidth={1.6} aria-hidden />
                <span className="product-body">
                  <span className="product-name">
                    {p.name}
                    {p.id === fit && <span className="tape">Best fit</span>}
                  </span>
                  <span className="product-what">{p.id === 'app' && ds.source.kind === 'upload' ? 'Not available for uploaded files: they never leave your browser, so there is nothing to link to.' : p.what}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        {copied && <p className="field-hint" role="status">Link copied.</p>}
      </Section>
    </>
  );
}
