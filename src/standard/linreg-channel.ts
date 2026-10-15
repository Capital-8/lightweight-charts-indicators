/**
 * Linear Regression Channel
 *
 * Least-squares line of the source over the last `Length` bars, drawn on the last bar only, with an upper and a
 * lower line around it:
 *
 *   slope, intercept from the sums of (x, source) with x = 1 (newest bar) to Length (oldest bar)
 *   line from bar (last - Length + 1) at intercept + slope * (Length - 1) to the last bar at intercept
 *   stdDev = sqrt(sum((source - line)^2) / (Length - 1))
 *   upper = line + Upper Deviation * stdDev (unchecked: the largest high above the line)
 *   lower = line - Lower Deviation * stdDev (unchecked: the largest low below the line)
 *
 * The space between the upper line and the middle line is filled with the first colour, between the middle line
 * and the lower line with the second one. Pearson's R of the source and the line is shown in a label under the
 * start of the lower line. Every drawing is made on the last bar (the channel repaints with each new bar). The
 * alert conditions of the original are not ported.
 *
 * Based on the standard Linear Regression Channel indicator.
 */

import { str, color, type Bar, type IndicatorResult, type InputConfig, type PlotConfig, getSource } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

export type LinRegChannelSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'hlcc4' | 'ohlc4' | 'volume';

export interface LinRegChannelInputs {
  /** Number of bars of the regression (1 to 5000) */
  length: number;
  source: LinRegChannelSource;
  /** Upper line at Upper Deviation standard deviations (else at the largest high above the line) */
  useUpperDev: boolean;
  upperMult: number;
  /** Lower line at Lower Deviation standard deviations (else at the largest low below the line) */
  useLowerDev: boolean;
  lowerMult: number;
  showPearson: boolean;
  extendLeft: boolean;
  extendRight: boolean;
  /** Fill between the upper and the middle line; the upper and lower lines take it without transparency */
  colorUpper: string;
  /** Fill between the middle and the lower line; the middle line takes it without transparency */
  colorLower: string;
}

export const defaultInputs: LinRegChannelInputs = {
  length: 100,
  source: 'close',
  useUpperDev: true,
  upperMult: 2.0,
  useLowerDev: true,
  lowerMult: 2.0,
  showPearson: true,
  extendLeft: false,
  extendRight: true,
  colorUpper: 'rgba(41, 98, 255, 0.15)',
  colorLower: 'rgba(242, 54, 69, 0.15)',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 100, min: 1, max: 5000 },
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'useUpperDev', type: 'bool', title: 'Upper Deviation', defval: true, inline: 'Upper Deviation', group: 'Channel Settings', display: 'none' },
  { id: 'upperMult', type: 'float', title: '', defval: 2.0, inline: 'Upper Deviation', group: 'Channel Settings', active: 'useUpperDev' },
  { id: 'useLowerDev', type: 'bool', title: 'Lower Deviation', defval: true, inline: 'Lower Deviation', group: 'Channel Settings', display: 'none' },
  { id: 'lowerMult', type: 'float', title: '', defval: 2.0, inline: 'Lower Deviation', group: 'Channel Settings', active: 'useLowerDev' },
  { id: 'showPearson', type: 'bool', title: "Show Pearson's R", defval: true, group: 'Display Settings', display: 'none' },
  { id: 'extendLeft', type: 'bool', title: 'Extend Lines Left', defval: false, group: 'Display Settings', display: 'none' },
  { id: 'extendRight', type: 'bool', title: 'Extend Lines Right', defval: true, group: 'Display Settings', display: 'none' },
  { id: 'colorUpper', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.15)', inline: 'Color Settings', group: 'Color Settings' },
  { id: 'colorLower', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.15)', inline: 'Color Settings', group: 'Color Settings' },
];

// No plots: lines, linefills and a label
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Linear Regression Channel',
  shortTitle: 'LinReg',
  overlay: true,
};

/** Pine float comparison: a > b when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine float equality: within 1e-10 */
const eq = (a: number, b: number) => Math.abs(a - b) <= 1e-10;

