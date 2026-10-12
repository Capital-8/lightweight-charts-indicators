/**
 * Liquidity Swings [LuxAlgo]
 *
 * Marks the swing highs and swing lows (pivots with the same number of bars on each side) and measures the
 * activity around them. Each pivot gives an area: from the high to the top of the candle body for a swing high, from
 * the bottom of the body to the low for a swing low ("Wick Extremity"), or the full range of the pivot bar. After the
 * pivot, every bar whose range overlaps the area adds one to a count and its volume to a total. The count and the
 * volume are those of the bar "Pivot Lookback" bars back, as the pivot is known only that many bars later.
 *
 * Drawings per swing: a level line from the pivot bar (it runs 3 bars after the current bar until a close crosses the
 * level, then it stops there and becomes dashed), a box over the bars counted so far, a label with the total volume,
 * and one lighter box per side for the area of the latest pivot. Line, box and label only show when the count (or the
 * volume) is above the filter value. At most 500 lines, 500 boxes and 500 labels are kept.
 *
 * The "Intrabar Precision" option reads the bars of a lower timeframe, which the chart bars do not have: the port
 * throws an Error when it is switched on.
 *
 * Reference: "Liquidity Swings [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, color, callsite, Series, line, box, label, resetDrawings, setDrawingBar, varDrawing,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface LiquiditySwingsInputs {
  /** Bars on each side of a pivot */
  length: number;
  area: 'Wick Extremity' | 'Full Range';
  /** Count the volume on lower-timeframe bars (not available: throws when true) */
  intraPrecision: boolean;
  intrabarTf: string;
  filterOptions: 'Count' | 'Volume';
  filterValue: number;
  showTop: boolean;
  topCss: string;
  topAreaCss: string;
  showBtm: boolean;
  btmCss: string;
  btmAreaCss: string;
  labelSize: 'Tiny' | 'Small' | 'Normal';
}

