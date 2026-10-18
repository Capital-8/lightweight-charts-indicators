/**
 * Intraday BUY_SELL
 *
 * Pine-faithful intraday scalping indicator with SMA, RSI-based signals,
 * conditional SMA coloring, buy/sell markers, and RSI reversal markers.
 *
 * Alerts (alertcondition, `alerts` of the result), from the original's expressions on every bar: 'Both Reversal
 * Signal' (RSI crosses under the higher level, or over the lower level on a green bar), 'Buy & Sell Signal Both',
 * 'Only Buy Signal', 'Only Sell Signal', 'Reversal from Top', 'Reversal from Down'. The markers start after the
 * warm-up of the port (the longer of the two lengths, plus one bar), the alerts as soon as the original's values
 * exist.
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
  { id: 'sma', title: 'SMA', color: '#00FF00', lineWidth: 1 },
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

  const warmup = Math.max(rsiLength, smaLength);

  // Pine SMA plot with conditional color:
  // iff_1 = high < sma1 ? red : yellow
  // iff_2 = low > sma1 ? lime : iff_1
  // mycolor = rs >= hl or rs <= ll ? yellow : iff_2
  const smaPlot = bars.map((b, i) => {
    const sma = smaArr[i];
    const rs = rsiArr[i];
    if (sma == null || i < warmup) return { time: b.time, value: NaN };

    let color: string;
    if (rs != null && (rs >= rsiHL || rs <= rsiLL)) {
      color = 'rgba(255,255,0,0.7)'; // yellow with transp=30
    } else if (b.low > sma) {
      color = 'rgba(0,255,0,0.7)'; // lime with transp=30
    } else if (b.high < sma) {
      color = 'rgba(255,0,0,0.7)'; // red with transp=30
    } else {
      color = 'rgba(255,255,0,0.7)'; // yellow with transp=30
    }
    return { time: b.time, value: sma, color };
  });

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];

  for (let i = warmup + 1; i < n; i++) {
    const sma = smaArr[i] ?? 0;
    const rs = rsiArr[i] ?? 50;
    const rsPrev = rsiArr[i - 1] ?? 50;

    // Pine BUY: crossover(close[1], sma1) and close[1]>open[1] and high[0]>high[1] and close[0]>open[0]
    const prevCrossedAbove = i >= 2 && bars[i - 1].close > sma && bars[i - 2].close <= (smaArr[i - 1] ?? sma);
    const BUY = prevCrossedAbove && bars[i - 1].close > bars[i - 1].open && bars[i].high > bars[i - 1].high && bars[i].close > bars[i].open;

    // Pine SELL: crossunder(low[1], sma1) and close[1]<open[1] and low[0]<low[1] and close[0]<open[0]
    const prevCrossedBelow = i >= 2 && bars[i - 1].low < sma && bars[i - 2].low >= (smaArr[i - 1] ?? sma);
    const SELL = prevCrossedBelow && bars[i - 1].close < bars[i - 1].open && bars[i].low < bars[i - 1].low && bars[i].close < bars[i].open;

    // Pine: hlrev_s = crossunder(rs, hl)
    const hlrev_s = rsPrev >= rsiHL && rs < rsiHL;
    // Pine: llrev_b = crossover(rs, ll) and open < close
    const llrev_b = rsPrev <= rsiLL && rs > rsiLL && bars[i].open < bars[i].close;

    // BUY/SELL markers
    if (SELL) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: 'rgba(255,0,0,0.7)', text: 'S' });
    }
    if (BUY) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: 'rgba(0,255,255,0.7)', text: 'B' });
    }

    // RSI reversal markers (yellow "!")
    if (hlrev_s) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: 'rgba(255,255,0,0.8)', text: '!' });
    }
    if (llrev_b) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: 'rgba(255,255,0,0.8)', text: '!' });
    }

    // Pine barcolor: green(0) on BUY, maroon(30) on SELL, yellow(0) on reversal
    if (BUY) {
      barColors.push({ time: bars[i].time, color: '#00FF00' });
    } else if (SELL) {
      barColors.push({ time: bars[i].time, color: 'rgba(128,0,0,0.7)' });
    } else if (hlrev_s || llrev_b) {
      barColors.push({ time: bars[i].time, color: '#FFFF00' });
    }
  }

  // Alert conditions, the original's expressions (na compares false):
  // hlrev_s = ta.crossunder(rs, hl); llrev_b = ta.crossover(rs, ll) and open < close
  // BUY = ta.crossover(close[1], sma1) and close[1] > open[1] and high > high[1] and close > open
  // SELL = ta.crossunder(low[1], sma1) and close[1] < open[1] and low < low[1] and close < open
  const EPS = 1e-10;
  const gt = (a: number, b: number) => a - b > EPS;
  const lt = (a: number, b: number) => b - a > EPS;
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