export function calculate(
  bars: Bar[],
  inputs: Partial<LinRegChannelInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; linefills: LinefillData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const result = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: [] as LineDrawingData[],
    linefills: [] as LinefillData[],
    labels: [] as LabelData[],
  };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const last = n - 1;
  // calcSlope() returns na before the last bar and for a length of 1 or less: nothing is drawn
  if (n === 0 || length <= 1) return result;

  // source[i]: na before the first bar
  // (another source of the chart for a study on study: the host's values)
  const srcValues = getSource(bars, cfg.source as never);
  const src = (i: number) => (last - i >= 0 ? srcValues[last - i] : NaN);
  const high = (i: number) => (last - i >= 0 ? bars[last - i].high : NaN);
  const low = (i: number) => (last - i >= 0 ? bars[last - i].low : NaN);

  // calcSlope()
  let sumX = 0.0;
  let sumY = 0.0;
  let sumXSqr = 0.0;
  let sumXY = 0.0;
  for (let i = 0; i <= length - 1; i++) {
    const val = src(i);
    const per = i + 1.0;
    sumX += per;
    sumY += val;
    sumXSqr += per * per;
    sumXY += val * per;
  }
  const slope = (length * sumXY - sumX * sumY) / (length * sumXSqr - sumX * sumX);
  const average = sumY / length;
  const intercept = average - slope * sumX / length + slope;

  // calcDev()
  let upDev = 0.0;
  let dnDev = 0.0;
  let stdDevAcc = 0.0;
  let dsxx = 0.0;
  let dsyy = 0.0;
  let dsxy = 0.0;
  const periods = length - 1;
  const daY = intercept + slope * periods / 2;
  let val = intercept;
  for (let j = 0; j <= periods; j++) {
    let price = high(j) - val;
    if (gt(price, upDev)) upDev = price;
    price = val - low(j);
    if (gt(price, dnDev)) dnDev = price;
    price = src(j);
    const dxt = price - average;
    const dyt = val - daY;
    price -= val;
    stdDevAcc += price * price;
    dsxx += dxt * dxt;
    dsyy += dyt * dyt;
    dsxy += dxt * dyt;
    val += slope;
  }
  const stdDev = Math.sqrt(stdDevAcc / (periods === 0 ? 1 : periods));
  const pearsonR = eq(dsxx, 0) || eq(dsyy, 0) ? 0 : dsxy / Math.sqrt(dsxx * dsyy);

  const startPrice = intercept + slope * (length - 1);
  const endPrice = intercept;
  const upperOffset = cfg.useUpperDev ? cfg.upperMult * stdDev : upDev;
  const lowerOffset = cfg.useLowerDev ? -cfg.lowerMult * stdDev : -dnDev;
  const upperStartPrice = startPrice + upperOffset;
  const upperEndPrice = endPrice + upperOffset;
  const lowerStartPrice = startPrice + lowerOffset;
  const lowerEndPrice = endPrice + lowerOffset;

  const extend = cfg.extendLeft && cfg.extendRight ? 'both' : cfg.extendLeft ? 'left' : cfg.extendRight ? 'right' : 'none';
  const time1 = barTime(bars, last - length + 1, barInterval(bars));
  const time2 = bars[last].time;
  const opaqueUpper = String(color.new(cfg.colorUpper, 0));
  const lineOf = (p1: number, p2: number, c: string): LineDrawingData | null =>
    Number.isNaN(p1) || Number.isNaN(p2) || Number.isNaN(time1)
      ? null
      : { time1, price1: p1, time2, price2: p2, color: c, width: 1, style: 'solid', extend };

  // line.new() only when the start price is not na; a line with an na point is not drawn
  const baseLine = lineOf(startPrice, endPrice, String(color.new(cfg.colorLower, 0)));
  const upper = lineOf(upperStartPrice, upperEndPrice, opaqueUpper);
  const lower = lineOf(lowerStartPrice, lowerEndPrice, opaqueUpper);
  for (const l of [baseLine, upper, lower]) if (l) result.lines.push(l);
  if (upper && baseLine) result.linefills.push({ line1: upper, line2: baseLine, color: cfg.colorUpper });
  if (baseLine && lower) result.linefills.push({ line1: baseLine, line2: lower, color: cfg.colorLower });

  // Pearson's R under the start of the lower line
  if (cfg.showPearson && !Number.isNaN(pearsonR) && !Number.isNaN(lowerStartPrice) && !Number.isNaN(time1)) {
    result.labels.push({
      time: time1,
      price: lowerStartPrice,
      text: str.tostring(pearsonR, '#.################'),
      color: String(color.new('#FFFFFF', 100)),
      textColor: opaqueUpper,
      size: 'normal',
      style: 'label_up',
    });
  }
  return result;
}

export const LinearRegressionChannelStandard = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
