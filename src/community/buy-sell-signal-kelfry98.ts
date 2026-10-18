/**
 * Buy Sell Signal
 *
 * A fast and a slow EMA of the close give the trend. A change of the trend (confirmed by the candle direction when
 * the option is on) opens a position: BUY when the fast EMA gets above the slow one, SELL when it gets below. The
 * stop is the low (high) of the signal bar minus (plus) the ATR times a multiplier, the final target is the risk
 * times the risk / reward ratio, with one intermediate target per whole risk unit. Shapes mark the entries, the final
 * target, the stop and the entries cancelled by an opposite signal; labels mark the intermediate targets when they
 * are reached. While a position is open, lines show the entry, the stop and the targets, and a table gives the
 * status of the position.
 * Alerts (alertcondition, `alerts` of the result): BUY / SELL signal, final take profit, stop loss and entry
 * invalidated, true on the bars of the matching shapes.
 *
 * Reference: "Buy Sell Signal" by kelfry98
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, str, barInterval,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData, LabelData, LineDrawingData, TableData, TableCellData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '🟢 BUY Signal', message: '📈 BUY on {{ticker}} | Price: {{close}}' },
  { id: 'alert1', title: '🔴 SELL Signal', message: '📉 SELL on {{ticker}} | Price: {{close}}' },
  { id: 'alert2', title: '🎯 Final Take Profit', message: '✅ Final TP hit on {{ticker}} | Price: {{close}}' },
  { id: 'alert3', title: '❌ Stop Loss', message: '🛑 SL triggered on {{ticker}} | Price: {{close}}' },
  { id: 'alert4', title: '⚠️ Entry Invalidated', message: '⚠️ Previous entry invalidated on {{ticker}} | New signal detected' },
];

export interface BuySellSignalKelfry98Inputs {
  emaFastLen: number;
  emaSlowLen: number;
  atrLen: number;
  /** Stop distance from the low / high of the signal bar, in ATR */
  atrMultSL: number;
  riskReward: number;
  /** A BUY needs a rising candle, a SELL a falling candle */
  confirmCandle: boolean;
  showEmaFast: boolean;
  emaFastColor: string;
  showEmaSlow: boolean;
  emaSlowColor: string;
}

export const defaultInputs: BuySellSignalKelfry98Inputs = {
  emaFastLen: 5,
  emaSlowLen: 13,
  atrLen: 14,
  atrMultSL: 0.5,
  riskReward: 3.0,
  confirmCandle: true,
  showEmaFast: true,
  emaFastColor: '#4CAF50',
  showEmaSlow: true,
  emaSlowColor: '#FF9800',
};

export const inputConfig: InputConfig[] = [
  { id: 'emaFastLen', type: 'int', title: 'Fast EMA', defval: 5, min: 1 },
  { id: 'emaSlowLen', type: 'int', title: 'Slow EMA', defval: 13, min: 1 },
  { id: 'atrLen', type: 'int', title: 'ATR Period', defval: 14, min: 1 },
  { id: 'atrMultSL', type: 'float', title: 'SL Multiplier (ATR)', defval: 0.5, min: 0.1, step: 0.1 },
  { id: 'riskReward', type: 'float', title: 'Risk:Reward (R:R)', defval: 3.0, min: 1.0, step: 0.5 },
  { id: 'confirmCandle', type: 'bool', title: 'Require candle confirmation', defval: true },
  { id: 'showEmaFast', type: 'bool', title: 'Show Fast EMA', defval: true, group: 'EMAs' },
  { id: 'emaFastColor', type: 'color', title: 'Fast EMA Color', defval: '#4CAF50', group: 'EMAs' },
  { id: 'showEmaSlow', type: 'bool', title: 'Show Slow EMA', defval: true, group: 'EMAs' },
  { id: 'emaSlowColor', type: 'color', title: 'Slow EMA Color', defval: '#FF9800', group: 'EMAs' },
];

// plot(..., display = showEmaFastLabel ? display.all : display.none): PlotConfig `visible` = the input id
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: '#4CAF50', lineWidth: 1, visible: 'showEmaFast' },
  { id: 'plot1', title: 'Slow EMA', color: '#FF9800', lineWidth: 1, visible: 'showEmaSlow' },
];

export const metadata = {
  title: 'Buy Sell Signal',
  shortTitle: 'Buy Sell Signal',
  overlay: true,
};

