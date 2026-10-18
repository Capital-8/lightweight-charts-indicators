/**
 * Pulse RSI | Lyro RS
 *
 * An RSI of a volume-weighted price trend: help = sqrt(close * high * low * |volume|), smoothed by an SMA of `len`
 * bars and a linear regression of `len` bars. The rises and falls of that regression line are averaged with two
 * EMAs of `len` bars, and res = 100 - 100 / (1 + ema(up) / ema(down)). The line, its glow and the price candles take
 * the up / down colour (Type 1: res against res[1] / res[2]; Type 2: res against 50). Labels mark the crosses of
 * res with res[1] (Type 1) and with 50 (Type 2), triangles the crosses of 30 / 70 (Type 3) and arrows the crosses of
 * the custom thresholds (Type 4), which are also drawn as lines.
 * Alerts (alertcondition, `alerts` of the result): the original's eight conditions, true on every bar where res is
 * above / below res[1] (Type 1), 50 (Type 2), 30 / 70 (Type 3) or the long / short thresholds (Type 4).
 *
 * Reference: "Pulse RSI | Lyro RS" by LyroRS
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LyroRS
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PulseRsiLyroRsInputs {
  /** Length of the SMA, the linear regression and the EMAs */
  len: number;
  /** Type 4 long threshold (also drawn as a line) */
  thresholdLong: number;
  /** Type 4 short threshold (also drawn as a line) */
  thresholdShort: number;
  /** Type 1 (trend: res against res[1]) colours and labels */
  sigType1Enable: boolean;
  /** Type 2 (trend: res against 50) colours and labels */
  sigType2Enable: boolean;
  /** Type 3 (crosses of 30 / 70) triangles */
  sigType3Enable: boolean;
  /** Type 4 (crosses of the custom thresholds) arrows */
  sigType4Enable: boolean;
  /** Palette used when the custom palette is off */
  colMode: 'Classic' | 'Mystic' | 'Accented' | 'Royal';
  /** Use the custom up / down colours */
  cpyn: boolean;
  cpUpC: string;
  cpDnC: string;
}

export const defaultInputs: PulseRsiLyroRsInputs = {
  len: 55,
  thresholdLong: 10,
  thresholdShort: 15,
  sigType1Enable: false,
  sigType2Enable: true,
  sigType3Enable: true,
  sigType4Enable: false,
  colMode: 'Mystic',
  cpyn: false,
  cpUpC: '#00ff00',
  cpDnC: '#ff0000',
};

