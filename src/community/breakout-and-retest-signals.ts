/**
 * Breakout and Retest Signals
 *
 * Pivot highs and lows (Period bars on the left, Period / Confirmation Multipler bars on the right) are kept in two
 * lists of the last 'Swing Points Memory' points. On a new pivot high, the swing low of the list nearest in price is
 * taken (and removed from the list): when it is closer than ATR * 'ATR Multiplier' and the low of the pivot bar is
 * below it, a bearish breakout-and-retest zone is drawn from that swing low to the pivot bar: a grey box between the
 * two prices, a bearish (upper half) and a bullish (lower half) box whose widths show the up / down volume ratio of
 * the pivot bar, a dashed mid line and a label with the volume delta of the pivot bar. A new pivot low does the same
 * with the nearest swing high (bullish zone).
 *
 * Limit, lower-timeframe volume: the original reads the up volume, down volume and delta of each bar from the bars
 * of 'Lower Timeframe Value' (default 5 minutes) with `requestUpAndDownVolume()` of the ta library of the platform.
 * The bars passed to a port are the chart bars only, so the port ESTIMATES these values from the chart bars
 * (src/lower-tf-volume.ts): all the volume of a bar is up volume or down volume by the library rule (up when
 * close > open, down when close < open, else by the close against the previous close, else as the previous bar).
 * So with the default inputs the delta texts of the labels and the widths of the two volume boxes are NOT the values
 * of the original (with the estimate one of the two boxes is half the zone wide and the other has no width). Also
 * the original has these values only on the bars where data of the lower timeframe exists (elsewhere its texts are
 * "Delta: NaN" and its two volume boxes have an na end and are not drawn), while the port has the estimate on every
 * bar. The zones themselves (which pivots, grey boxes, box heights, mid lines, label places and colours) do not use
 * these values. The timeframe input is kept: equal to the chart timeframe, the chart bars are the bars of the
 * request and the values are the original ones; below the chart timeframe the estimate is used; above it, the error
 * of the library is thrown.
 *
 * Chart values read: the chart foreground colour (grey box, mid line); without a chart context it is the dark theme
 * colour #DBDBDB. Chart timeframe: `timeframe` of the chart context when given, else read from the bar spacing.
 * The 2 alert conditions of the script have no output.
 *
 * Reference: "Breakout and Retest Signals [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, color, timeframe, Series, box, label, line, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import { upDownVolumeOfChartBars } from '../lower-tf-volume';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface BreakoutAndRetestSignalsInputs {
  /** Period */
  x: number;
  /** Confirmation Multipler */
  confirmation: number;
  /** Swing Points Memory */
  memory: number;
  /** ATR Length */
  atrLength: number;
  /** ATR Multiplier */
  atrMultiplier: number;
  /** Lower Timeframe Value */
  ltf: string;
  /** Bullish Color */
  bullColor: string;
  /** Bearish Color */
  bearColor: string;
}

