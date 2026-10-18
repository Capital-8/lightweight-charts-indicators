/**
 * Dynamic VWAP: Fair Value & Divergence Suite
 *
 * A VWAP anchored at the last swing low: the anchor is the time of the last bar whose low equals the lowest low of
 * the last `swingLength` bars, and the sums restart when the anchor changes (the volume is replaced by the bar range
 * when it is na). Bands at +-1 and +-2 standard deviations of the close (over `stdevLength` bars) around the VWAP, and
 * +3 to +5 standard deviations above it, with fills that show in which zone the open or the close is. Signals: a
 * higher high with a falling VWAP slope (linear regression of the VWAP now and `slopeLength` bars ago), a close
 * crossing over the VWAP on a volume below its 20-bar average, and a close back below +1 sigma after a close above
 * +3 sigma.
 * Alerts (alertcondition, `alerts` of the result): 'VWAP Slope Divergence', 'Low Volume Retest' and 'Deviation
 * Failure', true on the bars of each signal (also with the signals hidden).
 *
 * Reference: "Dynamic VWAP: Fair Value & Divergence Suite" by RWCS_LTD
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RWCS_LTD
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DynamicVwapFairValueDivergenceSuiteInputs {
  /** Show the divergence signals */
  detect: boolean;
  /** Length of the standard deviation of the close */
  stdevLength: number;
  /** Show the +3 to +5 sigma bands */
  showExtendedBands: boolean;
  /** Show the zone fills */
  showFills: boolean;
  /** Lookback of the swing low that anchors the VWAP */
  swingLength: number;
  /** Length of the linear regression of the VWAP slope */
  slopeLength: number;
}

export const defaultInputs: DynamicVwapFairValueDivergenceSuiteInputs = {
  detect: true,
  stdevLength: 20,
  showExtendedBands: true,
  showFills: true,
  swingLength: 50,
  slopeLength: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'detect', type: 'bool', title: 'Detect Divergence', defval: true, group: 'Divergence Detection' },
  { id: 'stdevLength', type: 'int', title: 'Standard Deviation Length', defval: 20, min: 1, group: 'Standard Deviation' },
  { id: 'showExtendedBands', type: 'bool', title: 'Show ±3σ to ±5σ Bands', defval: true, group: 'Standard Deviation' },
  { id: 'showFills', type: 'bool', title: 'Show Zone Fills', defval: true, group: 'Standard Deviation' },
  { id: 'swingLength', type: 'int', title: 'Swing Low Lookback Bars', defval: 50, min: 1, group: 'Volume Weighted Moving Average (VWAP)' },
  { id: 'slopeLength', type: 'int', title: 'VWAP Slope Length', defval: 20, min: 1, group: 'Volume Weighted Moving Average (VWAP)' },
];

const hidden = (id: string, title: string): PlotConfig => ({ id, title, color: 'transparent', lineWidth: 1, display: 'none' });

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Anchored VWAP', color: String(color.new(color.white, 0)), lineWidth: 1 },
  { id: 'plot1', title: '+1σ', color: String(color.new(color.lime, 30)), lineWidth: 1 },
  { id: 'plot2', title: '-1σ', color: String(color.new(color.lime, 30)), lineWidth: 1 },
  { id: 'plot3', title: '+2σ', color: String(color.new(color.yellow, 40)), lineWidth: 1 },
  { id: 'plot4', title: '+3σ', color: String(color.new(color.orange, 50)), lineWidth: 1 },
  { id: 'plot5', title: '+4σ', color: String(color.new(color.red, 60)), lineWidth: 1 },
  { id: 'plot6', title: '+5σ', color: String(color.new(color.fuchsia, 70)), lineWidth: 1 },
  // Hidden plots of the fills (display = display.none), two per fill in the Pine order
  hidden('plot7', 'Fair Value Fill +1σ'),
  hidden('plot8', 'Fair Value Fill -1σ'),
  hidden('plot9', '+1σ to +2σ Fill +2σ'),
  hidden('plot10', '+1σ to +2σ Fill +1σ'),
  hidden('plot11', '-1σ to -2σ Fill -1σ'),
  hidden('plot12', '-1σ to -2σ Fill -2σ'),
  hidden('plot13', '+2σ to +3σ Fill +3σ'),
  hidden('plot14', '+2σ to +3σ Fill +2σ'),
  hidden('plot15', '+3σ to +4σ Fill +4σ'),
  hidden('plot16', '+3σ to +4σ Fill +3σ'),
  hidden('plot17', '+4σ to +5σ Fill +5σ'),
  hidden('plot18', '+4σ to +5σ Fill +4σ'),
];

