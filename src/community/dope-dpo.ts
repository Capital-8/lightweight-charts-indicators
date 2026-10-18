/**
 * Dope DPO
 *
 * Two ribbons of detrended price oscillators: close - WMA(close, p)[barsback] for p = 5, 10, ..., 50 (barsback 3) and
 * for p = 10, 20, ..., 100 (barsback 6), averaged per ribbon and smoothed with a moving average (the type of the long
 * DPO setting is used for both lines, as in the original). The short line is drawn as columns, green when its WMA
 * smoothing is above the value `Bars back for short DPO` bars ago, else red; the long line lime / light red with
 * `Bars back for long DPO`. Regular divergences between the long line pivots and the price, and background colours
 * when the two colours flip (low confidence) or agree after a change (high confidence), in the pane and / or on the
 * price chart.
 *
 * Reference: "Dope DPO" by Sherlock_MacGyver
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { barInterval, barTime } from '../bar-time';

export type DopeDpoMaType = 'SMA' | 'EMA' | 'WMA' | 'RMA';

export interface DopeDpoInputs {
  enableSmoothing: boolean;
  smoothDpoLength: number;
  /** Bars back for the colour of the short DPO */
  checkPeriod: number;
  /** Bars back for the colour of the long DPO */
  checkPeriod2: number;
  /** Short DPO moving average type (not used by the original script) */
  maType1: DopeDpoMaType;
  /** Long DPO moving average type (smoothing of both lines) */
  maType2: DopeDpoMaType;
  showDivergence: boolean;
  lookbackRight: number;
  lookbackLeft: number;
  rangeUpper: number;
  rangeLower: number;
  bearColor: string;
  bullColor: string;
  enableBGFills: boolean;
  showPaneFills: boolean;
  showOverlayFills: boolean;
  transpFlipBG: number;
  transpSyncBG: number;
  showLowConfidenceFills: boolean;
  showHighConfidenceFills: boolean;
}

export const defaultInputs: DopeDpoInputs = {
  enableSmoothing: true,
  smoothDpoLength: 5,
  checkPeriod: 5,
  checkPeriod2: 15,
  maType1: 'WMA',
  maType2: 'WMA',
  showDivergence: true,
  lookbackRight: 5,
  lookbackLeft: 5,
  rangeUpper: 60,
  rangeLower: 5,
  bearColor: color.red,
  bullColor: color.green,
  enableBGFills: true,
  showPaneFills: true,
  showOverlayFills: false,
  transpFlipBG: 75,
  transpSyncBG: 50,
  showLowConfidenceFills: true,
  showHighConfidenceFills: true,
};

const MA_OPTIONS = ['SMA', 'EMA', 'WMA', 'RMA'];

export const inputConfig: InputConfig[] = [
  { id: 'enableSmoothing', type: 'bool', title: 'Enable smoothing', defval: true },
  { id: 'smoothDpoLength', type: 'int', title: 'Smoothing length', defval: 5 },
  { id: 'checkPeriod', type: 'int', title: 'Bars back for short DPO', defval: 5 },
  { id: 'checkPeriod2', type: 'int', title: 'Bars back for long DPO', defval: 15 },
  { id: 'maType1', type: 'string', title: 'Short DPO moving average type', defval: 'WMA', options: MA_OPTIONS },
  { id: 'maType2', type: 'string', title: 'Long DPO moving average type', defval: 'WMA', options: MA_OPTIONS },
  { id: 'showDivergence', type: 'bool', title: 'Show Divergence', defval: true },
  { id: 'lookbackRight', type: 'int', title: 'Lookback Right', defval: 5, min: 1 },
  { id: 'lookbackLeft', type: 'int', title: 'Lookback Left', defval: 5, min: 1 },
  { id: 'rangeUpper', type: 'int', title: 'Range Upper', defval: 60, min: 1 },
  { id: 'rangeLower', type: 'int', title: 'Range Lower', defval: 5, min: 1 },
  { id: 'bearColor', type: 'color', title: 'Bearish Price/Rsi Divergence', defval: color.red },
  { id: 'bullColor', type: 'color', title: 'Bullish Price/Rsi Divergence', defval: color.green },
  { id: 'enableBGFills', type: 'bool', title: 'Enable Background Fills', defval: true },
  { id: 'showPaneFills', type: 'bool', title: 'Show in Subpane (Oscillator)', defval: true },
  { id: 'showOverlayFills', type: 'bool', title: 'Show on Price Chart (force_overlay)', defval: false },
  { id: 'transpFlipBG', type: 'int', title: 'Flip BG Transparency', defval: 75, min: 0, max: 100, step: 5 },
  { id: 'transpSyncBG', type: 'int', title: 'Sync BG Transparency', defval: 50, min: 0, max: 100, step: 5 },
  { id: 'showLowConfidenceFills', type: 'bool', title: 'Show Low-Confidence (Flip) BG', defval: true },
  { id: 'showHighConfidenceFills', type: 'bool', title: 'Show High-Confidence (Sync) BG', defval: true },
];

