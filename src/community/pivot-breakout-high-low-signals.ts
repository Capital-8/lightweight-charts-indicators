/**
 * Pivot Breakout High&Low Signals [JPT]
 *
 * The last pivot high and pivot low (pivot length bars on each side) are kept as levels. A close crossing above the
 * last pivot high stores it as the bullish breakout level and waits for a retest; a close crossing below the last
 * pivot low stores the bearish level. A retest is a bar whose low (bullish) or high (bearish) is within the retest
 * tolerance of the level while the close stays beyond it. With the EMA trend filter, a BUY also needs a close above
 * the EMA and a SELL a close below it. BUY / SELL triangles and a background tint mark the signals; a signal ends the
 * wait for a retest until the next breakout.
 * Alerts (alertcondition, `alerts` of the result): the BUY / SELL signals, and with 'Enable Alerts' the breakouts,
 * retests, signals, closes crossing the EMA (with the EMA filter) and new pivots.
 *
 * Reference: "Pivot Breakout High&Low Signals [JPT]" by Jos-ProTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PivotBreakoutHighLowSignalsInputs {
  /** Pivot length (bars on each side of the pivot) */
  pivotLen: number;
  /** Retest tolerance in percent of the breakout level */
  retestTolerance: number;
  /** Use the EMA trend filter (also shows the EMA) */
  emaFilter: boolean;
  /** EMA length */
  emaLength: number;
  /** Enable Alerts: the advanced alertconditions (all but 'Buy Alert' / 'Sell Alert') */
  enableAlerts: boolean;
}

export const defaultInputs: PivotBreakoutHighLowSignalsInputs = {
  pivotLen: 5,
  retestTolerance: 0.3,
  emaFilter: true,
  emaLength: 200,
  enableAlerts: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'pivotLen', type: 'int', title: 'Pivot Length', defval: 5, min: 2 },
  { id: 'retestTolerance', type: 'float', title: 'Retest Tolerance (%)', defval: 0.3, step: 0.1 },
  { id: 'emaFilter', type: 'bool', title: 'Use EMA Trend Filter', defval: true },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 200 },
  { id: 'enableAlerts', type: 'bool', title: 'Enable Alerts', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA', color: color.orange, lineWidth: 2 },
  { id: 'plot1', title: 'Last Pivot High', color: color.red, lineWidth: 2, style: 'linebr' },
  { id: 'plot2', title: 'Last Pivot Low', color: color.lime, lineWidth: 2, style: 'linebr' },
];

export const metadata = {
  title: 'Pivot Breakout High&Low Signals [JPT]',
  shortTitle: 'PBHL [JPT]',
  overlay: true,
};