export const defaultInputs: BreakoutAndRetestSignalsInputs = {
  x: 7,
  confirmation: 2,
  memory: 3,
  atrLength: 40,
  atrMultiplier: 2.0,
  ltf: '5',
  bullColor: '#00ffbb',
  bearColor: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'x', type: 'int', title: 'Period', defval: 7, min: 1, group: 'Pivot Settings',
    tooltip: 'Number of bars to look back for identifying pivot points',
  },
  {
    id: 'confirmation', type: 'int', title: 'Confirmation Multipler', defval: 2, min: 1, max: 10, group: 'Pivot Settings',
    tooltip: 'Divides the main period by this number, and uses the result as a confirmation length before printing signals, increase to get earlier signals',
  },
  {
    id: 'memory', type: 'int', title: 'Swing Points Memory', defval: 3, min: 1, group: 'Pivot Settings',
    tooltip: 'Number of recent swing points to keep in memory for analysis',
  },
  {
    id: 'atrLength', type: 'int', title: 'ATR Length', defval: 40, min: 1, group: 'Pivot Settings',
    tooltip: 'Length of the Average True Range calculation used for tolerance',
  },
  {
    id: 'atrMultiplier', type: 'float', title: 'ATR Multiplier', defval: 2.0, min: 0.1, group: 'Pivot Settings',
    tooltip: 'Multiplier applied to ATR to determine tolerance level',
  },
  {
    id: 'ltf', type: 'timeframe', title: 'Lower Timeframe Value', defval: '5',
    tooltip: 'Determines the lower timeframe used to calculate buying and selling volume',
  },
  {
    id: 'bullColor', type: 'color', title: 'Bullish Color', defval: '#00ffbb', group: 'Appearance Settings',
    tooltip: 'Color used for bullish trends and indicators. This color appears when price action or indicators suggest upward momentum',
  },
  {
    id: 'bearColor', type: 'color', title: 'Bearish Color', defval: '#ff1100', group: 'Appearance Settings',
    tooltip: 'Color used for bearish trends and indicators. This color appears when price action or indicators suggest downward momentum',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Breakout and Retest Signals [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Breakout & Retest',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const gt = (a: number, b: number) => a - b > EPS;

interface PivotPoint {
  idx: number;
  price: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakoutAndRetestSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { memory, atrLength, atrMultiplier, bullColor, bearColor } = cfg;
  const x = Math.trunc(cfg.x);
  const chartFg = foregroundColorOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // [upv, downv, deltav] = ta.requestUpAndDownVolume(ltf_): checkLTF() of the library first
  const chartTf = chartTimeframe(bars, chart);
  if (chartTf !== '' && timeframe.in_seconds(cfg.ltf) > timeframe.in_seconds(chartTf)) {
    throw new Error(`Invalid lower timeframe: '${cfg.ltf}'. The timeframe must be lower than or equal to '${chartTf}'`);
  }
  // The timeframe is the chart timeframe: the chart bars are the requested bars and the values are the original
  // ones. Below it, the same computation on the chart bars is the estimate of the port (see the file header).
  const { up: upv, down: downv, delta: deltav } = upDownVolumeOfChartBars(bars);

  const atrVal = A(ta.atr(bars, atrLength));
  // x_ = int(x / x__)
  const xr = Math.trunc(x / cfg.confirmation);
  const ph = A(ta.pivothigh(new Series(bars, (b) => b.high), x, xr));
  const pl = A(ta.pivotlow(new Series(bars, (b) => b.low), x, xr));

  const swingHighs: PivotPoint[] = [];
  const swingLows: PivotPoint[] = [];

  resetDrawings({ box: 100, line: 50, label: 50 });
  const hidden = String(color.new(color.gray, 100));
  const fgBox = String(color.new(chartFg, 85));
  const bullBox = String(color.new(bullColor, 50));
  const bearBox = String(color.new(bearColor, 50));
  const bullLabel = String(color.new(bullColor, 70));
  const bearLabel = String(color.new(bearColor, 70));

  /** One breakout zone between a swing point and the pivot `p` of bar i - x_ (bearish: pivot high on a swing low) */
  const zone = (i: number, swing: PivotPoint, p: number, bearish: boolean) => {
    const top = Math.max(p, swing.price);
    const bottom = Math.min(p, swing.price);
    const mid = (p + swing.price) / 2;
    box.new(swing.idx, top, i - xr, bottom, hidden, undefined, undefined, undefined, undefined, fgBox);

    const ratio = Math.abs(upv[i - xr] / downv[i - xr]);
    const ratio_ = Math.abs(downv[i - xr] / upv[i - xr]);
    const midpoint = Math.trunc((swing.idx + (i - xr)) / 2);
    const distance = Math.abs(midpoint - swing.idx);

    box.new(swing.idx, top, gt(ratio, 1) ? midpoint : Math.trunc(swing.idx + distance * ratio), mid, hidden,
      undefined, undefined, undefined, undefined, bearish ? bearBox : bullBox);
    box.new(swing.idx, mid, lt(ratio, 1) ? midpoint : Math.trunc(swing.idx + distance * ratio_), bottom, hidden,
      undefined, undefined, undefined, undefined, bearish ? bullBox : bearBox);

    line.new(swing.idx, mid, i - xr, mid, 'bar_index', 'none', chartFg, 'dashed');

    label.new(i - xr, bearish ? top : bottom, (bearish ? '▼' : '▲') + '\nDelta: ' + str.tostring(deltav[i - xr], 'volume'),
      'bar_index', 'price', bearish ? bearLabel : bullLabel, bearish ? 'label_down' : 'label_up', '#FFFFFF', 'tiny');
  };

  /** The nearest swing point of `list` to the pivot price (first one on a tie) */
  const nearest = (list: PivotPoint[], p: number) => {
    let minIndex = 0;
    let minDist = Math.abs(list[0].price - p);
    for (let k = 0; k < list.length; k++) {
      const currentDist = Math.abs(list[k].price - p);
      if (lt(currentDist, minDist)) {
        minDist = currentDist;
        minIndex = k;
      }
    }
    return { minIndex, minDist };
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const tolerance = atrVal[i] * atrMultiplier;

    if (!Number.isNaN(ph[i])) {
      swingHighs.unshift({ idx: i - xr, price: ph[i] });
      if (swingHighs.length > memory) swingHighs.pop();
    }
    if (!Number.isNaN(pl[i])) {
      swingLows.unshift({ idx: i - xr, price: pl[i] });
      if (swingLows.length > memory) swingLows.pop();
    }

    if (!Number.isNaN(ph[i]) && swingLows.length > 0) {
      const { minIndex, minDist } = nearest(swingLows, ph[i]);
      if (lt(minDist, tolerance) && lt(bars[i - xr].low, swingLows[minIndex].price)) {
        zone(i, swingLows[minIndex], ph[i], true);
      }
      swingLows.splice(minIndex, 1);
    }

    if (!Number.isNaN(pl[i]) && swingHighs.length > 0) {
      const { minIndex, minDist } = nearest(swingHighs, pl[i]);
      if (lt(minDist, tolerance) && gt(bars[i - xr].high, swingHighs[minIndex].price)) {
        zone(i, swingHighs[minIndex], pl[i], false);
      }
      swingHighs.splice(minIndex, 1);
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a box with an na end (a volume ratio without a value) is not drawn
    boxes: box.all().filter((b) => !Number.isNaN(b.right)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: String(b.bgcolor), borderColor: String(b.border_color),
    })),
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), style: 'dashed' as const,
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: String(l.color), textColor: String(l.textcolor),
      style: l.style as 'label_down' | 'label_up', size: 'tiny' as const,
    })),
  };
}

export const BreakoutAndRetestSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
