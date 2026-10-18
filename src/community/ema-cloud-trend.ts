/**
 * EMA Cloud Trend
 *
 * Three EMAs of the close (fast, medium, slow). An inner cloud fills the space between the fast and medium EMAs; an
 * outer cloud between the medium and slow EMAs is green when the fast EMA is above the slow EMA and red otherwise.
 * Crossovers of the fast EMA above / below the slow EMA give BUY / SELL triangles and labels.
 *
 * Alerts (alertcondition, `alerts` of the result), on closed bars: 'BUY Signal' / 'SELL Signal' when the trend (fast
 * EMA above / below the slow EMA) turns up / down from the trend saved on the last closed bar, 'Trend Change' on
 * both. Chart context (optional third argument): `lastBarConfirmed` (true without a context) tells whether the last
 * bar is closed.
 *
 * Reference: "EMA Cloud Trend ─ Clean BUY/SELL" by ZkalishTR
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface EmaCloudTrendInputs {
  fastLen: number;
  midLen: number;
  slowLen: number;
}

export const defaultInputs: EmaCloudTrendInputs = {
  fastLen: 8,
  midLen: 18,
  slowLen: 36,
};

export const inputConfig: InputConfig[] = [
  { id: 'fastLen', type: 'int', title: 'Fast EMA', defval: 8 },
  { id: 'midLen', type: 'int', title: 'Medium EMA', defval: 18 },
  { id: 'slowLen', type: 'int', title: 'Slow EMA', defval: 36 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA 8', color: '#089981', lineWidth: 2 },
  { id: 'plot1', title: 'EMA 18', color: '#ffb74d', lineWidth: 2 },
  { id: 'plot2', title: 'EMA 36', color: '#e91e63', lineWidth: 2 },
];

export const metadata = {
  title: 'EMA Cloud Trend ─ Clean BUY/SELL',
  shortTitle: 'EMA Cloud Trend ─ Clean BUY/SELL',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<EmaCloudTrendInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const close = Series.fromArray(bars, bars.map((b) => b.close));

  const ema8 = A(ta.ema(close, cfg.fastLen));
  const ema18 = A(ta.ema(close, cfg.midLen));
  const ema36 = A(ta.ema(close, cfg.slowLen));

  const inner = String(color.new('#f3ec21', 80));
  const outerUp = String(color.new('#00e676', 70));
  const outerDn = String(color.new('#ff5252', 70));

  const markers: MarkerData[] = [];
  // ta.crossover(ema8, ema36) / ta.crossunder(ema8, ema36): compared with the last bar where both were not na,
  // exact comparisons (no 1e-10 tolerance)
  let prevA = NaN;
  let prevB = NaN;
  for (let i = 0; i < n; i++) {
    const a = ema8[i];
    const b = ema36[i];
    if (isNaN(a) || isNaN(b)) continue;
    if (!isNaN(prevA)) {
      const t = bars[i].time;
      // previous bar: a[1] <= b[1] (tie counted) / a[1] >= b[1]
      if (a > b && prevA <= prevB) {
        // plotshape(bullCross, "BUY", location.belowbar, #07914e, shape.triangleup, size.small)
        markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: '#07914e', size: 'small' });
        // plotshape(bullCross, "BUY", location.belowbar, color.new(#07914e, 0), shape.labelup, size.tiny, "BUY", white)
        markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: String(color.new('#07914e', 0)),
          size: 'tiny', text: 'BUY', textColor: color.white });
      }
      if (a < b && prevA >= prevB) {
        markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: '#9e0a0a', size: 'small' });
        markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: String(color.new('#9e0a0a', 0)),
          size: 'tiny', text: 'SELL', textColor: color.white });
      }
    }
    prevA = a;
    prevB = b;
  }

  // var int lastTrend = na; trendChanged = not na(lastTrend) and ((lastTrend == -1 and trendUp) or
  // (lastTrend == 1 and trendDown)); if barstate.isconfirmed: lastTrend := trendUp ? 1 : -1
  const lastConfirmed = lastBarConfirmedOf(chart);
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  const changeFlags: boolean[] = [];
  let lastTrend = NaN;
  for (let i = 0; i < n; i++) {
    const trendUp = gt(ema8[i], ema36[i]);
    const trendDown = lt(ema8[i], ema36[i]);
    const trendChanged = !isNaN(lastTrend) && ((lastTrend === -1 && trendUp) || (lastTrend === 1 && trendDown));
    const confirmed = i < n - 1 || lastConfirmed;
    if (confirmed) lastTrend = trendUp ? 1 : -1;
    buyFlags.push(trendChanged && trendUp && confirmed);
    sellFlags.push(trendChanged && trendDown && confirmed);
    changeFlags.push(trendChanged && confirmed);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((bar, i) => ({ time: bar.time, value: ema8[i], color: '#089981' })),
      plot1: bars.map((bar, i) => ({ time: bar.time, value: ema18[i], color: '#ffb74d' })),
      plot2: bars.map((bar, i) => ({ time: bar.time, value: ema36[i], color: '#e91e63' })),
    },
    fills: [
      // fill(p8, p18, color = color.new(#f3ec21, 80), title = "İç Bulut")
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'İç Bulut' }, colors: new Array<string>(n).fill(inner) },
      // fill(p18, p36, color = ema8 > ema36 ? color.new(#00e676, 70) : color.new(#ff5252, 70), title = "Dış Bulut")
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Dış Bulut' },
        colors: ema8.map((e, i) => (gt(e, ema36[i]) ? outerUp : outerDn)) },
    ],
    markers,
    // alertcondition(trendChanged and trendUp / trendDown and barstate.isconfirmed) / (trendChanged and confirmed)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, changeFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY Signal', message: 'EMA Cloud → Strong BUY!' },
  { id: 'alert1', title: 'SELL Signal', message: 'EMA Cloud → Strong SELL!' },
  { id: 'alert2', title: 'Trend Change', message: "EMA Cloud Trend Changed → {{ema8 > ema36 ? 'BUY' : 'SELL'}}" },
];

export const EmaCloudTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
