/**
 * TDI - Traders Dynamic Index [Goldminds]
 *
 * RSI of the close; its SMA over "Band Length" +- 1.6185 standard deviations gives the upper / lower bands and their
 * middle; SMAs of the RSI over "Fast MA on RSI" and "Slow MA on RSI" are the fast and slow lines. Levels 20 / 80
 * (dashed) and 50 / 70 / 30 (dotted) with a background fill between 70 and 30. Divergences on the slow line: pivot
 * lows / highs (lookback left / right) are compared with the previous pivot (within the lookback range); regular
 * bullish (price lower low, slow line higher low), hidden bullish (price higher low, slow line lower low), regular
 * bearish (price higher high, slow line lower high) and hidden bearish (price lower high, slow line higher high) are
 * drawn at the pivot (lbR bars back) as a line from pivot to pivot and a label.
 * Alerts (alertcondition, `alerts` of the result): 'Regular Bullish', 'Hidden Bullish', 'Regular Bearish' and
 * 'Hidden Bearish', true on the bar that confirms the pivot; alert() calls (`alertCalls`, once per bar) on the same
 * bars: "Regular Bullish. Price <close>", "Hidden Bullish. Price <close>", ...
 *
 * Reference: "TDI - Traders Dynamic Index [Goldminds]" by thienlovv (TDI by Goldminds, modified by Jakub a Babo)
 */

import { ta, Series, str, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface TdiRsiInputs {
  /** RSI Period */
  rsiPeriod: number;
  /** Band Length */
  bandLength: number;
  /** Fast MA on RSI (Pine lengthrsipl) */
  fastMALength: number;
  /** Slow MA on RSI (Pine lengthtradesl) */
  slowMALength: number;
  /** Pivot Lookback Right */
  lbR: number;
  /** Pivot Lookback Left */
  lbL: number;
  /** Max of Lookback Range */
  rangeUpper: number;
  /** Min of Lookback Range */
  rangeLower: number;
  plotBull: boolean;
  plotHiddenBull: boolean;
  plotBear: boolean;
  plotHiddenBear: boolean;
}

export const defaultInputs: TdiRsiInputs = {
  rsiPeriod: 21,
  bandLength: 34,
  fastMALength: 7,
  slowMALength: 2,
  lbR: 5,
  lbL: 5,
  rangeUpper: 60,
  rangeLower: 5,
  plotBull: true,
  plotHiddenBull: false,
  plotBear: true,
  plotHiddenBear: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 21, min: 1 },
  { id: 'bandLength', type: 'int', title: 'Band Length', defval: 34, min: 1 },
  { id: 'fastMALength', type: 'int', title: 'Fast MA on RSI', defval: 7, min: 0 },
  { id: 'slowMALength', type: 'int', title: 'Slow MA on RSI', defval: 2, min: 1 },
  { id: 'lbR', type: 'int', title: 'Pivot Lookback Right', defval: 5 },
  { id: 'lbL', type: 'int', title: 'Pivot Lookback Left', defval: 5 },
  { id: 'rangeUpper', type: 'int', title: 'Max of Lookback Range', defval: 60 },
  { id: 'rangeLower', type: 'int', title: 'Min of Lookback Range', defval: 5 },
  { id: 'plotBull', type: 'bool', title: 'Plot Bullish', defval: true },
  { id: 'plotHiddenBull', type: 'bool', title: 'Plot Hidden Bullish', defval: false },
  { id: 'plotBear', type: 'bool', title: 'Plot Bearish', defval: true },
  { id: 'plotHiddenBear', type: 'bool', title: 'Plot Hidden Bearish', defval: false },
];

// Pine v4 colours
const WHITE = '#FFFFFF';
const YELLOW = '#FFEB3B';
const AQUA = '#00BCD4';
const RED = '#FF5252';
const GREEN = '#4CAF50';
const BLUE = '#2196F3';
const HIDDEN_BULL_COLOR = 'rgba(76, 175, 80, 0.2)'; // color.new(color.green, 80)
const HIDDEN_BEAR_COLOR = 'rgba(255, 82, 82, 0.2)'; // color.new(color.red, 80)
const NONE_COLOR = 'rgba(255, 255, 255, 0)'; // color.new(color.white, 100)
const HLINE_COLOR = '#787B86';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Band', color: WHITE, lineWidth: 1 },
  { id: 'plot1', title: 'Lower Band', color: WHITE, lineWidth: 1 },
  { id: 'plot2', title: 'Middle of Bands', color: YELLOW, lineWidth: 1 },
  { id: 'plot3', title: 'Slow MA', color: AQUA, lineWidth: 2 },
  { id: 'plot4', title: 'Fast MA', color: RED, lineWidth: 1 },
  // the divergence plots are coloured per point (divergence colour or transparent); offset -lbR applied in the data
  { id: 'plot5', title: 'Regular Bullish', color: BLUE, lineWidth: 2 },
  { id: 'plot6', title: 'Hidden Bullish', color: BLUE, lineWidth: 2 },
  { id: 'plot7', title: 'Regular Bearish', color: BLUE, lineWidth: 2 },
  { id: 'plot8', title: 'Hidden Bearish', color: BLUE, lineWidth: 2 },
];

