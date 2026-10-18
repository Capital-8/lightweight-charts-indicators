/**
 * Hull Butterfly Oscillator [LuxAlgo]
 *
 * The original's Hull coefficients: the linearly combined WMA coefficients (2 * WMA(len / 2) - WMA(len)), padded with
 * int(sqrt(len)) - 1 zeros in front and int(sqrt(len)) zeros behind, convolved with a WMA of int(sqrt(len)).
 * hso = hma - inv_hma (the same coefficients over the source and over the source in reverse order), na until the
 * window is full. cmean = ta.cum(abs(hso)) / bar_index * mult (dynamic levels at +-cmean and +-cmean / 2).
 * os = 0 on a cross of hso with +-cmean, -1 when hso falls above cmean, 1 when it rises below -cmean, else kept.
 * Histogram coloured by the original's gradients, the hso line in the chart foreground colour (`chart.fg_color` of
 * the chart context, #DBDBDB without it), the four levels in gray; no zero line. 'Bullish Dot' / 'Bearish Dot' are
 * circle-style plots at hso on the bar where os turns to 1 / -1.
 *
 * Reference: "Hull Butterfly Oscillator [LuxAlgo]"
 */

import { getSourceSeries, ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface HullButterflyOscInputs {
  length: number;
  mult: number;
  src: SourceType;
  bullCss0: string;
  bullCss1: string;
  bearCss0: string;
  bearCss1: string;
}

const BULL_0 = String(color.new('#0cb51a', 50));
const BEAR_0 = String(color.new('#ff1100', 50));

export const defaultInputs: HullButterflyOscInputs = {
  length: 14,
  mult: 2.0,
  src: 'close',
  bullCss0: BULL_0,
  bullCss1: '#0cb51a',
  bearCss0: BEAR_0,
  bearCss1: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 14, min: 2 },
  { id: 'mult', type: 'float', title: 'Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'bullCss0', type: 'color', title: 'Bullish Gradient', defval: BULL_0, inline: 'inline0', group: 'Style' },
  { id: 'bullCss1', type: 'color', title: '', defval: '#0cb51a', inline: 'inline0', group: 'Style' },
  { id: 'bearCss0', type: 'color', title: 'Bearish Gradient', defval: BEAR_0, inline: 'inline1', group: 'Style' },
  { id: 'bearCss1', type: 'color', title: '', defval: '#ff1100', inline: 'inline1', group: 'Style' },
];

/** chart.fg_color without a chart context (dark theme) */
const FG = foregroundColorOf();
/** color.gray */
const GRAY = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Hull Butterfly', color: '#26A69A', lineWidth: 1, style: 'histogram' },
  { id: 'plot1', title: 'Hull Butterfly', color: FG, lineWidth: 1 },
  { id: 'bullDot', title: 'Bullish Dot', color: '#0cb51a', lineWidth: 2, style: 'circles' },
  { id: 'bearDot', title: 'Bearish Dot', color: '#ff1100', lineWidth: 2, style: 'circles' },
  // the levels: plot(+-cmean, +-cmean / 2, color = color.gray, editable = false)
  { id: 'plot2', title: 'Plot', color: GRAY, lineWidth: 1, editable: false },
  { id: 'plot3', title: 'Plot', color: GRAY, lineWidth: 1, editable: false },
  { id: 'plot4', title: 'Plot', color: GRAY, lineWidth: 1, editable: false },
  { id: 'plot5', title: 'Plot', color: GRAY, lineWidth: 1, editable: false },
];

export const metadata = {
  title: 'Hull Butterfly Oscillator',
  shortTitle: 'HBO',
  overlay: false,
};

/** A PineScript `for i = from to to` loop: counts down when `to` < `from` */
function pineRange(from: number, to: number): number[] {
  const out: number[] = [];
  if (to >= from) for (let i = from; i <= to; i++) out.push(i);
  else for (let i = from; i >= to; i--) out.push(i);
  return out;
}

/** The original's barstate.isfirst block (array.unshift order kept) */
export function buildHullCoeffs(length: number): number[] {
  const shortLen = Math.trunc(length / 2);
  const hullLen = Math.trunc(Math.sqrt(length));

  const den1 = shortLen * (shortLen + 1) / 2;
  const den2 = length * (length + 1) / 2;
  const den3 = hullLen * (hullLen + 1) / 2;

  // var lcwa_coeffs = array.new_float(hull_len, 0)
  const lcwa: number[] = new Array(Math.max(hullLen, 0)).fill(0);
  for (const i of pineRange(0, length - 1)) {
    const sum1 = Math.max(shortLen - i, 0);
    const sum2 = length - i;
    lcwa.unshift(2 * (sum1 / den1) - (sum2 / den2));
  }
  for (let k = pineRange(0, hullLen - 2).length; k > 0; k--) lcwa.unshift(0);

  const hullCoeffs: number[] = [];
  for (const i of pineRange(hullLen, lcwa.length - 1)) {
    let sum3 = 0;
    for (const j of pineRange(i - hullLen, i - 1)) sum3 += (lcwa[j] ?? NaN) * (i - j);
    hullCoeffs.unshift(sum3 / den3);
  }
  return hullCoeffs;
}

