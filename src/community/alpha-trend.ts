/**
 * AlphaTrend
 *
 * ATR-based adaptive trend indicator.
 * Uses RSI (or MFI if volume available) to determine trend direction,
 * then builds trailing stop levels that only ratchet in trend direction.
 * Alerts (alertcondition, `alerts` of the result): the original's ten conditions — potential / confirmed buy and
 * sell (AlphaTrend crossing its value 2 bars back, filtered by the bars since the opposite signal), price / candle
 * crosses of the AlphaTrend line, and the same crosses one bar later (after bar close).
 *
 * Reference: "AlphaTrend" by KivancOzbilgic
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AlphaTrendInputs {
  coeff: number;
  period: number;
  useRSI: boolean;
}

export const defaultInputs: AlphaTrendInputs = {
  coeff: 1,
  period: 14,
  useRSI: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'coeff', type: 'float', title: 'Multiplier', defval: 1, min: 0.1, step: 0.1 },
  { id: 'period', type: 'int', title: 'Common Period', defval: 14, min: 1 },
  { id: 'useRSI', type: 'bool', title: 'Use RSI instead of MFI', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'AlphaTrend', color: '#0022FC', lineWidth: 3 },
  { id: 'plot1', title: 'AlphaTrend[2]', color: '#FC0400', lineWidth: 3 },
];

export const metadata = {
  title: 'AlphaTrend',
  shortTitle: 'AT',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AlphaTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { coeff, period, useRSI } = { ...defaultInputs, ...inputs };

  const close = new Series(bars, (b) => b.close);
  const high = new Series(bars, (b) => b.high);
  const low = new Series(bars, (b) => b.low);
  const hlc3 = new Series(bars, (b) => (b.high + b.low + b.close) / 3);

  // ATR = SMA of TR (PineScript uses ta.sma(ta.tr, AP) here)
  const trSeries = ta.tr(bars);
  const atrArr = ta.sma(trSeries, period).toArray();

  // Momentum filter
  const filterArr = useRSI
    ? ta.rsi(close, period).toArray()
    : ta.mfi(hlc3, period, new Series(bars, (b) => b.volume!)).toArray();

  const lowArr = low.toArray();
  const highArr = high.toArray();

  const at: number[] = new Array(bars.length);

  for (let i = 0; i < bars.length; i++) {
    const atr = atrArr[i] ?? 0;
    const upT = (lowArr[i] ?? 0) - atr * coeff;
    const downT = (highArr[i] ?? 0) + atr * coeff;
    const filt = filterArr[i] ?? 0;
    const prev = i > 0 ? (at[i - 1] ?? 0) : 0;

    if (filt >= 50) {
      at[i] = upT < prev ? prev : upT;
    } else {
      at[i] = downT > prev ? prev : downT;
    }
  }

  const warmup = period;
  const plot0 = at.map((v, i) => ({ time: bars[i].time, value: i < warmup ? NaN : v }));
  const plot1 = at.map((_v, i) => ({ time: bars[i].time, value: i < warmup + 2 ? NaN : at[i - 2] }));

  // Markers: buy when AT crosses above AT[2], sell when AT crosses below AT[2]
  const markers: MarkerData[] = [];
  for (let i = warmup + 2; i < bars.length; i++) {
    const cur = at[i];
    const lag = at[i - 2];
    const prevCur = at[i - 1];
    const prevLag = at[i - 3];
    if (prevCur <= prevLag && cur > lag) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#26A69A', text: 'BUY' });
    } else if (prevCur >= prevLag && cur < lag) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#EF5350', text: 'SELL' });
    }
  }

  // Dynamic fill colors: green when AT > AT[2], red otherwise
  const fillColors = at.map((v, i) => {
    if (i < warmup + 2) return 'transparent';
    return v > at[i - 2] ? 'rgba(38,166,154,0.25)' : 'rgba(239,83,80,0.25)';
  });

  // Alerts on the original's AlphaTrend series: AlphaTrend := (filter >= 50) ? (upT < nz(AlphaTrend[1]) ?
  // nz(AlphaTrend[1]) : upT) : (downT > nz(AlphaTrend[1]) ? nz(AlphaTrend[1]) : downT), na while the ATR is na
  // (the line drawn above starts from the first ATR value instead of nz(na) = 0)
  const AT: number[] = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const atr = atrArr[i] ?? NaN;
    const upT = (lowArr[i] ?? NaN) - atr * coeff;
    const downT = (highArr[i] ?? NaN) + atr * coeff;
    const prev = i > 0 && !Number.isNaN(AT[i - 1]) ? AT[i - 1] : 0;
    AT[i] = (filterArr[i] ?? NaN) >= 50 ? (upT < prev ? prev : upT) : (downT > prev ? prev : downT);
  }
  const shift = <T,>(a: T[], k: number, na: T): T[] => a.map((_v, i) => (i >= k ? a[i - k] : na));
  const AT2 = shift(AT, 2, NaN);
  const closes = bars.map((b) => b.close), lows = bars.map((b) => b.low), highs = bars.map((b) => b.high);
  // ta.barssince(cond): bars since cond was last true, na (NaN) before the first time
  const barssince = (c: boolean[]) => {
    let last = -1;
    return c.map((f, i) => {
      if (f) last = i;
      return last < 0 ? NaN : i - last;
    });
  };
  const buySignalk = crossedOver(AT, AT2);
  const sellSignalk = crossedUnder(AT, AT2);
  const buy1 = shift(buySignalk, 1, false), sell1 = shift(sellSignalk, 1, false);
  const K1 = barssince(buySignalk), K2 = barssince(sellSignalk);
  const O1 = barssince(buy1), O2 = barssince(sell1);
  const O1p = shift(O1, 1, NaN), O2p = shift(O2, 1, NaN);
  const crossOverClose = crossedOver(closes, AT), crossUnderClose = crossedUnder(closes, AT);
  const priceCross = crossOverClose.map((f, i) => f || crossUnderClose[i]);
  const candleOver = crossedOver(lows, AT);
  const candleUnder = crossedUnder(highs, AT);
  const flags: boolean[][] = [
    // buySignalk and O1 > K2 / sellSignalk and O2 > K1
    buySignalk.map((f, i) => f && O1[i] > K2[i]),
    sellSignalk.map((f, i) => f && O2[i] > K1[i]),
    // buySignalk[1] and O1[1] > K2 / sellSignalk[1] and O2[1] > K1
    buy1.map((f, i) => f && O1p[i] > K2[i]),
    sell1.map((f, i) => f && O2p[i] > K1[i]),
    // ta.cross(close, AlphaTrend), ta.crossover(low, AlphaTrend), ta.crossunder(high, AlphaTrend)
    priceCross,
    candleOver,
    candleUnder,
    // the same on close[1] / low[1] / high[1] against AlphaTrend[1]: the crosses of the bar before
    shift(priceCross, 1, false),
    shift(candleOver, 1, false),
    shift(candleUnder, 1, false),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: '#2962FF' }, colors: fillColors }],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Potential BUY Alarm', message: 'BUY SIGNAL!' },
  { id: 'alert1', title: 'Potential SELL Alarm', message: 'SELL SIGNAL!' },
  { id: 'alert2', title: 'Confirmed BUY Alarm', message: 'BUY SIGNAL APPROVED!' },
  { id: 'alert3', title: 'Confirmed SELL Alarm', message: 'SELL SIGNAL APPROVED!' },
  { id: 'alert4', title: 'Price Cross Alert', message: 'Price - AlphaTrend Crossing!' },
  { id: 'alert5', title: 'Candle CrossOver Alarm', message: 'LAST BAR is ABOVE ALPHATREND' },
  { id: 'alert6', title: 'Candle CrossUnder Alarm', message: 'LAST BAR is BELOW ALPHATREND!' },
  { id: 'alert7', title: 'Price Cross Alert After Bar Close', message: 'Price - AlphaTrend Crossing!' },
  { id: 'alert8', title: 'Candle CrossOver Alarm After Bar Close', message: 'LAST BAR is ABOVE ALPHATREND!' },
  { id: 'alert9', title: 'Candle CrossUnder Alarm After Bar Close', message: 'LAST BAR is BELOW ALPHATREND!' },
];

export const AlphaTrend = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
