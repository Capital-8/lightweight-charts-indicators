/**
 * RSI + ADX + ATR Combo
 *
 * RSI of the source, an ADX built from the directional movements (RMA of +DM, -DM and the true range, DX, then the
 * RMA of DX) and the ATR, in one pane. The background is fuchsia when the RSI is between the two bounds, the ADX is
 * under its threshold and the ATR is under its threshold (a quiet, range-bound market).
 * Alert (alertcondition, `alerts` of the result): 'All Conditions Met', true on the bars of that condition.
 *
 * Reference: "RSI + ADX + ATR Combo" by shawasutosh
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiAdxAtrComboInputs {
  rsiLen: number;
  rsiSource: SourceType;
  rsiLower: number;
  rsiUpper: number;
  adxLen: number;
  adxThreshold: number;
  atrLen: number;
  atrThreshold: number;
}

export const defaultInputs: RsiAdxAtrComboInputs = {
  rsiLen: 14,
  rsiSource: 'close',
  rsiLower: 40,
  rsiUpper: 60,
  adxLen: 14,
  adxThreshold: 20,
  atrLen: 14,
  atrThreshold: 2.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiSource', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'rsiLower', type: 'int', title: 'RSI Lower Bound', defval: 40 },
  { id: 'rsiUpper', type: 'int', title: 'RSI Upper Bound', defval: 60 },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxThreshold', type: 'int', title: 'ADX Threshold', defval: 20 },
  { id: 'atrLen', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrThreshold', type: 'float', title: 'ATR Threshold', defval: 2.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'ADX', color: color.orange, lineWidth: 1 },
  { id: 'plot2', title: 'ATR', color: color.purple, lineWidth: 1 },
];

export const metadata = {
  title: 'RSI + ADX + ATR Combo',
  shortTitle: 'RSI_ADX_ATR',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiAdxAtrComboInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const rsi = A(ta.rsi(getSourceSeries(bars, cfg.rsiSource), cfg.rsiLen));

  // upMove = high - high[1]; downMove = low[1] - low (na on the first bar: both DM are 0)
  const plusDM: number[] = new Array(n);
  const minusDM: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const up = i > 0 ? bars[i].high - bars[i - 1].high : NaN;
    const down = i > 0 ? bars[i - 1].low - bars[i].low : NaN;
    plusDM[i] = gt(up, down) && gt(up, 0) ? up : 0;
    minusDM[i] = gt(down, up) && gt(down, 0) ? down : 0;
  }
  // tr = ta.tr (the variable: na on the first bar)
  const atrADX = A(ta.rma(ta.tr(bars, false), cfg.adxLen));
  const plusRma = A(ta.rma(S(plusDM), cfg.adxLen));
  const minusRma = A(ta.rma(S(minusDM), cfg.adxLen));
  const dx: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // Plain divisions: x / 0 is +-infinity, 0 / 0 is na; ta.rma skips the non-finite values like na
    const plusDI = (100 * plusRma[i]) / atrADX[i];
    const minusDI = (100 * minusRma[i]) / atrADX[i];
    dx[i] = (100 * Math.abs(plusDI - minusDI)) / (plusDI + minusDI);
  }
  const adx = A(ta.rma(S(dx), cfg.adxLen));
  const atr = A(ta.atr(bars, cfg.atrLen));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const signal = String(color.new(color.fuchsia, 85));
  const bgColors: BgColorData[] = [];
  const comboFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const rsiCond = gt(rsi[i], cfg.rsiLower) && lt(rsi[i], cfg.rsiUpper);
    const adxCond = lt(adx[i], cfg.adxThreshold);
    const atrCond = lt(atr[i], cfg.atrThreshold);
    // bgcolor(comboSignal ? color.new(color.fuchsia, 85) : na)
    const comboSignal = rsiCond && adxCond && atrCond;
    comboFlags.push(comboSignal);
    if (comboSignal) bgColors.push({ time: bars[i].time, color: signal });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(rsi[i]) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(adx[i]) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(atr[i]) })),
    },
    hlines: [
      { value: cfg.rsiLower, options: { title: 'RSI Lower', color: color.green, linestyle: 'dashed' } },
      { value: cfg.rsiUpper, options: { title: 'RSI Upper', color: color.red, linestyle: 'dashed' } },
      { value: cfg.adxThreshold, options: { title: 'ADX Threshold', color: color.gray, linestyle: 'dashed' } },
    ],
    bgColors,
    // alertcondition(comboSignal, "All Conditions Met")
    alerts: alertStates(alertConditions, bars, [comboFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'All Conditions Met', message: 'RSI, ADX, and ATR conditions are all satisfied.' },
];

export const RsiAdxAtrCombo = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
