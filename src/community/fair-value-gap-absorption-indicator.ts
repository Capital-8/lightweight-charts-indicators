/**
 * Fair Value Gap Absorption Indicator [LuxAlgo]
 *
 * A bullish fair value gap: the low of the bar is above the high of two bars back by more than ATR(144) times the
 * width filter, the close of the bar before is above that high, and neither this bar nor the bar before opened a
 * gap with the bar before it (low above the previous high). A bearish one is the mirror. Only the newest gap is
 * active: a new gap, or any bar whose low is above the previous high (or high below the previous low), ends it.
 *
 * Drawings of the active gap: the remaining gap (a box), the mitigated part (a grey box that grows from the gap
 * edge as the price enters it), a text box with the percentage of the gap that was filled, and a line at the far
 * edge. They extend to the current bar. A gap that is filled completely ends. With "Historical Fair Value Gaps" on
 * the ended gaps stay on the chart (at most 500 boxes and 50 lines are kept), otherwise they are deleted.
 *
 * Chart context: `chart.fg_color` (percentage text).
 *
 * Reference: "Fair Value Gap Absorption Indicator [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, str, line, box, resetDrawings, setDrawingBar, drawingOutputs,
  type Box, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface FairValueGapAbsorptionIndicatorInputs {
  /** Fair Value Gap Width Filter (times ATR 144; 0 = no filter) */
  fvgTH: number;
  /** Bullish imbalance colour */
  fvgBC: string;
  /** Bullish mitigation colour */
  fvgAC: string;
  /** Bearish imbalance colour */
  fvgSC: string;
  /** Bearish mitigation colour */
  fvgFC: string;
  /** Display Percentage of Mitigation */
  fvgPR: boolean;
  /** Historical Fair Value Gaps */
  fvgVF: boolean;
}

