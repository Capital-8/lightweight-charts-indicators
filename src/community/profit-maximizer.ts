/**
 * Profit Maximizer (PMax)
 *
 * As the original: a moving average of the source (hl2 by default; SMA, EMA, WMA, TMA, VAR, WWMA, ZLEMA or TSF) with
 * an ATR trailing stop around it (the ATR, or the SMA of the true range with "Change ATR Calculation Method ?" off;
 * divided by the close with "Normalize ATR ?"). The long stop only rises while the MA stays above its previous value,
 * the short stop only falls while the MA stays below it; the direction turns up when the MA crosses above the
 * previous short stop, down when it crosses below the previous long stop. PMax is the long stop in an up direction,
 * the short stop in a down one.
 * Labels at PMax * 0.995 / 1.005 on the crosses of the MA with PMax (Buy shape0 / Sell shape1, "Show Crossing
 * Signals?") and of the source with PMax (shape2 / shape3, "Show Price/Pmax Crossing Signals?"). The two highlighter
 * fills are between a hidden ohlc4 plot and PMax: green while the MA is above PMax, red while it is below.
 * Alerts (alertcondition, `alerts` of the result): the original's six conditions, crosses of the MA and of the source
 * with PMax (any cross, crossover, crossunder).
 *
 * Reference: "Profit Maximizer PMax"
 */

