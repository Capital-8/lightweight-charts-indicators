/**
 * Volumatic Fair Value Gaps [BigBeluga]
 *
 * Finds three-bar fair value gaps: a bullish gap when the low is above the high of two bars back (and the high of
 * two bars back is below the high of the bar before, the low of two bars back below the low), a bearish gap the
 * other way. A gap counts only when its size in % of the price is above 10 % of the largest size of the last 1,000
 * bars. From bar 101 on, each gap gets a box from the bar before to 25 bars after the current bar (it moves with
 * the bars), with the total volume of the bar before as its text, and two bars inside it: the share of bullish and
 * of bearish volume of that bar (their widths and "%" texts). A gap is removed when the close (or the low / high
 * with "high/low") goes beyond its far side, when another gap has its top inside it, and the oldest when more than
 * 10 are shown. On the last bar a table gives the count and the total volume of the bullish and bearish gaps shown.
 *
 * Limit, lower-timeframe volume: the original sums the volume of the bullish and of the bearish bars of a lower
 * timeframe (a tenth of the chart timeframe, "5S" on charts of 1 minute and less) inside each chart bar. The bars
 * passed to a port are the chart bars only, so the port ESTIMATES these two sums with the chart bar itself as the
 * only lower bar: all its volume is bullish when close > open, bearish when close < open, none when they are equal
 * (then the share is na, as in the original for a bar without volume). So the volume texts of the boxes and of the
 * table, and the widths and texts of the two volume bars, are NOT the values of the original. Everything else
 * (gaps, box positions, prices, colours, removals, counts) does not use these values. A chart timeframe below 5
 * seconds is the runtime error of the original (the lower timeframe is above the chart timeframe).
 *
 * Chart values read: the chart background colour (box text, bar borders, table background) and foreground colour
 * (bar and table texts); without a chart context the dark theme colours #0F0F0F / #DBDBDB. The chart timeframe is
 * `timeframe` of the context when given, else read from the bar spacing.
 *
 * Reference: "Volumatic Fair Value Gaps [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  ta, str, color, timeframe, Series, box, table, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, TableData } from '../types';
import { chartTimeframe } from '../anchor-period';
import { backgroundColorOf, foregroundColorOf, type ChartContext } from '../chart-context';

export interface VolumaticFairValueGapsInputs {
  mitigationSrc: 'close' | 'high/low';
  bullGaps: boolean;
  bearGaps: boolean;
  volumeBars: boolean;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: VolumaticFairValueGapsInputs = {
  mitigationSrc: 'close',
  bullGaps: true,
  bearGaps: true,
  volumeBars: true,
  bullColor: 'rgba(26, 194, 216, 0.5)',
  bearColor: 'rgba(216, 118, 26, 0.5)',
};

export const inputConfig: InputConfig[] = [
  { id: 'mitigationSrc', type: 'string', title: 'FVGs Mitigation Source', defval: 'close', options: ['close', 'high/low'] },
  { id: 'bullGaps', type: 'bool', title: 'Bullish FVG', defval: true },
  { id: 'bearGaps', type: 'bool', title: 'Bearish FVG', defval: true },
  { id: 'volumeBars', type: 'bool', title: 'Volume Bars', defval: true },
  { id: 'bullColor', type: 'color', title: 'Bullish', defval: defaultInputs.bullColor, inline: 'colors' },
  { id: 'bearColor', type: 'color', title: 'Bearish', defval: defaultInputs.bearColor, inline: 'colors' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Volumatic Fair Value Gaps [BigBeluga]',
  shortTitle: 'Volumatic Fair Value Gaps [BigBeluga]',
  overlay: true,
};

/** indicator(max_boxes_count = 500) */
const MAX_BOXES = 500;
const WHITE = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** type VolumaticFVG */
interface VolumaticFVG {
  body: Box;
  bull: number;
  bear: number;
  isBull: boolean;
  bullBar: Box;
  bearBar: Box;
  totalVol: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumaticFairValueGapsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const bg = backgroundColorOf(chart);
  const fg = foregroundColorOf(chart);

