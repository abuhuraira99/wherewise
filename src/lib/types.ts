/** Core data model shared by every station of the studio. */

export type FieldKind = 'latitude' | 'longitude' | 'datetime' | 'quantitative' | 'qualitative' | 'text' | 'id';

export type Cell = string | number | null;

export interface CategoryCount {
  value: string;
  count: number;
}

export interface Field {
  name: string;
  kind: FieldKind;
  /** Plain-language reason for the detected kind, shown in the profile. */
  reason: string;
  nulls: number;
  distinct: number;
  min?: number;
  max?: number;
  mean?: number;
  categories?: CategoryCount[];
  sample: string[];
  /** true when this field was created with an expression. */
  derived?: boolean;
  expression?: string;
}

export interface DatasetSource {
  kind: 'upload' | 'sample' | 'live';
  title: string;
  publisher: string;
  licence: string;
  url?: string;
  note?: string;
  stale?: boolean;
  generatedAt?: string;
}

export interface Dataset {
  id: string;
  name: string;
  source: DatasetSource;
  rows: Record<string, Cell>[];
  fields: Field[];
  latField: string;
  lonField: string;
  timeField: string | null;
  lat: Float64Array;
  lon: Float64Array;
  /** epoch ms, NaN when missing */
  time: Float64Array;
  n: number;
  dropped: { missingCoords: number; nullIsland: number; outOfRange: number };
  bbox: [number, number, number, number];
}

export type SymbologyKind = 'single' | 'unique' | 'graduated' | 'proportional' | 'multivariate';
export type ClassMethod = 'natural' | 'quantile' | 'equal';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken';

export interface SymbologyConfig {
  kind: SymbologyKind;
  field: string | null;
  method: ClassMethod;
  classes: number;
  ramp: string;
  categoryPalette: string;
  size: number;
  opacity: number;
  /** For multivariate: size by, colour by, transparency by recency */
  sizeField: string | null;
  colorField: string | null;
  fadeByRecency: boolean;
  layerBlend: BlendMode;
  featureBlend: BlendMode;
  maxCategories: number;
}

export interface LabelClass {
  id: string;
  name: string;
  /** expression returning the label text */
  expression: string;
  /** expression returning true for features that use this class; empty = all */
  where: string;
  face: 'serif' | 'sans';
  italic: boolean;
  bold: boolean;
  size: number;
  color: string;
  halo: boolean;
  caps: boolean;
}

export interface LabelConfig {
  enabled: boolean;
  classes: LabelClass[];
  minZoom: number;
  pair: 'georgia-verdana' | 'archivo-georgia';
}

export type AnalysisView = 'points' | 'heat' | 'hex' | 'gistar';

export interface AnalysisConfig {
  view: AnalysisView;
  resolution: number | 'auto';
  neighbourRings: number;
  fdr: boolean;
  weightField: string | null;
}

export type TimeView = 'trend' | 'emerging' | 'multiples' | 'animate';
export type TimeStep = 'auto' | 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface TimeConfig {
  view: TimeView;
  step: TimeStep;
  lockBreaks: boolean;
  frame: number;
  playing: boolean;
}

export type ReliefView = 'flat' | 'extrude' | 'cube' | 'depth';

export interface ReliefConfig {
  view: ReliefView;
  exaggeration: number;
  pitch: number;
}

export type Audience = 'public' | 'decision' | 'analyst' | 'field';
export type Purpose = 'story' | 'monitor' | 'reference' | 'explore';
export type Product = 'poster' | 'dashboard' | 'brief' | 'app';

export interface DeliverConfig {
  audience: Audience;
  purpose: Purpose;
  product: Product | null;
  title: string;
  subtitle: string;
}

export type StationId = 'survey' | 'symbolize' | 'test' | 'time' | 'relief' | 'charts' | 'deliver';