/** indicator() default: max_lines_count = 50, max_labels_count = 50 */
const MAX_LINES = 50;
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when a > b - 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(a - b > EPS);

interface LineObj {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  deleted: boolean;
}

/**
 * Live drawings in creation order. A creation that brings the count above max + 5 deletes the oldest objects until
 * max remain; an object that a `var` variable of the script still refers to is not deleted (it still counts).
 */
class Registry<T extends { deleted: boolean }> {
  live: T[] = [];

  constructor(private max: number, private held: (obj: T) => boolean) {}

  create(obj: T): T {
    this.live.push(obj);
    if (this.live.length > this.max + 5) {
      let excess = this.live.length - this.max;
      this.live = this.live.filter((o) => {
        if (excess <= 0 || this.held(o)) return true;
        excess--;
        o.deleted = true;
        return false;
      });
    }
    return obj;
  }

  delete(obj: T | null): void {
    if (!obj || obj.deleted) return;
    obj.deleted = true;
    this.live.splice(this.live.indexOf(obj), 1);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BuySellSignalKelfry98Inputs> = {},
): Omit<IndicatorResult, 'markers' | 'labels' | 'lines' | 'tables'> & {
  markers: MarkerData[]; labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[];
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeSeries = new Series(bars, (b) => b.close);

  const emaFast = A(ta.ema(closeSeries, cfg.emaFastLen));
  const emaSlow = A(ta.ema(closeSeries, cfg.emaSlowLen));
  const atr = A(ta.atr(bars, cfg.atrLen));

  // Position
  let entryPrice = NaN;
  let stopLoss = NaN;
  let takeProfitFinal = NaN;
  let inPosition = false;
  let positionType = '';
  const tpLevels: number[] = [];
  const tpHitFlags: boolean[] = [];
  let invalidatedType = '';
  const tpAlreadyMarked: boolean[] = [];
  const numTPs = Math.floor(cfg.riskReward);
  /** `for i = 1 to numTPs - 1`: counts down when numTPs - 1 is below 1 (i = 1, then 0) */
  const tpSteps: number[] = [];
  if (numTPs - 1 >= 1) for (let k = 1; k <= numTPs - 1; k++) tpSteps.push(k);
  else for (let k = 1; k >= numTPs - 1; k--) tpSteps.push(k);

  // Drawings
  let entryLine: LineObj | null = null;
  let slLine: LineObj | null = null;
  let tpLineFinal: LineObj | null = null;
  const tpIntermediateLines: LineObj[] = [];
  const lineRegistry = new Registry<LineObj>(MAX_LINES, (o) => o === entryLine || o === slLine || o === tpLineFinal);
  const labelRegistry = new Registry<{ data: LabelData; deleted: boolean }>(MAX_LABELS, () => false);
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, width: number, style: LineObj['style']) =>
    lineRegistry.create({ x1, y1, x2, y2, color: css, width, style, deleted: false });
  const setLine = (l: LineObj, x1: number, y1: number, x2: number, y2: number) => {
    l.x1 = x1;
    l.y1 = y1;
    l.x2 = x2;
    l.y2 = y2;
  };

  const white = String(color.white);
  const tpLabelColor = String(color.new(color.green, 50));
  const tpLineColor = String(color.new(color.green, 60));
  const invTextColor = String(color.rgb(97, 100, 107));
  const markers: MarkerData[] = [];
  let prevBullTrend = false;
  const flags: boolean[][] = [[], [], [], [], []];