/** hline(20), hline(80) (dashed, title "Level"), hline(50 / 70 / 30, dotted) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_20', price: 20, title: 'Level', color: HLINE_COLOR, linestyle: 'dashed' },
  { id: 'hline_80', price: 80, title: 'Level', color: HLINE_COLOR, linestyle: 'dashed' },
  { id: 'hline_mid', price: 50, title: 'Middle Line', color: HLINE_COLOR, linestyle: 'dotted' },
  { id: 'hline_ob', price: 70, title: 'Overbought', color: HLINE_COLOR, linestyle: 'dotted' },
  { id: 'hline_os', price: 30, title: 'Oversold', color: HLINE_COLOR, linestyle: 'dotted' },
];

/** fill(obLevel, osLevel, title = "Background", color = #9915FF, transp = 98) */
const BACKGROUND_FILL = 'rgba(153, 21, 255, 0.02)';
export const fillConfig: FillConfig[] = [
  { id: 'fill_background', plot1: 'hline_ob', plot2: 'hline_os', color: BACKGROUND_FILL, title: 'Background' },
];

export const metadata = {
  title: 'TDI - Traders Dynamic Index [Goldminds]',
  shortTitle: 'TDIGM DIV Alerts',
  overlay: false,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Regular Bullish', message: 'Long  @ {{close}}' },
  { id: 'alert1', title: 'Hidden Bullish', message: 'Long  @ {{close}}' },
  { id: 'alert2', title: 'Regular Bearish', message: 'Short  @ {{close}}' },
  { id: 'alert3', title: 'Hidden Bearish', message: 'Short  @ {{close}}' },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type PlotPoint = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<TdiRsiInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { lbR, lbL, rangeUpper, rangeLower } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const close = new Series(bars, (b) => b.close);
  const rSeries = ta.rsi(close, cfg.rsiPeriod);
  const ma = A(ta.sma(rSeries, cfg.bandLength));
  const sd = A(ta.stdev(rSeries, cfg.bandLength));
  const up = ma.map((m, i) => m + 1.6185 * sd[i]);
  const dn = ma.map((m, i) => m - 1.6185 * sd[i]);
  const mid = up.map((u, i) => (u + dn[i]) / 2);
  const fastMA = A(ta.sma(rSeries, cfg.fastMALength));
  const slowSeries = ta.sma(rSeries, cfg.slowMALength);
  const osc = A(slowSeries);

  // plFound / phFound: pivotlow / pivothigh(osc, lbL, lbR) found (on the confirmation bar, lbR bars after the pivot)
  const plFound = A(ta.pivotlow(slowSeries, lbL, lbR)).map((v) => !isNaN(v));
  const phFound = A(ta.pivothigh(slowSeries, lbL, lbR)).map((v) => !isNaN(v));

  const na = (i: number): PlotPoint => ({ time: bars[i].time as number, value: NaN });
  const regBull = bars.map((_, i) => na(i));
  const hidBull = bars.map((_, i) => na(i));
  const regBear = bars.map((_, i) => na(i));
  const hidBear = bars.map((_, i) => na(i));
  const markers: MarkerData[] = [];
  const flags: boolean[][] = [0, 1, 2, 3].map(() => new Array<boolean>(n).fill(false));
  const alertCalls: AlertCall[] = [];

  // _inRange(plFound[1]): barssince(plFound[1] == true) within [rangeLower, rangeUpper]
  let plBars = NaN;
  let phBars = NaN;
  // valuewhen(plFound, osc[lbR], 1) / valuewhen(plFound, low[lbR], 1) on a pivot bar: the previous pivot's values
  let plLastOsc = NaN, plLastLow = NaN;
  let phLastOsc = NaN, phLastHigh = NaN;

  for (let i = 0; i < n; i++) {
    if (i > 0 && plFound[i - 1]) plBars = 0;
    else if (!isNaN(plBars)) plBars++;
    if (i > 0 && phFound[i - 1]) phBars = 0;
    else if (!isNaN(phBars)) phBars++;
    const plInRange = rangeLower <= plBars && plBars <= rangeUpper;
    const phInRange = rangeLower <= phBars && phBars <= rangeUpper;
    const t = bars[i].time as number;
    const closeStr = () => str.tostring(bars[i].close);

    let bullCond = false, hiddenBullCond = false, bearCond = false, hiddenBearCond = false;
    if (plFound[i]) {
      const p = i - lbR;
      const o = osc[p];
      const low = bars[p].low;
      bullCond = cfg.plotBull && lt(low, plLastLow) && gt(o, plLastOsc) && plInRange;
      hiddenBullCond = cfg.plotHiddenBull && gt(low, plLastLow) && lt(o, plLastOsc) && plInRange;
      // plot(plFound ? osc[lbR] : na, offset = -lbR, color = bullCond ? bullColor : noneColor) (same for hidden)
      regBull[p] = { time: bars[p].time as number, value: o, color: bullCond ? GREEN : NONE_COLOR };
      hidBull[p] = { time: bars[p].time as number, value: o, color: hiddenBullCond ? HIDDEN_BULL_COLOR : NONE_COLOR };
      if (bullCond && !isNaN(o)) {
        markers.push({ time: bars[p].time as number, id: 'shape0', position: 'atPriceBottom', price: o, shape: 'labelUp',
          color: GREEN, text: ' Bull ', textColor: WHITE });
      }
      if (hiddenBullCond && !isNaN(o)) {
        markers.push({ time: bars[p].time as number, id: 'shape1', position: 'atPriceBottom', price: o, shape: 'labelUp',
          color: GREEN, text: ' H Bull ', textColor: WHITE });
      }
      plLastOsc = o;
      plLastLow = low;
    }
    if (phFound[i]) {
      const p = i - lbR;
      const o = osc[p];
      const high = bars[p].high;
      bearCond = cfg.plotBear && gt(high, phLastHigh) && lt(o, phLastOsc) && phInRange;
      hiddenBearCond = cfg.plotHiddenBear && lt(high, phLastHigh) && gt(o, phLastOsc) && phInRange;
      regBear[p] = { time: bars[p].time as number, value: o, color: bearCond ? RED : NONE_COLOR };
      hidBear[p] = { time: bars[p].time as number, value: o, color: hiddenBearCond ? HIDDEN_BEAR_COLOR : NONE_COLOR };
      if (bearCond && !isNaN(o)) {
        markers.push({ time: bars[p].time as number, id: 'shape2', position: 'atPriceTop', price: o, shape: 'labelDown',
          color: RED, text: ' Bear ', textColor: WHITE });
      }
      if (hiddenBearCond && !isNaN(o)) {
        markers.push({ time: bars[p].time as number, id: 'shape3', position: 'atPriceTop', price: o, shape: 'labelDown',
          color: RED, text: ' H Bear ', textColor: WHITE });
      }
      phLastOsc = o;
      phLastHigh = high;
    }
    flags[0][i] = bullCond;
    flags[1][i] = hiddenBullCond;
    flags[2][i] = bearCond;
    flags[3][i] = hiddenBearCond;
    // if bullCond: alert("Regular Bullish. Price " + tostring(close)) (default frequency: once per bar), ...
    if (bullCond) alertCalls.push({ time: t, message: 'Regular Bullish. Price ' + closeStr(), freq: 'once_per_bar' });
    if (hiddenBullCond) alertCalls.push({ time: t, message: 'Hidden Bullish. Price ' + closeStr(), freq: 'once_per_bar' });
    if (bearCond) alertCalls.push({ time: t, message: 'Regular Bearish. Price ' + closeStr(), freq: 'once_per_bar' });
    if (hiddenBearCond) alertCalls.push({ time: t, message: 'Hidden Bearish. Price ' + closeStr(), freq: 'once_per_bar' });
  }

  const line = (arr: number[]) => arr.map((v, i) => ({ time: bars[i].time, value: v }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(up),
      plot1: line(dn),
      plot2: line(mid),
      plot3: line(osc),
      plot4: line(fastMA),
      plot5: regBull,
      plot6: hidBull,
      plot7: regBear,
      plot8: hidBear,
    },
    hlines: hlineConfig.map((h) => ({ id: h.id, value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    fills: [{ plot1: 'hline_ob', plot2: 'hline_os', options: { title: 'Background', color: BACKGROUND_FILL } }],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
    alertCalls,
  };
}

export const TdiRsi = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hlineConfig, fillConfig, alertConditions, hasAlertFunction };
