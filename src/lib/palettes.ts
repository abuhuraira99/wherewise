/**
 * Colour system for data. Every sequential ramp rises monotonically in
 * lightness (so it survives greyscale printing and colour-vision deficiency),
 * the categorical set is built on Okabe & Ito's colour-blind safe palette, and
 * the diverging ramp is reserved for hot and cold spots.
 */

export interface Ramp {
  id: string;
  name: string;
  /** light -> dark */
  stops: string[];
}

export const SEQUENTIAL: Ramp[] = [
  { id: 'ember', name: 'Ember', stops: ['#fff3c4', '#fdd37a', '#f8a54b', '#ea7041', '#c9433f', '#93263e', '#5a1736'] },
  { id: 'tide', name: 'Tide', stops: ['#eef6f5', '#c4e3e0', '#8dc8c9', '#559fb0', '#33779a', '#24527c', '#1a2f57'] },
  { id: 'moss', name: 'Moss', stops: ['#f3f6dc', '#d6e6a6', '#a8cf86', '#6fae73', '#3f8865', '#256456', '#16403f'] },
  { id: 'graphite', name: 'Graphite', stops: ['#f1f2f0', '#d3d6d4', '#aeb3b2', '#868c8d', '#5f6669', '#3c4246', '#1d2226'] },
];

export const DIVERGING_HOTCOLD = {
  cold3: '#2c5e8f',
  cold2: '#5f8fbb',
  cold1: '#a6c3dc',
  none: '#e6e3dc',
  hot1: '#f3b6b0',
  hot2: '#e5675f',
  hot3: '#b8203a',
};

export interface CategoryPalette {
  id: string;
  name: string;
  colors: string[];
}

export const CATEGORICAL: CategoryPalette[] = [
  {
    id: 'okabe',
    name: 'Okabe-Ito (colour-blind safe)',
    colors: ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#2b2b2b'],
  },
  {
    id: 'survey',
    name: 'Survey inks',
    colors: ['#14537a', '#d4492c', '#2f7d4f', '#8a4fa3', '#c99a14', '#1d1f24', '#3aa0b8', '#b05f7a'],
  },
];

export const OTHER_COLOR = '#b9bdb9';

export function rampById(id: string): Ramp {
  return SEQUENTIAL.find((r) => r.id === id) ?? SEQUENTIAL[0];
}

export function categoricalById(id: string): CategoryPalette {
  return CATEGORICAL.find((p) => p.id === id) ?? CATEGORICAL[0];
}

/* ---------- colour maths ---------- */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const toLin = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLin = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** Sample `k` colours evenly along a ramp (linear-RGB interpolation). */
export function sampleRamp(stops: string[], k: number): string[] {
  if (k <= 1) return [stops[Math.floor(stops.length / 2)]];
  const lin = stops.map((s) => hexToRgb(s).map(toLin));
  return Array.from({ length: k }, (_, i) => {
    const t = (i / (k - 1)) * (stops.length - 1);
    const a = Math.floor(t);
    const b = Math.min(stops.length - 1, a + 1);
    const f = t - a;
    const mixed = [0, 1, 2].map((ch) => fromLin(lin[a][ch] * (1 - f) + lin[b][ch] * f));
    return rgbToHex(mixed as [number, number, number]);
  });
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** CIE L*a*b* from sRGB hex (D65). */
export function toLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

export function deltaE(a: string, b: string): number {
  const A = toLab(a);
  const B = toLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Machado, Oliveira & Fernandes (2009), severity 1.0. */
const CVD: Record<'protan' | 'deutan' | 'tritan', number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

export type Cvd = keyof typeof CVD;

export function simulateCvd(hex: string, type: Cvd): string {
  const m = CVD[type];
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const out = [m[0] * r + m[1] * g + m[2] * b, m[3] * r + m[4] * g + m[5] * b, m[6] * r + m[7] * g + m[8] * b].map((c) =>
    fromLin(Math.max(0, Math.min(1, c))),
  );
  return rgbToHex(out as [number, number, number]);
}

/** Smallest perceptual distance between any two colours, for each vision type. */
export function minPairDistance(colors: string[]): Record<'normal' | Cvd, number> {
  const types: ('normal' | Cvd)[] = ['normal', 'protan', 'deutan', 'tritan'];
  const result = {} as Record<'normal' | Cvd, number>;
  for (const t of types) {
    const sim = t === 'normal' ? colors : colors.map((c) => simulateCvd(c, t));
    let min = Infinity;
    for (let i = 0; i < sim.length; i++) for (let j = i + 1; j < sim.length; j++) min = Math.min(min, deltaE(sim[i], sim[j]));
    result[t] = colors.length < 2 ? Infinity : min;
  }
  return result;
}

/** True when lightness strictly decreases along the ramp (light to dark). */
export function isMonotonicLightness(colors: string[]): boolean {
  const L = colors.map((c) => toLab(c)[0]);
  for (let i = 1; i < L.length; i++) if (L[i] >= L[i - 1]) return false;
  return true;
}
