/**
 * Guppy MMA [Alpha Extract]
 *
 * Guppy multiple moving averages: 11 short-term (2..22) and 11 long-term (24..44) moving averages of the close
 * (SMA / EMA / WMA / RMA), drawn on the price pane, green when the close is above the average and red otherwise. Each
 * average scores -1 above the close, +1 below it and 0 otherwise; the mean score of the short-term and of the
 * long-term group are averaged and smoothed by the same moving average type over 10 bars. The smoothed average is
 * grey between the thresholds +-0.3, green above +0.3 and red below -0.3, with gradient fills beyond the thresholds.
 *
 * Reference: "Guppy MMA [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';

export type GuppyMmaType = 'SMA' | 'EMA' | 'WMA' | 'RMA';

export interface GuppyMMAInputs {
  /** Moving average type */
  maType: GuppyMmaType;
  st1: number;
  st2: number;
  st3: number;
  st4: number;
  st5: number;
  st6: number;
  st7: number;
  st8: number;
  st9: number;
  st10: number;
  st11: number;
  lt1: number;
  lt2: number;
  lt3: number;
  lt4: number;
  lt5: number;
  lt6: number;
  lt7: number;
  lt8: number;
  lt9: number;
  lt10: number;
  lt11: number;
  bullishColor: string;
  bearishColor: string;
  neutralColor: string;
}

const ST_DEFAULTS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22];
const LT_DEFAULTS = [24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44];
const ST_KEYS = ['st1', 'st2', 'st3', 'st4', 'st5', 'st6', 'st7', 'st8', 'st9', 'st10', 'st11'] as const;
const LT_KEYS = ['lt1', 'lt2', 'lt3', 'lt4', 'lt5', 'lt6', 'lt7', 'lt8', 'lt9', 'lt10', 'lt11'] as const;

export const defaultInputs: GuppyMMAInputs = {
  maType: 'EMA',
  st1: 2,
  st2: 4,
  st3: 6,
  st4: 8,
  st5: 10,
  st6: 12,
  st7: 14,
  st8: 16,
  st9: 18,
  st10: 20,
  st11: 22,
  lt1: 24,
  lt2: 26,
  lt3: 28,
  lt4: 30,
  lt5: 32,
  lt6: 34,
  lt7: 36,
  lt8: 38,
  lt9: 40,
  lt10: 42,
  lt11: 44,
  bullishColor: '#00e908',
  bearishColor: 'rgb(255, 0, 0)',
  neutralColor: color.gray,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'Moving Average Type', defval: 'EMA', options: ['SMA', 'EMA', 'WMA', 'RMA'] },
  ...ST_KEYS.map((id, k): InputConfig => (
    { id, type: 'int', title: `Short Term MA ${k + 1}`, defval: ST_DEFAULTS[k], min: 2, max: 60, step: 2 })),
  ...LT_KEYS.map((id, k): InputConfig => (
    { id, type: 'int', title: `Long Term MA ${k + 1}`, defval: LT_DEFAULTS[k], min: 2, max: k === 9 ? 63 : k === 10 ? 66 : 60, step: 2 })),
  { id: 'bullishColor', type: 'color', title: 'Bullish Color', defval: '#00e908' },
  { id: 'bearishColor', type: 'color', title: 'Bearish Color', defval: 'rgb(255, 0, 0)' },
  { id: 'neutralColor', type: 'color', title: 'Neutral Color', defval: color.gray },
];

