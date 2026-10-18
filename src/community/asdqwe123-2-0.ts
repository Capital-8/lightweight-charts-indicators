/**
 * Purple Cloud 2.0
 *
 * xh / xl = close +- ATR(Period) * Alpha. a3 = 2 * a1 - a2 with a1 / a2 the volume-weighted MAs of hl2 * volume
 * divided by those of the volume (lengths ceil(Period / 4) and ceil(Period / 2)); a4 = VWMA(a3, Period). b1 is a
 * running mean of the close ((b1[1] * (Period - 1) + close) / Period, seeded by SMA(close, Period)). Buy when
 * a4 <= xl and close > b1, sell when a4 >= xh and close < b1; the state (1 / -1) colours the bars green / red and
 * BUY / SELL labels mark its changes. ATR bands: close +- ATR(ATR Period) * multiplier.
 * Alerts (alertcondition, `alerts` of the result): 'PC Long' / 'PC Short' on the bars of the BUY / SELL labels.
 *
 * Reference: "Purple Cloud 2.0 [ATP]" by luvuoov
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: algotradepro
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PurpleCloud20AtpInputs {
  /** Supertrend ATR length (the script computes ta.supertrend but no output uses it) */
  atrPeriod: number;
  /** Supertrend factor (the script computes ta.supertrend but no output uses it) */
  factor: number;
  /** Period of the ATR, the VWMAs and the running mean */
  x1: number;
  /** ATR multiplier of xh / xl */
  alpha: number;
  /** ATR length of the bands */
  atrBandPeriod: number;
  atrMultiplierUpper: number;
  atrMultiplierLower: number;
}

export const defaultInputs: PurpleCloud20AtpInputs = {
  atrPeriod: 10,
  factor: 3.0,
  x1: 40,
  alpha: 0.9,
  atrBandPeriod: 14,
  atrMultiplierUpper: 1.5,
  atrMultiplierLower: 1.5,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrPeriod', type: 'int', title: 'Supertrend ATR Length', defval: 10 },
  { id: 'factor', type: 'float', title: 'Supertrend Factor', defval: 3.0, step: 0.01 },
  { id: 'x1', type: 'int', title: 'Period', defval: 40 },
  { id: 'alpha', type: 'float', title: 'Alpha', defval: 0.9, step: 0.1 },
  { id: 'atrBandPeriod', type: 'int', title: 'ATR Period', defval: 14, min: 1 },
  { id: 'atrMultiplierUpper', type: 'float', title: 'ATR Multiplier Upper', defval: 1.5 },
  { id: 'atrMultiplierLower', type: 'float', title: 'ATR Multiplier Lower', defval: 1.5 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper ATR Band', color: color.green, lineWidth: 1 },
  { id: 'plot1', title: 'Lower ATR Band', color: color.red, lineWidth: 1 },
];

export const metadata = {
  title: 'Purple Cloud 2.0 [ATP]',
  shortTitle: 'Purple Cloud 2.0 [ATP]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<PurpleCloud20AtpInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const x1 = cfg.x1;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const close = S(closeArr);
  const volume = S(bars.map((b) => b.volume ?? NaN));
  const hl2v = S(bars.map((b) => ((b.high + b.low) / 2) * (b.volume ?? NaN)));

  const x2 = A(ta.atr(bars, x1)).map((v) => v * cfg.alpha);
  // x1 / 4 is a float division in Pine v6; math.ceil gives the length
  const lenA = Math.ceil(x1 / 4);
  const lenB = Math.ceil(x1 / 2);
  const vA = A(ta.vwma(hl2v, lenA, volume));
  const vVolA = A(ta.vwma(volume, lenA, volume));
  const vB = A(ta.vwma(hl2v, lenB, volume));
  const vVolB = A(ta.vwma(volume, lenB, volume));
  const a3 = bars.map((_b, i) => 2 * (vA[i] / vVolA[i]) - vB[i] / vVolB[i]);
  const a4 = A(ta.vwma(S(a3), x1, volume));
  // b1 := na(b1[1]) ? ta.sma(close, x1) : ...: the ta.sma call runs on the bars where b1[1] is na. With a close on
  // every bar these are the consecutive bars from bar 0 until the SMA has x1 values, so its history is the full one.
  const smaClose = A(ta.sma(close, x1));
  const atrBand = A(ta.atr(bars, cfg.atrBandPeriod));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const plot0: { time: number; value: number }[] = [];
  const plot1: { time: number; value: number }[] = [];
  const longFlags: boolean[] = [], shortFlags: boolean[] = [];
  let b1Prev = NaN;
  let xsPrev = NaN; // xs[1] (na before bar 0)
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const c = closeArr[i];
    const xh = c + x2[i];
    const xl = c - x2[i];
    const b1 = isNaN(b1Prev) ? smaClose[i] : (b1Prev * (x1 - 1) + c) / x1;
    const buy = le(a4[i], xl) && gt(c, b1);
    const sell = ge(a4[i], xh) && lt(c, b1);
    // xs = 0; xs := buy ? 1 : sell ? -1 : xs[1]: xs[1] is na on bar 0, so xs stays na until the first signal
    const xs = buy ? 1 : sell ? -1 : xsPrev;
    // xs != xs[1]: false when xs[1] is na
    const changed = !isNaN(xs) && !isNaN(xsPrev) && xs !== xsPrev;

    // alertcondition(buy and xs != xs[1], 'PC Long') / alertcondition(sell and xs != xs[1], 'PC Short')
    longFlags.push(buy && changed);
    shortFlags.push(sell && changed);
    if (xs === 1) barColors.push({ time: t, color: color.green });
    else if (xs === -1) barColors.push({ time: t, color: color.red });
    if (buy && changed) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'BUY',
        textColor: color.white, size: 'tiny' });
    }
    if (sell && changed) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'SELL',
        textColor: color.white, size: 'tiny' });
    }
    // plot(srcUpper + atr * atrMultiplierUpper, color = color.green) / plot(srcLower - atr * atrMultiplierLower, ...)
    plot0.push({ time: t, value: c + atrBand[i] * cfg.atrMultiplierUpper });
    plot1.push({ time: t, value: c - atrBand[i] * cfg.atrMultiplierLower });

    b1Prev = b1;
    xsPrev = xs;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'PC Long', message: 'PC Long' },
  { id: 'alert1', title: 'PC Short', message: 'PC Short' },
];

export const PurpleCloud20Atp = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
