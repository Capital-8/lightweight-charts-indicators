/**
 * Smart Money Breakout Signals [AlgoAlpha]
 *
 * Swing highs and lows are the pivots of 'Market Structure Time-Horizon' bars on each side. A break of structure is
 * a close (or a wick, by 'BOS Confirmation Type') beyond the last swing high or low, once per swing: a line is drawn
 * from the swing to the break bar with a "BOS" label in its middle ("CHoCH" when the break before was in the other
 * direction and 'Show CHoCH' is on), and a label shape marks the bar.
 * Each break opens a trade idea: `dist` is one third of the range (highest high less lowest low) of the bars since
 * the swing, and three dashed target lines are drawn at the swing price plus (minus for a break down) dist,
 * 2/3 dist and 1/3 dist, with a fill between the first two. The lines grow to the right while the idea runs: until
 * the high (low) passes the far target or the price comes back to the stop (the swing price less dist), or until the
 * next break. The bars are coloured by the direction of the running idea (grey without one).
 * A table on the last bar gives the number of signals and the share of them that reached each target ("TP1" is the
 * nearest target).
 *
 * Chart values read: the chart foreground colour (table frame, borders and texts) and background colour (table
 * background). Without a chart context they are the dark theme colours #DBDBDB and #0F0F0F.
 * Alerts: the alertconditions 'Bullish Signal' / 'Bearish Signal' (`alerts` of the result) on the bars of a break up /
 * down, and the alert() calls (`alertCalls`, once per bar) "Bullish Breakout Detected" / "Bearish Breakout Detected"
 * on the same bars.
 *
 * Reference: "Smart Money Breakout Signals [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import { ta, Series, color, str, callsite, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, LabelData, LineDrawingData, LinefillData, MarkerData, TableCellData, TableData } from '../types';
import type { AlertCall } from '../types';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface SmartMoneyBreakoutSignalsInputs {
  /** Market Structure Time-Horizon: bars on each side of a swing */
  swingSize: number;
  /** BOS Confirmation Type */
  bosConfType: 'Candle Close' | 'Wicks';
  /** Show CHoCH */
  choch: boolean;
  /** Bullish Color */
  bull: string;
  /** Bearish Color */
  bear: string;
}

