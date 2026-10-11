/**
 * Volume Order Blocks [BigBeluga]
 *
 * Two exponential averages of the close (lengths "Sensitivity Detection" and that value + 13) give the trend. When
 * the fast average crosses above the slow one, the bar of the lowest low of the last (length + 13) bars gives a
 * bullish order block: from that low up to the bottom of the body of that bar (at least one time the highest
 * 200-bar ATR of the last 200 bars above the low). When the fast average crosses below, the bar of the highest high
 * gives a bearish block in the same way. Each block keeps the volume traded from its bar to the bar of the crossing.
 *
 * A bullish block is dropped when a close goes below its lower edge, a bearish block when a close goes above its
 * upper edge, and a block is dropped when the middle of the block after it in the list is closer than three times
 * that ATR value (the first block of the list is compared with the last one). At most 15 blocks are kept per side.
 *
 * Drawings on the last bar, per block: the two edges (width 2), the dashed mid line, the area between the edges
 * and a label with the share of the block in the volume of its side and its volume. The area between the two
 * averages (which are not displayed themselves) is shaded with the strength of the trend.
 *
 * Chart context: `chart.foregroundColor` is the colour of the label texts (without it the dark theme value);
 * `chart.lastBarConfirmed`: a crossing on a last bar that is still open gives no block.
 *
 * Reference: "Volume Order Blocks [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, str, color, array, callsite, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface VolumeOrderBlocksInputs {
  /** Length of the fast average; the slow one is 13 longer */
  length1: number;
  midLine: boolean;
  trendShadow: boolean;
  /** Colour of the bullish blocks and of the up-trend shade */
  col1: string;
  /** Colour of the bearish blocks and of the down-trend shade */
  col2: string;
}

export const defaultInputs: VolumeOrderBlocksInputs = {
  length1: 5,
  midLine: true,
  trendShadow: true,
  col1: '#26ba9f',
  col2: '#6626ba',
};

