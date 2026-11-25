/** SVG path for a small series, used in field notes and pop-ups. */
export function sparkPath(series: number[], w: number, h: number, pad = 2): { line: string; area: string; max: number } {
  const n = series.length;
  const max = Math.max(1, ...series);
  if (n < 2) return { line: '', area: '', max };
  const x = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - (v / max) * (h - pad * 2);
  const pts = series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  return { line: `M${pts.join('L')}`, area: `M${x(0)},${h - pad}L${pts.join('L')}L${x(n - 1)},${h - pad}Z`, max };
}
