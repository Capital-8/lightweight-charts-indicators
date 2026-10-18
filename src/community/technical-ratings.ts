/**
 * Technical Ratings
 *
 * Two ratings in [-1, 1] from 26 indicators (the `calcRatingAll()` function of the TechnicalRating library, with the
 * functions of its ta library ported here):
 * - MAs: the mean of 15 votes (+1 / 0 / -1): close against the SMA and EMA of 10, 20, 30, 50, 100 and 200 bars, the
 *   HMA 9, the VWMA 20 and the Ichimoku cloud (9 / 26 / 52).
 * - Oscillators: the mean of 11 votes: RSI 14, Stochastic 14 / 3 / 3, CCI 20, ADX 14, Awesome Oscillator, Momentum
 *   10, MACD 12 / 26 / 9, Stochastic RSI 14 / 14 / 3 / 3, Williams %R 14, Bull Bear Power 13 and Ultimate Oscillator
 *   7 / 14 / 28.
 * Votes without data are left out of the means. The total is the weighted sum of the two ratings ('Weight of MAs').
 *
 * The rating chosen by 'Rating uses' is plotted (columns) with a colour whose opacity counts the bars of rising
 * absolute rating (0 to 5) while the rating is above 0.1 or below -0.1. Five dashed levels, three data window plots
 * (All, MAs, Oscillators), six labels on the last bar with the three rating states ("Strong Buy" above 0.5, "Buy"
 * above 0.1, "Neutral", "Sell", "Strong Sell"), and optional long / short markers when the rating crosses a level
 * or when the count of rising bars reaches a value ('Direction', off by default).
 * Colours and inputs of the original's v3 (2023.01.19): three bull colours (lime #00FF00, gold #CCCC00, white) and
 * three bear colours (pink #FF0080, violet #AA00FF, blue #013BCA), each with a check box, the first checked one used
 * (the first colour when none is); neutral #434650. The signal colour is the neutral colour as is with no count,
 * else the bull / bear colour at transparency 100 - 20 x count (75 for one bar); the data window plots and the label
 * states use the bull / bear colour at 20 beyond +-0.5, at 50 beyond +-0.1, else the neutral colour as is. Groups
 * 'Calculations' and 'Alert Markers (non-repainting)'.
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): the 'Alert message: Long' / 'Short' text on the
 * bars where the original triggers a long / short: the level cross or count condition of the bar, or of the bar
 * before on the chart timeframe with 'Repainting' On (as the original, `[ensureNoRepaintIdx]`), alternating when
 * 'Alternate longs & shorts' applies. The long / short markers are drawn on the same bars as these triggers.
 *
 * Timeframe: "" is the chart timeframe. A higher timeframe takes the ratings computed on the bars of that timeframe
 * built from the chart bars (src/anchor-period.ts, with the exchange calendar of the chart context when it has the
 * time zone and the session): 'Repainting' On shows the value of a period on the chart bar that completes it (the
 * previous period before), Off shows on every bar of a period the value of the period before. A timeframe below the
 * chart timeframe is the runtime error of the original.
 *
 * Plot style and width come from inputs in the original; the plot configuration is static (the default columns,
 * width 1). Chart values read: the chart timeframe (`timeframe` of the chart context, else from the bar spacing).
 *
 * Reference: "Technical Ratings"
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, array, math, timeframe, mapToChart,
  type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar,
} from 'oakscriptjs';
import type { AlertCall, LabelData, MarkerData } from '../types';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface TechnicalRatingsInputs {
  /** Timeframe ("" = chart timeframe) */
  tfInput: string;
  /** Repainting */
  repaintInput: 'On' | 'Off';
  /** Rating uses */
  calcsInput: 'MAs' | 'Oscillators' | 'MAs and Oscillators';
  /** Weight of MAs (%) */
  maInput: number;
  /** Plot style (the plot configuration keeps the default columns) */
  styleInput: 'Columns' | 'Histogram' | 'Area' | 'Line';
  /** Plot width (the plot configuration keeps the default width) */
  widthInput: number;
  /** Bull colours: the first one checked is used (the first colour when none is) */
  colorInput1: string;
  showColorInput1: boolean;
  colorInput2: string;
  showColorInput2: boolean;
  colorInput3: string;
  showColorInput3: boolean;
  /** Bear colours: the first one checked is used (the fourth colour when none is) */
  colorInput4: string;
  showColorInput4: boolean;
  colorInput5: string;
  showColorInput5: boolean;
  colorInput6: string;
  showColorInput6: boolean;
  /** Neutral */
  neutColorInput: string;
  /** Direction of the alerts and markers */
  dirInput: 'None' | 'Longs' | 'Shorts' | 'Longs and Shorts';
  /** Alternate longs & shorts */
  altInput: 'On' | 'Off';
  /** Longs level */
  levelUpInput: number;
  /** Shorts level */
  levelDnInput: number;
  /** Cumulative adv./decl. */
  gradInput: number;
  /** Alert message: Long (text of the long alert() calls) */
  alertUpInput: string;
  /** Alert message: Short (text of the short alert() calls) */
  alertDnInput: string;
}

