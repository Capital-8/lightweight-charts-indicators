/**
 * QuantumTrend SwiftEdge
 *
 * A Supertrend on hlc3 (ATR, or SMA of the true range, times a multiplier), Keltner Channels (EMA of the close
 * +/- ATR * multiplier) and a trend EMA. The sensitivity (1..5) sets all lengths and multipliers unless the manual
 * settings are used. The Supertrend line is drawn only when the close is within ATR * factor of it. Buy: the
 * Supertrend turns up, the close crosses over the upper Keltner band and is above the EMA; Sell is the mirror.
 * The lines and fills take a red-to-green colour from a 5-bar EMA of the trend (-1 / 1); the EMA is green in an
 * up trend and red in a down trend.
 * Alerts (alertcondition, `alerts` of the result): 'QuantumTrend SwiftEdge Buy' / 'QuantumTrend SwiftEdge Sell' (the
 * signals, also with the signals hidden) and 'Trend Change' (the Supertrend direction changes).
 *
 * Reference: "QuantumTrend SwiftEdge" by SwiftEdge
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'QuantumTrend SwiftEdge Buy', message: 'QuantumTrend SwiftEdge Buy Signal!' },
  { id: 'alert1', title: 'QuantumTrend SwiftEdge Sell', message: 'QuantumTrend SwiftEdge Sell Signal!' },
  { id: 'alert2', title: 'Trend Change', message: 'QuantumTrend SwiftEdge Trend Change!' },
];

export interface QuantumTrendSwiftEdgeInputs {
  /** Use the manual settings instead of the sensitivity */
  useManualSettings: boolean;
  /** Signal sensitivity (1 = low, 5 = high) */
  sensitivity: number;
  /** ATR (RMA of the true range) when true, SMA of the true range when false */
  changeATR: boolean;
  showSignals: boolean;
  /** Highlight fill between OHLC4 and the visible Supertrend line */
  highlighting: boolean;
  manualAtrPeriod: number;
  manualMultiplier: number;
  manualKcLength: number;
  manualKcMultiplier: number;
  manualKcAtrLength: number;
  manualEmaLength: number;
}

export const defaultInputs: QuantumTrendSwiftEdgeInputs = {
  useManualSettings: false,
  sensitivity: 3,
  changeATR: true,
  showSignals: true,
  highlighting: true,
  manualAtrPeriod: 10,
  manualMultiplier: 3.0,
  manualKcLength: 20,
  manualKcMultiplier: 1.5,
  manualKcAtrLength: 10,
  manualEmaLength: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'useManualSettings', type: 'bool', title: 'Use Manual Settings? (If unchecked, uses Sensitivity)', defval: false },
  { id: 'sensitivity', type: 'int', title: 'Signal Sensitivity (1=Low, 5=High)', defval: 3, min: 1, max: 5, step: 1 },
  { id: 'changeATR', type: 'bool', title: 'Change ATR Calculation Method?', defval: true },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals?', defval: true },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off?', defval: true },
  { id: 'manualAtrPeriod', type: 'int', title: 'ATR Period (Manual)', defval: 10, min: 1 },
  { id: 'manualMultiplier', type: 'float', title: 'ATR Multiplier (Manual)', defval: 3.0, min: 0.1, step: 0.1 },
  { id: 'manualKcLength', type: 'int', title: 'Keltner Channel Length (Manual)', defval: 20, min: 1 },
  { id: 'manualKcMultiplier', type: 'float', title: 'Keltner Channel Multiplier (Manual)', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'manualKcAtrLength', type: 'int', title: 'Keltner ATR Length (Manual)', defval: 10, min: 1 },
  { id: 'manualEmaLength', type: 'int', title: 'EMA Length (Manual)', defval: 100, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Up Trend', color: '#00FF00', lineWidth: 2 },
  { id: 'plot1', title: 'Down Trend', color: '#FF0000', lineWidth: 2 },
  { id: 'plot2', title: 'Keltner Upper', color: '#00FF00', lineWidth: 1 },
  { id: 'plot3', title: 'Keltner Lower', color: '#00FF00', lineWidth: 1 },
  { id: 'plot4', title: '100 EMA', color: color.green, lineWidth: 2 },
  { id: 'plot5', title: 'OHLC4', color: 'transparent', lineWidth: 1, style: 'circles' },
];

