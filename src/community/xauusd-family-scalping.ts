/**
 * XAUUSD Family Scalping (5min)
 *
 * A channel around the SMA of the candle midpoint, with a half width of the average range * scale / 100, widened by
 * the ratio of the average body to the average range. The oscillator is the close position in the channel (-50 at
 * the lower band, +50 at the upper band, not clamped), with an SMA signal line. The background is green when the
 * oscillator is above its signal and red when below. Buy: the oscillator crosses over the oversold level. Sell: it
 * crosses under the overbought level.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of each signal.
 *
 * Reference: "XAUUSD Family Scalping (5min)" by cupra_inc
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData, MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface XauusdFamilyScalpingInputs {
  /** SMA length of the midpoint, range and body */
  len: number;
  /** Channel scale (%) */
  scale: number;
  /** SMA length of the signal line */
  signalLen: number;
  overbought: number;
  oversold: number;
}

export const defaultInputs: XauusdFamilyScalpingInputs = {
  len: 30,
  scale: 200.0,
  signalLen: 20,
  overbought: 58,
  oversold: -58,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 30 },
  { id: 'scale', type: 'float', title: 'Scale (%)', defval: 200.0, min: 100 },
  { id: 'signalLen', type: 'int', title: 'Signal Length', defval: 20 },
  { id: 'overbought', type: 'float', title: 'Overbought', defval: 58 },
  { id: 'oversold', type: 'float', title: 'Oversold', defval: -58 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VCO', color: color.lime, lineWidth: 2 },
  { id: 'plot1', title: 'Signal', color: color.yellow, lineWidth: 1 },
];

export const metadata = {
  title: 'XAUUSD Family Scalping (5min)',
  shortTitle: 'XAUUSD Family Scalping (5min)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<XauusdFamilyScalpingInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const mid = A(ta.sma(S(bars.map((b) => (b.high + b.low) / 2)), cfg.len));
  const rng = A(ta.sma(S(bars.map((b) => b.high - b.low)), cfg.len));
  const body = A(ta.sma(S(bars.map((b) => Math.abs(b.close - b.open))), cfg.len));
  const osc: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // offset = rng * scale / 100 * (1 + body / math.max(rng, 1e-10))
    const offset = ((rng[i] * cfg.scale) / 100) * (1 + body[i] / Math.max(rng[i], 1e-10));
    const up = mid[i] + offset;
    const dn = mid[i] - offset;
    const band = Math.max(up - dn, 1e-10);
    osc[i] = (100 * (bars[i].close - dn)) / band - 50;
  }
  const sig = A(ta.sma(S(osc), cfg.signalLen));

  const bull = String(color.new(color.lime, 90));
  const bear = String(color.new(color.red, 90));
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // bgcolor(osc > sig ? color.new(bullColor, 90) : osc < sig ? color.new(bearColor, 90) : na)
    if (gt(osc[i], sig[i])) bgColors.push({ time: t, color: bull });
    else if (lt(osc[i], sig[i])) bgColors.push({ time: t, color: bear });
    if (i === 0) continue;
    // ta.crossover(osc, oversold) / ta.crossunder(osc, overbought): exact comparisons (no 1e-10 tolerance), a tie on
    // the previous bar counts, na gives false
    buyFlags[i] = osc[i] > cfg.oversold && osc[i - 1] <= cfg.oversold;
    sellFlags[i] = osc[i] < cfg.overbought && osc[i - 1] >= cfg.overbought;
    if (buyFlags[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'large', text: 'BUY', textColor: color.white });
    }
    if (sellFlags[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'large', text: 'SELL', textColor: color.white });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(osc, "VCO", color.new(osc > sig ? color.lime : color.red, 0), linewidth = 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: osc[i], color: gt(osc[i], sig[i]) ? color.lime : color.red })),
      plot1: bars.map((b, i) => ({ time: b.time, value: sig[i], color: color.yellow })),
    },
    hlines: [
      { value: 0, options: { title: 'Zero', color: String(color.new(color.gray, 60)), linestyle: 'dashed' } },
      { value: cfg.overbought, options: { title: 'Overbought', color: String(color.new(color.red, 60)), linestyle: 'dotted' } },
      { value: cfg.oversold, options: { title: 'Oversold', color: String(color.new(color.green, 60)), linestyle: 'dotted' } },
    ],
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** alertcondition(buySignal / sellSignal) of the original */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'BUY: Oscillator crossed above oversold (-58)' },
  { id: 'alert1', title: 'Sell Signal', message: 'SELL: Oscillator crossed below overbought (58)' },
];

export const XauusdFamilyScalping = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
