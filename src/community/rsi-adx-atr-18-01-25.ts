/**
 * RSI + ADX + ATR 18-01-25
 *
 * RSI of the source (RMA of the gains and of the losses), a simple ADX (SMA of |+DM - -DM| / (+DM + -DM) * 100,
 * with +DM / -DM the RMA of the positive high change and of the positive negated low change) and the ATR, in one
 * pane. The background is red when the RSI is between the two bounds, the ADX is under its threshold and the ATR is
 * under its threshold.
 * Alert (alertcondition, `alerts` of the result): 'RSI, ADX, and ATR Condition Met', true on the bars of that condition.
 *
 * Reference: "RSI + ADX + ATR 15-01" by dipak11298
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface RsiAdxAtr180125Inputs {
  rsiLength: number;
  rsiSource: SourceType;
  /** RSI lower bound of the background condition */
  rsiLowerBound: number;
  /** RSI upper bound of the background condition */
  rsiUpperBound: number;
  adxLength: number;
  adxThreshold: number;
  atrLength: number;
  atrThreshold: number;
}

export const defaultInputs: RsiAdxAtr180125Inputs = {
  rsiLength: 14,
  rsiSource: 'close',
  rsiLowerBound: 40,
  rsiUpperBound: 60,
  adxLength: 14,
  adxThreshold: 20,
  atrLength: 14,
  atrThreshold: 2.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'rsiSource', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'rsiLowerBound', type: 'int', title: 'RSI Lower Bound for BG Color', defval: 40, min: 0, max: 100 },
  { id: 'rsiUpperBound', type: 'int', title: 'RSI Upper Bound for BG Color', defval: 60, min: 0, max: 100 },
  { id: 'adxLength', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxThreshold', type: 'int', title: 'ADX Threshold', defval: 20 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14 },
  { id: 'atrThreshold', type: 'float', title: 'ATR Threshold', defval: 2.5 },
];

const ADX_COLOR = String(color.rgb(234, 255, 2));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RSI', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'ADX', color: ADX_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'ATR', color: color.purple, lineWidth: 1 },
];

export const metadata = {
  title: 'RSI + ADX + ATR 15-01',
  shortTitle: 'RSI + ADX + ATR',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiAdxAtr180125Inputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // change = ta.change(src); math.max(na, 0) is na
  const src = A(getSourceSeries(bars, cfg.rsiSource));
  const gain: number[] = new Array(n);
  const loss: number[] = new Array(n);
  const hiUp: number[] = new Array(n);
  const loDown: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const change = i > 0 ? src[i] - src[i - 1] : NaN;
    gain[i] = isNaN(change) ? NaN : Math.max(change, 0);
    loss[i] = isNaN(change) ? NaN : -Math.min(change, 0);
    const chHigh = i > 0 ? bars[i].high - bars[i - 1].high : NaN;
    const chLow = i > 0 ? bars[i].low - bars[i - 1].low : NaN;
    hiUp[i] = isNaN(chHigh) ? NaN : Math.max(chHigh, 0);
    loDown[i] = isNaN(chLow) ? NaN : Math.max(-chLow, 0);
  }
  const up = A(ta.rma(S(gain), cfg.rsiLength));
  const down = A(ta.rma(S(loss), cfg.rsiLength));
  // rsi = down == 0 ? 100 : up == 0 ? 0 : 100 - (100 / (1 + up / down))
  const rsi = bars.map((_b, i) => (eq(down[i], 0) ? 100 : eq(up[i], 0) ? 0 : 100 - 100 / (1 + up[i] / down[i])));

  const plusDI = A(ta.rma(S(hiUp), cfg.adxLength));
  const minusDI = A(ta.rma(S(loDown), cfg.adxLength));
  // Plain division: 0 / 0 is na, ta.sma skips it as Pine
  const dx = bars.map((_b, i) => (Math.abs(plusDI[i] - minusDI[i]) / (plusDI[i] + minusDI[i])) * 100);
  const adx = A(ta.sma(S(dx), cfg.adxLength));
  const atr = A(ta.atr(bars, cfg.atrLength));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const bg = String(color.rgb(255, 59, 59, 73));
  const bgColors: BgColorData[] = [];
  const condFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    // bgcolor((rsi > lower and rsi < upper) and adx < adxThreshold and atr < atrThreshold ? color.rgb(255, 59, 59, 73) : na)
    const cond = gt(rsi[i], cfg.rsiLowerBound) && lt(rsi[i], cfg.rsiUpperBound) && lt(adx[i], cfg.adxThreshold)
      && lt(atr[i], cfg.atrThreshold);
    condFlags.push(cond);
    if (cond) bgColors.push({ time: bars[i].time, color: bg });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(rsi[i]) })),
      plot1: bars.map((b, i) => ({ time: b.time, value: fin(adx[i]) })),
      plot2: bars.map((b, i) => ({ time: b.time, value: fin(atr[i]) })),
    },
    hlines: [
      { value: cfg.rsiUpperBound, options: { title: 'RSI Upper Bound (Dynamic)', color: color.red, linestyle: 'dashed' } },
      { value: cfg.rsiLowerBound, options: { title: 'RSI Lower Bound (Dynamic)', color: color.green, linestyle: 'dashed' } },
      { value: cfg.adxThreshold, options: { title: 'ADX Threshold', color: color.gray, linestyle: 'dashed' } },
    ],
    bgColors,
    // alertcondition(the background condition, "RSI, ADX, and ATR Condition Met")
    alerts: alertStates(alertConditions, bars, [condFlags]),
  };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  {
    id: 'alert0',
    title: 'RSI, ADX, and ATR Condition Met',
    message: 'RSI is between custom bounds, ADX is below the threshold, and ATR is below the threshold.',
  },
];

export const RsiAdxAtr180125 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