// Pine operators compare floats with a tolerance of 1e-10; a comparison with na is false.
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<PivotBreakoutHighLowSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { pivotLen, emaFilter, emaLength } = cfg;
  const retestTolerance = cfg.retestTolerance / 100;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  // ema = ta.ema(close, emaLength)
  const ema = A(ta.ema(S(close), emaLength));
  // pivotHigh = ta.pivothigh(high, pivotLen, pivotLen); pivotLow = ta.pivotlow(low, pivotLen, pivotLen)
  const pivotHigh = A(ta.pivothigh(S(bars.map((b) => b.high)), pivotLen, pivotLen));
  const pivotLow = A(ta.pivotlow(S(bars.map((b) => b.low)), pivotLen, pivotLen));

  const lastHigh: number[] = new Array(n);
  const lastLow: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyBg = String(color.new(color.green, 85));
  const sellBg = String(color.new(color.red, 85));

  let lastPivotHigh = NaN; // var float lastPivotHigh
  let lastPivotLow = NaN; // var float lastPivotLow
  let bullLevel = NaN; // var float bullLevel
  let bearLevel = NaN; // var float bearLevel
  let waitingBullRetest = false;
  let waitingBearRetest = false;
  const f = {
    buy: [] as boolean[], sell: [] as boolean[], bullBo: [] as boolean[], bearBo: [] as boolean[],
    bullRt: [] as boolean[], bearRt: [] as boolean[],
  };
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!isNaN(pivotHigh[i])) lastPivotHigh = pivotHigh[i];
    if (!isNaN(pivotLow[i])) lastPivotLow = pivotLow[i];
    lastHigh[i] = lastPivotHigh;
    lastLow[i] = lastPivotLow;

    // bullBreakout = ta.crossover(close, lastPivotHigh); bearBreakout = ta.crossunder(close, lastPivotLow)
    // (exact comparisons, no 1e-10 tolerance; a tie on the previous bar counts: close[1] <= level[1]; na gives false)
    const bullBreakout = i > 0 && close[i] > lastHigh[i] && close[i - 1] <= lastHigh[i - 1];
    const bearBreakout = i > 0 && close[i] < lastLow[i] && close[i - 1] >= lastLow[i - 1];
    if (bullBreakout) {
      bullLevel = lastPivotHigh;
      waitingBullRetest = true;
    }
    if (bearBreakout) {
      bearLevel = lastPivotLow;
      waitingBearRetest = true;
    }

    // bullRetest = waiting and low <= level * (1 + tol) and low >= level * (1 - tol) and close > level
    const bullRetest = waitingBullRetest && le(b.low, bullLevel * (1 + retestTolerance))
      && ge(b.low, bullLevel * (1 - retestTolerance)) && gt(b.close, bullLevel);
    // bearRetest = waiting and high >= level * (1 - tol) and high <= level * (1 + tol) and close < level
    const bearRetest = waitingBearRetest && ge(b.high, bearLevel * (1 - retestTolerance))
      && le(b.high, bearLevel * (1 + retestTolerance)) && gt(bearLevel, b.close);

    // buySignal = bullRetest and (not emaFilter or close > ema); sellSignal = bearRetest and (not emaFilter or close < ema)
    const buySignal = bullRetest && (!emaFilter || gt(b.close, ema[i]));
    const sellSignal = bearRetest && (!emaFilter || gt(ema[i], b.close));
    if (buySignal) waitingBullRetest = false;
    if (sellSignal) waitingBearRetest = false;
    f.buy.push(buySignal); f.sell.push(sellSignal);
    f.bullBo.push(bullBreakout); f.bearBo.push(bearBreakout);
    f.bullRt.push(bullRetest); f.bearRt.push(bearRetest);

    // plotshape(buySignal, 'BUY', location.belowbar, shape.triangleup, color.lime, size.large, text 'BUY')
    // plotshape(sellSignal, 'SELL', location.abovebar, shape.triangledown, color.red, size.large, text 'SELL')
    // (Pine default text colour: color.blue)
    if (buySignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, text: 'BUY',
        textColor: color.blue, size: 'large' });
    }
    if (sellSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, text: 'SELL',
        textColor: color.blue, size: 'large' });
    }
    // bgcolor(buySignal ? color.new(color.green, 85) : na); bgcolor(sellSignal ? color.new(color.red, 85) : na)
    if (buySignal) bgColors.push({ time: b.time, color: buyBg });
    if (sellSignal) bgColors.push({ time: b.time, color: sellBg });
  }

  // bullTrendChange = ta.crossover(close, ema); bearTrendChange = ta.crossunder(close, ema)
  const bullTrend = crossedOver(close, ema);
  const bearTrend = crossedUnder(close, ema);
  const on = cfg.enableAlerts;
  const flags = [
    f.buy, f.sell,
    f.bullBo.map((v) => on && v), f.bearBo.map((v) => on && v),
    f.bullRt.map((v) => on && v), f.bearRt.map((v) => on && v),
    f.buy.map((v) => on && v), f.sell.map((v) => on && v),
    bullTrend.map((v) => on && emaFilter && v), bearTrend.map((v) => on && emaFilter && v),
    pivotHigh.map((v) => on && !isNaN(v)), pivotLow.map((v) => on && !isNaN(v)),
  ];
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(emaFilter ? ema : na, color = color.orange, linewidth = 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: emaFilter ? ema[i] : NaN })),
      // plot(lastPivotHigh, color = color.red, linewidth = 2, style = plot.style_linebr)
      plot1: bars.map((b, i) => ({ time: b.time, value: lastHigh[i] })),
      // plot(lastPivotLow, color = color.lime, linewidth = 2, style = plot.style_linebr)
      plot2: bars.map((b, i) => ({ time: b.time, value: lastLow[i] })),
    },
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Alert', message: 'Pivot Breakout Retest BUY' },
  { id: 'alert1', title: 'Sell Alert', message: 'Pivot Breakout Retest SELL' },
  { id: 'alert2', title: 'Bullish Pivot Breakout', message: '🟢 [JPT] Bullish Pivot Breakout detected.\nPrice has broken above the previous Pivot High.' },
  { id: 'alert3', title: 'Bearish Pivot Breakout', message: '🔴 [JPT] Bearish Pivot Breakout detected.\nPrice has broken below the previous Pivot Low.' },
  { id: 'alert4', title: 'Bullish Retest Confirmed', message: '🟢 [JPT] Bullish Retest confirmed.\nPrice successfully retested the breakout level.' },
  { id: 'alert5', title: 'Bearish Retest Confirmed', message: '🔴 [JPT] Bearish Retest confirmed.\nPrice successfully retested the breakout level.' },
  { id: 'alert6', title: 'BUY Signal', message: '🚀 [JPT] BUY Signal\nPivot Breakout + Retest + EMA confirmation.' },
  { id: 'alert7', title: 'SELL Signal', message: '📉 [JPT] SELL Signal\nPivot Breakdown + Retest + EMA confirmation.' },
  { id: 'alert8', title: 'Bullish Trend Change', message: '📈 [JPT] Price crossed ABOVE the EMA.\nBullish trend bias detected.' },
  { id: 'alert9', title: 'Bearish Trend Change', message: '📉 [JPT] Price crossed BELOW the EMA.\nBearish trend bias detected.' },
  { id: 'alert10', title: 'New Pivot High', message: '🔺 [JPT] New Pivot High confirmed.' },
  { id: 'alert11', title: 'New Pivot Low', message: '🔻 [JPT] New Pivot Low confirmed.' },
];

export const PivotBreakoutHighLowSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
