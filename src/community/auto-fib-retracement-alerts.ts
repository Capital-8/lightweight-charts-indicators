/**
 * Auto Fib Retracement Alerts
 *
 * A zigzag of pivots, Fibonacci retracement levels on its last leg, and signals when price comes back to one level.
 * - Pivots: a high (low) that no bar within `Depth / 2` bars on each side exceeds. A pivot in the direction of the
 *   last leg moves the end of the leg when it goes further. A pivot in the other direction starts a new leg when the
 *   move from the last pivot is larger than `Deviation` percent.
 * - Levels: start + (end - start) x ratio for each ratio that is switched on, drawn as horizontal lines over the last
 *   leg (extended as the inputs say) with a text (ratio and price). "Reverse" swaps start and end.
 * - Plots: the start and the end of the last leg and the target level (`retracement`), coloured only on bars where
 *   the value did not change.
 * - Signals: "Buy Retrace" when the leg goes up and the bar touches the target level from above (low at or below,
 *   high above), "Sell Retrace" for the mirror. Only the first touch since the end of the leg changed is marked.
 * - Alerts (alertcondition, `alerts` of the result): 'Buy Retrace' / 'Sell Retrace', true on the bars of each signal.
 *
 * Reference: "Auto Fib Retracement Alerts" by DevLucem
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LucemAnb
 */

import { callsite, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AutoFibRetracementAlertsInputs {
  /** Minimum move (%) for a new leg */
  devThreshold: number;
  /** Pivot depth in bars (half on each side) */
  depth: number;
  extendLeft: boolean;
  extendRight: boolean;
  /** Ratio of the target level */
  retracement: number;
  reverse: boolean;
  /** Show the price in the level texts */
  prices: boolean;
  /** Show the ratio in the level texts */
  levels: boolean;
  levelsFormat: 'Values' | 'Percent';
  sl1: boolean;
  sl2: boolean;
  sl3: boolean;
  sl4: boolean;
  sl5: boolean;
  sl6: boolean;
  sl7: boolean;
  sl8: boolean;
  sl9: boolean;
  sl10: boolean;
  sl11: boolean;
  sl12: boolean;
  sl13: boolean;
}

export const defaultInputs: AutoFibRetracementAlertsInputs = {
  devThreshold: 5,
  depth: 10,
  extendLeft: false,
  extendRight: true,
  retracement: 0.618,
  reverse: false,
  prices: true,
  levels: true,
  levelsFormat: 'Values',
  sl1: true,
  sl2: true,
  sl3: true,
  sl4: true,
  sl5: true,
  sl6: true,
  sl7: true,
  sl8: true,
  sl9: true,
  sl10: true,
  sl11: false,
  sl12: false,
  sl13: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'devThreshold', type: 'float', title: 'Deviation', defval: 5, min: 0 },
  { id: 'depth', type: 'int', title: 'Depth', defval: 10, min: 1 },
  { id: 'extendLeft', type: 'bool', title: 'Extend Lines Left', defval: false },
  { id: 'extendRight', type: 'bool', title: 'Extend Lines Right', defval: true },
  { id: 'retracement', type: 'float', title: 'retracement', defval: 0.618 },
  { id: 'reverse', type: 'bool', title: 'Reverse', defval: false },
  { id: 'prices', type: 'bool', title: 'Prices', defval: true },
  { id: 'levels', type: 'bool', title: 'Levels', defval: true },
  { id: 'levelsFormat', type: 'string', title: 'Levels Format', defval: 'Values', options: ['Values', 'Percent'] },
  { id: 'sl1', type: 'bool', title: '0', defval: true },
  { id: 'sl2', type: 'bool', title: '0.236', defval: true },
  { id: 'sl3', type: 'bool', title: '0.382', defval: true },
  { id: 'sl4', type: 'bool', title: '0.5', defval: true },
  { id: 'sl5', type: 'bool', title: '0.618', defval: true },
  { id: 'sl6', type: 'bool', title: '0.786', defval: true },
  { id: 'sl7', type: 'bool', title: '1', defval: true },
  { id: 'sl8', type: 'bool', title: '1.272', defval: true },
  { id: 'sl9', type: 'bool', title: '1.414', defval: true },
  { id: 'sl10', type: 'bool', title: '1.618', defval: true },
  { id: 'sl11', type: 'bool', title: '2.618', defval: false },
  { id: 'sl12', type: 'bool', title: '3.618', defval: false },
  { id: 'sl13', type: 'bool', title: '4.236', defval: false },
];

