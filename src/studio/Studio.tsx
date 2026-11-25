import { useEffect, type ComponentType } from 'react';
import { useStore } from '../state/store';
import { TopBar } from './TopBar';
import { MapView } from './MapView';
import { Rail } from './Rail';
import { Multiples } from './Multiples';
import { useScene } from './useScene';
import { STATIONS } from './stations';
import { SurveyPanel } from './panels/SurveyPanel';
import { SymbolizePanel } from './panels/SymbolizePanel';
import { TestPanel } from './panels/TestPanel';
import { TimePanel } from './panels/TimePanel';
import { ReliefPanel } from './panels/ReliefPanel';
import { ChartsPanel } from './panels/ChartsPanel';
import { DeliverPanel } from './panels/DeliverPanel';
import { BriefOverlay, DashboardBottom, DashboardSide, DashboardTop, PosterOverlay } from './deliver/Overlays';
import { DropWell, SampleList, openSample } from '../ui/Intake';
import { SAMPLES } from '../lib/data/load';
import type { AnalysisView, StationId, SymbologyKind, TimeView } from '../lib/types';

const PANELS: Record<StationId, ComponentType> = {
  survey: SurveyPanel,
  symbolize: SymbolizePanel,
  test: TestPanel,
  time: TimePanel,
  relief: ReliefPanel,
  charts: ChartsPanel,
  deliver: DeliverPanel,
};

/** Restore a shared explorer link: /studio?sample=lfb&sta=test&view=gistar */
function useLinkParams() {
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const id = q.get('sample');
    const def = SAMPLES.find((s) => s.id === id);
    if (!def) return;
    void openSample(def).then(() => {
      const st = useStore.getState();
      if (!st.ds) return;
      const sta = q.get('sta') as StationId | null;
      const view = q.get('view') as AnalysisView | null;
      const sym = q.get('sym') as SymbologyKind | null;
      const field = q.get('field');
      const time = q.get('time') as TimeView | null;
      if (view && ['points', 'heat', 'hex', 'gistar'].includes(view)) st.patchAnalysis({ view });
      if (sym && field && st.ds.fields.some((f) => f.name === field)) st.patchSym({ kind: sym, field });
      if (time && ['trend', 'emerging', 'multiples', 'animate'].includes(time)) st.patchTime({ view: time });
      if (sta && STATIONS.some((s) => s.id === sta)) st.setStation(sta);
      if (q.get('dash') === '1') st.setOverlay('dashboard');
    });
  }, []);
}

export function Studio() {
  const ds = useStore((s) => s.ds);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const station = useStore((s) => s.station);
  const overlay = useStore((s) => s.overlay);
  const scene = useScene();
  useLinkParams();

  useEffect(() => {
    document.title = ds ? `${ds.name} · Wherewise` : 'Studio · Wherewise';
  }, [ds]);

  const Panel = PANELS[station];
  const meta = STATIONS.find((s) => s.id === station)!;
  const dashboard = overlay === 'dashboard' && ds;

  return (
    <div className={`studio ${ds ? 'has-data' : 'is-empty'} ${dashboard ? 'is-dashboard' : ''}`}>
      <a className="skip-link" href="#panel">Skip to controls</a>
      {dashboard ? <DashboardTop /> : <TopBar />}
      {ds && !dashboard && (
        <section className="panel" id="panel" aria-label={`${meta.name} controls`}>
          <header className="panel-head">
            <span className="num panel-sta">STA {STATIONS.indexOf(meta) + 1}</span>
            <h2>{meta.verb}</h2>
            <p>{meta.course}</p>
          </header>
          <div className="panel-scroll">
            <Panel />
          </div>
        </section>
      )}
      <main className="stage" aria-label="Map">
        <MapView />
        {scene.mode === 'multiples' && ds && <Multiples />}
        {!ds && (
          <div className="intake">
            <div className="intake-card">
              <h1>Start a survey</h1>
              <p>Bring a spreadsheet of events with locations, or open one of three real datasets.</p>
              <DropWell />
              <SampleList />
              <p className="intake-privacy">Your file is read by this browser tab only. Nothing is uploaded.</p>
            </div>
          </div>
        )}
        {loading && (
          <div className="loading" role="status" aria-live="polite">
            <div className="plotting">
              <span className="plotting-line" />
              <strong>{loading.label}</strong>
              {loading.detail && <span>{loading.detail}</span>}
            </div>
          </div>
        )}
        {error && (
          <div className="error-sheet" role="alert">
            <span className="tape">Could not open</span>
            <h2>{error.message}</h2>
            <p>{error.hint}</p>
            <button className="btn btn--ink btn--sm" onClick={() => useStore.getState().setError(null)}>Try something else</button>
          </div>
        )}
      </main>
      {ds && !dashboard && <Rail />}
      {dashboard && <DashboardSide />}
      {dashboard && <DashboardBottom />}
      {overlay === 'poster' && ds && <PosterOverlay />}
      {overlay === 'brief' && ds && <BriefOverlay />}
    </div>
  );
}
