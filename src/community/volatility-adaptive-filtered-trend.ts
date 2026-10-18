/**
 * Volatility Adaptive Filtered Trend
 *
 * An adaptive trend follows the source with a smoothing constant between a minimum and a maximum: the factor is the
 * mean of ATR / SMA(ATR) and |src - src[volLength]| / its SMA, halved and clamped to 0..1. The trend is smoothed
 * by an EMA, then by an Ehlers displacement-weighted filter (weights |ema[i] - ema[i + momentum]| over the filter
 * length; SMA when all weights are 0). Bands = trend * (1 +/- multiplier * stdev of the source returns, one bar
 * back). A close above the upper band starts a bullish regime, a close below the lower band a bearish regime:
 * LONG / SHORT markers on the changes, trend line, fill and bar colours by regime.
 * Alerts (alertcondition, `alerts` of the result): 'Long Signal' / 'Short Signal' on the regime changes.
 *
 * Reference: "Volatility Adaptive Filtered Trend [SchizoQuant]" by SchizoQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © SchizoQuant
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolatilityAdaptiveFilteredTrendInputs {
  src: SourceType;
  /** ATR and net change length */
  volLength: number;
  /** SMA length of the normalisation */
  normalLength: number;
  /** Minimum smoothing constant */
  minSC: number;
  /** Maximum smoothing constant */
  maxSC: number;
  /** EMA length applied to the adaptive trend */
  emaLength: number;
  /** Ehlers filter length */
  ehlersLength: number;
  /** Ehlers momentum length */
  ehlersMomentum: number;
  /** Return stdev length of the bands */
  bandVolLength: number;
  upperMult: number;
  lowerMult: number;
  showBands: boolean;
  showFill: boolean;
  showSignals: boolean;
  colorBars: boolean;
  longColor: string;
  shortColor: string;
}

const LONG_COLOR = String(color.rgb(57, 255, 20));
const SHORT_COLOR = String(color.rgb(138, 43, 226));

export const defaultInputs: VolatilityAdaptiveFilteredTrendInputs = {
  src: 'hlc3',
  volLength: 15,
  normalLength: 30,
  minSC: 0.084,
  maxSC: 0.33,
  emaLength: 5,
  ehlersLength: 9,
  ehlersMomentum: 2,
  bandVolLength: 22,
  upperMult: 2.0,
  lowerMult: 2.0,
  showBands: true,
  showFill: true,
  showSignals: true,
  colorBars: true,
  longColor: LONG_COLOR,
  shortColor: SHORT_COLOR,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'hlc3' },
  { id: 'volLength', type: 'int', title: 'Volatility Length', defval: 15, min: 2 },
  { id: 'normalLength', type: 'int', title: 'Normalization Length', defval: 30, min: 5 },
  { id: 'minSC', type: 'float', title: 'Minimum Smoothing', defval: 0.084, min: 0.001, max: 1.0, step: 0.001 },
  { id: 'maxSC', type: 'float', title: 'Maximum Smoothing', defval: 0.33, min: 0.001, max: 1.0, step: 0.001 },
  { id: 'emaLength', type: 'int', title: 'EMA Smoothing', defval: 5, min: 1 },
  { id: 'ehlersLength', type: 'int', title: 'Filter Length', defval: 9, min: 2 },
  { id: 'ehlersMomentum', type: 'int', title: 'Momentum Length', defval: 2, min: 1 },
  { id: 'bandVolLength', type: 'int', title: 'Volatility Length', defval: 22, min: 2 },
  { id: 'upperMult', type: 'float', title: 'Upper Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'lowerMult', type: 'float', title: 'Lower Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'showBands', type: 'bool', title: 'Show Bands', defval: true },
  { id: 'showFill', type: 'bool', title: 'Show Fill', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Signals', defval: true },
  { id: 'colorBars', type: 'bool', title: 'Color Bars', defval: true },
  { id: 'longColor', type: 'color', title: 'Bullish Color', defval: LONG_COLOR },
  { id: 'shortColor', type: 'color', title: 'Bearish Color', defval: SHORT_COLOR },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Filtered Adaptive Trend', color: LONG_COLOR, lineWidth: 2 },
  { id: 'plot1', title: 'Upper Volatility Band', color: String(color.new(LONG_COLOR, 35)), lineWidth: 1 },
  { id: 'plot2', title: 'Lower Volatility Band', color: String(color.new(SHORT_COLOR, 35)), lineWidth: 1 },
];

