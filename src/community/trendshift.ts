/**
 * Trendshift
 *
 * Keeps the last confirmed swing high and swing low (pivots with `swingLen` bars on each side). A bullish structure
 * shift is a close above the last swing high (by at least `atrMultBreak` ATR with the ATR filter) while a swing low
 * exists; a bearish shift is a close below the last swing low (same filter) while a swing high exists; when both
 * happen on one bar the candle direction decides. A bullish shift sets the band from the last swing low to the bar
 * high, a bearish shift from the bar low to the last swing high. The regime goes neutral after `regimeTimeoutBars`
 * bars without a shift (the band is cleared unless it persists). With a valid band (high > low and at least
 * `minBandAtrMult` ATR tall) the background is tinted when the close is in the lower quarter (discount) or the upper
 * quarter (premium). Markers show the first bullish shift after a bearish one and the first bearish shift after a
 * bullish one.
 *
 * Reference: "Trendshift [CHE]" by chervolino
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © chervolino
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';

export interface TrendshiftInputs {
  /** Bars left / right of the swing highs and lows */
  swingLen: number;
  /** Require the breakout to exceed the swing level by an ATR multiple */
  useAtrFilter: boolean;
  /** ATR length */
  atrLen: number;
  /** Breakout distance beyond the swing level, in ATR */
  atrMultBreak: number;
  /** Premium / discount band on */
  enableFramework: boolean;
  /** Keep the last band after a regime timeout */
  persistLastBand: boolean;
  /** Minimum band height, in ATR */
  minBandAtrMult: number;
  /** Bars after the last shift before the regime is neutral (0 = no timeout) */
  regimeTimeoutBars: number;
  /** Swap the premium and discount colours */
  invertColors: boolean;
  /** Background tint in the discount and premium zones */
  showZoneTint: boolean;
  /** Markers of the first shift of each direction */
  showStructureMarks: boolean;
}

export const defaultInputs: TrendshiftInputs = {
  swingLen: 5,
  useAtrFilter: true,
  atrLen: 14,
  atrMultBreak: 1.0,
  enableFramework: true,
  persistLastBand: true,
  minBandAtrMult: 0.5,
  regimeTimeoutBars: 500,
  invertColors: true,
  showZoneTint: true,
  showStructureMarks: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'swingLen', type: 'int', title: 'Swing length', defval: 5, min: 1 },
  { id: 'useAtrFilter', type: 'bool', title: 'Use ATR filter', defval: true },
  { id: 'atrLen', type: 'int', title: 'ATR length', defval: 14, min: 1 },
  { id: 'atrMultBreak', type: 'float', title: 'Break ATR mult', defval: 1.0, min: 0.0, step: 0.1 },
  { id: 'enableFramework', type: 'bool', title: 'Enable framework', defval: true },
  { id: 'persistLastBand', type: 'bool', title: 'Persist band on timeout', defval: true },
  { id: 'minBandAtrMult', type: 'float', title: 'Min band size ATR mult', defval: 0.5, min: 0.0, step: 0.1 },
  { id: 'regimeTimeoutBars', type: 'int', title: 'Regime timeout bars', defval: 500, min: 0 },
  { id: 'invertColors', type: 'bool', title: 'Invert colors', defval: true },
  { id: 'showZoneTint', type: 'bool', title: 'Show zone tint', defval: true },
  { id: 'showStructureMarks', type: 'bool', title: 'Show shift markers', defval: true },
];

