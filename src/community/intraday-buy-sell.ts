/**
 * Intraday BUY_SELL
 *
 * Pine-faithful intraday scalping indicator with SMA, RSI-based signals,
 * conditional SMA coloring, buy/sell markers, and RSI reversal markers.
 *
 * Alerts (alertcondition, `alerts` of the result), from the original's expressions on every bar: 'Both Reversal
 * Signal' (RSI crosses under the higher level, or over the lower level on a green bar), 'Buy & Sell Signal Both',
 * 'Only Buy Signal', 'Only Sell Signal', 'Reversal from Top', 'Reversal from Down'. The SMA plot, markers, bar
 * colours and alerts all start as soon as the original's values exist (the SMA from bar smaLength - 1, the crosses
 * one bar later), as the original. SMA colour (transparency 30): yellow while the RSI is at or beyond a level, else
 * lime when the low is above the SMA, red when the high is below it, yellow otherwise.
 *
 * Reference: "Intraday BUY_SELL" (community) by nicks1008
 */

import { ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface IntradayBuySellInputs {
  rsiLength: number;
  rsiHL: number;
  rsiLL: number;
  smaLength: number;
}

export const defaultInputs: IntradayBuySellInputs = {
  rsiLength: 14,
  rsiHL: 80,
  rsiLL: 20,
  smaLength: 70,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiHL', type: 'int', title: 'RSI Higher Level', defval: 80, min: 1 },
  { id: 'rsiLL', type: 'int', title: 'RSI Lower Level', defval: 20, min: 1 },
  { id: 'smaLength', type: 'int', title: 'SMA Length', defval: 70, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'sma', title: 'SMA', color: '#2962ff', lineWidth: 1 },
];

export const metadata = {
  title: 'Intraday BUY_SELL',
  shortTitle: 'IBS',
  overlay: true,
};

export function calculate(bars: Bar[], inputs: Partial<IntradayBuySellInputs> = {}): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const { rsiLength, rsiHL, rsiLL, smaLength } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeSeries = getSourceSeries(bars, 'close');
  const rsiArr = ta.rsi(closeSeries, rsiLength).toArray();
  const smaArr = ta.sma(closeSeries, smaLength).toArray();

  // Pine float comparisons: a > b only when a - b > 1e-10 (na compares false)
  const EPS = 1e-10;
  const gt = (a: number, b: number) => a - b > EPS;
  const lt = (a: number, b: number) => b - a > EPS;

  // plot(sma1, 'SMA', color = mycolor), all at transparency 30:
  // iff_1 = high < sma1 ? red : yellow; iff_2 = low > sma1 ? lime : iff_1; mycolor = rs >= hl or rs <= ll ? yellow : iff_2
  const YELLOW = 'rgba(255,235,59,0.7)'; // color.new(color.yellow, 30)
  const LIME = 'rgba(0,230,118,0.7)'; // color.new(color.lime, 30)
  const RED = 'rgba(255,82,82,0.7)'; // color.new(color.red, 30)
  const smaPlot = bars.map((b, i) => {
    const sma = smaArr[i] ?? NaN;
    const rs = rsiArr[i] ?? NaN;
    if (isNaN(sma)) return { time: b.time, value: NaN };
    const rsOut = (!isNaN(rs) && !lt(rs, rsiHL)) || (!isNaN(rs) && !gt(rs, rsiLL));
    const color = rsOut ? YELLOW : gt(b.low, sma) ? LIME : lt(b.high, sma) ? RED : YELLOW;
    return { time: b.time, value: sma, color };
  });

  // Alert conditions, the original's expressions (na compares false):
  // hlrev_s = ta.crossunder(rs, hl); llrev_b = ta.crossover(rs, ll) and open < close
  // BUY = ta.crossover(close[1], sma1) and close[1] > open[1] and high > high[1] and close > open
  // SELL = ta.crossunder(low[1], sma1) and close[1] < open[1] and low < low[1] and close < open
  const rsN = rsiArr.map((v) => v ?? NaN);
  const smaN = smaArr.map((v) => v ?? NaN);
  const close1 = bars.map((_b, i) => (i > 0 ? bars[i - 1].close : NaN));
  const low1 = bars.map((_b, i) => (i > 0 ? bars[i - 1].low : NaN));
  const closeUp = crossedOver(close1, smaN);
  const lowDown = crossedUnder(low1, smaN);
  const rsDown = crossedUnder(rsN, rsiHL);
  const rsUp = crossedOver(rsN, rsiLL);
  const buyA: boolean[] = [];
  const sellA: boolean[] = [];
  const hlrevA: boolean[] = [];
  const llrevA: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    buyA.push(!!p && closeUp[i] && gt(p.close, p.open) && gt(b.high, p.high) && gt(b.close, b.open));
    sellA.push(!!p && lowDown[i] && lt(p.close, p.open) && lt(b.low, p.low) && lt(b.close, b.open));
    hlrevA.push(rsDown[i]);
    llrevA.push(rsUp[i] && lt(b.open, b.close));
  }

  // Markers and bar colours on every bar where the original's expressions are true (no warm-up of their own:
  // the crosses compare false while the SMA / RSI are na)
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    if (sellA[i]) markers.push({ id: 'shape0', time: t, position: 'aboveBar', shape: 'labelDown', color: 'rgba(255,82,82,0.7)', text: 'S', textColor: 'rgba(0,0,0,0.7)' });
    if (buyA[i]) markers.push({ id: 'shape1', time: t, position: 'belowBar', shape: 'labelUp', color: 'rgba(0,188,212,0.7)', text: 'B', textColor: 'rgba(0,0,0,0.7)' });
    if (hlrevA[i]) markers.push({ id: 'shape2', time: t, position: 'aboveBar', shape: 'labelDown', color: 'rgba(255,235,59,0.8)', text: '!', textColor: 'rgba(0,0,0,0.8)' });
    if (llrevA[i]) markers.push({ id: 'shape3', time: t, position: 'belowBar', shape: 'labelUp', color: 'rgba(255,235,59,0.8)', text: '!', textColor: 'rgba(0,0,0,0.8)' });
    // barcolor(BUY ? green : SELL ? maroon(30) : hlrev_s or llrev_b ? yellow : na)
    if (buyA[i]) barColors.push({ id: 'barcolor0', time: t, color: '#4CAF50' });
    else if (sellA[i]) barColors.push({ id: 'barcolor0', time: t, color: 'rgba(136,14,79,0.7)' });
    else if (hlrevA[i] || llrevA[i]) barColors.push({ id: 'barcolor0', time: t, color: '#FFEB3B' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'sma': smaPlot },
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [
      hlrevA.map((h, i) => h || llrevA[i]),
      sellA.map((s, i) => s || buyA[i]),
      buyA,
      sellA,
      hlrevA,
      llrevA,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Both Reversal Signal', message: 'Reversal Alert' },
  { id: 'alert1', title: 'Buy & Sell Signal Both', message: 'Buy/Sell Alert' },
  { id: 'alert2', title: 'Only Buy Signal', message: 'Buy Alert' },
  { id: 'alert3', title: 'Only Sell Signal', message: 'Sell Alert' },
  { id: 'alert4', title: 'Reversal from Top', message: 'Down Reversal Alert' },
  { id: 'alert5', title: 'Reversal from Down', message: 'Up Reversal Alert' },
];

export const IntradayBuySell = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
