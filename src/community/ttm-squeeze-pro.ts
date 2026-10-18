/**
 * TTM Squeeze Pro
 *
 * John Carter's TTM Squeeze Pro. Three Keltner Channel widths (1x, 1.5x, 2x)
 * for squeeze detection with enhanced squeeze classification.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar), as the original computes them: no squeeze = the
 * lower Bollinger Band below the lower widest Keltner Channel or the upper band above the upper one (Keltner basis:
 * SMA of the source, width: SMA of the true range times KC Mult 3); "Squeeze Started" when the bar before had no
 * squeeze and this bar has one ("Alert Price Action Squeeze" on), else "Squeeze Fired" when this bar has no squeeze
 * and the bar before had one ("Alert Squeeze Firing" on).
 *
 * Reference: "TTM Squeeze Pro" by John Carter
 */

import { Series, ta, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { AlertCall } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface TTMSqueezeProInputs {
  bbLength: number;
  bbMult: number;
  kcLength: number;
  kcMult1: number;
  kcMult2: number;
  kcMult3: number;
  src: SourceType;
  /** alert("Squeeze Started") calls (`alertCalls`); no effect on the other outputs */
  detectSqzStart: boolean;
  /** alert("Squeeze Fired") calls (`alertCalls`); no effect on the other outputs */
  detectSqzFire: boolean;
}

export const defaultInputs: TTMSqueezeProInputs = {
  bbLength: 20,
  bbMult: 2.0,
  kcLength: 20,
  kcMult1: 1.0,
  kcMult2: 1.5,
  kcMult3: 2.0,
  src: 'close',
  detectSqzStart: true,
  detectSqzFire: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'bbLength', type: 'int', title: 'BB Length', defval: 20, min: 1 },
  { id: 'bbMult', type: 'float', title: 'BB MultFactor', defval: 2.0, min: 0.01, step: 0.5 },
  { id: 'kcLength', type: 'int', title: 'KC Length', defval: 20, min: 1 },
  { id: 'kcMult1', type: 'float', title: 'KC Mult 1 (Tight)', defval: 1.0, min: 0.01, step: 0.5 },
  { id: 'kcMult2', type: 'float', title: 'KC Mult 2 (Normal)', defval: 1.5, min: 0.01, step: 0.5 },
  { id: 'kcMult3', type: 'float', title: 'KC Mult 3 (Wide)', defval: 2.0, min: 0.01, step: 0.5 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'detectSqzStart', type: 'bool', title: 'Alert Price Action Squeeze', defval: true },
  { id: 'detectSqzFire', type: 'bool', title: 'Alert Squeeze Firing', defval: true },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Momentum', color: '#26A69A', lineWidth: 4, style: 'histogram' },
  { id: 'plot1', title: 'Squeeze', color: '#787B86', lineWidth: 2, style: 'cross' },
];