const RED = '#FF5252';
const LIME = '#00E676';
const PURPLE = '#9C27B0';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Start', color: RED, lineWidth: 3 },
  { id: 'plot1', title: 'End', color: LIME, lineWidth: 3 },
  { id: 'plot2', title: 'Target', color: PURPLE, lineWidth: 3 },
];

export const metadata = {
  title: 'Auto Fib Retracement Alerts',
  shortTitle: 'Auto Fib Retracement Alerts',
  overlay: true,
};

/** Ratio and colour of the 13 levels, in the order of their inputs */
const LEVELS: Array<[number, string]> = [
  [0, '#808080'], [0.236, '#a61c00'], [0.382, '#95cc28'], [0.5, '#28cc28'], [0.618, '#28cc95'], [0.786, '#2895cc'],
  [1, '#808080'], [1.272, '#82CA89'], [1.414, '#F32C42'], [1.618, '#2796ED'], [2.618, '#a61c00'], [3.618, '#9B03AE'],
  [4.236, '#E80065'],
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Leg { x1: number; y1: number; x2: number; y2: number }

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoFibRetracementAlertsInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // depth / 2 is a float division: the history offset truncates it, the loop bound keeps it
  const half = cfg.depth / 2;
  const length = Math.trunc(half);
  const l2 = half * 2;
  const shown = [
    cfg.sl1, cfg.sl2, cfg.sl3, cfg.sl4, cfg.sl5, cfg.sl6, cfg.sl7, cfg.sl8, cfg.sl9, cfg.sl10, cfg.sl11, cfg.sl12, cfg.sl13,
  ];

  // pivots(src, length, isHigh): [bar index, price] or [na, na]
  const pivot = (i: number, isHigh: boolean): [number, number] => {
    const at = (k: number) => (i - k >= 0 ? (isHigh ? bars[i - k].high : bars[i - k].low) : NaN);
    const raw = at(length);
    const c = isNaN(raw) ? 0 : raw;
    for (let k = 0; k <= l2; k++) {
      if (isHigh ? gt(at(k), c) : lt(at(k), c)) return [NaN, NaN];
    }
    return [i - length >= 0 ? i - length : NaN, c];
  };

  let lineLast: Leg | null = null;
  let iLast = 0;
  let pLast = 0;
  let isHighLast = false;

  // pivotFound(): the leg to keep (a moved or a new one), or null
  const pivotFound = (dev: number, isHigh: boolean, index: number, price: number): Leg | null => {
    if (isHighLast === isHigh && lineLast !== null) {
      if (isHighLast ? gt(price, pLast) : lt(price, pLast)) {
        lineLast.x2 = index;
        lineLast.y2 = price;
        return lineLast;
      }
      return null;
    }
    if (gt(Math.abs(dev), cfg.devThreshold)) return { x1: iLast, y1: pLast, x2: index, y2: price };
    return null;
  };

  const sinceBuy = callsite.barssince();
  const sinceSell = callsite.barssince();
  const sinceP2a = callsite.barssince();
  const sinceP2b = callsite.barssince();
  let prevSinceBuy = NaN;
  let prevSinceSell = NaN;
  let prevP1 = NaN;
  let prevP2 = NaN;
  let prevLevel = NaN;
  let p1 = NaN;
  let diff = NaN;

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];
  const plot2: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const { high, low, time } = bars[i];
    const [iH, pH] = pivot(i, true);
    const [iL, pL] = pivot(i, false);

    const isHigh = !isNaN(iH);
    const index = isHigh ? iH : iL;
    const price = isHigh ? pH : pL;
    if (!isNaN(index)) {
      // calc_dev(pLast, price)
      const dev = (100 * (price - pLast)) / price;
      const id = pivotFound(dev, isHigh, index, price);
      if (id !== null) {
        lineLast = id;
        isHighLast = isHigh;
        iLast = index;
        pLast = price;
      }
    }

    const y1 = lineLast === null ? NaN : lineLast.y1;
    p1 = cfg.reverse ? pLast : y1;
    const p2 = cfg.reverse ? y1 : pLast;
    // _draw_retracement(p1, p2)
    diff = (gt(p1, p2) ? -1 : 1) * Math.abs(p1 - p2);
    const level = p1 + diff * cfg.retracement;

    plot0.push({ time, value: p1, color: eq(p1, prevP1) ? RED : 'transparent' });
    plot1.push({ time, value: p2, color: eq(p2, prevP2) ? LIME : 'transparent' });
    plot2.push({ time, value: level, color: eq(level, prevLevel) ? PURPLE : 'transparent' });

    // `and` is not lazy in this Pine version: every barssince call runs on every bar
    const p2Changed = !isNaN(p2) && !isNaN(prevP2) && !eq(p2, prevP2);
    const buy = lt(p1, p2) && le(low, level) && gt(high, level);
    const nowBuy = sinceBuy(buy);
    const sinceChangeA = sinceP2a(p2Changed);
    const buyAlert = buy && gt(prevSinceBuy, sinceChangeA);
    const sell = gt(p1, p2) && ge(high, level) && lt(low, level);
    const nowSell = sinceSell(sell);
    const sinceChangeB = sinceP2b(p2Changed);
    const sellAlert = sell && gt(prevSinceSell, sinceChangeB);
    prevSinceBuy = nowBuy;
    prevSinceSell = nowSell;
    buyFlags.push(buyAlert);
    sellFlags.push(sellAlert);

    if (buyAlert) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: LIME, text: 'Buy Retrace', textColor: '#363A45' });
    }
    if (sellAlert) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'Sell Retrace', textColor: '#FFFFFF' });
    }

    prevP1 = p1;
    prevP2 = p2;
    prevLevel = level;
  }

  // Drawings after the last bar: the last leg, and one line and one text per level over that leg. The level objects
  // are made on the first bar and moved on each bar where a leg exists.
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  if (lineLast !== null && n > 0) {
    const leg: Leg = lineLast;
    const extend = cfg.extendLeft && cfg.extendRight ? 'both' : cfg.extendLeft ? 'left' : cfg.extendRight ? 'right' : 'none';
    const t1 = bars[leg.x1].time;
    const t2 = bars[leg.x2].time;
    LEVELS.forEach(([ratio, css], k) => {
      if (!shown[k]) return;
      const y = p1 + diff * ratio;
      if (isNaN(y)) return;
      const l = cfg.levelsFormat === 'Values' ? str.tostring(ratio) : `${str.tostring(ratio * 100)}%`;
      const text = (cfg.levels ? l : '') + (cfg.prices ? `(${str.tostring(y, '#.##')})` : '');
      lines.push({ time1: t1, price1: y, time2: t2, price2: y, color: css, extend });
      labels.push({ time: t1, price: y, text, color: '#2196F3', textColor: css, style: 'none' });
    });
    lines.push({ time1: t1, price1: leg.y1, time2: t2, price2: leg.y2, color: '#787B86', style: 'dashed' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    markers,
    lines,
    labels,
    // alertcondition(buy_alert, "Buy Retrace") / alertcondition(sell_alert, "Sell Retrace")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions (no message: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Retrace', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Sell Retrace', message: 'Alert Fired!' },
];

export const AutoFibRetracementAlerts = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
