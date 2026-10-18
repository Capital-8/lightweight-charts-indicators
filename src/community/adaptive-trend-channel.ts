/**
 * Adaptive Trend Channel
 *
 * The high, low and close are smoothed with a linear regression (value at the current bar). A two-state regime
 * follows them: in the bull state a support trail keeps the highest `envelopeBars` low of the regressed lows and the
 * state turns bear when the SMA of the regressed highs falls below it and the regressed close is below the previous
 * regressed low; the bear state is the mirror image. The mid channel starts at the window trough (bull) / peak (bear)
 * on a flip and then only rises (bull) / falls (bear). The active band is the mid channel -/+ factor * ATR(100) / 2,
 * with a gradient fill between the candle body midpoint and the band, and circles mark the flips.
 *
 * Reference: "Adaptive Trend Channel" by MarketStructureLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Adaptive Trend Channel, developed by MarketStructureLab.
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface AdaptiveTrendChannelInputs {
  /** Bars of the linear regression of high / low / close */
  regressionBars: number;
  /** Window of the SMA and highest / lowest of the regressed series */
  envelopeBars: number;
  /** Half-channel width = factor * ATR(100) / 2 (drawing only) */
  atrStretch: number;
  /** Colour of the bull state */
  uptrendPaint: string;
  /** Colour of the bear state */
  downtrendPaint: string;
}

const BRAND_BULL = String(color.rgb(64, 217, 143));
const BRAND_BEAR = String(color.rgb(246, 113, 113));

export const defaultInputs: AdaptiveTrendChannelInputs = {
  regressionBars: 7,
  envelopeBars: 2,
  atrStretch: 2.0,
  uptrendPaint: BRAND_BULL,
  downtrendPaint: BRAND_BEAR,
};

