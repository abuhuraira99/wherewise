import { useStore } from '../state/store';
import { STATIONS } from './stations';
import { useAudit } from './useAudit';
import { grade } from '../lib/honesty/audit';
import { Wordmark } from '../ui/Wordmark';
import { navigate } from '../router';

export function TopBar() {
  const ds = useStore((s) => s.ds);
  const station = useStore((s) => s.station);
  const setStation = useStore((s) => s.setStation);
  const setRailTab = useStore((s) => s.setRailTab);
  const result = useAudit();
  const current = STATIONS.findIndex((s) => s.id === station);

  return (
    <header className="topbar">
      <a className="topbar-brand" href="/" onClick={(e) => { e.preventDefault(); navigate('/'); }} aria-label="Wherewise home">
        <Wordmark />
      </a>
      <nav className="traverse" aria-label="Workflow stations">
        <ol>
          {STATIONS.map((s, k) => {
            const done = k < current;
            const active = s.id === station;
            return (
              <li key={s.id} className={`sta ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
                <button onClick={() => setStation(s.id)} disabled={!ds && s.id !== 'survey'} aria-current={active ? 'step' : undefined} aria-label={`Station ${k + 1}: ${s.name}`} title={s.course}>
                  <span className="sta-mark" aria-hidden>
                    <svg viewBox="0 0 14 14" width="14" height="14">
                      {done ? <path d="M3 7.5l2.6 2.6L11 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" /> : <circle cx="7" cy="7" r={active ? 4.2 : 3} />}
                    </svg>
                  </span>
                  <span className="sta-num num">STA {k + 1}</span>
                  <span className="sta-name">{s.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="topbar-end">
        {ds && result && (
          <button className={`grade grade--${grade(result.score)}`} onClick={() => setRailTab('findings')} title="Map Honesty score. Open the findings.">
            <span className="grade-label caps">Honesty</span>
            <span className="grade-score num">{result.score}</span>
            <span className="grade-letter">{grade(result.score)}</span>
          </button>
        )}
      </div>
    </header>
  );
}
