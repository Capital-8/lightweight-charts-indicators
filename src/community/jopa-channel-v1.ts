/**
 * JOPA Channel (Dual-Volumed) v1
 *
 * A channel around a rolling VWAP (sum of src * volume / sum of volume over `lenVWAP` bars, from cumulative sums).
 * Inner value bands: a width of kSTD * stdev(residual) + kATR * ATR + kMAD * sma(|residual|) (residual = src - VWAP),
 * times a volume factor (relative volume ^ betaRVOL * (1 + betaDVal * z-score of the dollar volume), clamped to
 * 0.25..3) and a regime factor from the efficiency ratio (erMin in a trend .. erMax in chop), tilted up / down by the
 * z-score of the OBV slope. The bands follow a tracking mode (base, EMA-smoothed parallel, slope or linreg forecast),
 * blended with the base bands by the attach strength. Outer containment bands: VWAP + EMA of the highest / lowest
 * residual over `lenExt` bars, plus / minus a margin of marginK * smoothed width. Guides at 20 % and 80 % of the
 * channel, fills between the inner and the outer bands, and squeeze dots when the width is at most sqThresh times
 * its `sqLen`-bar average.
 *
 * Alerts (alertcondition, `alerts` of the result): breakout long / short (close beyond the upper / lower value band
 * with a relative volume of at least `rvolMinBr`) and top / bottom zone (close at or beyond the 80 % / 20 % guide, the
 * guides shown).
 *
 * Reference: "JOPA Channel (Dual-Volumed) v1 [JopAlgo]" by JopAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (c) 2025 JopAlgo. © 2025 JopAlgo [JopAlgo]
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type TrackMode = 'Base' | 'Parallel-Lock' | 'Slope-Lock' | 'Forecast-Lock';

export interface JopaChannelV1Inputs {
  src: SourceType;
  lenVWAP: number;
  lenVol: number;
  kSTD: number;
  kATR: number;
  kMAD: number;
  lenSTD: number;
  lenATR: number;
  lenMAD: number;
  betaRVOL: number;
  betaDVal: number;
  lenDVal: number;
  useTilt: boolean;
  tiltGain: number;
  lenOBV: number;
  lenER: number;
  erMin: number;
  erMax: number;
  trackMode: TrackMode;
  attach: number;
  trackLen: number;
  slopeGain: number;
  leadBars: number;
  useContain: boolean;
  lenExt: number;
  smoothExt: number;
  marginK: number;
  sqLen: number;
  sqThresh: number;
  /** Used by the alert conditions only */
  rvolMinBr: number;
  showValueRails: boolean;
  showValueFill: boolean;
  showGuides: boolean;
  showContainFill: boolean;
  showSqueeze: boolean;
}