export const defaultInputs: LiquiditySwingsInputs = {
  length: 14,
  area: 'Wick Extremity',
  intraPrecision: false,
  intrabarTf: '1',
  filterOptions: 'Count',
  filterValue: 0,
  showTop: true,
  topCss: '#FF5252',
  topAreaCss: 'rgba(255, 82, 82, 0.5)',
  showBtm: true,
  btmCss: '#00897B',
  btmAreaCss: 'rgba(0, 137, 123, 0.5)',
  labelSize: 'Tiny',
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Pivot Lookback', defval: 14 },
  { id: 'area', type: 'string', title: 'Swing Area', defval: 'Wick Extremity', options: ['Wick Extremity', 'Full Range'] },
  { id: 'intraPrecision', type: 'bool', title: 'Intrabar Precision', defval: false, inline: 'intrabar' },
  { id: 'intrabarTf', type: 'timeframe', title: '', defval: '1', inline: 'intrabar' },
  { id: 'filterOptions', type: 'string', title: 'Filter Areas By', defval: 'Count', options: ['Count', 'Volume'], inline: 'filter' },
  { id: 'filterValue', type: 'float', title: '', defval: 0, inline: 'filter' },
  { id: 'showTop', type: 'bool', title: 'Swing High', defval: true, inline: 'top', group: 'Style' },
  { id: 'topCss', type: 'color', title: '', defval: '#FF5252', inline: 'top', group: 'Style' },
  { id: 'topAreaCss', type: 'color', title: 'Area', defval: 'rgba(255, 82, 82, 0.5)', inline: 'top', group: 'Style' },
  { id: 'showBtm', type: 'bool', title: 'Swing Low', defval: true, inline: 'btm', group: 'Style' },
  { id: 'btmCss', type: 'color', title: '', defval: '#00897B', inline: 'btm', group: 'Style' },
  { id: 'btmAreaCss', type: 'color', title: 'Area', defval: 'rgba(0, 137, 123, 0.5)', inline: 'btm', group: 'Style' },
  { id: 'labelSize', type: 'string', title: 'Labels Size', defval: 'Tiny', options: ['Tiny', 'Small', 'Normal'], group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Liquidity Swings [LuxAlgo]',
  shortTitle: 'Liquidity Swings [LuxAlgo]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LiquiditySwingsInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  if (cfg.intraPrecision) {
    throw new Error('Liquidity Swings: "Intrabar Precision" needs the bars of a lower timeframe, which the chart bars do not have');
  }
  const n = bars.length;
  const length = Math.trunc(cfg.length);
  const filterValue = cfg.filterValue;
  const byVolume = cfg.filterOptions === 'Volume';
  const fullRange = cfg.area === 'Full Range';
  const labelSize = cfg.labelSize === 'Small' ? 'small' : cfg.labelSize === 'Normal' ? 'normal' : 'tiny';

  const phArr = ta.pivothigh(new Series(bars, (b) => b.high), length, length).toArray();
  const plArr = ta.pivotlow(new Series(bars, (b) => b.low), length, length).toArray();

  // Drawings of the library registry, with the limits of indicator(): the `var` variables of the script (the area
  // box of each side, and the zone box, level line and label of each side) hold their objects.
  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  /** One side (swing highs or swing lows) */
  const side = (isTop: boolean) => {
    const show = isTop ? cfg.showTop : cfg.showBtm;
    const css = isTop ? cfg.topCss : cfg.btmCss;
    const areaCss = isTop ? cfg.topAreaCss : cfg.btmAreaCss;
    const pivots = isTop ? phArr : plArr;
    let top = NaN;
    let btm = NaN;
    let crossed: boolean | null = null; // var bool = na
    let x1 = 0;
    // var box = box.new(na, na, na, na, bgcolor = color.new(areaCss, 80), border_color = na): made on the first bar
    const areaBox = varDrawing<Box>();
    // get_counts()
    let count = 0;
    let vol = 0;
    // set_zone(), set_level(), set_label(): `var box bx`, `var line lvl`, `var label lbl`
    const zone = varDrawing<Box>();
    const lvl = varDrawing<Line>();
    const lbl = varDrawing<Label>();
    const zoneCross = callsite.crossover();
    const labelCross = callsite.crossover();
    let prevTarget = NaN;
    let prevCrossed: boolean | null = null;

    return (i: number) => {
      if (i === 0) {
        areaBox.value = box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, undefined, undefined,
          String(color.new(areaCss, 80)));
      }
      const area = areaBox.value!;
      const p = pivots[i] ?? NaN;
      const isPivot = !isNaN(p) && p !== 0;
      const b = bars[i];
      const back = i >= length ? bars[i - length] : null;

      // get_counts(pivot, top, btm): the area of the bar before
      if (isPivot) {
        count = 0;
        vol = 0;
      } else {
        const inside = back !== null && lt(back.low, top) && gt(back.high, btm);
        vol += inside ? (back!.volume ?? NaN) : 0;
        count += inside ? 1 : 0;
      }

      if (isPivot && show) {
        if (isTop) {
          top = back!.high;
          btm = fullRange ? back!.low : Math.max(back!.close, back!.open);
        } else {
          top = fullRange ? back!.high : Math.min(back!.close, back!.open);
          btm = back!.low;
        }
        x1 = i - length;
        crossed = false;
        box.set_lefttop(area, x1, top);
        box.set_rightbottom(area, x1, btm);
      } else {
        if (isTop ? gt(b.close, top) : lt(b.close, btm)) crossed = true;
        box.set_right(area, crossed ? x1 : i + 3);
      }

      if (!show) return;
      const target = byVolume ? vol : count;
      const above = gt(target, filterValue);

      // set_zone()
      if (zoneCross(target, filterValue)) {
        zone.value = box.new(x1, top, x1 + count, btm, 'transparent', undefined, undefined, undefined, undefined, areaCss);
      }
      if (above && zone.value) box.set_right(zone.value, x1 + count);

      // set_level()
      const value = isTop ? top : btm;
      if (isPivot) {
        if (lt(prevTarget, filterValue)) {
          if (lvl.value) line.delete(lvl.value);
        } else if (!prevCrossed && lvl.value) {
          line.set_x2(lvl.value, i - length);
        }
        lvl.value = line.new(i - length, value, i, value, 'bar_index', undefined, 'transparent');
      }
      const level = lvl.value;
      if (level) {
        if (!prevCrossed) line.set_x2(level, i + 3);
        if (crossed && !prevCrossed) {
          line.set_x2(level, i);
          line.set_style(level, 'dashed');
        }
        if (above) line.set_color(level, css);
      }
      prevTarget = target;
      prevCrossed = crossed;

      // set_label()
      if (labelCross(target, filterValue)) {
        lbl.value = label.new(x1, value, str.tostring(vol, 'volume'), 'bar_index', 'price', '#00000000',
          isTop ? 'label_down' : 'label_up', css, labelSize);
      }
      if (above && lbl.value) label.set_text(lbl.value, str.tostring(vol, 'volume'));
    };
  };

  const high = side(true);
  const low = side(false);
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    high(i);
    low(i);
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a line or a box with an na coordinate is not drawn
    lines: line.all().filter((l) => !isNaN(l.y1)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color ?? 'transparent'),
      ...(l.style === 'dashed' ? { style: 'dashed' as const } : {}),
    })),
    boxes: box.all().filter((b) => !isNaN(b.left) && !isNaN(b.top) && !isNaN(b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: String(b.bgcolor), borderColor: 'transparent',
    })),
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: '#00000000', textColor: String(l.textcolor),
      style: l.style as 'label_down' | 'label_up', size: labelSize,
    })),
  };
}

export const LiquiditySwings = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
