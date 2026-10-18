/**
 * MACD Liquidity Tracker System
 *
 * MACD line (EMA(fast) - EMA(slow) of the close) drawn as a histogram. Above 0 it is bright blue when it rises
 * against the MACD of the previous close, dark blue otherwise; at or below 0 it is bright magenta when it falls,
 * dark magenta otherwise. The system type turns these colours into long / short states (Fast: bright blue or dark
 * magenta is long; Normal: MACD above / below 0; Safe: only bright blue is long). Candles on the price pane take
 * the state colour, triangles mark the first bar of a long / short state, and a trend moving average (SMA, EMA,
 * WMA, HMA, RMA, LSMA, DEMA, TEMA or VIDYA) is drawn on the price pane.
 * Alerts (alertcondition, `alerts` of the result): the four histogram colour states (dark blue, dark magenta, no
 * leverage = dark blue / dark magenta / bright magenta, bright blue), the close above / below the trend MA and the
 * first bar of a long / short state (whatever signals are shown).
 *
 * Reference: "MACD Liquidity Tracker System" by PROFABIGHI_CAPITAL
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LiquidityTrckr
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MacdLiquidityTrackerSystemType = 'Fast' | 'Normal' | 'Safe';
export type MacdLiquidityTrackerMaType = 'SMA' | 'EMA' | 'WMA' | 'HMA' | 'RMA' | 'LSMA' | 'DEMA' | 'TEMA' | 'VIDYA';
export type MacdLiquidityTrackerSignalDisplay = 'Both' | 'Long Only' | 'Short Only' | 'None';

export interface MacdLiquidityTrackerSystemInputs {
  /** Fast EMA length of the MACD */
  fastMA: number;
  /** Slow EMA length of the MACD */
  slowMA: number;
  /** System type: how the histogram colours give the long / short states */
  systemChoice: MacdLiquidityTrackerSystemType;
  /** Trend moving average type */
  maType: MacdLiquidityTrackerMaType;
  /** Trend moving average length */
  maLength: number;
  /** VIDYA volatility (standard deviation) length */
  vidyaVolatilityLength: number;
  /** Signal triangles shown */
  signalDisplay: MacdLiquidityTrackerSignalDisplay;
  /** Show the "Long" / "Short" text on the triangles */
  showText: boolean;
}

export const defaultInputs: MacdLiquidityTrackerSystemInputs = {
  fastMA: 12,
  slowMA: 26,
  systemChoice: 'Normal',
  maType: 'EMA',
  maLength: 50,
  vidyaVolatilityLength: 9,
  signalDisplay: 'Both',
  showText: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastMA', type: 'int', title: 'FMA', defval: 12, min: 7, group: 'MACD S' },
  { id: 'slowMA', type: 'int', title: 'SMA', defval: 26, min: 7, group: 'MACD S' },
  { id: 'systemChoice', type: 'string', title: 'System Type', defval: 'Normal', options: ['Fast', 'Normal', 'Safe'], group: 'System Logic' },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA', options: ['SMA', 'EMA', 'WMA', 'HMA', 'RMA', 'LSMA', 'DEMA', 'TEMA', 'VIDYA'], group: 'Trend MA Settings' },
  { id: 'maLength', type: 'int', title: 'MA Length', defval: 50, min: 1, group: 'Trend MA Settings' },
  { id: 'vidyaVolatilityLength', type: 'int', title: 'VIDYA Volatility Length', defval: 9, min: 1, group: 'Trend MA Settings' },
  { id: 'signalDisplay', type: 'string', title: 'Show Signals', defval: 'Both', options: ['Both', 'Long Only', 'Short Only', 'None'], group: 'Signal Display' },
  { id: 'showText', type: 'bool', title: 'Show Signal Text', defval: true, group: 'Signal Display' },
];

const BRIGHT_BLUE = String(color.rgb(0, 169, 230));
const DARK_BLUE_TRANSP = String(color.rgb(2, 25, 225, 31));
const BRIGHT_MAGENTA = String(color.rgb(255, 0, 238));
const DARK_MAGENTA_TRANSP = String(color.rgb(178, 0, 169, 17));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD Histogram', color: BRIGHT_BLUE, lineWidth: 3, style: 'histogram' },
  // Pine force_overlay = true: the trend MA is drawn on the price pane
  { id: 'plot1', title: 'Trend MA', color: color.gray, lineWidth: 1, forceOverlay: true },
];

