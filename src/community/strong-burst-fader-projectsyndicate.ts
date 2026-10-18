/**
 * Strong Burst Fader
 *
 * Bands at basis +- bandMult x ATR (basis: EMA / SMA / HMA / WMA / VWMA / RMA of the source). A bar whose high is
 * above the upper band (low below the lower band; optionally the close too) is an up (down) burst of magnitude
 * (high - upper) / ATR. When the magnitude of the previous bar is > 0, >= the bar before it and > the current one,
 * the previous bar is a burst peak: a stack of 1 + int(magnitude / stepATR) diamonds (at most maxLevels) is drawn on
 * it above the high (below the low), coloured by a cool-to-hot gradient of magnitude / heatSat; a triangle above
 * (below) the stack when it has at least fadeMin diamonds, and an optional background tint at the full stack.
 * Alerts (alertcondition, `alerts` of the result): up / down burst peak and extreme up / down (peak at the full
 * stack), true on the bar that confirms the peak.
 *
 * Last bar: with 'Confirm on bar close' a burst peak is detected on a closed bar only. The port reads the state of
 * the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Strong Burst Fader" by ProjectSyndicate
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface StrongBurstFaderInputs {
  src: SourceType;
  basisType: 'EMA' | 'SMA' | 'HMA' | 'WMA' | 'VWMA' | 'RMA';
  basisLen: number;
  atrLen: number;
  bandMult: number;
  stepATR: number;
  maxLevels: number;
  heatSat: number;
  needClose: boolean;
  /** Confirm on bar close: a peak is detected on a closed bar only */
  confirmBar: boolean;
  baseGap: number;
  rowGap: number;
  showBg: boolean;
  colorCold: string;
  colorWarm: string;
  colorHot: string;
  colorExtreme: string;
  showFade: boolean;
  fadeMin: number;
}

export const defaultInputs: StrongBurstFaderInputs = {
  src: 'close',
  basisType: 'EMA',
  basisLen: 20,
  atrLen: 14,
  bandMult: 2.0,
  stepATR: 0.5,
  maxLevels: 6,
  heatSat: 3.0,
  needClose: false,
  confirmBar: true,
  baseGap: 0.6,
  rowGap: 0.45,
  showBg: false,
  colorCold: '#26c6da',
  colorWarm: '#ffd54a',
  colorHot: '#ff7a1a',
  colorExtreme: '#ff2b4e',
  showFade: true,
  fadeMin: 3,
};

const GM = 'Burst Measurement';
const GV = 'Appearance';
const GC = 'Heatmap colours (cool → hot)';
const GF = 'Fade cues';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Basis source', defval: 'close', group: GM },
  { id: 'basisType', type: 'string', title: 'Basis type', defval: 'EMA', options: ['EMA', 'SMA', 'HMA', 'WMA', 'VWMA', 'RMA'], group: GM },
  { id: 'basisLen', type: 'int', title: 'Basis length', defval: 20, min: 2, max: 400, group: GM },
  { id: 'atrLen', type: 'int', title: 'ATR length', defval: 14, min: 2, max: 200, group: GM },
  { id: 'bandMult', type: 'float', title: 'Band width (ATR beyond basis = burst starts)', defval: 2.0, min: 0.2, max: 10.0, step: 0.1, group: GM,
    tooltip: 'A bar counts as a burst when its high pokes above basis + this·ATR (or its low below basis − this·ATR).' },
  { id: 'stepATR', type: 'float', title: 'ATR per stack step', defval: 0.5, min: 0.1, max: 3.0, step: 0.05, group: GM,
    tooltip: 'Each extra step of ATR beyond the band adds one diamond to the stack and one notch of heat.' },
  { id: 'maxLevels', type: 'int', title: 'Max stack height (diamonds)', defval: 6, min: 1, max: 6, group: GM,
    tooltip: 'Hard cap on the stack. 6 is the physical maximum this script draws.' },
  { id: 'heatSat', type: 'float', title: 'Heat saturates at (ATR beyond band)', defval: 3.0, min: 0.5, max: 12.0, step: 0.5, group: GM,
    tooltip: 'Burst magnitude (in ATR beyond the band) at which the colour reaches the hottest stop.' },
  { id: 'needClose', type: 'bool', title: 'Require closing burst (close beyond band)', defval: false, group: GM,
    tooltip: 'ON: only count a burst when the CLOSE also finishes beyond the band, filtering pure-wick pokes. OFF: any wick beyond the band counts.' },
  { id: 'confirmBar', type: 'bool', title: 'Confirm on bar close (non-repaint)', defval: true, group: GM,
    tooltip: 'ON: burst peaks are detected only on closed bars, so nothing repaints. OFF: the newest peak may update on the live bar.' },
  { id: 'baseGap', type: 'float', title: 'First diamond offset (× ATR from wick)', defval: 0.6, min: 0.0, max: 4.0, step: 0.1, group: GV },
  { id: 'rowGap', type: 'float', title: 'Stack spacing (× ATR)', defval: 0.45, min: 0.05, max: 2.0, step: 0.05, group: GV },
  { id: 'showBg', type: 'bool', title: 'Tint background on extreme bursts', defval: false, group: GV,
    tooltip: "Shades the peak bar's column with the heat colour once a burst reaches the max stack height." },
  { id: 'colorCold', type: 'color', title: 'Mild', defval: '#26c6da', group: GC },
  { id: 'colorWarm', type: 'color', title: 'Warm', defval: '#ffd54a', group: GC },
  { id: 'colorHot', type: 'color', title: 'Hot', defval: '#ff7a1a', group: GC },
  { id: 'colorExtreme', type: 'color', title: 'Extreme', defval: '#ff2b4e', group: GC },
  { id: 'showFade', type: 'bool', title: 'Show fade arrows on oversized bursts', defval: true, group: GF,
    tooltip: '▽ above an up-burst = fade short.  △ below a down-burst = fade long.' },
  { id: 'fadeMin', type: 'int', title: 'Min stack height to flag a fade', defval: 3, min: 1, max: 6, group: GF },
];

