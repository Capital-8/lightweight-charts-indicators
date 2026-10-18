/**
 * Spira Alligator
 *
 * A Williams Alligator (lips, teeth and jaw: moving averages of the source, by default SMMA of hl2 with lengths 5, 8
 * and 13, drawn 3, 5 and 8 bars ahead) with a trend line (EMA 144 of the close). The moving average type of the
 * Alligator and of the trend line can be one of 26 types. The signals use the values without the plot offset:
 * - a pullback for a sell is seen when the lips cross above the teeth with the close below the trend line (reset
 *   when the close is above it); SELL when the lips then cross below the teeth with the close below the trend line;
 * - a pullback for a buy is seen when the lips cross below the teeth (reset when the close is below the trend line);
 *   BUY when the lips then cross above the teeth with the close above the trend line.
 * Signals draw a label and a background colour.
 * Alerts (alertcondition, `alerts` of the result): 'BUY Signal' and 'SELL Signal', true on the bars of the signals.
 *
 * Reference: "Spira Alligator" by Markedsignaler
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { taCore, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const MA_TYPES = ['SMA', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA', 'HullMA', 'TMA', 'HybridMA',
  'ZeroLagEMA', 'SuperEMA', 'TrendMA', 'HMA', 'THMA', 'EHMA', 'DEMA', 'TEMA',
  'TDEMA', 'TTEMA', 'ZLEMA', 'ZLDEMA', 'ZLTEMA', 'DZLEMA', 'TZLEMA',
  'LLEMA', 'NMA', 'SmoothedMA'];

export interface SpiraAlligatorInputs {
  showAli: boolean;
  /** Moving average type of the lips, teeth and jaw */
  aliType: string;
  /** Source of the Alligator */
  aliSrc: SourceType;
  lipsLength: number;
  /** Plot offset of the lips (display only) */
  lipsOffset: number;
  lipsColor: string;
  teethLength: number;
  teethOffset: number;
  teethColor: string;
  jawLength: number;
  jawOffset: number;
  jawColor: string;
  showTrend: boolean;
  /** Moving average type of the trend line (of the close) */
  trendType: string;
  trendLength: number;
  trendColor: string;
  showSignals: boolean;
  /** Background colour on the signal bars */
  showBg: boolean;
}

export const defaultInputs: SpiraAlligatorInputs = {
  showAli: true,
  aliType: 'SMMA (RMA)',
  aliSrc: 'hl2',
  lipsLength: 5,
  lipsOffset: 3,
  lipsColor: '#00E676',
  teethLength: 8,
  teethOffset: 5,
  teethColor: '#F44336',
  jawLength: 13,
  jawOffset: 8,
  jawColor: '#2196F3',
  showTrend: true,
  trendType: 'EMA',
  trendLength: 144,
  trendColor: color.yellow,
  showSignals: true,
  showBg: true,
};

const G_ALI = '🐊 Williams Alligator';
const G_TREND = '🟡 Trendlinje — EMA 144';
const G_SIG = '🔔 Signalinnstillinger';

