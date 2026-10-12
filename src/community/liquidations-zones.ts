/**
 * Liquidations Zones [ChartPrime]
 *
 * At each pivot high (pivot low) with `Length` bars on each side, four stacked boxes start at the pivot bar: the
 * liquidation zones of 100x, 50x, 25x and 10x leverage, from the pivot price up by 1 %, 2 %, 4 % and 10 % (down by
 * dividing by 1.01, 1.02, 1.04 and 1.1 for a pivot low), each lighter than the one before. On every bar the boxes of
 * the latest zones run `Extend` bars to the right of the current bar; when the high trades above a box (the low under
 * a box of a pivot low) the box stops one bar back, turns gray and dotted, and a label at the middle of the latest
 * box shows the volume of the current and previous bar (negative for the upper zones). Only the four newest boxes of
 * each side stay active; older active boxes are deleted. The latest box of each side has a label at the right with
 * the sell volume (sum of the volume of the down bars) or buy volume (up bars) since the latest pivot, counted on the
 * last 100 bars.
 *
 * "Display HeatMap" draws lighter boxes without text, keeps up to 800 active boxes per side, removes the volume
 * labels and draws the highest high and lowest low of the last 100 bars with lines and the sell / buy volume of
 * those bars.
 *
 * Texts use the chart foreground colour (chart context, `foregroundColorOf`).
 *
 * Reference: "Liquidations Zones [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, str, color, Series, box, label, line, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface LiquidationsZonesInputs {
  /** Pivot length (bars on each side) */
  len: number;
  /** Bars the active zones run to the right of the current bar */
  extend: number;
  x10: boolean;
  x25: boolean;
  x50: boolean;
  x100: boolean;
  displayHeatmap: boolean;
}

export const defaultInputs: LiquidationsZonesInputs = {
  len: 10,
  extend: 40,
  x10: true,
  x25: true,
  x50: true,
  x100: true,
  displayHeatmap: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Length', defval: 10 },
  { id: 'extend', type: 'int', title: 'Extend', defval: 40 },
  { id: 'x10', type: 'bool', title: '10X', defval: true, group: 'Liquidation Zones' },
  { id: 'x25', type: 'bool', title: '25X', defval: true, group: 'Liquidation Zones' },
  { id: 'x50', type: 'bool', title: '50X', defval: true, group: 'Liquidation Zones' },
  { id: 'x100', type: 'bool', title: '100X', defval: true, group: 'Liquidation Zones' },
  { id: 'displayHeatmap', type: 'bool', title: 'Display HeatMap', defval: false },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidations Zones [ChartPrime]',
  shortTitle: 'Liquidations Zones [ChartPrime]',
  overlay: true,
};

