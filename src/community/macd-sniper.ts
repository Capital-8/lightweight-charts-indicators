/**
 * MACD Sniper
 *
 * MACD with a choice of moving average for the oscillator and the signal line (SMA, EMA, WMA, VWMA, KAMA, HMA, ZLEMA,
 * TEMA, ALMA, DEMA). Histogram signals: a buy when the histogram rises below zero after at least `min falling bars`
 * bars of falling negative values, a sell when it falls above zero after `min growing bars` bars of growing positive
 * values; one signal per histogram phase. MA signals: crosses of the MACD and the signal line. Both kinds wait a
 * re-entry pause after the last signal and can be filtered by RSI, MFI, Stochastic and Supertrend ranges and by an
 * alternation rule (wait for the opposite signal). Signals are drawn as triangles on the price chart (Buy / Sell) and
 * at the top / bottom of the MACD pane (H / MA). A hidden connector plot gives 1 (buy), -1 (sell) or 0.
 * Alerts (alertcondition, `alerts` of the result): 'MACD Buy Signal' / 'MACD Sell Signal', true on the bars of an
 * enabled histogram or MA buy / sell signal.
 *
 * Reference: "MACD Sniper [trade_lexx]" by trade_lexx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

const MA_TYPES = ['SMA', 'EMA', 'WMA', 'VWMA', 'KAMA', 'HMA', 'ZLEMA', 'TEMA', 'ALMA', 'DEMA'] as const;
export type MacdSniperMaType = (typeof MA_TYPES)[number];

export interface MacdSniperInputs {
  useHistSignals: boolean;
  useMaSignals: boolean;
  minFallingBars: number;
  minGrowingBars: number;
  /** Re-entry pause (bars) after a signal */
  minBarsBetweenSignals: number;
  /** Only alternate buy / sell signals */
  waitForOppositeSignal: boolean;
  useSupertrendFilter: boolean;
  atrPeriod: number;
  factor: number;
  plotSupertrend: boolean;
  useRsiFilter: boolean;
  rsiLength: number;
  overboughtLowerLevel: number;
  overboughtUpperLevel: number;
  oversoldLowerLevel: number;
  oversoldUpperLevel: number;
  useMfiFilter: boolean;
  mfiLength: number;
  mfiOverboughtLowerLevel: number;
  mfiOverboughtUpperLevel: number;
  mfiOversoldLowerLevel: number;
  mfiOversoldUpperLevel: number;
  useStochFilter: boolean;
  stochLength: number;
  stochOverboughtLowerLevel: number;
  stochOverboughtUpperLevel: number;
  stochOversoldLowerLevel: number;
  stochOversoldUpperLevel: number;
  /** Oscillator MA type */
  smaSource: MacdSniperMaType;
  /** Signal line MA type */
  smaSignal: MacdSniperMaType;
  src: SourceType;
  signalLength: number;
  fastLength: number;
  slowLength: number;
}

export const defaultInputs: MacdSniperInputs = {
  useHistSignals: true,
  useMaSignals: true,
  minFallingBars: 3,
  minGrowingBars: 3,
  minBarsBetweenSignals: 5,
  waitForOppositeSignal: false,
  useSupertrendFilter: false,
  atrPeriod: 10,
  factor: 0.6,
  plotSupertrend: false,
  useRsiFilter: true,
  rsiLength: 14,
  overboughtLowerLevel: 70,
  overboughtUpperLevel: 100,
  oversoldLowerLevel: 1,
  oversoldUpperLevel: 35,
  useMfiFilter: false,
  mfiLength: 14,
  mfiOverboughtLowerLevel: 70,
  mfiOverboughtUpperLevel: 100,
  mfiOversoldLowerLevel: 1,
  mfiOversoldUpperLevel: 30,
  useStochFilter: false,
  stochLength: 14,
  stochOverboughtLowerLevel: 70,
  stochOverboughtUpperLevel: 120,
  stochOversoldLowerLevel: 1,
  stochOversoldUpperLevel: 30,
  smaSource: 'EMA',
  smaSignal: 'EMA',
  src: 'close',
  signalLength: 9,
  fastLength: 12,
  slowLength: 26,
};