export const defaultInputs: JopaChannelV1Inputs = {
  src: 'close',
  lenVWAP: 120,
  lenVol: 50,
  kSTD: 1.0,
  kATR: 0.35,
  kMAD: 0.75,
  lenSTD: 50,
  lenATR: 14,
  lenMAD: 50,
  betaRVOL: 0.65,
  betaDVal: 0.25,
  lenDVal: 50,
  useTilt: true,
  tiltGain: 0.35,
  lenOBV: 34,
  lenER: 20,
  erMin: 0.8,
  erMax: 1.25,
  trackMode: 'Parallel-Lock',
  attach: 0.85,
  trackLen: 12,
  slopeGain: 0.5,
  leadBars: 1,
  useContain: true,
  lenExt: 220,
  smoothExt: 16,
  marginK: 0.25,
  sqLen: 100,
  sqThresh: 0.85,
  rvolMinBr: 1.0,
  showValueRails: false,
  showValueFill: true,
  showGuides: true,
  showContainFill: true,
  showSqueeze: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'lenVWAP', type: 'int', title: 'Rolling VWAP Length', defval: 120, min: 2 },
  { id: 'lenVol', type: 'int', title: 'Volume Baseline (RVOL)', defval: 50, min: 5 },
  { id: 'kSTD', type: 'float', title: 'k * StdDev(residuals)', defval: 1.0, min: 0.0, step: 0.1 },
  { id: 'kATR', type: 'float', title: 'k * ATR', defval: 0.35, min: 0.0, step: 0.05 },
  { id: 'kMAD', type: 'float', title: 'k * MAD(residuals)', defval: 0.75, min: 0.0, step: 0.05 },
  { id: 'lenSTD', type: 'int', title: 'StdDev Length', defval: 50, min: 5 },
  { id: 'lenATR', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'lenMAD', type: 'int', title: 'MAD Length', defval: 50, min: 5 },
  { id: 'betaRVOL', type: 'float', title: 'RVOL Exponent', defval: 0.65, min: 0.0, step: 0.05 },
  { id: 'betaDVal', type: 'float', title: 'Dollar-Flow Gain', defval: 0.25, min: 0.0, step: 0.05 },
  { id: 'lenDVal', type: 'int', title: 'Dollar-Flow Z-Window', defval: 50, min: 5 },
  { id: 'useTilt', type: 'bool', title: 'Enable Tilt (OBV)', defval: true },
  { id: 'tiltGain', type: 'float', title: 'Tilt Strength (0..1)', defval: 0.35, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'lenOBV', type: 'int', title: 'OBV Slope Z-Window', defval: 34, min: 5 },
  { id: 'lenER', type: 'int', title: 'Efficiency Ratio Lookback', defval: 20, min: 2 },
  { id: 'erMin', type: 'float', title: 'ER Width Min (trend)', defval: 0.8, min: 0.2, max: 2.0, step: 0.05 },
  { id: 'erMax', type: 'float', title: 'ER Width Max (chop)', defval: 1.25, min: 0.2, max: 3.0, step: 0.05 },
  { id: 'trackMode', type: 'string', title: 'Tracking Mode', defval: 'Parallel-Lock',
    options: ['Base', 'Parallel-Lock', 'Slope-Lock', 'Forecast-Lock'] },
  { id: 'attach', type: 'float', title: 'Attach Strength (0..1)', defval: 0.85, min: 0.0, max: 1.0, step: 0.05 },
  { id: 'trackLen', type: 'int', title: 'Tracking Smooth Length', defval: 12, min: 1 },
  { id: 'slopeGain', type: 'float', title: 'Slope Influence (Slope-Lock)', defval: 0.5, min: 0.0, max: 2.0, step: 0.05 },
  { id: 'leadBars', type: 'int', title: 'Forecast Lead Bars (Forecast-Lock)', defval: 1, min: 1, max: 3 },
  { id: 'useContain', type: 'bool', title: 'Show Containment Bands', defval: true },
  { id: 'lenExt', type: 'int', title: 'Residual Extremes Lookback', defval: 220, min: 20 },
  { id: 'smoothExt', type: 'int', title: 'Extreme Smoothing (EMA)', defval: 16, min: 1 },
  { id: 'marginK', type: 'float', title: 'Margin vs inner width (k * wS)', defval: 0.25, min: 0.0, max: 2.0, step: 0.05 },
  { id: 'sqLen', type: 'int', title: 'Squeeze Window', defval: 100, min: 20 },
  { id: 'sqThresh', type: 'float', title: 'Squeeze <= (ratio vs avg)', defval: 0.85, min: 0.3, max: 1.5, step: 0.05 },
  { id: 'rvolMinBr', type: 'float', title: 'Min RVOL for Breakout', defval: 1.0, min: 0.0, step: 0.05 },
  { id: 'showValueRails', type: 'bool', title: 'Upper & Lower Value (inner rails)', defval: false },
  { id: 'showValueFill', type: 'bool', title: 'Inner (Value) Fill', defval: true },
  { id: 'showGuides', type: 'bool', title: 'Channel 20–80% Guides', defval: true },
  { id: 'showContainFill', type: 'bool', title: 'Containment Fill', defval: true },
  { id: 'showSqueeze', type: 'bool', title: 'Squeeze Dots (orange, below candles)', defval: false },
];

