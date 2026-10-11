/**
 * Volume Profile (kv4coins)
 *
 * A volume profile of the last bars, drawn on the last bar with horizontal lines to the right of the chart. The
 * range from the lowest low to the highest high of the lookback bars is cut into price levels. Each bar (all bars,
 * or only the bullish or the bearish ones) adds its whole volume to every level that lies inside its low / high
 * range. The length of a line is its volume against the largest one. The level with the most volume is the point of
 * control (PoC); the value area grows from it, one level at a time towards the side with more volume, until it holds
 * the chosen share of the total. The PoC line and the two value area lines start at the first bar of the lookback.
 *
 * Lookback: a fixed number of bars, or with "Use Visible Range" the bars from the first bar visible on the chart to
 * the last bar. The number of bars is then the time between these two bars divided by the bar duration, so days
 * without bars (weekends, holidays) count too. The first visible bar comes from the chart context (third argument of
 * calculate, `leftVisibleBarTime`); without it the first bar given to the indicator is used. The indicator must be
 * calculated again when the user scrolls or zooms the chart. As in the original, a lookback of 0 bars or of more
 * than 15,000 bars is a runtime error, and nothing is drawn when the lookback is longer than the history.
 *
 * Reference: "Volume Profile" by kv4coins
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © kv4coins
 */