const G1 = 'Settings Signals';
const G2 = 'Filters';
const G4 = 'MACD Settings';

export const inputConfig: InputConfig[] = [
  { id: 'useHistSignals', type: 'bool', title: 'Histogram Signals', defval: true, group: G1 },
  { id: 'useMaSignals', type: 'bool', title: 'MA Signals', defval: true, group: G1 },
  { id: 'minFallingBars', type: 'int', title: 'Min ⬇Falling Bars', defval: 3, min: 1, group: G1 },
  { id: 'minGrowingBars', type: 'int', title: 'Min ⬆Growing Bars', defval: 3, min: 1, group: G1 },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Reentry pause', defval: 5, min: 1, group: G2 },
  { id: 'waitForOppositeSignal', type: 'bool', title: 'Wait Opposite', defval: false, group: G2 },
  { id: 'useSupertrendFilter', type: 'bool', title: 'Supertrend Filter ⮕', defval: false, group: G2 },
  { id: 'atrPeriod', type: 'int', title: 'Supertrend Length', defval: 10, min: 1, group: G2 },
  { id: 'factor', type: 'float', title: 'Supertrend Factor', defval: 0.6, min: 0.01, step: 0.1, group: G2 },
  { id: 'plotSupertrend', type: 'bool', title: 'Plot Supertrend', defval: false, group: G2 },
  { id: 'useRsiFilter', type: 'bool', title: 'RSI Filter ⮕', defval: true, group: G2 },
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1, group: G2 },
  { id: 'overboughtLowerLevel', type: 'int', title: 'RSI 🪫 Sell ⮕ Above⬆', defval: 70, min: 0, max: 100, group: G2 },
  { id: 'overboughtUpperLevel', type: 'int', title: 'RSI Sell Below⬇', defval: 100, min: 0, max: 100, group: G2 },
  { id: 'oversoldLowerLevel', type: 'int', title: 'RSI 🔋 Buy ⮕ Above⬆', defval: 1, min: 0, max: 100, group: G2 },
  { id: 'oversoldUpperLevel', type: 'int', title: 'RSI Buy Below⬇', defval: 35, min: 0, max: 100, group: G2 },
  { id: 'useMfiFilter', type: 'bool', title: 'MFI Filter ⮕', defval: false, group: G2 },
  { id: 'mfiLength', type: 'int', title: 'MFI Length', defval: 14, min: 1, group: G2 },
  { id: 'mfiOverboughtLowerLevel', type: 'int', title: 'MFI 🪫 Sell ⮕ Above⬆', defval: 70, min: 0, max: 100, group: G2 },
  { id: 'mfiOverboughtUpperLevel', type: 'int', title: 'MFI Sell Below⬇', defval: 100, min: 0, max: 100, group: G2 },
  { id: 'mfiOversoldLowerLevel', type: 'int', title: 'MFI 🔋 Buy ⮕ Above⬆', defval: 1, min: 0, max: 100, group: G2 },
  { id: 'mfiOversoldUpperLevel', type: 'int', title: 'MFI Buy Below⬇', defval: 30, min: 0, max: 100, group: G2 },
  { id: 'useStochFilter', type: 'bool', title: 'Stoch Filter ⮕', defval: false, group: G2 },
  { id: 'stochLength', type: 'int', title: 'Stoch Length', defval: 14, min: 1, group: G2 },
  { id: 'stochOverboughtLowerLevel', type: 'int', title: 'Stoch 🪫 Sell ⮕ Above⬆', defval: 70, min: 0, max: 100, group: G2 },
  { id: 'stochOverboughtUpperLevel', type: 'int', title: 'Stoch Sell Below⬇', defval: 120, min: 0, max: 120, group: G2 },
  { id: 'stochOversoldLowerLevel', type: 'int', title: 'Stoch 🔋 Buy ⮕ Above⬆', defval: 1, min: 0, max: 100, group: G2 },
  { id: 'stochOversoldUpperLevel', type: 'int', title: 'Stoch Buy Below⬇', defval: 30, min: 0, max: 100, group: G2 },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: [...MA_TYPES], group: G4 },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: [...MA_TYPES], group: G4 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G4 },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, max: 50, group: G4 },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 12, group: G4 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 26, group: G4 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Supertrend', color: color.green, lineWidth: 1, style: 'linebr', forceOverlay: true },
  { id: 'plot1', title: 'Histogram', color: '#26A69A', lineWidth: 1, style: 'columns' },
  { id: 'plot2', title: 'MACD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot3', title: 'Signal', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot4', title: '🔌Connector🔌', color: String(color.new(color.white, 100)), lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'MACD Sniper [trade_lexx]',
  shortTitle: 'MACD Sniper [trade_lexx]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Pine `for i = a to b`: counts up, or down when a > b */
function pineRange(a: number, b: number): number[] {
  const out: number[] = [];
  if (a <= b) for (let i = a; i <= b; i++) out.push(i);
  else for (let i = a; i >= b; i--) out.push(i);
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdSniperInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = S(bars.map((b) => b.volume ?? NaN));
  const atrOf = (len: number) => A(ta.atr(bars, len));

  // kama(source, length): `var float sma_val = ta.sma(source, length)` is set on the first bar only, so the line
  // starts from the SMA of the first bar (na unless length is 1) and stays na while it is na
  const kama = (source: number[], length: number): number[] => {
    const smaVal = A(ta.sma(S(source), length))[0] ?? NaN;
    const volatility = A(ta.stdev(S(source), length));
    const atr = atrOf(length);
    const out: number[] = new Array(n);
    let k = NaN;
    for (let i = 0; i < n; i++) {
      const er = volatility[i] / atr[i];
      // sc := math.max(0.666, math.min(0.0645, math.pow(efficiency_ratio, 2))): na stays na
      const sc = Math.max(0.666, Math.min(0.0645, Math.pow(er, 2)));
      k = isNaN(k) ? smaVal : sc * source[i] + (1 - sc) * k;
      out[i] = k;
    }
    return out;
  };
  const ema = (source: number[], length: number) => A(ta.ema(S(source), length));
  const ma = (source: number[], length: number, type: MacdSniperMaType): number[] => {
    switch (type) {
      case 'SMA': return A(ta.sma(S(source), length));
      case 'EMA': return ema(source, length);
      case 'WMA': return A(ta.wma(S(source), length));
      case 'VWMA': return A(ta.vwma(S(source), length, volume));
      case 'KAMA': return kama(source, length);
      case 'HMA': return A(ta.hma(S(source), length));
      case 'ZLEMA': {
        // ema[lag] with lag = (length - 1) / 2: the fractional history offset is truncated
        const lag = Math.trunc((length - 1) / 2);
        if (lag < 0) throw new Error(`Invalid number of bars back: ${lag}`);
        const e = ema(source, length);
        return e.map((_v, i) => (i - lag >= 0 ? e[i - lag] : NaN));
      }
      case 'TEMA': {
        const e1 = ema(source, length);
        const e2 = ema(e1, length);
        const e3 = ema(e2, length);
        return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
      }
      case 'ALMA': return A(ta.alma(S(source), length, 0.85, 6));
      case 'DEMA': {
        const e1 = ema(source, length);
        const e2 = ema(e1, length);
        return e1.map((v, i) => 2 * v - e2[i]);
      }
      default: return new Array(n).fill(NaN);
    }
  };

  const src = A(getSourceSeries(bars, cfg.src));
  const fastMa = ma(src, cfg.fastLength, cfg.smaSource);
  const slowMa = ma(src, cfg.slowLength, cfg.smaSource);
  const macd = fastMa.map((v, i) => v - slowMa[i]);
  const signal = ma(macd, cfg.signalLength, cfg.smaSignal);
  const hist = macd.map((v, i) => v - signal[i]);
  const histAt = (i: number, k: number) => (i - k >= 0 ? hist[i - k] : NaN);

  const rsi = A(ta.rsi(S(src), cfg.rsiLength));
  const mfi = A(ta.mfi(getSourceSeries(bars, 'hlc3'), cfg.mfiLength, volume));
  const stoch = A(ta.stoch(getSourceSeries(bars, 'close'), getSourceSeries(bars, 'high'), getSourceSeries(bars, 'low'), cfg.stochLength));
  const [stSeries, dirSeries] = ta.supertrend(bars, cfg.factor, cfg.atrPeriod);
  const supertrend = A(stSeries);
  const direction = A(dirSeries);

  const inRange = (v: number, lo: number, hi: number) => ge(v, lo) && le(v, hi);
  const growingRange = pineRange(1, cfg.minGrowingBars);
  const fallingRange = pineRange(1, cfg.minFallingBars);
  const checkIndex = (k: number) => {
    if (k < 0) throw new Error(`Invalid number of bars back: ${k}`);
  };

  let lastSignalBar = NaN; // var int last_signal_bar = na
  let lastSignal = NaN; // var int last_signal = na
  let histIncreasing = false;
  let histDecreasing = false;
  let buySignalGiven = false;
  let sellSignalGiven = false;
  let plotHistBuy = false;
  let plotHistSell = false;
  let plotMaBuy = false;
  let plotMaSell = false;
  const finalSignal: number[] = new Array(n);
  const buyFlags: boolean[] = new Array(n), sellFlags: boolean[] = new Array(n);
  const markers: MarkerData[] = [];
  const green = color.green;
  const red = color.red;
  const textColor = color.blue; // Pine plotshape default text colour

  for (let i = 0; i < n; i++) {
    const h = hist[i];
    const h1 = histAt(i, 1);
    const prevIncreasing = histIncreasing; // hist_increasing[1]
    const prevDecreasing = histDecreasing; // hist_decreasing[1]
    if (gt(h, h1)) {
      histIncreasing = true;
      histDecreasing = false;
    } else if (lt(h, h1)) {
      histIncreasing = false;
      histDecreasing = true;
    }
    if (histIncreasing && prevDecreasing) buySignalGiven = false;
    if (histDecreasing && prevIncreasing) sellSignalGiven = false;

    // is_growing_above_zero(n) / is_falling_below_zero(n): na history values do not reset the flag
    let growing = true;
    for (const k of growingRange) {
      checkIndex(k);
      if (le(histAt(i, k), histAt(i, k + 1)) || le(histAt(i, k), 0)) growing = false;
    }
    let falling = true;
    for (const k of fallingRange) {
      checkIndex(k);
      if (ge(histAt(i, k), histAt(i, k + 1)) || ge(histAt(i, k), 0)) falling = false;
    }

    const newSignalAllowed = isNaN(lastSignalBar) || i - lastSignalBar > cfg.minBarsBetweenSignals;
    let preciseBuy: boolean = newSignalAllowed && !buySignalGiven && histIncreasing && lt(h1, 0) && lt(h, 0) && gt(h, h1) && falling;
    let preciseSell: boolean = newSignalAllowed && !sellSignalGiven && histDecreasing && gt(h1, 0) && gt(h, 0) && lt(h, h1) && growing;

    const filters = (buy: boolean, sell: boolean): [boolean, boolean] => {
      if (cfg.useRsiFilter) {
        buy = buy && inRange(rsi[i], cfg.oversoldLowerLevel, cfg.oversoldUpperLevel);
        sell = sell && inRange(rsi[i], cfg.overboughtLowerLevel, cfg.overboughtUpperLevel);
      }
      if (cfg.useMfiFilter) {
        buy = buy && inRange(mfi[i], cfg.mfiOversoldLowerLevel, cfg.mfiOversoldUpperLevel);
        sell = sell && inRange(mfi[i], cfg.mfiOverboughtLowerLevel, cfg.mfiOverboughtUpperLevel);
      }
      if (cfg.useStochFilter) {
        buy = buy && inRange(stoch[i], cfg.stochOversoldLowerLevel, cfg.stochOversoldUpperLevel);
        sell = sell && inRange(stoch[i], cfg.stochOverboughtLowerLevel, cfg.stochOverboughtUpperLevel);
      }
      if (cfg.useSupertrendFilter) {
        buy = buy && gt(direction[i], 0);
        sell = sell && lt(direction[i], 0);
      }
      if (cfg.waitForOppositeSignal) {
        buy = buy && (isNaN(lastSignal) || lastSignal === -1);
        sell = sell && (isNaN(lastSignal) || lastSignal === 1);
      }
      return [buy, sell];
    };

    [preciseBuy, preciseSell] = filters(preciseBuy, preciseSell);
    if (preciseBuy || preciseSell) {
      lastSignalBar = i;
      lastSignal = preciseBuy ? 1 : -1;
      buySignalGiven = preciseBuy;
      sellSignalGiven = preciseSell;
    }

    // ta.crossover / ta.crossunder(macd, signal): exact comparisons
    const crossUp = i > 0 && macd[i] > signal[i] && macd[i - 1] <= signal[i - 1];
    const crossDown = i > 0 && macd[i] < signal[i] && macd[i - 1] >= signal[i - 1];
    let maBuy = newSignalAllowed && crossUp;
    let maSell = newSignalAllowed && crossDown;
    [maBuy, maSell] = filters(maBuy, maSell);
    if (maBuy || maSell) {
      lastSignalBar = i;
      lastSignal = maBuy ? 1 : -1;
    }

    if (cfg.useHistSignals) {
      plotHistBuy = preciseBuy;
      plotHistSell = preciseSell;
    }
    if (cfg.useMaSignals) {
      plotMaBuy = maBuy;
      plotMaSell = maSell;
    }
    const finalBuy = (cfg.useHistSignals && preciseBuy) || (cfg.useMaSignals && maBuy);
    const finalSell = (cfg.useHistSignals && preciseSell) || (cfg.useMaSignals && maSell);
    finalSignal[i] = finalBuy ? 1 : finalSell ? -1 : 0;
    buyFlags[i] = finalBuy;
    sellFlags[i] = finalSell;

    const t = bars[i].time;
    // id: the plotshape output (shape0 .. shape7 in declaration order)
    const shape = (on: boolean, buy: boolean, onPrice: boolean, text: string, id: string) => {
      if (!on) return;
      markers.push({
        time: t,
        position: onPrice ? (buy ? 'belowBar' : 'aboveBar') : buy ? 'bottom' : 'top',
        shape: buy ? 'triangleUp' : 'triangleDown',
        color: buy ? green : red,
        text,
        textColor,
        ...(onPrice ? { forceOverlay: true } : {}),
        id,
      });
    };
    shape(plotHistBuy, true, true, 'Buy', 'shape0');
    shape(plotHistSell, false, true, 'Sell', 'shape1');
    shape(plotHistBuy, true, false, 'H', 'shape2');
    shape(plotHistSell, false, false, 'H', 'shape3');
    shape(plotMaBuy, true, true, 'Buy', 'shape4');
    shape(plotMaSell, false, true, 'Sell', 'shape5');
    shape(plotMaBuy, true, false, 'MA', 'shape6');
    shape(plotMaSell, false, false, 'MA', 'shape7');
  }

  const histColor = (i: number) => {
    const h = hist[i];
    const h1 = histAt(i, 1);
    return ge(h, 0) ? (lt(h1, h) ? '#26A69A' : '#B2DFDB') : lt(h1, h) ? '#FFCDD2' : '#FF5252';
  };
  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(plot_supertrend ? supertrend : na, "Supertrend", direction < 0 ? green : red, style_linebr, force_overlay)
      plot0: bars.map((b, i) => ({
        time: b.time, value: cfg.plotSupertrend ? finite(supertrend[i]) : NaN, color: lt(direction[i], 0) ? green : red,
      })),
      plot1: bars.map((b, i) => ({ time: b.time, value: finite(hist[i]), color: histColor(i) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: finite(macd[i]), color: '#2962FF' })),
      plot3: bars.map((b, i) => ({ time: b.time, value: finite(signal[i]), color: '#FF6D00' })),
      plot4: bars.map((b, i) => ({ time: b.time, value: finalSignal[i], color: String(color.new(color.white, 100)) })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: String(color.new('#787B86', 50)), linestyle: 'dashed' } }],
    markers,
    // alertcondition(final_buy_signal, ...) / alertcondition(final_sell_signal, ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MACD Buy Signal', message: 'MACD Buy Signal Triggered' },
  { id: 'alert1', title: 'MACD Sell Signal', message: 'MACD Sell Signal Triggered' },
];

export const MacdSniper = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
