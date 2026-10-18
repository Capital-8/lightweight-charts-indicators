/**
 * Standardized MACD Heikin-Ashi Transformed
 *
 * Standardizes MACD by dividing by ATR-like range, then converts to Heikin-Ashi
 * candles with double HA transform. Signal line + histogram + OB/OS markers.
 * Alerts (alertcondition, `alerts` of the result): Overbought / Oversold (HA close crossing its open beyond the
 * reversion threshold), Midline Crossover / Crossunder (HA close crossing 0), Positive / Negative Heikin-Ashi (the
 * crosses inside the threshold), MACD Bull / Bear Cross (HA close crossing the signal). alert() calls (`alertCalls`,
 * once per bar close): on each bar where one of them is true, the message of the first true one in that order.
 *
 * Reference: "Standardized MACD Heikin-Ashi Transformed" by EliCobra
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, BarColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface StandardizedMacdHAInputs {
  src: string;
  fast: number;
  slow: number;
  signalSrc: string;
  signalLength: number;
  reversionThreshold: number;
}

export const defaultInputs: StandardizedMacdHAInputs = {
  src: 'close',
  fast: 12,
  slow: 26,
  signalSrc: 'close',
  signalLength: 9,
  reversionThreshold: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fast', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slow', type: 'int', title: 'Slow Length', defval: 26, min: 1 },
  { id: 'signalSrc', type: 'string', title: 'Signal Source', defval: 'close', options: ['open', 'high', 'low', 'close'] },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9, min: 1 },
  { id: 'reversionThreshold', type: 'float', title: 'Reversion Threshold', defval: 100, min: 0, step: 10 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'signal', title: 'Signal', color: '#787B86', lineWidth: 1 },
  { id: 'histogram', title: 'Histogram', color: '#8ac3f5', lineWidth: 2, style: 'histogram' },
];

export const plotCandleConfig = [
  { id: 'candle0', title: 'HA MACD Candle' },
];

export const metadata = {
  title: 'Standardized MACD HA',
  shortTitle: 'SMACDHA',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<StandardizedMacdHAInputs> = {}): Omit<IndicatorResult, 'markers'> & { plotCandles: Record<string, PlotCandleData[]>; markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const { src, fast, slow, signalSrc, signalLength, reversionThreshold } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // Source series
  const srcSeries = new Series(bars, (b) => {
    if (src === 'open') return b.open;
    if (src === 'high') return b.high;
    if (src === 'low') return b.low;
    return b.close;
  });

  // Range series (high - low)
  const rangeSeries = new Series(bars, (b) => b.high - b.low);

  // Standardized MACD = (EMA(src, fast) - EMA(src, slow)) / EMA(range, slow) * 100
  const emaFast = ta.ema(srcSeries, fast).toArray();
  const emaSlow = ta.ema(srcSeries, slow).toArray();
  const emaRange = ta.ema(rangeSeries, slow).toArray();

  const macdArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = emaFast[i] ?? NaN;
    const s = emaSlow[i] ?? NaN;
    const r = emaRange[i] ?? NaN;
    if (isNaN(f) || isNaN(s) || isNaN(r) || r === 0) {
      macdArr[i] = NaN;
    } else {
      macdArr[i] = ((f - s) / r) * 100;
    }
  }

  // First HA transform on MACD values
  const ha1Close: number[] = new Array(n);
  const ha1Open: number[] = new Array(n);
  const ha1High: number[] = new Array(n);
  const ha1Low: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const m = macdArr[i];
    if (isNaN(m)) {
      ha1Close[i] = NaN;
      ha1Open[i] = NaN;
      ha1High[i] = NaN;
      ha1Low[i] = NaN;
      continue;
    }

    ha1Close[i] = m;

    if (i === 0 || isNaN(ha1Open[i - 1])) {
      ha1Open[i] = m;
    } else {
      ha1Open[i] = (ha1Open[i - 1] + ha1Close[i - 1]) / 2;
    }

    ha1High[i] = Math.max(m, ha1Open[i], ha1Close[i]);
    ha1Low[i] = Math.min(m, ha1Open[i], ha1Close[i]);
  }

  // Second HA transform
  const ha2Close: number[] = new Array(n);
  const ha2Open: number[] = new Array(n);
  const ha2High: number[] = new Array(n);
  const ha2Low: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    if (isNaN(ha1Close[i])) {
      ha2Close[i] = NaN;
      ha2Open[i] = NaN;
      ha2High[i] = NaN;
      ha2Low[i] = NaN;
      continue;
    }

    // HA close = avg of first HA OHLC
    ha2Close[i] = (ha1Open[i] + ha1High[i] + ha1Low[i] + ha1Close[i]) / 4;

    if (i === 0 || isNaN(ha2Open[i - 1])) {
      ha2Open[i] = (ha1Open[i] + ha1Close[i]) / 2;
    } else {
      ha2Open[i] = (ha2Open[i - 1] + ha2Close[i - 1]) / 2;
    }

    ha2High[i] = Math.max(ha1High[i], ha2Open[i], ha2Close[i]);
    ha2Low[i] = Math.min(ha1Low[i], ha2Open[i], ha2Close[i]);
  }

  // Signal source from HA candle
  const sigSrcArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (signalSrc === 'open') sigSrcArr[i] = ha2Open[i];
    else if (signalSrc === 'high') sigSrcArr[i] = ha2High[i];
    else if (signalSrc === 'low') sigSrcArr[i] = ha2Low[i];
    else sigSrcArr[i] = ha2Close[i];
  }

  // Signal = EMA of signal source
  const sigSeries = new Series(bars, (_b, i) => sigSrcArr[i]);
  const signalArr = ta.ema(sigSeries, signalLength).toArray();

  // Histogram = HA close - signal
  const histArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const c = ha2Close[i];
    const s = signalArr[i] ?? NaN;
    histArr[i] = isNaN(c) || isNaN(s) ? NaN : c - s;
  }

  const warmup = slow;

  // Plot candles
  const upColor = '#00bcd4';
  const downColor = '#fc1f1f';

  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    if (i < warmup || isNaN(ha2Close[i])) {
      candles.push({ time: bars[i].time as number, open: NaN, high: NaN, low: NaN, close: NaN });
      continue;
    }
    const col = ha2Close[i] >= ha2Open[i] ? upColor : downColor;
    candles.push({
      time: bars[i].time as number,
      open: ha2Open[i],
      high: ha2High[i],
      low: ha2Low[i],
      close: ha2Close[i],
      color: col,
      borderColor: col,
      wickColor: col,
    });
  }

  // Signal plot
  const signalPlot = signalArr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup || isNaN(v ?? NaN) ? NaN : v!,
  }));

  // Histogram plot with colors
  const histPlot = histArr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup || isNaN(v) ? NaN : v,
    color: v >= 0 ? '#8ac3f5' : '#ffa7b6',
  }));

  // Markers: OB when HA close crosses under HA open AND HA high > threshold
  // OS when HA close crosses over HA open AND HA low < -threshold
  const markers: MarkerData[] = [];
  for (let i = warmup + 1; i < n; i++) {
    if (isNaN(ha2Close[i]) || isNaN(ha2Close[i - 1])) continue;

    const prevAbove = ha2Close[i - 1] >= ha2Open[i - 1];
    const curAbove = ha2Close[i] >= ha2Open[i];

    // Cross under: was above, now below
    if (prevAbove && !curAbove && ha2High[i] > reversionThreshold) {
      markers.push({ time: bars[i].time as number, position: 'aboveBar', shape: 'triangleDown', color: downColor, text: 'OB' });
    }
    // Cross over: was below, now above
    if (!prevAbove && curAbove && ha2Low[i] < -reversionThreshold) {
      markers.push({ time: bars[i].time as number, position: 'belowBar', shape: 'triangleUp', color: upColor, text: 'OS' });
    }
  }

  // Bar colors based on HA candle direction
  const barColors: BarColorData[] = [];
  for (let i = warmup; i < n; i++) {
    if (isNaN(ha2Close[i])) continue;
    barColors.push({
      time: bars[i].time as number,
      color: ha2Close[i] >= ha2Open[i] ? upColor : downColor,
    });
  }

  // alerts.new(...): crossunder(c, o) and h > revt, crossover(c, o) and l < -revt, crossover(c, 0), crossunder(c, 0),
  // crossunder(c, o) and not h > revt, crossover(c, o) and not l < -revt, crossover(c, signal), crossunder(c, signal)
  const cUnderO = crossedUnder(ha2Close, ha2Open);
  const cOverO = crossedOver(ha2Close, ha2Open);
  const sig = signalArr.map((v) => v ?? NaN);
  const flags: boolean[][] = [
    cUnderO.map((x, i) => x && ha2High[i] > reversionThreshold),
    cOverO.map((x, i) => x && ha2Low[i] < -reversionThreshold),
    crossedOver(ha2Close, 0),
    crossedUnder(ha2Close, 0),
    cUnderO.map((x, i) => x && !(ha2High[i] > reversionThreshold)),
    cOverO.map((x, i) => x && !(ha2Low[i] < -reversionThreshold)),
    crossedOver(ha2Close, sig),
    crossedUnder(ha2Close, sig),
  ];
  // a.any().notify(): alert(<message of the first true condition>, alert.freq_once_per_bar_close)
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    const k = flags.findIndex((f) => f[i]);
    if (k >= 0) alertCalls.push({ time: bars[i].time as number, message: alertConditions[k].message!, freq: 'once_per_bar_close' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { signal: signalPlot, histogram: histPlot },
    plotCandles: { candle0: candles },
    hlines: [
      { value: 0, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'Zero' } },
    ],
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, flags),
    alertCalls,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Overbought', message: 'OB Signal' },
  { id: 'alert1', title: 'Oversold  ', message: 'OS Signal' },
  { id: 'alert2', title: 'Midline Crossover ', message: 'Bullish Trend' },
  { id: 'alert3', title: 'Midline Crossunder', message: 'Bearish Trend' },
  { id: 'alert4', title: 'Positive Heikin-Ashi', message: 'Heikin-Ashi Uptrend  ' },
  { id: 'alert5', title: 'Negative Heikin-Ashi', message: 'Heikin-Ashi Downtrend' },
  { id: 'alert6', title: 'MACD Bull Cross', message: 'MACD Bullish Cross' },
  { id: 'alert7', title: 'MACD Bear Cross', message: 'MACD Bearish Cross' },
];

export const StandardizedMacdHA = { calculate, metadata, defaultInputs, inputConfig, plotConfig, plotCandleConfig, alertConditions, hasAlertFunction };