export function calculate(bars: Bar[], inputs: Partial<HullButterflyOscInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const { length, mult, src } = cfg;
  const n = bars.length;
  const srcArr = getSourceSeries(bars, src).toArray();

  const hullCoeffs = buildHullCoeffs(length);
  const len = hullCoeffs.length - 1;

  // hma / inv_hma over src[0..len]: na until bar len
  const hsoArr: number[] = new Array(n).fill(NaN);
  for (let t = 0; t < n; t++) {
    if (len < 0 || t - len < 0) continue;
    let hma = 0;
    let invHma = 0;
    for (let i = 0; i <= len; i++) {
      hma += srcArr[t - i] * hullCoeffs[i];
      invHma += srcArr[t - (len - i)] * hullCoeffs[i];
    }
    hsoArr[t] = hma - invHma;
  }

  // cmean = ta.cum(math.abs(hso)) / bar_index * mult
  const cumAbs = ta.cum(Series.fromArray(bars, hsoArr.map((v) => Math.abs(v)))).toArray();
  const cmeanArr = cumAbs.map((c, t) => (Number.isFinite(c) && t !== 0 ? (c / t) * mult : NaN));

  const hsoS = Series.fromArray(bars, hsoArr);
  const crossUp = ta.cross(hsoS, Series.fromArray(bars, cmeanArr)).toArray();
  const crossDn = ta.cross(hsoS, Series.fromArray(bars, cmeanArr.map((c) => -c))).toArray();

  // var os = 0
  const osArr: number[] = new Array(n).fill(0);
  let os = 0;
  for (let t = 0; t < n; t++) {
    const hso = hsoArr[t];
    const prev = t > 0 ? hsoArr[t - 1] : NaN;
    const cm = cmeanArr[t];
    if (crossUp[t] || crossDn[t]) os = 0;
    else if (hso < prev && hso > cm) os = -1;
    else if (hso > prev && hso < -cm) os = 1;
    osArr[t] = os;
  }

  // css = hso > 0 ? from_gradient(hso, 0, cmean, bull_css_0, bull_css_1) : from_gradient(hso, -cmean, 0, bear_css_1, bear_css_0)
  const histPlot = hsoArr.map((hso, t) => {
    const cm = cmeanArr[t];
    const css = hso > 0
      ? color.from_gradient(hso, 0, cm, cfg.bullCss0, cfg.bullCss1)
      : color.from_gradient(hso, -cm, 0, cfg.bearCss1, cfg.bearCss0);
    return { time: bars[t].time, value: hso, color: css };
  });
  // plot(hso, 'Hull Butterfly', chart.fg_color)
  const fg = foregroundColorOf(chart);
  const linePlot = hsoArr.map((hso, t) => ({ time: bars[t].time, value: hso, color: fg }));

  // plot(os > os[1] and os == 1 ? hso : na, 'Bullish Dot', bull_css_1, 2, plot.style_circles) (os[1] na on bar 0)
  const bullDot = hsoArr.map((hso, t) => ({
    time: bars[t].time,
    value: t > 0 && osArr[t] > osArr[t - 1] && osArr[t] === 1 ? hso : NaN,
    color: cfg.bullCss1,
  }));
  // plot(os < os[1] and os == -1 ? hso : na, 'Bearish Dot', bear_css_1, 2, plot.style_circles)
  const bearDot = hsoArr.map((hso, t) => ({
    time: bars[t].time,
    value: t > 0 && osArr[t] < osArr[t - 1] && osArr[t] === -1 ? hso : NaN,
    color: cfg.bearCss1,
  }));

  const level = (k: number) => cmeanArr.map((cm, t) => ({ time: bars[t].time, value: cm * k, color: GRAY }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': histPlot,
      'plot1': linePlot,
      'bullDot': bullDot,
      'bearDot': bearDot,
      'plot2': level(1),
      'plot3': level(0.5),
      'plot4': level(-0.5),
      'plot5': level(-1),
    },
  };
}

export const HullButterflyOscillator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