export const metadata = {
  title: 'Dynamic VWAP: Fair Value & Divergence Suite',
  shortTitle: 'Dynamic VWAP: Fair Value & Divergence Suite',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicVwapFairValueDivergenceSuiteInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const volume = bars.map((b) => b.volume ?? NaN);
  const time = bars.map((b) => b.time as number);

  // anchorTime = ta.valuewhen(low == ta.lowest(low, swingLength), time, 0)
  const lowestLow = A(ta.lowest(S(low), cfg.swingLength));
  const stdDev = A(ta.stdev(S(close), cfg.stdevLength));

  const vwapValue: number[] = new Array(n).fill(NaN);
  const stdevValue: number[] = new Array(n).fill(NaN);
  const up = [1, 2, 3, 4, 5].map(() => new Array<number>(n).fill(NaN));
  const dn = [1, 2, 3, 4, 5].map(() => new Array<number>(n).fill(NaN));
  let anchorTime = NaN;
  let prevAnchorTime = NaN;
  let cumPV = NaN; // var float cumPV = na
  let cumVolume = NaN; // var float cumVolume = na
  for (let i = 0; i < n; i++) {
    if (eq(low[i], lowestLow[i])) anchorTime = time[i];
    // newAnchor = ta.change(anchorTime) != 0 (na on the first bar with an anchor: false)
    const newAnchor = !isNaN(anchorTime) && !isNaN(prevAnchorTime) && anchorTime - prevAnchorTime !== 0;
    prevAnchorTime = anchorTime;
    const afterAnchor = !isNaN(anchorTime) && time[i] >= anchorTime;
    if (afterAnchor) {
      if (newAnchor) {
        cumPV = 0;
        cumVolume = 0;
      }
      const barVolume = isNaN(volume[i]) ? high[i] - low[i] : volume[i];
      // na + x stays na: the sums are na until the first anchor change
      cumPV += close[i] * barVolume;
      cumVolume += barVolume;
      vwapValue[i] = cumPV / cumVolume;
      stdevValue[i] = stdDev[i];
    }
    if (afterAnchor && !isNaN(stdevValue[i])) {
      for (let k = 0; k < 5; k++) {
        up[k][i] = vwapValue[i] + (k + 1) * stdevValue[i];
        dn[k][i] = vwapValue[i] - (k + 1) * stdevValue[i];
      }
    }
  }
  const [upper1, upper2, upper3, upper4, upper5] = up;
  const [lower1, lower2] = dn;

  // VWAP slope: (ta.linreg(vwapValue, slopeLength, 0) - ta.linreg(vwapValue[slopeLength], slopeLength, 0)) / slopeLength
  const L = cfg.slopeLength;
  const linregNow = A(ta.linreg(S(vwapValue), L, 0));
  const vwapShifted = vwapValue.map((_v, i) => (i - L >= 0 ? vwapValue[i - L] : NaN));
  const linregPrev = A(ta.linreg(S(vwapShifted), L, 0));
  const vwapSlope = linregNow.map((v, i) => (v - linregPrev[i]) / L);
  const highestHigh = A(ta.highest(S(high), L));
  const volMA = A(ta.sma(S(volume), 20));
  const crossAboveVWAP = A(ta.crossover(S(close), S(vwapValue)));

  const markers: MarkerData[] = [];
  const flags: boolean[][] = [[], [], []];
  const fillColor = (on: boolean, c: string) => (cfg.showFills && on ? c : 'transparent');
  const fills = {
    f1: new Array<string>(n), f2: new Array<string>(n), f3: new Array<string>(n),
    f4: new Array<string>(n), f5: new Array<string>(n), f6: new Array<string>(n),
  };
  const green85 = String(color.new(color.green, 85));
  const yellow80 = String(color.new(color.yellow, 80));
  const orange70 = String(color.new(color.orange, 70));
  const red70 = String(color.new(color.red, 70));
  const fuchsia70 = String(color.new(color.fuchsia, 70));
  const slopeColor = String(color.new(color.fuchsia, 40));
  const retestColor = String(color.new(color.aqua, 40));
  const failColor = String(color.new(color.red, 40));
  for (let i = 0; i < n; i++) {
    // priceHigherHigh = high > ta.highest(high, slopeLength)[1]; slopeDivergence = ... and vwapSlope < vwapSlope[1]
    const priceHigherHigh = i > 0 && gt(high[i], highestHigh[i - 1]);
    const slopeDivergence = priceHigherHigh && i > 0 && lt(vwapSlope[i], vwapSlope[i - 1]);
    // lowVolumeRetest = ta.crossover(close, vwapValue) and volume < volMA
    const lowVolumeRetest = crossAboveVWAP[i] === 1 && lt(volume[i], volMA[i]);
    // sigmaFail = close[1] > upper3[1] and close < upper1
    const sigmaFail = i > 0 && gt(close[i - 1], upper3[i - 1]) && lt(close[i], upper1[i]);
    const t = time[i];
    flags[0].push(slopeDivergence);
    flags[1].push(lowVolumeRetest);
    flags[2].push(sigmaFail);
    if (cfg.detect && slopeDivergence) {
      markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: slopeColor, size: 'tiny' });
    }
    if (cfg.detect && lowVolumeRetest) {
      markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: retestColor, size: 'tiny' });
    }
    if (cfg.detect && sigmaFail) {
      markers.push({ time: t, position: 'aboveBar', shape: 'cross', color: failColor, size: 'tiny' });
    }

    const c = close[i];
    const o = bars[i].open;
    const u1 = upper1[i], l1 = lower1[i], u2 = upper2[i], l2 = lower2[i], u3 = upper3[i], u4 = upper4[i], u5 = upper5[i];
    const inside1sigma = (le(c, u1) && ge(c, l1)) || (le(o, u1) && ge(o, l1));
    const insidePlus2sigma = (le(c, u2) && gt(c, u1)) || (le(o, u2) && gt(o, u1));
    const insideMinus2sigma = (ge(c, l2) && lt(c, l1)) || (ge(o, l2) && lt(o, l1));
    const insidePlus3sigma = (le(c, u3) && gt(c, u2)) || (le(o, u3) && gt(o, u2));
    const insidePlus4sigma = (le(c, u4) && gt(c, u3)) || (le(o, u4) && gt(o, u3));
    const insidePlus5sigma = (le(c, u5) && gt(c, u4)) || (le(o, u5) && gt(o, u4));
    fills.f1[i] = fillColor(inside1sigma, green85);
    fills.f2[i] = fillColor(insidePlus2sigma, yellow80);
    fills.f3[i] = fillColor(insideMinus2sigma, yellow80);
    fills.f4[i] = fillColor(insidePlus3sigma, orange70);
    fills.f5[i] = fillColor(insidePlus4sigma, red70);
    fills.f6[i] = fillColor(insidePlus5sigma, fuchsia70);
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const line = (vals: number[], c?: string) => bars.map((_b, i) => ({ time: time[i], value: fin(vals[i]), ...(c ? { color: c } : {}) }));
  const ext = (vals: number[]) => (cfg.showExtendedBands ? vals : new Array<number>(n).fill(NaN));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(vwapValue, String(color.new(color.white, 0))),
      plot1: line(upper1, String(color.new(color.lime, 30))),
      plot2: line(lower1, String(color.new(color.lime, 30))),
      plot3: line(upper2, String(color.new(color.yellow, 40))),
      plot4: line(ext(upper3), String(color.new(color.orange, 50))),
      plot5: line(ext(upper4), String(color.new(color.red, 60))),
      plot6: line(ext(upper5), String(color.new(color.fuchsia, 70))),
      plot7: line(upper1),
      plot8: line(lower1),
      plot9: line(upper2),
      plot10: line(upper1),
      plot11: line(lower1),
      plot12: line(lower2),
      plot13: line(upper3),
      plot14: line(upper2),
      plot15: line(upper4),
      plot16: line(upper3),
      plot17: line(upper5),
      plot18: line(upper4),
    },
    fills: [
      { plot1: 'plot7', plot2: 'plot8', options: { title: 'Fair Value Zone Fill' }, colors: fills.f1 },
      { plot1: 'plot9', plot2: 'plot10', options: { title: '+1σ to +2σ Fill' }, colors: fills.f2 },
      { plot1: 'plot11', plot2: 'plot12', options: { title: '-1σ to -2σ Fill' }, colors: fills.f3 },
      { plot1: 'plot13', plot2: 'plot14', options: { title: '+2σ to +3σ Fill' }, colors: fills.f4 },
      { plot1: 'plot15', plot2: 'plot16', options: { title: '+3σ to +4σ Fill' }, colors: fills.f5 },
      { plot1: 'plot17', plot2: 'plot18', options: { title: '+4σ to +5σ Fill' }, colors: fills.f6 },
    ],
    markers,
    // alertcondition(slopeDivergence) / alertcondition(lowVolumeRetest) / alertcondition(sigmaFail)
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'VWAP Slope Divergence', message: 'VWAP slope divergence detected.' },
  { id: 'alert1', title: 'Low Volume Retest', message: 'Price crossed VWAP on low volume.' },
  { id: 'alert2', title: 'Deviation Failure', message: 'Deviation failure detected (mean reversion signal).' },
];

export const DynamicVwapFairValueDivergenceSuite = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
