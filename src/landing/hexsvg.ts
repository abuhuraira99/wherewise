import { cellToBoundary } from 'h3-js';

/** Project H3 cells into an SVG viewport (equirectangular, latitude-corrected). */
export function hexPaths(ids: string[], width: number) {
  const rings = ids.map((id) => cellToBoundary(id, true) as [number, number][]);
  // frame the bulk of the data: a few stray outlying cells should not shrink the map
  const xs = rings.map((r) => r[0][0]).sort((a, b) => a - b);
  const ys = rings.map((r) => r[0][1]).sort((a, b) => a - b);
  const q = (arr: number[], p: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(p * (arr.length - 1))))];
  const trim = ids.length > 200 ? 0.004 : 0;
  const pad = Math.max(q(xs, 0.6) - q(xs, 0.4), 0.001) * 0.15;
  const w = q(xs, trim) - pad, e = q(xs, 1 - trim) + pad, s = q(ys, trim) - pad, n = q(ys, 1 - trim) + pad;
  const k = Math.cos(((s + n) / 2) * (Math.PI / 180));
  const height = Math.round((width * (n - s)) / Math.max(1e-9, (e - w) * k));
  const px = (x: number) => ((x - w) / (e - w || 1)) * width;
  const py = (y: number) => height - ((y - s) / (n - s || 1)) * height;
  const paths = rings.map((r) => 'M' + r.map(([x, y]) => `${px(x).toFixed(1)},${py(y).toFixed(1)}`).join('L') + 'Z');
  const project = (lng: number, lat: number): [number, number] => [px(lng), py(lat)];
  return { paths, height, project };
}
