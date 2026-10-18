/**
 * Macd + Adx PRO
 *
 * MACD (EMA fast - EMA slow of the close, EMA signal, histogram) coloured with the ADX / DMI. "Sensitive" mode: the
 * histogram is dark green when positive and rising, light green when positive and not rising, red when negative and
 * falling, light red otherwise; the MACD and signal lines are green when the histogram is positive. "Filtered" mode:
 * with a strong trend (ADX >= threshold) the histogram is green when +DI > -DI (dark while the ADX is not falling,
 * else mid / light green as +DI rises or not) and red otherwise (light while the ADX falls); without a strong trend
 * it is grey (light while the ADX falls); the lines are green when +DI > -DI. The ADX and the threshold can be shown.
 * Alerts (alertcondition, `alerts` of the result): 'Strong Buy' (the histogram turns positive; in "Filtered" mode also
 * +DI > -DI) and 'Strong Sell' (it turns negative; in "Filtered" mode also -DI > +DI).
 *
 * Reference: "Macd + Adx Pro by @Eternyworld" by ETERNYWORLD
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MacdAdxProMode = 'Sensitive' | 'Filtered';

export interface MacdAdxProByEternyworldInputs {
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** DI length of ta.dmi */
  adxLength: number;
  /** ADX smoothing of ta.dmi */
  adxSmoothing: number;
  /** ADX level of a strong trend */
  adxThreshold: number;
  showAdx: boolean;
  showAdxThreshold: boolean;
  mode: MacdAdxProMode;
}

export const defaultInputs: MacdAdxProByEternyworldInputs = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  adxLength: 14,
  adxSmoothing: 14,
  adxThreshold: 22,
  showAdx: false,
  showAdxThreshold: false,
  mode: 'Sensitive',
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: ' Fast Length ', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: ' Slow Length ', defval: 26, min: 1 },
  { id: 'signalLength', type: 'int', title: ' Signal Length ', defval: 9, min: 1 },
  { id: 'adxLength', type: 'int', title: ' ADX Length ', defval: 14, min: 1 },
  { id: 'adxSmoothing', type: 'int', title: ' ADX Smoothing ', defval: 14, min: 1 },
  { id: 'adxThreshold', type: 'int', title: ' ADX Threshold ', defval: 22, min: 10 },
  { id: 'showAdx', type: 'bool', title: 'Show ADX', defval: false },
  { id: 'showAdxThreshold', type: 'bool', title: 'Show ADX Threshold', defval: false },
  { id: 'mode', type: 'string', title: 'mode', defval: 'Sensitive', options: ['Sensitive', 'Filtered'] },
];

const LIME_DARK = '#026D42';
const LIME_LIGHT = '#A0F3CB';
const LIME_MID = '#A0F3CB';
const RED_DARK = '#FF0000';
const RED_LIGHT = '#F3C2C2';
const GRAY_DARK = '#f6f6f8a6';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD Histogram', color: LIME_DARK, lineWidth: 2, style: 'columns' },
  { id: 'plot1', title: 'MACD Line', color: LIME_DARK, lineWidth: 2 },
  { id: 'plot2', title: 'Signal Line', color: String(color.new(LIME_DARK, 30)), lineWidth: 2 },
  { id: 'plot3', title: 'ADX', color: 'rgb(246, 246, 247)', lineWidth: 1 },
  { id: 'plot4', title: 'ADX Threshold', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: 'Macd + Adx PRO by @ETERNYWORLD',
  shortTitle: 'Macd + Adx PRO by @ETERNYWORLD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdAdxProByEternyworldInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const [macdS, signalS, histS] = ta.macd(close, cfg.fastLength, cfg.slowLength, cfg.signalLength);
  const macdLine = A(macdS);
  const signalLine = A(signalS);
  const hist = A(histS);
  const [plusS, minusS, adxS] = ta.dmi(bars, cfg.adxLength, cfg.adxSmoothing);
  const diplus = A(plusS);
  const diminus = A(minusS);
  const adx = A(adxS);
  const prev = (a: number[], i: number) => (i > 0 ? a[i - 1] : NaN);

  const sensitive = cfg.mode === 'Sensitive';
  const grayLight = String(color.new('#F6F6F8', 60));
  const limeSignal = String(color.new(LIME_DARK, 30));
  const redSignal = String(color.new(RED_DARK, 30));

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const plot4 = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];
  const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !gt(a, b);
  for (let i = 0; i < bars.length; i++) {
    const t = bars[i].time;
    const strongTrend = ge(adx[i], cfg.adxThreshold);
    const bullish = gt(diplus[i], diminus[i]);
    const adxWeakening = lt(adx[i], prev(adx, i));
    const diplusRising = gt(diplus[i], prev(diplus, i));
    const h = hist[i];
    const histColor = sensitive
      ? (ge(h, 0) ? (gt(h, prev(hist, i)) ? LIME_DARK : LIME_LIGHT) : (lt(h, prev(hist, i)) ? RED_DARK : RED_LIGHT))
      : strongTrend
        ? (bullish ? (adxWeakening ? (diplusRising ? LIME_MID : LIME_LIGHT) : LIME_DARK) : (adxWeakening ? RED_LIGHT : RED_DARK))
        : (adxWeakening ? grayLight : GRAY_DARK);
    const up = sensitive ? gt(h, 0) : bullish;
    // alertcondition(hist > 0 and hist[1] <= 0 and (mode == "Sensitive" or bullish_direction), "Strong Buy")
    buyFlags.push(gt(h, 0) && le(prev(hist, i), 0) && (sensitive || bullish));
    // alertcondition(hist < 0 and hist[1] >= 0 and (mode == "Sensitive" or bearish_direction), "Strong Sell")
    sellFlags.push(lt(h, 0) && ge(prev(hist, i), 0) && (sensitive || gt(diminus[i], diplus[i])));
    plot0.push({ time: t, value: h, color: histColor });
    plot1.push({ time: t, value: macdLine[i], color: up ? LIME_DARK : RED_DARK });
    plot2.push({ time: t, value: signalLine[i], color: up ? limeSignal : redSignal });
    plot3.push({ time: t, value: cfg.showAdx ? adx[i] : NaN, color: 'rgb(246, 246, 247)' });
    plot4.push({ time: t, value: cfg.showAdxThreshold ? cfg.adxThreshold : NaN, color: color.orange });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Strong Buy', message: 'MACD Bullish Cross' },
  { id: 'alert1', title: 'Strong Sell', message: 'MACD Bearish Cross' },
];

export const MacdAdxProByEternyworld = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
