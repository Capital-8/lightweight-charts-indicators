/**
 * Standardized MACD Heikin-Ashi Transformed
 *
 * As the original: the MACD of the source divided by the EMA of the bar range (high - low) over the slow length,
 * times 100, turned into one Heikin-Ashi bar per bar from the previous and current values (the original's ha
 * method, its persistent bar and history rules included); the signal is the EMA of a source of that HA bar, the
 * histogram its close minus the signal. Candles coloured by the HA direction (hollow rising bodies with "Hollow
 * Candles"), OB / OS triangles 40 above the HA high / below the HA low (shape0 / shape1).
 * Histogram columns (width 1) as the original: above 0 light blue #8ac3f5, below (or na) light red #ffa7b6, at
 * transparency 20 when the histogram is above its value of the bar before, else 30.
 * Bar colours (barcolor0) by "Bar Coloring", None by default (no bar colour): MidLine (HA close above 0), Candles (HA
 * direction), Sig Cross (signal above the HA close: red), Extremities (HA close beyond the reversion threshold, else
 * the chart foreground colour at transparency 25), Reversions (OS / OB signals, else that foreground colour); na
 * values compare false, as in the original. The foreground colour is `chart.fg_color` of the chart context.
 * HA open: the original's persistent bar object (var bar x, its close set to the new ohlc4 before the new bar is
 * built) read as Pine evaluates it: x.o[1] is the open of the HA bar before, x.src('oc2')[1] the value of that call
 * on the bar before (0 through nz() on the first bar it runs).
 * Alerts (alertcondition, `alerts` of the result): Overbought / Oversold (HA close crossing its open beyond the
 * reversion threshold), Midline Crossover / Crossunder (HA close crossing 0), Positive / Negative Heikin-Ashi (the
 * crosses inside the threshold), MACD Bull / Bear Cross (HA close crossing the signal). alert() calls (`alertCalls`,
 * once per bar close): on each bar where one of them is true, the message of the first true one in that order.
 *
 * Reference: "Standardized MACD Heikin-Ashi Transformed" by EliCobra
 */