export const defaultInputs: SmartMoneyBreakoutSignalsInputs = {
  swingSize: 25,
  bosConfType: 'Candle Close',
  choch: true,
  bull: '#00ffbb',
  bear: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'swingSize', type: 'int', title: 'Market Structure Time-Horizon', defval: 25, group: 'Inputs',
    tooltip: 'Defines the number of candles used to determine market structure. Larger values smooth out market structure changes but may delay signals.',
  },
  {
    id: 'bosConfType', type: 'string', title: 'BOS Confirmation Type', defval: 'Candle Close', options: ['Candle Close', 'Wicks'], group: 'Inputs',
    tooltip: 'Specifies whether a candle close or a wick surpassing the previous swing point is used to confirm a Break of Structure (BOS).',
  },
  {
    id: 'choch', type: 'bool', title: 'Show CHoCH', defval: true, group: 'Inputs',
    tooltip: 'Enables or disables the display of Change of Character (CHoCH) labels, highlighting the first structural break against the trend.',
  },
  {
    id: 'bull', type: 'color', title: 'Bullish Color', defval: '#00ffbb', group: 'Visualization',
    tooltip: 'Sets the color used to represent bullish signals and breakout lines.',
  },
  {
    id: 'bear', type: 'color', title: 'Bearish Color', defval: '#ff1100', group: 'Visualization',
    tooltip: 'Sets the color used to represent bearish signals and breakout lines.',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Money Breakout Signals [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - Smart Money Breakout',
  overlay: true,
};

/** Default drawing limits of indicator(): 50 lines, 50 labels */
const MAX_LINES = 50;
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

interface LineObj {
  dead: boolean;
  x1: number;
  x2: number;
  y: number;
  color: string;
  style: 'solid' | 'dashed';
}
interface LabelObj {
  dead: boolean;
  data: LabelData;
}

/**
 * The drawing count limit of Pine: when a creation brings the count of one kind above max + 5, the oldest objects
 * are deleted until max remain.
 */
function register<T extends { dead: boolean }>(list: T[], obj: T, max: number): T {
  list.push(obj);
  if (list.length > max + 5) {
    for (const old of list.splice(0, list.length - max)) old.dead = true;
  }
  return obj;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyBreakoutSignalsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & {
    markers: MarkerData[];
    barColors: BarColorData[];
    lines: LineDrawingData[];
    labels: LabelData[];
    linefills: LinefillData[];
    tables: TableData[];
    alertCalls: AlertCall[];
  } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { swingSize, bull, bear } = cfg;
  const closeConfirms = cfg.bosConfType === 'Candle Close';
  // chart.fg_color, chart.bg_color
  const chartFg = foregroundColorOf(chart);
  const chartBg = backgroundColorOf(chart);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const alertCalls: AlertCall[] = [];
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];

  const pivHi = A(ta.pivothigh(S(bars.map((b) => b.high)), swingSize, swingSize));
  const pivLo = A(ta.pivotlow(S(bars.map((b) => b.low)), swingSize, swingSize));
  // ta.highest(x) - ta.lowest(x) with x = the bars since the broken swing (1 on the other bars): series length
  const highestSite = callsite.highest();
  const lowestSite = callsite.lowest();

  const grey = String(color.new('#787B86', 40));
  const bull40 = String(color.new(bull, 40));
  const bear40 = String(color.new(bear, 40));
  const targetColors = (base: string) => [70, 50, 30].map((t) => String(color.new(base, t)));
  const labelBg = String(color.rgb(0, 0, 0, 100));

  const allLines: LineObj[] = [];
  const allLabels: LabelObj[] = [];
  const fills: Array<{ line1: LineObj; line2: LineObj; color: string }> = [];
  // var TPs, TPs1, TPs2: the target lines of the ideas (newest first)
  const targets: LineObj[][] = [[], [], []];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];

  let prevHigh = NaN;
  let prevLow = NaN;
  let prevHighIndex = NaN;
  let prevLowIndex = NaN;
  let highActive = false;
  let lowActive = false;
  let prevBreakoutDir = 0;
  let active = 0;
  let active1 = 0;
  let active2 = 0;
  let tp = 0;
  let tp1 = 0;
  let tp2 = 0;
  let sl = 0;
  let total = 0;
  let tp1s = 0;
  let tp2s = 0;
  let tp3s = 0;
  let triggerBefore = NaN;
  let activeBefore = NaN;

  const newLine = (x1: number, x2: number, y: number, lineColor: string, style: 'solid' | 'dashed') =>
    register<LineObj>(allLines, { dead: false, x1, x2, y, color: lineColor, style }, MAX_LINES);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    if (!Number.isNaN(pivHi[i])) {
      prevHigh = pivHi[i];
      highActive = true;
      prevHighIndex = i - swingSize;
    }
    if (!Number.isNaN(pivLo[i])) {
      prevLow = pivLo[i];
      lowActive = true;
      prevLowIndex = i - swingSize;
    }
    let highBroken = false;
    let lowBroken = false;
    if (gt(closeConfirms ? bar.close : bar.high, prevHigh) && highActive) {
      highBroken = true;
      highActive = false;
    }
    if (gt(prevLow, closeConfirms ? bar.close : bar.low) && lowActive) {
      lowBroken = true;
      lowActive = false;
    }

    // alertcondition(highBroken, "Bullish Signal") / alertcondition(lowBroken, "Bearish Signal")
    bullFlags.push(highBroken);
    bearFlags.push(lowBroken);
    // if highBroken: alert("Bullish Breakout Detected", alert.freq_once_per_bar); if lowBroken: alert("Bearish ...")
    if (highBroken) alertCalls.push({ time: bar.time as number, message: 'Bullish Breakout Detected', freq: 'once_per_bar' });
    if (lowBroken) alertCalls.push({ time: bar.time as number, message: 'Bearish Breakout Detected', freq: 'once_per_bar' });

    let length = 0;
    if (highBroken) {
      newLine(prevHighIndex, i, prevHigh, bull, 'solid');
      register<LabelObj>(allLabels, {
        dead: false,
        data: {
          time: barTime(bars, Math.floor(i - (i - prevHighIndex) / 2)), price: prevHigh,
          text: prevBreakoutDir === -1 && cfg.choch ? 'CHoCH' : 'BOS', color: labelBg, textColor: bull, size: 'tiny',
          forceOverlay: true,
        },
      }, MAX_LABELS);
      prevBreakoutDir = 1;
      length = i - prevHighIndex;
    }
    if (lowBroken) {
      newLine(prevLowIndex, i, prevLow, bear, 'solid');
      register<LabelObj>(allLabels, {
        dead: false,
        data: {
          time: barTime(bars, Math.floor(i - (i - prevLowIndex) / 2)), price: prevLow,
          text: prevBreakoutDir === 1 && cfg.choch ? 'CHoCH' : 'BOS', color: labelBg, textColor: bear, style: 'label_up',
          size: 'tiny', forceOverlay: true,
        },
      }, MAX_LABELS);
      prevBreakoutDir = -1;
      length = i - prevLowIndex;
    }

    const x = Math.max(1, length);
    const dist = (highestSite(bar.high, x) - lowestSite(bar.low, x)) / 3;
    let trigger = 0;

    const open = (direction: number, level: number, from: number, base: string) => {
      active = direction;
      active1 = direction;
      active2 = direction;
      trigger = 1;
      total += 1;
      tp = level + direction * dist;
      tp1 = level + (direction * dist * 2) / 3;
      tp2 = level + (direction * dist * 1) / 3;
      sl = level - direction * dist;
      const colors = targetColors(base);
      [tp, tp1, tp2].forEach((y, k) => targets[k].unshift(newLine(from, i, y, colors[k], 'dashed')));
      fills.push({ line1: targets[0][0], line2: targets[1][0], color: String(color.new(base, 90)) });
    };
    if (highBroken) open(1, prevHigh, prevHighIndex, bull);
    if (lowBroken) open(-1, prevLow, prevLowIndex, bear);

    if (active === 1 && gt(bar.high, tp)) tp1s += 1;
    if (active1 === 1 && gt(bar.high, tp1)) {
      tp2s += 1;
      active1 = 0;
    }
    if (active2 === 1 && gt(bar.high, tp2)) {
      tp3s += 1;
      active2 = 0;
    }
    if (active === -1 && gt(tp, bar.low)) tp1s += 1;
    if (active1 === -1 && gt(tp1, bar.low)) {
      tp2s += 1;
      active1 = 0;
    }
    if (active2 === -1 && gt(tp2, bar.low)) {
      tp3s += 1;
      active2 = 0;
    }

    const ends = (active === 1 && (gt(bar.high, tp) || gt(sl, bar.low))) || (active === -1 && (gt(tp, bar.low) || gt(bar.high, sl)));
    // not (trigger != 0 and trigger[1] == 0): the bar of a signal that follows a bar without one does not end the idea
    if (ends && !(trigger !== 0 && triggerBefore === 0)) active = 0;

    // array.remove takes the line out of the array without deleting it: it stays where it stopped
    const drop = active === 0 || (active !== 0 && !Number.isNaN(activeBefore) && activeBefore !== 0 && trigger === 1);
    for (const list of targets) {
      if (list.length === 0) continue;
      if (drop) list.splice(Math.min(1, list.length - 1), 1);
      else if (!list[0].dead) list[0].x2 = i;
    }

    barColors.push({ time: bar.time, color: active === 0 ? grey : active === 1 ? bull40 : bear40 });
    if (highBroken) markers.push({ time: bar.time, position: 'belowBar', shape: 'labelUp', color: bull, size: 'small' });
    if (lowBroken) markers.push({ time: bar.time, position: 'aboveBar', shape: 'labelDown', color: bear, size: 'small' });

    triggerBefore = trigger;
    activeBefore = active;
  }

  // if barstate.islast: the statistics table
  const tables: TableData[] = [];
  if (n > 0) {
    const rate = (hits: number) => (total > 0 ? str.format('{0,number,#.##}%', (hits / total) * 100.0) : 'No Trades');
    const head = (column: number, row: number, text: string): TableCellData =>
      ({ column, row, text, textSize: 'tiny', textColor: chartFg, textHAlign: 'center' });
    const name = (row: number, text: string): TableCellData => ({ column: 0, row, text, textSize: 'tiny', textColor: chartFg });
    tables.push({
      position: 'top_right', columns: 2, rows: 5, bgColor: chartBg, borderWidth: 1, borderColor: chartFg, frameColor: chartFg,
      frameWidth: 1,
      cells: [
        head(0, 0, 'Smart Money Breakout Stats'), head(1, 0, 'Value'),
        name(1, 'Total Signals'), head(1, 1, str.tostring(total)),
        name(2, 'TP1 Win Rate'), head(1, 2, rate(tp3s)),
        name(3, 'TP2 Win Rate'), head(1, 3, rate(tp2s)),
        name(4, 'TP3 Win Rate'), head(1, 4, rate(tp1s)),
      ],
    });
  }

  const lineData = (ln: LineObj): LineDrawingData => ({
    time1: barTime(bars, ln.x1), price1: ln.y, time2: barTime(bars, ln.x2), price2: ln.y, color: ln.color, width: 1,
    style: ln.style, forceOverlay: true,
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    lines: allLines.map(lineData),
    labels: allLabels.map((l) => l.data),
    // a fill between two lines that the count limit deleted is not drawn
    linefills: fills.filter((f) => !f.line1.dead && !f.line2.dead).map((f) => ({ line1: lineData(f.line1), line2: lineData(f.line2), color: f.color })),
    tables,
    alertCalls,
    alerts: alertStates(alertConditions, bars, [bullFlags, bearFlags]),
  };
}

/** The original's alertconditions (no message given: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Signal', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Bearish Signal', message: 'Alert Fired!' },
];

export const SmartMoneyBreakoutSignals = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions, hasAlertFunction,
};