/** indicator(max_boxes_count = 500); lines and labels: the default 50 */
const MAX_BOXES = 500;
const MAX_LINES = 50;
const MAX_LABELS = 50;
// Colour constants of Pine version 5
const MAROON = '#880E4F';
const LIME = '#00E676';
const RED = '#FF5252';
const GREEN = '#4CAF50';
const GRAY = '#787B86';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidationsZonesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.len;
  const ext = cfg.extend;
  const heat = cfg.displayHeatmap;
  const fg = foregroundColorOf(chart);
  const lastBarIndex = n - 1;
  const [t1, t2, t3, t4] = heat ? [85, 90, 95, 99] : [80, 85, 90, 95];

  const ph = ta.pivothigh(new Series(bars, (b) => b.high), len, len).toArray().map((v) => v ?? NaN);
  const pl = ta.pivotlow(new Series(bars, (b) => b.low), len, len).toArray().map((v) => v ?? NaN);
  const highest = heat ? ta.highest(new Series(bars, (b) => b.high), 100).toArray().map((v) => v ?? NaN) : [];
  const lowest = heat ? ta.lowest(new Series(bars, (b) => b.low), 100).toArray().map((v) => v ?? NaN) : [];

  resetDrawings({ box: MAX_BOXES, line: MAX_LINES, label: MAX_LABELS });
  const topZones: Box[] = [];
  const botZones: Box[] = [];
  const line1 = varDrawing<Line>();
  const line2 = varDrawing<Line>();
  const label1 = varDrawing<Label>();
  const label2 = varDrawing<Label>();
  let n1 = NaN;
  let n2 = NaN;

  /** method draw_boxes() */
  const drawBoxes = (boxes: Box[], x1: number, top: number, x2: number, bottom: number, c: string, txt: string) => {
    boxes.push(box.new(x1, top, x2, bottom, String(color.new(c, 100)), undefined, undefined, undefined, undefined, c,
      heat ? '' : txt, 'normal', fg, 'left'));
  };

  /** volume_detect(top_bot, index) */
  const volumeDetect = (i: number, topBot: boolean, index: number) => {
    let vol = 0;
    if (lastBarIndex - i < 100) {
      for (let k = 0; k <= index; k++) {
        if (i - k < 0) continue; // close[k] is na: the comparisons are false
        const b = bars[i - k];
        vol += topBot ? (lt(b.close, b.open) ? -(b.volume ?? NaN) : 0) : (gt(b.close, b.open) ? (b.volume ?? NaN) : 0);
      }
    }
    return vol;
  };

  /** del_zones(): one call site per side; `l1[1]` reads the label of the last bar where that block ran (as measured) */
  const delZones = () => {
    let prevL1: Label | undefined;
    return (i: number, zones: Box[], topBot: boolean, volIndex: number) => {
      let ran = false;
      let l1: Label | undefined;
      if (zones.length > 0) {
        const b = bars[i];
        const prevVolume = i > 0 ? (bars[i - 1].volume ?? NaN) : NaN;
        const volume = b.volume ?? NaN;
        let l: Label | undefined;
        const lastBox = zones[0];
        const volu = topBot ? -volume - prevVolume : volume + prevVolume;
        // `for box_id in zones` with a removal inside: the element after the removed one is skipped
        for (let k = 0; k < zones.length; k++) {
          const id = zones[k];
          box.set_right(id, i + ext);
          const top = box.get_top(id);
          const bot = box.get_bottom(id);
          const cross = topBot ? gt(b.high, top) : lt(b.low, bot);
          if (cross) {
            l = label.new(i, (box.get_top(lastBox) + box.get_bottom(lastBox)) / 2, str.tostring(volu, 'volume'),
              'bar_index', 'price', 'transparent', 'label_right', topBot ? RED : GREEN);
            box.set_right(id, i - 1);
            box.set_bgcolor(id, String(color.new(fg, heat ? 100 : 95)));
            box.set_border_style(id, 'dotted');
            box.set_text_color(id, GRAY);
            zones.splice(zones.indexOf(id), 1);
          }
          if (heat && l) label.delete(l);
        }
        const vol = volumeDetect(i, topBot, volIndex);
        if (!heat) {
          ran = true;
          l1 = label.new(i + ext, (box.get_top(lastBox) + box.get_bottom(lastBox)) / 2,
            (topBot ? 'Sell Volume: ' : 'Buy Volume: ') + str.tostring(vol, 'volume'), 'bar_index', 'price',
            'transparent', 'label_right', fg);
          if (prevL1) label.delete(prevL1);
        }
        const limit = 4 * (heat ? 200 : 1);
        for (let k = 0; k < zones.length; k++) {
          if (zones.length > limit) box.delete(zones.shift()!);
        }
      }
      if (ran) prevL1 = l1;
    };
  };
  const delTop = delZones();
  const delBot = delZones();

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    if (!isNaN(ph[i])) {
      const p = bars[i - len];
      n2 = i - len;
      const one = p.high * 1.01;
      const two = p.high * 1.02;
      const four = p.high * 1.04;
      const ten = p.high * 1.1;
      if (cfg.x100) drawBoxes(topZones, i - len, one, lastBarIndex, p.high, String(color.new(MAROON, t1)), '100X');
      if (cfg.x50) drawBoxes(topZones, i - len, two, lastBarIndex, one, String(color.new(MAROON, t2)), '50X');
      if (cfg.x25) drawBoxes(topZones, i - len, four, lastBarIndex, two, String(color.new(MAROON, t3)), '25X');
      if (cfg.x10) drawBoxes(topZones, i - len, ten, lastBarIndex, four, String(color.new(MAROON, t4)), '10X');
    }
    if (!isNaN(pl[i])) {
      const p = bars[i - len];
      n1 = i - len;
      const one = p.low / 1.01;
      const two = p.low / 1.02;
      const four = p.low / 1.04;
      const ten = p.low / 1.1;
      if (cfg.x100) drawBoxes(botZones, i - len, p.low, lastBarIndex, one, String(color.new(LIME, t1)), '100X');
      if (cfg.x50) drawBoxes(botZones, i - len, one, lastBarIndex, two, String(color.new(LIME, t2)), '50X');
      if (cfg.x25) drawBoxes(botZones, i - len, two, lastBarIndex, four, String(color.new(LIME, t3)), '25X');
      if (cfg.x10) drawBoxes(botZones, i - len, four, lastBarIndex, ten, String(color.new(LIME, t4)), '10X');
    }

    const volumeIndex1 = lastBarIndex - n1;
    const volumeIndex2 = lastBarIndex - n2;
    const index = gt(volumeIndex2, volumeIndex1) ? volumeIndex2 : volumeIndex1;

    if (heat) {
      const length = 100;
      const prevLabel1 = label1.value;
      const prevLine1 = line1.value;
      label1.value = label.new(lastBarIndex + ext, highest[i], '', 'bar_index', 'price', String(color.new(MAROON, 20)),
        'label_left', fg);
      line1.value = line.new(lastBarIndex - length, highest[i], lastBarIndex + ext, highest[i], 'bar_index', 'none',
        String(color.new(MAROON, 20)));
      if (prevLine1) line.delete(prevLine1);
      if (prevLabel1) label.delete(prevLabel1);
      const prevLabel2 = label2.value;
      const prevLine2 = line2.value;
      label2.value = label.new(lastBarIndex + ext, lowest[i], '', 'bar_index', 'price', String(color.new(LIME, 40)),
        'label_left', fg);
      line2.value = line.new(lastBarIndex - length, lowest[i], lastBarIndex + ext, lowest[i], 'bar_index', 'none',
        String(color.new(LIME, 20)));
      if (prevLine2) line.delete(prevLine2);
      if (prevLabel2) label.delete(prevLabel2);
      const vol1 = volumeDetect(i, true, length);
      const vol2 = volumeDetect(i, false, length);
      label.set_text(label1.value, str.tostring(vol1, 'volume'));
      label.set_x(label1.value, lastBarIndex + ext);
      label.set_text(label2.value, str.tostring(vol2, 'volume'));
      label.set_x(label2.value, lastBarIndex + ext);
      line.set_x2(line1.value, lastBarIndex + ext);
      line.set_x2(line2.value, lastBarIndex + ext);
    }

    delTop(i, topZones, true, index);
    delBot(i, botZones, false, index);
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: drawn.boxes ?? [],
    labels: drawn.labels ?? [],
    lines: drawn.lines ?? [],
  };
}

export const LiquidationsZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
