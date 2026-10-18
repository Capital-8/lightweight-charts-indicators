/**
 * Peak Reversal v3
 *
 * Keltner Channels: a moving average of the close (EMA, SMA, RMA, VWMA or HMA) +- ATR * inner / outer multiplier.
 * Squeeze: the percent rank (over the lookback) of the band width / basis of the signal band; at or below the
 * percentile threshold the inner (or outer, when it is shown) channel is filled with a gradient colour. With the
 * signal band: bars are coloured by the number of bars since the last bar that stayed inside the upper band (high and
 * close at or below it) and since the last bar that stayed inside the lower band, with a gradient that reaches the
 * full colour after the max momentum bars (the lower band colour is drawn over the upper one). Triangles mark the
 * first bar of a high (or close) at or above the upper band and of a low (or close) at or below the lower band; stars
 * mark free bars (low at or above the upper band, high at or below the lower band).
 *
 * Reference: "Peak Reversal v3" by Zettt
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zettt 2021
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';

export interface PeakReversalV3Inputs {
  /** MA type of the Keltner basis */
  maType: 'EMA' | 'SMA' | 'RMA' | 'VMA' | 'HMA';
  /** MA length of the Keltner basis */
  keltnerEMAlength: number;
  /** ATR length of the Keltner bands */
  atrLength: number;
  /** Inner band multiplier */
  innerBandMultiplier: number;
  /** Outer band multiplier */
  outerBandMultiplier: number;
  showMeanEMA: boolean;
  showInnerBand: boolean;
  showOuterBand: boolean;
  /** Only the first signal after a reset */
  showOnlyFirstSignal: boolean;
  /** Band cross triangles */
  showBandCross: boolean;
  /** Free bar stars */
  showFreeBars: boolean;
  /** Bar colours of the mean deviations */
  showDeviations: boolean;
  /** Band used for the signals */
  signalBand: 'Inner' | 'Outer';
  /** Wick (high / low) or close */
  signalSource: 'Wick' | 'Close';
  /** Bars at which the momentum colour reaches its full intensity */
  maxMomentumBars: number;
  upMomentumColor: string;
  downMomentumColor: string;
  showSqueeze: boolean;
  /** Lookback of the band width percent rank */
  squeezeLength: number;
  /** Percentile threshold of the squeeze */
  squeezeThresh: number;
  squeezeColorInput: string;
}

export const defaultInputs: PeakReversalV3Inputs = {
  maType: 'EMA',
  keltnerEMAlength: 20,
  atrLength: 14,
  innerBandMultiplier: 2,
  outerBandMultiplier: 3,
  showMeanEMA: true,
  showInnerBand: true,
  showOuterBand: false,
  showOnlyFirstSignal: true,
  showBandCross: true,
  showFreeBars: false,
  showDeviations: true,
  signalBand: 'Inner',
  signalSource: 'Wick',
  maxMomentumBars: 5,
  upMomentumColor: '#ee5e48',
  downMomentumColor: '#25bc3e',
  showSqueeze: true,
  squeezeLength: 200,
  squeezeThresh: 5.0,
  squeezeColorInput: 'rgba(120, 123, 134, 0.4)',
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'EMA', options: ['EMA', 'SMA', 'RMA', 'VMA', 'HMA'] },
  { id: 'keltnerEMAlength', type: 'int', title: 'MA Length', defval: 20, min: 1 },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1 },
  { id: 'innerBandMultiplier', type: 'float', title: 'Inner', defval: 2, min: 0.1, step: 0.25 },
  { id: 'outerBandMultiplier', type: 'float', title: 'Outer', defval: 3, min: 0.1, step: 0.25 },
  { id: 'showMeanEMA', type: 'bool', title: 'Show Mean EMA?', defval: true },
  { id: 'showInnerBand', type: 'bool', title: 'Inner Band?', defval: true },
  { id: 'showOuterBand', type: 'bool', title: 'Outer Band?', defval: false },
  { id: 'showOnlyFirstSignal', type: 'bool', title: 'Show Only First Signal', defval: true },
  { id: 'showBandCross', type: 'bool', title: 'Band Crosses?', defval: true },
  { id: 'showFreeBars', type: 'bool', title: 'Free Bars?', defval: false },
  { id: 'showDeviations', type: 'bool', title: 'Show Mean Deviations?', defval: true },
  { id: 'signalBand', type: 'string', title: 'Signal Band', defval: 'Inner', options: ['Inner', 'Outer'] },
  { id: 'signalSource', type: 'string', title: 'Signal Source', defval: 'Wick', options: ['Wick', 'Close'] },
  { id: 'maxMomentumBars', type: 'int', title: 'Max Momentum Bars', defval: 5, min: 1 },
  { id: 'upMomentumColor', type: 'color', title: 'Up', defval: '#ee5e48' },
  { id: 'downMomentumColor', type: 'color', title: 'Down', defval: '#25bc3e' },
  { id: 'showSqueeze', type: 'bool', title: 'Show Squeeze?', defval: true },
  { id: 'squeezeLength', type: 'int', title: 'Lookback', defval: 200, min: 1 },
  { id: 'squeezeThresh', type: 'float', title: 'Percentile', defval: 5.0, min: 0.1, max: 100.0, step: 0.1 },
  { id: 'squeezeColorInput', type: 'color', title: 'Squeeze Color', defval: 'rgba(120, 123, 134, 0.4)' },
];