import { taCore, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ProfitMaximizerInputs {
  src: SourceType;
  atrPeriod: number;
  atrMult: number;
  maType: string;
  maLength: number;
  changeATR: boolean;
  normalize: boolean;
  showSupport: boolean;
  showSignalsK: boolean;
  showSignalsC: boolean;
  highlighting: boolean;
}

export const defaultInputs: ProfitMaximizerInputs = {
  src: 'hl2',
  atrPeriod: 10,
  atrMult: 3.0,
  maType: 'EMA',
  maLength: 10,
  changeATR: true,
  normalize: false,
  showSupport: true,
  showSignalsK: true,
  showSignalsC: false,
  highlighting: true,
};

const MA_TYPES = ['SMA', 'EMA', 'WMA', 'TMA', 'VAR', 'WWMA', 'ZLEMA', 'TSF'];

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hl2' },
  { id: 'atrPeriod', type: 'int', title: 'ATR Length', defval: 10 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier', defval: 3.0, step: 0.1 },
  { id: 'maType', type: 'string', title: 'Moving Average Type', defval: 'EMA', options: MA_TYPES },
  { id: 'maLength', type: 'int', title: 'Moving Average Length', defval: 10, min: 1 },
  { id: 'changeATR', type: 'bool', title: 'Change ATR Calculation Method ?', defval: true },
  { id: 'normalize', type: 'bool', title: 'Normalize ATR ?', defval: false },
  { id: 'showSupport', type: 'bool', title: 'Show Moving Average?', defval: true },
  { id: 'showSignalsK', type: 'bool', title: 'Show Crossing Signals?', defval: true },
  { id: 'showSignalsC', type: 'bool', title: 'Show Price/Pmax Crossing Signals?', defval: false },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
];

/** Colours of the original (color.green / color.red; fills: transparency 90, the fill default) */
const GREEN = '#4CAF50';
const RED = '#FF5252';
const BLUE_LABEL = '#0F18BF';
const UP_FILL = 'rgba(76, 175, 80, 0.1)';
const DOWN_FILL = 'rgba(255, 82, 82, 0.1)';
const NO_FILL = 'rgba(0,0,0,0)';

// Declaration order of the original: MA line, PMax, the hidden ohlc4 plot of the fills
export const plotConfig: PlotConfig[] = [
  { id: 'plot1', title: 'Moving Avg Line', color: '#0585E1', lineWidth: 2 },
  { id: 'plot0', title: 'PMax', color: RED, lineWidth: 2 },
  { id: 'plot2', title: '', color: '#2962FF', lineWidth: 0, style: 'circles', display: 'none' },
];

export const metadata = {
  title: 'Profit Maximizer',
  shortTitle: 'PMax',
  overlay: true,
};

const fin = (v: number | undefined) => v !== undefined && Number.isFinite(v);

function sourceOf(bars: Bar[], src: SourceType): number[] {
  return bars.map((b) => {
    switch (src) {
      case 'open': return b.open;
      case 'high': return b.high;
      case 'low': return b.low;
      case 'hl2': return (b.high + b.low) / 2;
      case 'hlc3': return (b.high + b.low + b.close) / 3;
      case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
      case 'hlcc4': return (b.high + b.low + b.close + b.close) / 4;
      default: return b.close;
    }
  });
}

/** getMA(src, length) of the original */
function movingAverage(src: number[], length: number, type: string): number[] {
  const n = src.length;
  switch (type) {
    case 'SMA': return taCore.sma(src, length);
    case 'WMA': return taCore.wma(src, length);
    case 'TMA': return taCore.sma(taCore.sma(src, Math.ceil(length / 2)), Math.floor(length / 2) + 1);
    case 'VAR': {
      // vud1 / vdd1: the up / down moves (0 on the first bar), summed over 9 bars; VAR uses |CMO| * alpha
      const valpha = 2 / (length + 1);
      const vud1 = src.map((v, i) => (i > 0 && v > src[i - 1] ? v - src[i - 1] : 0));
      const vdd1 = src.map((v, i) => (i > 0 && v < src[i - 1] ? src[i - 1] - v : 0));
      const sum9 = (a: number[]) => a.map((_, i) => {
        if (i < 8) return NaN;
        let s = 0;
        for (let k = i - 8; k <= i; k++) s += a[k];
        return s;
      });
      const vUD = sum9(vud1);
      const vDD = sum9(vdd1);
      const out: number[] = new Array(n);
      let prev = NaN;
      for (let i = 0; i < n; i++) {
        const cmoRaw = (vUD[i] - vDD[i]) / (vUD[i] + vDD[i]);
        const cmo = fin(cmoRaw) ? cmoRaw : 0;
        const a = valpha * Math.abs(cmo);
        const term = a * src[i];
        prev = (fin(term) ? term : 0) + (1 - a) * (fin(prev) ? prev : 0);
        out[i] = prev;
      }
      return out;
    }
    case 'WWMA': {
      const a = 1 / length;
      const out: number[] = new Array(n);
      let prev = NaN;
      for (let i = 0; i < n; i++) {
        prev = a * src[i] + (1 - a) * (fin(prev) ? prev : 0);
        out[i] = prev;
      }
      return out;
    }
    case 'ZLEMA': {
      const lag = length / 2 === Math.round(length / 2) ? length / 2 : (length - 1) / 2;
      const data = src.map((v, i) => (i - lag >= 0 ? v + (v - src[i - lag]) : NaN));
      return taCore.ema(data, length);
    }
    case 'TSF': {
      const lrc = taCore.linreg(src, length, 0);
      const lrc1 = taCore.linreg(src, length, 1);
      return lrc.map((v, i) => v + (v - lrc1[i]));
    }
    default: return taCore.ema(src, length);
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ProfitMaximizerInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { atrPeriod, atrMult, maLength, normalize } = cfg;
  const maType = String(cfg.maType).toUpperCase();
  const n = bars.length;
  const high = bars.map((b) => b.high), low = bars.map((b) => b.low), close = bars.map((b) => b.close);

  const src = sourceOf(bars, cfg.src);
  // atr = changeATR ? atr(Periods) : sma(tr, Periods) (tr is na on the first bar)
  const atr = cfg.changeATR
    ? taCore.atr(atrPeriod, high, low, close)
    : taCore.sma(taCore.tr(false, high, low, close), atrPeriod);
  const ma = movingAverage(src, maLength, maType);

  const pmax: number[] = new Array(n);
  let longStopLast = NaN, shortStopLast = NaN, dir = 1;
  for (let i = 0; i < n; i++) {
    const m = ma[i];
    const band = normalize ? atrMult * atr[i] / close[i] : atrMult * atr[i];
    let longStop = m - band;
    const longStopPrev = fin(longStopLast) ? longStopLast : longStop;
    longStop = m > longStopPrev ? Math.max(longStop, longStopPrev) : longStop;
    let shortStop = m + band;
    const shortStopPrev = fin(shortStopLast) ? shortStopLast : shortStop;
    shortStop = m < shortStopPrev ? Math.min(shortStop, shortStopPrev) : shortStop;
    dir = dir === -1 && m > shortStopPrev ? 1 : dir === 1 && m < longStopPrev ? -1 : dir;
    pmax[i] = dir === 1 ? longStop : shortStop;
    longStopLast = longStop;
    shortStopLast = shortStop;
  }
  const num = (v: number) => (fin(v) ? v : NaN);
  const pmaxVals = pmax.map(num);
  const maVals = ma.map(num);

  const maOver = crossedOver(maVals, pmaxVals), maUnder = crossedUnder(maVals, pmaxVals);
  const pxOver = crossedOver(src, pmaxVals), pxUnder = crossedUnder(src, pmaxVals);

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const p = pmaxVals[i];
    if (cfg.showSignalsK && maOver[i]) {
      markers.push({ id: 'shape0', time: t, position: 'atPriceBottom', price: p * 0.995, shape: 'labelUp', color: GREEN, text: 'Buy', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (cfg.showSignalsK && maUnder[i]) {
      markers.push({ id: 'shape1', time: t, position: 'atPriceTop', price: p * 1.005, shape: 'labelDown', color: RED, text: 'Sell', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (cfg.showSignalsC && pxOver[i]) {
      markers.push({ id: 'shape2', time: t, position: 'atPriceBottom', price: p * 0.995, shape: 'labelUp', color: BLUE_LABEL, text: 'Buy', textColor: '#FFFFFF', size: 'tiny' });
    }
    if (cfg.showSignalsC && pxUnder[i]) {
      markers.push({ id: 'shape3', time: t, position: 'atPriceTop', price: p * 1.005, shape: 'labelDown', color: BLUE_LABEL, text: 'Sell', textColor: '#FFFFFF', size: 'tiny' });
    }
  }

  // fill(mPlot, pALL): ohlc4 to PMax; green when MAvg > PMax, red when MAvg < PMax (na: no fill)
  const upFillColors = maVals.map((m, i) => (cfg.highlighting && m > pmaxVals[i] ? UP_FILL : NO_FILL));
  const downFillColors = maVals.map((m, i) => (cfg.highlighting && m < pmaxVals[i] ? DOWN_FILL : NO_FILL));

  const plot0 = pmaxVals.map((v, i) => ({ time: bars[i].time, value: v }));
  const plot1 = maVals.map((v, i) => ({ time: bars[i].time, value: cfg.showSupport ? v : NaN }));
  const plot2 = bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4 }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2 },
    fills: [
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'UpTrend Highligter', color: UP_FILL }, colors: upFillColors },
      { plot1: 'plot2', plot2: 'plot0', options: { title: 'DownTrend Highligter', color: DOWN_FILL }, colors: downFillColors },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [
      maOver.map((v, i) => v || maUnder[i]), maOver, maUnder,
      pxOver.map((v, i) => v || pxUnder[i]), pxOver, pxUnder,
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Cross Alert', message: 'PMax - Moving Avg Crossing!' },
  { id: 'alert1', title: 'Crossover Alarm', message: 'Moving Avg BUY SIGNAL!' },
  { id: 'alert2', title: 'Crossunder Alarm', message: 'Moving Avg SELL SIGNAL!' },
  { id: 'alert3', title: 'Price Cross Alert', message: 'PMax - Price Crossing!' },
  { id: 'alert4', title: 'Price Crossover Alarm', message: 'PRICE OVER PMax - BUY SIGNAL!' },
  { id: 'alert5', title: 'Price Crossunder Alarm', message: 'PRICE UNDER PMax - SELL SIGNAL!' },
];

export const ProfitMaximizer = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