const INDI = 'Indicator Settings';
const COLORS = 'Color Settings';
const SIGNAL = 'Signal Settings';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 55, group: INDI, tooltip: 'Adjust the Length of the Indicator' },
  { id: 'thresholdLong', type: 'int', title: 'Threshold Long', defval: 10, step: 1, group: INDI,
    tooltip: 'Adjust Threshold for Long signals to Fire, NOTE: Enable Type 4' },
  { id: 'thresholdShort', type: 'int', title: 'Threshold Short', defval: 15, step: 1, group: INDI,
    tooltip: 'Adjust Threshold for Short signals to Fire, NOTE: Enable Type 4' },
  { id: 'sigType1Enable', type: 'bool', title: 'Trend - Type 1', defval: false, group: SIGNAL,
    tooltip: 'Enable Type 1 Conditions (res > res[1]), Trend' },
  { id: 'sigType2Enable', type: 'bool', title: 'Trend - Type 2', defval: true, group: SIGNAL,
    tooltip: 'Enable Type 2 Conditions (res > 50), Trend' },
  { id: 'sigType3Enable', type: 'bool', title: 'Oversold / Overbought', defval: true, group: SIGNAL,
    tooltip: 'Enable Type 3 Conditions (res > 30 / 70), Oversold and Overbought' },
  { id: 'sigType4Enable', type: 'bool', title: 'Custom Threshold L/S', defval: false, group: SIGNAL,
    tooltip: 'Enable Type 4 Conditions (res > Threshold Long / Short), Custom Signals' },
  { id: 'colMode', type: 'string', title: 'Custom Color Palette', defval: 'Mystic', options: ['Classic', 'Mystic', 'Accented', 'Royal'],
    group: COLORS, inline: 'drop', display: 'none', tooltip: 'Choose a predefined color scheme for indicator visualization.' },
  { id: 'cpyn', type: 'bool', title: 'Use Custom Palette', defval: false, group: COLORS, display: 'none',
    tooltip: 'Enable manual selection of custom colors for trend signals.' },
  { id: 'cpUpC', type: 'color', title: 'Custom Up', defval: '#00ff00', group: COLORS, inline: 'Custom Palette', display: 'none',
    tooltip: 'Set a custom color for bullish signals.' },
  { id: 'cpDnC', type: 'color', title: 'Custom Down', defval: '#ff0000', group: COLORS, inline: 'Custom Palette', display: 'none',
    tooltip: 'Set a custom color for bearish signals.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Main Plot Line', color: '#30FDCF', lineWidth: 2 },
  { id: 'plot1', title: 'Glow Effect', color: String(color.new('#30FDCF', 75)), lineWidth: 10, display: 'pane' },
  { id: 'plot2', title: 'Threshold Long', color: String(color.new('#30FDCF', 30)), lineWidth: 1 },
  { id: 'plot3', title: 'Threshold Short', color: String(color.new('#E117B7', 30)), lineWidth: 1 },
];

