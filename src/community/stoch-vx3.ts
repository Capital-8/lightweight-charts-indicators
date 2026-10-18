/**
 * Stoch VX3
 *
 * As the original: K = SMA(stoch(close, high, low, length), smoothK) (blue), D = SMA(K, smoothD) (red), the
 * percentile rank over 'PRO-Top bars of a Laguerre PPO of hl2 (gammas "LONG" 0.3 and "SHORT" 0.5:
 * (fast - slow) / slow * 100) as a gray line, and black circles at D on the bars where D crosses K. Background black
 * while K is not above or equal to D (also before both exist), teal otherwise (transparency 80). Levels 80 / 20 red,
 * width 2, in the default dashed style.
 *
 * Reference: "Stoch VX3"
 */

import { taCore, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';

export interface StochVX3Inputs {
  len: number;
  smoothK: number;
  smoothD: number;
  pctile: number;
  wrnpctile: number;
  /** Laguerre gamma of the fast line (title "LONG") */
  shortGamma: number;
  /** Laguerre gamma of the slow line (title "SHORT") */
  longGamma: number;
  lkbT: number;
  lkbB: number;
}

export const defaultInputs: StochVX3Inputs = {
  len: 13,
  smoothK: 5,
  smoothD: 5,
  pctile: 90,
  wrnpctile: 70,
  shortGamma: 0.3,
  longGamma: 0.5,
  lkbT: 144,
  lkbB: 144,
};

// Untitled inputs keep their variable names as titles
export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'length', defval: 13, min: 1 },
  { id: 'smoothK', type: 'int', title: 'smoothK', defval: 5, min: 1 },
  { id: 'smoothD', type: 'int', title: 'smoothD', defval: 5, min: 1 },
  { id: 'pctile', type: 'int', title: '%', defval: 90 },
  { id: 'wrnpctile', type: 'int', title: ' %', defval: 70 },
  { id: 'shortGamma', type: 'float', title: 'LONG', defval: 0.3 },
  { id: 'longGamma', type: 'float', title: 'SHORT', defval: 0.5 },
  { id: 'lkbT', type: 'int', title: "'PRO-Top", defval: 144 },
  { id: 'lkbB', type: 'int', title: "'PRO-Bottom", defval: 144 },
];

/** Pine version 1 colours */
const BLUE = '#0000FF';
const RED = '#FF0000';
const GRAY = '#808080';
const BLACK = '#000000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: BLUE, lineWidth: 1 },
  { id: 'plot1', title: 'Plot', color: RED, lineWidth: 2 },
  { id: 'plot2', title: 'Percentile Rank Columns', color: GRAY, lineWidth: 1 },
  { id: 'plot3', title: 'Plot', color: BLACK, lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: 'Stoch VX3',
  shortTitle: 'StochVX3',
  overlay: false,
};

/** lag(g, p) of the original: the Laguerre filter (L0 + 2 L1 + 2 L2 + L3) / 6 */
function laguerre(g: number, p: number[]): number[] {
  let l0 = NaN, l1 = NaN, l2 = NaN, l3 = NaN;
  const nz = (v: number) => (Number.isFinite(v) ? v : 0);
  return p.map((v) => {
    const n0 = (1 - g) * v + g * nz(l0);
    const n1 = -g * n0 + nz(l0) + g * nz(l1);
    const n2 = -g * n1 + nz(l1) + g * nz(l2);
    const n3 = -g * n2 + nz(l2) + g * nz(l3);
    l0 = n0; l1 = n1; l2 = n2; l3 = n3;
    return (n0 + 2 * n1 + 2 * n2 + n3) / 6;
  });
}

export function calculate(bars: Bar[], inputs: Partial<StochVX3Inputs> = {}): Omit<IndicatorResult, 'markers'> & { bgColors: BgColorData[] } {
  const { len, smoothK, smoothD, shortGamma, longGamma, lkbT } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = bars.map((b) => b.high), low = bars.map((b) => b.low), close = bars.map((b) => b.close);

  const k = taCore.sma(taCore.stoch(close, high, low, len), smoothK);
  const d = taCore.sma(k, smoothD);

  const hl2 = bars.map((b) => (b.high + b.low) / 2);
  const lmas = laguerre(shortGamma, hl2);
  const lmal = laguerre(longGamma, hl2);
  const ppoT = lmas.map((v, i) => (v - lmal[i]) / lmal[i] * 100);
  const pctRankT = taCore.percentrank(ppoT, lkbT);

  const num = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = k.map((v, i) => ({ time: bars[i].time, value: num(v) }));
  const plot1 = d.map((v, i) => ({ time: bars[i].time, value: num(v) }));
  const plot2 = pctRankT.map((v, i) => ({ time: bars[i].time, value: num(v), color: GRAY }));
  // plot(cross(d, k) ? d : na, color=black, style=circles, linewidth=4)
  const plot3 = bars.map((b, i) => {
    const d1 = i > 0 ? d[i - 1] : NaN, k1 = i > 0 ? k[i - 1] : NaN;
    const cross = (d[i] > k[i] && d1 <= k1) || (d[i] < k[i] && d1 >= k1);
    return { time: b.time, value: cross ? d[i] : NaN, color: BLACK };
  });

  // OutputSignal = k >= d ? 0 : 1 (na compares false: 1); bgcolor(OutputSignal > 0 ? #000000 : #128E89, transp=80)
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const black = !(k[i] >= d[i]);
    bgColors.push({ id: 'bgcolor0', time: bars[i].time, color: black ? 'rgba(0, 0, 0, 0.20)' : 'rgba(18, 142, 137, 0.20)' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3 },
    // hline(80 / 20, color=red, linewidth=2): Pine v1 red, Pine default line style (dashed)
    hlines: [
      { value: 80, options: { color: RED, linestyle: 'dashed' as const, linewidth: 2, title: 'Overbought' } },
      { value: 20, options: { color: RED, linestyle: 'dashed' as const, linewidth: 2, title: 'Oversold' } },
    ],
    // fill between ob/os hlines (Pine: fill(h0, h1, color=purple, transp=100) - fully transparent, decorative)
    fills: [
      { plot1: 'overbought', plot2: 'oversold', options: { color: 'rgba(156, 39, 176, 0.0)' } },
    ],
    bgColors,
  } as Omit<IndicatorResult, 'markers'> & { bgColors: BgColorData[] };
}

export const StochVX3 = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
