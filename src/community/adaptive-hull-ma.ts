/**
 * 72s: Adaptive Hull Moving Average+
 *
 * Dynamic HMA with adaptive length based on volatility or volume.
 * When volatility is high (ATR(14) > ATR(46)) or volume breaks above average,
 * the HMA length shrinks toward minLength; otherwise it expands toward maxLength.
 * A slope angle is calculated to color the MA:
 *   - Strong trend (|slope| >= flat threshold) + active charger = bright color
 *   - Strong trend + inactive charger = light color
 *   - Consolidation (|slope| < flat threshold) = yellow
 * Also plots a faster minor HMA+ with the same adaptive logic.
 * Characters (plotchar, absolute prices): buy / sell (first bar of a strong slope with the charger on), fast exits
 * (strong slope, charger off, close on the wrong side of the minor HMA+) and warnings (high / low beyond the outer
 * distance zone). Alerts (alert() calls, `alertCalls` of the result, once per bar close): one per signal, as the
 * original's alert() calls.
 *
 * Reference: "72s: Adaptive Hull Moving Average+" by io72signals
 */

import { ta, Series, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, BgColorData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface AdaptiveHullMAInputs {
  charger: string;
  minLength: number;
  maxLength: number;
  flat: number;
  showMinor: boolean;
  minorMin: number;
  minorMax: number;
  showZone: boolean;
  mult: number;
  showSignals: boolean;
  useBg: boolean;
}

export const defaultInputs: AdaptiveHullMAInputs = {
  charger: 'Volatility',
  minLength: 172,
  maxLength: 233,
  flat: 17,
  showMinor: true,
  minorMin: 89,
  minorMax: 121,
  showZone: false,
  mult: 2.7,
  showSignals: true,
  useBg: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'charger', type: 'string', title: 'Charger', defval: 'Volatility', options: ['Volatility', 'Volume'] },
  { id: 'minLength', type: 'int', title: 'Minimum Period', defval: 172, min: 2 },
  { id: 'maxLength', type: 'int', title: 'Maximum Period', defval: 233, min: 2 },
  { id: 'flat', type: 'int', title: 'Consolidation Slope Threshold', defval: 17, min: 1 },
  { id: 'showMinor', type: 'bool', title: 'Show Minor HMA+', defval: true },
  { id: 'minorMin', type: 'int', title: 'Minor Minimum', defval: 89, min: 2 },
  { id: 'minorMax', type: 'int', title: 'Minor Maximum', defval: 121, min: 2 },
  { id: 'showZone', type: 'bool', title: 'Show Distance Zone', defval: false },
  { id: 'mult', type: 'float', title: 'Distance Multiplier', defval: 2.7, min: 0.1, step: 0.1 },
  { id: 'showSignals', type: 'bool', title: 'Show Possible Signals', defval: true },
  { id: 'useBg', type: 'bool', title: 'Background color to differentiate movement', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Dynamic HMA+', color: '#6fbf73', lineWidth: 3 },
  { id: 'plot1', title: 'Minor HMA+', color: '#6fbf73', lineWidth: 1 },
  { id: 'upperTL', title: 'Upper Half Zone', color: '#26A69A' },
  { id: 'lowerTL', title: 'Lower Half Zone', color: '#EF5350' },
  { id: 'topTL', title: 'Top Zone', color: '#787B86' },
  { id: 'botTL', title: 'Bottom Zone', color: '#787B86' },
  { id: 'stopupperTL', title: 'Stop Upper', color: '#FFFFFF' },
  { id: 'stoplowerTL', title: 'Stop Lower', color: '#FFFFFF' },
];

export const metadata = {
  title: '72s: Adaptive Hull Moving Average+',
  shortTitle: 'AHMA+',
  overlay: true,
};

/**
 * Compute WMA over a raw number array for a given length, returning a single value
 * using the last `length` elements ending at index `endIdx`.
 */
function wmaAt(arr: number[], endIdx: number, length: number): number {
  const len = Math.max(1, Math.floor(length));
  if (endIdx < len - 1) return NaN;
  let num = 0;
  let den = 0;
  for (let j = 0; j < len; j++) {
    const w = len - j;
    const val = arr[endIdx - j];
    if (isNaN(val)) return NaN;
    num += val * w;
    den += w;
  }
  return num / den;
}

/**
 * Compute HMA for a raw number array at a specific index with a given (possibly fractional) length.
 * HMA(src, len) = WMA(2*WMA(src, len/2) - WMA(src, len), floor(sqrt(len)))
 */
function hmaAt(arr: number[], endIdx: number, length: number): number {
  const halfLen = Math.max(1, Math.floor(length / 2));
  const fullLen = Math.max(1, Math.floor(length));
  const sqrtLen = Math.max(1, Math.floor(Math.sqrt(length)));

  // We need to compute the intermediate series 2*WMA(half) - WMA(full) for sqrtLen bars
  // ending at endIdx
  const needed = sqrtLen;
  const intermediate: number[] = new Array(needed);
  for (let k = 0; k < needed; k++) {
    const idx = endIdx - (needed - 1 - k);
    if (idx < 0) return NaN;
    const wHalf = wmaAt(arr, idx, halfLen);
    const wFull = wmaAt(arr, idx, fullLen);
    if (isNaN(wHalf) || isNaN(wFull)) return NaN;
    intermediate[k] = 2 * wHalf - wFull;
  }

  // WMA of intermediate
  let num = 0;
  let den = 0;
  for (let j = 0; j < needed; j++) {
    const w = needed - j;
    const val = intermediate[needed - 1 - j];
    if (isNaN(val)) return NaN;
    num += val * w;
    den += w;
  }
  return num / den;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveHullMAInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[]; alertCalls: AlertCall[] } {
  const { charger, minLength, maxLength, flat, showMinor, minorMin, minorMax, showZone, mult, showSignals, useBg } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const adaptPct = 0.03141;

  // Precompute charger signals
  const atr14 = ta.atr(bars, 14).toArray();
  const atr46 = ta.atr(bars, 46).toArray();

  // Volume charger: rsi(volume, 14) smoothed by hma(10), then > 49
  const volSeries = Series.fromBars(bars, 'volume');
  const rsiVol = ta.rsi(volSeries, 14);
  const oscArr = ta.hma(rsiVol, 10).toArray();

  const plugged: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (charger === 'Volume') {
      const o = oscArr[i];
      plugged[i] = !isNaN(o) && o > 49;
    } else {
      const a14 = atr14[i];
      const a46 = atr46[i];
      plugged[i] = !isNaN(a14) && !isNaN(a46) && a14 > a46;
    }
  }

  // Adaptive dynamic lengths
  const dynamicLengths: number[] = new Array(n);
  const minorLengths: number[] = new Array(n);
  let dynLen = (minLength + maxLength) / 2;
  let minLen = (minorMin + minorMax) / 2;

  for (let i = 0; i < n; i++) {
    if (plugged[i]) {
      dynLen = Math.max(minLength, dynLen * (1 - adaptPct));
      minLen = Math.max(minorMin, minLen * (1 - adaptPct));
    } else {
      dynLen = Math.min(maxLength, dynLen * (1 + adaptPct));
      minLen = Math.min(minorMax, minLen * (1 + adaptPct));
    }
    dynamicLengths[i] = dynLen;
    minorLengths[i] = minLen;
  }

  // Compute close array
  const closeArr = bars.map(b => b.close);

  // Compute adaptive HMA values bar-by-bar
  const dynamicHMA: number[] = new Array(n);
  const minorHMA: number[] = new Array(n);
  // minorHMA = xhma(src, int(minorLength)): computed for the exits even when the minor line is hidden
  const minorFull: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    dynamicHMA[i] = hmaAt(closeArr, i, dynamicLengths[i]);
    minorFull[i] = hmaAt(closeArr, i, minorLengths[i]);
    minorHMA[i] = showMinor ? minorFull[i] : NaN;
  }

  // Slope calculation
  const slopePeriod = 34;
  const slopeRange = 25;
  const pi = Math.PI;

  // Precompute highest(high, 34) and lowest(low, 34) for slope_range
  const highSeries = Series.fromBars(bars, 'high');
  const lowSeries = Series.fromBars(bars, 'low');
  const hhArr = ta.highest(highSeries, slopePeriod).toArray();
  const llArr = ta.lowest(lowSeries, slopePeriod).toArray();

  function calcSlope(maArr: number[], i: number): number {
    if (i < 2) return 0;
    const ma0 = maArr[i];
    const ma2 = maArr[i - 2];
    if (isNaN(ma0) || isNaN(ma2)) return 0;
    const hh = hhArr[i];
    const ll = llArr[i];
    if (isNaN(hh) || isNaN(ll) || hh === ll) return 0;
    const sr = slopeRange / (hh - ll) * ll;
    const dt = (ma2 - ma0) / closeArr[i] * sr;
    const c = Math.sqrt(1 + dt * dt);
    const xAngle = Math.round(180 * Math.acos(1 / c) / pi);
    return dt > 0 ? -xAngle : xAngle;
  }

  // Color logic
  function dynColor(slope: number, isPlugged: boolean): string {
    if (slope >= flat) {
      return isPlugged ? '#6fbf73' : '#c0f5ae'; // up: bright green / light green
    } else if (slope <= -flat) {
      return isPlugged ? '#eb4d5c' : '#f2b1d4'; // down: bright red / light pink
    }
    return '#FFD700'; // yellow - consolidation
  }

  const warmup = Math.max(maxLength, slopePeriod + 2);

  // Precompute slopes for dynamic HMA
  const dynSlopes: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    dynSlopes[i] = calcSlope(dynamicHMA, i);
  }

  const plot0 = dynamicHMA.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const color = dynColor(dynSlopes[i], plugged[i]);
    return { time: bars[i].time, value: v, color };
  });

  const plot1 = minorHMA.map((v, i) => {
    if (!showMinor || i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const slope = calcSlope(minorHMA, i);
    const color = dynColor(slope, plugged[i]);
    return { time: bars[i].time, value: v, color };
  });

  // Distance zone plots (Pine: ATR envelope around dynamicHMA)
  const atr40 = ta.atr(bars, 40).toArray();

  const upperTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v + mult * atr40[i] };
  });
  const lowerTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v - mult * atr40[i] };
  });
  const topTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v + (mult * 2) * atr40[i] };
  });
  const botTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v - (mult * 2) * atr40[i] };
  });
  const stopupperTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v + (mult / 2) * atr40[i] };
  });
  const stoplowerTLPlot = dynamicHMA.map((v, i) => {
    if (!showZone || i < warmup || isNaN(v) || isNaN(atr40[i])) return { time: bars[i].time, value: NaN };
    return { time: bars[i].time, value: v - (mult / 2) * atr40[i] };
  });

  // Signals and characters (plotchar, location.absolute, size.tiny) at dynamicHMA -/+ atrPos (atrPos = 0.72 * atr(5))
  const atr5 = ta.atr(bars, 5).toArray().map((v) => v ?? NaN);
  const markers: MarkerData[] = [];
  const alertCalls: AlertCall[] = [];
  const GREEN = '#4CAF50'; // color.green (v4)
  const RED = '#FF5252'; // color.red (v4)
  const ORANGE = '#FF9800'; // color.orange (v4)
  const char = (i: number, id: string, price: number, ch: string, col: string) => {
    if (!isNaN(price)) markers.push({ id, time: bars[i].time, position: 'atPriceMiddle', price, shape: 'circle', char: ch, color: col, size: 'tiny' });
  };
  // Slopes of the warm-up bars are 0 here (na in the original): both compare false with +-flat (flat >= 1)
  const upSig = (i: number) => dynSlopes[i] >= flat && plugged[i];
  const dnSig = (i: number) => dynSlopes[i] <= -flat && plugged[i];
  const upExitAt = (i: number) => dynSlopes[i] >= flat && !plugged[i] && bars[i].close < minorFull[i];
  const dnExitAt = (i: number) => dynSlopes[i] <= -flat && !plugged[i] && bars[i].close > minorFull[i];
  const topTL = (i: number) => dynamicHMA[i] + (mult * 2) * atr40[i];
  const botTL = (i: number) => dynamicHMA[i] - (mult * 2) * atr40[i];
  const topWarnAt = (i: number) => bars[i].high > topTL(i);
  const botWarnAt = (i: number) => bars[i].low < botTL(i);
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const atrPos = 0.72 * atr5[i];
    // buy = _upSig and not _upSig[1]; sell = _dnSig and not _dnSig[1]
    const buy = upSig(i) && !(i > 0 && upSig(i - 1));
    const sell = dnSig(i) && !(i > 0 && dnSig(i - 1));
    const upExit = upExitAt(i);
    const dnExit = dnExitAt(i);
    const fastExits = (upExit && !(i > 0 && upExitAt(i - 1))) || (dnExit && !(i > 0 && dnExitAt(i - 1)));
    const topWarn = topWarnAt(i);
    const botWarn = botWarnAt(i);
    const warningSigns = (topWarn && !(i > 0 && topWarnAt(i - 1))) || (botWarn && !(i > 0 && botWarnAt(i - 1)));

    if (showSignals && buy) char(i, 'char0', dynamicHMA[i] - atrPos, '⬆', GREEN);
    if (showSignals && sell) char(i, 'char1', dynamicHMA[i] + atrPos, '⬇', RED);
    // _upExit ? minorHMA + atrPos : _dnExit ? minorHMA - atrPos : na; color = _upExit ? green : red
    if (showSignals && fastExits) {
      char(i, 'char2', upExit ? minorFull[i] + atrPos : minorFull[i] - atrPos, 'ⓧ', upExit ? GREEN : RED);
    }
    // _topWarn ? high + atrPos : _botWarn ? low - atrPos : na
    if (showSignals && warningSigns) char(i, 'char3', topWarn ? bars[i].high + atrPos : bars[i].low - atrPos, '⚠', ORANGE);

    // alert(..., alert.freq_once_per_bar_close)
    const call = (message: string) => alertCalls.push({ time: bars[i].time, message, freq: 'once_per_bar_close' });
    if (buy) call('Possible Buy Signal at' + str.tostring(close));
    if (sell) call('Possible Sell Signal at' + str.tostring(close));
    if (fastExits && upExit) call('Price has just crossed down minor xHMA+ at' + str.tostring(close));
    if (fastExits && dnExit) call('Price has just crossed up minor xHMA+ at' + str.tostring(close));
    if (warningSigns && topWarn) call('Price has just crossed above top xHMA+ zone');
    if (warningSigns && botWarn) call('Price has just crossed below bottom xHMA+ zone');
  }

  // Background colors: consolidation/low volatility shading (from Pine bgcolor)
  // Pine: bgcolor(useBg? plugged? na : notgreat? #757779 : #afb4b9 : na)
  const bgColors: BgColorData[] = [];
  if (useBg) {
    for (let i = warmup; i < n; i++) {
      const notGreat = dynSlopes[i] < flat && dynSlopes[i] > -flat;
      if (!plugged[i]) {
        bgColors.push({
          time: bars[i].time,
          color: notGreat ? 'rgba(117,119,121,0.40)' : 'rgba(175,180,185,0.40)',
        });
      }
    }
  }

  // Fill between stop zone lines (fill(sutl, sltl, color = colZone, transp = 90); colZone transparent without the zone)
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': plot0, 'plot1': plot1,
      'upperTL': upperTLPlot, 'lowerTL': lowerTLPlot,
      'topTL': topTLPlot, 'botTL': botTLPlot,
      'stopupperTL': stopupperTLPlot, 'stoplowerTL': stoplowerTLPlot,
    },
    fills: [{
      plot1: 'stopupperTL', plot2: 'stoplowerTL',
      options: { title: 'Plots Background', color: showZone ? 'rgba(128,0,128,0.10)' : 'rgba(255,255,255,0)' },
    }],
    markers,
    bgColors,
    alertCalls,
  };
}

export const AdaptiveHullMA = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
