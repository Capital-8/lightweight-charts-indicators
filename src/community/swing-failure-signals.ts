/**
 * Swing Failure Signals [AlgoAlpha]
 *
 * Swing failure patterns: price sweeps a recent swing high (low) and then changes its state of delivery the other
 * way.
 * - Swings: pivot highs / lows with "Pivot Detection Length" bars on each side, kept (at most 50 per side) until a
 *   bar trades beyond them. A sweep of a swing confirmed less than "Max Pivot Point Edge" bars before marks a sweep
 *   bar and keeps the swept level (the last 3 values: confirmation bar, price, sweep bar).
 * - Change in state of delivery: each bullish candle after a bearish one opens a bearish candidate level (its open),
 *   each bearish candle after a bullish one a bullish candidate. A close beyond the newest candidate checks how far
 *   price went the other way since then against the run of opposite candles before it ("Trend Noise Filter"); a
 *   success flips the trend (-1 / +1).
 * - Signal: the trend turns up (down) less than "Patience" bars after a sweep of a swing low (high). It draws a
 *   label shape at the low (high), a dashed line over the swept level with a "$" label, and a solid line at the
 *   level of the change of delivery. Bars are coloured from a signal until the trend turns against it.
 * At most 50 lines and 50 labels are kept (indicator default).
 * Alerts (alertcondition, `alerts` of the result): 'Bullish SFP' and 'Bearish SFP', true on the bars of each signal.
 *
 * The text colour of the signal shapes is the chart foreground colour (`chart.fg_color`): it comes from the chart
 * context (fallback: the dark theme colour).
 *
 * Reference: "Swing Failure Signals [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import {
  ta, color, Series, line, label, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BarColorData, LabelData, LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { foregroundColorOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish SFP', message: 'Bullish Swing Failure Pattern Detected' },
  { id: 'alert1', title: 'Bearish SFP', message: 'Bearish Swing Failure Pattern Detected' },
];

export interface SwingFailureSignalsInputs {
  /** Pivot Detection Length */
  len: number;
  /** Max Pivot Point Edge */
  maxEdge: number;
  /** Patience */
  patience: number;
  /** Trend Noise Filter */
  tolerance: number;
  bullCol: string;
  bearCol: string;
}

