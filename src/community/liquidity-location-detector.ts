/**
 * Liquidity Location Detector [BigBeluga]
 *
 * Marks the places where liquidity rests above a 15-bar high and under a 15-bar low. When the bar before was the
 * 15-bar high and the current high is under the 15-bar high, a box is drawn from the high of that bar up by half
 * its range (bearish colour); when the bar before was the 15-bar low and the current low is above the 15-bar low, a
 * box from that low down by half its range (bullish colour). The box colour goes from light to strong with the
 * volume strength of the bar before (0 to 10): the volume measure is (volume + 10) / 2 / 10 (the original averages
 * the volume with the number 10), divided by its 99th percentile of 1000 bars, times 5, capped at 10. Boxes with a
 * strength of 1 or more show it as text. Each box runs 20 bars to the right of the current bar until the price
 * trades through it (high above the top for the upper boxes, low under the bottom for the lower ones): it then stops
 * at that bar and loses its text. When more than "Amount" boxes exist, the oldest is deleted (one per bar). A table
 * on the right shows the colour scale. Optional EMAs (off by default) with circles where they cross.
 *
 * The table and text colours use the chart foreground colour (chart context, `foregroundColorOf`).
 *
 * Reference: "Liquidity Location Detector [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, color, callsite, Series, box, table, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, MarkerData, TableData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface LiquidityLocationDetectorInputs {
  /** Amount: number of liquidity boxes kept */
  boxAmount: number;
  /** Colour of the lower (support) boxes */
  colorHighSup: string;
  /** Colour of the upper (resistance) boxes */
  colorHighRes: string;
  /** Fast EMA on / off */
  ema1: boolean;
  lenEma1: number;
  ema1Col: string;
  /** Slow EMA on / off */
  ema2: boolean;
  lenEma2: number;
  ema2Col: string;
}

export const defaultInputs: LiquidityLocationDetectorInputs = {
  boxAmount: 100,
  colorHighSup: 'rgba(34, 139, 171, 0.7)',
  colorHighRes: 'rgba(236, 64, 121, 0.7)',
  ema1: false,
  lenEma1: 20,
  ema1Col: '#00BCD4',
  ema2: false,
  lenEma2: 35,
  ema2Col: '#d40047',
};

export const inputConfig: InputConfig[] = [
  { id: 'boxAmount', type: 'int', title: 'Amount', defval: 100, step: 10, tooltip: 'Set the displayed amount of liquidity zones' },
  { id: 'colorHighSup', type: 'color', title: '↑', defval: 'rgba(34, 139, 171, 0.7)', inline: 'sup', group: 'Color' },
  { id: 'colorHighRes', type: 'color', title: '↓', defval: 'rgba(236, 64, 121, 0.7)', inline: 'sup', group: 'Color' },
  { id: 'ema1', type: 'bool', title: 'Fast', defval: false, group: 'EMA', inline: '1' },
  { id: 'lenEma1', type: 'int', title: '', defval: 20, group: 'EMA', inline: '1' },
  { id: 'ema1Col', type: 'color', title: '', defval: '#00BCD4', group: 'EMA', inline: '1' },
  { id: 'ema2', type: 'bool', title: 'Slow', defval: false, group: 'EMA', inline: '2' },
  { id: 'lenEma2', type: 'int', title: '', defval: 35, group: 'EMA', inline: '2' },
  { id: 'ema2Col', type: 'color', title: '', defval: '#d40047', group: 'EMA', inline: '2' },
];

/** The EMA plots are hidden while their input is off (display = display.none) */
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Ema Fast', color: '#00BCD4', lineWidth: 2 },
  { id: 'plot1', title: 'Ema Slow', color: '#d40047', lineWidth: 2 },
];

export const metadata = {
  title: 'Liquidity Location Detector [BigBeluga]',
  shortTitle: 'Liquidity Location Detector [BigBeluga]',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 1) */
const MAX_BOXES = 500;

