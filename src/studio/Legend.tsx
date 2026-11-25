import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Scene } from './useScene';

export function Legend({ scene }: { scene: Scene }) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 720);
  const { legend } = scene;
  if (!legend.items.length && !legend.sizes?.length && scene.mode !== 'heat') return null;
  return (
    <section className={`legend ${open ? '' : 'is-closed'}`} aria-label="Map legend">
      <button className="legend-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="legend-title">{legend.title.replace(/_/g, ' ')}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="legend-body">
          {scene.mode === 'heat' && (
            <div className="legend-heat">
              <span className="legend-heat-ramp" />
              <span className="legend-heat-labels"><span>fewer</span><span>more events nearby</span></span>
            </div>
          )}
          {legend.sizes && (
            <div className="legend-sizes">
              {legend.sizes.map((s) => (
                <span key={s.label} className="legend-size">
                  <svg width={s.r * 2 + 2} height={s.r * 2 + 2} aria-hidden>
                    <circle cx={s.r + 1} cy={s.r + 1} r={s.r} />
                  </svg>
                  <span className="num">{s.label}</span>
                </span>
              ))}
            </div>
          )}
          {legend.items.length > 0 && (
            <ul>
              {legend.items.map((it) => (
                <li key={it.label}>
                  <span className={`swatch ${scene.mode === 'points' ? 'swatch--dot' : ''}`} style={{ background: it.color }} />
                  <span className="legend-label">{it.label}</span>
                  {it.count !== undefined && <span className="legend-count num">{it.count.toLocaleString('en-GB')}</span>}
                </li>
              ))}
            </ul>
          )}
          {legend.note && <p className="legend-note">{legend.note}</p>}
        </div>
      )}
    </section>
  );
}