export const metadata = {
  title: 'MACD Liquidity Tracker System',
  shortTitle: 'LqdtyTrckr -> MACD Version',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdLiquidityTrackerSystemInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);
  const len = cfg.maLength;

  // --- MA calculation (the input is constant: the selected branch runs on every bar) ---
  let smoothedMA: number[];
  switch (cfg.maType) {
    case 'SMA':
      smoothedMA = A(ta.sma(closeS, len));
      break;
    case 'WMA':
      smoothedMA = A(ta.wma(closeS, len));
      break;
    case 'HMA':
      smoothedMA = A(ta.hma(closeS, len));
      break;
    case 'RMA':
      smoothedMA = A(ta.rma(closeS, len));
      break;
    case 'LSMA':
      smoothedMA = A(ta.linreg(closeS, len, 0));
      break;
    case 'DEMA': {
      const ema1 = A(ta.ema(closeS, len));
      const ema2 = A(ta.ema(S(ema1), len));
      smoothedMA = ema1.map((v, i) => 2 * v - ema2[i]);
      break;
    }
    case 'TEMA': {
      const ema1 = A(ta.ema(closeS, len));
      const ema2 = A(ta.ema(S(ema1), len));
      const ema3 = A(ta.ema(S(ema2), len));
      smoothedMA = ema1.map((v, i) => 3 * v - 3 * ema2[i] + ema3[i]);
      break;
    }
    case 'VIDYA': {
      const vl = cfg.vidyaVolatilityLength;
      const sd = A(ta.stdev(closeS, vl));
      const sdSd = A(ta.stdev(S(sd), vl));
      const alpha = 2.0 / (len + 1);
      smoothedMA = new Array(n);
      let prev = NaN; // vidyaValue[1]
      for (let i = 0; i < n; i++) {
        // k = stdev / stdev(stdev): a plain division (x / 0 is +-infinity, 0 / 0 na), then clamped to [0, 1]
        let k = sd[i] / sdSd[i];
        k = gt(k, 1.0) ? 1.0 : lt(k, 0.0) ? 0.0 : k;
        // vidyaValue := alpha * k * close + (1 - alpha * k) * nz(vidyaValue[1], close)
        const v = alpha * k * close[i] + (1 - alpha * k) * (isNaN(prev) ? close[i] : prev);
        smoothedMA[i] = v;
        prev = v;
      }
      break;
    }
    case 'EMA':
    default:
      smoothedMA = A(ta.ema(closeS, len));
      break;
  }

  // --- MACD of the close and of the previous close ---
  const [macdS] = ta.macd(closeS, cfg.fastMA, cfg.slowMA, 9);
  const currentMacd = A(macdS);
  const [prevMacdS] = ta.macd(S(close.map((_c, i) => (i > 0 ? close[i - 1] : NaN))), cfg.fastMA, cfg.slowMA, 9);
  const previousMacd = A(prevMacdS);

  const showLong = cfg.signalDisplay === 'Both' || cfg.signalDisplay === 'Long Only';
  const showShort = cfg.signalDisplay === 'Both' || cfg.signalDisplay === 'Short Only';

  const plot0: { time: number; value: number; color?: string }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const candles: PlotCandleData[] = [];
  const markers: MarkerData[] = [];
  const flags: boolean[][] = Array.from({ length: 8 }, () => [] as boolean[]);
  let longSignal = false; // var bool longSignal = false
  let shortSignal = false; // var bool shortSignal = false
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const cur = currentMacd[i];
    const prev = previousMacd[i];
    // plotColor: na when currentMacd is na
    let plotColor: string | null = null;
    if (gt(cur, 0)) plotColor = gt(cur, prev) ? BRIGHT_BLUE : DARK_BLUE_TRANSP;
    else if (le(cur, 0)) plotColor = lt(cur, prev) ? BRIGHT_MAGENTA : DARK_MAGENTA_TRANSP;
    const isBrightBlue = plotColor === BRIGHT_BLUE;
    const isDarkBlueTransp = plotColor === DARK_BLUE_TRANSP;
    const isBrightMagenta = plotColor === BRIGHT_MAGENTA;
    const isDarkMagentaTransp = plotColor === DARK_MAGENTA_TRANSP;

    const prevLong = longSignal; // longSignal[1] (false on bar 0)
    const prevShort = shortSignal;
    if (cfg.systemChoice === 'Fast') {
      longSignal = isBrightBlue || isDarkMagentaTransp;
      shortSignal = isDarkBlueTransp || isBrightMagenta;
    } else if (cfg.systemChoice === 'Normal') {
      longSignal = gt(cur, 0);
      shortSignal = lt(cur, 0);
    } else if (cfg.systemChoice === 'Safe') {
      longSignal = isBrightBlue;
      shortSignal = isDarkBlueTransp || isBrightMagenta || isDarkMagentaTransp;
    }
    const candleColor = longSignal ? BRIGHT_BLUE : shortSignal ? BRIGHT_MAGENTA : 'transparent';

    plot0.push({ time: b.time, value: Number.isFinite(cur) ? cur : NaN, ...(plotColor ? { color: plotColor } : {}) });
    plot1.push({ time: b.time, value: Number.isFinite(smoothedMA[i]) ? smoothedMA[i] : NaN });

    const longEntry = longSignal && !prevLong;
    const shortEntry = shortSignal && !prevShort;
    // plotshape(..., location.belowbar / abovebar, color = candleColor, shape.triangleup / triangledown, size.small,
    //   text = "Long" / "Short" (with text only), textcolor = candleColor, force_overlay = true)
    // ids: the outputs "... with Text" (shape0 / shape1) when showText, "... without Text" (shape2 / shape3) otherwise
    if (showLong && longEntry) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: candleColor, size: 'small',
        ...(cfg.showText ? { text: 'Long', textColor: candleColor } : {}), forceOverlay: true,
        id: cfg.showText ? 'shape0' : 'shape2' });
    }
    if (showShort && shortEntry) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: candleColor, size: 'small',
        ...(cfg.showText ? { text: 'Short', textColor: candleColor } : {}), forceOverlay: true,
        id: cfg.showText ? 'shape1' : 'shape3' });
    }
    // alertconditions: isNeutralBuy_Orig, isNeutralSell_Orig, isNoLeverage_Orig, isLeverage_Orig, isAboveMA,
    // isBelowMA, longEntryCondition, shortEntryCondition
    [isDarkBlueTransp, isDarkMagentaTransp, isDarkMagentaTransp || isDarkBlueTransp || isBrightMagenta, isBrightBlue,
      gt(b.close, smoothedMA[i]), lt(b.close, smoothedMA[i]), longEntry, shortEntry].forEach((f, k) => flags[k].push(f));
    // plotcandle(open, high, low, close, color / wickcolor / bordercolor = candleColor, force_overlay = true)
    candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, color: candleColor,
      wickColor: candleColor, borderColor: candleColor, forceOverlay: true });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    hlines: [{ value: 0, options: { title: 'Zero line', color: color.gray, linestyle: 'dashed' } }],
    markers,
    plotCandles: { coloredCandles: candles },
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Color: Dark Blue Transp', message: 'Dark Blue Transp color detected.' },
  { id: 'alert1', title: 'Color: Dark Magenta Transp', message: 'Dark Magenta Transp color detected.' },
  { id: 'alert2', title: 'Color: No Leverage Colors', message: 'Indicator shows Dark Blue T, Dark Magenta T, or Bright Magenta.' },
  { id: 'alert3', title: 'Color: Bright Blue', message: 'Bright Blue (Leverage) color detected.' },
  { id: 'alert4', title: 'Price Above MA', message: 'Price is above the selected MA.' },
  { id: 'alert5', title: 'Price Below MA', message: 'Price is below the selected MA.' },
  { id: 'alert6', title: 'Long Entry Signal Trigger', message: 'Long entry signal (triangle) detected.' },
  { id: 'alert7', title: 'Short Entry Signal Trigger', message: 'Short entry signal (triangle) detected.' },
];

export const MacdLiquidityTrackerSystem = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
