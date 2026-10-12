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
 * most 100 polylines and 500 labels are kept (library drawing registry).
 *
 * Reference: "Dynamic Swing Anchored VWAP (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import {
  ta, color, label, polyline, chartPoint, Series, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type ChartPoint, type Polyline,
} from 'oakscriptjs';
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
  let points: ChartPoint[] = [];
  // vwap.poly: a field of a user type, not a `var` variable: the maximum count may delete it
  let live: Polyline | undefined;

  // Labels and polylines live in the library registry: max_labels_count 500, max_polylines_count 100 and the
  // PineScript rules of the count (one polyline deleted and one created per bar, the last bar)
  resetDrawings({ label: MAX_LABELS, polyline: MAX_POLYLINES });

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
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
      label.new(x, y, txt, 'bar_index', 'price', color.new(up ? cfg.highS : cfg.lowS, 20), up ? 'label_up' : 'label_down', '#FFFFFF');
      prev = up ? phPrev : plPrev;

      const barsback = i - x;
      p = y * vol(i - barsback);
      v = vol(i - barsback);

      if (live) polyline.delete(live);
      // the points of the segment before stay as a polyline of their own
      polyline.new(points, false, false, 'bar_index', dir < 0 ? cfg.R : cfg.S, null, 'solid', cfg.xx);
      points = [];
      for (let k = barsback; k >= 0; k--) {
        const alpha = alphaAt[i - k];
        p = (1.0 - alpha) * p + alpha * (hlc3(i - k) * vol(i - k));
        v = (1.0 - alpha) * v + alpha * vol(i - k);
        points.push(chartPoint.from_index(i - k, gt(v, 0) ? p / v : NaN));
      }
      live = polyline.new(points, false, false, 'bar_index', dir < 0 ? cfg.R : cfg.S, null, 'solid', cfg.xx);
    } else {
      const alpha = alphaAt[i];
      p = (1.0 - alpha) * p + alpha * (hlc3(i) * vol(i));
      v = (1.0 - alpha) * v + alpha * vol(i);
      if (live) polyline.delete(live);
      points.push(chartPoint.from_index(i, gt(v, 0) ? p / v : NaN));
      live = polyline.new(points, false, false, 'bar_index', dir > 0 ? cfg.R : cfg.S, null, 'solid', cfg.xx);
    }
    dirPrev = dir;
  }
  setDrawingBar(null);

  const T = (index: number | null) => bars[index ?? 0].time;
  const polylines: PolylineData[] = polyline.all().map((poly) => ({
    points: poly.points.map((pt) => ({ time: T(pt.index), price: pt.price })),
    lineColor: String(poly.line_color),
    lineWidth: poly.line_width,
  }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a label with an na price (a swing point that does not exist yet) is not drawn
    labels: label.all().filter((l) => !Number.isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', style: l.style === 'label_up' ? ('label_up' as const) : ('label_down' as const),
      color: String(l.color), textColor: '#FFFFFF',
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