  // tf = time_ <= 1 ? "5S" : str.tostring(math.ceil(time_ / div)): request.security_lower_tf needs a timeframe
  // that is not above the chart timeframe
  const chartTf = chartTimeframe(bars, chart);
  if (chartTf !== '') {
    const chartSeconds = timeframe.in_seconds(chartTf);
    const minutes = chartSeconds / 60;
    const tf = minutes <= 1 ? '5S' : String(Math.ceil(minutes / 10));
    if (timeframe.in_seconds(tf) > chartSeconds) {
      throw new Error(`The chart's timeframe must be greater or equal to the \`${tf}\` timeframe used with \`request.security_lower_tf()\`.`);
    }
  }

  // Lower-timeframe volume, estimated with the chart bar as its only lower bar (see the header)
  const vol = (b: Bar) => (b.volume === undefined || isNaN(b.volume) ? 0 : b.volume);
  const sumBull = bars.map((b) => (gt(b.close, b.open) ? vol(b) : 0));
  const sumBear = bars.map((b) => (lt(b.close, b.open) ? vol(b) : 0));
  const totalVolume = sumBull.map((v, i) => v + sumBear[i]);

  // Gap filters
  const diff = bars.map((b, i) => {
    if (i < 2) return NaN;
    const p1 = bars[i - 1];
    const p2 = bars[i - 2];
    return gt(p1.close, p1.open) ? (b.low - p2.high) / b.low * 100 : (p2.low - b.high) / b.high * 100;
  });
  const largest = ta.percentile_nearest_rank(Series.fromArray(bars, diff), 1000, 100).toArray();

  resetDrawings({ box: MAX_BOXES });
  // var dash = table.new(position.top_right, 100, 100, chart.bg_color)
  const dash = table.new('top_right', 100, 100, bg);
  const fvgs: VolumaticFVG[] = [];
  /** array.remove(fvgs, index): a negative index counts from the end; another index outside the array throws */
  const removeAt = (index: number) => {
    const k = index < 0 ? fvgs.length + index : index;
    if (k < 0 || k >= fvgs.length) {
      throw new Error(`Index ${index} is out of bounds, array size is ${fvgs.length}`);
    }
    fvgs.splice(k, 1);
  };
  const deleteFvg = (fvg: VolumaticFVG) => {
    box.delete(fvg.body);
    box.delete(fvg.bullBar);
    box.delete(fvg.bearBar);
  };
  const bullCss = cfg.bullColor;
  const bearCss = cfg.bearColor;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    if (i <= 100) continue;
    const b = bars[i];
    const p1 = bars[i - 1];
    const p2 = bars[i - 2];
    const sizeFVG = diff[i] / (largest[i] ?? NaN) * 100;
    const filterFVG = gt(sizeFVG, 10);
    const isBullGap = lt(p2.high, b.low) && lt(p2.high, p1.high) && lt(p2.low, b.low) && filterFVG;
    const isBearGap = gt(p2.low, b.high) && gt(p2.low, p1.low) && gt(p2.high, b.high) && filterFVG;

    const addGap = (isBull: boolean, top: number, bottom: number) => {
      // the default box text colour of a version 6 script (white) is given explicitly
      const body = box.new(i - 1, top, i + 5, bottom, 'transparent', undefined, undefined, undefined, undefined,
        color.new(isBull ? bullCss : bearCss, 70), '', undefined, WHITE);
      const mid = (top + bottom) / 2;
      const bullVol = (sumBull[i - 1] / totalVolume[i - 1]) * 100;
      const bearVol = (sumBear[i - 1] / totalVolume[i - 1]) * 100;
      const left = box.get_left(body);
      const bearBar = box.new(left, box.get_top(body), left, mid, bg, undefined, undefined, undefined, undefined, bearCss,
        '', undefined, WHITE);
      const bullBar = box.new(left, mid, left, box.get_bottom(body), bg, undefined, undefined, undefined, undefined, bullCss,
        '', undefined, WHITE);
      fvgs.push({ body, bull: Math.trunc(bullVol), bear: Math.trunc(bearVol), isBull, bullBar, bearBar, totalVol: totalVolume[i - 1] });
    };
    if (isBullGap && cfg.bullGaps) addGap(true, b.low, p2.high);
    if (isBearGap && cfg.bearGaps) addGap(false, p2.low, b.high);