  for (let i = 0; i < n; i++) {
    const { open, high, low, close, time } = bars[i];
    const bullTrend = gt(emaFast[i], emaSlow[i]);
    const bearTrend = lt(emaFast[i], emaSlow[i]);
    const trendChange = bullTrend !== prevBullTrend;
    prevBullTrend = bullTrend;
    const buySignal = bullTrend && trendChange && (!cfg.confirmCandle || gt(close, open));
    const sellSignal = bearTrend && trendChange && (!cfg.confirmCandle || lt(close, open));

    // Final target and stop of the open position
    let tpFinalHit = false;
    let slHit = false;
    let invalidated = false;
    if (inPosition && positionType === 'LONG') {
      if (ge(high, takeProfitFinal)) {
        tpFinalHit = true;
        inPosition = false;
        positionType = '';
      } else if (le(low, stopLoss)) {
        slHit = true;
        inPosition = false;
        positionType = '';
      }
    }
    if (inPosition && positionType === 'SHORT') {
      if (le(low, takeProfitFinal)) {
        tpFinalHit = true;
        inPosition = false;
        positionType = '';
      } else if (ge(high, stopLoss)) {
        slHit = true;
        inPosition = false;
        positionType = '';
      }
    }
    // Intermediate targets (marked once)
    if (inPosition && tpLevels.length > 0) {
      for (let k = 0; k < tpLevels.length; k++) {
        if (tpHitFlags[k]) continue;
        if (positionType === 'LONG' && ge(high, tpLevels[k])) tpHitFlags[k] = true;
        else if (positionType === 'SHORT' && le(low, tpLevels[k])) tpHitFlags[k] = true;
      }
    }

    // New entries; an open position of the other side is cancelled
    let showBuySignal = false;
    let showSellSignal = false;
    if (buySignal && (!inPosition || positionType !== 'LONG')) {
      if (inPosition && positionType === 'SHORT') {
        invalidated = true;
        invalidatedType = 'SELL';
        inPosition = false;
      }
      entryPrice = close;
      stopLoss = low - atr[i] * cfg.atrMultSL;
      const risk = entryPrice - stopLoss;
      takeProfitFinal = entryPrice + risk * cfg.riskReward;
      tpLevels.length = 0;
      tpHitFlags.length = 0;
      for (const k of tpSteps) {
        tpLevels.push(entryPrice + risk * k);
        tpHitFlags.push(false);
      }
      inPosition = true;
      positionType = 'LONG';
      showBuySignal = true;
    }
    if (sellSignal && (!inPosition || positionType !== 'SHORT')) {
      if (inPosition && positionType === 'LONG') {
        invalidated = true;
        invalidatedType = 'BUY';
        inPosition = false;
      }
      entryPrice = close;
      stopLoss = high + atr[i] * cfg.atrMultSL;
      const risk = stopLoss - entryPrice;
      takeProfitFinal = entryPrice - risk * cfg.riskReward;
      tpLevels.length = 0;
      tpHitFlags.length = 0;
      for (const k of tpSteps) {
        tpLevels.push(entryPrice - risk * k);
        tpHitFlags.push(false);
      }
      inPosition = true;
      positionType = 'SHORT';
      showSellSignal = true;
    }

    // alertcondition(showBuySignal) / (showSellSignal) / (tpFinalHit) / (slHit) / (invalidated)
    flags[0].push(showBuySignal);
    flags[1].push(showSellSignal);
    flags[2].push(tpFinalHit);
    flags[3].push(slHit);
    flags[4].push(invalidated);

    // Shapes
    if (showBuySignal) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: String(color.new(color.lime, 0)), text: 'BUY', textColor: white, size: 'small' });
    }
    if (showSellSignal) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: String(color.new(color.red, 0)), text: 'SELL', textColor: white, size: 'small' });
    }
    if (tpFinalHit) {
      markers.push({ time, position: 'aboveBar', shape: 'circle', color: String(color.new('#00ff00', 0)), text: '🎯 TP', textColor: '#00ff00', size: 'small' });
    }
    if (slHit) {
      markers.push({ time, position: 'belowBar', shape: 'xcross', color: String(color.new('#ff0000', 0)), text: 'SL', textColor: white, size: 'small' });
    }
    if (invalidated && invalidatedType === 'BUY') {
      markers.push({ time, position: 'aboveBar', shape: 'diamond', color: String(color.new(color.yellow, 0)), text: 'INV BUY', textColor: invTextColor, size: 'tiny' });
    }
    if (invalidated && invalidatedType === 'SELL') {
      markers.push({ time, position: 'aboveBar', shape: 'diamond', color: String(color.new(color.yellow, 0)), text: 'INV SELL', textColor: invTextColor, size: 'tiny' });
    }

    // Labels of the intermediate targets, once per target
    if (showBuySignal || showSellSignal) {
      tpAlreadyMarked.length = 0;
      for (let k = 0; k < tpSteps.length; k++) tpAlreadyMarked.push(false);
    }
    if (inPosition && tpHitFlags.length > 0 && tpAlreadyMarked.length > 0) {
      for (let k = 0; k < tpHitFlags.length; k++) {
        if (tpHitFlags[k] && !tpAlreadyMarked[k]) {
          labelRegistry.create({
            data: {
              time, price: high, text: 'TP' + str.tostring(k + 1), style: 'label_down', color: tpLabelColor,
              textColor: white, size: 'tiny', yloc: 'abovebar',
            },
            deleted: false,
          });
          tpAlreadyMarked[k] = true;
        }
      }
    }

    // Risk management lines
    if (inPosition && positionType !== '') {
      if (entryLine === null) entryLine = newLine(i - 10, entryPrice, i + 10, entryPrice, String(color.new(color.white, 0)), 1, 'dashed');
      else setLine(entryLine, i - 10, entryPrice, i + 10, entryPrice);
      if (slLine === null) slLine = newLine(i, stopLoss, i + 1, stopLoss, String(color.new(color.red, 0)), 2, 'solid');
      else setLine(slLine, i, stopLoss, i + 1, stopLoss);
      if (tpLineFinal === null) tpLineFinal = newLine(i, takeProfitFinal, i + 1, takeProfitFinal, String(color.new(color.green, 0)), 2, 'solid');
      else setLine(tpLineFinal, i, takeProfitFinal, i + 1, takeProfitFinal);
      if (tpIntermediateLines.length === 0 && tpLevels.length > 0) {
        for (let k = 0; k < tpLevels.length; k++) {
          tpIntermediateLines.push(newLine(i, tpLevels[k], i + 1, tpLevels[k], tpLineColor, 1, 'dotted'));
        }
      } else if (tpIntermediateLines.length > 0) {
        for (let k = 0; k < tpIntermediateLines.length; k++) {
          setLine(tpIntermediateLines[k], i, tpLevels[k], i + 1, tpLevels[k]);
        }
      }
    } else {
      if (entryLine !== null) {
        lineRegistry.delete(entryLine);
        entryLine = null;
      }
      if (slLine !== null) {
        lineRegistry.delete(slLine);
        slLine = null;
      }
      if (tpLineFinal !== null) {
        lineRegistry.delete(tpLineFinal);
        tpLineFinal = null;
      }
      if (tpIntermediateLines.length > 0) {
        for (const l of tpIntermediateLines) lineRegistry.delete(l);
        tpIntermediateLines.length = 0;
      }
    }
  }

  // Info table (filled on the last bar)
  const cells: TableCellData[] = [];
  if (n > 0) {
    const cell = (column: number, row: number, text: string, textColor: string) => {
      cells.push({ column, row, text, textColor, textSize: 'small' });
    };
    cell(0, 0, 'Status:', white);
    cell(1, 0, inPosition ? positionType : 'No Position', String(inPosition ? color.yellow : color.gray));
    if (inPosition) {
      cell(0, 1, 'Entry:', white);
      cell(1, 1, str.tostring(entryPrice, '#.##'), white);
      cell(0, 2, 'Stop Loss:', white);
      cell(1, 2, str.tostring(stopLoss, '#.##'), String(color.red));
      cell(0, 3, 'Take Profit:', white);
      cell(1, 3, str.tostring(takeProfitFinal, '#.##'), String(color.green));
      const riskVal = Math.abs(entryPrice - stopLoss);
      const rewardVal = Math.abs(takeProfitFinal - entryPrice);
      const currentRR = rewardVal / riskVal;
      cell(0, 4, 'R:R:', white);
      cell(1, 4, str.tostring(currentRR, '#.##') + ':1', String(color.orange));
    }
  }
  const table: TableData = {
    position: 'top_right', columns: 2, rows: 5, cells, bgColor: String(color.new(color.black, 85)), borderWidth: 1,
  };

  // Times of bar indexes before the first bar and after the last bar
  const interval = barInterval(bars);
  const T = (index: number) => (index < 0 ? bars[0].time + index * interval
    : index < n ? bars[index].time : bars[n - 1].time + (index - (n - 1)) * interval);
  const P = (values: number[], css: string) => values.map((value, i) => ({ time: bars[i].time, value, color: css }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P(emaFast, String(color.new(cfg.emaFastColor, 0))),
      plot1: P(emaSlow, String(color.new(cfg.emaSlowColor, 0))),
    },
    markers,
    labels: labelRegistry.live.map((l) => l.data),
    lines: lineRegistry.live.map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, width: l.width, style: l.style,
    })),
    tables: n > 0 ? [table] : [],
    alerts: alertStates(alertConditions, bars, flags),
  };
}

export const BuySellSignalKelfry98 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
