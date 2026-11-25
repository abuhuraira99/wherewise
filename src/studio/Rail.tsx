import { AlertTriangle, Check, Info, X } from 'lucide-react';
import { useStore } from '../state/store';
import { useAudit, applyFix } from './useAudit';
import { grade } from '../lib/honesty/audit';
import { sparkPath } from '../charts/spark';
import { mapRef } from './MapView';

export function Rail() {
  const tab = useStore((s) => s.railTab);
  const setTab = useStore((s) => s.setRailTab);
  const stakes = useStore((s) => s.stakes);
  const result = useAudit();
  if (!result) return null;
  const fails = result.findings.filter((f) => f.severity === 'fail' || f.severity === 'warn').length;

  return (
    <aside className="rail" aria-label="Field notes">
      <div className="rail-score">
        <span className="caps">Map honesty</span>
        <div className="rail-figure">
          <span className="rail-num num">{result.score}</span>
          <span className={`rail-grade grade--${grade(result.score)}`}>{grade(result.score)}</span>
        </div>
        <p>{fails === 0 ? 'Nothing on this map misleads. Every finding below passes.' : `${fails} thing${fails > 1 ? 's' : ''} on this map could mislead a reader.`}</p>
      </div>
      <div className="rail-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'findings'} onClick={() => setTab('findings')}>Findings</button>
        <button role="tab" aria-selected={tab === 'notes'} onClick={() => setTab('notes')}>
          Field notes {stakes.length > 0 && <span className="count num">{stakes.length}</span>}
        </button>
      </div>
      <div className="rail-body">
        {tab === 'findings' && (
          <ul className="findings">
            {result.findings.map((f) => (
              <li key={f.id + f.title} className={`finding finding--${f.severity}`}>
                <span className="finding-mark" aria-label={f.severity}>
                  {f.severity === 'pass' ? <Check size={12} strokeWidth={2.4} /> : f.severity === 'fail' ? <X size={12} strokeWidth={2.4} /> : f.severity === 'warn' ? <AlertTriangle size={11} strokeWidth={2.2} /> : <Info size={12} strokeWidth={2.2} />}
                </span>
                <div>
                  <h4>{f.title}</h4>
                  <p>{f.detail}</p>
                  <p className="finding-principle">{f.principle}</p>
                  {f.fix && (
                    <button className="btn btn--sm btn--book" onClick={() => applyFix(f.fix!.id)}>
                      {f.fix.label}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {tab === 'notes' && (
          <div className="notes">
            {stakes.length === 0 ? (
              <p className="notes-empty">Switch the map to hexagons or hot spots, then click a cell. Each click stakes a field note with that place's statistics.</p>
            ) : (
              <ul>
                {stakes.map((s) => {
                  const sp = s.series ? sparkPath(s.series, 220, 36) : null;
                  return (
                    <li key={s.id} className={`note-card note-card--${s.tone}`}>
                      <div className="note-card-head">
                        <button className="tape tape--btn" onClick={() => mapRef.current?.flyTo({ center: [s.lng, s.lat], zoom: Math.max(mapRef.current.getZoom(), 9), duration: 1200 })}>
                          {s.title}
                        </button>
                        <button className="btn btn--sm btn--ghost" onClick={() => useStore.getState().removeStake(s.id)} aria-label="Remove note"><X size={14} /></button>
                      </div>
                      {sp && (
                        <svg viewBox="0 0 220 36" width="100%" className="note-spark" aria-label="Events per period in this hexagon">
                          <path d={sp.area} className="spark-area" />
                          <path d={sp.line} className="spark-line" />
                        </svg>
                      )}
                      <ul className="note-lines">{s.lines.map((l) => <li key={l} className={/\d/.test(l) && l.includes('°') ? 'num' : ''}>{l}</li>)}</ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
