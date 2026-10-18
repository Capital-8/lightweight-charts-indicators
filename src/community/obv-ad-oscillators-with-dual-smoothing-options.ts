/**
 * OBV, AD, VPT & CDV Oscillators | Jerk Flow Stack
 *
 * Four cumulative volume series: OBV (sign of the close change * volume), AD (close location in the bar range *
 * volume), CDV (sign of close - open * volume) and VPT (ta.pvt). Long-period oscillators: the series minus its
 * SMA or Ehlers DSMA (2 * SMA - SMA of the SMA) over `maLenLong` bars (VPT scaled by `vptScaleLong`). RSI pane: the
 * RSI of each series and the MFI of hlc3, with dashed levels 80 / 70 / 50 / 30 / 20. Jerk = change of the change
 * of OBV / CDV; a background marks bars whose jerk exceeds `jerkFrac` * its highest absolute value over `jerkLen`
 * bars. The stacked filter marks jerk breaks in the same direction for OBV and CDV with high relative volume
 * (volume / 20-bar median > 1.3), an ATR(14) percent rank over 200 bars above 0.25, a close beyond the previous
 * high / low and a cool-down of `coolBars` bars.
 *
 * Reference: "OBV & AD Oscillators with Dual Smoothing Options" by hollowwick (indicator title "OBV, AD, VPT & CDV
 * Oscillators  |  Jerk Flow Stack")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';

export interface ObvAdOscillatorsInputs {
  colLongOBV: string;
  colLongCDV: string;
  colLongAD: string;
  colLongVPT: string;
  colRSIOBV: string;
  colRSICDV: string;
  colRSIAD: string;
  colRSIVPT: string;
  colRSIMFI: string;
  /** Plot the long-period oscillators */
  plotLong: boolean;
  /** Plot the RSI pane (RSI lines and levels) */
  plotShort: boolean;
  showLongOBV: boolean;
  showLongCDV: boolean;
  showLongAD: boolean;
  showLongVPT: boolean;
  showRSIOBV: boolean;
  showRSICDV: boolean;
  showRSIAD: boolean;
  showRSIVPT: boolean;
  showRSIMFI: boolean;
  /** Background on OBV jerk */
  showOBVJerkBG: boolean;
  /** Background on CDV jerk */
  showCDVJerkBG: boolean;
  /** Stacked jerk filter background */
  stackBG: boolean;
  /** Jerk look-back (highest absolute jerk) */
  jerkLen: number;
  /** Threshold fraction of the highest absolute jerk */
  jerkFrac: number;
  /** Cool-down bars of the stacked filter */
  coolBars: number;
  /** Long MA type */
  maTypeLong: 'None' | 'SMA' | 'Ehlers DSMA';
  /** Long MA length */
  maLenLong: number;
  /** Long VPT scale */
  vptScaleLong: number;
  /** RSI length */
  rsiLen: number;
}

export const defaultInputs: ObvAdOscillatorsInputs = {
  colLongOBV: color.blue,
  colLongCDV: color.red,
  colLongAD: color.orange,
  colLongVPT: color.green,
  colRSIOBV: color.lime,
  colRSICDV: color.red,
  colRSIAD: color.purple,
  colRSIVPT: color.yellow,
  colRSIMFI: color.aqua,
  plotLong: false,
  plotShort: true,
  showLongOBV: false,
  showLongCDV: false,
  showLongAD: true,
  showLongVPT: true,
  showRSIOBV: true,
  showRSICDV: true,
  showRSIAD: false,
  showRSIVPT: false,
  showRSIMFI: false,
  showOBVJerkBG: false,
  showCDVJerkBG: false,
  stackBG: false,
  jerkLen: 20,
  jerkFrac: 0.8,
  coolBars: 5,
  maTypeLong: 'Ehlers DSMA',
  maLenLong: 377,
  vptScaleLong: 610.0,
  rsiLen: 14,
};