export const metadata = {
  title: 'QuantumTrend SwiftEdge',
  shortTitle: 'QuantumTrend SwiftEdge',
  overlay: true,
  precision: 2,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Value of the sensitivity 1..5 (Pine: sensitivity == 1 ? a : ... == 4 ? d : e) */
const bySens = (s: number, v: [number, number, number, number, number]) =>
  s === 1 ? v[0] : s === 2 ? v[1] : s === 3 ? v[2] : s === 4 ? v[3] : v[4];

export function calculate(
  bars: Bar[],
  inputs: Partial<QuantumTrendSwiftEdgeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const sens = cfg.sensitivity;
  const manual = cfg.useManualSettings;

  const atrPeriod = manual ? cfg.manualAtrPeriod : bySens(sens, [14, 12, 10, 8, 6]);
  const multiplier = manual ? cfg.manualMultiplier : bySens(sens, [4.0, 3.5, 3.0, 2.5, 2.0]);
  const kcLength = manual ? cfg.manualKcLength : bySens(sens, [30, 25, 20, 15, 10]);
  const kcMultiplier = manual ? cfg.manualKcMultiplier : bySens(sens, [2.0, 1.75, 1.5, 1.25, 1.0]);
  const kcAtrLength = manual ? cfg.manualKcAtrLength : bySens(sens, [14, 12, 10, 8, 6]);
  const emaLength = manual ? cfg.manualEmaLength : bySens(sens, [150, 125, 100, 75, 50]);
  const thresholdFactor = bySens(sens, [2.0, 1.5, 1.0, 0.75, 0.5]);

  // Supertrend: src = hlc3; atr = changeATR ? ta.atr(atrPeriod) : ta.sma(ta.tr, atrPeriod)
  const close = bars.map((b) => b.close);
  const atr = cfg.changeATR ? A(ta.atr(bars, atrPeriod)) : A(ta.sma(ta.tr(bars), atrPeriod));
  const up: number[] = new Array(n).fill(NaN);
  const dn: number[] = new Array(n).fill(NaN);
  const trendArr: number[] = new Array(n).fill(1);
  let trend = 1; // var int trend = 1
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const src = (b.high + b.low + b.close) / 3;
    let u = src - multiplier * atr[i];
    const up1 = i > 0 && !isNaN(up[i - 1]) ? up[i - 1] : u; // nz(up[1], up)
    const c1 = i > 0 ? close[i - 1] : NaN;
    u = gt(c1, up1) ? Math.max(u, up1) : u;
    let d = src + multiplier * atr[i];
    const dn1 = i > 0 && !isNaN(dn[i - 1]) ? dn[i - 1] : d; // nz(dn[1], dn)
    d = lt(c1, dn1) ? Math.min(d, dn1) : d;
    up[i] = u;
    dn[i] = d;
    // trend := nz(trend[1], trend); trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
    trend = trend === -1 && gt(close[i], dn1) ? 1 : trend === 1 && lt(close[i], up1) ? -1 : trend;
    trendArr[i] = trend;
  }

  // Keltner Channels and EMA
  const emaKC = A(ta.ema(S(close), kcLength));
  const kcAtr = A(ta.atr(bars, kcAtrLength));
  const kcUpper = emaKC.map((e, i) => e + kcMultiplier * kcAtr[i]);
  const kcLower = emaKC.map((e, i) => e - kcMultiplier * kcAtr[i]);
  const ema100 = A(ta.ema(S(close), emaLength));

  // Gradient colour from ta.ema(trend, 5): (trendSmooth + 1) / 2 from red (0) to green (1)
  const trendSmooth = A(ta.ema(S(trendArr), 5));
  const gradientColor = trendSmooth.map((ts) => {
    const f = (ts + 1) / 2;
    return String(color.rgb(Math.round(255 + f * (0 - 255)), Math.round(0 + f * (255 - 0)), Math.round(0 + f * (0 - 0))));
  });

  const idx = bars.map((_b, i) => i);
  const t = (i: number) => bars[i].time;
  const showUp: boolean[] = new Array(n);
  const showDn: boolean[] = new Array(n);
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  // ta.change(trend) != 0 (na on bar 0: false)
  const changeFlags = trendArr.map((v, i) => i > 0 && v !== trendArr[i - 1]);
  // ta.crossover(a, b): a > b and a[1] <= b[1] (exact comparisons: no 1e-10 tolerance, unlike the operators)
  const crossover = (a: number[], b: number[], i: number) => i > 0 && a[i] > b[i] && a[i - 1] <= b[i - 1];
  for (let i = 0; i < n; i++) {
    const threshold = atr[i] * thresholdFactor;
    const distanceUp = close[i] - up[i];
    const distanceDown = dn[i] - close[i];
    showUp[i] = trendArr[i] === 1 && ge(distanceUp, 0) && le(distanceUp, threshold);
    showDn[i] = trendArr[i] === -1 && ge(distanceDown, 0) && le(distanceDown, threshold);

    const prev = i > 0 ? trendArr[i - 1] : NaN;
    const buySignal = gt(close[i], ema100[i]) && crossover(close, kcUpper, i) && trendArr[i] === 1 && prev === -1;
    const sellSignal = lt(close[i], ema100[i]) && crossover(kcLower, close, i) && trendArr[i] === -1 && prev === 1;
    buyFlags.push(buySignal);
    sellFlags.push(sellSignal);
    // plotshape(buySignal and showSignals ? up : na, location.absolute, shape.labelup, color.green, size.tiny, "Buy")
    if (buySignal && cfg.showSignals && !isNaN(up[i])) {
      markers.push({ time: t(i), position: 'atPriceBottom', price: up[i], shape: 'labelUp', color: color.green,
        size: 'tiny', text: 'Buy', textColor: color.white });
    }
    if (sellSignal && cfg.showSignals && !isNaN(dn[i])) {
      markers.push({ time: t(i), position: 'atPriceTop', price: dn[i], shape: 'labelDown', color: color.red,
        size: 'tiny', text: 'Sell', textColor: color.white });
    }
  }

  const noFill = String(color.new(color.white, 100));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: {
      plot0: idx.map((i) => ({ time: t(i), value: showUp[i] ? up[i] : NaN, color: gradientColor[i] })),
      plot1: idx.map((i) => ({ time: t(i), value: showDn[i] ? dn[i] : NaN, color: gradientColor[i] })),
      plot2: idx.map((i) => ({ time: t(i), value: kcUpper[i], color: gradientColor[i] })),
      plot3: idx.map((i) => ({ time: t(i), value: kcLower[i], color: gradientColor[i] })),
      plot4: idx.map((i) => ({ time: t(i), value: ema100[i], color: trendArr[i] === 1 ? color.green : color.red })),
      plot5: idx.map((i) => {
        const b = bars[i];
        return { time: t(i), value: (b.open + b.high + b.low + b.close) / 4 };
      }),
    },
    fills: [
      // fill(kcUpperPlot, kcLowerPlot, color.new(gradientColor, 90), title = "Keltner Channel Fill")
      {
        plot1: 'plot2', plot2: 'plot3', options: { title: 'Keltner Channel Fill' },
        colors: gradientColor.map((c) => String(color.new(c, 90))),
      },
      // fill(mPlot, upPlot, highlighting and showUpTrend ? color.new(gradientColor, 90) : color.new(color.white, 100))
      {
        plot1: 'plot5', plot2: 'plot0', options: { title: 'Up Trend Highlight' },
        colors: idx.map((i) => (cfg.highlighting && showUp[i] ? String(color.new(gradientColor[i], 90)) : noFill)),
      },
      {
        plot1: 'plot5', plot2: 'plot1', options: { title: 'Down Trend Highlight' },
        colors: idx.map((i) => (cfg.highlighting && showDn[i] ? String(color.new(gradientColor[i], 90)) : noFill)),
      },
    ],
    markers,
    // alertcondition(buySignal), (sellSignal), (ta.change(trend) != 0)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, changeFlags]),
  };
}

export const QuantumTrendSwiftEdge = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
