/**
 * Inside Bars (Multiple / Consecutive)
 *
 * The first inside bar (high <= previous high and low >= previous low) starts a zone at the high / low of the bar
 * before it. The zone stays while the following bars stay inside it. With "Expand Inside Bar Range on Wick-Through",
 * a wick through the zone with the body inside moves the zone edge to the wick, and a close outside the zone is a
 * breakout; without it, a high above / low below the zone is a breakout. A breakout ends the zone. The zone edges
 * are drawn with a fill between them, breakouts with triangles, and the bars in a zone get a transparent bar colour.
 *
 * Last bar: with the range expansion option, an open bar uses the rule without expansion (breakout on the high /
 * low). The port reads the state of the last bar from the optional third argument (see src/chart-context.ts); without
 * it every bar is taken as closed.
 *
 * Reference: "Inside Bars (Multiple / Consecutive)" by nilstrades_
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © nilstrades_
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface InsideBarsInputs {
  /** The zone high / low expands to absorb wicks instead of a breakout on a wick */
  expandRange: boolean;
}

export const defaultInputs: InsideBarsInputs = {
  expandRange: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'expandRange', type: 'bool', title: 'Expand Inside Bar Range on Wick-Through', defval: true },
];

const RANGE_COLOR = String(color.new(color.gray, 70));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Range High', color: RANGE_COLOR, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Range Low', color: RANGE_COLOR, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Inside Bars (Multiple / Consecutive)',
  shortTitle: 'Inside Bars Multi',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<InsideBarsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const high: number[] = new Array(n);
  const low: number[] = new Array(n);
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const insideColor = String(color.new(color.yellow, 100));
  let highBefore = NaN; // var float highBeforeInsideBar = na
  let lowBefore = NaN; // var float lowBeforeInsideBar = na
  let consecutive = false; // var bool consecutiveInsideBars = false
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    // isInsideBar = high <= high[1] and low >= low[1]
    const isInsideBar = p !== undefined && le(b.high, p.high) && le(p.low, b.low);
    let reset = false;
    let breakoutUp = false;
    let breakoutDn = false;
    if (isInsideBar && !consecutive) {
      highBefore = p.high;
      lowBefore = p.low;
      consecutive = true;
    }
    if (consecutive) {
      // expandRange and barstate.isconfirmed
      if (cfg.expandRange && barIsConfirmed(i)) {
        if (gt(b.high, highBefore) && le(Math.max(b.open, b.close), highBefore)) highBefore = b.high;
        if (gt(lowBefore, b.low) && le(lowBefore, Math.min(b.open, b.close))) lowBefore = b.low;
        if (gt(b.close, highBefore)) {
          breakoutUp = true;
          reset = true;
        }
        if (gt(lowBefore, b.close)) {
          breakoutDn = true;
          reset = true;
        }
      } else {
        if (gt(b.high, highBefore)) {
          breakoutUp = true;
          reset = true;
        }
        if (gt(lowBefore, b.low)) {
          breakoutDn = true;
          reset = true;
        }
      }
    }
    if (reset) {
      highBefore = NaN;
      lowBefore = NaN;
      consecutive = false;
    }
    high[i] = highBefore;
    low[i] = lowBefore;
    // barcolor(consecutiveInsideBars ? color.new(color.yellow, 100) : na)
    if (consecutive) barColors.push({ time: b.time, color: insideColor });
    // plotshape(breakoutUp, shape.triangleup, location.abovebar, color.green, display = display.pane)
    if (breakoutUp) markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleUp', color: color.green });
    if (breakoutDn) markers.push({ time: b.time, position: 'belowBar', shape: 'triangleDown', color: color.red });
  }

  const t = (i: number) => bars[i].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((_b, i) => ({ time: t(i), value: high[i], color: RANGE_COLOR })),
      plot1: bars.map((_b, i) => ({ time: t(i), value: low[i], color: RANGE_COLOR })),
    },
    // fill(hi, lo, color.new(color.gray, 90))
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors: new Array<string>(n).fill(String(color.new(color.gray, 90))) }],
    markers,
    barColors,
  };
}

export const InsideBars = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
