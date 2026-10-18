/**
 * Bullish Volume Anomaly
 *
 * An ATR zigzag (reversal when price moves ATR * multiplier against the last swing high / low) signs the volume:
 * +volume in an up leg, -volume in a down leg. Its cumulative sum and the close are turned into z-scores over 480
 * bars (s and p); c is the 480-bar change of p divided by its 480-bar stdev. Bands around an EMA of the close:
 * ema * (1 +- mean(|open - close| / open over the band length) * band multiplier), drawn one bar late. A triangle
 * below the bar marks s - p > 2, c < 1, s > 0 and a high below the previous lower band.
 * Alert (alertcondition, `alerts` of the result): '{{ticker}}', true on the bars of a triangle.
 *
 * Reference: "Bullish Volume Anomaly" by UnknownUnicorn13336802
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertcondition (title '{{ticker}}', no message) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: '{{ticker}}', message: 'Alert Fired!' },
];

export interface BullishVolumeAnomalyInputs {
  /** ATR length of the zigzag */
  atrLength: number;
  /** ATR multiplier of the zigzag reversal */
  atrMult: number;
  /** Band multiplier */
  bandMult: number;
  /** Band length (EMA length and window of the open / close range) */
  bandLength: number;
}

export const defaultInputs: BullishVolumeAnomalyInputs = {
  atrLength: 14,
  atrMult: 3.0,
  bandMult: 5.0,
  bandLength: 288,
};

export const inputConfig: InputConfig[] = [
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'atrMult', type: 'float', title: 'ATR Multiplier for ZigZag', defval: 3.0 },
  { id: 'bandMult', type: 'float', title: 'Band Multiplier', defval: 5.0 },
  { id: 'bandLength', type: 'int', title: 'Band Length', defval: 288 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Upper Band', color: color.green, lineWidth: 1 },
  { id: 'plot2', title: 'Lower Band', color: color.red, lineWidth: 1 },
];

export const metadata = {
  title: 'Bullish Volume Anomaly',
  shortTitle: 'Bullish Volume Anomaly',
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
  inputs: Partial<BullishVolumeAnomalyInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const W = 480;

  // Single ATR zigzag; the volume is signed by the trend after this bar's update
  const atr = A(ta.atr(bars, cfg.atrLength));
  const signedVolume: number[] = new Array(n);
  let LL = NaN;
  let HH = NaN;
  let trend = 1;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i === 0) {
      LL = b.low;
      HH = b.high;
      trend = 1;
    }
    const thr = atr[i] * cfg.atrMult;
    let nextLL = LL;
    let nextHH = HH;
    let nextTrend = trend;
    if (!isNaN(thr)) {
      if (trend > 0) {
        if (ge(b.high, HH)) nextHH = b.high;
        else if (lt(b.low, HH - thr)) {
          nextTrend = -1;
          nextLL = b.low;
        }
      } else if (le(b.low, LL)) nextLL = b.low;
      else if (gt(b.high, LL + thr)) {
        nextTrend = 1;
        nextHH = b.high;
      }
    }
    LL = nextLL;
    HH = nextHH;
    trend = nextTrend;
    signedVolume[i] = nextTrend === 1 ? (b.volume ?? NaN) : -(b.volume ?? NaN);
  }

  // Z-scores; plain divisions (x / 0 is +-infinity, 0 / 0 na)
  const ss = A(ta.cum(S(signedVolume)));
  const ssMean = A(ta.sma(S(ss), W));
  const ssDev = A(ta.stdev(S(ss), W));
  const s = ss.map((v, i) => (v - ssMean[i]) / ssDev[i]);
  const close = bars.map((b) => b.close);
  const cMean = A(ta.sma(S(close), W));
  const cDev = A(ta.stdev(S(close), W));
  const p = close.map((v, i) => (v - cMean[i]) / cDev[i]);
  const pDev = A(ta.stdev(S(p), W));
  const c = p.map((v, i) => (i >= W ? v - p[i - W] : NaN) / pDev[i]);

  // close_range(l): sum of |open[i] - close[i]| / open[i] for i = 0 .. l - 1 (open[i] != 0), divided by l
  const l = cfg.bandLength;
  const ema = A(ta.ema(S(close), l));
  const up: number[] = new Array(n);
  const down: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let mean = 0.0;
    for (let k = 0; k <= l - 1; k++) {
      const o = i - k >= 0 ? bars[i - k].open : NaN;
      if (!isNaN(o) && Math.abs(o) > EPS) mean = mean + Math.abs(o - bars[i - k].close) / o;
    }
    const range = mean / l;
    up[i] = ema[i] * (1 + range * cfg.bandMult);
    down[i] = ema[i] * (1 - range * cfg.bandMult);
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const markers: MarkerData[] = [];
  const signalFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    if (gt(s[i] - p[i], 2) && lt(c[i], 1) && gt(s[i], 0) && lt(bars[i].high, down[i - 1])) {
      signalFlags[i] = true;
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'normal' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(ema[i]), color: color.blue })),
      plot1: bars.map((b, i) => ({ time: b.time, value: i > 0 ? fin(up[i - 1]) : NaN, color: color.green })),
      plot2: bars.map((b, i) => ({ time: b.time, value: i > 0 ? fin(down[i - 1]) : NaN, color: color.red })),
    },
    markers,
    // alertcondition(s-p>2 and c<1 and s>0 and high<down[1], '{{ticker}}')
    alerts: alertStates(alertConditions, bars, [signalFlags]),
  };
}

export const BullishVolumeAnomaly = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
