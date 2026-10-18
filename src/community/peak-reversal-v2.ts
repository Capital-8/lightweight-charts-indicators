/**
 * Peak Reversal v2
 *
 * Three Keltner Channels (EMA of the close +- EMA of the true range * multiplier) with the tight, normal and extreme
 * multipliers. With the selected band set: bars are coloured by the number of bars since the last bar that stayed
 * inside the upper band (high and close at or below it) and since the last bar that stayed inside the lower band
 * (low and close at or above it), in three shades (1-2, 3-5, more than 5 bars; the lower band colour is drawn over
 * the upper one). Triangles mark the first bar of a high at or above the upper band and of a close at or below the
 * lower band; stars mark free bars (low at or above the upper band, high at or below the lower band). Advanced mode
 * swaps the colours and the triangle directions.
 *
 * Reference: "Peak Reversal v2" by Zettt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zettt 2021
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';

export type PeakReversalBands = 'Tight' | 'Normal' | 'Extreme';

export interface PeakReversalV2Inputs {
  /** Keltner Channel EMA length */
  keltnerEMAlength: number;
  /** Tight band multiplier */
  tightKeltnerMultiplier: number;
  /** Normal band multiplier */
  keltnerMultiplier: number;
  /** Extreme band multiplier */
  extremePeakMultiplier: number;
  showMeanEMA: boolean;
  showTightBand: boolean;
  showNormalBand: boolean;
  showExtremeBand: boolean;
  /** Bar colours of the mean deviations */
  showDeviations: boolean;
  /** Band cross triangles */
  showBandCross: boolean;
  /** Free bar stars */
  showFreeBars: boolean;
  /** Swaps the colours and the triangle directions */
  advancedMode: boolean;
  /** Bands used for the crosses, the free bars and the bar colours */
  bandsToUse: PeakReversalBands;
}

export const defaultInputs: PeakReversalV2Inputs = {
  keltnerEMAlength: 21,
  tightKeltnerMultiplier: 1.125,
  keltnerMultiplier: 2.25,
  extremePeakMultiplier: 3.375,
  showMeanEMA: false,
  showTightBand: false,
  showNormalBand: true,
  showExtremeBand: true,
  showDeviations: true,
  showBandCross: true,
  showFreeBars: false,
  advancedMode: false,
  bandsToUse: 'Normal',
};

export const inputConfig: InputConfig[] = [
  { id: 'keltnerEMAlength', type: 'int', title: 'Keltner Channel EMA Length', defval: 21, min: 1 },
  { id: 'tightKeltnerMultiplier', type: 'float', title: 'Keltner Bands Normal Multiplier', defval: 1.125, min: 1 },
  { id: 'keltnerMultiplier', type: 'float', title: 'Keltner Bands Normal Multiplier', defval: 2.25, min: 1 },
  { id: 'extremePeakMultiplier', type: 'float', title: 'Keltner Extreme Multiplier', defval: 3.375, min: 1 },
  { id: 'showMeanEMA', type: 'bool', title: 'Show Mean EMA?', defval: false },
  { id: 'showTightBand', type: 'bool', title: 'Show Tight Band?', defval: false },
  { id: 'showNormalBand', type: 'bool', title: 'Show Normal Band?', defval: true },
  { id: 'showExtremeBand', type: 'bool', title: 'Show Extreme Band?', defval: true },
  { id: 'showDeviations', type: 'bool', title: 'Show Mean Deviations?', defval: true },
  { id: 'showBandCross', type: 'bool', title: 'Show Band Crosses?', defval: true },
  { id: 'showFreeBars', type: 'bool', title: 'Show Free Bars?', defval: false },
  { id: 'advancedMode', type: 'bool', title: 'Advanced Mode', defval: false },
  { id: 'bandsToUse', type: 'string', title: 'Bands to Use For Crosses and Free Bars:', defval: 'Normal', options: ['Tight', 'Normal', 'Extreme'] },
];

const MEAN_COLOR = String(color.new('#BB6083', 40));
const TIGHT_COLOR = String(color.new('#DD8EAD', 30));
const NORMAL_COLOR = String(color.new('#DD8EAD', 40));
const EXTREME_COLOR = String(color.new('#DD8EAD', 50));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Keltner Channel EMA (Mean)', color: MEAN_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'Tight Upper Band', color: TIGHT_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Tight Lower Band', color: TIGHT_COLOR, lineWidth: 1 },
  { id: 'plot3', title: 'Normal Upper Band', color: NORMAL_COLOR, lineWidth: 1 },
  { id: 'plot4', title: 'Normal Lower Band', color: NORMAL_COLOR, lineWidth: 1 },
  { id: 'plot5', title: 'Extreme Upper Band', color: EXTREME_COLOR, lineWidth: 1 },
  { id: 'plot6', title: 'Extreme Lower Band', color: EXTREME_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Peak Reversal v2',
  shortTitle: 'Peak Reversal v2',
  overlay: true,
};