export const defaultInputs: SwingFailureSignalsInputs = {
  len: 12,
  maxEdge: 50,
  patience: 7,
  tolerance: 0.7,
  bullCol: '#00FFBB',
  bearCol: '#FF1100',
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Pivot Detection Length', defval: 12, group: 'Calculations',
    tooltip: 'The lookback window of the swing high/low detection' },
  { id: 'maxEdge', type: 'int', title: 'Max Pivot Point Edge', defval: 50, group: 'Calculations',
    tooltip: 'Max history when looking for swing sweeps' },
  { id: 'patience', type: 'int', title: 'Patience', defval: 7, group: 'Calculations',
    tooltip: 'The maximum bars to wait for a change in direction after a swing has been sweeped' },
  { id: 'tolerance', type: 'float', title: 'Trend Noise Filter', defval: 0.7, group: 'Calculations',
    tooltip: 'The maximum bars to wait for a change in direction after a swing has been sweeped' },
  { id: 'bullCol', type: 'color', title: 'Bullish Colour', defval: '#00FFBB', group: 'Appearance' },
  { id: 'bearCol', type: 'color', title: 'Bearish Colour', defval: '#FF1100', group: 'Appearance' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Failure Signals [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Swing Failure',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) > EPS;

/** Maximum history offset of the original loops */
const MAX_BACK = 4999;

export function calculate(bars: Bar[], inputs: Partial<SwingFailureSignalsInputs> = {}, chart?: ChartContext): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = Math.trunc(cfg.len);
  const maxEdge = Math.trunc(cfg.maxEdge);
  const patience = Math.trunc(cfg.patience);
  const tolerance = cfg.tolerance;
  const bullCol = cfg.bullCol;
  const bearCol = cfg.bearCol;
  const fg = foregroundColorOf(chart);

  const pivh = ta.pivothigh(new Series(bars, (b) => b.high), len, len).toArray();
  const pivl = ta.pivotlow(new Series(bars, (b) => b.low), len, len).toArray();
  const close = bars.map((b) => b.close);
  const open = bars.map((b) => b.open);

  // var arrays: pairs [bar index, price] (newest first) and the swept levels [pivot bar, price, sweep bar]
  const pivhs: number[] = [];
  const pivls: number[] = [];
  const tempBull: number[] = [];
  const tempBear: number[] = [];
  const bearPotential: number[] = [];
  const bullPotential: number[] = [];
  let barSweepBull = 0;
  let barSweepBear = 0;
  let cisdLevel = NaN;
  let cisdIdx = NaN;
  let trend = 0;
  let prevTrend = NaN;
  let sfpTrendState = 0;

  resetDrawings({ line: 50, label: 50 });
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    let bullsfp = false;
    let bearsfp = false;

    const ph = pivh[i] ?? NaN;
    const pl = pivl[i] ?? NaN;
    if (!Number.isNaN(ph)) pivhs.unshift(i, ph);
    if (!Number.isNaN(pl)) pivls.unshift(i, pl);

    while (pivhs.length > 100) pivhs.length -= 2;
    while (pivls.length > 100) pivls.length -= 2;
    if (tempBull.length > 3) tempBull.length = 3;
    if (tempBear.length > 3) tempBear.length = 3;

    // Sweep detection (bearish): oldest pair first
    if (pivhs.length > 1) {
      let lvl = 0.0;
      for (let k = pivhs.length - 1; k >= 1; k -= 2) {
        if (k < pivhs.length) {
          const pivotPrice = pivhs[k];
          const pivotIdx = pivhs[k - 1];
          if (gt(b.high, pivotPrice)) {
            if (i - pivotIdx < maxEdge) {
              if (gt(pivotPrice, lvl)) lvl = pivotPrice;
              tempBear.unshift(pivotIdx, pivotPrice, i);
            }
            pivhs.splice(k - 1, 2);
          }
        }
      }
      if (ne(lvl, 0)) barSweepBear = i;
    }

    // Sweep detection (bullish)
    if (pivls.length > 1) {
      let lvl = 0.0;
      for (let k = pivls.length - 1; k >= 1; k -= 2) {
        if (k < pivls.length) {
          const pivotPrice = pivls[k];
          const pivotIdx = pivls[k - 1];
          if (lt(b.low, pivotPrice)) {
            if (i - pivotIdx < maxEdge) {
              if (lt(pivotPrice, lvl) || Math.abs(lvl) <= EPS) lvl = pivotPrice;
              tempBull.unshift(pivotIdx, pivotPrice, i);
            }
            pivls.splice(k - 1, 2);
          }
        }
      }
      if (ne(lvl, 0)) barSweepBull = i;
    }

    // Change in state of delivery: candidates [open, bar index] (newest first)
    if (i > 0 && lt(close[i - 1], open[i - 1]) && gt(b.close, b.open)) bearPotential.unshift(b.open, i);
    if (i > 0 && gt(close[i - 1], open[i - 1]) && lt(b.close, b.open)) bullPotential.unshift(b.open, i);

    /** close[k] / open[k] of the current bar (na before the first bar) */
    const c = (k: number) => (k <= i ? close[i - k] : NaN);
    const o = (k: number) => (k <= i ? open[i - k] : NaN);

    let cisd = 0;
    if (bearPotential.length > 0) {
      let inloop = true;
      while (inloop && bearPotential.length > 0) {
        const pIdx = bearPotential[1];
        const pVal = bearPotential[0];
        if (lt(b.close, pVal)) {
          let highest = 0.0;
          const lenCheck = i - Math.trunc(pIdx);
          if (lenCheck >= 0 && lenCheck < MAX_BACK) {
            for (let k = 0; k <= lenCheck; k++) if (gt(c(k), highest)) highest = c(k);
            let running = true;
            let init = lenCheck + 1;
            let top = 0.0;
            while (running && init < MAX_BACK) {
              if (lt(c(init), o(init))) {
                top = o(init);
                init += 1;
              } else {
                running = false;
              }
            }
            const denom = top - pVal;
            if (ne(denom, 0) && gt((highest - pVal) / denom, tolerance)) {
              cisdLevel = pVal;
              cisdIdx = Math.trunc(pIdx);
              bearPotential.length = 0;
              cisd = 1;
              inloop = false;
            } else {
              bearPotential.splice(0, 2);
            }
          } else {
            bearPotential.splice(0, 2);
          }
        } else {
          inloop = false;
        }
      }
    }

    if (bullPotential.length > 0) {
      let inloop = true;
      while (inloop && bullPotential.length > 0) {
        const pIdx = bullPotential[1];
        const pVal = bullPotential[0];
        if (gt(b.close, pVal)) {
          let lowest = b.close;
          const lenCheck = i - Math.trunc(pIdx);
          if (lenCheck >= 0 && lenCheck < MAX_BACK) {
            for (let k = 0; k <= lenCheck; k++) if (lt(c(k), lowest)) lowest = c(k);
            let running = true;
            let init = lenCheck + 1;
            let bottom = 0.0;
            while (running && init < MAX_BACK) {
              if (gt(c(init), o(init))) {
                bottom = o(init);
                init += 1;
              } else {
                running = false;
              }
            }
            const denom = pVal - bottom;
            if (ne(denom, 0) && gt((pVal - lowest) / denom, tolerance)) {
              cisdLevel = pVal;
              cisdIdx = Math.trunc(pIdx);
              bullPotential.length = 0;
              cisd = 2;
              inloop = false;
            } else {
              bullPotential.splice(0, 2);
            }
          } else {
            bullPotential.splice(0, 2);
          }
        } else {
          inloop = false;
        }
      }
    }

    // Signals: ta.crossover(trend, 0) / ta.crossunder(trend, 0) (trend is never na)
    trend = cisd === 1 ? -1 : cisd === 2 ? 1 : trend;
    if (prevTrend <= 0 && trend > 0 && i - barSweepBull < patience) bullsfp = true;
    if (prevTrend >= 0 && trend < 0 && i - barSweepBear < patience) bearsfp = true;
    prevTrend = trend;

    // Drawings
    const draw = (temp: number[], col: string, style: 'label_up' | 'label_down') => {
      if (temp.length >= 3) {
        const lx = Math.trunc(temp[0]);
        const ly = temp[1];
        const lineStart = lx - len;
        const lineEnd = Math.trunc(temp[2]);
        line.new(lineStart, ly, lineEnd, ly, 'bar_index', 'none', col, 'dashed', 1);
        const midX = Math.trunc((lineStart + lineEnd) / 2);
        label.new(midX, ly, '$', 'bar_index', 'price', String(color.new(col, 100)), style, col);
      }
      if (!Number.isNaN(cisdIdx)) line.new(cisdIdx, cisdLevel, i, cisdLevel, 'bar_index', 'none', col, 'solid', 1);
    };
    if (bullsfp) draw(tempBull, bullCol, 'label_up');
    if (bearsfp) draw(tempBear, bearCol, 'label_down');

    bullFlags.push(bullsfp);
    bearFlags.push(bearsfp);

    // Bar colouring
    if (bullsfp) sfpTrendState = 1;
    else if (bearsfp) sfpTrendState = -1;
    else if (sfpTrendState === 1 && trend === -1) sfpTrendState = 0;
    else if (sfpTrendState === -1 && trend === 1) sfpTrendState = 0;
    if (sfpTrendState !== 0) barColors.push({ time: b.time, color: sfpTrendState === 1 ? bullCol : bearCol });

    if (bullsfp) {
      markers.push({ time: b.time, position: 'atPriceBottom', price: b.low, shape: 'labelUp', color: bullCol,
        text: '▲', textColor: fg, size: 'small' });
    }
    if (bearsfp) {
      markers.push({ time: b.time, position: 'atPriceTop', price: b.high, shape: 'labelDown', color: bearCol,
        text: '▼', textColor: fg, size: 'small' });
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lines: LineDrawingData[] = line.all().map((l) => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
    ...(l.style === 'dashed' ? { style: 'dashed' as const } : {}),
  }));
  const labels: LabelData[] = label.all().map((l) => ({
    time: T(l.x), price: l.y, text: l.text ?? '', color: String(l.color), textColor: String(l.textcolor),
    style: l.style as 'label_up' | 'label_down',
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    lines,
    labels,
    // alertcondition(bullsfp, 'Bullish SFP') / alertcondition(bearsfp, 'Bearish SFP')
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

export const SwingFailureSignals = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
