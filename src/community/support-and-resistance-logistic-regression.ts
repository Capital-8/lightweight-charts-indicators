/**
 * Support and Resistance Logistic Regression | Flux Charts
 *
 * Every pivot high is a resistance level and every pivot low a support level ("Pivot Length" bars on each side).
 * A level is "respected" each time a bar goes through it and closes back on its own side; it ends on the first bar
 * that goes through it and closes beyond it.
 *
 * When a pivot is found, a small logistic regression is trained on all the pivots of the same kind found so far.
 * Each pivot has two features, +1 or -1: the RSI on the pivot bar above 50, and the body of the pivot bar larger
 * than the ATR. The target is +1 when the pivot has been respected at least "Target Respects" times, else -1. The
 * weights start at 1 and are updated once per pivot with a learning rate of 0.008; the prediction for the new pivot
 * is taken after the last update. A pivot whose prediction reaches the "Probability Threshold" becomes a level.
 *
 * On the last bar every such level is drawn as a line from its pivot to the bar that ended it (or to the last bar),
 * with the prediction in percent as a label. A level that is still active but further than 7 ATR from the close is
 * hidden ("Hide Far Lines"). Optional small labels mark the retests ("R") and the breaks ("B") of these levels; a
 * retest is counted at most once every 3 bars. At most 500 lines and 500 labels are kept.
 *
 * The retests and breaks are only read on closed bars: when the chart context says that the last bar is still open,
 * that bar is not read.
 *
 * Reference: "Support and Resistance Logistic Regression | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SupportAndResistanceLogisticRegressionInputs {
  /** Bars on each side of a pivot */
  pivotLength: number;
  /** Retests needed for a level to count as respected in the model */
  targetRespects: number;
  /** Minimum prediction of the model for a level to be drawn */
  probabilityThreshold: number;
  hideFarLines: boolean;
  showPredictionLabels: boolean;
  showRetests: boolean;
  showBreaks: boolean;
  lineStyle: '____' | '----' | '....';
  lineWidth: number;
  supportColor: string;
  resistanceColor: string;
  textColorSupport: string;
  textColorResistance: string;
}