/** Pine float comparisons: a <= b unless a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<PeakReversalV2Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const closeSeries = Series.fromArray(bars, bars.map((b) => b.close));
  const kc = (mult: number) => ta.kc(bars, closeSeries, cfg.keltnerEMAlength, mult).map(A);

  // ta.kc(close, keltnerEMAlength, mult): EMA of the close +- EMA of the true range * mult
  const [, upTight, downTight] = kc(cfg.tightKeltnerMultiplier);
  const [keltnerMA, upNormal, downNormal] = kc(cfg.keltnerMultiplier);
  const [, upExtreme, downExtreme] = kc(cfg.extremePeakMultiplier);

  const up = cfg.bandsToUse === 'Tight' ? upTight : cfg.bandsToUse === 'Normal' ? upNormal
    : cfg.bandsToUse === 'Extreme' ? upExtreme : null;
  const down = cfg.bandsToUse === 'Tight' ? downTight : cfg.bandsToUse === 'Normal' ? downNormal
    : cfg.bandsToUse === 'Extreme' ? downExtreme : null;
  // An if without a matching branch gives false
  const upAt = (i: number) => (up ? up[i] : NaN);
  const downAt = (i: number) => (down ? down[i] : NaN);

  const adv = cfg.advancedMode;
  const shade = (k: number, strong: string, mid: string, weak: string): string | null =>
    (k > 5 ? strong : k > 2 ? mid : k > 0 ? weak : null);

  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];
  const upTriangleShape: MarkerData['shape'] = adv ? 'triangleUp' : 'triangleDown';
  const upTriangleColor = adv ? '#81c784' : '#e57373';
  const downTriangleShape: MarkerData['shape'] = adv ? 'triangleDown' : 'triangleUp';
  const downTriangleColor = adv ? '#e57373' : '#81c784';
  const upStarColor = adv ? '#81c784' : '#e57373';
  const downStarColor = adv ? '#e57373' : '#81c784';

  let sinceUp = NaN; // ta.barssince(firstFreeBarUp)
  let sinceDown = NaN; // ta.barssince(firstFreeBarDown)
  let prevLongCross = false;
  let prevShortCross = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const u = upAt(i);
    const d = downAt(i);

    // firstFreeBarUp = high <= band and close <= band
    const firstFreeBarUp = le(b.high, u) && le(b.close, u);
    sinceUp = firstFreeBarUp ? 0 : isNaN(sinceUp) ? NaN : sinceUp + 1;
    // firstFreeBarDown = low >= band and close >= band
    const firstFreeBarDown = ge(b.low, d) && ge(b.close, d);
    sinceDown = firstFreeBarDown ? 0 : isNaN(sinceDown) ? NaN : sinceDown + 1;

    // na > k is false: colour na
    const colorBarUp = shade(sinceUp, adv ? '#1b5e20' : '#b71c1c', adv ? '#66bb6a' : '#ef5350', adv ? '#a5d6a7' : '#ef9a9a');
    const colorBarDown = shade(sinceDown, adv ? '#b71c1c' : '#1b5e20', adv ? '#ef5350' : '#66bb6a', adv ? '#ef9a9a' : '#a5d6a7');
    // barcolor(Mean Deviations Up) then barcolor(Mean Deviations Down): the later non-na colour is drawn
    if (cfg.showDeviations && colorBarUp) barColors.push({ id: 'barcolor0', time: b.time, color: colorBarUp });
    if (cfg.showDeviations && colorBarDown) barColors.push({ id: 'barcolor1', time: b.time, color: colorBarDown });

    const longCross = ge(b.high, u);
    const shortCross = le(b.close, d);
    // showOnlyFirstSignal = true: cross and not cross[1]
    if (cfg.showBandCross && longCross && !prevLongCross) {
      markers.push({ id: 'shape0', time: b.time, position: 'aboveBar', shape: upTriangleShape, color: upTriangleColor, size: 'tiny' });
    }
    if (cfg.showBandCross && shortCross && !prevShortCross) {
      markers.push({ id: 'shape1', time: b.time, position: 'belowBar', shape: downTriangleShape, color: downTriangleColor, size: 'tiny' });
    }
    prevLongCross = longCross;
    prevShortCross = shortCross;

    // plotchar('★', size.tiny): the character as text in the plotchar colour
    if (cfg.showFreeBars && ge(b.low, u)) {
      markers.push({ id: 'char2', time: b.time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '★',
        textColor: upStarColor, size: 'tiny' });
    }
    if (cfg.showFreeBars && le(b.high, d)) {
      markers.push({ id: 'char3', time: b.time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '★',
        textColor: downStarColor, size: 'tiny' });
    }
  }

  const line = (on: boolean, values: number[], c: string) =>
    bars.map((b, i) => ({ time: b.time, value: on ? values[i] : NaN, color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showMeanEMA, keltnerMA, MEAN_COLOR),
      plot1: line(cfg.showTightBand, upTight, TIGHT_COLOR),
      plot2: line(cfg.showTightBand, downTight, TIGHT_COLOR),
      plot3: line(cfg.showNormalBand, upNormal, NORMAL_COLOR),
      plot4: line(cfg.showNormalBand, downNormal, NORMAL_COLOR),
      plot5: line(cfg.showExtremeBand, upExtreme, EXTREME_COLOR),
      plot6: line(cfg.showExtremeBand, downExtreme, EXTREME_COLOR),
    },
    markers,
    barColors,
  };
}

export const PeakReversalV2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
