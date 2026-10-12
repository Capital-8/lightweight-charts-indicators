/**
 * Swing Breakout Sequence [LuxAlgo]
 *
 * Swing points from legs: a bar whose high is the highest high of the last "Swing Length" bars starts a bullish leg,
 * a low at the lowest low a bearish leg; at each change of leg the extreme of the leg before (its price, bar and
 * time) becomes a swing point. The same is done with "Internal Length" for internal swing points. The last 8 swing
 * points are kept, the last "Swing Length" internal points.
 *
 * A sequence is a swing high A and low B followed by points 1 to 4 that stay inside the A-B range in a given order
 * (with "Point 4 Beyond Point 2", point 4 beyond point 2), and with "Show Point 5" a point 5 near point 4: within
 * "Require Equal H/L" times the 200-bar ATR of point 4, or inside the A-B range when that option is off. Point 5 is
 * the swing point after point 4 or, when the sequence is checked on an internal swing, the first later internal
 * point of the same kind. A new sequence must start after the start of the previous one.
 *
 * Drawings of each sequence: a box over its range (green for a bullish sequence, red for a bearish one), dotted
 * lines from each point to the last point, an optional path through the points, and labels on the points; overlapping
 * sequences move their labels down by one line each. At most 500 lines, labels and boxes and 100 polylines are kept.
 * The two box colour inputs exist in the original but the boxes use its fixed colours (as the original does).
 *
 * Chart values (third argument): the chart foreground colour ("Auto" colour; #DBDBDB without it) and whether the
 * last bar is closed (the logic runs on closed bars only; closed without it).
 *
 * Reference: "Swing Breakout Sequence [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, color, line, box, label, polyline, chartPoint, resetDrawings, setDrawingBar,
  type ChartPoint, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, PolylineData } from '../types';
import { foregroundColorOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SwingBreakoutSequenceInputs {
  pivotLength: number;
  internalLength: number;
  point4Beyond2: boolean;
  detectPoint5: boolean;
  strictMode: boolean;
  strictThreshold: number;
  showPath: boolean;
  showBox: boolean;
  bullishBoxColor: string;
  bearishBoxColor: string;
  showLines: boolean;
  defaultColor: string;
  autoColor: boolean;
}

export const defaultInputs: SwingBreakoutSequenceInputs = {
  pivotLength: 5,
  internalLength: 2,
  point4Beyond2: false,
  detectPoint5: true,
  strictMode: true,
  strictThreshold: 0.5,
  showPath: false,
  showBox: true,
  bullishBoxColor: 'rgba(8, 153, 129, 0.1)',
  bearishBoxColor: 'rgba(242, 54, 69, 0.1)',
  showLines: true,
  defaultColor: '#787B86',
  autoColor: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'pivotLength', type: 'int', title: 'Swing Length', defval: 5, min: 2, group: '',
    tooltip: 'Number of candles to confirm a swing high or swing low. A higher number detects larger swings.',
  },
  {
    id: 'internalLength', type: 'int', title: 'Internal Length', defval: 2, min: 2, group: '',
    tooltip: 'Number of candles to confirm a internal high or internal low. A lower number detects smaller swings. It must be the same size or smaller than the swing length.',
  },
  { id: 'point4Beyond2', type: 'bool', title: 'Point 4 Beyond Point 2', defval: false, group: 'DETECTION', tooltip: 'It only detects sequences where Point 4 is beyond Point 2.' },
  { id: 'detectPoint5', type: 'bool', title: 'Show Point 5', defval: true, group: 'DETECTION', tooltip: 'Enable/disable Point 5 detection.' },
  { id: 'strictMode', type: 'bool', title: 'Require Equal H/L at Point 5', defval: true, group: 'DETECTION', inline: 'strict' },
  {
    id: 'strictThreshold', type: 'float', title: '', defval: 0.5, step: 0.05, group: 'DETECTION', inline: 'strict',
    tooltip: 'Enable/Disable double top/bottom detection at Point 5 within a given threshold. A bigger value detects more sequences.',
  },
  { id: 'showPath', type: 'bool', title: 'Show Sequence Path', defval: false, group: 'STYLE', tooltip: 'Enable/disable a line between sequence points.' },
  { id: 'showBox', type: 'bool', title: 'Show Boxes', defval: true, group: 'STYLE', inline: 'box' },
  { id: 'bullishBoxColor', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.1)', group: 'STYLE', inline: 'box' },
  { id: 'bearishBoxColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.1)', group: 'STYLE', inline: 'box', tooltip: 'Enable/disable colored boxes for each sequence.' },
  { id: 'showLines', type: 'bool', title: 'Show Lines', defval: true, group: 'STYLE', tooltip: 'Enable/disable horizontal lines from each point of the sequence.' },
  { id: 'defaultColor', type: 'color', title: 'Default Color', defval: '#787B86', group: 'STYLE', inline: 'color' },
  { id: 'autoColor', type: 'bool', title: 'Auto', defval: true, group: 'STYLE', inline: 'color', tooltip: 'Define the color or enable/disable auto color.' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Breakout Sequence [LuxAlgo]',
  shortTitle: 'LuxAlgo - Swing Breakout Sequence',
  overlay: true,
};

const BULLISH_LEG = 1;
const BEARISH_LEG = 0;
const HIGH = 1;
const LOW = 0;
const GREEN = '#089981';
const RED = '#F23645';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const le = (a: number, b: number) => b - a >= -EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;

interface SwingPoint {
  barTime: number;
  barIndex: number;
  priceLevel: number;
  swing: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingBreakoutSequenceInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lastConfirmed = lastBarConfirmedOf(chart);
  const defaultColor = cfg.autoColor ? foregroundColorOf(chart) : cfg.defaultColor;
  const ms = n > 0 && bars[0].time >= 1e12;
  const timeMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const swingHighest = A(ta.highest(highS, cfg.pivotLength));
  const swingLowest = A(ta.lowest(lowS, cfg.pivotLength));
  const internalHighest = A(ta.highest(highS, cfg.internalLength));
  const internalLowest = A(ta.lowest(lowS, cfg.internalLength));
  const atr200 = A(ta.atr(bars, 200));
  const bullishBoxColor = String(color.new(GREEN, 90));
  const bearishBoxColor = String(color.new(RED, 90));

  resetDrawings({ line: 500, label: 500, box: 500, polyline: 100 });

  const sequences: ChartPoint[][] = [];
  const swingPoints: SwingPoint[] = [];
  const internalPoints: SwingPoint[] = [];
  let strictThreshold = NaN;

  const inside = (p: SwingPoint, top: SwingPoint, bottom: SwingPoint) =>
    le(p.priceLevel, top.priceLevel) && ge(p.priceLevel, bottom.priceLevel);
  const insideLevel = (p: SwingPoint, top: number, bottom: number) => le(p.priceLevel, top) && ge(p.priceLevel, bottom);
  const toPoint = (p: SwingPoint) => chartPoint.new(p.barTime, p.barIndex, p.priceLevel);

  const doubleTopBottom = (point4: SwingPoint, top: SwingPoint, bottom: SwingPoint): SwingPoint | undefined => {
    for (const each of internalPoints) {
      if (each.barIndex > point4.barIndex && each.swing === point4.swing && (cfg.strictMode
        ? insideLevel(each, point4.priceLevel + strictThreshold, point4.priceLevel - strictThreshold)
        : inside(each, top, bottom))) {
        return each;
      }
    }
    return undefined;
  };

  const plotLastSBS = () => {
    const last = sequences[sequences.length - 1];
    const first = last[0];
    const lastPoint = last[last.length - 1];
    const bullish = gt(first.price, last[1].price);
    let concurrent = 0;
    for (let k = 1; k < sequences.length; k++) {
      const prevSeq = sequences[k - 1];
      if (sequences[k][0].index! < prevSeq[prevSeq.length - 1].index!) concurrent += 1;
      else concurrent = 0;
    }
    // str.tostring(array.new<string>(c, '\n')) without its brackets and separators: c line feeds
    const fix = '\n'.repeat(concurrent);

    if (cfg.showBox) {
      const top = bullish ? first.price : last[1].price;
      const bottom = bullish ? last[1].price : first.price;
      box.new(first.time!, top, lastPoint.time!, bottom, undefined, 0, undefined, undefined, 'bar_time',
        bullish ? bullishBoxColor : bearishBoxColor);
    }
    if (cfg.showPath) {
      polyline.new([...last], false, false, 'bar_time', String(color.new(defaultColor, 50)), undefined, 'solid', 2);
    }
    if (cfg.showLines) {
      const dotted = (x1: number, y: number, x2: number) =>
        line.new(x1, y, x2, y, 'bar_time', undefined, defaultColor, 'dotted');
      dotted(first.time!, first.price, last[2].time!);
      for (let k = 1; k <= 4; k++) dotted(last[k].time!, last[k].price, lastPoint.time!);
      if (cfg.detectPoint5) dotted(last[5].time!, last[5].price, lastPoint.time!);
    }
    const lb = (p: ChartPoint, text: string, up: boolean) =>
      label.new(p.time!, p.price, text, 'bar_time', undefined, 'transparent', up ? 'label_up' : 'label_down', defaultColor);
    lb(first, bullish ? `Swing High${fix}` : `${fix}Swing Low`, !bullish);
    lb(last[1], bullish ? `${fix}Swing Low` : `Swing High${fix}`, bullish);
    lb(last[2], bullish ? `1${fix}` : `${fix}1`, !bullish);
    lb(last[3], bullish ? `${fix}2` : `2${fix}`, bullish);
    lb(last[4], bullish ? `3${fix}` : `${fix}3`, !bullish);
    lb(last[5], bullish ? `${fix}4` : `4${fix}`, bullish);
    if (cfg.detectPoint5) lb(lastPoint, bullish ? `${fix}5` : `5${fix}`, bullish);
  };

  const addSequence = (points: SwingPoint[], aTime: number) => {
    if (sequences.length === 0 || sequences[sequences.length - 1][0].time! < aTime) {
      sequences.push(points.map(toPoint));
      plotLastSBS();
    }
  };

  const gatherInternalSBS = () => {
    const size = swingPoints.length;
    if (size < 6) return;
    const [a, b, p1, p2, p3, p4] = swingPoints.slice(size - 6);
    let doubleTop: SwingPoint | undefined;
    let doubleBottom: SwingPoint | undefined;
    if (cfg.detectPoint5) {
      doubleTop = doubleTopBottom(p4, b, a);
      doubleBottom = doubleTopBottom(p4, a, b);
    }
    const bearish = p1.swing === LOW && inside(p1, a, p3) && inside(p2, b, a)
      && (cfg.point4Beyond2 ? inside(p4, b, p2) : inside(p4, b, a)) && (cfg.detectPoint5 ? doubleTop !== undefined : true);
    const bullish = p1.swing === HIGH && inside(p1, p3, a) && inside(p2, a, b)
      && (cfg.point4Beyond2 ? inside(p4, p2, b) : inside(p4, a, b)) && (cfg.detectPoint5 ? doubleBottom !== undefined : true);
    if (bullish || bearish) {
      const pts = [a, b, p1, p2, p3, p4];
      if (cfg.detectPoint5) pts.push((bullish ? doubleBottom : doubleTop)!);
      addSequence(pts, a.barTime);
    }
  };

  const gatherSwingSBS = () => {
    const size = swingPoints.length;
    if (size < 8) return;
    const [a, b, p1, p2, p3, p4, , p6] = swingPoints.slice(size - 8);
    const near = (top: SwingPoint, bottom: SwingPoint) => (cfg.detectPoint5
      ? (cfg.strictMode ? insideLevel(p6, p4.priceLevel + strictThreshold, p4.priceLevel - strictThreshold) : inside(p6, top, bottom))
      : true);
    const bearish = p1.swing === LOW && inside(p1, a, p3) && inside(p2, b, a)
      && (cfg.point4Beyond2 ? inside(p4, b, p2) : inside(p4, b, a)) && near(b, a);
    const bullish = p1.swing === HIGH && inside(p1, p3, a) && inside(p2, a, b)
      && (cfg.point4Beyond2 ? inside(p4, p2, b) : inside(p4, a, b)) && near(a, b);
    if (bullish || bearish) {
      const pts = [a, b, p1, p2, p3, p4];
      if (cfg.detectPoint5) pts.push(p6);
      addSequence(pts, a.barTime);
    }
  };

  const addPoint = (p: SwingPoint, points: SwingPoint[], size: number) => {
    if (points.length >= size) points.shift();
    points.push(p);
  };

  // leg(length): its own `var leg` per call
  let swingLeg = 0;
  let internalLeg = 0;
  let prevSwingLeg = NaN;
  let prevInternalLeg = NaN;
  // var values of the first bar
  let legIndex = 0;
  let legHigh = n > 0 ? bars[0].high : NaN;
  let legLow = n > 0 ? bars[0].low : NaN;
  let legTime = n > 0 ? timeMs(0) : NaN;
  let internalLegIndex = legIndex;
  let internalLegHigh = legHigh;
  let internalLegLow = legLow;
  let internalLegTime = legTime;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = timeMs(i);
    strictThreshold = cfg.strictThreshold * atr200[i];

    if (eq(b.high, swingHighest[i])) swingLeg = BULLISH_LEG;
    else if (eq(b.low, swingLowest[i])) swingLeg = BEARISH_LEG;
    const swingChange = swingLeg - prevSwingLeg;
    prevSwingLeg = swingLeg;
    const newPivot = !Number.isNaN(swingChange) && swingChange !== 0;
    const pivotLow = swingChange === 1;
    const pivotHigh = swingChange === -1;

    if (eq(b.high, internalHighest[i])) internalLeg = BULLISH_LEG;
    else if (eq(b.low, internalLowest[i])) internalLeg = BEARISH_LEG;
    const internalChange = internalLeg - prevInternalLeg;
    prevInternalLeg = internalLeg;
    const newInternalPivot = !Number.isNaN(internalChange) && internalChange !== 0;
    const internalLow = internalChange === 1;
    const internalHigh = internalChange === -1;

    // barstate.isconfirmed: an open last bar does not run the logic
    if (i < n - 1 || lastConfirmed) {
      if (newInternalPivot) {
        addPoint({
          barTime: internalLegTime, barIndex: internalLegIndex,
          priceLevel: internalLow ? internalLegLow : internalLegHigh, swing: internalLow ? LOW : HIGH,
        }, internalPoints, cfg.pivotLength);
        gatherInternalSBS();
      }
      internalLegHigh = internalLow ? b.high : Math.max(b.high, internalLegHigh);
      internalLegLow = internalHigh ? b.low : Math.min(b.low, internalLegLow);
      if ((internalLeg === BULLISH_LEG && eq(internalLegHigh, b.high)) || (internalLeg === BEARISH_LEG && eq(internalLegLow, b.low))) {
        internalLegIndex = i;
        internalLegTime = t;
      }

      if (newPivot) {
        addPoint({
          barTime: legTime, barIndex: legIndex, priceLevel: pivotLow ? legLow : legHigh, swing: pivotLow ? LOW : HIGH,
        }, swingPoints, 8);
        gatherSwingSBS();
      }
      legHigh = pivotLow ? b.high : Math.max(b.high, legHigh);
      legLow = pivotHigh ? b.low : Math.min(b.low, legLow);
      if ((swingLeg === BULLISH_LEG && eq(legHigh, b.high)) || (swingLeg === BEARISH_LEG && eq(legLow, b.low))) {
        legIndex = i;
        legTime = t;
      }
    }
  }
  setDrawingBar(null);

  // xloc.bar_time: every x is the time of a bar
  const byTime = new Map<number, number>();
  for (let i = 0; i < n; i++) byTime.set(timeMs(i), bars[i].time);
  const T = (x: number) => byTime.get(x) ?? (ms ? x : x / 1000);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), style: 'dotted' as const,
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: 'transparent', textColor: String(l.textcolor),
      style: l.style as 'label_up' | 'label_down',
    })),
    boxes: box.all().map((bx) => ({
      time1: T(bx.left), price1: bx.top, time2: T(bx.right), price2: bx.bottom, bgColor: String(bx.bgcolor), borderWidth: 0,
    })),
    polylines: polyline.all().map((pl) => ({
      points: pl.points.map((p) => ({ time: T(p.time!), price: p.price })),
      lineColor: String(pl.line_color), lineWidth: 2,
    })),
  };
}

export const SwingBreakoutSequence = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
