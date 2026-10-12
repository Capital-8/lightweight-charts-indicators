/**
 * Inverse Fisher Transform COMBO [Stoch + RSI + CCI + MFI]
 *
 * Four oscillators, each scaled around 0 (0.1 * (CCI / 4), 0.1 * (RSI - 50), 0.1 * (Stoch - 50),
 * 0.1 * (MFI - 50)), smoothed with a WMA and passed through the inverse Fisher transform
 * IFT(x) = (e^(2x) - 1) / (e^(2x) + 1), which maps them to -1..1. The MFI is built from hlc3 and the volume
 * (sums of the money flow of the up and down bars). The average line is the mean of the four transforms.
 * Each line shows only when its option is on (by default only the CCI line) and where its value is not 0.
 * Levels at 0.5 and -0.5.
 *
 * Reference: "Inverse Fisher Transform COMBO" by KivancOzbilgic (creator John Ehlers)
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: author @KivancOzbilgic, creator John EHLERS
 */

import { ta, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';

export interface IFTStochRSICCIInputs {
  /** Show the IFT of the Stochastic */
  showSto: boolean;
  /** Show the IFT of the RSI */
  showRsi: boolean;
  /** Show the IFT of the CCI */
  showCci: boolean;
  /** Show the IFT of the MFI */
  showMfi: boolean;
  /** Show the average of the four IFT lines */
  showAverage: boolean;
  cciLength: number;
  /** WMA smoothing length */
  wmaLength: number;
  rsiLength: number;
  stochLength: number;
  mfiLength: number;
}

export const defaultInputs: IFTStochRSICCIInputs = {
  showSto: false,
  showRsi: false,
  showCci: true,
  showMfi: false,
  showAverage: false,
  cciLength: 5,
  wmaLength: 9,
  rsiLength: 5,
  stochLength: 5,
  mfiLength: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'showSto', type: 'bool', title: 'Show INVERSE FISHER TRANSFORM on STOCHASTIC Line?', defval: false },
  { id: 'showRsi', type: 'bool', title: 'Show INVERSE FISHER TRANSFORM on RSI Line?', defval: false },
  { id: 'showCci', type: 'bool', title: 'Show INVERSE FISHER TRANSFORM on CCI Line?', defval: true },
  { id: 'showMfi', type: 'bool', title: 'Show INVERSE FISHER TRANSFORM on MFI Line?', defval: false },
  { id: 'showAverage', type: 'bool', title: 'Show INVERSE FISHER TRANSFORM AVERAGE Line?', defval: false },
  { id: 'cciLength', type: 'int', title: 'CCI Length', defval: 5 },
  { id: 'wmaLength', type: 'int', title: 'Smoothing Length', defval: 9 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 5 },
  { id: 'stochLength', type: 'int', title: 'STOCH Length', defval: 5 },
  { id: 'mfiLength', type: 'int', title: 'MFI Length', defval: 5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'AVERAGE', color: '#9C27B0', lineWidth: 3 },
  { id: 'plot1', title: 'STOCH', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'CCIv2', color: '#FF5252', lineWidth: 3 },
  { id: 'plot3', title: 'RSI', color: '#363A45', lineWidth: 2 },
  { id: 'plot4', title: 'MFI', color: '#9C27B0', lineWidth: 2 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_upper', price: 0.5, title: 'Level', color: '#FF5252', linestyle: 'dashed' },
  { id: 'hline_lower', price: -0.5, title: 'Level', color: '#4CAF50', linestyle: 'dashed' },
];

export const metadata = {
  title: 'Inverse Fisher Transform COMBO',
  shortTitle: 'IFTCOMBO',
  overlay: false,
};

const EPS = 1e-10;
const ift = (x: number): number => (Math.exp(2 * x) - 1) / (Math.exp(2 * x) + 1);
const num = (v: number | null | undefined): number => (v == null ? NaN : v);

export function calculate(bars: Bar[], inputs: Partial<IFTStochRSICCIInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const wmaOf = (values: number[]): number[] =>
    ta.wma(new Series(bars, (_b, i) => values[i]), cfg.wmaLength).toArray().map(num);

  // CCI of the close
  const cci = ta.cci(close, cfg.cciLength).toArray().map(num);
  const inv1 = wmaOf(cci.map((v) => 0.1 * (v / 4))).map(ift);
  // RSI
  const rsi = ta.rsi(close, cfg.rsiLength).toArray().map(num);
  const inv2 = wmaOf(rsi.map((v) => 0.1 * (v - 50))).map(ift);
  // Stochastic
  const stoch = ta.stoch(close, high, low, cfg.stochLength).toArray().map(num);
  const invLine = wmaOf(stoch.map((v) => 0.1 * (v - 50))).map(ift);
  // MFI: change(hlc3) <= 0 ? 0 : hlc3, Pine comparisons (equal within 1e-10; an na change on the first bar
  // counts on both sides)
  const src = bars.map((b) => (b.high + b.low + b.close) / 3);
  const upFlow: number[] = new Array(n);
  const loFlow: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ch = i > 0 ? src[i] - src[i - 1] : NaN;
    const vol = num(bars[i].volume);
    upFlow[i] = vol * (ch <= EPS ? 0 : src[i]);
    loFlow[i] = vol * (ch >= -EPS ? 0 : src[i]);
  }
  const up = math.sum(new Series(bars, (_b, i) => upFlow[i]), cfg.mfiLength).toArray().map(num);
  const lo = math.sum(new Series(bars, (_b, i) => loFlow[i]), cfg.mfiLength).toArray().map(num);
  const mfi = up.map((u, i) => 100.0 - 100.0 / (1.0 + u / lo[i]));
  const inv3 = wmaOf(mfi.map((v) => 0.1 * (v - 50))).map(ift);

  // plot(show and x ? x : na): a float in a condition is false when na or 0
  const line = (show: boolean, values: number[]) => bars.map((b, i) => {
    const v = values[i];
    return { time: b.time, value: show && Number.isFinite(v) && v !== 0 ? v : NaN };
  });
  const avg = inv1.map((v, i) => (v + inv2[i] + invLine[i] + inv3[i]) / 4);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showAverage, avg),
      plot1: line(cfg.showSto, invLine),
      plot2: line(cfg.showCci, inv1),
      plot3: line(cfg.showRsi, inv2),
      plot4: line(cfg.showMfi, inv3),
    },
    hlines: [
      { value: 0.5, options: { color: '#FF5252', linestyle: 'dashed' as const, title: 'Level' } },
      { value: -0.5, options: { color: '#4CAF50', linestyle: 'dashed' as const, title: 'Level' } },
    ],
  };
}

export const IFTStochRSICCI = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig };
