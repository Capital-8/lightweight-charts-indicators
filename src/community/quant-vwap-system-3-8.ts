/**
 * Quant Z-Score Squeeze [Gold Edition] (Quant VWAP System 3.8)
 *
 * Momentum line: the z-score of the close against its SMA over `len` bars, (close - sma) / stdev. Its colour has four
 * states: above zero and rising (bull strong) or falling (bull weak), below zero and rising (bear weak) or falling
 * (bear strong). Squeeze: the band width 4 * stdev / sma is compared with its own history, by the z-score over
 * `lookback` bars (Quant), by the ratio to its 20-bar SMA (Classic), or by both (Hybrid: Classic or z-score < -1).
 * Squeeze dots on zero mark `minSqueeze` squeeze bars in a row; a diamond marks the first bar after a squeeze. Zones
 * between 2 and 3 and between -2 and -3 are filled.
 * Alerts (alertcondition, `alerts` of the result): 'Squeeze Fired', true on the bars of the diamonds.
 *
 * Reference: "Quant Z-Score Squeeze [Gold Edition]" by CustomQuantLabs (published as "Quant VWAP System 3.8")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Squeeze Fired', message: 'Volatility Squeeze has fired!' },
];

export type QuantSqueezeModel = 'Smart Hybrid (Universal)' | 'Classic Ratio (Scalping)' | 'Quant Z-Score (Swing)';

export interface QuantVwapSystem38Inputs {
  /** Squeeze model */
  squeezeMethod: QuantSqueezeModel;
  /** Lookback of the band width z-score */
  lookback: number;
  /** Quant threshold (sigma) */
  zThresh: number;
  /** Classic threshold (ratio) */
  ratioThresh: number;
  /** Min squeeze bars */
  minSqueeze: number;
  /** Price length (SMA / stdev of the close) */
  len: number;
  bullStrong: string;
  bullWeak: string;
  bearStrong: string;
  bearWeak: string;
  /** Squeeze dot colour */
  squeezeColor: string;
  /** Zero line colour */
  zeroColor: string;
}

export const defaultInputs: QuantVwapSystem38Inputs = {
  squeezeMethod: 'Smart Hybrid (Universal)',
  lookback: 100,
  zThresh: -0.8,
  ratioThresh: 0.8,
  minSqueeze: 1,
  len: 20,
  bullStrong: '#00ffbb',
  bullWeak: '#005a42',
  bearStrong: '#ff1100',
  bearWeak: '#800000',
  squeezeColor: color.yellow,
  zeroColor: String(color.new('#00ffbb', 30)),
};

export const inputConfig: InputConfig[] = [
  { id: 'squeezeMethod', type: 'string', title: 'Squeeze Model', defval: 'Smart Hybrid (Universal)',
    options: ['Smart Hybrid (Universal)', 'Classic Ratio (Scalping)', 'Quant Z-Score (Swing)'] },
  { id: 'lookback', type: 'int', title: 'Lookback', defval: 100 },
  { id: 'zThresh', type: 'float', title: 'Quant Threshold (Sigma)', defval: -0.8, step: 0.1 },
  { id: 'ratioThresh', type: 'float', title: 'Classic Threshold (Ratio)', defval: 0.8, step: 0.05 },
  { id: 'minSqueeze', type: 'int', title: 'Min Squeeze Bars', defval: 1, min: 1,
    tooltip: 'Increase to 2 or 3 to filter out single-dot noise.' },
  { id: 'len', type: 'int', title: 'Price Length', defval: 20 },
  { id: 'bullStrong', type: 'color', title: 'Bull Strong', defval: '#00ffbb' },
  { id: 'bullWeak', type: 'color', title: 'Bull Weak', defval: '#005a42' },
  { id: 'bearStrong', type: 'color', title: 'Bear Strong', defval: '#ff1100' },
  { id: 'bearWeak', type: 'color', title: 'Bear Weak', defval: '#800000' },
  { id: 'squeezeColor', type: 'color', title: 'Squeeze Dot', defval: color.yellow },
  { id: 'zeroColor', type: 'color', title: 'Zero Glow', defval: String(color.new('#00ffbb', 30)) },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Zero Base', color: String(color.new('#00ffbb', 30)), lineWidth: 3 },
  { id: 'plot1', title: 'Momentum', color: '#00ffbb', lineWidth: 2 },
  { id: 'plot2', title: 'Squeeze Active', color: color.yellow, lineWidth: 5, style: 'circles' },
];

const ZONE_LINE = String(color.new(color.gray, 100));

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_h2', price: 2, title: 'Top Zone Start', color: ZONE_LINE, linestyle: 'dashed' },
  { id: 'hline_h3', price: 3, title: 'Top Zone End', color: ZONE_LINE, linestyle: 'dashed' },
  { id: 'hline_l2', price: -2, title: 'Bot Zone Start', color: ZONE_LINE, linestyle: 'dashed' },
  { id: 'hline_l3', price: -3, title: 'Bot Zone End', color: ZONE_LINE, linestyle: 'dashed' },
];

/** fill(h2, h3, color.new(c_bear_strong, 85)) and fill(l2, l3, color.new(c_bull_strong, 85)) with the default colours */
export const fillConfig: FillConfig[] = [
  { id: 'fill_bear', plot1: 'hline_h2', plot2: 'hline_h3', color: String(color.new('#ff1100', 85)), title: 'Bear Zone' },
  { id: 'fill_bull', plot1: 'hline_l2', plot2: 'hline_l3', color: String(color.new('#00ffbb', 85)), title: 'Bull Zone' },
];

export const metadata = {
  title: 'Quant Z-Score Squeeze [Gold Edition]',
  shortTitle: 'Quant Cycler',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/**
 * raw_bw = stdev * 4 / sma: na for sma = 0. Pine gives +infinity (stdev >= 0) or 0 / 0 = na there; both act the same
 * in its uses (`<` false, ta.sma / ta.stdev skip it, the bw z-score `<` tests false).
 */
const div = (x: number, y: number) => (y === 0 ? NaN : x / y);
/** Pine na() / plots treat +-infinity as na */
const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<QuantVwapSystem38Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const close = bars.map((b) => b.close);
  const vwapCurr = A(ta.sma(S(close), cfg.len));
  const stdev = A(ta.stdev(S(close), cfg.len));
  // z-scores: a non-zero value / 0 stays +-infinity (the colour and squeeze comparisons use it), 0 / 0 is na
  const priceZ = close.map((c, i) => (c - vwapCurr[i]) / stdev[i]);

  const rawBw = stdev.map((s, i) => div(s * 4, vwapCurr[i]));
  const bwMean = A(ta.sma(S(rawBw), cfg.lookback));
  const bwStdev = A(ta.stdev(S(rawBw), cfg.lookback));
  const bwRatioAvg = A(ta.sma(S(rawBw), 20));

  const isSqueeze = bars.map((_b, i) => {
    const bwZ = (rawBw[i] - bwMean[i]) / bwStdev[i];
    const sqQuant = lt(bwZ, cfg.zThresh);
    const sqClassic = lt(rawBw[i], bwRatioAvg[i] * cfg.ratioThresh);
    const sqHybrid = sqClassic || lt(bwZ, -1.0);
    if (cfg.squeezeMethod === 'Quant Z-Score (Swing)') return sqQuant;
    if (cfg.squeezeMethod === 'Classic Ratio (Scalping)') return sqClassic;
    return sqHybrid;
  });
  // int(math.sum(is_squeeze ? 1 : 0, min_squeeze)) >= min_squeeze: na (false) on the first min_squeeze - 1 bars
  const sqCount = A(math.sum(S(isSqueeze.map((s) => (s ? 1 : 0))), cfg.minSqueeze) as Series).map((v) => Math.trunc(v));
  const isValid = sqCount.map((c) => ge(c, cfg.minSqueeze));

  const finalColor = (i: number) => {
    const up = i > 0 && gt(priceZ[i], priceZ[i - 1]);
    const positive = gt(priceZ[i], 0);
    return positive ? (up ? cfg.bullStrong : cfg.bullWeak) : up ? cfg.bearWeak : cfg.bearStrong;
  };

  const markers: MarkerData[] = [];
  // squeeze_fired = is_valid_squeeze[1] and not is_valid_squeeze (false on bar 0)
  const fired = isValid.map((v, i) => i > 0 && isValid[i - 1] && !v);
  for (let i = 1; i < n; i++) {
    // plotshape(squeeze_fired ? 0 : na, "Squeeze Fired", shape.diamond, location.absolute, color.white, size.tiny)
    if (isValid[i - 1] && !isValid[i]) {
      markers.push({ time: bars[i].time, position: 'atPriceMiddle', price: 0, shape: 'diamond', color: color.white,
        size: 'tiny' });
    }
  }

  const bearZone = String(color.new(cfg.bearStrong, 85));
  const bullZone = String(color.new(cfg.bullStrong, 85));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b) => ({ time: b.time, value: 0, color: cfg.zeroColor })),
      plot1: bars.map((b, i) => ({ time: b.time, value: finite(priceZ[i]), color: finalColor(i) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: isValid[i] ? 0 : NaN, color: cfg.squeezeColor })),
    },
    hlines: [
      { value: 2, options: { title: 'Top Zone Start', color: ZONE_LINE, linestyle: 'dashed' } },
      { value: 3, options: { title: 'Top Zone End', color: ZONE_LINE, linestyle: 'dashed' } },
      { value: -2, options: { title: 'Bot Zone Start', color: ZONE_LINE, linestyle: 'dashed' } },
      { value: -3, options: { title: 'Bot Zone End', color: ZONE_LINE, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_h2', plot2: 'hline_h3', options: { title: 'Bear Zone' }, colors: new Array<string>(n).fill(bearZone) },
      { plot1: 'hline_l2', plot2: 'hline_l3', options: { title: 'Bull Zone' }, colors: new Array<string>(n).fill(bullZone) },
    ],
    markers,
    // alertcondition(squeeze_fired, "Squeeze Fired")
    alerts: alertStates(alertConditions, bars, [fired]),
  };
}

export const QuantVwapSystem38 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