/** No plot(): the outputs are the plotshape markers (12 diamond stacks, 2 fade triangles) and a bgcolor */
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Strong Burst Fader',
  shortTitle: 'Strong Burst Fader',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<StrongBurstFaderInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const src = getSourceSeries(bars, cfg.src);
  let basisS: Series;
  switch (cfg.basisType) {
    case 'SMA': basisS = ta.sma(src, cfg.basisLen); break;
    case 'HMA': basisS = ta.hma(src, cfg.basisLen); break;
    case 'WMA': basisS = ta.wma(src, cfg.basisLen); break;
    case 'VWMA': basisS = ta.vwma(src, cfg.basisLen, Series.fromArray(bars, bars.map((b) => b.volume ?? NaN))); break;
    case 'RMA': basisS = ta.rma(src, cfg.basisLen); break;
    default: basisS = ta.ema(src, cfg.basisLen);
  }
  const basis = A(basisS);
  const atr = A(ta.atr(bars, cfg.atrLen));

  // upM0 / dnM0: burst magnitude in ATR beyond the band (0 when no burst)
  const upM0: number[] = new Array(n);
  const dnM0: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const upper = basis[i] + cfg.bandMult * atr[i];
    const lower = basis[i] - cfg.bandMult * atr[i];
    const upExtP = high - upper;
    const dnExtP = lower - low;
    const upMag = gt(atr[i], 0) ? upExtP / atr[i] : 0.0;
    const dnMag = gt(atr[i], 0) ? dnExtP / atr[i] : 0.0;
    const upSpike = gt(upExtP, 0) && (!cfg.needClose || gt(close, upper));
    const dnSpike = gt(dnExtP, 0) && (!cfg.needClose || lt(close, lower));
    upM0[i] = upSpike ? max(0.0, upMag) : 0.0;
    dnM0[i] = dnSpike ? max(0.0, dnMag) : 0.0;
  }

  const heatCol = (t: number): string => {
    const tt = max(0.0, min(1.0, t));
    return lt(tt, 0.4) ? color.from_gradient(tt, 0.0, 0.4, cfg.colorCold, cfg.colorWarm)
      : lt(tt, 0.75) ? color.from_gradient(tt, 0.4, 0.75, cfg.colorWarm, cfg.colorHot)
        : color.from_gradient(tt, 0.75, 1.0, cfg.colorHot, cfg.colorExtreme);
  };
  const fadeShortColor = String(color.new(cfg.colorExtreme, 0));
  const fadeLongColor = String(color.new('#2b7bff', 0));

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  // alertcondition(upPeak / dnPeak / upXtreme / dnXtreme): upXtreme = upPeak and upLvlPk >= maxLevels
  const flags: boolean[][] = [new Array(n).fill(false), new Array(n).fill(false), new Array(n).fill(false), new Array(n).fill(false)];
  for (let i = 2; i < n; i++) {
    const at = (m: number[], k: number) => m[i - k];
    const okBar = cfg.confirmBar ? barIsConfirmed(i) : true; // okBar = confirmBar ? barstate.isconfirmed : true
    const upPeak = okBar && gt(at(upM0, 1), 0) && ge(at(upM0, 1), at(upM0, 2)) && gt(at(upM0, 1), upM0[i]);
    const dnPeak = okBar && gt(at(dnM0, 1), 0) && ge(at(dnM0, 1), at(dnM0, 2)) && gt(at(dnM0, 1), dnM0[i]);
    if (!upPeak && !dnPeak) continue;
    const upPk = upM0[i - 1];
    const dnPk = dnM0[i - 1];
    const upLvlPk = Math.min(cfg.maxLevels, 1 + Math.trunc(upPk / cfg.stepATR));
    const dnLvlPk = Math.min(cfg.maxLevels, 1 + Math.trunc(dnPk / cfg.stepATR));
    const upColPk = heatCol(upPk / cfg.heatSat);
    const dnColPk = heatCol(dnPk / cfg.heatSat);
    flags[0][i] = upPeak;
    flags[1][i] = dnPeak;
    flags[2][i] = upPeak && upLvlPk >= cfg.maxLevels;
    flags[3][i] = dnPeak && dnLvlPk >= cfg.maxLevels;
    const aPk = atr[i - 1];
    const baseUp = bars[i - 1].high;
    const baseDn = bars[i - 1].low;
    // offset = -1: drawn on the peak bar i - 1
    const time = bars[i - 1].time;
    // id: the plotshape output ("Up 1".."Up 6" = shape0..shape5, "Dn 1".."Dn 6" = shape6..shape11)
    const diamond = (price: number, c: string, id: string) => {
      if (!isNaN(price)) markers.push({ time, position: 'atPriceMiddle', price, shape: 'diamond', color: c, size: 'small', id });
    };
    // u1..u6: upPeak and upLvlPk >= k ? baseUp + (baseGap + (k - 1) * rowGap) * aPk : na
    for (let k = 1; k <= 6; k++) {
      if (upPeak && upLvlPk >= k) diamond(baseUp + (cfg.baseGap + (k - 1) * cfg.rowGap) * aPk, upColPk, `shape${k - 1}`);
    }
    for (let k = 1; k <= 6; k++) {
      if (dnPeak && dnLvlPk >= k) diamond(baseDn - (cfg.baseGap + (k - 1) * cfg.rowGap) * aPk, dnColPk, `shape${k + 5}`);
    }
    if (cfg.showFade && upPeak && upLvlPk >= cfg.fadeMin) {
      const price = baseUp + (cfg.baseGap + upLvlPk * cfg.rowGap) * aPk;
      if (!isNaN(price)) {
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'triangleDown', color: fadeShortColor, size: 'tiny', id: 'shape12' });
      }
    }
    if (cfg.showFade && dnPeak && dnLvlPk >= cfg.fadeMin) {
      const price = baseDn - (cfg.baseGap + dnLvlPk * cfg.rowGap) * aPk;
      if (!isNaN(price)) {
        markers.push({ time, position: 'atPriceMiddle', price, shape: 'triangleUp', color: fadeLongColor, size: 'tiny', id: 'shape13' });
      }
    }
    // bgcolor(showBg and upPeak and upLvlPk >= maxLevels ? color.new(upColPk, 82) : showBg and dnPeak and ... , offset = -1)
    if (cfg.showBg) {
      const bg = upPeak && upLvlPk >= cfg.maxLevels ? color.new(upColPk, 82)
        : dnPeak && dnLvlPk >= cfg.maxLevels ? color.new(dnColPk, 82) : null;
      if (bg) bgColors.push({ time, color: String(bg) });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Burst Fader — Up burst (fade short)', message: 'Up burst peaked above the band — fade-short candidate.' },
  { id: 'alert1', title: 'Burst Fader — Down burst (fade long)', message: 'Down burst peaked below the band — fade-long candidate.' },
  { id: 'alert2', title: 'Burst Fader — Extreme up', message: 'Up burst peaked at max stack — heavily over-extended.' },
  { id: 'alert3', title: 'Burst Fader — Extreme down', message: 'Down burst peaked at max stack — heavily over-extended.' },
];

export const StrongBurstFader = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