export const metadata = {
  title: 'Pulse RSI | Lyro RS',
  shortTitle: 'Pulse RSI | Lyro RS',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const PALETTES: Record<PulseRsiLyroRsInputs['colMode'], [string, string]> = {
  Classic: ['#00E676', '#880E4F'],
  Mystic: ['#30FDCF', '#E117B7'],
  Accented: ['#9618F7', '#FF0078'],
  Royal: ['#FFC107', '#673AB7'],
};

export function calculate(
  bars: Bar[],
  inputs: Partial<PulseRsiLyroRsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.len;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  // switch ColMode (an unknown mode leaves UpC / DnC na); if cpyn: the custom colours
  const pal = PALETTES[cfg.colMode] as [string, string] | undefined;
  const upC: string | null = cfg.cpyn ? cfg.cpUpC : pal ? pal[0] : null;
  const dnC: string | null = cfg.cpyn ? cfg.cpDnC : pal ? pal[1] : null;

  // vol = (close * high * low) * math.abs(volume); help = math.sqrt(vol)
  const help = bars.map((b) => Math.sqrt(b.close * b.high * b.low * Math.abs(b.volume ?? NaN)));
  const helpp = A(ta.sma(S(help), len));
  const help2 = A(ta.linreg(S(helpp), len, 0));
  // u = math.max(help2 - help2[1], 0); d = math.max(help2[1] - help2, 0) (na when a value is na)
  const u = help2.map((h, i) => (i > 0 ? Math.max(h - help2[i - 1], 0) : NaN));
  const d = help2.map((h, i) => (i > 0 ? Math.max(help2[i - 1] - h, 0) : NaN));
  const emaU = A(ta.ema(S(u), len));
  const emaD = A(ta.ema(S(d), len));
  // rs = ema(u) / ema(d) (x / 0 is +infinity: res = 100; 0 / 0 is na); res = 100 - 100 / (1 + rs)
  const res = emaU.map((eu, i) => 100 - 100 / (1 + eu / emaD[i]));
  const r1 = (i: number) => (i > 0 ? res[i - 1] : NaN);
  const r2 = (i: number) => (i > 1 ? res[i - 2] : NaN);

  // var colType1 / colType2 = color.white, updated by the Type 1 / Type 2 conditions
  const colType1: (string | null)[] = new Array(n);
  const colType2: (string | null)[] = new Array(n);
  let c1: string | null = color.white;
  let c2: string | null = color.white;
  for (let i = 0; i < n; i++) {
    if (gt(res[i], r1(i))) c1 = upC;
    if (lt(res[i], r1(i))) c1 = dnC;
    if (gt(res[i], 50)) c2 = upC;
    if (lt(res[i], 50)) c2 = dnC;
    colType1[i] = c1;
    colType2[i] = c2;
  }

  // pc_dd / pc_flType1: Type 1 (res > res[1] up, res < res[2] down), else Type 2 (res against 50), else na
  const pc: (string | null)[] = res.map((r, i) => (
    cfg.sigType1Enable && gt(r, r1(i)) ? upC
      : cfg.sigType1Enable && lt(r, r2(i)) ? dnC
        : cfg.sigType2Enable && gt(r, 50) ? upC
          : cfg.sigType2Enable && lt(r, 50) ? dnC
            : null));

  // ta.crossover / ta.crossunder: compared with the last bar where both values were not na (exact comparisons:
  // no 1e-10 tolerance, unlike the operators)
  const crosses = (b: (i: number) => number) => {
    const over: boolean[] = new Array(n).fill(false);
    const under: boolean[] = new Array(n).fill(false);
    let pa = NaN;
    let pb = NaN;
    for (let i = 0; i < n; i++) {
      const a = res[i];
      const bv = b(i);
      if (isNaN(a) || isNaN(bv)) continue;
      if (!isNaN(pa)) {
        over[i] = a > bv && !(pa > pb);
        under[i] = a < bv && !(pa < pb);
      }
      pa = a;
      pb = bv;
    }
    return { over, under };
  };
  const x1 = crosses(r1);
  const x2 = crosses(() => 50);
  const x3a = crosses(() => 30);
  const x3b = crosses(() => 70);
  const x4a = crosses(() => cfg.thresholdLong);
  const x4b = crosses(() => cfg.thresholdShort);

  const markers: MarkerData[] = [];
  const candles: PlotCandleData[] = [];
  const NA = 'transparent';
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const add = (on: boolean, m: Omit<MarkerData, 'time' | 'size' | 'forceOverlay' | 'color'> & { id: string }, c: string | null) => {
      if (on) markers.push({ time: t, ...m, color: c ?? NA, size: 'tiny', forceOverlay: true });
    };
    // Type 1: shape.labelup / labeldown, colour colType1, text 𝓛𝓸𝓷𝓰 / 𝓢𝓱𝓸𝓻𝓽 in black
    add(cfg.sigType1Enable && x1.over[i], { id: 'shape0', position: 'belowBar', shape: 'labelUp', text: '𝓛𝓸𝓷𝓰', textColor: '#000000' }, colType1[i]);
    add(cfg.sigType1Enable && x1.under[i], { id: 'shape1', position: 'aboveBar', shape: 'labelDown', text: '𝓢𝓱𝓸𝓻𝓽', textColor: '#000000' }, colType1[i]);
    // Type 2: colour colType2
    add(cfg.sigType2Enable && x2.over[i], { id: 'shape2', position: 'belowBar', shape: 'labelUp', text: '𝓛𝓸𝓷𝓰', textColor: '#000000' }, colType2[i]);
    add(cfg.sigType2Enable && x2.under[i], { id: 'shape3', position: 'aboveBar', shape: 'labelDown', text: '𝓢𝓱𝓸𝓻𝓽', textColor: '#000000' }, colType2[i]);
    // Type 3: triangles crossover(res, 30) / crossunder(res, 70)
    add(cfg.sigType3Enable && x3a.over[i], { id: 'shape4', position: 'belowBar', shape: 'triangleUp' }, upC);
    add(cfg.sigType3Enable && x3b.under[i], { id: 'shape5', position: 'aboveBar', shape: 'triangleDown' }, dnC);
    // Type 4: labels with ⬆ / ⬇ in white
    add(cfg.sigType4Enable && x4a.over[i], { id: 'shape6', position: 'belowBar', shape: 'labelUp', text: '⬆', textColor: color.white }, upC);
    add(cfg.sigType4Enable && x4b.under[i], { id: 'shape7', position: 'aboveBar', shape: 'labelDown', text: '⬇', textColor: color.white }, dnC);

    // plotcandle(open, high, low, close, "Candle Color", pc_flType1, pc_flType1, bordercolor = pc_flType1,
    //   force_overlay = true, display = display.pane)
    const c = pc[i] ?? NA;
    candles.push({ time: t, open: b.open, high: b.high, low: b.low, close: b.close, color: c, wickColor: c,
      borderColor: c, forceOverlay: true });
  }

  // color.new(na, 75) is black with transparency 75
  const glow = pc.map((c) => String(color.new(c ?? '#000000', 75)));
  const val = (v: number) => (Number.isFinite(v) ? v : NaN);
  const lineCol = (c: string | null, tr: number) => (c === null ? String(color.new('#000000', tr)) : String(color.new(c, tr)));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: val(res[i]), color: pc[i] ?? NA })),
      plot1: bars.map((b, i) => ({ time: b.time, value: val(res[i]), color: glow[i] })),
      // plot(Threshold_L_Fl, color = color.new(UpC, 30), editable = false)
      plot2: bars.map((b) => ({ time: b.time, value: cfg.thresholdLong, color: lineCol(upC, 30) })),
      plot3: bars.map((b) => ({ time: b.time, value: cfg.thresholdShort, color: lineCol(dnC, 30) })),
    },
    // hline(50, title = "MidLine"): default colour and style
    hlines: [{ value: 50, options: { title: 'MidLine', color: '#787B86', linestyle: 'dashed' } }],
    markers,
    plotCandles: { candleColor: candles },
    // alertcondition(res > res[1] / res < res[1] / res > 50 / res < 50 / res > 30 / res < 70 / res > Threshold_L_Fl /
    // res < Threshold_S_Fl)
    alerts: alertStates(alertConditions, bars, [
      res.map((r, i) => gt(r, r1(i))), res.map((r, i) => lt(r, r1(i))),
      res.map((r) => gt(r, 50)), res.map((r) => lt(r, 50)),
      res.map((r) => gt(r, 30)), res.map((r) => lt(r, 70)),
      res.map((r) => gt(r, cfg.thresholdLong)), res.map((r) => lt(r, cfg.thresholdShort)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Pulse RSI Long / Type 1-Trend', message: 'Pulse RSI Trend is Long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Pulse RSI Short / Type 1-Trend', message: 'Pulse RSI Trend is Short {{exchange}}:{{ticker}}' },
  { id: 'alert2', title: 'Pulse RSI Long / Type 2-Trend', message: 'Pulse RSI Trend is Long {{exchange}}:{{ticker}}' },
  { id: 'alert3', title: 'Pulse RSI Short / Type 2-Trend', message: 'Pulse RSI Trend is Short {{exchange}}:{{ticker}}' },
  { id: 'alert4', title: 'Pulse RSI Long / Type 3-Oversold/Overbought', message: 'Pulse RSI Oversold is Long {{exchange}}:{{ticker}}' },
  { id: 'alert5', title: 'Pulse RSI Short / Type 3-Oversold/Overbought', message: 'Pulse RSI Overbought is Short {{exchange}}:{{ticker}}' },
  { id: 'alert6', title: 'Pulse RSI Long / Type 4-Custom Threshold L/S', message: 'Pulse RSI Threshold HIT Long {{exchange}}:{{ticker}}' },
  { id: 'alert7', title: 'Pulse RSI Short / Type 4-Custom Threshold L/S', message: 'Pulse RSI Threshold HIT Short {{exchange}}:{{ticker}}' },
];

export const PulseRsiLyroRs = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
