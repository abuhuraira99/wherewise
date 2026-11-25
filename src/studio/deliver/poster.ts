import { mapRef } from '../MapView';
import type { Scene } from '../useScene';
import type { Dataset, DeliverConfig } from '../../lib/types';
import { BASEMAP_ATTRIBUTION } from '../../map/basemap';

/** Metres per CSS pixel at the map centre (web mercator, 512px tiles). */
export function metresPerPixel(): number {
  const m = mapRef.current;
  if (!m) return 1;
  const lat = m.getCenter().lat;
  return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, m.getZoom()));
}

function niceDistance(maxMetres: number): { metres: number; label: string } {
  const steps = [1, 2, 5];
  let best = 1;
  for (let p = 0; p < 8; p++) for (const s of steps) { const v = s * 10 ** p; if (v <= maxMetres) best = v; }
  return { metres: best, label: best >= 1000 ? `${best / 1000} km` : `${best} m` };
}

export function mapSnapshot(scale = 1): HTMLCanvasElement | null {
  const map = mapRef.current;
  if (!map) return null;
  const src = map.getCanvas();
  const w = src.clientWidth;
  const h = src.clientHeight;
  const c = document.createElement('canvas');
  c.width = Math.round(w * scale * (src.width / w));
  c.height = Math.round(h * scale * (src.height / h));
  const ctx = c.getContext('2d')!;
  map.triggerRepaint();
  ctx.drawImage(src, 0, 0, c.width, c.height);
  if (mapRef.overlay && mapRef.overlay.canvas.style.display !== 'none') mapRef.overlay.composeInto(ctx, 0, 0, c.width, c.height);
  return c;
}

