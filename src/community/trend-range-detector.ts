/**
 * Trend Range Detector (Zeiierman)
 *
 * A weighted average of the last `Minimum Range Length` closes (each close weighted by its absolute change against
 * the close before it, relative to that close) gives the centre. The market is "in range" while every one of those
 * closes is within ATR(2000) * multiplier of the centre. When a range starts, and the previous box ends more than
 * `length` bars before the current bar, a box from `length` bars back to the current bar (centre +- ATR * multiplier)
 * is drawn with a top, a bottom and a dotted middle line. The three lines are extended while the range lasts (the
 * box keeps its first right edge). With "Highlight Box Breaks", the latest box and its lines turn green when the
 * close is above the box top and red when it is below the box bottom (blue otherwise). At most 500 boxes and 500
 * lines are kept.
 *
 * Reference: "Trend Range Detector (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import {
  ta, color, box, line, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Box, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';

export interface TrendRangeDetectorInputs {
  /** Minimum number of bars of a range box */
  length: number;
  /** Multiplier of the ATR for the box half height */
  mult: number;
  /** Colour the latest box by the breaks of its top / bottom */
  highlightBreak: boolean;
}

export const defaultInputs: TrendRangeDetectorInputs = {
  length: 50,
  mult: 2.0,
  highlightBreak: true,
};

const T1 = 'The minimum number of bars required to qualify a range box. A higher value ensures the range is well-established, but may reduce responsiveness.';
const T2 = 'Multiplier that adjusts the vertical size of the range box based on ATR. Larger values create wider boxes and accommodate higher volatility.';
const T3 = 'Enable this to highlight boxes that are actively being broken. Green means a breakout above the box; red indicates a breakdown below.';

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Minimum Range Length', defval: 50, min: 1, step: 1, tooltip: T1 },
  { id: 'mult', type: 'float', title: 'Range Width Multiplier', defval: 2.0, min: 0.1, step: 0.1, tooltip: T2 },
  { id: 'highlightBreak', type: 'bool', title: 'Highlight Box Breaks', defval: true, tooltip: T3 },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Trend Range Detector (Zeiierman)',
  shortTitle: 'Trend Range Detector (Zeiierman)',
  overlay: true,
};

/** Default box text colour of a version 6 script (no text is drawn) */
const BOX_TEXT = '#FFFFFF';

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(bars: Bar[], inputs: Partial<TrendRangeDetectorInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const close = bars.map((b) => b.close);
  const atrArr = ta.atr(bars, 2000).toArray().map((v) => (v ?? NaN) * cfg.mult);

  const blue = color.rgb(33, 87, 243, 90);
  const green = color.rgb(8, 153, 119, 90);
  const red = color.rgb(242, 54, 69, 90);

  resetDrawings({ box: MAX_OBJECTS, line: MAX_OBJECTS });
  const boxMidLine = varDrawing<Line>();
  const boxTopLine = varDrawing<Line>();
  const boxBotLine = varDrawing<Line>();
  const rectBox = varDrawing<Box>();
  let boxColor = blue;
  let prevInRange = false;

  for (let b = 0; b < n; b++) {
    setDrawingBar(b, b === n - 1);
    const atr = atrArr[b];
    // Weighted average of the closes: close[i] * |close[i] - close[i + 1]| / close[i + 1]
    let sumWeightedClose = 0;
    let sumWeights = 0;
    for (let i = 0; i < length; i++) {
      const c0 = b - i >= 0 ? close[b - i] : NaN;
      const c1 = b - i - 1 >= 0 ? close[b - i - 1] : NaN;
      const w = Math.abs(c0 - c1) / c1;
      sumWeightedClose += c0 * w;
      sumWeights += w;
    }
    // sumWeights != 0 ? ... : na (na != 0 is false)
    const ma = !isNaN(sumWeights) && Math.abs(sumWeights) > EPS ? sumWeightedClose / sumWeights : NaN;
    // distances.max(): the largest |close[i] - ma| (na when ma is na)
    let maxDist = NaN;
    for (let i = 0; i < length; i++) {
      const d = Math.abs((b - i >= 0 ? close[b - i] : NaN) - ma);
      if (!isNaN(d) && (isNaN(maxDist) || d > maxDist)) maxDist = d;
    }
    const inRange = le(maxDist, atr);
    const newBox = inRange && !prevInRange;
    const extendBox = inRange && !newBox;
    prevInRange = inRange;

    if (newBox) {
      const rect = rectBox.value;
      // rectBox.get_right() < (b - length) or na(rectBox)
      if (!rect || lt(box.get_right(rect), b - length)) {
        rectBox.value = box.new(b - length, ma + atr, b, ma - atr, color.new(boxColor, 0), undefined, undefined,
          undefined, undefined, color.new(boxColor, 85), undefined, undefined, BOX_TEXT);
        const mid = (ma + atr + (ma - atr)) / 2;
        boxMidLine.value = line.new(b - length, mid, b, mid, 'bar_index', undefined, color.new(boxColor, 50), 'dotted');
        boxTopLine.value = line.new(b - length, ma + atr, b, ma + atr, 'bar_index', undefined, color.new(boxColor, 50));
        boxBotLine.value = line.new(b - length, ma - atr, b, ma - atr, 'bar_index', undefined, color.new(boxColor, 50));
      }
    }

    if (extendBox) {
      for (const l of [boxMidLine.value, boxTopLine.value, boxBotLine.value]) if (l) line.set_x2(l, b);
    }

    if (cfg.highlightBreak) {
      const rect = rectBox.value;
      const breakUp = rect ? gt(close[b], box.get_top(rect)) : false;
      const breakDn = rect ? lt(close[b], box.get_bottom(rect)) : false;
      boxColor = breakUp ? green : breakDn ? red : blue;
      if (rect) {
        box.set_bgcolor(rect, boxColor);
        box.set_border_color(rect, color.new(boxColor, 0));
        for (const l of [boxMidLine.value, boxTopLine.value, boxBotLine.value]) if (l) line.set_color(l, color.new(boxColor, 0));
      }
    }
  }
  setDrawingBar(null);

  const drawings = drawingOutputs(bars, n > 0 && bars[0].time >= 1e12 ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: drawings.boxes ?? [],
    lines: drawings.lines ?? [],
  };
}

export const TrendRangeDetector = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