const MEAN_COLOR = String(color.new('#BB6083', 40));
const INNER_COLOR = String(color.new('#DD8EAD', 30));
const OUTER_COLOR = String(color.new('#DD8EAD', 40));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Keltner Channel EMA (Mean)', color: MEAN_COLOR, lineWidth: 1 },
  { id: 'plot1', title: 'Inner Upper Band', color: INNER_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Inner Lower Band', color: INNER_COLOR, lineWidth: 1 },
  { id: 'plot3', title: 'Outer Upper Band', color: OUTER_COLOR, lineWidth: 1 },
  { id: 'plot4', title: 'Outer Lower Band', color: OUTER_COLOR, lineWidth: 1 },
];

export const metadata = {
  title: 'Peak Reversal v3',
  shortTitle: 'Peak Reversal',
  overlay: true,
};

/** Pine float comparisons: a <= b unless a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<PeakReversalV3Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const len = cfg.keltnerEMAlength;

  // Keltner basis: only the branch of the selected MA type runs
  let basis: number[];
  switch (cfg.maType) {
    case 'EMA': basis = A(ta.ema(close, len)); break;
    case 'SMA': basis = A(ta.sma(close, len)); break;
    case 'RMA': basis = A(ta.rma(close, len)); break;
    case 'VMA': basis = A(ta.vwma(close, len, S(bars.map((b) => b.volume ?? NaN)))); break;
    case 'HMA':
      if (len === 1 && n > 0) {
        throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
      }
      basis = A(ta.hma(close, len));
      break;
    default: basis = new Array(n).fill(NaN);
  }
  const atrRange = A(ta.atr(bars, cfg.atrLength));
  const upInner = basis.map((v, i) => v + atrRange[i] * cfg.innerBandMultiplier);
  const downInner = basis.map((v, i) => v - atrRange[i] * cfg.innerBandMultiplier);
  const upOuter = basis.map((v, i) => v + atrRange[i] * cfg.outerBandMultiplier);
  const downOuter = basis.map((v, i) => v - atrRange[i] * cfg.outerBandMultiplier);
  const inner = cfg.signalBand === 'Inner';

  // Squeeze: percent rank of the band width / basis (plain division)
  const bandwidth = basis.map((v, i) => (inner ? (upInner[i] - downInner[i]) / v : (upOuter[i] - downOuter[i]) / v));
  const bandwidthRank = A(ta.percentrank(S(bandwidth), cfg.squeezeLength));
  const startColor = String(color.new(color.black, 100));
  const innerFill: string[] = new Array(n);
  const outerFill: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const inSqueeze = le(bandwidthRank[i], cfg.squeezeThresh);
    const squeezeColor = color.from_gradient(bandwidthRank[i], 0, cfg.squeezeThresh, cfg.squeezeColorInput, startColor);
    innerFill[i] = cfg.showSqueeze && inSqueeze && !cfg.showOuterBand ? squeezeColor : 'transparent';
    outerFill[i] = cfg.showSqueeze && inSqueeze && cfg.showOuterBand ? squeezeColor : 'transparent';
  }

  const upBand = inner ? upInner : upOuter;
  const downBand = inner ? downInner : downOuter;
  const upFaint = String(color.new(cfg.upMomentumColor, 80));
  const downFaint = String(color.new(cfg.downMomentumColor, 80));
  const upSignal = String(color.new(cfg.upMomentumColor, 50));
  const downSignal = String(color.new(cfg.downMomentumColor, 50));

  const barColors: BarColorData[] = [];
  const markers: MarkerData[] = [];
  let numFreeBarsUp = NaN; // ta.barssince(firstFreeBarUp)
  let numFreeBarsDown = NaN; // ta.barssince(firstFreeBarDown)
  let prevLongCross = false;
  let prevShortCross = false;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const u = upBand[i];
    const d = downBand[i];

    // Mean deviations
    const firstFreeBarUp = le(b.high, u) && le(b.close, u);
    numFreeBarsUp = firstFreeBarUp ? 0 : isNaN(numFreeBarsUp) ? NaN : numFreeBarsUp + 1;
    const colorBarUp = color.from_gradient(numFreeBarsUp, 0, cfg.maxMomentumBars, upFaint, cfg.upMomentumColor);
    const firstFreeBarDown = ge(b.low, d) && ge(b.close, d);
    numFreeBarsDown = firstFreeBarDown ? 0 : isNaN(numFreeBarsDown) ? NaN : numFreeBarsDown + 1;
    const colorBarDown = color.from_gradient(numFreeBarsDown, 0, cfg.maxMomentumBars, downFaint, cfg.downMomentumColor);
    // barcolor(Mean Deviations Up) then barcolor(Mean Deviations Down): the later non-na colour is drawn
    const up = cfg.showDeviations && gt(numFreeBarsUp, 0) ? colorBarUp : null;
    const down = cfg.showDeviations && gt(numFreeBarsDown, 0) ? colorBarDown : null;
    if (up) barColors.push({ id: 'barcolor0', time: b.time, color: up });
    if (down) barColors.push({ id: 'barcolor1', time: b.time, color: down });

    // Band crosses (every historical bar is confirmed)
    const longCrossCandle = cfg.signalSource === 'Wick' ? b.high : b.close;
    const shortCrossCandle = cfg.signalSource === 'Wick' ? b.low : b.close;
    const longCross = ge(longCrossCandle, u);
    const shortCross = le(shortCrossCandle, d);
    const showLongCross = cfg.showOnlyFirstSignal ? longCross && !prevLongCross : longCross;
    const showShortCross = cfg.showOnlyFirstSignal ? shortCross && !prevShortCross : shortCross;
    prevLongCross = longCross;
    prevShortCross = shortCross;
    if (cfg.showBandCross && showLongCross) {
      markers.push({ id: 'shape0', time: b.time, position: 'aboveBar', shape: 'triangleDown', color: upSignal, size: 'tiny' });
    }
    if (cfg.showBandCross && showShortCross) {
      markers.push({ id: 'shape1', time: b.time, position: 'belowBar', shape: 'triangleUp', color: downSignal, size: 'tiny' });
    }

    // Free bars; the Pine source uses the inner lower band for shortFreeBar with both signal bands
    const longFreeBar = ge(b.low, u);
    const shortFreeBar = le(b.high, downInner[i]);
    // plotchar('★', size.tiny): the character as text in the plotchar colour
    if (cfg.showFreeBars && longFreeBar) {
      markers.push({ id: 'char2', time: b.time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '★',
        textColor: upSignal, size: 'tiny' });
    }
    if (cfg.showFreeBars && shortFreeBar) {
      markers.push({ id: 'char3', time: b.time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '★',
        textColor: downSignal, size: 'tiny' });
    }
  }

  const line = (on: boolean, values: number[], c: string) =>
    bars.map((b, i) => ({ time: b.time, value: on ? values[i] : NaN, color: c }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.showMeanEMA, basis, MEAN_COLOR),
      plot1: line(cfg.showInnerBand, upInner, INNER_COLOR),
      plot2: line(cfg.showInnerBand, downInner, INNER_COLOR),
      plot3: line(cfg.showOuterBand, upOuter, OUTER_COLOR),
      plot4: line(cfg.showOuterBand, downOuter, OUTER_COLOR),
    },
    fills: [
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'Inner Band Squeeze Fill' }, colors: innerFill },
      { plot1: 'plot3', plot2: 'plot4', options: { title: 'Outer Band Squeeze Fill' }, colors: outerFill },
    ],
    markers,
    barColors,
  };
}

export const PeakReversalV3 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
