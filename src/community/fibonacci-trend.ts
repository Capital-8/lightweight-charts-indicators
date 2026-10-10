/**
 * Fibonacci Trend [ChartPrime]
 *
 * A SuperTrend (factor "Trend", ATR 25) gives the trend. It is plotted with a gradient fill up to the bar midpoint
 * (hl2). From each trend change the script tracks the lowest low and the highest high of the trend (the first range
 * runs from the change bar to 3 ATR(200) beyond it) and draws, on every bar, a Fibonacci retracement of that range:
 * two thick lines for the levels 0 and 1, four levels from the inputs, a dotted 0.5 level, a price label per level,
 * a dashed diagonal between the low and the high, labels on the high and the low, and a filled area between the
 * levels 0.5 / 0.618 and 0.786. Lines and labels run "Extend" bars after the current bar.
 *
 * The lines and labels use the chart foreground and background colours. A port has no chart theme: it uses the
 * colours of the reference run (dark theme: foreground #DBDBDB, background #0F0F0F).
 *
 * Reference: "Fibonacci Trend [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, str, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface FibonacciTrendInputs {
  trendOn: boolean;
  trend: number;
  col1: string;
  col2: string;
  extend: number;
  fillCol: string;
  v236: number;
  v382: number;
  v618: number;
  v786: number;
}

export const defaultInputs: FibonacciTrendInputs = {
  trendOn: true,
  trend: 4,
  col1: '#26905d',
  col2: '#74286d',
  extend: 15,
  fillCol: '#2689901c',
  v236: 0.236,
  v382: 0.382,
  v618: 0.618,
  v786: 0.786,
};

export const inputConfig: InputConfig[] = [
  { id: 'trendOn', type: 'bool', title: '', defval: true, inline: 'trend', group: 'Trend' },
  { id: 'trend', type: 'float', title: 'Trend', defval: 4, step: 0.01, inline: 'trend', group: 'Trend' },
  { id: 'col1', type: 'color', title: '', defval: '#26905d', inline: 'trend', group: 'Trend' },
  { id: 'col2', type: 'color', title: '', defval: '#74286d', inline: 'trend', group: 'Trend' },
  { id: 'extend', type: 'int', title: 'Extend', defval: 15, inline: '1', group: 'Fibonacci' },
  { id: 'fillCol', type: 'color', title: '', defval: '#2689901c', inline: '1', group: 'Fibonacci' },
  { id: 'v236', type: 'float', title: '1', defval: 0.236 },
  { id: 'v382', type: 'float', title: '2', defval: 0.382 },
  { id: 'v618', type: 'float', title: '3', defval: 0.618 },
  { id: 'v786', type: 'float', title: '4', defval: 0.786 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend', color: '#2962ff', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Plot', color: '#2962ff', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Fibonacci Trend [ChartPrime]',
  shortTitle: 'Fibonacci Trend [ChartPrime]',
  overlay: true,
};

/** chart.fg_color and chart.bg_color of the reference run (dark theme) */
const CHART_FG = '#DBDBDB';
const CHART_BG = '#0F0F0F';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string | null;
  style: 'label_down' | 'label_up' | 'label_left';
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FibonacciTrendInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines' | 'linefills'> & { labels: LabelData[]; lines: LineDrawingData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const extend = Math.trunc(cfg.extend);
  const v236 = cfg.v236 * 100;
  const v382 = cfg.v382 * 100;
  const v618 = cfg.v618 * 100;
  const v786 = cfg.v786 * 100;

  const [stS, dirS] = ta.supertrend(bars, cfg.trend, 25);
  const supertrend = stS.toArray();
  const direction = dirS.toArray();
  const atr = ta.atr(bars, 200).toArray();

  // The objects of `fib_d` (null: na). The script deletes every object before it makes the next one, so the counts
  // stay far below the limits (500 lines, 50 labels).
  let fibLow: Ln | null = null; // fib_
  let fib0: Ln | null = null;
  let fibDi: Ln | null = null;
  let levels: Ln[] = []; // fib236, fib382, fib05, fib618, fib786
  let labH: Lb | null = null;
  let labL: Lb | null = null;
  let levelLabels: Lb[] = []; // L0, L_, L236, L382, L618, L786
  let fills: Array<[Ln, Ln]> = [];

  let h = NaN;
  let l = NaN;
  let hi = NaN;
  let li = NaN;
  let val0 = NaN;
  let val1 = NaN;

  const fg50 = String(color.new(CHART_FG, 50));
  const flat = (x1: number, y: number, x2: number, width: number, lineColor = CHART_FG, style: Ln['style'] = 'solid'): Ln =>
    ({ x1, y1: y, x2, y2: y, color: lineColor, width, style });

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number }> = [];
  const topValue: number[] = [];
  const bottomValue: number[] = [];
  const bottomColor: Array<string | null> = [];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const trend = direction[i] ?? NaN;
    const prev = i > 0 ? (direction[i - 1] ?? NaN) : NaN;
    const known = !isNaN(trend) && !isNaN(prev);
    const changed = known && trend !== prev;
    const same = known && trend === prev;
    const a = atr[i] ?? NaN;

    if (changed) {
      // every line and label of the trend before is deleted
      fibLow = fib0 = fibDi = labH = labL = null;
      levels = [];
      levelLabels = [];
      fills = [];
      if (trend === -1) {
        fibLow = flat(i, bar.low, i, 2);
        fib0 = flat(i, bar.high + a * 3, i, 2);
      } else if (trend === 1) {
        fibLow = flat(i, bar.high, i, 2);
        fib0 = flat(i, bar.low - a * 3, i, 2);
        fibDi = { x1: li, y1: l, x2: hi, y2: h, color: CHART_FG, width: 1, style: 'dashed' };
      }
    }

    if (same) {
      if (fibLow && lt(bar.low, fibLow.y1)) fibLow.y1 = fibLow.y2 = bar.low;
      if (fib0 && gt(bar.high, fib0.y1)) fib0.y1 = fib0.y2 = bar.high;

      if (fib0 && eq(bar.high, fib0.y1)) {
        h = bar.high;
        hi = i;
        labH = { x: hi, y: h, text: str.tostring(h, '#,###.####'), color: '#15373b', textColor: null, style: 'label_down' };
      }
      if (fibLow && eq(bar.low, fibLow.y1)) {
        l = bar.low;
        li = i;
        labL = { x: li, y: l, text: str.tostring(l, '#,###.####'), color: '#15373b', textColor: null, style: 'label_up' };
      }

      if (fibLow) fibLow.x2 = i + extend;
      if (fib0) fib0.x2 = i + extend;

      fibDi = { x1: li, y1: l, x2: hi, y2: h, color: CHART_FG, width: 1, style: 'dashed' };
      const start = fib0 ? fib0.x1 : NaN;
      if (fibDi.x1 < start || fibDi.x2 < start) fibDi = null;

      const top = fib0 ? fib0.y1 : NaN;
      const bottom = fibLow ? fibLow.y1 : NaN;
      const sizeStep = (top - bottom) / 100;
      if (trend === -1) {
        val0 = top;
        val1 = bottom;
      }
      if (trend === 1) {
        val0 = bottom;
        val1 = top;
      }

      const x1 = fib0 ? fib0.x1 : NaN;
      const x2 = fib0 ? fib0.x2 : NaN;
      const level = (v: number) => val0 - sizeStep * v * trend * -1;
      const fib236 = flat(x1, level(v236), x2, 1);
      const fib382 = flat(x1, level(v382), x2, 1);
      const fib05 = flat(x1, level(50), x2, 1, fg50, 'dotted');
      const fib618 = flat(x1, level(v618), x2, 1);
      const fib786 = flat(x1, level(v786), x2, 1);
      levels = [fib236, fib382, fib05, fib618, fib786];

      const side = (y: number, text: string): Lb => ({ x: i + extend, y, text, color: CHART_BG, textColor: CHART_FG, style: 'label_left' });
      const priced = (v: number, line: Ln) => side(line.y1, str.tostring(v / 100) + str.tostring(line.y1, ' (#,###.####)'));
      levelLabels = [
        side(val0, '0 ' + str.tostring(val0, '(#,###.####)')),
        side(val1, '1 ' + str.tostring(val1, '(#,###.####)')),
        priced(v236, fib236),
        priced(v382, fib382),
        priced(v618, fib618),
        priced(v786, fib786),
      ];

      // a fill on deleted lines is not drawn: only the two fills of the current lines remain
      fills = [[fib618, fib786], [fib05, fib786]];
    }

    // color = trend_on ? (direction == 1 ? col2 : col1) : na
    const trendColor = cfg.trendOn ? (trend === 1 ? cfg.col2 : cfg.col1) : null;
    const st = supertrend[i] ?? NaN;
    const hl2 = (bar.high + bar.low) / 2;
    plot0.push({ time: bar.time, value: st, color: changed || trendColor === null ? 'transparent' : trendColor });
    plot1.push({ time: bar.time, value: hl2 });
    topValue.push(hl2);
    bottomValue.push(st);
    const faded = changed ? null : color.new(trendColor as string, 90);
    bottomColor.push(faded === null || faded === undefined ? null : String(faded));
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  // a line or a label with an na coordinate is not drawn
  const drawn = (ln: Ln) => !isNaN(ln.x1) && !isNaN(ln.x2) && !isNaN(ln.y1) && !isNaN(ln.y2);
  const toLine = (ln: Ln): LineDrawingData => ({
    time1: T(ln.x1), price1: ln.y1, time2: T(ln.x2), price2: ln.y2, color: ln.color,
    ...(ln.width !== 1 ? { width: ln.width } : {}),
    ...(ln.style !== 'solid' ? { style: ln.style } : {}),
  });
  const allLines = [fibLow, fib0, fibDi, ...levels].filter((ln): ln is Ln => ln !== null && drawn(ln));
  const allLabels = [labH, labL, ...levelLabels].filter((lb): lb is Lb => lb !== null && !isNaN(lb.x) && !isNaN(lb.y));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [
      // fill(p1, p2, hl2, supertrend, na, direction != direction[1] ? na : color.new(color, 90))
      { plot1: 'plot0', plot2: 'plot1', gradient: { topValue, bottomValue, topColor: new Array(n).fill(null), bottomColor } },
    ],
    lines: allLines.map(toLine),
    labels: allLabels.map((lb) => ({
      time: T(lb.x), price: lb.y, text: lb.text, color: lb.color,
      ...(lb.textColor !== null ? { textColor: lb.textColor } : {}),
      ...(lb.style !== 'label_down' ? { style: lb.style } : {}),
    })),
    linefills: fills.filter(([a, b]) => drawn(a) && drawn(b)).map(([a, b]) => ({ line1: toLine(a), line2: toLine(b), color: cfg.fillCol })),
  };
}

export const FibonacciTrend = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