export const plotConfig: PlotConfig[] = [
  // Pine force_overlay = true: the 22 averages are drawn on the price pane
  ...ST_KEYS.map((_k, j): PlotConfig => (
    { id: `plot${j}`, title: `ST MA ${j + 1}`, color: '#00e908', lineWidth: 1, forceOverlay: true })),
  ...LT_KEYS.map((_k, j): PlotConfig => (
    { id: `plot${11 + j}`, title: `LT MA ${j + 1}`, color: '#00e908', lineWidth: 1, forceOverlay: true })),
  { id: 'plot22', title: 'Enhanced Guppy Average', color: color.gray, lineWidth: 1 },
  // plot(upper_threshold / lower_threshold, display = display.none, editable = false): fill references
  { id: 'plot23', title: 'Upper Threshold Level', color: color.blue, lineWidth: 1, display: 'none' },
  { id: 'plot24', title: 'Lower Threshold Level', color: color.blue, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Guppy MMA [Alpha Extract]',
  shortTitle: 'Guppy MMA [Alpha Extract]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
const lt = (a: number, b: number) => b - a > 1e-10;

export function calculate(bars: Bar[], inputs: Partial<GuppyMMAInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = bars.map((b) => b.close);
  const closeS = Series.fromArray(bars, close);
  const maFn = { SMA: ta.sma, EMA: ta.ema, WMA: ta.wma, RMA: ta.rma }[cfg.maType];
  // ma(source, length, type): a switch without a default branch (na for another type)
  const ma = (s: Series, len: number): number[] => (maFn ? A(maFn(s, len)) : new Array<number>(n).fill(NaN));

  const stMA = ST_KEYS.map((k) => ma(closeS, cfg[k]));
  const ltMA = LT_KEYS.map((k) => ma(closeS, cfg[k]));

  // score(ma, close) = ma > close ? -1 : ma < close ? 1 : 0
  const score = (m: number, c: number) => (gt(m, c) ? -1 : lt(m, c) ? 1 : 0);
  const overallAvg: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let st = 0;
    let lgt = 0;
    for (let j = 0; j < 11; j++) {
      st += score(stMA[j][i], close[i]);
      lgt += score(ltMA[j][i], close[i]);
    }
    overallAvg[i] = (st / 11 + lgt / 11) / 2;
  }
  // smoothedavg = ma(overallAvg, 10, maType)
  const smoothed = ma(Series.fromArray(bars, overallAvg), 10);

  const upper = 0.3;
  const lower = -0.3;
  const t = (i: number) => bars[i].time;
  const maColor = (m: number, i: number) => (gt(close[i], m) ? cfg.bullishColor : cfg.bearishColor);
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  [...stMA, ...ltMA].forEach((m, j) => {
    // plot(MA, color = close > MA ? bullishColor : bearishColor, force_overlay = true)
    plots[`plot${j}`] = bars.map((_b, i) => ({ time: t(i), value: m[i], color: maColor(m[i], i) }));
  });
  // guppy_color = avg < upper and avg > lower ? neutral : avg > upper ? bullish : avg < lower ? bearish : na
  // (no colour on the bars without a value: nothing is drawn there; na colour = 'transparent' only at a threshold)
  plots.plot22 = bars.map((_b, i) => {
    const s = smoothed[i];
    if (isNaN(s)) return { time: t(i), value: s };
    const c = lt(s, upper) && gt(s, lower) ? cfg.neutralColor
      : gt(s, upper) ? cfg.bullishColor : lt(s, lower) ? cfg.bearishColor : 'transparent';
    return { time: t(i), value: s, color: c };
  });
  plots.plot23 = bars.map((_b, i) => ({ time: t(i), value: upper }));
  plots.plot24 = bars.map((_b, i) => ({ time: t(i), value: lower }));

  const greenZone = String(color.rgb(0, 230, 119, 53));
  const redZone = String(color.rgb(255, 0, 0, 57));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 0, options: { title: 'Neutral Line', color: color.white, linestyle: 'solid', linewidth: 1 } },
      { value: 1, options: { title: 'Max Bull Line', color: cfg.bullishColor, linestyle: 'dashed' } },
      { value: -1, options: { title: 'Max Bear Line', color: cfg.bearishColor, linestyle: 'dashed' } },
      { value: upper, options: { title: 'Upper Threshold', color: String(color.new(cfg.bullishColor, 50)), linestyle: 'solid' } },
      { value: lower, options: { title: 'Lower Threshold', color: String(color.new(cfg.bearishColor, 50)), linestyle: 'solid' } },
    ],
    fills: [
      // fill(guppy_plot, upper_plot, smoothedavg, upper_threshold,
      //      smoothedavg > upper_threshold ? color.rgb(0, 230, 119, 53) : color(na), color(na))
      { plot1: 'plot22', plot2: 'plot23', gradient: {
        topValue: smoothed.slice(), bottomValue: new Array<number>(n).fill(upper),
        topColor: smoothed.map((s) => (gt(s, upper) ? greenZone : null)), bottomColor: new Array<string | null>(n).fill(null) } },
      // fill(guppy_plot, lower_plot, smoothedavg, lower_threshold,
      //      smoothedavg < lower_threshold ? color.rgb(255, 0, 0, 57) : color(na), color(na))
      { plot1: 'plot22', plot2: 'plot24', gradient: {
        topValue: smoothed.slice(), bottomValue: new Array<number>(n).fill(lower),
        topColor: smoothed.map((s) => (lt(s, lower) ? redZone : null)), bottomColor: new Array<string | null>(n).fill(null) } },
    ],
  };
}

export const GuppyMMA = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
