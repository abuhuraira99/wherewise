/**
 * Map Honesty audit. Each rule encodes one cartographic practice and
 * returns a finding with a plain-language reason and, where possible, a fix
 * the studio can apply in one click.
 */
import type { AnalysisConfig, Dataset, DeliverConfig, LabelConfig, ReliefConfig, StationId, SymbologyConfig, TimeConfig } from '../types';
import { categoricalById, isMonotonicLightness, minPairDistance, rampById, sampleRamp } from '../palettes';

export type Severity = 'pass' | 'note' | 'warn' | 'fail';

export type FixId =
  | 'use-unique'
  | 'use-graduated'
  | 'fewer-classes'
  | 'group-categories'
  | 'okabe'
  | 'add-transparency'
  | 'run-gistar'
  | 'enable-fdr'
  | 'lock-breaks'
  | 'label-halo'
  | 'flatten-3d'
  | 'lower-pitch'
  | 'suggest-product'
  | 'coarser-hex'
  | 'monthly-step';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** the course principle it rests on */
  principle: string;
  fix?: { id: FixId; label: string };
  penalty: number;
}

export interface AuditInput {
  ds: Dataset;
  sym: SymbologyConfig;
  labels: LabelConfig;
  analysis: AnalysisConfig;
  time: TimeConfig;
  relief: ReliefConfig;
  deliver: DeliverConfig;
  station: StationId;
  /** share of points that land on an already-occupied screen pixel block */
  overlap: number;
  /** number of significant cells and of analysed cells, when Gi* has run */
  gi?: { cells: number; hot: number; cold: number } | null;
  slices?: number;
}

export const PRODUCT_FIT: Record<DeliverConfig['purpose'], Record<DeliverConfig['audience'], DeliverConfig['product']>> = {
  story: { public: 'brief', decision: 'brief', analyst: 'brief', field: 'poster' },
  monitor: { public: 'dashboard', decision: 'dashboard', analyst: 'dashboard', field: 'dashboard' },
  reference: { public: 'poster', decision: 'poster', analyst: 'poster', field: 'poster' },
  explore: { public: 'app', decision: 'dashboard', analyst: 'app', field: 'app' },
};