export const metadata = {
  title: 'TTM Squeeze Pro',
  shortTitle: 'TTMSqzPro',
  overlay: false,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<TTMSqueezeProInputs> = {},
): IndicatorResult & { alertCalls: AlertCall[] } {
  const { bbLength, bbMult, kcLength, kcMult1, kcMult2, kcMult3, src, detectSqzStart, detectSqzFire } = { ...defaultInputs, ...inputs };
  const source = getSourceSeries(bars, src);

  // Bollinger Bands
  const bbBasis = ta.sma(source, bbLength);
  const bbDev = ta.stdev(source, bbLength).mul(bbMult);
  const upperBB = bbBasis.add(bbDev);
  const lowerBB = bbBasis.sub(bbDev);

  // 3 Keltner Channel levels
  const [kcUpper1, , kcLower1] = ta.kc(bars, source, kcLength, kcMult1, true);
  const [kcUpper2, , kcLower2] = ta.kc(bars, source, kcLength, kcMult2, true);
  const [kcUpper3, , kcLower3] = ta.kc(bars, source, kcLength, kcMult3, true);

  // Squeeze states
  const sqz1On = lowerBB.gt(kcLower1).and(upperBB.lt(kcUpper1));
  const sqz2On = lowerBB.gt(kcLower2).and(upperBB.lt(kcUpper2));
  const sqz3On = lowerBB.gt(kcLower3).and(upperBB.lt(kcUpper3));
  const sqz1Arr = sqz1On.toArray();
  const sqz2Arr = sqz2On.toArray();
  const sqz3Arr = sqz3On.toArray();

  // Momentum: linreg(close - avg((highest+lowest)/2, sma), kcLength, 0)
  const highSeries = new Series(bars, (bar) => bar.high);
  const lowSeries = new Series(bars, (bar) => bar.low);
  const hh = ta.highest(highSeries, kcLength);
  const ll = ta.lowest(lowSeries, kcLength);
  const donchianMid = hh.add(ll).div(2);
  const smaClose = ta.sma(source, kcLength);
  const midline = donchianMid.add(smaClose).div(2);
  const val = ta.linreg(source.sub(midline), kcLength, 0);
  const valArr = val.toArray();

  const warmup = Math.max(bbLength, kcLength);

  // Momentum histogram: 4-color scheme
  const momData = valArr.map((value, i) => {
    const v = value ?? NaN;
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const prev = i > 0 ? (valArr[i - 1] ?? NaN) : NaN;
    let color: string;
    if (v >= 0) {
      color = v > prev ? '#00E676' : '#26A69A';
    } else {
      color = v < prev ? '#FF5252' : '#EF5350';
    }
    return { time: bars[i].time, value: v, color };
  });

  // Squeeze dots: black=tight(1x), red=normal(1.5x), orange=wide(2x), green=no squeeze
  const sqzData = valArr.map((value, i) => {
    if (i < warmup || value == null) return { time: bars[i].time, value: NaN };
    let color: string;
    if (sqz1Arr[i]) {
      color = '#000000'; // tight squeeze - inside 1x KC
    } else if (sqz2Arr[i]) {
      color = '#FF0000'; // normal squeeze - inside 1.5x KC
    } else if (sqz3Arr[i]) {
      color = '#FF6D00'; // wide squeeze - inside 2x KC
    } else {
      color = '#00E676'; // no squeeze
    }
    return { time: bars[i].time, value: 0, color };
  });

  // Alerts of the original: NoSqz = BB_lower < KC_lower_low or BB_upper > KC_upper_low, with
  // KC_basis = ta.sma(close, length) and devKC = ta.sma(ta.tr, length) (ta.tr is na on the first bar)
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const upperBBArr = A(upperBB);
  const lowerBBArr = A(lowerBB);
  const kcBasis = A(ta.sma(source, kcLength));
  const trArr = bars.map((b, i) => (i > 0
    ? Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))
    : NaN));
  const devKC = A(ta.sma(Series.fromArray(bars, trArr), kcLength));
  const noSqz = bars.map((_b, i) => lt(lowerBBArr[i], kcBasis[i] - devKC[i] * kcMult3)
    || gt(upperBBArr[i], kcBasis[i] + devKC[i] * kcMult3));
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < bars.length; i++) {
    // NoSqz[1] is na (false) on the first bar
    const prevNoSqz = i > 0 && noSqz[i - 1];
    // if Detect_Sqz_Start and NoSqz[1] and not NoSqz: alert("Squeeze Started")
    // else if Detect_Sqz_Fire and NoSqz and not NoSqz[1]: alert("Squeeze Fired")
    if (detectSqzStart && prevNoSqz && !noSqz[i]) {
      alertCalls.push({ time: bars[i].time as number, message: 'Squeeze Started', freq: 'once_per_bar' });
    } else if (detectSqzFire && noSqz[i] && !prevNoSqz) {
      alertCalls.push({ time: bars[i].time as number, message: 'Squeeze Fired', freq: 'once_per_bar' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': momData, 'plot1': sqzData },
    alertCalls,
  };
}

export const TTMSqueezePro = { calculate, metadata, defaultInputs, inputConfig, plotConfig, hasAlertFunction };
