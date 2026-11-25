/**
 * Canvas layer for point symbols and labels, synced to a MapLibre camera.
 *
 * Why a canvas and not a MapLibre circle layer: it lets the studio offer the
 * two blending techniques from cartographic practice for real —
 *   layer blending   = CSS mix-blend-mode of this whole canvas over the basemap
 *   feature blending = canvas globalCompositeOperation between symbols
 * and it draws labels in proper map typefaces (serif for one class of
 * features, sans for another) with halos and collision handling.
 */
import { MercatorCoordinate, type Map as MlMap } from 'maplibre-gl';
import type { BlendMode, Dataset, LabelClass, LabelConfig } from '../lib/types';
import { compile, valueIsTrue, valueToText, type Compiled } from '../lib/expr/expression';

export interface PointStyle {
  colorOf: (i: number) => string;
  radiusOf: (i: number) => number;
  opacity: number;
  /** 0..1 multiplier per row (recency fade), or null */
  alphaOf: ((i: number) => number) | null;
  featureBlend: BlendMode;
  layerBlend: BlendMode;
  outline: boolean;
  /** rows to draw; null = all */
  subset: Uint32Array | null;
  /** rows to emphasise (others faded) */
  highlight: Uint8Array | null;
}

const COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
};

const FACES: Record<LabelConfig['pair'], { serif: string; sans: string }> = {
  'georgia-verdana': { serif: 'Georgia, "Times New Roman", serif', sans: 'Verdana, Geneva, "DejaVu Sans", sans-serif' },
  'archivo-georgia': { serif: 'Georgia, "Times New Roman", serif', sans: '"Archivo Variable", Archivo, sans-serif' },
};

