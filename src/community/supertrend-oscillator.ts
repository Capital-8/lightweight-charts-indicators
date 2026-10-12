/**
 * SuperTrend Oscillator [LuxAlgo]
 *
 * A SuperTrend with ATR bands (hl2 +- ATR * factor, trailing upper and lower bands). The oscillator is the distance
 * of the close to the SuperTrend line divided by the band width, kept in -1..1 and drawn times 100 as columns whose
 * transparency follows the oscillator (or as an area with fixed colours). The signal line is an adaptive moving
 * average of the oscillator (alpha = oscillator squared / length); the histogram is the EMA of the oscillator minus
 * the signal. When the oscillator changes sign, a point at -oscillator * 100 is drawn. Labels at +-80 mark the
 * crosses of the close and the SuperTrend: a cross mark when the price of the last cross under is below the price
 * of the last cross over, else a check mark. On the last bar a line joins the last cross to the oscillator, and an
 * optional label gives the share of these false signals. At most 50 labels are kept.
 *
 * Reference: "[LUX] SuperTrend Oscillator" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, color, Series, label, line, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';

export interface SuperTrendOscillatorInputs {
  /** ATR length (also the divisor of the signal line alpha) */
  length: number;
  /** ATR factor of the bands */
  mult: number;
  /** EMA length of the histogram */
  smooth: number;
  fixed: boolean;
  showLines: boolean;
  showLabels: boolean;
  showPercent: boolean;
}

export const defaultInputs: SuperTrendOscillatorInputs = {
  length: 10,
  mult: 2.0,
  smooth: 72,
  fixed: false,
  showLines: true,
  showLabels: true,
  showPercent: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'length', defval: 10, min: 1 },
  { id: 'mult', type: 'float', title: 'mult', defval: 2.0, min: 1 },
  { id: 'smooth', type: 'int', title: 'smooth', defval: 72, min: 1 },
  { id: 'fixed', type: 'bool', title: 'Fixed Transparency', defval: false, group: 'Misc' },
  { id: 'showLines', type: 'bool', title: 'Show Lines', defval: true, group: 'Misc' },
  { id: 'showLabels', type: 'bool', title: 'Show Labels', defval: true, group: 'Misc' },
  { id: 'showPercent', type: 'bool', title: 'Show % False Signals', defval: false, group: 'Misc' },
];

const GREEN = '#0cb51a';
const RED = '#ff1100';
const BLUE = '#2157f3';
const PURPLE = '#673ab7';
/** color.gray of a v4 script */
const GRAY = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Main Fixed', color: GREEN, lineWidth: 1, style: 'area' },
  { id: 'plot1', title: 'Main Transp', color: GREEN, lineWidth: 1, style: 'columns' },
  { id: 'plot2', title: 'Histogram', color: String(color.new('#808080', 40)), lineWidth: 1, style: 'area' },
  { id: 'plot3', title: 'Signal', color: BLUE, lineWidth: 1 },
  { id: 'plot4', title: 'Plot', color: RED, lineWidth: 1 },
];

/** hline(80) and hline(-80): default colour, dashed */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_80', price: 80, color: GRAY, linestyle: 'dashed', linewidth: 1 },
  { id: 'hline_minus80', price: -80, color: GRAY, linestyle: 'dashed', linewidth: 1 },
];

