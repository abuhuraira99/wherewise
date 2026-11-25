import { create } from 'zustand';
import type {
  AnalysisConfig,
  Dataset,
  DeliverConfig,
  LabelConfig,
  ReliefConfig,
  StationId,
  SymbologyConfig,
  TimeConfig,
} from '../lib/types';

export type Selection =
  | { kind: 'category'; field: string; value: string }
  | { kind: 'clock'; weekday: number; hour: number }
  | { kind: 'day'; day: number }
  | { kind: 'slice'; index: number }
  | { kind: 'range'; field: string; lo: number; hi: number };

export interface Stake {
  id: string;
  lng: number;
  lat: number;
  title: string;
  lines: string[];
  series?: number[];
  tone: 'hot' | 'cold' | 'neutral';
}

export interface LoadState {
  label: string;
  detail?: string;
}

interface Store {
  ds: Dataset | null;
  loading: LoadState | null;
  error: { message: string; hint: string } | null;
  station: StationId;
  sym: SymbologyConfig;
  labels: LabelConfig;
  analysis: AnalysisConfig;
  time: TimeConfig;
  relief: ReliefConfig;
  deliver: DeliverConfig;
  selection: Selection | null;
  stakes: Stake[];
  overlap: number;
  overlay: 'none' | 'poster' | 'dashboard' | 'brief';
  railTab: 'findings' | 'charts' | 'notes';
  setDataset: (ds: Dataset) => void;
  updateDataset: (ds: Dataset) => void;
  setLoading: (l: LoadState | null) => void;
  setError: (e: { message: string; hint: string } | null) => void;
  setStation: (s: StationId) => void;
  patchSym: (p: Partial<SymbologyConfig>) => void;
  patchLabels: (p: Partial<LabelConfig>) => void;
  patchAnalysis: (p: Partial<AnalysisConfig>) => void;
  patchTime: (p: Partial<TimeConfig>) => void;
  patchRelief: (p: Partial<ReliefConfig>) => void;
  patchDeliver: (p: Partial<DeliverConfig>) => void;
  setSelection: (s: Selection | null) => void;
  addStake: (s: Stake) => void;
  removeStake: (id: string) => void;
  setOverlap: (o: number) => void;
  setOverlay: (o: Store['overlay']) => void;
  setRailTab: (t: Store['railTab']) => void;
  addDerivedField: (name: string, expression: string, values: (string | number | null)[]) => void;
}

export const defaultSym: SymbologyConfig = {
  kind: 'single',
  field: null,
  method: 'natural',
  classes: 5,
  ramp: 'ember',
  categoryPalette: 'okabe',
  size: 4,
  opacity: 0.85,
  sizeField: null,
  colorField: null,
  fadeByRecency: false,
  layerBlend: 'normal',
  featureBlend: 'normal',
  maxCategories: 7,
};

export const defaultLabels: LabelConfig = { enabled: false, classes: [], minZoom: 10, pair: 'georgia-verdana' };

export const useStore = create<Store>((set) => ({
  ds: null,
  loading: null,
  error: null,
  station: 'survey',
  sym: defaultSym,
  labels: defaultLabels,
  analysis: { view: 'points', resolution: 'auto', neighbourRings: 1, fdr: true, weightField: null },
  time: { view: 'trend', step: 'auto', lockBreaks: true, frame: 0, playing: false },
  relief: { view: 'flat', exaggeration: 1, pitch: 50 },
  deliver: { audience: 'decision', purpose: 'monitor', product: null, title: '', subtitle: '' },
  selection: null,
  stakes: [],
  overlap: 0,
  overlay: 'none',
  railTab: 'findings',
  setDataset: (ds) =>
    set(() => {
      const cat = ds.fields.find((f) => f.kind === 'qualitative' && (f.categories?.length ?? 0) >= 2 && (f.categories?.length ?? 0) <= 40);
      return {
        ds,
        error: null,
        loading: null,
        station: 'survey',
        selection: null,
        stakes: [],
        sym: { ...defaultSym, kind: cat ? 'unique' : 'single', field: cat?.name ?? null, opacity: ds.n > 5000 ? 0.55 : 0.85, size: ds.n > 20000 ? 2.6 : ds.n > 5000 ? 3.2 : 4.5 },
        labels: defaultLabels,
        analysis: { view: 'points', resolution: 'auto', neighbourRings: 1, fdr: true, weightField: null },
        time: { view: 'trend', step: 'auto', lockBreaks: true, frame: 0, playing: false },
        relief: { view: 'flat', exaggeration: 1, pitch: 50 },
        deliver: { audience: 'decision', purpose: 'monitor', product: null, title: ds.name, subtitle: '' },
      };
    }),
  updateDataset: (ds) => set({ ds, selection: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: null }),
  setStation: (station) => set({ station }),
  patchSym: (p) => set((s) => ({ sym: { ...s.sym, ...p } })),
  patchLabels: (p) => set((s) => ({ labels: { ...s.labels, ...p } })),
  patchAnalysis: (p) => set((s) => ({ analysis: { ...s.analysis, ...p } })),
  patchTime: (p) => set((s) => ({ time: { ...s.time, ...p } })),
  patchRelief: (p) => set((s) => ({ relief: { ...s.relief, ...p } })),
  patchDeliver: (p) => set((s) => ({ deliver: { ...s.deliver, ...p } })),
  setSelection: (selection) => set({ selection }),
  addStake: (st) => set((s) => ({ stakes: [...s.stakes.filter((x) => x.id !== st.id), st] })),
  removeStake: (id) => set((s) => ({ stakes: s.stakes.filter((x) => x.id !== id) })),
  setOverlap: (overlap) => set({ overlap }),
  setOverlay: (overlay) => set({ overlay }),
  setRailTab: (railTab) => set({ railTab }),
  addDerivedField: (name, expression, values) =>
    set((s) => {
      if (!s.ds) return {};
      const rows = s.ds.rows;
      for (let i = 0; i < rows.length; i++) rows[i][name] = values[i];
      const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      const isNum = nums.length >= values.filter((v) => v !== null && v !== '').length * 0.9 && nums.length > 0;
      const distinct = new Set(values.map(String)).size;
      const field = isNum
        ? {
            name,
            kind: 'quantitative' as const,
            reason: 'Calculated with an expression.',
            nulls: values.length - nums.length,
            distinct,
            min: Math.min(...nums),
            max: Math.max(...nums),
            mean: nums.reduce((a, b) => a + b, 0) / nums.length,
            sample: nums.slice(0, 5).map(String),
            derived: true,
            expression,
          }
        : {
            name,
            kind: (distinct <= 60 ? 'qualitative' : 'text') as 'qualitative' | 'text',
            reason: 'Calculated with an expression.',
            nulls: values.filter((v) => v === null || v === '').length,
            distinct,
            sample: [...new Set(values.map(String))].slice(0, 5),
            categories:
              distinct <= 60
                ? [...values.reduce((m, v) => m.set(String(v ?? '(blank)'), (m.get(String(v ?? '(blank)')) ?? 0) + 1), new Map<string, number>())]
                    .map(([value, count]) => ({ value, count }))
                    .sort((a, b) => b.count - a.count)
                : undefined,
            derived: true,
            expression,
          };
      const fields = [...s.ds.fields.filter((f) => f.name !== name), field];
      return { ds: { ...s.ds, fields } };
    }),
}));