const LINE2_DOWN = String(color.rgb(250, 123, 123));
const NONE_COLOR = String(color.new(color.white, 100));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Final DPO 1', color: color.green, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Final DPO 2', color: color.lime, lineWidth: 4 },
  { id: 'plot2', title: 'Bullish', color: color.green, lineWidth: 4 },
  { id: 'plot3', title: 'Bearish', color: color.red, lineWidth: 4 },
];

export const metadata = {
  title: 'Dope DPO',
  shortTitle: 'DDPO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<DopeDpoInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);
  const at = (a: number[], i: number) => (i >= 0 && i < n ? a[i] : NaN);

  // barsback = period1 / 2 + 1 = 3.5 (Pine v6 int division keeps the fraction); a fractional history index is
  // truncated: ma[3.5] reads ma[3]. barsback2 = 10 / 2 + 1 = 6.
  const barsback = Math.trunc(5 / 2 + 1);
  const barsback2 = Math.trunc(10 / 2 + 1);
  const ribbon = (periods: number[], back: number): number[] => {
    const mas = periods.map((p) => A(ta.wma(closeS, p)));
    // averageDpo = (dpo1 + ... + dpo10) / 10, dpo = close - ma[barsback]
    return close.map((c, i) => {
      let sum = 0;
      for (const ma of mas) sum += c - at(ma, i - back);
      return sum / 10;
    });
  };
  const averageDpo = ribbon([5, 10, 15, 20, 25, 30, 35, 40, 45, 50], barsback);
  const averageDpo2 = ribbon([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], barsback2);

  const smoothed = A(ta.wma(S(averageDpo), cfg.smoothDpoLength));
  const smoothed2 = A(ta.wma(S(averageDpo2), cfg.smoothDpoLength));

  // getMovingAverage(series, length, maType2): the type is an input, so the same branch runs on every bar
  const getMa = (src: number[]): number[] => {
    switch (cfg.maType2) {
      case 'SMA': return A(ta.sma(S(src), cfg.smoothDpoLength));
      case 'EMA': return A(ta.ema(S(src), cfg.smoothDpoLength));
      case 'WMA': return A(ta.wma(S(src), cfg.smoothDpoLength));
      case 'RMA': return A(ta.rma(S(src), cfg.smoothDpoLength));
      default: return new Array(n).fill(NaN);
    }
  };
  const finalDpo = cfg.enableSmoothing ? getMa(averageDpo) : averageDpo;
  const finalDpo2 = cfg.enableSmoothing ? getMa(averageDpo2) : averageDpo2;

  // dpoColor = smoothedAverageDpo > smoothedAverageDpo[checkPeriod] ? green : red (lime / rgb(250, 123, 123))
  const histGreen = smoothed.map((v, i) => gt(v, at(smoothed, i - cfg.checkPeriod)));
  const lineGreen = smoothed2.map((v, i) => gt(v, at(smoothed2, i - cfg.checkPeriod2)));
  const dpoColor = histGreen.map((g) => (g ? color.green : color.red));
  const dpoColor2 = lineGreen.map((g) => (g ? color.lime : LINE2_DOWN));

  // Divergence
  const lbR = cfg.lookbackRight;
  const pl = A(ta.pivotlow(S(finalDpo2), cfg.lookbackLeft, lbR));
  const ph = A(ta.pivothigh(S(finalDpo2), cfg.lookbackLeft, lbR));
  const plFound: boolean[] = new Array(n).fill(false);
  const phFound: boolean[] = new Array(n).fill(false);
  const bullCond: boolean[] = new Array(n).fill(false);
  const bearCond: boolean[] = new Array(n).fill(false);
  // ta.valuewhen(found, x, 1): x on the found bar before the latest one (the latest can be the current bar)
  const plDpo: number[] = [];
  const plLow: number[] = [];
  const phDpo: number[] = [];
  const phHigh: number[] = [];
  // Pine `and` is lazy: the ta.barssince inside _inRange(...) only runs on the bars where the left side
  // (finalDpo2[lookbackRight] > / < ta.valuewhen(...)) is true, so it counts those calls. One state per call site.
  let plCalls = NaN;
  let phCalls = NaN;
  const inRange = (bars_: number) => cfg.rangeLower <= bars_ && bars_ <= cfg.rangeUpper;
  for (let i = 0; i < n; i++) {
    const dpoLbr = at(finalDpo2, i - lbR);
    const lowLbr = i - lbR >= 0 ? bars[i - lbR].low : NaN;
    const highLbr = i - lbR >= 0 ? bars[i - lbR].high : NaN;
    plFound[i] = !isNaN(pl[i]);
    phFound[i] = !isNaN(ph[i]);
    const prevPl = i > 0 && plFound[i - 1]; // plFound[1] (false before the first bar)
    const prevPh = i > 0 && phFound[i - 1];

    if (plFound[i]) {
      plDpo.push(dpoLbr);
      plLow.push(lowLbr);
    }
    const vwPlDpo = plDpo.length >= 2 ? plDpo[plDpo.length - 2] : NaN;
    const vwPlLow = plLow.length >= 2 ? plLow[plLow.length - 2] : NaN;
    // rsiHL = finalDpo2[lookbackRight] > ta.valuewhen(plFound, finalDpo2[lookbackRight], 1) and _inRange(plFound[1])
    let rsiHL = false;
    if (gt(dpoLbr, vwPlDpo)) {
      if (prevPl) plCalls = 0;
      else if (!isNaN(plCalls)) plCalls++;
      rsiHL = inRange(plCalls);
    }
    // priceLL = low[lookbackRight] < ta.valuewhen(plFound, low[lookbackRight], 1)
    const priceLL = lt(lowLbr, vwPlLow);
    bullCond[i] = cfg.showDivergence && priceLL && rsiHL && plFound[i];

    if (phFound[i]) {
      phDpo.push(dpoLbr);
      phHigh.push(highLbr);
    }
    const vwPhDpo = phDpo.length >= 2 ? phDpo[phDpo.length - 2] : NaN;
    const vwPhHigh = phHigh.length >= 2 ? phHigh[phHigh.length - 2] : NaN;
    // rsiLH = finalDpo2[lookbackRight] < ta.valuewhen(phFound, finalDpo2[lookbackRight], 1) and _inRange(phFound[1])
    let rsiLH = false;
    if (lt(dpoLbr, vwPhDpo)) {
      if (prevPh) phCalls = 0;
      else if (!isNaN(phCalls)) phCalls++;
      rsiLH = inRange(phCalls);
    }
    // priceHH = high[lookbackRight] > ta.valuewhen(phFound, high[lookbackRight], 1)
    const priceHH = gt(highLbr, vwPhHigh);
    bearCond[i] = cfg.showDivergence && priceHH && rsiLH && phFound[i];
  }

  const interval = barInterval(bars);
  const t = (i: number) => bars[i].time;
  const plots: Record<string, Point[]> = {};
  plots.plot0 = finalDpo.map((v, i) => ({ time: t(i), value: v, color: dpoColor[i] }));
  plots.plot1 = finalDpo2.map((v, i) => ({ time: t(i), value: v, color: dpoColor2[i] }));
  // plot(plFound ? finalDpo2[lookbackRight] : na, offset = -lookbackRight, color = bullCond ? bullColor : noneColor):
  // the value of bar i is drawn on bar i - lookbackRight
  const divPlot = (found: boolean[], cond: boolean[], c: string): Point[] => {
    const out: Point[] = [];
    for (let i = lbR; i < n; i++) {
      out.push({ time: barTime(bars, i - lbR, interval), value: found[i] ? at(finalDpo2, i - lbR) : NaN,
        color: cond[i] ? c : NONE_COLOR });
    }
    return out;
  };
  plots.plot2 = divPlot(plFound, bullCond, cfg.bullColor);
  plots.plot3 = divPlot(phFound, bearCond, cfg.bearColor);

  // Background: flip (histogram changes colour against the line) and sync (both agree after a change)
  const bgColors: BgColorData[] = [];
  const flipGreenC = String(color.new(color.green, cfg.transpFlipBG));
  const flipRedC = String(color.new(color.red, cfg.transpFlipBG));
  const syncGreenC = String(color.new(color.green, cfg.transpSyncBG));
  const syncRedC = String(color.new(color.red, cfg.transpSyncBG));
  const low = cfg.enableBGFills && cfg.showLowConfidenceFills;
  const high = cfg.enableBGFills && cfg.showHighConfidenceFills;
  for (let i = 0; i < n; i++) {
    // histRed = dpoColor == color.red (= not histGreen); lineRed = dpoColor2 == rgb(250, 123, 123) (= not lineGreen);
    // x[1] of a bool is false before the first bar
    const hG = histGreen[i];
    const lG = lineGreen[i];
    const hR = dpoColor[i] === color.red;
    const lR = dpoColor2[i] === LINE2_DOWN;
    const hG1 = i > 0 && histGreen[i - 1];
    const lG1 = i > 0 && lineGreen[i - 1];
    const hR1 = i > 0 && dpoColor[i - 1] === color.red;
    const lR1 = i > 0 && dpoColor2[i - 1] === LINE2_DOWN;
    const flipToGreen = hG && !lG && !hG1;
    const flipToRed = hR && !lR && !hR1;
    const syncGreen = hG && lG && !(hG1 && lG1);
    const syncRed = hR && lR && !(hR1 && lR1);
    const layers: [boolean, boolean, string][] = [
      [low, flipToGreen, flipGreenC],
      [low, flipToRed, flipRedC],
      [high, syncGreen, syncGreenC],
      [high, syncRed, syncRedC],
    ];
    // bgcolor(pane...) x 4 (bgcolor0..3), then bgcolor(overlay..., force_overlay = true) x 4 (bgcolor4..7)
    if (cfg.showPaneFills) {
      layers.forEach(([on, cond, c], k) => {
        if (on && cond) bgColors.push({ id: `bgcolor${k}`, time: t(i), color: c });
      });
    }
    if (cfg.showOverlayFills) {
      layers.forEach(([on, cond, c], k) => {
        if (on && cond) bgColors.push({ id: `bgcolor${k + 4}`, time: t(i), color: c, forceOverlay: true });
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    bgColors,
  };
}

export const DopeDpo = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