export const defaultInputs: FairValueGapAbsorptionIndicatorInputs = {
  fvgTH: 0.5,
  // input.color(color.new(c, 55)): alpha 0.45, byte 115; color.new(c, 77): alpha 0.23, byte 59
  fvgBC: '#08998173',
  fvgAC: '#787B863B',
  fvgSC: '#F2364573',
  fvgFC: '#787B863B',
  fvgPR: true,
  fvgVF: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'fvgTH', type: 'float', title: 'Fair Value Gap Width Filter', defval: 0.5, min: 0, step: 0.1,
    tooltip: 'The script displays the fair value gaps whose width is larger than a fixed-length atr (average true range) value multiplied by the value of the option.\n\nThe option value set to 0 means no filtering is applied.\n\nRemark: no filtering will be applied for the first 144 (atr fixed-length) candles since the atr value won\'t be present',
  },
  { id: 'fvgBC', type: 'color', title: 'Bullish, Imbalance', defval: '#08998173', inline: 'VA' },
  { id: 'fvgAC', type: 'color', title: 'Mitigation', defval: '#787B863B', inline: 'VA' },
  { id: 'fvgSC', type: 'color', title: 'Bearish, Imbalance', defval: '#F2364573', inline: 'VD' },
  { id: 'fvgFC', type: 'color', title: 'Mitigation', defval: '#787B863B', inline: 'VD' },
  {
    id: 'fvgPR', type: 'bool', title: 'Display Percentage of Mitigation', defval: true,
    tooltip: 'Displays percentage value of the mitigation area',
  },
  {
    id: 'fvgVF', type: 'bool', title: 'Historical Fair Value Gaps', defval: true, inline: 'FL',
    tooltip: 'Toggles the visibility of the historical fair value gaps',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Fair Value Gap Absorption Indicator [LuxAlgo]',
  shortTitle: 'LuxAlgo - Fair Value Gap Absorption Indicator',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<FairValueGapAbsorptionIndicatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const atrArr = ta.atr(bars, 144).toArray();

  // indicator(max_boxes_count = 500); lines: default 50
  resetDrawings({ box: 500 });

  // type FVG: one array per drawing (at most one element: the active gap)
  const uFVG: Box[] = [];
  const mFVG: Box[] = [];
  const tFVG: Box[] = [];
  const lFVG: Line[] = [];
  let last: boolean | null = null; // var bool last = na

  // method clear(FVG _id, _h)
  const clear = (keep: boolean) => {
    const arr = [uFVG.pop(), mFVG.pop(), tFVG.pop()];
    if (!keep) {
      for (const bx of arr) if (bx) box.delete(bx);
      const l = lFVG.pop();
      if (l) line.delete(l);
    } else {
      lFVG.pop();
    }
  };

  const high = (k: number) => (k >= 0 ? bars[k].high : NaN);
  const low = (k: number) => (k >= 0 ? bars[k].low : NaN);
  const bullGap = (k: number) => k >= 1 && gt(low(k), high(k - 1));
  const bearGap = (k: number) => k >= 1 && lt(high(k), low(k - 1));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const h = bars[i].high;
    const l = bars[i].low;
    const c1 = i >= 1 ? bars[i - 1].close : NaN;
    const h2 = high(i - 2);
    const l2 = low(i - 2);

    const bullG = bullGap(i);
    const bearG = bearGap(i);
    const atr = (atrArr[i] == null || Number.isNaN(atrArr[i]) ? 0 : atrArr[i]!) * cfg.fvgTH;

    const bull = gt(l - h2, atr) && gt(l, h2) && gt(c1, h2) && !(bullG || bullGap(i - 1));
    if (bull) {
      if (uFVG.length > 0) clear(cfg.fvgVF);
      uFVG.push(box.new(i - 1, l, i, h2, 'transparent', undefined, undefined, undefined, undefined, cfg.fvgBC));
      mFVG.push(box.new(i - 1, l, i, l, 'transparent', undefined, undefined, undefined, undefined, cfg.fvgAC));
      tFVG.push(box.new(i - 1, l, i, h2, 'transparent', undefined, undefined, undefined, undefined, 'transparent',
        undefined, 'small', fg));
      lFVG.push(line.new(i - 1, h2, i, h2, 'bar_index', undefined, cfg.fvgBC, undefined, 2));
      last = true;
    }

    const bear = gt(l2 - h, atr) && lt(h, l2) && lt(c1, l2) && !(bearG || bearGap(i - 1));
    if (bear) {
      if (uFVG.length > 0) clear(cfg.fvgVF);
      uFVG.push(box.new(i - 1, l2, i, h, 'transparent', undefined, undefined, undefined, undefined, cfg.fvgSC));
      mFVG.push(box.new(i - 1, h, i, h, 'transparent', undefined, undefined, undefined, undefined, cfg.fvgFC));
      tFVG.push(box.new(i - 1, l2, i, h, 'transparent', undefined, undefined, undefined, undefined, 'transparent',
        undefined, 'small', fg));
      lFVG.push(line.new(i - 1, l2, i, l2, 'bar_index', undefined, cfg.fvgSC, undefined, 2));
      last = false;
    }

    if (bullG || bearG) {
      if (uFVG.length > 0) clear(cfg.fvgVF);
    }

    // method update(FVG _id, _h, _l, _p)
    if (uFVG.length > 0) {
      const cUB = uFVG[0];
      const tUB = box.get_top(cUB);
      const bUB = box.get_bottom(cUB);
      const cMB = mFVG[0];
      const tMB = box.get_top(cMB);
      const bMB = box.get_bottom(cMB);
      const cTB = tFVG[0];
      const cL = lFVG[0];

      if (gt(h, bUB) && lt(l, tUB)) {
        if (last) {
          if (gt(l, bUB)) {
            const v = Math.min(l, bMB);
            box.set_bottom(cMB, v);
            box.set_top(cUB, v);
            if (cfg.fvgPR) box.set_text(cTB, str.tostring((tMB - v) / (tMB - bUB), '#.#%'));
          } else {
            box.set_bottom(cMB, bUB);
            box.set_top(cUB, bUB);
            box.set_text(cTB, '');
            clear(cfg.fvgVF);
          }
        } else if (lt(h, tUB)) {
          const v = Math.max(h, tMB);
          box.set_top(cMB, v);
          box.set_bottom(cUB, v);
          if (cfg.fvgPR) box.set_text(cTB, str.tostring((v - bMB) / (tUB - bMB), '#.#%'));
        } else {
          box.set_top(cMB, tUB);
          box.set_bottom(cUB, tUB);
          box.set_text(cTB, '');
          clear(cfg.fvgVF);
        }
      }
      box.set_right(cMB, i);
      box.set_right(cUB, i);
      box.set_right(cTB, i);
      line.set_x2(cL, i);
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    ...drawingOutputs(bars),
  };
}

export const FairValueGapAbsorptionIndicator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