export const defaultInputs: SupportAndResistanceLogisticRegressionInputs = {
  pivotLength: 14,
  targetRespects: 3,
  probabilityThreshold: 0.7,
  hideFarLines: true,
  showPredictionLabels: true,
  showRetests: false,
  showBreaks: false,
  lineStyle: '____',
  lineWidth: 3,
  supportColor: '#089981',
  resistanceColor: '#f23645',
  textColorSupport: '#FFFFFF',
  textColorResistance: '#FFFFFF',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 14, min: 0, group: 'General Configuration',
    tooltip: 'This setting defines the number of bars used to determine a significant high or low for pivot detection.',
  },
  {
    id: 'targetRespects', type: 'int', title: 'Target Respects', defval: 3, group: 'General Configuration',
    tooltip: 'This input specifies how many times a level must be retested by price action for it to be considered a strong support or resistance level by the underlying model.\nHigher settings will result in less zones detected.',
  },
  {
    id: 'probabilityThreshold', type: 'float', title: 'Probability Threshold', defval: 0.7, min: 0.001, max: 1, step: 0.05,
    group: 'General Configuration',
    tooltip: 'This is the minimum probability output from the logistic regression model for a detected pivot to be considered a valid support or resistance level and be plotted on the chart.\nHigher settings will result in less zones rendered.',
  },
  { id: 'hideFarLines', type: 'bool', title: 'Hide Far Lines', defval: true, group: 'General Configuration' },
  { id: 'showPredictionLabels', type: 'bool', title: 'Show Prediction Labels', defval: true, group: 'Style' },
  { id: 'showRetests', type: 'bool', title: 'Show Retests', defval: false, group: 'Style' },
  { id: 'showBreaks', type: 'bool', title: 'Show Breaks', defval: false, group: 'Style' },
  { id: 'lineStyle', type: 'string', title: '    ', defval: '____', options: ['____', '----', '....'], group: 'Style', inline: 's1' },
  { id: 'lineWidth', type: 'int', title: 'Width', defval: 3, min: 1, max: 3, group: 'Style', inline: 's1' },
  { id: 'supportColor', type: 'color', title: 'Lines & Labels', defval: '#089981', group: 'Style', inline: 's2' },
  { id: 'resistanceColor', type: 'color', title: '', defval: '#f23645', group: 'Style', inline: 's2' },
  { id: 'textColorSupport', type: 'color', title: 'Text', defval: '#FFFFFF', group: 'Style', inline: 's3' },
  { id: 'textColorResistance', type: 'color', title: '', defval: '#FFFFFF', group: 'Style', inline: 's3' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Support and Resistance Logistic Regression | Flux Charts',
  shortTitle: 'S&R (Logistic Regression) | Flux Charts',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
const RETEST_COOLDOWN = 3;
/** Learning rate of the model */
const LR = 0.008;
/** A level further than this many ATR from the close is hidden */
const FAR_ATR = 7;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => gt(a, b) || Math.abs(a - b) <= EPS;

interface SrLine {
  isSupport: boolean;
  level: number;
  startTime: number;
  startIndex: number;
  endTime: number;
  endIndex: number;
  timesRespected: number;
  detectedRSI: number;
  detectedBodySize: number;
  detectedByRegression: boolean;
  latestRetestIndex: number;
  detectedPrediction: number;
}

const logistic = (x1: number, x2: number, y0: number, y1: number, y2: number): number => {
  const exponent = Math.exp(-(y0 + y1 * x1 + y2 * x2));
  return 1.0 / (1.0 + exponent);
};
const loss = (y: number, p: number): number => -y * Math.log(p) - (1 - y) * Math.log(1 - p);

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportAndResistanceLogisticRegressionInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines'> & { labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.pivotLength);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const lastConfirmed = lastBarConfirmedOf(chart);

  const pivotHigh = A(ta.pivothigh(new Series(bars, (b) => b.high), len, len));
  const pivotLow = A(ta.pivotlow(new Series(bars, (b) => b.low), len, len));
  // rsi := nz(rsi, 0)
  const rsi = A(ta.rsi(new Series(bars, (b) => b.close), len)).map((v) => (isNaN(v) ? 0 : v));
  const atr = A(ta.atr(bars, len));

  const allPivots: SrLine[] = [];
  const regressionPivots: SrLine[] = [];

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const limit = <T>(list: T[]) => {
    if (list.length > MAX_OBJECTS + 5) list.splice(0, list.length - MAX_OBJECTS);
  };
  const newLabel = (l: LabelData): LabelData => {
    labels.push(l);
    limit(labels);
    return l;
  };

  const predict = (isSupport: boolean, pRsi: number, pBodySize: number): number => {
    const baseBias = 1.0;
    let rsiBias = 1.0;
    let bodySizeBias = 1.0;
    let logRes = 0.0;
    for (const cur of allPivots) {
      if (cur.isSupport !== isSupport) continue;
      const isRespected = cur.timesRespected >= cfg.targetRespects ? 1.0 : -1.0;
      const p = logistic(cur.detectedRSI, cur.detectedBodySize, baseBias, rsiBias, bodySizeBias);
      const l = loss(isRespected, p);
      rsiBias -= LR * (p + l) * cur.detectedRSI;
      bodySizeBias -= LR * (p + l) * cur.detectedBodySize;
      logRes = logistic(pRsi, pBodySize, baseBias, rsiBias, bodySizeBias);
    }
    return logRes;
  };

  const addPivot = (i: number, isSupport: boolean, level: number) => {
    const at = i - len;
    const pivotRsi = at >= 0 ? rsi[at] : NaN;
    const pivotBody = at >= 0 ? Math.abs(bars[at].close - bars[at].open) : NaN;
    const rsiBinary = gt(pivotRsi, 50) ? 1 : -1;
    const bodyBinary = gt(pivotBody, atr[i]) ? 1 : -1;
    const pivot: SrLine = {
      isSupport, level, startTime: at >= 0 ? bars[at].time : NaN, startIndex: at, endTime: NaN, endIndex: NaN,
      timesRespected: 0, detectedRSI: rsiBinary, detectedBodySize: bodyBinary, detectedByRegression: false,
      latestRetestIndex: 0, detectedPrediction: NaN,
    };
    allPivots.push(pivot);
    const predVal = predict(isSupport, rsiBinary, bodyBinary);
    if (ge(predVal, cfg.probabilityThreshold)) {
      pivot.detectedByRegression = true;
      pivot.detectedPrediction = predVal;
      regressionPivots.push(pivot);
    }
  };

  // updateSRLine(): retests and break of one level on a closed bar
  const update = (sr: SrLine, i: number) => {
    if (!isNaN(sr.endIndex)) return;
    const b = bars[i];
    const through = sr.isSupport ? lt(b.low, sr.level) : gt(b.high, sr.level);
    if (!through) return;
    const closedBack = sr.isSupport ? gt(b.close, sr.level) : lt(b.close, sr.level);
    if (closedBack) {
      if (sr.detectedByRegression && i > sr.latestRetestIndex + RETEST_COOLDOWN) {
        sr.latestRetestIndex = i;
        if (cfg.showRetests) {
          newLabel(sr.isSupport
            ? { time: b.time, price: sr.level, text: 'R', yloc: 'belowbar', textColor: cfg.textColorSupport, color: cfg.supportColor, style: 'label_up', size: 'tiny' }
            : { time: b.time, price: sr.level, text: 'R', yloc: 'abovebar', textColor: cfg.textColorResistance, color: cfg.resistanceColor, style: 'label_down', size: 'tiny' });
        }
      }
      sr.timesRespected += 1;
    } else {
      if (sr.detectedByRegression && cfg.showBreaks) {
        newLabel(sr.isSupport
          ? { time: b.time, price: sr.level, text: 'B', yloc: 'abovebar', textColor: color.white, color: color.blue, style: 'label_down', size: 'tiny' }
          : { time: b.time, price: sr.level, text: 'B', yloc: 'belowbar', textColor: color.white, color: color.blue, style: 'label_up', size: 'tiny' });
      }
      sr.endIndex = i;
      sr.endTime = b.time;
    }
  };

  for (let i = 0; i < n; i++) {
    const confirmed = i < n - 1 || lastConfirmed;
    if (!isNaN(pivotHigh[i])) addPivot(i, false, pivotHigh[i]);
    if (!isNaN(pivotLow[i])) addPivot(i, true, pivotLow[i]);
    if (confirmed) for (const sr of allPivots) update(sr, i);
  }

  // barstate.islast: the levels of the model
  if (n > 0) {
    const last = n - 1;
    const b = bars[last];
    // getTimeByBar(): the time of a closed bar; the current time for a bar that is not closed yet
    const closedBars = lastConfirmed ? n : n - 1;
    const timeByBar = (index: number) => (closedBars <= index ? b.time : bars[Math.trunc(index)].time);
    const style = cfg.lineStyle === '----' ? 'dashed' : cfg.lineStyle === '____' ? 'solid' : 'dotted';
    const labelBackground = String(color.new(color.white, 100));
    for (const sr of regressionPivots) {
      const active = isNaN(sr.endTime);
      if (cfg.hideFarLines && active && gt(Math.abs(b.close - sr.level), atr[last] * FAR_ATR)) continue;
      const endTime = active ? b.time : sr.endTime;
      const endIndex = active ? last : sr.endIndex;
      const renderColor = sr.isSupport ? cfg.supportColor : cfg.resistanceColor;
      lines.push({ time1: sr.startTime, price1: sr.level, time2: endTime, price2: sr.level, color: renderColor, width: cfg.lineWidth, style });
      limit(lines);
      if (cfg.showPredictionLabels) {
        const label = newLabel({
          time: sr.startTime, price: sr.level, text: str.tostring(sr.detectedPrediction * 100, 'percent'),
          textColor: renderColor, color: labelBackground, style: sr.isSupport ? 'label_up' : 'label_down',
        });
        // An active level has its label on the last bar, an ended one in the middle of its line
        label.time = active ? timeByBar(endIndex) : timeByBar((sr.startIndex + endIndex) / 2);
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
  };
}

export const SupportAndResistanceLogisticRegression = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