import { ta, array, math, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { visibleRangeOf, type ChartContext } from '../chart-context';

export interface VolumeProfileKv4coinsInputs {
  /** Use the bars from the first visible bar of the chart to the last bar */
  useVisibleRange: boolean;
  /** Number of bars of the profile (not used with the visible range) */
  lookbackDepth: number;
  /** Number of price levels (one line each) */
  numBars: number;
  barThickness: number;
  /** Length of the longest line, in percent of the lookback */
  barLengthMult: number;
  /** Bars between the last bar and the right end of the profile */
  rightOffset: number;
  volumeType: 'Both' | 'Bullish' | 'Bearish';
  barColor: string;
  displayPoc: boolean;
  pocLineThickness: number;
  pocLineColor: string;
  displayVa: boolean;
  /** Share of the total volume inside the value area, in percent */
  vaPercent: number;
  vaBarColor: string;
  displayVaLines: boolean;
  vaLinesThickness: number;
}

export const defaultInputs: VolumeProfileKv4coinsInputs = {
  useVisibleRange: false,
  lookbackDepth: 200,
  numBars: 200,
  barThickness: 1,
  barLengthMult: 20,
  rightOffset: 70,
  volumeType: 'Both',
  barColor: 'rgba(120, 123, 134, 0.5)',
  displayPoc: true,
  pocLineThickness: 1,
  pocLineColor: '#F23645',
  displayVa: true,
  vaPercent: 68,
  vaBarColor: '#2962FF',
  displayVaLines: true,
  vaLinesThickness: 1,
};

const G_LOOKBACK = 'Lookback Period';
const G_BARS = 'Volume Bars';
const G_POC = 'Point of Control';
const G_VA = 'Value Area';

export const inputConfig: InputConfig[] = [
  {
    id: 'useVisibleRange', type: 'bool', title: 'Use Visible Range', defval: false, group: G_LOOKBACK,
    tooltip: 'Calculate Volume Profile using all visible bars in the current chart',
  },
  {
    id: 'lookbackDepth', type: 'int', title: 'Fixed Range Lookback Depth [10-3000]', defval: 200, min: 10, max: 3000,
    group: G_LOOKBACK,
    tooltip: 'Number of historical bars to include in the calculation. Ignored if "Use Visible Range" is enabled',
  },
  {
    id: 'numBars', type: 'int', title: 'Number of Volume Bars [10-490]', defval: 200, min: 10, max: 490, group: G_BARS,
    tooltip: 'Number of Volume Profile bars',
  },
  {
    id: 'barThickness', type: 'int', title: 'Volume Bar Thickness [1-30]', defval: 1, min: 1, max: 30, group: G_BARS,
    tooltip: 'Width of each volume bar in the Volume Profile',
  },
  {
    id: 'barLengthMult', type: 'int', title: 'Bar Length Multiplier [1-50]', defval: 20, min: 1, max: 50, group: G_BARS,
    tooltip: 'Volume Profile Bar length multiplier',
  },
  {
    id: 'rightOffset', type: 'int', title: 'Right Offset [0-400]', defval: 70, min: 0, max: 400, group: G_BARS,
    tooltip: 'Space between the right bar of the chart and the Volume Profile',
  },
  {
    id: 'volumeType', type: 'string', title: 'Volume Type', defval: 'Both', options: ['Both', 'Bullish', 'Bearish'],
    group: G_BARS, tooltip: 'Select the type of Volume to include',
  },
  {
    id: 'barColor', type: 'color', title: 'Volume Bar Color', defval: 'rgba(120, 123, 134, 0.5)', group: G_BARS,
    tooltip: 'Color of the volume bars in the Volume Profile',
  },
  {
    id: 'displayPoc', type: 'bool', title: 'Display Point of Control (PoC)', defval: true, group: G_POC,
    tooltip: 'Enable or disable the display of the Point of Control (PoC)',
  },
  {
    id: 'pocLineThickness', type: 'int', title: 'PoC Line Thickness [1-30]', defval: 1, min: 1, max: 30, group: G_POC,
    tooltip: 'Width of the PoC line',
  },
  {
    id: 'pocLineColor', type: 'color', title: 'PoC Line Color', defval: '#F23645', group: G_POC,
    tooltip: 'Color of the Point of Control (PoC) line',
  },
  {
    id: 'displayVa', type: 'bool', title: 'Display Value Area', defval: true, group: G_VA,
    tooltip: 'Enable or disable the display of the Value Area',
  },
  {
    id: 'vaPercent', type: 'int', title: 'Value Area Percentage(%) [5-95]', defval: 68, min: 5, max: 95, group: G_VA,
    tooltip: 'Percentage of the Value Area',
  },
  {
    id: 'vaBarColor', type: 'color', title: 'Value Area Bar Color', defval: '#2962FF', group: G_VA,
    tooltip: 'Color of the volume bars in the Value Area',
  },
  {
    id: 'displayVaLines', type: 'bool', title: 'Display Value Area Lines', defval: true, group: G_VA,
    tooltip: 'Enable or disable the display of the Value Area lines. Ignored if "Display Value Area" is disabled',
  },
  {
    id: 'vaLinesThickness', type: 'int', title: 'Value Area Lines Thickness [1-20]', defval: 1, min: 1, max: 20, group: G_VA,
    tooltip: 'Width of the Value Area lines',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = { title: 'Volume Profile', shortTitle: 'VP', overlay: true };

/** The output depends on the bars visible on the chart ("Use Visible Range"): calculate again on scroll / zoom */
export const usesVisibleRange = true;

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

/** Longest window of ta.highest / ta.lowest */
const MAX_WINDOW = 15000;

export function calculate(
  bars: Bar[], inputs: Partial<VolumeProfileKv4coinsInputs> = {}, chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const result = (lines: LineDrawingData[]) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
  });
  if (n === 0) return result([]);
  const numBars = cfg.numBars;

  // var lookback_bars: from the last bar back to the first visible bar, in bar durations
  let lookback = cfg.lookbackDepth;
  if (cfg.useVisibleRange) {
    const tf = chartTimeframe(bars, chart);
    const barMs = tf === '' ? NaN : 1000 * timeframe.in_seconds(tf);
    const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
    lookback = math.round((bars[n - 1].time * toMs - visibleRangeOf(bars, chart).leftTime) / barMs);
  }
  if (isNaN(lookback)) return result([]);
  // ta.highest(lookback_bars) / ta.lowest(lookback_bars) stop the script on the first bar
  if (lookback <= 0) {
    throw new Error(`Error on bar 0: Invalid value of the 'length' argument (${lookback.toFixed(1)}) in the 'highest' function. It must be > 0.`);
  }
  if (lookback > MAX_WINDOW) {
    throw new Error(`Error on bar 0: The 'highest' function references too many historical candles (${lookback}), the limit is ${MAX_WINDOW}.`);
  }

  // the lines are created on the first bar and placed on the last bar (barstate.islast)
  const last = n - 1;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const highestPrice = A(ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), lookback))[last];
  const lowestPrice = A(ta.lowest(Series.fromArray(bars, bars.map((b) => b.low)), lookback))[last];
  const priceInterval = (highestPrice - lowestPrice) / (numBars - 1);

  // calculate_vp(): a bar adds its volume to every level inside its low / high range
  const volumes: number[] = new Array(numBars).fill(0);
  for (let i = 0; i < lookback && i <= last; i++) {
    const bar = bars[last - i];
    const isBullish = ge(bar.close, bar.open);
    const includeVol = cfg.volumeType === 'Both' ? true : cfg.volumeType === 'Bullish' ? isBullish : !isBullish;
    if (!includeVol) continue;
    for (let j = 0; j < numBars; j++) {
      const priceLevel = lowestPrice + priceInterval * j;
      if (ge(priceLevel, bar.low) && lt(priceLevel, bar.high)) volumes[j] += bar.volume ?? NaN;
    }
  }

  // draw()
  const maxVol = array.max(volumes);
  const maxIdx = array.indexof(volumes, maxVol);
  const scaleVolume = (vol: number) => math.round(vol / (maxVol / lookback / (cfg.barLengthMult / 100)));
  const interval = barInterval(bars);
  // a bar index before the first bar: the same step back in time
  const timeAt = (index: number) => (index < 0 ? bars[0].time + index * interval : barTime(bars, index, interval));
  const lines: LineDrawingData[] = [];
  const add = (x1: number, x2: number, y: number, color: string, width: number) => {
    // a line with an na coordinate is not drawn
    if (isNaN(x1) || isNaN(x2) || isNaN(y)) return;
    lines.push({ time1: timeAt(x1), price1: y, time2: timeAt(x2), price2: y, color, width });
  };

  const x2 = last + cfg.rightOffset;
  // calculate_va(): the value area grows from the PoC towards the side with more volume
  let vaDn = maxIdx;
  let vaUp = maxIdx;
  if (cfg.displayVa && maxIdx >= 0) {
    const vaVol = (array.sum(volumes) * cfg.vaPercent) / 100;
    let vaSum = maxVol;
    while (lt(vaSum, vaVol)) {
      const vUp = vaUp < numBars - 1 ? volumes[vaUp + 1] : 0.0;
      const vDn = vaDn > 0 ? volumes[vaDn - 1] : 0.0;
      if (eq(vUp, 0) && eq(vDn, 0)) break;
      if (ge(vUp, vDn)) {
        vaSum += vUp;
        vaUp += 1;
      } else {
        vaSum += vDn;
        vaDn -= 1;
      }
    }
  }
  for (let i = 0; i < numBars; i++) {
    const lineColor = maxIdx === i ? cfg.pocLineColor : cfg.displayVa && i >= vaDn && i <= vaUp ? cfg.vaBarColor : cfg.barColor;
    add(x2 - scaleVolume(volumes[i]), x2, lowestPrice + priceInterval * i, lineColor, cfg.barThickness);
  }
  if (cfg.displayPoc) {
    add(last - lookback, x2 - scaleVolume(maxVol) - 10, lowestPrice + priceInterval * maxIdx, cfg.pocLineColor, cfg.pocLineThickness);
  }
  if (cfg.displayVa && cfg.displayVaLines) {
    const vaX1 = last - lookback;
    add(vaX1, x2 - scaleVolume(volumes[vaUp]) - 10, lowestPrice + priceInterval * vaUp, cfg.vaBarColor, cfg.vaLinesThickness);
    add(vaX1, x2 - scaleVolume(volumes[vaDn]) - 10, lowestPrice + priceInterval * vaDn, cfg.vaBarColor, cfg.vaLinesThickness);
  }
  return result(lines);
}

export const VolumeProfileKv4coins = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
