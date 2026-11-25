import { useMemo } from 'react';
import { useStore } from '../state/store';
import { audit, PRODUCT_FIT, type FixId } from '../lib/honesty/audit';
import { useScene } from './useScene';

export function useAudit() {
  const s = useStore();
  const scene = useScene();
  return useMemo(() => {
    if (!s.ds) return null;
    return audit({
      ds: s.ds,
      sym: s.sym,
      labels: s.labels,
      analysis: s.analysis,
      time: s.time,
      relief: s.relief,
      deliver: s.deliver,
      station: s.station,
      overlap: s.overlap,
      gi: scene.giCells ?? null,
      slices: scene.sliceCount,
    });
  }, [s.ds, s.sym, s.labels, s.analysis, s.time, s.relief, s.deliver, s.station, s.overlap, scene.giCells, scene.sliceCount]);
}

export function applyFix(id: FixId) {
  const st = useStore.getState();
  switch (id) {
    case 'use-unique':
      st.patchSym({ kind: 'unique' });
      break;
    case 'use-graduated':
      st.patchSym({ kind: 'graduated' });
      break;
    case 'fewer-classes':
      st.patchSym({ classes: 5 });
      break;
    case 'okabe':
      st.patchSym({ categoryPalette: 'okabe' });
      break;
    case 'add-transparency':
      st.patchSym({ opacity: 0.35, featureBlend: 'multiply' });
      break;
    case 'run-gistar':
      st.patchAnalysis({ view: 'gistar' });
      st.setStation('test');
      break;
    case 'enable-fdr':
      st.patchAnalysis({ fdr: true });
      break;
    case 'lock-breaks':
      st.patchTime({ lockBreaks: true });
      break;
    case 'label-halo':
      st.patchLabels({ classes: st.labels.classes.map((c) => ({ ...c, halo: true })) });
      break;
    case 'flatten-3d':
      st.patchRelief({ view: 'flat' });
      break;
    case 'lower-pitch':
      st.patchRelief({ pitch: 48 });
      break;
    case 'suggest-product':
      st.patchDeliver({ product: PRODUCT_FIT[st.deliver.purpose][st.deliver.audience] });
      break;
    case 'monthly-step':
      st.patchTime({ step: 'week' });
      break;
    case 'coarser-hex':
      st.patchAnalysis({ resolution: 'auto' });
      break;
    case 'group-categories':
      st.patchSym({ maxCategories: 7 });
      break;
  }
}