export async function renderPoster(ds: Dataset, deliver: DeliverConfig, scene: Scene, score: number): Promise<HTMLCanvasElement> {
  await Promise.all([
    document.fonts.load('700 40px "Archivo Variable"'),
    document.fonts.load('400 16px "Archivo Variable"'),
    document.fonts.load('400 14px "Martian Mono"'),
  ]).catch(() => undefined);
  const W = 2400;
  const H = 1697;
  const M = 72;
  const side = 600;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const sans = '"Archivo Variable", Archivo, Arial, sans-serif';
  const mono = '"Martian Mono", Consolas, monospace';

  // sheet
  ctx.fillStyle = '#f4f5f2';
  ctx.fillRect(0, 0, W, H);

  // map frame
  const mx = M;
  const my = M;
  const mw = W - M * 3 - side;
  const mh = H - M * 2;
  const snap = mapSnapshot(1);
  ctx.fillStyle = '#e8ebe7';
  ctx.fillRect(mx, my, mw, mh);
  if (snap) {
    const sr = snap.width / snap.height;
    const fr = mw / mh;
    let sw = snap.width, sh = snap.height, sx = 0, sy = 0;
    if (sr > fr) { sw = snap.height * fr; sx = (snap.width - sw) / 2; } else { sh = snap.width / fr; sy = (snap.height - sh) / 2; }
    ctx.drawImage(snap, sx, sy, sw, sh, mx, my, mw, mh);
    // scale bar: pixels in poster per CSS pixel on screen
    const map = mapRef.current!;
    const cssPerPosterPx = (sw / (snap.width / map.getCanvas().clientWidth)) / mw;
    const mpp = metresPerPixel() * cssPerPosterPx;
    const nd = niceDistance(mpp * 320);
    const barPx = nd.metres / mpp;
    const bx = mx + 36;
    const by = my + mh - 44;
    ctx.fillStyle = 'rgba(244,245,242,0.92)';
    ctx.fillRect(bx - 14, by - 38, barPx + 120, 64);
    ctx.fillStyle = '#14181d';
    ctx.fillRect(bx, by, barPx / 2, 8);
    ctx.strokeStyle = '#14181d';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, barPx, 8);
    ctx.font = `500 20px ${mono}`;
    ctx.fillText('0', bx - 6, by - 12);
    ctx.fillText(nd.label, bx + barPx - 10, by - 12);
    // north arrow (only true when the map is not rotated)
    const bearing = map.getBearing();
    const nx = mx + mw - 70;
    const ny = my + 90;
    ctx.save();
    ctx.translate(nx, ny);
    ctx.rotate((-bearing * Math.PI) / 180);
    ctx.fillStyle = 'rgba(244,245,242,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, 50, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14181d';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(13, 30);
    ctx.lineTo(0, 21);
    ctx.lineTo(-13, 30);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 20px ${sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('N', 0, -25);
    ctx.restore();
    ctx.textAlign = 'left';
  }
  ctx.strokeStyle = '#14181d';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx, my, mw, mh);

  // ruler ticks along the top of the frame
  ctx.lineWidth = 1;
  for (let x = mx; x <= mx + mw; x += 16) {
    const major = (x - mx) % 160 === 0;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, my - (major ? 16 : 8));
    ctx.lineTo(x + 0.5, my);
    ctx.stroke();
  }

  // side column
  const sx0 = W - M - side;
  let y = M + 10;
  ctx.fillStyle = '#f2cd2c';
  ctx.fillRect(sx0, M, side, 10);
  y += 46;
  ctx.fillStyle = '#14181d';
  ctx.font = `700 60px ${sans}`;
  y = wrap(ctx, deliver.title || ds.name, sx0, y + 40, side, 66);
  if (deliver.subtitle) {
    ctx.font = `400 30px ${sans}`;
    ctx.fillStyle = '#353c43';
    y = wrap(ctx, deliver.subtitle, sx0, y + 22, side, 40);
  }
  y += 40;
  ctx.fillStyle = '#14181d';
  ctx.font = `600 20px ${sans}`;
  ctx.fillText(scene.legend.title.replace(/_/g, ' ').toUpperCase(), sx0, y);
  y += 22;
  ctx.fillStyle = 'rgba(20,24,29,0.28)';
  ctx.fillRect(sx0, y, side, 2);
  y += 30;
  ctx.font = `400 24px ${sans}`;
  for (const it of scene.legend.items.slice(0, 11)) {
    ctx.fillStyle = it.color;
    if (scene.mode === 'points') {
      ctx.beginPath();
      ctx.arc(sx0 + 14, y - 8, 11, 0, Math.PI * 2);
      ctx.fill();
    } else ctx.fillRect(sx0, y - 22, 30, 26);
    ctx.fillStyle = '#14181d';
    ctx.fillText(truncate(ctx, it.label, side - 150), sx0 + 46, y);
    if (it.count !== undefined) {
      ctx.font = `400 20px ${mono}`;
      ctx.textAlign = 'right';
      ctx.fillText(it.count.toLocaleString('en-GB'), sx0 + side, y);
      ctx.textAlign = 'left';
      ctx.font = `400 24px ${sans}`;
    }
    y += 42;
  }
  if (scene.legend.note) {
    ctx.font = `400 20px ${sans}`;
    ctx.fillStyle = '#555d64';
    y = wrap(ctx, scene.legend.note, sx0, y + 8, side, 28);
  }

  // footer of the side column
  let fy = H - M - 210;
  ctx.fillStyle = 'rgba(20,24,29,0.28)';
  ctx.fillRect(sx0, fy, side, 2);
  fy += 40;
  ctx.fillStyle = '#14181d';
  ctx.font = `600 18px ${sans}`;
  ctx.fillText('SOURCE', sx0, fy);
  ctx.font = `400 20px ${sans}`;
  ctx.fillStyle = '#353c43';
  fy = wrap(ctx, `${ds.source.publisher}. ${ds.source.licence}.`, sx0, fy + 30, side, 27);
  fy = wrap(ctx, `${ds.n.toLocaleString('en-GB')} events mapped${ds.dropped.missingCoords + ds.dropped.nullIsland ? `, ${(ds.dropped.missingCoords + ds.dropped.nullIsland).toLocaleString('en-GB')} without a location left out` : ''}. Basemap ${BASEMAP_ATTRIBUTION}.`, sx0, fy + 4, side, 27);
  ctx.font = `400 18px ${mono}`;
  ctx.fillStyle = '#14181d';
  ctx.fillText(`Map honesty ${score}/100 · ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · Wherewise`, sx0, H - M);
  return c;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number): number {
  const words = text.split(/\s+/);
  let line = '';
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y);
      line = w;
      y += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lh;
}

function truncate(ctx: CanvasRenderingContext2D, s: string, max: number): string {
  if (ctx.measureText(s).width <= max) return s;
  let t = s;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}