/** Default box text colour of a version 6 script (white), given explicitly */
const BOX_TEXT = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && a - b >= -EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquidityLocationDetectorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; tables: TableData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const colorHighSup = cfg.colorHighSup;
  const colorLowSup = String(color.new(colorHighSup, 80));
  const colorHighRes = cfg.colorHighRes;
  const colorLowRes = String(color.new(colorHighRes, 80));

  // EMAs (ta.ema inside `if ema1`: an input, so on every bar when it is on)
  const close = new Series(bars, (b) => b.close);
  const nanArr = () => new Array<number>(n).fill(NaN);
  const emaF = cfg.ema1 ? ta.ema(close, cfg.lenEma1).toArray().map((v) => v ?? NaN) : nanArr();
  const emaS = cfg.ema2 ? ta.ema(close, cfg.lenEma2).toArray().map((v) => v ?? NaN) : nanArr();

  // vol = math.avg(volume, 10) / 10; norm_vol = vol / percentile_nearest_rank(vol, 1000, 99) * 5, at most 10
  const vol = bars.map((b) => ((b.volume ?? NaN) + 10) / 2 / 10);
  const refVol = ta.percentile_nearest_rank(Series.fromArray(bars, vol), 1000, 99).toArray().map((v) => v ?? NaN);
  const normVol = vol.map((v, i) => {
    const x = (v / refVol[i]) * 5;
    return ge(x, 10) ? 10 : x;
  });
  const h = ta.highest(new Series(bars, (b) => b.high), 15).toArray().map((v) => v ?? NaN);
  const l = ta.lowest(new Series(bars, (b) => b.low), 15).toArray().map((v) => v ?? NaN);

  resetDrawings({ box: MAX_BOXES, label: 1 });
  const boxes1: Box[] = []; // var array<box> boxes1
  const boxes2: Box[] = []; // var array<box> boxes2

  /** method check_liquidity(boxes, up_dn); `for box_id in boxes` with a removal skips the next element */
  const checkLiquidity = (boxes: Box[], up: boolean, i: number) => {
    const b = bars[i];
    for (let k = 0; k < boxes.length; k++) {
      const id = boxes[k];
      box.set_right(id, i + 20);
      box.set_border_color(id, 'transparent');
      if (up ? gt(b.high, box.get_top(id)) : lt(b.low, box.get_bottom(id))) {
        box.set_right(id, i);
        box.set_text(id, '');
        boxes.splice(boxes.indexOf(id), 1);
      }
    }
  };

  const crossUp = callsite.crossover();
  const crossDn = callsite.crossunder();
  const markers: MarkerData[] = [];
  const plot0: { time: number; value: number; color: string }[] = [];
  const plot1: { time: number; value: number; color: string }[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = b.time;

    plot0.push({ time: t, value: emaF[i], color: cfg.ema1Col });
    plot1.push({ time: t, value: emaS[i], color: cfg.ema2Col });
    // plotshape(ta.crossover(ema_f, ema_s) ? ema_f : na, location.absolute, display = ema1 ? display.all : display.none)
    if (crossUp(emaF[i], emaS[i]) && cfg.ema1) {
      markers.push({ time: t, position: 'atPriceMiddle', price: emaF[i], shape: 'circle', color: cfg.ema1Col, size: 'tiny' });
    }
    if (crossDn(emaF[i], emaS[i]) && cfg.ema2) {
      markers.push({ time: t, position: 'atPriceMiddle', price: emaF[i], shape: 'circle', color: cfg.ema2Col, size: 'tiny' });
    }

    // liquidity_display()
    const volume_ = i > 0 ? normVol[i - 1] : NaN;
    const p = i > 0 ? bars[i - 1] : null;
    const size1 = p ? (p.high - p.low) / 2 : NaN;
    const colorUpper = String(color.from_gradient(volume_, 1, 10, colorLowSup, colorHighSup));
    const colorLower = String(color.from_gradient(volume_, 1, 10, colorLowRes, colorHighRes));
    const textCol = String(color.new(fg, 100 - volume_ * 10));
    const txt = str.tostring(volume_, '##');

    if (p && eq(h[i - 1], p.high) && lt(b.high, h[i])) {
      const box1 = box.new(i - 1, p.high + size1, i, p.high, undefined, undefined, undefined, undefined, undefined,
        colorLower, undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, ge(volume_, 7));
      boxes1.push(box1);
      if (ge(volume_, 1)) {
        box.set_text(box1, txt);
        box.set_text_size(box1, ge(volume_, 7) ? 'large' : ge(volume_, 5) ? 'normal' : 'small');
        box.set_text_halign(box1, 'right');
        box.set_text_color(box1, textCol);
      }
    }
    if (p && eq(l[i - 1], p.low) && gt(b.low, l[i])) {
      const box2 = box.new(i - 1, p.low, i, p.low - size1, undefined, undefined, undefined, undefined, undefined,
        colorUpper, undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, ge(volume_, 7));
      boxes2.push(box2);
      if (ge(volume_, 1)) {
        box.set_text(box2, txt);
        box.set_text_size(box2, ge(volume_, 8) ? 'large' : ge(volume_, 5) ? 'normal' : 'small');
        box.set_text_halign(box2, 'right');
        box.set_text_color(box2, textCol);
      }
    }
    checkLiquidity(boxes1, true, i);
    checkLiquidity(boxes2, false, i);

    // scale(): the colour scale table on the last bar
    if (i === n - 1) {
      const dash = table.new('middle_right', 100, 100);
      for (let k = 0; k <= 10; k++) {
        table.cell(dash, 0, 10 - k + 1, str.tostring(k), 3, undefined, fg, undefined, undefined, undefined,
          String(color.from_gradient(k, 0, 10, colorLowSup, colorHighSup)));
        table.cell(dash, 1, 10 - k + 1, str.tostring(k), 3, undefined, fg, undefined, undefined, undefined,
          String(color.from_gradient(k, 0, 10, colorLowRes, colorHighRes)));
      }
      table.merge_cells(dash, 0, 0, 1, 0);
      table.cell(dash, 0, 0, 'Volume\nStrength', undefined, undefined, '#787B86');
    }

    // a_allBoxes = box.all; if size > box_amount: box.delete(a_allBoxes.shift())
    const all = box.all();
    if (all.length > cfg.boxAmount) box.delete(all[0]);
  }
  setDrawingBar(null);

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    boxes: drawn.boxes ?? [],
    tables: drawn.tables ?? [],
  };
}

export const LiquidityLocationDetector = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