import { taCore, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, BarColorData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { foregroundColorOf, type ChartContext } from '../chart-context';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface StandardizedMacdHAInputs {
  src: string;
  fast: number;
  slow: number;
  signalSrc: string;
  signalLength: number;
  reversionThreshold: number;
  /** Bar Coloring */
  barColoring: 'None' | 'MidLine' | 'Candles' | 'Sig Cross' | 'Extremities' | 'Reversions';
  hollow: boolean;
}

export const defaultInputs: StandardizedMacdHAInputs = {
  src: 'close',
  fast: 12,
  slow: 26,
  signalSrc: 'close',
  signalLength: 9,
  reversionThreshold: 100,
  barColoring: 'None',
  hollow: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fast', type: 'int', title: 'Fast Length', defval: 12, min: 1 },
  { id: 'slow', type: 'int', title: 'Slow Length', defval: 26, min: 1 },
  { id: 'signalSrc', type: 'string', title: 'Signal Source', defval: 'close', options: ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4', 'hlcc4'] },
  { id: 'signalLength', type: 'int', title: 'Signal Length', defval: 9, min: 1 },
  { id: 'reversionThreshold', type: 'float', title: 'Reversion Threshold', defval: 100, min: 0, step: 10 },
  { id: 'barColoring', type: 'string', title: 'Bar Coloring', defval: 'None', options: ['None', 'MidLine', 'Candles', 'Sig Cross', 'Extremities', 'Reversions'] },
  { id: 'hollow', type: 'bool', title: 'Hollow Candles', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'signal', title: 'Signal', color: '#787B86', lineWidth: 1 },
  { id: 'histogram', title: 'Histogram', color: '#8ac3f5', lineWidth: 1, style: 'columns' },
];

export const plotCandleConfig = [
  { id: 'candle0', title: 'HA MACD Candle' },
];

export const metadata = {
  title: 'Standardized MACD HA',
  shortTitle: 'SMACDHA',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<StandardizedMacdHAInputs> = {}, chart?: ChartContext): Omit<IndicatorResult, 'markers'> & { plotCandles: Record<string, PlotCandleData[]>; markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const { src, fast, slow, signalSrc, signalLength, reversionThreshold, barColoring, hollow } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const pick = (o: number, h: number, l: number, c: number, which: string): number => {
    switch (which) {
      case 'open': return o;
      case 'high': return h;
      case 'low': return l;
      case 'oc2': return (o + c) / 2;
      case 'hl2': return (h + l) / 2;
      case 'hlc3': return (h + l + c) / 3;
      case 'ohlc4': return (o + h + l + c) / 4;
      case 'hlcc4': return (h + l + c + c) / 4;
      default: return c;
    }
  };

  // x = (ema(src, fast) - ema(src, slow)) / ema(high - low, slow) * 100
  const srcArr = bars.map((b) => pick(b.open, b.high, b.low, b.close, src));
  const emaFast = taCore.ema(srcArr, fast);
  const emaSlow = taCore.ema(srcArr, slow);
  const emaRange = taCore.ema(bars.map((b) => b.high - b.low), slow);
  const macdArr = emaFast.map((f, i) => {
    const v = ((f - emaSlow[i]) / emaRange[i]) * 100;
    return Number.isFinite(v) ? v : NaN;
  });

  // One Heikin-Ashi pass (method ha) on the bar z = (x[1], max(x, x[1]), min(x, x[1]), x). The persistent object x
  // holds the HA bar of the bar before; its close is first set to ohlc4(z), then the new bar is
  //   open  = na(x.o[1]) ? oc2(z) : nz(x.src('oc2')[1])  (x.src('oc2') = avg(open of the HA bar before, ohlc4(z)),
  //           evaluated in that branch only: its value of the bar before, na on the first bar of the branch)
  //   high  = max(z.h, max(x.o, x.c)), low = min(z.l, min(x.o, x.c))  (x.o: the open of the HA bar before)
  //   close = ohlc4(z)
  const haOpen: number[] = new Array(n);
  const haHigh: number[] = new Array(n);
  const haLow: number[] = new Array(n);
  const haClose: number[] = new Array(n);
  let prevOpen = NaN; // x.o: the open of the HA bar before
  let lastOc2 = NaN; // x.src('oc2') of the bar before (na when not evaluated)
  for (let i = 0; i < n; i++) {
    const m = macdArr[i];
    const m1 = i > 0 ? macdArr[i - 1] : NaN;
    const zo = m1, zh = Math.max(m, m1), zl = Math.min(m, m1), zc = m;
    const c = (zo + zh + zl + zc) / 4;
    let o: number;
    if (!Number.isFinite(prevOpen)) {
      o = (zo + zc) / 2;
      lastOc2 = NaN;
    } else {
      o = Number.isFinite(lastOc2) ? lastOc2 : 0;
      lastOc2 = (prevOpen + c) / 2;
    }
    haOpen[i] = Number.isFinite(o) ? o : NaN;
    haHigh[i] = Math.max(zh, Math.max(prevOpen, c));
    haLow[i] = Math.min(zl, Math.min(prevOpen, c));
    haClose[i] = Number.isFinite(c) ? c : NaN;
    prevOpen = haOpen[i];
  }
  const ha2Open = haOpen, ha2High = haHigh, ha2Low = haLow, ha2Close = haClose;

  // s = ema(z.src(sig), clen); H = z.c - s
  const signalArr = taCore.ema(haClose.map((c, i) => pick(haOpen[i], haHigh[i], haLow[i], c, signalSrc)), signalLength);
  const histArr = haClose.map((c, i) => c - signalArr[i]);

  const upColor = '#00bcd4';
  const downColor = '#fc1f1f';
  // haColor = c > o ? colup : c < o ? coldn : na; no body on a rising candle with "Hollow Candles"
  const haColor = (i: number) => (haClose[i] > haOpen[i] ? upColor : haClose[i] < haOpen[i] ? downColor : 'transparent');

  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const ok = [haOpen[i], haHigh[i], haLow[i], haClose[i]].every(Number.isFinite);
    if (!ok) {
      candles.push({ time: bars[i].time as number, open: NaN, high: NaN, low: NaN, close: NaN });
      continue;
    }
    const col = haColor(i);
    candles.push({
      time: bars[i].time as number,
      open: haOpen[i],
      high: haHigh[i],
      low: haLow[i],
      close: haClose[i],
      color: hollow && haClose[i] > haOpen[i] ? 'transparent' : col,
      borderColor: col,
      wickColor: col,
    });
  }

  const signalPlot = signalArr.map((v, i) => ({
    time: bars[i].time,
    value: Number.isFinite(v) ? v : NaN,
  }));

  // colh = o.h > 0 ? (o.h > o.h[1] ? color.new(colhu, 20) : color.new(colhu, 30))
  //                 : (o.h > o.h[1] ? color.new(colhd, 20) : color.new(colhd, 30))
  const histColors = ['#8ac3f5', '#ffa7b6'].map((c) => [String(color.new(c, 20)), String(color.new(c, 30))]);
  const histPlot = histArr.map((v, i) => {
    const rising = i > 0 && v > histArr[i - 1];
    return {
      time: bars[i].time,
      value: Number.isFinite(v) ? v : NaN,
      color: histColors[v > 0 ? 0 : 1][rising ? 0 : 1],
    };
  });

  // plotshape(a.s ? o.b.h + 40 : na, "OB", triangledown, absolute) / plotshape(a.b ? o.b.l - 40 : na, "OS", triangleup)
  const markers: MarkerData[] = [];
  const obSignal: boolean[] = new Array(n).fill(false);
  const osSignal: boolean[] = new Array(n).fill(false);
  {
    const under = crossedUnder(haClose, haOpen);
    const over = crossedOver(haClose, haOpen);
    for (let i = 0; i < n; i++) {
      obSignal[i] = under[i] && haHigh[i] > reversionThreshold;
      osSignal[i] = over[i] && haLow[i] < -reversionThreshold;
      if (obSignal[i]) {
        markers.push({ id: 'shape0', time: bars[i].time as number, position: 'atPriceMiddle', price: haHigh[i] + 40, shape: 'triangleDown', color: downColor, size: 'tiny' });
      }
      if (osSignal[i]) {
        markers.push({ id: 'shape1', time: bars[i].time as number, position: 'atPriceMiddle', price: haLow[i] - 40, shape: 'triangleUp', color: upColor, size: 'tiny' });
      }
    }
  }

  // barcolor(col): col = switch colb ('None' => na: no bar colour); na values compare false
  const barColors: BarColorData[] = [];
  if (barColoring !== 'None') {
    const neutralBar = String(color.new(foregroundColorOf(chart), 25));
    for (let i = 0; i < n; i++) {
      const c = haClose[i];
      let col: string;
      switch (barColoring) {
        case 'MidLine': col = c > 0 ? upColor : downColor; break;
        case 'Candles': col = c > haOpen[i] ? upColor : downColor; break;
        case 'Sig Cross': col = signalArr[i] > c ? downColor : upColor; break;
        case 'Extremities': col = c > reversionThreshold ? downColor : c < -reversionThreshold ? upColor : neutralBar; break;
        case 'Reversions': col = osSignal[i] ? downColor : obSignal[i] ? upColor : neutralBar; break;
        default: continue;
      }
      barColors.push({ id: 'barcolor0', time: bars[i].time as number, color: col });
    }
  }

  // alerts.new(...): crossunder(c, o) and h > revt, crossover(c, o) and l < -revt, crossover(c, 0), crossunder(c, 0),
  // crossunder(c, o) and not h > revt, crossover(c, o) and not l < -revt, crossover(c, signal), crossunder(c, signal)
  const cUnderO = crossedUnder(ha2Close, ha2Open);
  const cOverO = crossedOver(ha2Close, ha2Open);
  const sig = signalArr;
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