export const metadata = {
  title: 'Volatility Adaptive Filtered Trend',
  shortTitle: 'Volatility Adaptive Filtered Trend',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); a != b false with na */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolatilityAdaptiveFilteredTrendInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));
  const close = bars.map((b) => b.close);

  const atr = A(ta.atr(bars, cfg.volLength));
  const netChange = src.map((v, i) => (i - cfg.volLength >= 0 ? Math.abs(v - src[i - cfg.volLength]) : NaN));
  const atrBaseline = A(ta.sma(S(atr), cfg.normalLength));
  const changeBaseline = A(ta.sma(S(netChange), cfg.normalLength));

  // adaptiveTrend := na(adaptiveTrend[1]) ? src : adaptiveTrend[1] + adaptiveSC * (src - adaptiveTrend[1])
  const adaptiveTrend: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // x != 0.0 ? a / x : 1.0 (na != 0 is false)
    const atrFactor = ne(atrBaseline[i], 0) ? atr[i] / atrBaseline[i] : 1.0;
    const changeFactor = ne(changeBaseline[i], 0) ? netChange[i] / changeBaseline[i] : 1.0;
    const combined = (atrFactor + changeFactor) * 0.5;
    const normalized = Math.max(0, Math.min(1, combined / 2));
    const sc = cfg.minSC + (cfg.maxSC - cfg.minSC) * normalized;
    const prev = i > 0 ? adaptiveTrend[i - 1] : NaN;
    adaptiveTrend[i] = isNaN(prev) ? src[i] : prev + sc * (src[i] - prev);
  }
  const emaTrend = A(ta.ema(S(adaptiveTrend), cfg.emaLength));
  const fallback = A(ta.sma(S(emaTrend), cfg.ehlersLength));

  const trendMA: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let num = 0;
    let sum = 0;
    for (let k = 0; k < cfg.ehlersLength; k++) {
      const cur = i - k >= 0 ? emaTrend[i - k] : NaN;
      const ref = i - k - cfg.ehlersMomentum >= 0 ? emaTrend[i - k - cfg.ehlersMomentum] : NaN;
      if (!isNaN(cur) && !isNaN(ref)) {
        const coef = Math.abs(cur - ref);
        num += coef * cur;
        sum += coef;
      }
    }
    trendMA[i] = gt(sum, 0) ? num / sum : fallback[i];
  }

  // priceReturn = src[1] != 0.0 ? (src - src[1]) / src[1] : 0.0; volatility = ta.stdev(priceReturn, len)[1]
  const priceReturn = src.map((v, i) => (i > 0 && ne(src[i - 1], 0) ? (v - src[i - 1]) / src[i - 1] : 0.0));
  const sd = A(ta.stdev(S(priceReturn), cfg.bandVolLength));
  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  const sq: number[] = new Array(n);
  let SQ = 0; // var int SQ = 0
  for (let i = 0; i < n; i++) {
    const vol = i > 0 ? sd[i - 1] : NaN;
    upper[i] = trendMA[i] + cfg.upperMult * vol * trendMA[i];
    lower[i] = trendMA[i] - cfg.lowerMult * vol * trendMA[i];
    if (gt(close[i], upper[i])) SQ = 1;
    else if (lt(close[i], lower[i])) SQ = -1;
    sq[i] = SQ;
  }

  const t = (i: number) => bars[i].time;
  const col = (i: number) => (sq[i] === 1 ? cfg.longColor : cfg.shortColor);
  const upperCol = String(color.new(cfg.longColor, 35));
  const lowerCol = String(color.new(cfg.shortColor, 35));
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // longSignal = SQ == 1 and SQ[1] != 1 (SQ[1] is na on the first bar: false)
    const prev = i > 0 ? sq[i - 1] : NaN;
    longFlags.push(sq[i] === 1 && ne(prev, 1));
    shortFlags.push(sq[i] === -1 && ne(prev, -1));
    if (cfg.showSignals && sq[i] === 1 && ne(prev, 1)) {
      markers.push({ time: t(i), position: 'belowBar', shape: 'triangleUp', color: cfg.longColor, size: 'small',
        text: 'LONG', textColor: color.white });
    }
    if (cfg.showSignals && sq[i] === -1 && ne(prev, -1)) {
      markers.push({ time: t(i), position: 'aboveBar', shape: 'triangleDown', color: cfg.shortColor, size: 'small',
        text: 'SHORT', textColor: color.white });
    }
    if (cfg.colorBars) barColors.push({ time: t(i), color: col(i) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: trendMA[i], color: col(i) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? upper[i] : NaN, color: upperCol })),
      plot2: bars.map((b, i) => ({ time: b.time, value: cfg.showBands ? lower[i] : NaN, color: lowerCol })),
    },
    // fill(upperPlot, lowerPlot, "Volatility Band Fill", showFill ? color.new(col, 90) : na)
    fills: [{
      plot1: 'plot1', plot2: 'plot2', options: { title: 'Volatility Band Fill' },
      colors: bars.map((_b, i) => (cfg.showFill ? String(color.new(col(i), 90)) : 'transparent')),
    }],
    markers,
    barColors,
    // alertcondition(longSignal) / alertcondition(shortSignal)
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Signal', message: 'Volatility Adaptive Filtered Trend Long Signal on {{ticker}}' },
  { id: 'alert1', title: 'Short Signal', message: 'Volatility Adaptive Filtered Trend Short Signal on {{ticker}}' },
];

export const VolatilityAdaptiveFilteredTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