    // Remove Crossed FVGs: `for fvg in fvgs` (a removal skips the element after the removed one)
    if (fvgs.length > 0) {
      for (let k = 0; k < fvgs.length; k++) {
        const fvg = fvgs[k];
        const src1 = cfg.mitigationSrc === 'close' ? b.close : b.low;
        const src2 = cfg.mitigationSrc === 'close' ? b.close : b.high;
        const left = box.get_left(fvg.body);
        const right = box.get_right(fvg.body);
        if (fvg.isBull) {
          if (lt(src1, box.get_bottom(fvg.body))) {
            deleteFvg(fvg);
            removeAt(fvgs.indexOf(fvg));
          }
        } else if (gt(src2, box.get_top(fvg.body))) {
          deleteFvg(fvg);
          removeAt(fvgs.indexOf(fvg));
        }
        box.set_right(fvg.body, i + 25);
        box.set_text(fvg.body, str.tostring(fvg.totalVol, 'volume'));
        box.set_text_halign(fvg.body, 'right');
        box.set_text_color(fvg.body, bg);
        if (cfg.volumeBars) {
          const size = Math.trunc(right - left) / 200;
          box.set_right(fvg.bullBar, Math.trunc(left + size * fvg.bull));
          box.set_right(fvg.bearBar, Math.trunc(left + size * fvg.bear));
          box.set_text(fvg.bullBar, str.tostring(fvg.bull, 'percent'));
          box.set_text(fvg.bearBar, str.tostring(fvg.bear, 'percent'));
          box.set_text_color(fvg.bullBar, fg);
          box.set_text_color(fvg.bearBar, fg);
          box.set_text_halign(fvg.bullBar, 'right');
          box.set_text_halign(fvg.bearBar, 'right');
        } else {
          box.set_text(fvg.bearBar, '');
          box.set_text(fvg.bullBar, '');
        }
      }
    }

    // Remove Overlaped: the loop ends are read again on each pass
    if (fvgs.length > 0) {
      for (let a = 0; a <= fvgs.length - 1; a++) {
        const fvg = fvgs[a];
        const top = box.get_top(fvg.body);
        const bot = box.get_bottom(fvg.body);
        for (let j = 0; j <= fvgs.length - 1; j++) {
          if (a === j) continue;
          const l = fvgs[j];
          const top1 = box.get_top(l.body);
          if (lt(top1, top) && gt(top1, bot)) {
            deleteFvg(fvg);
            removeAt(fvgs.indexOf(fvg));
          }
        }
      }
    }

    // Controle Size
    if (fvgs.length > 10) deleteFvg(fvgs.shift()!);

    // DashBoard
    if (i === n - 1) {
      let bullCount = 0;
      let bearCount = 0;
      let bullVolume = 0;
      let bearVolume = 0;
      for (const fvg of fvgs) {
        if (fvg.isBull) {
          bullCount += 1;
          bullVolume += fvg.totalVol;
        } else {
          bearCount += 1;
          bearVolume += fvg.totalVol;
        }
      }
      table.cell(dash, 0, 0, 'FVG Type', undefined, undefined, fg);
      table.cell(dash, 1, 0, 'On Chart', undefined, undefined, fg);
      table.cell(dash, 2, 0, 'Total Volume', undefined, undefined, fg);
      table.cell(dash, 0, 1, 'Bullish FVG', undefined, undefined, color.new(bullCss, 0));
      table.cell(dash, 1, 1, str.tostring(bullCount), undefined, undefined, fg);
      table.cell(dash, 2, 1, str.tostring(bullVolume, 'volume'), undefined, undefined, fg);
      table.cell(dash, 0, 2, 'Bearish FVG', undefined, undefined, color.new(bearCss, 0));
      table.cell(dash, 1, 2, str.tostring(bearCount), undefined, undefined, fg);
      table.cell(dash, 2, 2, str.tostring(bearVolume, 'volume'), undefined, undefined, fg);
    }
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, n > 0 && bars[0].time >= 1e12 ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: out.boxes ?? [],
    tables: out.tables ?? [],
  };
}

export const VolumaticFairValueGaps = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
