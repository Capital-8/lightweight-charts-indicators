/**
 * Dynamic Swing Anchored VWAP (Zeiierman)
 *
 * The swing direction is up when the latest highest high of the last "Swing Period" bars is more recent than the
 * latest lowest low, else down. When the direction changes, the swing point before it (the low for an up swing, the
 * high for a down swing) gets a label (HH / LH / HL / LL against the swing before) and becomes the anchor of a new
 * VWAP line. The VWAP is a ratio of two exponential averages, of price (hlc3) times volume and of volume, started on
 * the anchor bar with the anchor price. Their alpha comes from "Adaptive Price Tracking" taken as a half-life in
 * bars; with "Adapt APT by ATR ratio" it is divided by (ATR(50) / its RMA(50)) to the power "Volatility Bias"
 * (kept between 5 and 300).
 *
 * Each VWAP segment is a polyline. The segment in progress is redrawn on every bar; the segments before stay. At
 * most 100 polylines and 500 labels are kept.
 *
 * Reference: "Dynamic Swing Anchored VWAP (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, PolylineData } from '../types';

export interface DynamicSwingAnchoredVwapInputs {
  /** Number of bars used to detect swing highs and lows */
  prd: number;
  /** How quickly the VWAP adjusts to new price action (half-life in bars) */
  baseAPT: number;
  useAdapt: boolean;
  volBias: number;
  highS: string;
  lowS: string;
  S: string;
  R: string;
  /** Width of the VWAP lines */
  xx: number;
}

export const defaultInputs: DynamicSwingAnchoredVwapInputs = {
  prd: 50,
  baseAPT: 20,
  useAdapt: false,
  volBias: 10,
  highS: '#00E676',
  lowS: '#F23645',
  S: '#00E676',
  R: '#F23645',
  xx: 2,
};

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'Swing Period', defval: 50, min: 2, group: 'Swing Points' },
  { id: 'baseAPT', type: 'float', title: 'Adaptive Price Tracking', defval: 20, min: 1, step: 1, group: 'Swing Points' },
  { id: 'useAdapt', type: 'bool', title: 'Adapt APT by ATR ratio', defval: false, group: 'Swing Points' },
  { id: 'volBias', type: 'float', title: 'Volatility Bias', defval: 10, min: 0.1, step: 0.1, group: 'Swing Points' },
  { id: 'highS', type: 'color', title: 'Swing Labels', defval: '#00E676', group: 'Style', inline: 'Swing' },
  { id: 'lowS', type: 'color', title: '', defval: '#F23645', group: 'Style', inline: 'Swing' },
  { id: 'S', type: 'color', title: 'VWAP Lines', defval: '#00E676', group: 'Style', inline: 'VWAP' },
  { id: 'R', type: 'color', title: '', defval: '#F23645', group: 'Style', inline: 'VWAP' },
  { id: 'xx', type: 'int', title: '', defval: 2, min: 1, group: 'Style', inline: 'VWAP' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dynamic Swing Anchored VWAP (Zeiierman)',
  shortTitle: 'Dynamic Swing Anchored VWAP (Zeiierman)',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_polylines_count = 100) */