export const defaultInputs: TechnicalRatingsInputs = {
  tfInput: '',
  repaintInput: 'On',
  calcsInput: 'MAs and Oscillators',
  maInput: 50,
  styleInput: 'Columns',
  widthInput: 1,
  colorInput1: '#00FF00',
  showColorInput1: true,
  colorInput2: '#CCCC00',
  showColorInput2: false,
  colorInput3: '#FFFFFF',
  showColorInput3: false,
  colorInput4: '#FF0080',
  showColorInput4: true,
  colorInput5: '#AA00FF',
  showColorInput5: false,
  colorInput6: '#013BCA',
  showColorInput6: false,
  neutColorInput: '#434650',
  dirInput: 'None',
  altInput: 'On',
  levelUpInput: 0.5,
  levelDnInput: -0.5,
  gradInput: 0,
  alertUpInput: 'Long',
  alertDnInput: 'Short',
};

const GRP1 = 'Calculations';
const GRP2 = 'Alert Markers (non-repainting)';
const C_TT = 'Pick only one. These are preset colors, but you can modify anyone of them.';

export const inputConfig: InputConfig[] = [
  { id: 'tfInput', type: 'timeframe', title: 'Higher timeframe', defval: '', group: GRP1 },
  { id: 'repaintInput', type: 'string', title: 'Repainting', defval: 'On', options: ['On', 'Off'], group: GRP1 },
  { id: 'calcsInput', type: 'string', title: 'Rating uses', defval: 'MAs and Oscillators', options: ['MAs', 'Oscillators', 'MAs and Oscillators'], group: GRP1 },
  { id: 'maInput', type: 'int', title: 'Weight of MAs (%)', defval: 50, min: 0, max: 100, step: 10, group: GRP1 },
  { id: 'styleInput', type: 'string', title: 'Plot style', defval: 'Columns', options: ['Columns', 'Histogram', 'Area', 'Line'], group: GRP1, inline: '01' },
  { id: 'widthInput', type: 'int', title: '', defval: 1, min: 1, max: 50, group: GRP1, inline: '01' },
  { id: 'colorInput1', type: 'color', title: 'Bull  ', defval: '#00FF00', group: GRP1, inline: '02', tooltip: C_TT },
  { id: 'showColorInput1', type: 'bool', title: '', defval: true, group: GRP1, inline: '02' },
  { id: 'colorInput2', type: 'color', title: '', defval: '#CCCC00', group: GRP1, inline: '02' },
  { id: 'showColorInput2', type: 'bool', title: '', defval: false, group: GRP1, inline: '02' },
  { id: 'colorInput3', type: 'color', title: '', defval: '#FFFFFF', group: GRP1, inline: '02' },
  { id: 'showColorInput3', type: 'bool', title: '', defval: false, group: GRP1, inline: '02' },
  { id: 'colorInput4', type: 'color', title: 'Bear   ', defval: '#FF0080', group: GRP1, inline: '03', tooltip: C_TT },
  { id: 'showColorInput4', type: 'bool', title: '', defval: true, group: GRP1, inline: '03' },
  { id: 'colorInput5', type: 'color', title: '', defval: '#AA00FF', group: GRP1, inline: '03' },
  { id: 'showColorInput5', type: 'bool', title: '', defval: false, group: GRP1, inline: '03' },
  { id: 'colorInput6', type: 'color', title: '', defval: '#013BCA', group: GRP1, inline: '03' },
  { id: 'showColorInput6', type: 'bool', title: '', defval: false, group: GRP1, inline: '03' },
  { id: 'neutColorInput', type: 'color', title: 'Neutral', defval: '#434650', group: GRP1, inline: '04' },
  { id: 'dirInput', type: 'string', title: 'Direction', defval: 'None', options: ['None', 'Longs', 'Shorts', 'Longs and Shorts'], group: GRP2 },
  { id: 'altInput', type: 'string', title: 'Alternate Longs & Shorts', defval: 'On', options: ['On', 'Off'], group: GRP2 },
  { id: 'levelUpInput', type: 'float', title: 'Longs Level', defval: 0.5, min: 0, max: 1, step: 0.05, group: GRP2 },
  { id: 'levelDnInput', type: 'float', title: 'Shorts Level', defval: -0.5, min: -1, max: 0, step: 0.05, group: GRP2 },
  { id: 'gradInput', type: 'float', title: 'Cumulative adv./decl.', defval: 0, min: 0, max: 5, step: 1, group: GRP2 },
  { id: 'alertUpInput', type: 'string', title: 'Alert message: Long', defval: 'Long', group: GRP2, inline: '11' },
  { id: 'alertDnInput', type: 'string', title: 'Short', defval: 'Short', group: GRP2, inline: '11' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Rating', color: '#434650', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'All', color: '#434650', display: 'data_window' },
  { id: 'plot2', title: 'MAs', color: '#434650', display: 'data_window' },
  { id: 'plot3', title: 'Oscillators', color: '#434650', display: 'data_window' },
  { id: 'plot4', title: '═══════', color: '#434650', display: 'data_window' },
  { id: 'plot5', title: 'Advances/Declines', color: '#434650', display: 'data_window' },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_strong_buy', price: 0.5, title: 'Strong Buy Level', color: 'rgba(0, 255, 0, 0.5)', linestyle: 'dashed', linewidth: 1 },
  { id: 'hline_buy', price: 0.1, title: 'Buy Level', color: 'rgba(0, 255, 0, 0.35)', linestyle: 'dashed', linewidth: 1 },
  { id: 'hline_zero', price: 0, title: '0.0 Level', color: 'rgba(120, 123, 134, 0.5)', linestyle: 'dashed', linewidth: 1 },
  { id: 'hline_sell', price: -0.1, title: 'Sell Level', color: 'rgba(255, 0, 128, 0.25)', linestyle: 'dashed', linewidth: 1 },
  { id: 'hline_strong_sell', price: -0.5, title: 'Strong Sell Level', color: 'rgba(255, 0, 128, 0.5)', linestyle: 'dashed', linewidth: 1 },
];

export const metadata = {
  title: 'Technical Ratings',
  shortTitle: 'Ratings',
  overlay: false,
};

const GRAY = '#787b86';
const SILVER = '#b2b5be';
/** Leading spaces of the label texts: an em space and a thin space (FORMAT1), four em and two thin spaces (FORMAT2) */
const FORMAT1 = '\u2003\u2009';
const FORMAT2 = '\u2003\u2003\u2003\u2003\u2009\u2009';
const LEVEL_STRONG = 0.5;
const LEVEL_WEAK = 0.1;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** na() of Pine: na and +-infinity */
const isNa = (v: number) => !Number.isFinite(v);
/** nz() of Pine */
const nz = (v: number) => (isNa(v) ? 0 : v);

/** Value `k` bars back (na before the first bar) */
const back = (arr: number[], i: number, k: number) => (i - k >= 0 ? arr[i - k] : NaN);

/** The three ratings of `calcRatingAll()` on the given bars: [total (not used by the script), oscillators, MAs] */
function calcRatingAll(bars: Bar[]): { other: number[]; ma: number[] } {
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const closeArr = bars.map((b) => b.close);

  // ta library: ichimoku() with its default lengths, midpoint(len) = avg(highest(high, len), lowest(low, len))
  const midpoint = (len: number) => {
    const hh = A(ta.highest(high, len));
    const ll = A(ta.lowest(low, len));
    return hh.map((h, i) => (h + ll[i]) / 2);
  };
  const con = midpoint(9);
  const base = midpoint(26);
  const lead1 = con.map((c, i) => (c + base[i]) / 2);
  const lead2 = midpoint(52);
  // stochFull(14, 3, 3)
  const kStoch = A(ta.sma(ta.stoch(close, high, low, 14), 3));
  const dStoch = A(ta.sma(Series.fromArray(bars, kStoch), 3));
  // stochRsi(14, 14, 3, 3)
  const rsiS = ta.rsi(close, 14);
  const kStochRsi = A(ta.sma(ta.stoch(rsiS, rsiS, rsiS, 14), 3));
  const dStochRsi = A(ta.sma(Series.fromArray(bars, kStochRsi), 3));
  const [diPS, diNS, adxS] = ta.dmi(bars, 14, 14);
  const diP = A(diPS);
  const diN = A(diNS);
  const adx = A(adxS);
  const [macdS, signalS] = ta.macd(close, 12, 26, 9);
  const macd = A(macdS);
  const signal = A(signalS);
  const ema13 = A(ta.ema(close, 13));
  const bullPower = bars.map((b, i) => b.high - ema13[i]);
  const bearPower = bars.map((b, i) => b.low - ema13[i]);
  const rsi = A(rsiS);
  const cci = A(ta.cci(close, 20));
  const mom = A(ta.mom(close, 10));
  const priceAvg = A(ta.ema(close, 50));
  // uo(7, 14, 28): 100 * (4 * avg7 + 2 * avg14 + avg28) / 7, avgN = sum(bp, N) / sum(tr, N)
  const tMin = bars.map((b, i) => Math.min(b.low, back(closeArr, i, 1)));
  const tMax = bars.map((b, i) => Math.max(b.high, back(closeArr, i, 1)));
  const trS = Series.fromArray(bars, tMax.map((v, i) => v - tMin[i]));
  const bpS = Series.fromArray(bars, closeArr.map((c, i) => c - tMin[i]));
  const uoAverage = (len: number) => {
    const bp = A(math.sum(bpS, len));
    const tr = A(math.sum(trS, len));
    return bp.map((v, i) => v / tr[i]);
  };
  const avg1 = uoAverage(7);
  const avg2 = uoAverage(14);
  const avg3 = uoAverage(28);
  const uo = avg1.map((v, i) => (100 * (4 * v + 2 * avg2[i] + avg3[i])) / 7);
  const wr = A(ta.wpr(bars, 14));
  // ao(): sma(hl2, 5) - sma(hl2, 34)
  const hl2 = new Series(bars, (b) => (b.high + b.low) / 2);
  const aoSlow = A(ta.sma(hl2, 34));
  const ao = A(ta.sma(hl2, 5)).map((v, i) => v - aoSlow[i]);
  const aoS = Series.fromArray(bars, ao);
  const aoCrossUp = ta.crossover(aoS, 0).toArray();
  const aoCrossDn = ta.crossunder(aoS, 0).toArray();

  const maSeries = [10, 20, 30, 50, 100, 200].map((len) => A(ta.sma(close, len)))
    .concat([10, 20, 30, 50, 100, 200].map((len) => A(ta.ema(close, len))))
    .concat([A(ta.hma(close, 9)), A(ta.vwma(close, 20, new Series(bars, (b) => b.volume ?? NaN)))]);

  /** calcRating(src, bullCond, bearCond) */
  const calcRating = (src: number, bull: boolean, bear: boolean) => (isNa(src) ? NaN : bull ? 1 : bear ? -1 : 0);

  const other: number[] = [];
  const ma: number[] = [];
  const indRatings = array.new_float(0);
  for (let i = 0; i < n; i++) {
    const c = closeArr[i];
    array.clear(indRatings);
    // calcRatingMA(ma, close) = math.sign(close - ma)
    for (const s of maSeries) array.push(indRatings, Math.sign(c - s[i]));
    const l1 = back(lead1, i, 26);
    const l2 = back(lead2, i, 26);
    array.push(indRatings, calcRating(lead2[i],
      gt(l1, l2) && gt(base[i], l1) && gt(con[i], base[i]) && gt(c, con[i]),
      lt(l1, l2) && lt(base[i], l1) && lt(con[i], base[i]) && lt(c, con[i])));
    ma.push(array.avg(indRatings));

    array.clear(indRatings);
    const rsi1 = back(rsi, i, 1);
    array.push(indRatings, calcRating(rsi1, lt(rsi[i], 30) && lt(rsi1, rsi[i]), gt(rsi[i], 70) && gt(rsi1, rsi[i])));
    array.push(indRatings, calcRating(back(dStoch, i, 1),
      lt(kStoch[i], 20) && lt(dStoch[i], 20) && gt(kStoch[i], dStoch[i]),
      gt(kStoch[i], 80) && gt(dStoch[i], 80) && lt(kStoch[i], dStoch[i])));
    const cci1 = back(cci, i, 1);
    array.push(indRatings, calcRating(cci1, lt(cci[i], -100) && gt(cci[i], cci1), gt(cci[i], 100) && lt(cci[i], cci1)));
    const adx1 = back(adx, i, 1);
    array.push(indRatings, calcRating(adx[i],
      gt(adx[i], 20) && gt(adx[i], adx1) && gt(diP[i], diN[i]),
      gt(adx[i], 20) && gt(adx[i], adx1) && lt(diP[i], diN[i])));
    const ao0 = ao[i];
    const ao1 = back(ao, i, 1);
    const ao2 = back(ao, i, 2);
    array.push(indRatings, calcRating(ao1,
      !!aoCrossUp[i] || (gt(ao0, 0) && gt(ao1, 0) && gt(ao0, ao1) && gt(ao2, ao1)),
      !!aoCrossDn[i] || (lt(ao0, 0) && lt(ao1, 0) && lt(ao0, ao1) && lt(ao2, ao1))));
    const mom1 = back(mom, i, 1);
    array.push(indRatings, calcRating(mom1, gt(mom[i], mom1), lt(mom[i], mom1)));
    array.push(indRatings, calcRating(signal[i], gt(macd[i], signal[i]), lt(macd[i], signal[i])));
    const downTrend = lt(c, priceAvg[i]);
    const upTrend = gt(c, priceAvg[i]);
    array.push(indRatings, calcRating(priceAvg[i],
      downTrend && lt(kStochRsi[i], 20) && lt(dStochRsi[i], 20) && gt(kStochRsi[i], dStochRsi[i]),
      upTrend && gt(kStochRsi[i], 80) && gt(dStochRsi[i], 80) && lt(kStochRsi[i], dStochRsi[i])));
    const wr1 = back(wr, i, 1);
    array.push(indRatings, calcRating(wr1, lt(wr[i], -80) && gt(wr[i], wr1), gt(wr[i], -20) && lt(wr[i], wr1)));
    array.push(indRatings, calcRating(priceAvg[i],
      upTrend && lt(bearPower[i], 0) && gt(bearPower[i], back(bearPower, i, 1)),
      downTrend && gt(bullPower[i], 0) && lt(bullPower[i], back(bullPower, i, 1))));
    array.push(indRatings, calcRating(uo[i], gt(uo[i], 70), lt(uo[i], 30)));
    other.push(array.avg(indRatings));
  }
  return { other, ma };
}

/** colorFromRating(): bull / bear at transparency 20 beyond 0.5, 50 beyond 0.1, else the neutral colour as is */
function colorFromRating(rating: number, bull: string, bear: string, neutral: string): string {
  if (gt(rating, LEVEL_STRONG)) return String(color.new(bull, 20));
  if (gt(rating, LEVEL_WEAK)) return String(color.new(bull, 50));
  if (lt(rating, -LEVEL_STRONG)) return String(color.new(bear, 20));
  if (lt(rating, -LEVEL_WEAK)) return String(color.new(bear, 50));
  return neutral;
}

/** textFromRating() */
function textFromRating(rating: number): string {
  if (gt(rating, LEVEL_STRONG)) return 'Strong Buy';
  if (gt(rating, LEVEL_WEAK)) return 'Buy';
  if (lt(rating, -LEVEL_STRONG)) return 'Strong Sell';
  if (lt(rating, -LEVEL_WEAK)) return 'Sell';
  return 'Neutral';
}

/**
 * signalColor(): base colour by the sign of the count, transparency 100 - 20 * |count| (75 instead of 80); the
 * neutral colour (also a bull / bear colour equal to it) is returned as is
 */
function signalColor(gradient: number, bull: string, bear: string, neutral: string): string {
  const col = gradient > 0 ? bull : gradient < 0 ? bear : neutral;
  let transp = 100 - Math.abs(gradient) * 20;
  transp = transp === 80 ? 75 : transp;
  return col.toLowerCase() === neutral.toLowerCase() ? col : String(color.new(col, transp));
}

/** countRising() of the TechnicalRating library (one state per call) */
function countRising(): (plot: number) => number {
  let result = 0;
  let prev = NaN;
  return (plot: number) => {
    const v = Math.abs(plot);
    // switch without a default: na when no case matches
    result = eq(v, 0) ? 0 : ge(v, prev) ? Math.min(5, result + 1) : lt(v, prev) ? Math.max(1, result - 1) : NaN;
    prev = v;
    return result;
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TechnicalRatingsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; labels: LabelData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const repaint = cfg.repaintInput === 'On';
  const maWeight = Math.trunc(cfg.maInput) / 100;
  // bullColor = showColorInput1 ? colorInput1 : showColorInput2 ? colorInput2 : showColorInput3 ? colorInput3 : colorInput1
  const bullColor = cfg.showColorInput1 ? cfg.colorInput1 : cfg.showColorInput2 ? cfg.colorInput2
    : cfg.showColorInput3 ? cfg.colorInput3 : cfg.colorInput1;
  const bearColor = cfg.showColorInput4 ? cfg.colorInput4 : cfg.showColorInput5 ? cfg.colorInput5
    : cfg.showColorInput6 ? cfg.colorInput6 : cfg.colorInput4;
  const neutral = cfg.neutColorInput;
  const isBiDirectional = cfg.dirInput === 'Longs and Shorts';
  const doLongs = cfg.dirInput === 'Longs' || isBiDirectional;
  const doShorts = cfg.dirInput === 'Shorts' || isBiDirectional;
  const altInput = cfg.altInput === 'On' && isBiDirectional;

  // timeframe.main_period and the requested timeframe ("" = the chart timeframe)
  const chartTf = chartTimeframe(bars, chart);
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const tf = cfg.tfInput.trim();
  const tfSeconds = tf === '' ? chartSeconds : timeframe.in_seconds(tf);
  const htfUsed = tfSeconds > chartSeconds;
  if (n > 0 && chartSeconds > tfSeconds) {
    throw new Error(`The requested timeframe cannot be lower than the chart's timeframe ('${chartTf}').`);
  }

  // request.security(syminfo.tickerid, tfInput, [tot[offset], osc[offset], mas[offset]], lookahead)
  const ratingsOf = (b: Bar[]) => {
    const { other, ma } = calcRatingAll(b);
    const tot = ma.map((m, i) => nz(m * maWeight) + nz(other[i] * (1 - maWeight)));
    return { tot, other, ma };
  };
  let ratingTot: number[];
  let ratingOsc: number[];
  let ratingMas: number[];
  if (!htfUsed) {
    const r = ratingsOf(bars);
    ratingTot = r.tot;
    ratingOsc = r.other;
    ratingMas = r.ma;
  } else {
    const sec = higherTimeframeBars(bars, tf, chart);
    const r = ratingsOf(sec.htf);
    // Repainting On: lookahead off, the value of a period on the bar that completes it
    // Repainting Off: value[1] with lookahead on, every bar of a period shows the period before
    const toChart = (values: number[]) => (repaint
      ? mapToChart(values, sec.group, sec.latest, false, false)
      : mapToChart(values.map((_v, g) => (g > 0 ? values[g - 1] : NaN)), sec.group, sec.latest, true, false));
    ratingTot = toChart(r.tot);
    ratingOsc = toChart(r.other);
    ratingMas = toChart(r.ma);
  }

  const order = cfg.calcsInput === 'MAs' ? [ratingMas, ratingOsc, ratingTot]
    : cfg.calcsInput === 'Oscillators' ? [ratingOsc, ratingMas, ratingTot]
    : [ratingTot, ratingMas, ratingOsc];
  const [userRating, rating2, rating3] = order;

  const risingBuys = countRising();
  const fallingSells = countRising();
  const xUp = ta.crossover(Series.fromArray(bars, userRating), cfg.levelUpInput).toArray();
  const xDn = ta.crossunder(Series.fromArray(bars, userRating), cfg.levelDnInput).toArray();

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const plot4: typeof plot0 = [];
  const plot5: typeof plot0 = [];
  const markers: MarkerData[] = [];
  const longColor = String(color.new(bullColor, 0));
  const shortColor = String(color.new(bearColor, 0));
  const plotValue = (v: number) => (Number.isFinite(v) ? v : NaN);
  let prevGradient = NaN;
  // alert(): int ensureNoRepaintIdx = not htfUsed and repaintInput ? 1 : 0; var bool lastDirectionUp = na
  const alertCalls: AlertCall[] = [];
  const noRepaintIdx = !htfUsed && repaint ? 1 : 0;
  let lastDirectionUp: boolean | null = null;
  let prevRawLong = false;
  let prevRawShort = false;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const u = userRating[i];
    const condBuy = gt(u, LEVEL_WEAK);
    const condSell = lt(u, -LEVEL_WEAK);
    const rb = risingBuys(condBuy ? u : 0);
    const fs = fallingSells(condSell ? u : 0);
    const gradientLvl = condBuy ? rb : condSell ? -fs : 0;
    const sigColor = signalColor(gradientLvl, bullColor, bearColor, neutral);
    const totColor = colorFromRating(ratingTot[i], bullColor, bearColor, neutral);

    plot0.push({ time: t, value: plotValue(u), color: sigColor });
    plot1.push({ time: t, value: plotValue(ratingTot[i]), color: totColor });
    plot2.push({ time: t, value: plotValue(ratingMas[i]), color: colorFromRating(ratingMas[i], bullColor, bearColor, neutral) });
    plot3.push({ time: t, value: plotValue(ratingOsc[i]), color: colorFromRating(ratingOsc[i], bullColor, bearColor, neutral) });
    plot4.push({ time: t, value: NaN, color: totColor });
    plot5.push({ time: t, value: gradientLvl, color: sigColor });

    // alerts and markers
    const up = !!xUp[i] && cfg.levelUpInput !== 0;
    const dn = !!xDn[i] && cfg.levelDnInput !== 0;
    const g = cfg.gradInput;
    const gUp = g !== 0 && eq(gradientLvl, g) && lt(prevGradient, g);
    const gDn = g !== 0 && eq(gradientLvl, -g) && gt(prevGradient, -g);
    prevGradient = gradientLvl;
    // the original's triggers: ((xUp or gUp) and (...) and doLongs)[ensureNoRepaintIdx], the series of both the
    // alert() calls and the markers
    const rawLong = (up || gUp) && (!altInput || lastDirectionUp === null || !lastDirectionUp) && doLongs;
    const rawShort = (dn || gDn) && (!altInput || lastDirectionUp === null || lastDirectionUp) && doShorts;
    const triggerLong = noRepaintIdx === 1 ? prevRawLong : rawLong;
    const triggerShort = noRepaintIdx === 1 ? prevRawShort : rawShort;
    prevRawLong = rawLong;
    prevRawShort = rawShort;
    if (triggerLong) {
      alertCalls.push({ time: t, message: cfg.alertUpInput, freq: 'once_per_bar' });
      lastDirectionUp = true;
    } else if (triggerShort) {
      alertCalls.push({ time: t, message: cfg.alertDnInput, freq: 'once_per_bar' });
      lastDirectionUp = false;
    }
    // plotchar(triggerLong, "Long Marker", "▲", location.bottom, color.new(bullColor, 00), size = size.tiny)
    // plotchar(triggerShort, "Short Marker", "▼", location.top, color.new(bearColor, 00), size = size.tiny)
    if (triggerLong) {
      markers.push({ time: t, position: 'bottom', shape: 'circle', color: 'transparent', text: '▲', textColor: longColor, size: 'tiny', id: 'char0' });
    }
    if (triggerShort) {
      markers.push({ time: t, position: 'top', shape: 'circle', color: 'transparent', text: '▼', textColor: shortColor, size: 'tiny', id: 'char1' });
    }
  }

  // print(): six labels on the last bar (lines 1 to 3 of the text by leading / trailing line feeds)
  const labels: LabelData[] = [];
  if (n > 0) {
    const last = n - 1;
    const title1 = cfg.calcsInput === 'MAs' ? 'MAs' : cfg.calcsInput === 'Oscillators' ? 'Osc' : 'All';
    const title2 = cfg.calcsInput === 'MAs' ? 'Osc' : 'MAs';
    const title3 = cfg.calcsInput === 'MAs and Oscillators' ? 'Osc' : 'All';
    const colors = [ratingTot, ratingMas, ratingOsc].map((r) => colorFromRating(r[last], bullColor, bearColor, neutral));
    const urColor = cfg.calcsInput === 'MAs' ? colors[1] : cfg.calcsInput === 'Oscillators' ? colors[2] : colors[0];
    const r2Color = cfg.calcsInput === 'MAs' ? colors[2] : colors[1];
    const r3Color = cfg.calcsInput === 'MAs and Oscillators' ? colors[2] : colors[0];
    const print = (txt: string, lineNo: number, textColor: string) => {
      labels.push({
        time: bars[last].time, price: 0, text: '\n'.repeat(Math.max(0, lineNo - 1)) + txt + '\n'.repeat(Math.max(0, 4 - lineNo)),
        color: '#00000000', textColor, style: 'label_left', textAlign: 'left',
      });
    };
    print(`${FORMAT1}${title1}:`, 1, SILVER);
    print(`${FORMAT1}${title2}:`, 2, GRAY);
    print(`${FORMAT1}${title3}:`, 3, GRAY);
    print(`${FORMAT2}${textFromRating(userRating[last])}`, 1, urColor);
    print(`${FORMAT2}${textFromRating(rating2[last])}`, 2, r2Color);
    print(`${FORMAT2}${textFromRating(rating3[last])}`, 3, r3Color);
  }

  const hlines: NonNullable<IndicatorResult['hlines']> = [
    { value: LEVEL_STRONG, options: { title: 'Strong Buy Level', color: String(color.new(bullColor, 50)), linestyle: 'dashed' } },
    { value: LEVEL_WEAK, options: { title: 'Buy Level', color: String(color.new(bullColor, 65)), linestyle: 'dashed' } },
    { value: 0, options: { title: '0.0 Level', color: String(color.new(GRAY, 50)), linestyle: 'dashed' } },
    { value: -LEVEL_WEAK, options: { title: 'Sell Level', color: String(color.new(bearColor, 75)), linestyle: 'dashed' } },
    { value: -LEVEL_STRONG, options: { title: 'Strong Sell Level', color: String(color.new(bearColor, 50)), linestyle: 'dashed' } },
  ];
  // hline(na) is not drawn; an na colour neither
  if (doLongs && cfg.levelUpInput !== 0) {
    hlines.push({ value: cfg.levelUpInput, options: { title: 'Long Level', color: bullColor, linestyle: 'dotted' } });
  }
  if (doShorts && cfg.levelDnInput !== 0) {
    hlines.push({ value: cfg.levelDnInput, options: { title: 'Short Level', color: bearColor, linestyle: 'dotted' } });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5 },
    hlines,
    markers,
    labels,
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const TechnicalRatings = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, hasAlertFunction };