// No plot(): the outputs are background colours and markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Trendshift [CHE]',
  shortTitle: 'TrShift',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b when b - a <= 1e-10, == within 1e-10 (na false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendshiftInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const pivotHigh = A(ta.pivothigh(S(bars.map((b) => b.high)), cfg.swingLen, cfg.swingLen));
  const pivotLow = A(ta.pivotlow(S(bars.map((b) => b.low)), cfg.swingLen, cfg.swingLen));
  const atr = A(ta.atr(bars, cfg.atrLen));

  // Colours: color.new(color.new(c, 30), 85) is c with transparency 85
  const discountZone = cfg.invertColors ? String(color.new(color.red, 30)) : String(color.new(color.green, 30));
  const premiumZone = cfg.invertColors ? String(color.new(color.green, 30)) : String(color.new(color.red, 30));
  const discountBg = String(color.new(discountZone, 85));
  const premiumBg = String(color.new(premiumZone, 85));
  const bullColor = String(color.new(color.lime, 0));
  const bearColor = String(color.new(color.red, 0));

  let lastSwingHigh = NaN;
  let lastSwingLow = NaN;
  let regime = 0;
  let bandLow = NaN;
  let bandHigh = NaN;
  let lastShiftBar = NaN;
  let isLastShiftBullish = false;

  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (!isNaN(pivotHigh[i])) lastSwingHigh = pivotHigh[i];
    if (!isNaN(pivotLow[i])) lastSwingLow = pivotLow[i];
    const atrValue = atr[i];

    // Structure shifts
    const hasMajorHigh = !isNaN(lastSwingHigh);
    const hasMajorLow = !isNaN(lastSwingLow);
    const bullBase = hasMajorHigh && gt(b.close, lastSwingHigh);
    const bearBase = hasMajorLow && lt(b.close, lastSwingLow);
    let bullBreak = bullBase;
    let bearBreak = bearBase;
    if (cfg.useAtrFilter && gt(atrValue, 0)) {
      bullBreak = bullBase && ge(b.close - lastSwingHigh, cfg.atrMultBreak * atrValue);
      bearBreak = bearBase && ge(lastSwingLow - b.close, cfg.atrMultBreak * atrValue);
    }
    let bullShift = bullBreak && hasMajorLow;
    let bearShift = bearBreak && hasMajorHigh;
    if (bullShift && bearShift) {
      bullShift = ge(b.close, b.open);
      bearShift = !bullShift;
    }
    const bullFirst = bullShift && (isNaN(lastShiftBar) || !isLastShiftBullish);
    const bearFirst = bearShift && (isNaN(lastShiftBar) || isLastShiftBullish);

    // Regime and band update
    if (bullShift) {
      regime = 1;
      bandLow = lastSwingLow;
      bandHigh = b.high;
      lastShiftBar = i;
      isLastShiftBullish = true;
    }
    if (bearShift) {
      regime = -1;
      bandLow = b.low;
      bandHigh = lastSwingHigh;
      lastShiftBar = i;
      isLastShiftBullish = false;
    }
    // Regime timeout (bar_index differences do not depend on the first bar)
    if (cfg.regimeTimeoutBars > 0 && regime !== 0 && !bullShift && !bearShift && !isNaN(lastShiftBar)
      && i - lastShiftBar > cfg.regimeTimeoutBars) {
      regime = 0;
      if (!cfg.persistLastBand) {
        bandLow = NaN;
        bandHigh = NaN;
      }
    }

    // Premium / discount band
    const baseValid = cfg.enableFramework && !isNaN(bandLow) && !isNaN(bandHigh) && gt(bandHigh, bandLow);
    const span = baseValid ? bandHigh - bandLow : NaN;
    const notTiny = (baseValid && gt(atrValue, 0) && gt(cfg.minBandAtrMult, 0) && ge(span, cfg.minBandAtrMult * atrValue))
      || (baseValid && (eq(cfg.minBandAtrMult, 0) || le(atrValue, 0)));
    const valid = baseValid && notTiny;
    const discountThreshold = valid ? bandLow + 0.25 * span : NaN;
    const premiumThreshold = valid ? bandLow + 0.75 * span : NaN;
    const inDiscount = valid && le(b.close, discountThreshold);
    const inPremium = valid && ge(b.close, premiumThreshold);

    const t = b.time;
    // bgcolor(discount_bg_color, "Discount zone tint"), then bgcolor(premium_bg_color, "Premium zone tint")
    if (cfg.showZoneTint && inDiscount) bgColors.push({ id: 'bgcolor0', time: t, color: discountBg });
    if (cfg.showZoneTint && inPremium) bgColors.push({ id: 'bgcolor1', time: t, color: premiumBg });
    // plotshape(... ? low : na, shape.triangleup, location.belowbar, size.small, text = "Shift↑", textcolor = color.white)
    if (cfg.showStructureMarks && bullFirst) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: bullColor, text: 'Shift↑', textColor: color.white, size: 'small' });
    }
    // plotshape(... ? high : na, shape.triangledown, location.abovebar, size.small, text = "Shift↓", textcolor = color.white)
    if (cfg.showStructureMarks && bearFirst) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: bearColor, text: 'Shift↓', textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    bgColors,
  };
}

export const Trendshift = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