const MAX_LABELS = 500;
const MAX_POLYLINES = 100;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Point {
  index: number;
  price: number;
}
interface Poly {
  points: Point[];
  color: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicSwingAnchoredVwapInputs> = {},
): Omit<IndicatorResult, 'labels' | 'polylines'> & { labels: LabelData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const hiBars = A(ta.highestbars(new Series(bars, (b) => b.high), cfg.prd));
  const loBars = A(ta.lowestbars(new Series(bars, (b) => b.low), cfg.prd));
  const atrSeries = ta.atr(bars, 50);
  const atr = A(atrSeries);
  const atrAvg = A(ta.rma(atrSeries, 50));
  const vol = (i: number) => bars[i].volume ?? NaN;
  const hlc3 = (i: number) => (bars[i].high + bars[i].low + bars[i].close) / 3;

  // aptSeries and the alpha of each bar (half-life -> EWMA alpha)
  const alphaAt: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ratio = gt(atrAvg[i], 0) ? atr[i] / atrAvg[i] : 1.0;
    const aptRaw = cfg.useAdapt ? cfg.baseAPT / Math.pow(ratio, cfg.volBias) : cfg.baseAPT;
    const apt = Math.round(Math.max(5.0, Math.min(300.0, aptRaw)));
    alphaAt[i] = 1.0 - Math.exp(-Math.log(2.0) / Math.max(1.0, apt));
  }

  let ph = NaN;
  let pl = NaN;
  let phL = 0; // var phL = b: the first bar
  let plL = 0;
  let prev = NaN;
  let dirPrev = NaN;
  let p = n > 0 ? hlc3(0) * vol(0) : NaN; // var p = hlc3 * volume
  let v = n > 0 ? vol(0) : NaN; // var vol = volume
  let points: Point[] = [];
  let live: Poly | null = null; // vwap.poly
  // Polylines that stay (one per direction change), oldest first; the segment in progress is the newest polyline
  let kept: Poly[] = [];
  /** polyline.new: when the creation brings the count above max + 5, the oldest are deleted until max remain */
  const created = (withLive: boolean) => {
    const count = kept.length + (withLive ? 1 : 0);
    if (count > MAX_POLYLINES + 5) kept = kept.slice(count - MAX_POLYLINES);
  };
  let labels: Array<{ x: number; y: number; text: string; up: boolean; color: string }> = [];

  for (let i = 0; i < n; i++) {
    const phPrev = ph;
    const plPrev = pl;
    if (hiBars[i] === 0) {
      ph = bars[i].high;
      phL = i;
    }
    if (loBars[i] === 0) {
      pl = bars[i].low;
      plL = i;
    }
    const dir = phL > plL ? 1 : -1;

    // dir != dir[1] (false on the first bar: dir[1] is na)
    if (i > 0 && dir !== dirPrev) {
      const up = dir > 0;
      const x = up ? plL : phL;
      const y = up ? pl : ph;
      const txt = up && lt(pl, prev) ? 'LL' : up && gt(pl, prev) ? 'HL' : !up && lt(ph, prev) ? 'LH' : !up && gt(ph, prev) ? 'HH' : '';
      labels.push({ x, y, text: txt, up, color: String(color.new(up ? cfg.highS : cfg.lowS, 20)) });
      if (labels.length > MAX_LABELS + 5) labels = labels.slice(labels.length - MAX_LABELS);
      prev = up ? phPrev : plPrev;

      const barsback = i - x;
      p = y * vol(i - barsback);
      v = vol(i - barsback);

      // the points of the segment before stay as a polyline of their own
      kept.push({ points, color: dir < 0 ? cfg.R : cfg.S });
      created(false);
      points = [];
      for (let k = barsback; k >= 0; k--) {
        const alpha = alphaAt[i - k];
        p = (1.0 - alpha) * p + alpha * (hlc3(i - k) * vol(i - k));
        v = (1.0 - alpha) * v + alpha * vol(i - k);
        points.push({ index: i - k, price: gt(v, 0) ? p / v : NaN });
      }
      live = { points, color: dir < 0 ? cfg.R : cfg.S };
      created(true);
    } else {
      const alpha = alphaAt[i];
      p = (1.0 - alpha) * p + alpha * (hlc3(i) * vol(i));
      v = (1.0 - alpha) * v + alpha * vol(i);
      points.push({ index: i, price: gt(v, 0) ? p / v : NaN });
      live = { points, color: dir > 0 ? cfg.R : cfg.S };
      created(true);
    }
    dirPrev = dir;
  }

  const polylines: PolylineData[] = [...kept, ...(live ? [live] : [])].map((poly) => ({
    points: poly.points.map((pt) => ({ time: bars[pt.index].time, price: pt.price })),
    lineColor: poly.color,
    lineWidth: cfg.xx,
  }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a label with an na price (a swing point that does not exist yet) is not drawn
    labels: labels.filter((l) => !Number.isNaN(l.y)).map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text, style: l.up ? ('label_up' as const) : ('label_down' as const),
      color: l.color, textColor: '#FFFFFF',
    })),
    polylines,
  };
}

export const DynamicSwingAnchoredVwap = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