const GUIDE20 = 'rgb(102, 178, 255)';
const GUIDE80 = 'rgb(255, 128, 128)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'RVWAP', color: color.teal, lineWidth: 2 },
  { id: 'plot1', title: 'Upper Value', color: color.green, lineWidth: 1, style: 'stepline' },
  { id: 'plot2', title: 'Lower Value', color: color.red, lineWidth: 1, style: 'stepline' },
  { id: 'plot3', title: 'Upper Containment', color: color.green, lineWidth: 2, style: 'stepline' },
  { id: 'plot4', title: 'Lower Containment', color: color.red, lineWidth: 2, style: 'stepline' },
  { id: 'plot5', title: 'Channel 20%', color: GUIDE20, lineWidth: 1, linestyle: 'dashed' },
  { id: 'plot6', title: 'Channel 80%', color: GUIDE80, lineWidth: 1, linestyle: 'dashed' },
];

export const metadata = {
  title: 'JOPA Channel (Dual-Volumed) v1 [JopAlgo]',
  shortTitle: 'JOPAV1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a != b beyond 1e-10 (na and +-infinity: false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const ne = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > EPS;
/** Pine nz(): na and +-infinity give 0 */
const nz = (x: number) => (Number.isFinite(x) ? x : 0);
/** f_clamp(x, lo, hi) = math.min(math.max(x, lo), hi): na stays na */
const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);
const fin = (x: number) => (Number.isFinite(x) ? x : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<JopaChannelV1Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = A(getSourceSeries(bars, cfg.src));
  const volume = bars.map((b) => b.volume ?? NaN);

  // f_z(x, l): na(sd) or sd == 0 ? 0 : (x - sma(x, l)) / stdev(x, l)
  const fz = (x: number[], l: number) => {
    const ma = A(ta.sma(S(x), l));
    const sd = A(ta.stdev(S(x), l));
    return x.map((v, i) => (isNaN(sd[i]) || !ne(sd[i], 0) ? 0.0 : (v - ma[i]) / sd[i]));
  };
  // f_rollsum(x, l): cs = ta.cum(x); not na(cs[l]) ? cs - cs[l] : na
  const rollsum = (x: number[], l: number) => {
    const cs = A(ta.cum(S(x)));
    return cs.map((c, i) => (i >= l && !isNaN(cs[i - l]) ? c - cs[i - l] : NaN));
  };

  // Rolling VWAP (centre)
  const num = rollsum(src.map((s, i) => s * volume[i]), cfg.lenVWAP);
  const den = rollsum(volume, cfg.lenVWAP);
  const rvwap = den.map((d, i) => (ne(d, 0) && !isNaN(d) ? num[i] / d : NaN));

  // Inner value-band width
  const residual = src.map((s, i) => s - rvwap[i]);
  const stdRes = A(ta.stdev(S(residual), cfg.lenSTD));
  const atrV = A(ta.atr(bars, cfg.lenATR));
  const madRes = A(ta.sma(S(residual.map((r) => Math.abs(r))), cfg.lenMAD));
  const baseWidth = bars.map((_b, i) => cfg.kSTD * nz(stdRes[i]) + cfg.kATR * nz(atrV[i]) + cfg.kMAD * nz(madRes[i]));

  const volSma = A(ta.sma(S(volume), cfg.lenVol));
  const rvol = volume.map((v, i) => v / volSma[i]);
  const zDVal = fz(volume.map((v, i) => v * src[i]), cfg.lenDVal);
  const volFac = rvol.map((r, i) => clamp(
    Math.pow(Math.max(r, 0.0001), cfg.betaRVOL) * (1.0 + cfg.betaDVal * nz(zDVal[i])), 0.25, 3.0));

  const change = A(ta.change(S(src)));
  const erDen = rollsum(change.map((c) => Math.abs(c)), cfg.lenER);
  const erFac = src.map((s, i) => {
    const erNum = Math.abs(s - (i >= cfg.lenER ? src[i - cfg.lenER] : NaN));
    let er = !isNaN(erDen[i]) && ne(erDen[i], 0) ? erNum / erDen[i] : 0.0;
    er = clamp(er, 0.0, 1.0);
    return cfg.erMin + (cfg.erMax - cfg.erMin) * (1.0 - er);
  });

  const obv = A(ta.cum(S(volume.map((v, i) => v * Math.sign(change[i])))));
  const obvSlp = obv.map((o, i) => o - (i >= 1 ? obv[i - 1] : NaN));
  const obvZ = fz(obvSlp, cfg.lenOBV);
  const tiltN = obvZ.map((z) => (cfg.useTilt ? clamp(z * cfg.tiltGain, -1.0, 1.0) : 0.0));

  const wBase = baseWidth.map((w, i) => w * volFac[i] * erFac[i]);
  const upperBase = rvwap.map((r, i) => r + wBase[i] * (1.0 + tiltN[i]));
  const lowerBase = rvwap.map((r, i) => r - wBase[i] * (1.0 - tiltN[i]));

  // Tracking of the inner bands
  const rvwapS = A(ta.ema(S(rvwap), cfg.trackLen));
  const wS = A(ta.ema(S(wBase), cfg.trackLen));
  const lrLen = Math.trunc(Math.max(2, cfg.trackLen));
  const rvwapF = A(ta.linreg(S(rvwap), lrLen, -cfg.leadBars));
  const attachClamped = clamp(cfg.attach, 0.0, 1.0);
  const upperValue: number[] = new Array(n);
  const lowerValue: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const up = wS[i] * (1.0 + tiltN[i]);
    const dn = wS[i] * (1.0 - tiltN[i]);
    const slope = rvwapS[i] - (i >= 1 ? rvwapS[i - 1] : NaN);
    let upperRaw: number;
    let lowerRaw: number;
    if (cfg.trackMode === 'Parallel-Lock') {
      upperRaw = rvwapS[i] + up;
      lowerRaw = rvwapS[i] - dn;
    } else if (cfg.trackMode === 'Slope-Lock') {
      upperRaw = rvwapS[i] + up + cfg.slopeGain * slope;
      lowerRaw = rvwapS[i] - dn + cfg.slopeGain * slope;
    } else if (cfg.trackMode === 'Forecast-Lock') {
      upperRaw = rvwapF[i] + up;
      lowerRaw = rvwapF[i] - dn;
    } else {
      upperRaw = upperBase[i];
      lowerRaw = lowerBase[i];
    }
    upperValue[i] = attachClamped * upperRaw + (1.0 - attachClamped) * upperBase[i];
    lowerValue[i] = attachClamped * lowerRaw + (1.0 - attachClamped) * lowerBase[i];
  }

  // Outer containment bands
  const resHi = A(ta.ema(ta.highest(S(residual), cfg.lenExt), cfg.smoothExt));
  const resLo = A(ta.ema(ta.lowest(S(residual), cfg.lenExt), cfg.smoothExt));
  const upperContain = rvwap.map((r, i) => r + resHi[i] + cfg.marginK * wS[i]);
  const lowerContain = rvwap.map((r, i) => r + resLo[i] - cfg.marginK * wS[i]);

  // Squeeze
  const wAvg = A(ta.sma(S(wBase), cfg.sqLen));
  const squeeze = wBase.map((w, i) => (!isNaN(wAvg[i]) && ne(wAvg[i], 0) ? le(w / wAvg[i], cfg.sqThresh) : false));

  // Plots
  const teal = color.teal;
  const purple = color.purple;
  const P = (f: (i: number) => { value: number; color: string }) =>
    bars.map((b, i) => {
      const p = f(i);
      return { time: b.time, value: fin(p.value), color: p.color };
    });
  const plot0 = P((i) => ({ value: rvwap[i], color: i >= 1 && gt(rvwap[i], rvwap[i - 1]) ? teal : purple }));
  const plot1 = P((i) => ({ value: cfg.showValueRails ? upperValue[i] : NaN, color: color.green }));
  const plot2 = P((i) => ({ value: cfg.showValueRails ? lowerValue[i] : NaN, color: color.red }));
  const plot3 = P((i) => ({ value: cfg.useContain ? upperContain[i] : NaN, color: color.green }));
  const plot4 = P((i) => ({ value: cfg.useContain ? lowerContain[i] : NaN, color: color.red }));
  // rngGuides = (useContain ? upperContain : upperValue) - (useContain ? lowerContain : lowerValue)
  const top = cfg.useContain ? upperContain : upperValue;
  const bottom = cfg.useContain ? lowerContain : lowerValue;
  const guide = (f: number) => (i: number) => {
    const rng = top[i] - bottom[i];
    return cfg.showGuides && !isNaN(rng) ? bottom[i] + f * rng : NaN;
  };
  const g20 = guide(0.2);
  const g80 = guide(0.8);
  const plot5 = P((i) => ({ value: g20(i), color: GUIDE20 }));
  const plot6 = P((i) => ({ value: g80(i), color: GUIDE80 }));

  const innerFill = cfg.showValueFill ? String(color.new(color.gray, 88)) : 'transparent';
  const containFill = cfg.showContainFill && cfg.useContain ? String(color.new(color.gray, 85)) : 'transparent';

  // plotshape(showSqueeze and squeeze, style = shape.circle, size.tiny, color.orange, location.belowbar)
  const markers: MarkerData[] = [];
  if (cfg.showSqueeze) {
    for (let i = 0; i < n; i++) {
      if (squeeze[i]) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: color.orange, size: 'tiny' });
      }
    }
  }

  // Alerts: breakoutUp_val = close > upperValue and rvol >= rvolMinBr (breakoutDown_val: close < lowerValue);
  // inTopZone = showGuides and not na(rngGuides) and close >= line80 (inBottomZone: close <= line20)
  const breakUp: boolean[] = [], breakDown: boolean[] = [], topZone: boolean[] = [], bottomZone: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const close = bars[i].close;
    const rvolOk = ge(fin(rvol[i]), cfg.rvolMinBr);
    breakUp.push(gt(close, fin(upperValue[i])) && rvolOk);
    breakDown.push(lt(close, fin(lowerValue[i])) && rvolOk);
    const valid = cfg.showGuides && !isNaN(fin(top[i] - bottom[i]));
    topZone.push(valid && ge(close, fin(g80(i))));
    bottomZone.push(valid && le(close, fin(g20(i))));
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4, plot5, plot6 },
    fills: [
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Inner Fill' }, colors: new Array<string>(n).fill(innerFill) },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Containment Fill' },
        colors: new Array<string>(n).fill(containFill) },
    ],
    markers,
    alerts: alertStates(alertConditions, bars, [breakUp, breakDown, topZone, bottomZone]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'DVWAP Breakout Long (Value Bands)', message: 'Breakout above inner value band [JopAlgo]' },
  { id: 'alert1', title: 'DVWAP Breakout Short (Value Bands)', message: 'Breakout below inner value band [JopAlgo]' },
  { id: 'alert2', title: 'Top Zone (Containment/Value)', message: 'Price in top 20% of channel [JopAlgo]' },
  { id: 'alert3', title: 'Bottom Zone (Containment/Value)', message: 'Price in bottom 20% of channel [JopAlgo]' },
];

export const JopaChannelV1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