export class PointsOverlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private mx = new Float64Array(0);
  private my = new Float64Array(0);
  private ds: Dataset | null = null;
  private style: PointStyle | null = null;
  private labels: LabelConfig | null = null;
  private compiled: { cls: LabelClass; text: Compiled | null; where: Compiled | null }[] = [];
  private groups: { color: string; alpha: number; idx: Uint32Array }[] = [];
  private visible = true;
  private raf = 0;
  /** screen positions from the last draw, for hit-testing */
  private hitX = new Float32Array(0);
  private hitY = new Float32Array(0);
  private hitR = new Float32Array(0);
  private hitI = new Uint32Array(0);
  private hitN = 0;
  onOverlap: ((share: number) => void) | null = null;
  private lastOverlapReport = 0;

  constructor(private map: MlMap, container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'points-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
    map.on('render', this.schedule);
    map.on('resize', this.resize);
    this.resize();
  }

  destroy() {
    this.map.off('render', this.schedule);
    this.map.off('resize', this.resize);
    cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  private resize = () => {
    const c = this.map.getCanvas();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth;
    const h = c.clientHeight;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.schedule();
  };

  private schedule = () => {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.draw();
    });
  };

  setVisible(v: boolean) {
    this.visible = v;
    this.canvas.style.display = v ? 'block' : 'none';
    this.schedule();
  }

  setData(ds: Dataset) {
    if (this.ds === ds) return;
    this.ds = ds;
    this.mx = new Float64Array(ds.n);
    this.my = new Float64Array(ds.n);
    for (let i = 0; i < ds.n; i++) {
      const m = MercatorCoordinate.fromLngLat([ds.lon[i], ds.lat[i]]);
      this.mx[i] = m.x;
      this.my[i] = m.y;
    }
    this.hitX = new Float32Array(ds.n);
    this.hitY = new Float32Array(ds.n);
    this.hitR = new Float32Array(ds.n);
    this.hitI = new Uint32Array(ds.n);
  }

  setStyle(style: PointStyle) {
    this.style = style;
    this.canvas.style.mixBlendMode = style.layerBlend === 'normal' ? 'normal' : style.layerBlend;
    this.rebuildGroups();
    this.schedule();
  }

  setLabels(labels: LabelConfig) {
    this.labels = labels;
    this.compiled = labels.classes.map((cls) => {
      let text: Compiled | null = null;
      let where: Compiled | null = null;
      try { text = compile(cls.expression); } catch { text = null; }
      try { where = cls.where.trim() ? compile(cls.where) : null; } catch { where = null; }
      return { cls, text, where };
    });
    this.schedule();
  }

  /** Group rows by colour and alpha bucket so each group is one path fill. */
  private rebuildGroups() {
    const ds = this.ds;
    const st = this.style;
    if (!ds || !st) { this.groups = []; return; }
    const rows = st.subset ?? null;
    const len = rows ? rows.length : ds.n;
    const buckets = new Map<string, number[]>();
    const proportional = !!st.outline;
    const order: number[] = [];
    for (let k = 0; k < len; k++) order.push(rows ? rows[k] : k);
    if (proportional) order.sort((a, b) => st.radiusOf(b) - st.radiusOf(a));
    for (const i of order) {
      const a = st.alphaOf ? Math.round(st.alphaOf(i) * 4) / 4 : 1;
      const faded = st.highlight && !st.highlight[i] ? 1 : 0;
      const key = `${st.colorOf(i)}|${faded ? 0.12 : a}`;
      let arr = buckets.get(key);
      if (!arr) buckets.set(key, (arr = []));
      arr.push(i);
    }
    this.groups = [...buckets].map(([key, idx]) => {
      const [color, alpha] = key.split('|');
      return { color, alpha: Number(alpha), idx: Uint32Array.from(idx) };
    });
    // faded groups first, then by alpha so emphasised symbols sit on top
    this.groups.sort((a, b) => a.alpha - b.alpha);
  }

  private draw() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const st = this.style;
    if (!this.visible || !this.ds || !st) return;
    const dpr = w / Math.max(1, this.canvas.clientWidth || 1);
    const map = this.map;
    const zoom = map.getZoom();
    const world = 512 * Math.pow(2, zoom);
    const c = MercatorCoordinate.fromLngLat(map.getCenter());
    const bearing = (map.getBearing() * Math.PI) / 180;
    const cos = Math.cos(-bearing);
    const sin = Math.sin(-bearing);
    const cw = this.canvas.clientWidth / 2;
    const ch = this.canvas.clientHeight / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = COMPOSITE[st.featureBlend];

    const copies = world < this.canvas.clientWidth * 1.5 ? [-1, 0, 1] : [0];
    const occupancy = new Uint8Array(Math.ceil(this.canvas.clientWidth / 3) * Math.ceil(this.canvas.clientHeight / 3) + 1);
    const gw = Math.ceil(this.canvas.clientWidth / 3);
    let visibleCount = 0;
    let stacked = 0;
    this.hitN = 0;

    for (const g of this.groups) {
      ctx.fillStyle = g.color;
      ctx.globalAlpha = st.opacity * g.alpha;
      ctx.beginPath();
      for (let k = 0; k < g.idx.length; k++) {
        const i = g.idx[k];
        for (const off of copies) {
          const dx = (this.mx[i] + off - c.x) * world;
          const dy = (this.my[i] - c.y) * world;
          const x = cw + dx * cos - dy * sin;
          const y = ch + dx * sin + dy * cos;
          const r = st.radiusOf(i);
          if (x < -r || y < -r || x > cw * 2 + r || y > ch * 2 + r) continue;
          ctx.moveTo(x + r, y);
          ctx.arc(x, y, r, 0, Math.PI * 2);
          if (g.alpha > 0.2) {
            visibleCount++;
            const cell = Math.floor(y / 3) * gw + Math.floor(x / 3);
            if (cell >= 0 && cell < occupancy.length) {
              if (occupancy[cell]) stacked++;
              else occupancy[cell] = 1;
            }
            if (this.hitN < this.hitX.length) {
              this.hitX[this.hitN] = x;
              this.hitY[this.hitN] = y;
              this.hitR[this.hitN] = r;
              this.hitI[this.hitN] = i;
              this.hitN++;
            }
          }
        }
      }
      ctx.fill();
      if (st.outline) {
        ctx.globalAlpha = Math.min(1, st.opacity + 0.15) * g.alpha;
        ctx.strokeStyle = 'rgba(251,251,249,0.85)';
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    const now = performance.now();
    if (this.onOverlap && now - this.lastOverlapReport > 600) {
      this.lastOverlapReport = now;
      this.onOverlap(visibleCount > 50 ? stacked / visibleCount : 0);
    }
    this.drawLabels(ctx, zoom);
  }

  private drawLabels(ctx: CanvasRenderingContext2D, zoom: number) {
    const labels = this.labels;
    const ds = this.ds;
    if (!labels?.enabled || !ds || zoom < labels.minZoom) return;
    const faces = FACES[labels.pair];
    const placed: [number, number, number, number][] = [];
    const collides = (b: [number, number, number, number]) =>
      placed.some((p) => !(b[2] < p[0] || b[0] > p[2] || b[3] < p[1] || b[1] > p[3]));
    // density cap: roughly one label per 120 x 120 px of map, so text never carpets the view
    const budget = Math.max(12, Math.floor((this.canvas.clientWidth * this.canvas.clientHeight) / 14400));
    let drawn = 0;
    for (const { cls, text, where } of this.compiled) {
      if (!text) continue;
      const weight = cls.bold ? '700' : '400';
      const style = cls.italic ? 'italic' : 'normal';
      ctx.font = `${style} ${weight} ${cls.size}px ${cls.face === 'serif' ? faces.serif : faces.sans}`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.lineJoin = 'round';
      for (let k = 0; k < this.hitN && drawn < budget; k++) {
        const i = this.hitI[k];
        const row = ds.rows[i];
        try {
          if (where && !valueIsTrue(where.run(row))) continue;
          let s = valueToText(text.run(row));
          if (!s) continue;
          if (cls.caps) s = s.toUpperCase();
          const x = this.hitX[k] + this.hitR[k] + 3;
          const y = this.hitY[k];
          const m = ctx.measureText(s);
          const box: [number, number, number, number] = [x - 10, y - cls.size * 1.1, x + m.width + 10, y + cls.size * 1.1];
          if (collides(box)) continue;
          placed.push(box);
          if (cls.halo) {
            ctx.strokeStyle = 'rgba(246,247,244,0.92)';
            ctx.lineWidth = 3;
            ctx.strokeText(s, x, y);
          }
          ctx.fillStyle = cls.color;
          ctx.fillText(s, x, y);
          drawn++;
        } catch {
          /* a bad expression on one row should not stop the layer */
        }
      }
    }
  }

  /** Nearest drawn symbol under a screen point. */
  hit(x: number, y: number, tolerance = 4): number | null {
    let best = -1;
    let bestD = Infinity;
    for (let k = this.hitN - 1; k >= 0; k--) {
      const d = Math.hypot(this.hitX[k] - x, this.hitY[k] - y);
      if (d <= this.hitR[k] + tolerance && d < bestD) {
        bestD = d;
        best = this.hitI[k];
      }
    }
    return best >= 0 ? best : null;
  }

  /** Paint this overlay onto another canvas (poster export). */
  composeInto(target: CanvasRenderingContext2D, dx: number, dy: number, dw: number, dh: number) {
    target.save();
    const blend = this.style?.layerBlend ?? 'normal';
    target.globalCompositeOperation = COMPOSITE[blend];
    target.drawImage(this.canvas, dx, dy, dw, dh);
    target.restore();
  }
}
