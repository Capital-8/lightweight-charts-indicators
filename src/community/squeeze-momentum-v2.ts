/**
 * Squeeze Momentum V2 with Divergence
 *
 * Squeeze momentum after LazyBear: Bollinger Bands (SMA(close, BB Length) +- BB MultFactor * stdev) against Keltner
 * Channels (SMA(close, KC Length) +- KC MultFactor * SMA(true range or high - low, KC Length)). Squeeze dots on the
 * zero line: black while the bands are inside the channel (squeeze on), gray while they are outside (squeeze off),
 * blue otherwise. Momentum = linreg(close - avg(avg(highest high, lowest low), SMA(close)), KC Length, 0) as columns
 * (bright / faded green above 0 when rising / not, bright / faded red below 0 when falling / not), a gradient fill
 * between the momentum and the zero line, and a signal line (SMA of the momentum over Signal Length).
 *
 * Divergences on the pivots of the momentum (Pivot Lookback Left / Right): on a new pivot, the nearest earlier pivot
 * Min to Max Lookback Range bars back that matches a rule makes the divergence: regular bullish (higher momentum low, lower price low), regular bearish (lower momentum high,
 * higher price high), hidden bullish (lower momentum low, higher price low) and hidden bearish (higher momentum high,
 * lower price high). In the pane: labels at the pivot (shapes "Bull" / "Bear" / "H-Bull" / "H-Bear") and lines between
 * the two momentum pivots of a regular divergence; on the price chart: lines between the two price pivots of a
 * regular divergence and text labels for all four. At most 50 lines and 50 labels are kept (the default limits).
 * Alert conditions: regular bullish / bearish divergence, squeeze started (squeeze on), squeeze released (squeeze off).
 *
 * Chart context: `chart.fg_color` (zero line, signal, shape texts), `chart.bg_color` (the transparent end of the fill).
 *
 * Reference: "Squeeze Momentum V2 with Divergence" by JOEXYZzz (based on "Squeeze Momentum Indicator" by LazyBear)
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, LabelData, LineDrawingData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { foregroundColorOf, backgroundColorOf, type ChartContext } from '../chart-context';

export interface SqueezeMomentumV2Inputs {
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMult: number;
  useTrueRange: boolean;
  signalPeriod: number;
  showDiv: boolean;
  showPriceDiv: boolean;
  lookbackRight: number;
  lookbackLeft: number;
  rangeUpper: number;
  rangeLower: number;
}

export const defaultInputs: SqueezeMomentumV2Inputs = {
  bbLength: 20,
  bbMult: 2.0,
  kcLength: 20,
  kcMult: 1.5,
  useTrueRange: true,
  signalPeriod: 5,
  showDiv: true,
  showPriceDiv: true,
  lookbackRight: 5,
  lookbackLeft: 5,
  rangeUpper: 60,
  rangeLower: 5,
};

const G_SQZ = 'Squeeze Settings';
const G_SIG = 'Signal Settings';
const G_DIV = 'Divergence Settings';

export const inputConfig: InputConfig[] = [
  { id: 'bbLength', type: 'int', title: 'BB Length', defval: 20, min: 1, group: G_SQZ },
  { id: 'bbMult', type: 'float', title: 'BB MultFactor', defval: 2.0, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'kcLength', type: 'int', title: 'KC Length', defval: 20, min: 1, group: G_SQZ },
  { id: 'kcMult', type: 'float', title: 'KC MultFactor', defval: 1.5, min: 0.1, step: 0.1, group: G_SQZ },
  { id: 'useTrueRange', type: 'bool', title: 'Use TrueRange (KC)', defval: true, group: G_SQZ },
  { id: 'signalPeriod', type: 'int', title: 'Signal Length', defval: 5, min: 1, group: G_SIG },
  { id: 'showDiv', type: 'bool', title: 'Show Divergences in Pane', defval: true, group: G_DIV },
  { id: 'showPriceDiv', type: 'bool', title: 'Show Divergences on Price Chart', defval: true, group: G_DIV },
  { id: 'lookbackRight', type: 'int', title: 'Pivot Lookback Right', defval: 5, min: 1, group: G_DIV, tooltip: 'Number of bars to the right of a pivot' },
  { id: 'lookbackLeft', type: 'int', title: 'Pivot Lookback Left', defval: 5, min: 1, group: G_DIV, tooltip: 'Number of bars to the left of a pivot' },
  { id: 'rangeUpper', type: 'int', title: 'Max Lookback Range', defval: 60, min: 1, group: G_DIV, tooltip: 'Maximum bars to look back for divergence' },
  { id: 'rangeLower', type: 'int', title: 'Min Lookback Range', defval: 5, min: 1, group: G_DIV, tooltip: 'Minimum bars to look back for divergence' },
];

const BULL_COLOR = '#089981';
const BEAR_COLOR = '#f23645';
const SQZ_ON_COLOR = '#000000';
const SQZ_OFF_COLOR = '#787b86';
const NO_SQZ_COLOR = '#2196f3';

/** Chart foreground colour without a chart context (the result follows the chart context) */
const FG = foregroundColorOf();

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Squeeze Dots', color: NO_SQZ_COLOR, lineWidth: 2, style: 'cross' },
  { id: 'plot1', title: 'Momentum', color: BULL_COLOR, lineWidth: 2, style: 'columns' },
  { id: 'plot2', title: 'Zero Line', color: String(color.new(FG, 80)), lineWidth: 1 },
  { id: 'plot3', title: 'Signal', color: String(color.new(FG, 30)), lineWidth: 1 },
];