/** fill(a, b, #2157f3, 90) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_levels', plot1: 'hline_80', plot2: 'hline_minus80', color: String(color.new(BLUE, 90)), title: 'Hlines Background' },
];

export const metadata = {
  title: '[LUX] SuperTrend Oscillator',
  shortTitle: 'SuperOsc [LuxAlgo]',
  overlay: false,
};

/** study() default: at most 50 labels and 50 lines */
const MAX_OBJECTS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SuperTrendOscillatorInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));
  const S = (a: number[]) => Series.fromArray(bars, a);

  // up_col / dn_col: index k is the colour with transparency 100 - k
  const upCol: string[] = [];
  const dnCol: string[] = [];
  for (let k = 0; k < 100; k++) {
    upCol.push(String(color.new(GREEN, 100 - k)));
    dnCol.push(String(color.new(RED, 100 - k)));
  }

  const atr = A(ta.atr(bars, cfg.length));
  const src = bars.map((b) => b.close);
  const upper: number[] = new Array(n).fill(NaN);
  const lower: number[] = new Array(n).fill(NaN);
  const spt: number[] = new Array(n).fill(NaN);
  const osc: number[] = new Array(n).fill(NaN);
  const ama: number[] = new Array(n).fill(NaN);
  let trend = NaN; // trend[1] is na on the first bar
  for (let i = 0; i < n; i++) {
    const a = atr[i] * cfg.mult;
    const hl2 = (bars[i].high + bars[i].low) / 2;
    const up = hl2 + a;
    const dn = hl2 - a;
    const upPrev = i > 0 ? upper[i - 1] : NaN;
    const loPrev = i > 0 ? lower[i - 1] : NaN;
    const srcPrev = i > 0 ? src[i - 1] : NaN;
    upper[i] = lt(srcPrev, upPrev) ? Math.min(up, upPrev) : up;
    lower[i] = gt(srcPrev, loPrev) ? Math.max(dn, loPrev) : dn;
    trend = gt(src[i], upPrev) ? 1 : lt(src[i], loPrev) ? 0 : trend;
    spt[i] = trend * lower[i] + (1 - trend) * upper[i];
    // max(min(x, 1), -1): na stays na
    const raw = (src[i] - spt[i]) / (upper[i] - lower[i]);
    osc[i] = Number.isNaN(raw) ? NaN : Math.max(Math.min(raw, 1), -1);
    const alpha = Math.pow(osc[i], 2) / cfg.length;
    const amaPrev = i > 0 ? ama[i - 1] : NaN;
    const next = amaPrev + alpha * (osc[i] - amaPrev);
    ama[i] = Number.isNaN(next) ? osc[i] : next; // nz(ama[1] + alpha * (osc - ama[1]), osc)
  }
  const hist = A(ta.ema(S(osc.map((o, i) => o - ama[i])), cfg.smooth));

  // Crosses of the close and the SuperTrend line
  const srcS = S(src);
  const sptS = S(spt);
  const cross = B(ta.cross(srcS, sptS));
  const crossOver = B(ta.crossover(srcS, sptS));
  const crossUnder = B(ta.crossunder(srcS, sptS));

  const time = (i: number) => bars[i].time;
  const plots: Record<string, Point[]> = { plot0: [], plot1: [], plot2: [], plot3: [], plot4: [] };

  resetDrawings({ label: MAX_OBJECTS, line: MAX_OBJECTS });
  let x2 = NaN; // valuewhen(cross, n, 0)
  let overSrc = NaN; // valuewhen(crossover(src, Spt), src, 0)
  let underSrc = NaN; // valuewhen(crossunder(src, Spt), src, 0)
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const o = osc[i];
    const t = time(i);
    const fixCss = gt(o, 0) ? GREEN : RED;
    // array.get(up_col, round(osc * 99)) / array.get(dn_col, round(osc * -1 * 99)); na index: na colour
    const varCss = Number.isNaN(o) ? undefined : gt(o, 0) ? upCol[Math.round(o * 99)] : dnCol[Math.round(-o * 99) || 0];
    const sigCss = gt(ama[i], 0) ? BLUE : PURPLE;
    plots.plot0.push({ time: t, value: cfg.fixed ? o * 100 : NaN, color: fixCss });
    plots.plot1.push({ time: t, value: cfg.fixed ? NaN : o * 100, ...(varCss ? { color: varCss } : {}) });
    plots.plot2.push({ time: t, value: hist[i] * 100 });
    plots.plot3.push({ time: t, value: ama[i] * 100, color: sigCss });
    // change(sign(osc)): true when the difference is neither 0 nor na
    const signChange = i > 0 ? Math.sign(o) - Math.sign(osc[i - 1]) : NaN;
    const sig = !Number.isNaN(signChange) && signChange !== 0 ? o * -100 : NaN;
    plots.plot4.push({ time: t, value: cfg.showLines ? sig : NaN, color: gt(o, 0) ? RED : GREEN });

    if (cross[i]) x2 = i;
    if (crossOver[i]) overSrc = src[i];
    if (crossUnder[i]) underSrc = src[i];
    const falseBuy = lt(underSrc, overSrc);
    const falseSell = gt(overSrc, underSrc);
    if (cross[i]) {
      den += 1;
      if (falseBuy || falseSell) num += 1;
    }
    const per = (num / den) * 100;

    const last = i === n - 1;
    if (last && cfg.showLines) {
      line.new(x2, Math.sign(o) * -100, i, o * 100, 'bar_index', 'none', lt(o, 0) ? RED : GREEN);
    }
    if (cfg.showLabels) {
      if (crossOver[i]) {
        label.new(x2, -80, falseSell ? '❌' : '✔️', 'bar_index', 'price', '#00000000', 'label_up', GRAY, 'normal', 'center');
      }
      if (crossUnder[i]) {
        label.new(x2, 80, falseBuy ? '❌' : '✔️', 'bar_index', 'price', '#00000000', 'label_down', GRAY, 'normal', 'center');
      }
      if (last && cfg.showPercent) {
        label.new(i, o, '❌' + str.tostring(per, '#.##') + '%', 'bar_index', 'price', '#00000000', 'label_left', GRAY, 'normal', 'left');
      }
    }
  }
  setDrawingBar(null);

  const T = (x: number) => time(x);
  const labels: LabelData[] = label.all().filter((l) => !Number.isNaN(l.x) && !Number.isNaN(l.y)).map((l) => ({
    time: T(l.x),
    price: l.y,
    text: l.text ?? '',
    style: l.style as LabelData['style'],
    color: '#00000000',
    textColor: GRAY,
    size: 'normal',
    textAlign: l.textalign === 'left' ? 'left' : 'center',
  }));
  const lines: LineDrawingData[] = line.all().filter((l) => !Number.isNaN(l.x1) && !Number.isNaN(l.y1)).map((l) => ({
    time1: T(l.x1),
    price1: l.y1,
    time2: T(l.x2),
    price2: l.y2,
    color: String(l.color),
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 80, options: { color: GRAY, linestyle: 'dashed', linewidth: 1 } },
      { value: -80, options: { color: GRAY, linestyle: 'dashed', linewidth: 1 } },
    ],
    fills: [
      { plot1: 'hline_80', plot2: 'hline_minus80', options: { title: 'Hlines Background', color: String(color.new(BLUE, 90)) } },
    ],
    labels,
    lines,
  };
}

export const SuperTrendOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