export const inputConfig: InputConfig[] = [
  { id: 'length1', type: 'int', title: 'Sensitivity Detection: ', defval: 5 },
  { id: 'midLine', type: 'bool', title: 'Mid Line', defval: true },
  { id: 'trendShadow', type: 'bool', title: 'Trend Shadow', defval: true },
  { id: 'col1', type: 'color', title: '', defval: '#26ba9f', inline: 'col' },
  { id: 'col2', type: 'color', title: '', defval: '#6626ba', inline: 'col' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMA', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Slow EMA', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Volume Order Blocks [BigBeluga]',
  shortTitle: 'Volume Order Blocks [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** type level */
interface Level {
  indx: number;
  upper: number;
  lower: number;
  mid: number;
  vol: number;
}
const naLevel = (): Level => ({ indx: NaN, upper: NaN, lower: NaN, mid: NaN, vol: NaN });

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeOrderBlocksInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'linefills'> & { lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length1 = Math.trunc(cfg.length1);
  const length2 = length1 + 13;
  const lastConfirmed = lastBarConfirmedOf(chart);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const closeS = new Series(bars, (b) => b.close);
  const ema1S = ta.ema(closeS, length1);
  const ema2S = ta.ema(closeS, length2);
  const ema1 = A(ema1S);
  const ema2 = A(ema2S);
  const crossOver = ta.crossover(ema1S, ema2S).toArray();
  const crossUnder = ta.crossunder(ema1S, ema2S).toArray();
  const lowest = A(ta.lowest(new Series(bars, (b) => b.low), length2));
  const highest = A(ta.highest(new Series(bars, (b) => b.high), length2));

  // color_trend: ta.highest / ta.lowest run only in the branch that is taken and keep the values of their own calls
  const highestDiff = callsite.highest();
  const lowestDiff = callsite.lowest();
  const fillColors: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const diff = ema2[i] - ema1[i];
    if (!cfg.trendShadow) fillColors[i] = 'transparent';
    else if (gt(diff, 0)) fillColors[i] = String(color.from_gradient(diff, 0, highestDiff(diff, 100), null as unknown as string, cfg.col2));
    else fillColors[i] = String(color.from_gradient(diff, lowestDiff(diff, 100), 0, cfg.col1, null as unknown as string));
  }

  const atrHighest = A(ta.highest(ta.atr(bars, 200), 200));

  const lowerLvl: Level[] = [];
  const upperLvl: Level[] = [];
  let volUp = 0; // `var vol` of each `if` block
  let volDn = 0;
  // array.get / array.set with a negative index count from the end
  const at = (list: Level[], i: number) => list[i < 0 ? list.length + i : i];
  const put = (list: Level[], i: number, l: Level) => {
    list[i < 0 ? list.length + i : i] = l;
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const confirmed = i < n - 1 || lastConfirmed;
    const atr = atrHighest[i] * 3;
    const atr1 = atrHighest[i] * 2;

    if (crossOver[i] && confirmed) {
      volUp = 0;
      for (let k = 1; k <= length2; k++) {
        if (k > i || !eq(bars[i - k].low, lowest[i])) continue;
        for (let j = 0; j <= k; j++) volUp += bars[i - j].volume ?? NaN;
        let src = Math.min(bars[i - k].open, bars[i - k].close);
        if (lt(src - lowest[i], atr1 * 0.5)) src = lowest[i] + atr1 * 0.5;
        lowerLvl.push({ indx: i - k, upper: src, lower: lowest[i], mid: (src + lowest[i]) / 2, vol: volUp });
      }
    }
    if (crossUnder[i] && confirmed) {
      volDn = 0;
      for (let k = 1; k <= length2; k++) {
        if (k > i || !eq(bars[i - k].high, highest[i])) continue;
        for (let j = 0; j <= k; j++) volDn += bars[i - j].volume ?? NaN;
        let src = Math.max(bars[i - k].open, bars[i - k].close);
        if (lt(highest[i] - src, atr1 * 0.5)) src = highest[i] - atr1 * 0.5;
        upperLvl.push({ indx: i - k, upper: highest[i], lower: src, mid: (src + highest[i]) / 2, vol: volDn });
      }
    }

    // Remove the crossed and the overlapped blocks (a removed block stays in the list as an empty one)
    for (const [list, bullish] of [[lowerLvl, true], [upperLvl, false]] as const) {
      if (list.length === 0) continue;
      for (let k = 0; k < list.length; k++) {
        const l = at(list, k);
        const l1 = at(list, k - 1);
        if (lt(Math.abs(l.mid - l1.mid), atr)) put(list, k - 1, naLevel());
        if (bullish ? lt(b.close, l.lower) : gt(b.close, l.upper)) put(list, k, naLevel());
      }
      if (list.length > 15) list.shift();
    }
  }

  // Drawings of the last bar
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const linefills: LinefillData[] = [];
  if (n > 0) {
    const last = bars[n - 1].time;
    const textColor = foregroundColorOf(chart);
    for (const [list, css] of [[lowerLvl, cfg.col1], [upperLvl, cfg.col2]] as const) {
      if (list.length === 0) continue;
      const total = array.sum(list.map((l) => l.vol));
      for (const l of list) {
        // an object with an na coordinate (an empty block) is not drawn
        if (isNaN(l.indx) || isNaN(l.upper) || isNaN(l.lower) || isNaN(l.mid)) continue;
        const time1 = bars[l.indx].time;
        const upper: LineDrawingData = { time1, price1: l.upper, time2: last, price2: l.upper, color: css, width: 2 };
        const lower: LineDrawingData = { time1, price1: l.lower, time2: last, price2: l.lower, color: css, width: 2 };
        lines.push(upper, lower, {
          time1, price1: l.mid, time2: last, price2: l.mid, color: cfg.midLine ? css : 'transparent', style: 'dashed',
        });
        labels.push({
          time: last,
          price: l.mid,
          text: `⮜ ${str.tostring((l.vol / total) * 100, 'percent')} (${str.tostring(l.vol, 'volume')})`,
          style: 'label_left',
          color: 'transparent',
          textColor,
        });
        linefills.push({ line1: upper, line2: lower, color: String(color.new(css, 90)) });
      }
    }
  }

  const point = (values: number[]) => bars.map((b, i) => ({ time: b.time, value: values[i] }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: point(ema1), plot1: point(ema2) },
    fills: [{ plot1: 'plot0', plot2: 'plot1', colors: fillColors }],
    lines,
    labels,
    linefills,
  };
}

export const VolumeOrderBlocks = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