/** fill(pVal, pZero, ...) gradient between the momentum and the zero line */
export const fillConfig: FillConfig[] = [
  { id: 'fill0', plot1: 'plot1', plot2: 'plot2', title: 'Plots Background' },
];

export const metadata = {
  title: 'Squeeze Momentum V2 with Divergence',
  shortTitle: 'SQZ Divergence',
  overlay: false,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish Divergence', message: 'Bullish divergence detected on SQZ' },
  { id: 'alert1', title: 'Regular Bearish Divergence', message: 'Bearish divergence detected on SQZ' },
  { id: 'alert2', title: 'Squeeze Started', message: 'BB has entered KC' },
  { id: 'alert3', title: 'Squeeze Released', message: 'BB has exited KC' },
];

/** indicator() without max_lines_count / max_labels_count: the default 50 of each */
const MAX_LINES = 50;
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SqueezeMomentumV2Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[];
  labels: LabelData[];
  lines: LineDrawingData[];
  alerts: AlertConditionState[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const num = (v: number | null | undefined) => (v == null ? NaN : v);
  const fg = foregroundColorOf(chart);
  const bgClear = String(color.new(backgroundColorOf(chart), 100));

  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);

  // BB: basis = ta.sma(source, lengthBB); dev = multBB * ta.stdev(source, lengthBB)
  const basis = ta.sma(close, cfg.bbLength).toArray().map(num);
  const dev = ta.stdev(close, cfg.bbLength).toArray().map((v) => num(v) * cfg.bbMult);
  // KC: ma = ta.sma(source, lengthKC); trRange = useTrueRange ? ta.tr : high - low; rangema = ta.sma(trRange, lengthKC)
  const ma = ta.sma(close, cfg.kcLength).toArray().map(num);
  const trRange = cfg.useTrueRange ? ta.tr(bars, false) : high.sub(low);
  const rangema = ta.sma(trRange, cfg.kcLength).toArray().map(num);

  const sqzOn: boolean[] = [];
  const sqzOff: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const upperBB = basis[i] + dev[i];
    const lowerBB = basis[i] - dev[i];
    const upperKC = ma[i] + rangema[i] * cfg.kcMult;
    const lowerKC = ma[i] - rangema[i] * cfg.kcMult;
    sqzOn.push(gt(lowerBB, lowerKC) && lt(upperBB, upperKC));
    sqzOff.push(lt(lowerBB, lowerKC) && gt(upperBB, upperKC));
  }

  // val = ta.linreg(source - math.avg(math.avg(highestHigh, lowestLow), ta.sma(close, lengthKC)), lengthKC, 0)
  const hh = ta.highest(high, cfg.kcLength);
  const ll = ta.lowest(low, cfg.kcLength);
  const avgValue = hh.add(ll).div(2).add(ta.sma(close, cfg.kcLength)).div(2);
  const valSeries = ta.linreg(close.sub(avgValue), cfg.kcLength, 0);
  const val = valSeries.toArray().map(num);
  // sig = ta.sma(val, signalPeriod)
  const sig = ta.sma(Series.fromArray(bars, val), cfg.signalPeriod).toArray().map(num);

  // pTop = ta.pivothigh(val, lookbackLeft, lookbackRight); pBot = ta.pivotlow(val, lookbackLeft, lookbackRight)
  const valForPivots = Series.fromArray(bars, val);
  const pTop = ta.pivothigh(valForPivots, cfg.lookbackLeft, cfg.lookbackRight).toArray().map(num);
  const pBot = ta.pivotlow(valForPivots, cfg.lookbackLeft, cfg.lookbackRight).toArray().map(num);

  const at = (arr: number[], i: number) => (i >= 0 && i < arr.length ? arr[i] : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const time = (i: number) => bars[i].time as number;

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const addLine = (l: LineDrawingData) => {
    lines.push(l);
    if (lines.length > MAX_LINES) lines.shift();
  };
  const addLabel = (l: LabelData) => {
    labels.push(l);
    if (labels.length > MAX_LABELS) labels.shift();
  };

  const bullClear = String(color.new(BULL_COLOR, 100));
  const bearClear = String(color.new(BEAR_COLOR, 100));
  const bullFaded = String(color.new(BULL_COLOR, 50));
  const bearFaded = String(color.new(BEAR_COLOR, 50));

  const markers: MarkerData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];
  const rb = cfg.lookbackRight;

  for (let i = 0; i < n; i++) {
    const p = i - rb; // bar_index[lookbackRight]
    let bullDiv = false;
    let bearDiv = false;
    let hiddenBullDiv = false;
    let hiddenBearDiv = false;

    // Regular Bullish
    if (!isNaN(pBot[i])) {
      for (let k = cfg.rangeLower; k <= cfg.rangeUpper; k++) {
        const q = i - k - rb; // bar_index[i + lookbackRight]
        if (!isNaN(at(pBot, i - k)) && gt(at(val, p), at(val, q)) && lt(L(p), L(q))) {
          bullDiv = true;
          if (cfg.showDiv) addLine({ time1: time(q), price1: val[q], time2: time(p), price2: val[p], color: BULL_COLOR, width: 2 });
          if (cfg.showPriceDiv) {
            addLine({ time1: time(q), price1: L(q), time2: time(p), price2: L(p), color: BULL_COLOR, width: 2, forceOverlay: true });
            addLabel({ time: time(p), price: L(p), text: 'Bull', color: bullClear, textColor: BULL_COLOR, style: 'label_up', size: 'small', forceOverlay: true });
          }
          break;
        }
      }
    }

    // Regular Bearish
    if (!isNaN(pTop[i])) {
      for (let k = cfg.rangeLower; k <= cfg.rangeUpper; k++) {
        const q = i - k - rb;
        if (!isNaN(at(pTop, i - k)) && lt(at(val, p), at(val, q)) && gt(H(p), H(q))) {
          bearDiv = true;
          if (cfg.showDiv) addLine({ time1: time(q), price1: val[q], time2: time(p), price2: val[p], color: BEAR_COLOR, width: 2 });
          if (cfg.showPriceDiv) {
            addLine({ time1: time(q), price1: H(q), time2: time(p), price2: H(p), color: BEAR_COLOR, width: 2, forceOverlay: true });
            addLabel({ time: time(p), price: H(p), text: 'Bear', color: bearClear, textColor: BEAR_COLOR, style: 'label_down', size: 'small', forceOverlay: true });
          }
          break;
        }
      }
    }

    // Hidden Bullish
    if (!isNaN(pBot[i])) {
      for (let k = cfg.rangeLower; k <= cfg.rangeUpper; k++) {
        const q = i - k - rb;
        if (!isNaN(at(pBot, i - k)) && lt(at(val, p), at(val, q)) && gt(L(p), L(q))) {
          hiddenBullDiv = true;
          if (cfg.showPriceDiv) {
            addLabel({ time: time(p), price: L(p), text: 'H-Bull', color: bullClear, textColor: BULL_COLOR, style: 'label_up', size: 'tiny', forceOverlay: true });
          }
          break;
        }
      }
    }

    // Hidden Bearish
    if (!isNaN(pTop[i])) {
      for (let k = cfg.rangeLower; k <= cfg.rangeUpper; k++) {
        const q = i - k - rb;
        if (!isNaN(at(pTop, i - k)) && gt(at(val, p), at(val, q)) && lt(H(p), H(q))) {
          hiddenBearDiv = true;
          if (cfg.showPriceDiv) {
            addLabel({ time: time(p), price: H(p), text: 'H-Bear', color: bearClear, textColor: BEAR_COLOR, style: 'label_down', size: 'tiny', forceOverlay: true });
          }
          break;
        }
      }
    }

    bullFlags.push(bullDiv);
    bearFlags.push(bearDiv);

    // plotshape(showDiv and <cond> ? val[lookbackRight] : na, ..., location.absolute, offset = -lookbackRight,
    //   textcolor = chart.fg_color, size = size.tiny): drawn on bar i - lookbackRight at val[lookbackRight]
    if (cfg.showDiv && p >= 0 && !isNaN(val[p])) {
      const t = time(p);
      const y = val[p];
      if (bullDiv) markers.push({ id: 'shape0', time: t, position: 'atPriceBottom', price: y, shape: 'labelUp', color: BULL_COLOR, text: 'Bull', textColor: fg, size: 'tiny' });
      if (bearDiv) markers.push({ id: 'shape1', time: t, position: 'atPriceTop', price: y, shape: 'labelDown', color: BEAR_COLOR, text: 'Bear', textColor: fg, size: 'tiny' });
      if (hiddenBullDiv) markers.push({ id: 'shape2', time: t, position: 'atPriceMiddle', price: y, shape: 'diamond', color: BULL_COLOR, text: 'H-Bull', textColor: fg, size: 'tiny' });
      if (hiddenBearDiv) markers.push({ id: 'shape3', time: t, position: 'atPriceMiddle', price: y, shape: 'diamond', color: BEAR_COLOR, text: 'H-Bear', textColor: fg, size: 'tiny' });
    }
  }

  // Plots
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];
  const plot2: { time: number; value: number; color: string }[] = [];
  const plot3: { time: number; value: number; color: string }[] = [];
  const zeroColor = String(color.new(fg, 80));
  const sigColor = String(color.new(fg, 30));
  const topValue: number[] = [];
  const bottomValue: number[] = [];
  const topColor: string[] = [];
  const bottomColor: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = time(i);
    const v = val[i];
    const prev = i > 0 && !isNaN(val[i - 1]) ? val[i - 1] : 0; // nz(val[1])
    // valColor = val > 0 ? (val > nz(val[1]) ? BULL : color.new(BULL, 50)) : (val < nz(val[1]) ? BEAR : color.new(BEAR, 50))
    const valColor = gt(v, 0) ? (gt(v, prev) ? BULL_COLOR : bullFaded) : (lt(v, prev) ? BEAR_COLOR : bearFaded);
    // sqzColor = noSqz ? NO_SQZ_COLOR : sqzOn ? SQZ_ON_COLOR : SQZ_OFF_COLOR
    const noSqz = !sqzOn[i] && !sqzOff[i];
    const sqzColor = noSqz ? NO_SQZ_COLOR : sqzOn[i] ? SQZ_ON_COLOR : SQZ_OFF_COLOR;
    // plot(0, "Squeeze Dots", sqzColor, 2, plot.style_cross)
    plot0.push({ time: t, value: 0, color: sqzColor });
    // plot(val, "Momentum", valColor, 2, plot.style_columns)
    plot1.push({ time: t, value: v, color: valColor });
    // plot(0, "Zero Line", color.new(chart.fg_color, 80))
    plot2.push({ time: t, value: 0, color: zeroColor });
    // plot(sig, "Signal", color.new(chart.fg_color, 30), 1)
    plot3.push({ time: t, value: sig[i], color: sigColor });
    // fill(pVal, pZero, math.max(val, 0), math.min(val, 0), val > 0 ? BULL : bg clear, val > 0 ? bg clear : BEAR)
    topValue.push(isNaN(v) ? NaN : Math.max(v, 0));
    bottomValue.push(isNaN(v) ? NaN : Math.min(v, 0));
    topColor.push(gt(v, 0) ? BULL_COLOR : bgClear);
    bottomColor.push(gt(v, 0) ? bgClear : BEAR_COLOR);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    fills: [
      { id: 'fill0', plot1: 'plot1', plot2: 'plot2', options: { title: 'Plots Background' },
        gradient: { topValue, bottomValue, topColor, bottomColor } },
    ],
    markers,
    labels,
    lines,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags, sqzOn, sqzOff]),
  };
}

export const SqueezeMomentumV2 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, fillConfig, alertConditions };