export function audit(input: AuditInput): { score: number; findings: Finding[] } {
  const { ds, sym, labels, analysis, time, relief, deliver } = input;
  const f: Finding[] = [];
  const field = sym.field ? ds.fields.find((x) => x.name === sym.field) : undefined;

  // 1. symbology matches the level of measurement
  if ((sym.kind === 'graduated' || sym.kind === 'proportional') && field && field.kind !== 'quantitative') {
    f.push({
      id: 'type-mismatch',
      severity: 'fail',
      title: `"${field.name}" is a category, but it is drawn as an amount`,
      detail: 'Graduated colours and sizes say "more" and "less". Categories are only different, so the map implies an order that is not in the data.',
      principle: 'Qualitative data: vary hue or shape. Quantitative data: vary size, lightness or saturation.',
      fix: { id: 'use-unique', label: 'Switch to unique values' },
      penalty: 30,
    });
  } else if (sym.kind === 'unique' && field && field.kind === 'quantitative' && field.distinct > 12) {
    f.push({
      id: 'type-mismatch',
      severity: 'fail',
      title: `"${field.name}" is an amount, but each value gets its own colour`,
      detail: `${field.distinct} unrelated hues for a continuous number hide the gradient the reader needs to see.`,
      principle: 'Quantitative attributes are shown with gradients so the audience reads magnitude.',
      fix: { id: 'use-graduated', label: 'Switch to graduated colours' },
      penalty: 25,
    });
  } else if (field) {
    f.push({
      id: 'type-mismatch',
      severity: 'pass',
      title: 'Symbology matches the data type',
      detail: field.kind === 'quantitative' ? `"${field.name}" is an amount and is shown as a gradient.` : `"${field.name}" is a category and is shown with distinct hues.`,
      principle: 'Qualitative vs quantitative symbology.',
      penalty: 0,
    });
  }

  // 2. number of classes
  if (sym.kind === 'graduated' || sym.kind === 'proportional') {
    if (sym.classes > 7) {
      f.push({
        id: 'classes',
        severity: sym.classes > 9 ? 'fail' : 'warn',
        title: `${sym.classes} classes is more than the eye can match to a legend`,
        detail: 'Readers reliably tell apart about five to seven steps of lightness or size.',
        principle: 'Choose symbology that clearly and quickly communicates.',
        fix: { id: 'fewer-classes', label: 'Use 5 classes' },
        penalty: sym.classes > 9 ? 15 : 8,
      });
    }
    const ramp = sampleRamp(rampById(sym.ramp).stops, Math.max(2, sym.classes));
    if (!isMonotonicLightness(ramp)) {
      f.push({ id: 'ramp', severity: 'fail', title: 'Colour ramp is not ordered by lightness', detail: 'Magnitude must read light to dark.', principle: 'Gradient of colour value.', penalty: 15 });
    }
  }

  // 3. categories
  if (sym.kind === 'unique' && field?.categories) {
    const cats = field.categories.length;
    if (cats > sym.maxCategories) {
      f.push({
        id: 'categories',
        severity: 'note',
        title: `${cats - sym.maxCategories} small categories are grouped as "Other"`,
        detail: `Only the ${sym.maxCategories} most common categories get their own colour, so each one stays recognisable.`,
        principle: 'Too many hues make categories impossible to tell apart.',
        penalty: 0,
      });
    }
    const colors = categoricalById(sym.categoryPalette).colors.slice(0, Math.min(cats, sym.maxCategories));
    const d = minPairDistance(colors);
    const worst = Math.min(d.protan, d.deutan);
    if (worst < 8) {
      f.push({
        id: 'cvd',
        severity: 'warn',
        title: 'Two categories look alike for colour-blind readers',
        detail: `Under simulated red-green colour blindness the closest pair differs by only ${worst.toFixed(1)} ΔE. About 1 in 12 men would struggle.`,
        principle: 'Choose colours your whole audience can tell apart.',
        fix: { id: 'okabe', label: 'Use the Okabe-Ito palette' },
        penalty: 10,
      });
    } else {
      f.push({ id: 'cvd', severity: 'pass', title: 'Colours survive colour-blindness simulation', detail: `Closest pair stays ${worst.toFixed(0)} ΔE apart under protan and deutan simulation.`, principle: 'Accessible colour.', penalty: 0 });
    }
  }

  // 4. overplotting
  if (analysis.view === 'points' && input.overlap > 0.35 && sym.opacity > 0.75) {
    f.push({
      id: 'overlap',
      severity: 'warn',
      title: `About ${Math.round(input.overlap * 100)}% of points sit on top of others`,
      detail: 'Stacked symbols hide how many events happened in the busiest places, so dense areas look the same as quiet ones.',
      principle: 'Transparency, feature blending or aggregation reveal overlapping features.',
      fix: { id: 'add-transparency', label: 'Add transparency' },
      penalty: 10,
    });
  }

  // 5. a pattern is claimed without a test
  if (analysis.view === 'heat') {
    f.push({
      id: 'untested',
      severity: 'warn',
      title: 'A heat map shows density, not significance',
      detail: 'Bright areas may simply be where more people live or where the data is collected. Test the pattern before calling it a hot spot.',
      principle: 'Visual patterns suggest; geographic analysis provides the evidence.',
      fix: { id: 'run-gistar', label: 'Run hot spot analysis' },
      penalty: 8,
    });
  }
  if (analysis.view === 'gistar') {
    if (!analysis.fdr) {
      f.push({
        id: 'fdr',
        severity: 'warn',
        title: 'Hundreds of tests without a false discovery correction',
        detail: 'Testing every hexagon at 95% confidence will flag about 1 in 20 by chance. The FDR correction keeps false hot spots in check.',
        principle: 'Make the evidence defensible.',
        fix: { id: 'enable-fdr', label: 'Turn on FDR correction' },
        penalty: 10,
      });
    }
    if (input.gi && input.gi.cells < 30) {
      f.push({
        id: 'few-cells',
        severity: 'warn',
        title: `Only ${input.gi.cells} hexagons were analysed`,
        detail: 'With fewer than 30 cells the statistic has little to compare against. Use a finer grid or more data.',
        principle: 'Analysis needs enough features to be meaningful.',
        penalty: 8,
      });
    } else if (input.gi) {
      f.push({
        id: 'tested',
        severity: 'pass',
        title: `Pattern tested: ${input.gi.hot} hot and ${input.gi.cold} cold hexagons`,
        detail: `Getis-Ord Gi* across ${input.gi.cells} cells${analysis.fdr ? ', corrected for false discovery' : ''}.`,
        principle: 'Geographic analysis.',
        penalty: 0,
      });
    }
  }

  // 6. time
  if (input.station === 'time' || time.view === 'multiples') {
    if (time.view === 'multiples' && !time.lockBreaks) {
      f.push({
        id: 'breaks',
        severity: 'fail',
        title: 'Each small multiple has its own class breaks',
        detail: 'The same colour means a different number in each panel, so the comparison the reader is invited to make is false.',
        principle: 'Keep colour schemes, breaks and size ranges consistent across a series.',
        fix: { id: 'lock-breaks', label: 'Lock breaks across panels' },
        penalty: 25,
      });
    }
    if ((time.view === 'trend' || time.view === 'emerging') && input.slices !== undefined && input.slices < 8) {
      f.push({
        id: 'short-series',
        severity: 'warn',
        title: `Trend tested on only ${input.slices} time steps`,
        detail: 'Mann-Kendall needs a longer series to detect change reliably. Use a shorter time step.',
        principle: 'Communicating change over time.',
        fix: { id: 'monthly-step', label: 'Use a finer time step' },
        penalty: 6,
      });
    }
  }
  if (!ds.timeField && input.station === 'time') {
    f.push({ id: 'no-time', severity: 'note', title: 'No date column found', detail: 'Time analysis needs a column of dates or timestamps.', principle: 'Patterns in time and space.', penalty: 0 });
  }

  // 7. labels
  if (labels.enabled) {
    const noHalo = labels.classes.filter((c) => !c.halo);
    if (noHalo.length) {
      f.push({
        id: 'halo',
        severity: 'warn',
        title: 'Some labels have no halo',
        detail: 'Without a halo, text over busy symbols and basemap detail loses contrast.',
        principle: 'Design labels with colours that can be read on top of other features.',
        fix: { id: 'label-halo', label: 'Add halos' },
        penalty: 4,
      });
    }
    const faces = new Set(labels.classes.map((c) => c.face));
    f.push({
      id: 'typefaces',
      severity: 'pass',
      title: `${faces.size} typeface${faces.size > 1 ? 's' : ''} on the map`,
      detail: 'No more than two, a serif and a sans-serif that complement each other.',
      principle: 'Labeling guidelines.',
      penalty: 0,
    });
  }

  // 8. 3D
  if (relief.view !== 'flat') {
    if (relief.pitch > 62) {
      f.push({
        id: 'pitch',
        severity: 'warn',
        title: 'Steep camera angle hides features behind taller ones',
        detail: 'In 3D some data is always blocked by other data. Lower the angle or add bookmarks that guide the viewer.',
        principle: 'Plan how users will see the entire scene.',
        fix: { id: 'lower-pitch', label: 'Lower the camera' },
        penalty: 6,
      });
    }
    if (relief.view === 'extrude' && analysis.view !== 'hex' && analysis.view !== 'gistar') {
      f.push({
        id: 'why-3d',
        severity: 'note',
        title: 'Height repeats what colour already shows',
        detail: 'Extrusion is used here for non-physical values. That is fine for emphasis; keep the colour legend so height is never the only cue.',
        principle: 'Decide intentionally why 3D, not 2D.',
        penalty: 0,
      });
    }
  }

  // 9. product fits the audience
  if (deliver.product) {
    const fit = PRODUCT_FIT[deliver.purpose][deliver.audience];
    if (fit !== deliver.product) {
      f.push({
        id: 'product-fit',
        severity: 'warn',
        title: `A ${deliver.product} may not suit this audience and purpose`,
        detail: `For ${labelAudience(deliver.audience)} who need to ${labelPurpose(deliver.purpose)}, a ${fit} usually works better.`,
        principle: 'Balance audience expectations, interaction and story versus exploration.',
        fix: { id: 'suggest-product', label: `Use a ${fit}` },
        penalty: 6,
      });
    }
  }

  // 10. data quality
  const lost = ds.dropped.missingCoords + ds.dropped.nullIsland + ds.dropped.outOfRange;
  if (lost > 0) {
    const share = lost / (lost + ds.n);
    f.push({
      id: 'dropped',
      severity: share > 0.1 ? 'warn' : 'note',
      title: `${lost.toLocaleString('en-GB')} rows could not be placed on the map`,
      detail: `${ds.dropped.missingCoords} without coordinates, ${ds.dropped.nullIsland} at 0°,0° ("Null Island"), ${ds.dropped.outOfRange} out of range. Say so in the caption.`,
      principle: 'Be clear about what the map does not show.',
      penalty: share > 0.1 ? 6 : 0,
    });
  }

  const score = Math.max(0, Math.min(100, 100 - f.reduce((a, b) => a + b.penalty, 0)));
  const order: Severity[] = ['fail', 'warn', 'note', 'pass'];
  f.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return { score, findings: f };
}

export function labelAudience(a: DeliverConfig['audience']): string {
  return { public: 'the general public', decision: 'decision makers', analyst: 'analysts', field: 'field teams' }[a];
}
export function labelPurpose(p: DeliverConfig['purpose']): string {
  return { story: 'follow a story', monitor: 'monitor a situation', reference: 'keep a reference', explore: 'explore the data themselves' }[p];
}

export function grade(score: number): string {
  if (score >= 93) return 'A';
  if (score >= 85) return 'B';
  if (score >= 72) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}