export const inputConfig: InputConfig[] = [
  { id: 'colLongOBV', type: 'color', title: 'Long OBV', defval: color.blue, group: 'Line Colours' },
  { id: 'colLongCDV', type: 'color', title: 'Long CDV', defval: color.red, group: 'Line Colours' },
  { id: 'colLongAD', type: 'color', title: 'Long AD', defval: color.orange, group: 'Line Colours' },
  { id: 'colLongVPT', type: 'color', title: 'Long VPT', defval: color.green, group: 'Line Colours' },
  { id: 'colRSIOBV', type: 'color', title: 'RSI OBV', defval: color.lime, group: 'Line Colours' },
  { id: 'colRSICDV', type: 'color', title: 'RSI CDV', defval: color.red, group: 'Line Colours' },
  { id: 'colRSIAD', type: 'color', title: 'RSI AD', defval: color.purple, group: 'Line Colours' },
  { id: 'colRSIVPT', type: 'color', title: 'RSI VPT', defval: color.yellow, group: 'Line Colours' },
  { id: 'colRSIMFI', type: 'color', title: 'RSI MFI', defval: color.aqua, group: 'Line Colours' },
  { id: 'plotLong', type: 'bool', title: 'Plot Long‑Period Oscillators', defval: false, group: 'General' },
  { id: 'plotShort', type: 'bool', title: 'Plot RSI Pane (visual only)', defval: true, group: 'General' },
  { id: 'showLongOBV', type: 'bool', title: 'Long OBV', defval: false, group: 'Long Components' },
  { id: 'showLongCDV', type: 'bool', title: 'Long CDV', defval: false, group: 'Long Components' },
  { id: 'showLongAD', type: 'bool', title: 'Long AD', defval: true, group: 'Long Components' },
  { id: 'showLongVPT', type: 'bool', title: 'Long VPT', defval: true, group: 'Long Components' },
  { id: 'showRSIOBV', type: 'bool', title: 'RSI OBV', defval: true, group: 'RSI Components' },
  { id: 'showRSICDV', type: 'bool', title: 'RSI CDV', defval: true, group: 'RSI Components' },
  { id: 'showRSIAD', type: 'bool', title: 'RSI AD', defval: false, group: 'RSI Components' },
  { id: 'showRSIVPT', type: 'bool', title: 'RSI VPT', defval: false, group: 'RSI Components' },
  { id: 'showRSIMFI', type: 'bool', title: 'RSI MFI', defval: false, group: 'RSI Components' },
  { id: 'showOBVJerkBG', type: 'bool', title: 'Background on OBV Jerk', defval: false, group: 'Jerk BG' },
  { id: 'showCDVJerkBG', type: 'bool', title: 'Background on CDV Jerk', defval: false, group: 'Jerk BG' },
  { id: 'stackBG', type: 'bool', title: 'Stacked Jerk Filter', defval: false, group: 'Jerk BG' },
  { id: 'jerkLen', type: 'int', title: 'Jerk look‑back', defval: 20, min: 1, group: 'Jerk BG' },
  { id: 'jerkFrac', type: 'float', title: 'Threshold fraction', defval: 0.8, step: 0.05, group: 'Jerk BG' },
  { id: 'coolBars', type: 'int', title: 'Cool‑down bars', defval: 5, min: 1, group: 'Jerk BG' },
  { id: 'maTypeLong', type: 'string', title: 'Long MA Type', defval: 'Ehlers DSMA', options: ['None', 'SMA', 'Ehlers DSMA'], group: 'Long Period' },
  { id: 'maLenLong', type: 'int', title: 'Long MA Length', defval: 377, min: 1, group: 'Long Period' },
  { id: 'vptScaleLong', type: 'float', title: 'Long VPT Scale', defval: 610.0, step: 0.1, group: 'Long Period' },
  { id: 'rsiLen', type: 'int', title: 'RSI Length', defval: 14, group: 'Volume RSI' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long OBV', color: color.blue, lineWidth: 1 },
  { id: 'plot1', title: 'Long AD', color: color.orange, lineWidth: 1 },
  { id: 'plot2', title: 'Long CDV', color: color.red, lineWidth: 1 },
  { id: 'plot3', title: 'Long VPT', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'RSI OBV', color: color.lime, lineWidth: 1 },
  { id: 'plot5', title: 'RSI CDV', color: color.red, lineWidth: 1 },
  { id: 'plot6', title: 'RSI AD', color: color.purple, lineWidth: 1 },
  { id: 'plot7', title: 'RSI VPT', color: color.yellow, lineWidth: 1 },
  { id: 'plot8', title: 'RSI MFI', color: color.aqua, lineWidth: 1 },
];

export const metadata = {
  title: 'OBV, AD, VPT & CDV Oscillators  |  Jerk Flow Stack',
  shortTitle: 'VolOscSets',
  overlay: false,
  format: 'volume',
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<ObvAdOscillatorsInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const vol = bars.map((b) => b.volume ?? NaN);
  const close = bars.map((b) => b.close);

  // Cumulative series
  const closeChange = A(ta.change(S(close)));
  const obv = A(ta.cum(S(closeChange.map((c, i) => Math.sign(c) * vol[i]))));
  const ad = A(ta.cum(S(bars.map((b, i) => ((eq(b.close, b.high) && eq(b.close, b.low)) || eq(b.high, b.low)
    ? 0 : ((2 * b.close - b.low - b.high) / (b.high - b.low)) * vol[i])))));
  const cdv = A(ta.cum(S(bars.map((b, i) => Math.sign(b.close - b.open) * vol[i]))));
  const vpt = A(ta.pvt(bars));

  // ma(src, len, typ): SMA, Ehlers DSMA (2 * sma - sma(sma)) or na
  const ma = (src: number[]): number[] => {
    if (cfg.maTypeLong === 'SMA') return A(ta.sma(S(src), cfg.maLenLong));
    if (cfg.maTypeLong === 'Ehlers DSMA') {
      const s1 = ta.sma(S(src), cfg.maLenLong);
      const s2 = A(ta.sma(s1, cfg.maLenLong));
      return A(s1).map((v, i) => 2 * v - s2[i]);
    }
    return new Array(n).fill(NaN);
  };
  const oscOBVLong = ma(obv).map((m, i) => obv[i] - m);
  const oscADLong = ma(ad).map((m, i) => ad[i] - m);
  const oscCDVLong = ma(cdv).map((m, i) => cdv[i] - m);
  const oscVPTLong = ma(vpt).map((m, i) => (vpt[i] - m) * cfg.vptScaleLong);

  // RSI pane
  const rsiOBV = A(ta.rsi(S(obv), cfg.rsiLen));
  const rsiCDV = A(ta.rsi(S(cdv), cfg.rsiLen));
  const rsiAD = A(ta.rsi(S(ad), cfg.rsiLen));
  const rsiVPT = A(ta.rsi(S(vpt), cfg.rsiLen));
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const mfi = A(ta.mfi(S(hlc3), cfg.rsiLen, S(vol)));

  // Jerk: ta.change(ta.change(src)); threshold jerkFrac * ta.highest(math.abs(jerk), jerkLen)
  const jerk = (src: number[]) => A(ta.change(ta.change(S(src))));
  const jerkOBV = jerk(obv);
  const jerkCDV = jerk(cdv);
  const thrOBV = A(ta.highest(S(jerkOBV.map(Math.abs)), cfg.jerkLen)).map((h) => cfg.jerkFrac * h);
  const thrCDV = A(ta.highest(S(jerkCDV.map(Math.abs)), cfg.jerkLen)).map((h) => cfg.jerkFrac * h);
  // opa(v, thr) = int(math.min(math.abs(v) / thr, 1) * 20)
  const opa = (v: number, thr: number) => Math.trunc(Math.min(Math.abs(v) / thr, 1) * 20);

  // Stack filter
  const median = A(ta.median(S(vol), 20));
  const atrRank = A(ta.percentrank(ta.atr(bars, 14), 200));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const bgColors: BgColorData[] = [];
  const longColor = String(color.new(color.green, 70));
  const shortColor = String(color.new(color.red, 70));
  let lastLong = NaN;
  let lastShort = NaN;
  const coolOK = (last: number, i: number) => isNaN(last) || i - last > cfg.coolBars;
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const jo = jerkOBV[i];
    const jc = jerkCDV[i];
    if (cfg.showOBVJerkBG && gt(Math.abs(jo), thrOBV[i])) {
      bgColors.push({ time: t, color: String(color.new(gt(jo, 0) ? color.green : color.red, 100 - opa(jo, thrOBV[i]))), id: 'bgcolor0' });
    }
    if (cfg.showCDVJerkBG && gt(Math.abs(jc), thrCDV[i])) {
      bgColors.push({ time: t, color: String(color.new(gt(jc, 0) ? color.green : color.red, 100 - opa(jc, thrCDV[i]))), id: 'bgcolor1' });
    }
    const relVol = vol[i] / median[i];
    const tapeOK = gt(relVol, 1.3) && gt(atrRank[i], 0.25);
    const sameDir = (gt(jo, 0) && gt(jc, 0)) || (lt(jo, 0) && lt(jc, 0));
    const newLong = gt(jo, thrOBV[i]) || gt(jc, thrCDV[i]);
    const newShort = lt(jo, -thrOBV[i]) || lt(jc, -thrCDV[i]);
    const longPriceOK = i > 0 && gt(close[i], bars[i - 1].high);
    const shortPriceOK = i > 0 && lt(close[i], bars[i - 1].low);
    const jerkLongOK = cfg.stackBG && tapeOK && sameDir && newLong && longPriceOK && coolOK(lastLong, i);
    const jerkShortOK = cfg.stackBG && tapeOK && sameDir && newShort && shortPriceOK && coolOK(lastShort, i);
    if (jerkLongOK) lastLong = i;
    if (jerkShortOK) lastShort = i;
    if (jerkLongOK) bgColors.push({ time: t, color: longColor, id: 'bgcolor2' });
    if (jerkShortOK) bgColors.push({ time: t, color: shortColor, id: 'bgcolor3' });
  }

  const line = (on: boolean, v: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: on ? fin(v[i]) : NaN, color: c }));
  const L = cfg.plotLong;
  const R = cfg.plotShort;
  const plots = {
    plot0: line(L && cfg.showLongOBV, oscOBVLong, cfg.colLongOBV),
    plot1: line(L && cfg.showLongAD, oscADLong, cfg.colLongAD),
    plot2: line(L && cfg.showLongCDV, oscCDVLong, cfg.colLongCDV),
    plot3: line(L && cfg.showLongVPT, oscVPTLong, cfg.colLongVPT),
    plot4: line(R && cfg.showRSIOBV, rsiOBV, cfg.colRSIOBV),
    plot5: line(R && cfg.showRSICDV, rsiCDV, cfg.colRSICDV),
    plot6: line(R && cfg.showRSIAD, rsiAD, cfg.colRSIAD),
    plot7: line(R && cfg.showRSIVPT, rsiVPT, cfg.colRSIVPT),
    plot8: line(R && cfg.showRSIMFI, mfi, cfg.colRSIMFI),
  };

  // hline(plotShort ? level : na, ...): no line when plotShort is off
  const hlines = R
    ? [80, 70, 50, 30, 20].map((v) => ({ value: v, options: { title: `RSI ${v}`, color: color.gray, linestyle: 'dashed' as const } }))
    : [];

  return {
    metadata: {
      title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, format: metadata.format,
    },
    plots,
    hlines,
    bgColors,
  };
}

export const ObvAdOscillatorsWithDualSmoothingOptions = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