export const inputConfig: InputConfig[] = [
  { id: 'regressionBars', type: 'int', title: 'Linear regression span', defval: 7, min: 1 },
  { id: 'envelopeBars', type: 'int', title: 'Envelope reaction length', defval: 2, min: 1 },
  { id: 'atrStretch', type: 'float', title: 'Half-channel ATR factor', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'uptrendPaint', type: 'color', title: 'Bull channel', defval: BRAND_BULL },
  { id: 'downtrendPaint', type: 'color', title: 'Bear channel', defval: BRAND_BEAR },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Mid channel', color: String(color.new(BRAND_BULL, 90)), lineWidth: 2 },
  { id: 'plot1', title: 'Lower band', color: String(color.new(BRAND_BULL, 20)), lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Upper band', color: String(color.new(BRAND_BEAR, 20)), lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Adaptive Trend Channel',
  shortTitle: 'Adaptive Trend Channel',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveTrendChannelInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volatilityLookback = 100;

  // linreg(src, regressionBars, 0)
  const regHigh = A(ta.linreg(S(bars.map((b) => b.high)), cfg.regressionBars, 0));
  const regLow = A(ta.linreg(S(bars.map((b) => b.low)), cfg.regressionBars, 0));
  const regClose = A(ta.linreg(S(bars.map((b) => b.close)), cfg.regressionBars, 0));
  const upperReaction = A(ta.sma(S(regHigh), cfg.envelopeBars));
  const lowerReaction = A(ta.sma(S(regLow), cfg.envelopeBars));
  const windowPeak = A(ta.highest(S(regHigh), cfg.envelopeBars));
  const windowTrough = A(ta.lowest(S(regLow), cfg.envelopeBars));
  const atr = A(ta.atr(bars, volatilityLookback));

  // Regime: var regime = na, centerline = na, bullSupportTrail = low (bar 0), bearResistanceTrail = high (bar 0).
  // math.min / math.max give na when an argument is na.
  const regimeArr: number[] = new Array(n);
  const center: number[] = new Array(n);
  let regime = NaN;
  let centerline = NaN;
  let bullSupportTrail = n > 0 ? bars[0].low : NaN;
  let bearResistanceTrail = n > 0 ? bars[0].high : NaN;
  for (let i = 0; i < n; i++) {
    const historyReady = i > cfg.regressionBars;
    const regLowPrev = i > 0 ? regLow[i - 1] : NaN;
    const regHighPrev = i > 0 ? regHigh[i - 1] : NaN;
    if (isNaN(regime) && historyReady) {
      regime = 1;
      centerline = windowTrough[i];
      bullSupportTrail = regLow[i];
    } else if (regime === 1) {
      bullSupportTrail = Math.max(bullSupportTrail, windowTrough[i]);
      if (lt(upperReaction[i], bullSupportTrail) && lt(regClose[i], regLowPrev)) {
        regime = -1;
        centerline = windowPeak[i];
        bearResistanceTrail = regHigh[i];
      }
    } else {
      bearResistanceTrail = Math.min(bearResistanceTrail, windowPeak[i]);
      if (gt(lowerReaction[i], bearResistanceTrail) && gt(regClose[i], regHighPrev)) {
        regime = 1;
        centerline = windowTrough[i];
        bullSupportTrail = regLow[i];
      }
    }
    centerline = regime === 1 ? Math.max(centerline, windowTrough[i]) : Math.min(centerline, windowPeak[i]);
    regimeArr[i] = regime;
    center[i] = centerline;
  }

  const half = atr.map((a) => cfg.atrStretch * a * 0.5);
  const roof = center.map((c, i) => c + half[i]);
  const floor = center.map((c, i) => c - half[i]);
  const fillMid = bars.map((b) => (b.open + b.close) * 0.5);

  const bullMid = String(color.new(cfg.uptrendPaint, 90));
  const bearMid = String(color.new(cfg.downtrendPaint, 90));
  const bullBand = String(color.new(cfg.uptrendPaint, 20));
  const bearBand = String(color.new(cfg.downtrendPaint, 20));
  const bullFillStrong = String(color.new(cfg.uptrendPaint, 45));
  const bearFillStrong = String(color.new(cfg.downtrendPaint, 45));

  // ta.crossover(regime, 0) / ta.crossunder(regime, 0): exact comparisons (no 1e-10 tolerance); na on the previous
  // bar gives false. plotshape(flipDown ? roof : na, "Bearish flip") is shape0, plotshape(flipUp ? floor : na,
  // "Bullish flip") shape1
  const markers: MarkerData[] = [];
  for (let i = 1; i < n; i++) {
    const flipUp = regimeArr[i] > 0 && regimeArr[i - 1] <= 0;
    const flipDown = regimeArr[i] < 0 && regimeArr[i - 1] >= 0;
    if (flipDown && !isNaN(roof[i])) {
      markers.push({ id: 'shape0', time: bars[i].time, position: 'atPriceMiddle', price: roof[i], shape: 'circle',
        color: cfg.downtrendPaint, size: 'small' });
    }
    if (flipUp && !isNaN(floor[i])) {
      markers.push({ id: 'shape1', time: bars[i].time, position: 'atPriceMiddle', price: floor[i], shape: 'circle',
        color: cfg.uptrendPaint, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // tint = regime == 1 ? uptrendPaint : downtrendPaint (na regime: downtrendPaint)
      plot0: bars.map((b, i) => ({ time: b.time, value: center[i], color: regimeArr[i] === 1 ? bullMid : bearMid })),
      plot1: bars.map((b, i) => ({ time: b.time, value: regimeArr[i] === 1 ? floor[i] : NaN, color: bullBand })),
      plot2: bars.map((b, i) => ({ time: b.time, value: regimeArr[i] === -1 ? roof[i] : NaN, color: bearBand })),
    },
    fills: [
      // fill(pMid, pFloor, fillMid, floor, color.new(uptrendPaint, 90), color.new(uptrendPaint, 45))
      { plot1: 'plot0', plot2: 'plot1', gradient: { topValue: fillMid, bottomValue: floor,
        topColor: new Array(n).fill(bullMid), bottomColor: new Array(n).fill(bullFillStrong) } },
      // fill(pMid, pRoof, roof, fillMid, color.new(downtrendPaint, 45), color.new(downtrendPaint, 90))
      { plot1: 'plot0', plot2: 'plot2', gradient: { topValue: roof, bottomValue: fillMid,
        topColor: new Array(n).fill(bearFillStrong), bottomColor: new Array(n).fill(bearMid) } },
    ],
    markers,
  };
}

export const AdaptiveTrendChannel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