export const inputConfig: InputConfig[] = [
  { id: 'showAli', type: 'bool', title: 'Vis Alligator', defval: true, group: G_ALI },
  { id: 'aliType', type: 'string', title: 'MA Type', defval: 'SMMA (RMA)', options: MA_TYPES, group: G_ALI },
  { id: 'aliSrc', type: 'source', title: 'Kilde (standard: HL2)', defval: 'hl2', group: G_ALI },
  { id: 'lipsLength', type: 'int', title: 'Lips — Lengde', defval: 5, min: 1, group: G_ALI },
  { id: 'lipsOffset', type: 'int', title: 'Lips — Offset (kun visuelt)', defval: 3, min: 0, group: G_ALI },
  { id: 'lipsColor', type: 'color', title: 'Lips — Farge', defval: '#00E676', group: G_ALI },
  { id: 'teethLength', type: 'int', title: 'Teeth — Lengde', defval: 8, min: 1, group: G_ALI },
  { id: 'teethOffset', type: 'int', title: 'Teeth — Offset (kun visuelt)', defval: 5, min: 0, group: G_ALI },
  { id: 'teethColor', type: 'color', title: 'Teeth — Farge', defval: '#F44336', group: G_ALI },
  { id: 'jawLength', type: 'int', title: 'Jaw — Lengde', defval: 13, min: 1, group: G_ALI },
  { id: 'jawOffset', type: 'int', title: 'Jaw — Offset (kun visuelt)', defval: 8, min: 0, group: G_ALI },
  { id: 'jawColor', type: 'color', title: 'Jaw — Farge', defval: '#2196F3', group: G_ALI },
  { id: 'showTrend', type: 'bool', title: 'Vis trendlinje', defval: true, group: G_TREND },
  { id: 'trendType', type: 'string', title: 'MA Type', defval: 'EMA', options: MA_TYPES, group: G_TREND },
  { id: 'trendLength', type: 'int', title: 'Lengde (Fibonacci)', defval: 144, min: 1, group: G_TREND },
  { id: 'trendColor', type: 'color', title: 'Farge', defval: color.yellow, group: G_TREND },
  { id: 'showSignals', type: 'bool', title: 'Vis BUY/SELL signaler', defval: true, group: G_SIG },
  { id: 'showBg', type: 'bool', title: 'Bakgrunnsfarge ved signal', defval: true, group: G_SIG },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trendlinje EMA 144', color: color.yellow, lineWidth: 3 },
  { id: 'plot1', title: 'Lips (Grønn)', color: '#00E676', lineWidth: 1 },
  { id: 'plot2', title: 'Teeth (Rød)', color: '#F44336', lineWidth: 1 },
  { id: 'plot3', title: 'Jaw (Blå)', color: '#2196F3', lineWidth: 1 },
  { id: 'plot4', title: 'SPKOA Lips', color: '#2962FF', lineWidth: 1, display: 'data_window' },
  { id: 'plot5', title: 'SPKOA Teeth', color: '#2962FF', lineWidth: 1, display: 'data_window' },
  { id: 'plot6', title: 'SPKOA Jaw', color: '#2962FF', lineWidth: 1, display: 'data_window' },
  { id: 'plot7', title: 'SPKOA Trend MA', color: '#2962FF', lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: 'Spira Alligator',
  shortTitle: 'Spira Alligator',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Arr = number[];
const toArr = (a: ArrayLike<number | undefined>): Arr => Array.from(a, (v) => v ?? NaN);
/** x[k]: na before the first bar */
const hist = (x: Arr, i: number, k: number) => (i - k >= 0 ? x[i - k] : NaN);

/** Moving averages of the Pine script; each call has its own history (one Pine call site per call) */
function makeMa(volume: Arr, atr: Arr) {
  const sma = (x: Arr, len: number) => toArr(taCore.sma(x, len));
  const ema = (x: Arr, len: number) => toArr(taCore.ema(x, len));
  const rma = (x: Arr, len: number) => toArr(taCore.rma(x, len));
  const wma = (x: Arr, len: number) => toArr(taCore.wma(x, len));
  const vwma = (x: Arr, len: number) => toArr(taCore.vwma(x, len, volume));
  const zip = (f: (...v: number[]) => number, ...xs: Arr[]) => xs[0].map((_v, i) => f(...xs.map((x) => x[i])));

  /** wma_custom(src, length): a Pine `for i = 0 to length - 1` loop (length can be fractional: length / 2) */
  const wmaCustom = (x: Arr, length: number): Arr => x.map((_v, bar) => {
    let sum = 0.0;
    let norm = 0.0;
    const end = length - 1;
    // for i = 0 to end: counts down when end < 0
    const step = end >= 0 ? 1 : -1;
    for (let i = 0; step > 0 ? i <= end : i >= end; i += step) {
      const weight = length - i;
      sum += hist(x, bar, i) * weight;
      norm += weight;
    }
    return sum / norm;
  });
  const zlema = (x: Arr, length: number) => {
    const lag = Math.round((length - 1) / 2);
    return ema(x.map((v, i) => v + (v - hist(x, i, lag))), length);
  };
  const hma = (x: Arr, length: number) => wmaCustom(
    zip((a, b) => 2 * a - b, wmaCustom(x, length / 2), wmaCustom(x, length)), Math.round(Math.sqrt(length)));
  const dema = (x: Arr, length: number) => {
    const e1 = ema(x, length);
    return zip((a, b) => 2 * a - b, e1, ema(e1, length));
  };
  const tema = (x: Arr, length: number) => {
    const e1 = ema(x, length);
    const e2 = ema(e1, length);
    return zip((a, b, c) => 3 * (a - b) + c, e1, e2, ema(e2, length));
  };
  const hybrid = (x: Arr, length: number) => {
    const basic = sma(x, length);
    const out: Arr = new Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const prev = hist(out, i, 1);
      out[i] = isNaN(prev) ? basic[i] : (prev * (length - 1) + basic[i]) / length;
    }
    return out;
  };
  const smoothed = (x: Arr, length: number) => {
    // s := na(s[1]) ? ta.sma(src, length) : (s[1] * (length - 1) + src) / length; the ta.sma only runs (and keeps
    // its history) on the bars where s[1] is na
    const received: Arr = [];
    const out: Arr = new Array(x.length);
    for (let i = 0; i < x.length; i++) {
      const prev = hist(out, i, 1);
      if (isNaN(prev)) {
        received.push(x[i]);
        out[i] = toArr(taCore.sma(received, length))[received.length - 1];
      } else {
        out[i] = (prev * (length - 1) + x[i]) / length;
      }
    }
    return out;
  };

  return (type: string, x: Arr, length: number): Arr => {
    switch (type) {
      case 'SMA': return sma(x, length);
      case 'EMA': return ema(x, length);
      case 'SMMA (RMA)': return rma(x, length);
      case 'WMA': return wma(x, length);
      case 'VWMA': return vwma(x, length);
      case 'HullMA':
      case 'HMA': return hma(x, length);
      case 'TMA': return sma(sma(x, length), length);
      case 'HybridMA': return hybrid(x, length);
      case 'ZeroLagEMA': {
        const e1 = ema(x, length);
        return zip((a, b) => a + (a - b), e1, ema(e1, length));
      }
      case 'SuperEMA':
      case 'TEMA': return tema(x, length);
      case 'TrendMA': {
        const e = ema(x, length);
        const s = sma(x, length);
        const atrSma = sma(atr, length);
        // trend = atrSeries / ta.sma(atrSeries, length): a plain division
        return zip((ev, sv, a, as) => {
          const trend = a / as;
          return ev * trend + sv * (1 - trend);
        }, e, s, atr, atrSma);
      }
      case 'THMA': {
        const w1 = wmaCustom(x, length / 3);
        return wmaCustom(zip((a, b, c) => a * 3 - b - c, w1, wmaCustom(x, length / 2), wmaCustom(x, length)), length);
      }
      case 'EHMA':
        // ta.ema with the fractional length / 2
        return ema(zip((a, b) => 2 * a - b, ema(x, length / 2), ema(x, length)), Math.round(Math.sqrt(length)));
      case 'DEMA': return dema(x, length);
      case 'TDEMA': {
        const d1 = dema(x, length);
        return zip((a, b, c) => 3 * (a - b) + c, d1, dema(d1, length), dema(dema(d1, length), length));
      }
      case 'TTEMA': {
        const t1 = tema(x, length);
        return zip((a, b, c) => 3 * (a - b) + c, t1, tema(t1, length), tema(tema(t1, length), length));
      }
      case 'ZLEMA': return zlema(x, length);
      case 'ZLDEMA':
      case 'DZLEMA': {
        const z1 = zlema(x, length);
        return zip((a, b) => 2 * a - b, z1, zlema(z1, length));
      }
      case 'ZLTEMA':
      case 'TZLEMA': {
        const z1 = zlema(x, length);
        const z2 = zlema(z1, length);
        return zip((a, b, c) => 3 * (a - b) + c, z1, z2, zlema(z2, length));
      }
      case 'LLEMA':
        return ema(x.map((v, i) => 0.25 * v + 0.5 * hist(x, i, 1) + 0.25 * hist(x, i, 2)), length);
      case 'NMA': {
        const lambda = length / 26;
        const alpha = (lambda * (length - 1)) / (length - lambda);
        const e1 = ema(x, length);
        return zip((a, b) => (1 + alpha) * a - alpha * b, e1, ema(e1, 26));
      }
      case 'SmoothedMA': return smoothed(x, length);
      default: return x.map(() => NaN);
    }
  };
}

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<SpiraAlligatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = toArr(getSourceSeries(bars, cfg.aliSrc).toArray());
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const atr = toArr(taCore.atr(14, bars.map((b) => b.high), bars.map((b) => b.low), close));
  const ma = makeMa(volume, atr);

  const lips = ma(cfg.aliType, src, cfg.lipsLength);
  const teeth = ma(cfg.aliType, src, cfg.teethLength);
  const jaw = ma(cfg.aliType, src, cfg.jawLength);
  const trend = ma(cfg.trendType, close, cfg.trendLength);

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const buyBg = String(color.new(color.lime, 88));
  const sellBg = String(color.new(color.red, 88));
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  let bearPullbackSeen = false; // var bool
  let bullPullbackSeen = false; // var bool
  for (let i = 0; i < n; i++) {
    const c = close[i];
    // (lips > teeth) and (lips[1] <= teeth[1]); (lips < teeth) and (lips[1] >= teeth[1])
    const crossUp = gt(lips[i], teeth[i]) && le(hist(lips, i, 1), hist(teeth, i, 1));
    const crossDown = lt(lips[i], teeth[i]) && ge(hist(lips, i, 1), hist(teeth, i, 1));
    if (crossUp && lt(c, trend[i])) bearPullbackSeen = true;
    if (gt(c, trend[i])) bearPullbackSeen = false;
    if (crossDown) bullPullbackSeen = true;
    if (lt(c, trend[i])) bullPullbackSeen = false;
    const sell = bearPullbackSeen && crossDown && lt(c, trend[i]);
    const buy = bullPullbackSeen && crossUp && gt(c, trend[i]);
    if (sell) bearPullbackSeen = false;
    if (buy) bullPullbackSeen = false;
    buyFlags.push(buy);
    sellFlags.push(sell);

    const time = bars[i].time;
    if (cfg.showSignals && buy) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: color.lime, text: 'alligator',
        textColor: color.black, size: 'tiny' });
    }
    if (cfg.showSignals && sell) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'alligator',
        textColor: color.white, size: 'tiny' });
    }
    if (cfg.showBg && buy) bgColors.push({ time, color: buyBg });
    if (cfg.showBg && sell) bgColors.push({ time, color: sellBg });
  }

  // plot(..., offset = k): the value of bar i is drawn on bar i + k
  const interval = barInterval(bars);
  const shifted = (values: Arr, show: boolean, col: string, k: number): Point[] =>
    values.map((v, i) => ({ time: barTime(bars, i + k, interval), value: show && Number.isFinite(v) ? v : NaN, color: col }));
  const plain = (values: Arr): Point[] => values.map((v, i) => ({ time: bars[i].time, value: Number.isFinite(v) ? v : NaN }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: shifted(trend, cfg.showTrend, cfg.trendColor, 0),
      plot1: shifted(lips, cfg.showAli, cfg.lipsColor, cfg.lipsOffset),
      plot2: shifted(teeth, cfg.showAli, cfg.teethColor, cfg.teethOffset),
      plot3: shifted(jaw, cfg.showAli, cfg.jawColor, cfg.jawOffset),
      plot4: plain(lips),
      plot5: plain(teeth),
      plot6: plain(jaw),
      plot7: plain(trend),
    },
    markers,
    bgColors,
    // alertcondition(buy_signal, "BUY Signal") / alertcondition(sell_signal, "SELL Signal")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Signal', message: '🟢 SPKOA BUY  — Lips krysset over Teeth, pris over EMA 144' },
  { id: 'alert1', title: 'SELL Signal', message: '🔴 SPKOA SELL — Lips krysset under Teeth, pris under EMA 144' },
];

export const SpiraAlligator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
