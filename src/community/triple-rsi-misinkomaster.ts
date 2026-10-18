/**
 * Triple RSI
 *
 * Three RSIs of the source, centred on 0 (RSI - 50), with lengths round(sqrt(len)), round(len / 2) and len:
 * TRSI = RSI(sqrt) + RSI(half) - RSI(len), smoothed with an RMA of half length, an RMA of sqrt length and an HMA of
 * sqrt length. The line and the fill to zero are green while TRSI > 0 and red while TRSI < 0 (the last colour is
 * kept at 0). The trend turns up when TRSI crosses over 0 and down when it crosses under 0; the background of the
 * indicator pane and of the price pane is coloured with the line colour on the bars where the trend changes.
 *
 * Reference: "Triple RSI | MisinkoMaster" by MisinkoMaster
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MisinkoMaster
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BgColorData } from '../types';

export interface TripleRsiMisinkoMasterInputs {
  /** TRSI length */
  len: number;
  /** Source */
  src: SourceType;
}

export const defaultInputs: TripleRsiMisinkoMasterInputs = {
  len: 30,
  src: 'close',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'TRSI Length', defval: 30, min: 3, step: 1, group: 'TRSI', tooltip: 'Changes the length of the TRSI' },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: 'TRSI' },
];

const COL_UP = String(color.rgb(0, 255, 0, 0));
const COL_DOWN = String(color.rgb(255, 0, 0, 0));
const FILL_UP = String(color.rgb(0, 222, 0, 65));
const FILL_DOWN = String(color.rgb(222, 0, 0, 65));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TRSI', color: color.white, lineWidth: 3 },
  { id: 'plot1', title: 'Zero Line', color: color.white, lineWidth: 2, display: 'pane' },
];

export const metadata = {
  title: 'Triple RSI | MisinkoMaster',
  shortTitle: 'TRSI | MisinkoMaster',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TripleRsiMisinkoMasterInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.src);

  // halflen = math.abs(math.round(len / 2)); sqrtlen = math.abs(math.round(math.sqrt(len)))
  const halflen = Math.abs(Math.round(cfg.len / 2));
  const sqrtlen = Math.abs(Math.round(Math.sqrt(cfg.len)));

  const rsi1 = A(ta.rsi(src, sqrtlen));
  const rsi2 = A(ta.rsi(src, halflen));
  const rsi3 = A(ta.rsi(src, cfg.len));
  // trsi = (rsi1 - 50) + (rsi2 - 50) - (rsi3 - 50), then rma(halflen), rma(sqrtlen), hma(sqrtlen)
  const raw = rsi1.map((v, i) => (v - 50) + (rsi2[i] - 50) - (rsi3[i] - 50));
  const r1 = A(ta.rma(S(raw), halflen));
  const r2 = A(ta.rma(S(r1), sqrtlen));
  const trsi = A(ta.hma(S(r2), sqrtlen));

  const t = (i: number) => bars[i].time;
  const plot0 = new Array(n);
  const plot1 = new Array(n);
  const fillColors: string[] = new Array(n);
  const bgColors: BgColorData[] = [];
  let trend = 0; // var trend = 0
  let col: string = color.white; // var col = color.white
  let colT: string = color.white; // var colT = color.white
  for (let i = 0; i < n; i++) {
    const prevTrend = trend;
    // L = ta.crossover(trsi, 0); S = ta.crossunder(trsi, 0): exact comparisons
    const prev = i > 0 ? trsi[i - 1] : NaN;
    const L = trsi[i] > 0 && prev <= 0;
    const Sx = trsi[i] < 0 && prev >= 0;
    if (L && !Sx) trend = 1;
    if (Sx) trend = -1;
    if (gt(trsi[i], 0)) {
      col = COL_UP;
      colT = FILL_UP;
    }
    if (lt(trsi[i], 0)) {
      col = COL_DOWN;
      colT = FILL_DOWN;
    }
    plot0[i] = { time: t(i), value: trsi[i], color: col };
    plot1[i] = { time: t(i), value: 0, color: color.white };
    fillColors[i] = colT;
    // bgcolor(trend != trend[1] ? col : na), once in the pane and once with force_overlay (trend[1] is na on bar 0)
    if (i > 0 && trend !== prevTrend) {
      bgColors.push({ id: 'bgcolor0', time: t(i), color: col });
      bgColors.push({ id: 'bgcolor1', time: t(i), color: col, forceOverlay: true });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // fill(trsip, t, color = colT)
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: fillColors }],
    bgColors,
  };
}

export const TripleRsiMisinkoMaster = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
