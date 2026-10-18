/**
 * Quantum Regression Oscillator [ICN]
 *
 * The RSI of the source is smoothed by a linear regression (reg_len bars, offset 0) and then by an EMA. The line is
 * the bullish colour when it rises, else the bearish colour. Bollinger bands (SMA and 2 standard deviations of 50
 * bars) of the oscillator are hidden plots with a fill in the line colour. Divergences: a price pivot low and an
 * oscillator pivot low on the same bar, with a lower low in price and a higher oscillator value than 5 bars before
 * the pivot (bearish: the opposite on pivot highs), drawn as circles at the bottom / top of the pane on the pivot
 * bar.
 * Alerts (alertcondition, `alerts` of the result): 'Oversold Bounce' (the oscillator crosses over the lower band),
 * 'Overbought Rejection' (crosses under the upper band), 'Bullish Divergence' / 'Bearish Divergence' (on the bar that
 * confirms the pivot, not shifted back as the circles).
 *
 * Reference: "Quantum Regression Oscillator [ICN]" by abgthecoder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { barInterval, barTime } from '../bar-time';

export interface QuantumRegressionOscillatorInputs {
  src: SourceType;
  /** RSI length */
  len: number;
  /** EMA smoothing length */
  smooth: number;
  /** Linear regression length */
  regLen: number;
  colBull: string;
  colBear: string;
  /** Show the volatility bands (not used by the Pine outputs) */
  showBands: boolean;
  showDiv: boolean;
  /** Pivot left / right bars of the divergence detection */
  divLook: number;
}

export const defaultInputs: QuantumRegressionOscillatorInputs = {
  src: 'close',
  len: 14,
  smooth: 3,
  regLen: 9,
  colBull: '#00bcd4',
  colBear: '#ff5252',
  showBands: true,
  showDiv: true,
  divLook: 5,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'len', type: 'int', title: 'Length', defval: 14, min: 1 },
  { id: 'smooth', type: 'int', title: 'Smoothing Factor', defval: 3, min: 1 },
  { id: 'regLen', type: 'int', title: 'Linear Regression Length', defval: 9, min: 2 },
  { id: 'colBull', type: 'color', title: 'Bullish Color', defval: '#00bcd4' },
  { id: 'colBear', type: 'color', title: 'Bearish Color', defval: '#ff5252' },
  { id: 'showBands', type: 'bool', title: 'Show Volatility Bands', defval: true },
  { id: 'showDiv', type: 'bool', title: 'Show Divergences', defval: true },
  { id: 'divLook', type: 'int', title: 'Divergence Lookback', defval: 5, min: 1 },
];

const BAND_COLOR = String(color.new(color.gray, 80));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Quantum Oscillator', color: '#00bcd4', lineWidth: 2 },
  { id: 'plot1', title: 'Upper Band', color: BAND_COLOR, lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Lower Band', color: BAND_COLOR, lineWidth: 1, display: 'none' },
];

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Oversold Bounce', message: 'QRO bounced from lower band' },
  { id: 'alert1', title: 'Overbought Rejection', message: 'QRO rejected from upper band' },
  { id: 'alert2', title: 'Bullish Divergence', message: 'Bullish Divergence Detected' },
  { id: 'alert3', title: 'Bearish Divergence', message: 'Bearish Divergence Detected' },
];

export const metadata = {
  title: 'Quantum Regression Oscillator [ICN]',
  shortTitle: 'QRO [ICN]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<QuantumRegressionOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const rawRsi = ta.rsi(getSourceSeries(bars, cfg.src), cfg.len);
  const regRsi = ta.linreg(rawRsi, cfg.regLen, 0);
  const qro = A(ta.ema(regRsi, cfg.smooth));
  const basis = A(ta.sma(S(qro), 50));
  const dev = A(ta.stdev(S(qro), 50));
  const upper = basis.map((b, i) => b + 2.0 * dev[i]);
  const lower = basis.map((b, i) => b - 2.0 * dev[i]);

  // Divergences
  const lb = cfg.divLook;
  const low = bars.map((b) => b.low);
  const high = bars.map((b) => b.high);
  const plPrice = A(ta.pivotlow(S(low), lb, lb));
  const phPrice = A(ta.pivothigh(S(high), lb, lb));
  const plOsc = A(ta.pivotlow(S(qro), lb, lb));
  const phOsc = A(ta.pivothigh(S(qro), lb, lb));
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const bullDiv = (i: number) => !isNaN(plPrice[i]) && !isNaN(plOsc[i])
    && lt(at(low, i - lb), at(low, i - lb - 5)) && gt(at(qro, i - lb), at(qro, i - lb - 5));
  const bearDiv = (i: number) => !isNaN(phPrice[i]) && !isNaN(phOsc[i])
    && gt(at(high, i - lb), at(high, i - lb - 5)) && lt(at(qro, i - lb), at(qro, i - lb - 5));

  // osc_color = qro > qro[1] ? col_bull : col_bear
  const oscColor = qro.map((v, i) => (gt(v, at(qro, i - 1)) ? cfg.colBull : cfg.colBear));

  const interval = barInterval(bars);
  const markers: MarkerData[] = [];
  if (cfg.showDiv) {
    for (let i = 0; i < n; i++) {
      // plotshape(..., offset = -div_look): the shape of bar i is drawn on bar i - div_look
      if (i - lb < 0) continue;
      const time = barTime(bars, i - lb, interval);
      if (bullDiv(i)) markers.push({ time, position: 'bottom', shape: 'circle', color: cfg.colBull, size: 'tiny' });
      if (bearDiv(i)) markers.push({ time, position: 'top', shape: 'circle', color: cfg.colBear, size: 'tiny' });
    }
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(qro[i]), color: oscColor[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(upper[i]), color: BAND_COLOR })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(lower[i]), color: BAND_COLOR })),
    },
    hlines: [{ value: 50, options: { title: 'Midline', color: String(color.new(color.gray, 50)), linestyle: 'dotted' } }],
    fills: [
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Volatility Background' },
        colors: oscColor.map((c) => String(color.new(c, 90))) },
    ],
    markers,
    // alertcondition(ta.crossover(qro, lower_band)), (ta.crossunder(qro, upper_band)), (bull_div), (bear_div)
    alerts: alertStates(alertConditions, bars, [
      crossedOver(qro, lower),
      crossedUnder(qro, upper),
      bars.map((_b, i) => bullDiv(i)),
      bars.map((_b, i) => bearDiv(i)),
    ]),
  };
}

export const QuantumRegressionOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
