/**
 * Order Blocks Volume Delta 3D | Flux Charts
 *
 * Swing highs / lows are pivots with "Swing Length" bars on each side. A break of structure (BOS) is a close
 * through the last swing low (bearish) or swing high (bullish), the bar before closing on the other side; it is
 * handled one bar later. For each BOS the bars from the swing to the BOS bar are split into 40 price bins and the
 * most touched price (POC) is the middle of the bin crossed by the most bars. The order block is the bar of that
 * range that touches the POC and has the highest high (bearish) or the lowest low (bullish) so far when scanning
 * back from the BOS bar; it is kept when no price gap lies between it and the BOS bar and it does not overlap an
 * active order block. Its volume, bullish volume (close > open) and bearish volume (close < open) are the sums
 * over the bars of the range that touch the POC. An order block is invalidated by a wick (or a close, "Invalidation")
 * through its far side, and retested when the bar before opens and closes outside it with its wick inside. At most
 * 50 order blocks are kept (inactive ones dropped first, none older than 5,000 bars).
 *
 * Drawings (all redrawn on each bar): the "Show Nearest" order blocks of each side nearest to the close (also the
 * invalidated ones when "Hide Invalidated Zones" is off, faded and ending at the invalidation bar), extended
 * "Extend Zones" bars past the current bar. With "Volume Delta" on: two boxes splitting the zone (left / right or
 * bottom / top) by the bullish share of the volume with the percentages, a label with the total volume, and 3D faces
 * (polylines) on the right side and the top of the zone, ATR(14) x 0.1 x depth high and "depth" bars deep. Retest
 * triangles (at least 3 bars apart per side) are drawn for the order blocks shown.
 *
 * Volume: with "Volume Delta Timeframe" empty (default) or not below the chart timeframe, the volume of each chart
 * bar is bullish when close > open and bearish when close < open, as the original. Limit, lower timeframe: below the
 * chart timeframe the original sums the volume of the lower-timeframe bars by their own close / open, which the chart
 * bars do not have; the port then ESTIMATES it with the chart bars as the lower-timeframe bars (the same rule on the
 * chart bars). So with a lower timeframe the volume numbers, percentages and splits are NOT those of the original
 * (the original also has no volume, and no volume drawings, on the bars before its lower-timeframe data starts);
 * the order blocks, invalidations and retests do not use the volume.
 *
 * Chart context (optional third argument of calculate): the chart foreground colour (line colour of the 3D faces,
 * dark theme #DBDBDB without a context) and the visible range: the top faces start at the first visible bar
 * (`chart.left_visible_bar_time`; without a context, the first bar). The 4 alert conditions and the alert() calls of
 * the script have no output.
 *
 * Reference: "Order Blocks Volume Delta 3D | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import {
  ta, Series, color, math, str, timeframe, box, label, polyline, chartPoint, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box, type Label, type Polyline,
  type ChartPoint,
} from 'oakscriptjs';
import type { BoxData, LabelData, PolylineData } from '../types';
import { foregroundColorOf, mintickOf, visibleRangeOf, type ChartContext } from '../chart-context';
import { chartTimeframe } from '../anchor-period';

export interface OrderBlocksVolumeDelta3dFluxChartsInputs {
  swingLen: number;
  bullObColor: string;
  bearObColor: string;
  invMethod: 'Wick' | 'Close';
  showNearestX: number;
  extendZones: number;
  showRetestLbl: boolean;
  hideInvalid: boolean;
  vdEnable: boolean;
  vdBullColor: string;
  vdBearColor: string;
  vd3D: boolean;
  vd3DDepth: number;
  displayStyle: 'Vertical' | 'Horizontal';
  /** Lower timeframe of the volume delta ("" = chart timeframe; a lower one is estimated, see the header) */
  vdTfIn: string;
  showTotalVol: boolean;
  showDeltaPct: boolean;
  vdTextColor: string;
  alBullOB: boolean;
  alBearOB: boolean;
  alBullRetest: boolean;
  alBearRetest: boolean;
}

export const defaultInputs: OrderBlocksVolumeDelta3dFluxChartsInputs = {
  swingLen: 5,
  bullObColor: 'rgba(8, 153, 129, 0.45)',
  bearObColor: 'rgba(242, 54, 69, 0.45)',
  invMethod: 'Wick',
  showNearestX: 3,
  extendZones: 10,
  showRetestLbl: true,
  hideInvalid: true,
  vdEnable: true,
  vdBullColor: 'rgba(8, 153, 129, 0.35)',
  vdBearColor: 'rgba(242, 54, 69, 0.35)',
  vd3D: true,
  vd3DDepth: 5,
  displayStyle: 'Vertical',
  vdTfIn: '',
  showTotalVol: true,
  showDeltaPct: true,
  vdTextColor: '#FFFFFF',
  alBullOB: true,
  alBearOB: true,
  alBullRetest: true,
  alBearRetest: true,
};

const G_OB = 'ORDER BLOCKS';
const G_VD = 'VOLUME DELTA';
const G_AL = 'ALERTS';

export const inputConfig: InputConfig[] = [
  { id: 'swingLen', type: 'int', title: 'Swing Length', defval: 5, min: 1, group: G_OB, inline: 'sw', display: 'none' },
  { id: 'bullObColor', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.45)', group: G_OB, inline: 'sw' },
  { id: 'bearObColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.45)', group: G_OB, inline: 'sw' },
  { id: 'invMethod', type: 'string', title: 'Invalidation', defval: 'Wick', options: ['Wick', 'Close'], group: G_OB, display: 'none' },
  { id: 'showNearestX', type: 'int', title: 'Show Nearest', defval: 3, min: 1, max: 20, group: G_OB, display: 'none' },
  {
    id: 'extendZones', type: 'int', title: 'Extend Zones', defval: 10, min: 0, group: G_OB,
    tooltip: 'This will extend the zones by X candles.', display: 'none',
  },
  { id: 'showRetestLbl', type: 'bool', title: 'Retest Labels', defval: true, group: G_OB, inline: 'tog' },
  { id: 'hideInvalid', type: 'bool', title: 'Hide Invalidated Zones', defval: true, group: G_OB, inline: 'tog' },
  { id: 'vdEnable', type: 'bool', title: 'Enable', defval: true, group: G_VD, inline: 'vd' },
  { id: 'vdBullColor', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.35)', group: G_VD, inline: 'vd' },
  { id: 'vdBearColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.35)', group: G_VD, inline: 'vd' },
  { id: 'vd3D', type: 'bool', title: '3D', defval: true, group: G_VD, inline: '3d', tooltip: 'Adds 3D-style depth faces.' },
  { id: 'vd3DDepth', type: 'int', title: '', defval: 5, min: 1, max: 5, group: G_VD, inline: '3d', display: 'none' },
  {
    id: 'displayStyle', type: 'string', title: 'Display Style', defval: 'Vertical', options: ['Vertical', 'Horizontal'], group: G_VD,
    tooltip: 'Horizontal: split shown top/bottom.\nVertical: split shown left/right across the zone.', display: 'none',
  },
  {
    id: 'vdTfIn', type: 'timeframe', title: 'Volume Delta Timeframe', defval: '', group: G_VD,
    tooltip: 'Lower timeframe used to estimate delta',
  },
  {
    id: 'showTotalVol', type: 'bool', title: 'Display Total Volume', defval: true, group: G_VD, inline: 'vd2',
    tooltip: 'Displays total volume (Bull+Bear) from the active delta source.',
  },
  {
    id: 'showDeltaPct', type: 'bool', title: 'Show Delta %', defval: true, group: G_VD, inline: 'vd2',
    tooltip: 'Shows bullish vs bearish volume split.\nIf selected TF is lower than chart TF, uses LTF data; otherwise uses chart TF.',
  },
  { id: 'vdTextColor', type: 'color', title: '', defval: '#FFFFFF', group: G_VD, inline: 'vd2' },
  { id: 'alBullOB', type: 'bool', title: 'Bullish Order Block', defval: true, group: G_AL, inline: 'oba' },
  { id: 'alBearOB', type: 'bool', title: 'Bearish Order Block', defval: true, group: G_AL, inline: 'oba' },
  { id: 'alBullRetest', type: 'bool', title: 'Bullish OB Retest', defval: true, group: G_AL, inline: 'obr' },
  { id: 'alBearRetest', type: 'bool', title: 'Bearish OB Retest', defval: true, group: G_AL, inline: 'obr' },
];

export const plotConfig: PlotConfig[] = [];

/** The top faces of the 3D zones start at the first visible bar: calculate again when the visible range changes */
export const usesVisibleRange = true;

export const metadata = {
  title: 'Order Blocks Volume Delta 3D | Flux Charts',
  shortTitle: 'Order Blocks Volume Delta 3D | Flux Charts',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_labels_count = 500, max_lines_count = 500, max_polylines_count = 100) */
const LIMITS = { box: 500, label: 500, line: 500, polyline: 100 };
const MAX_STORED_OBS = 50;
const RETEST_SIZE = 4;
const N_BINS = 40;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;

interface ObRec {
  leftIndex: number;
  createdIndex: number;
  top: number;
  bottom: number;
  isBull: boolean;
  active: boolean;
  invalidIndex: number;
  totalVol: number;
  bullPct: number;
  bearPct: number;
  hasDelta: boolean;
}

interface RetestRec {
  barIndex: number;
  isBull: boolean;
  obLeftIndex: number;
  obCreatedIndex: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<OrderBlocksVolumeDelta3dFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // request.security_lower_tf() with a timeframe above the chart timeframe stops the script (also when its branch
  // does not run); a lower one is estimated from the chart bars (see the header)
  const chartTf = chartTimeframe(bars, chart);
  if (cfg.vdTfIn.trim() !== '' && chartTf !== '' && timeframe.in_seconds(cfg.vdTfIn) > timeframe.in_seconds(chartTf)) {
    throw new Error(`The chart's timeframe must be greater or equal to the \`${cfg.vdTfIn}\` timeframe used with \`request.security_lower_tf()\`.`);
  }
  const swingLen = cfg.swingLen;
  const mintick = mintickOf(chart);
  const fg = foregroundColorOf(chart);
  const o = bars.map((b) => b.open);
  const h = bars.map((b) => b.high);
  const l = bars.map((b) => b.low);
  const c = bars.map((b) => b.close);

  // getBarVols(): total / bull / bear volume of each bar (the chart bars; see the header for a lower timeframe)
  const vTot = bars.map((b) => b.volume ?? NaN);
  const vBull = bars.map((b, i) => (gt(b.close, b.open) ? vTot[i] : 0));
  const vBear = bars.map((b, i) => (lt(b.close, b.open) ? vTot[i] : 0));

  const ph = ta.pivothigh(new Series(bars, (b) => b.high), swingLen, swingLen).toArray();
  const pl = ta.pivotlow(new Series(bars, (b) => b.low), swingLen, swingLen).toArray();
  const dayAtr = ta.atr(bars, 14).toArray();

  // var int leftVisIdx: the first bar at or after chart.left_visible_bar_time
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const leftVisTime = visibleRangeOf(bars, chart).leftTime;

  /** findMostTouchedPrice(): POC of the bars fromIdx..toIdx (40 bins) */
  const mostTouchedPrice = (i: number, fromIdx: number, toIdx: number, nBins: number): number => {
    const span = toIdx - fromIdx;
    if (isNaN(fromIdx) || isNaN(toIdx) || span <= 0) return NaN;
    let minP = 1e10;
    let maxP = -1e10;
    for (let idx = fromIdx; idx <= toIdx; idx++) {
      if (i - idx < 0) continue;
      const lo = l[idx];
      const hi = h[idx];
      if (isNaN(lo) || isNaN(hi)) continue;
      if (lt(lo, minP)) minP = lo;
      if (gt(hi, maxP)) maxP = hi;
    }
    if (!lt(minP, maxP)) return NaN;
    let step = (maxP - minP) / nBins;
    step = le(step, 0) ? mintick : step;
    const diffCnt = new Array<number>(nBins).fill(0);
    const clamp = (b: number) => (b < 0 ? 0 : b > nBins - 1 ? nBins - 1 : b);
    for (let idx = fromIdx; idx <= toIdx; idx++) {
      if (i - idx < 0) continue;
      const lo2 = l[idx];
      const hi2 = h[idx];
      if (isNaN(lo2) || isNaN(hi2)) continue;
      const sBin = clamp(Math.floor((lo2 - minP) / step));
      const eBin = clamp(Math.floor((hi2 - minP) / step));
      diffCnt[sBin] += 1;
      if (eBin + 1 < nBins) diffCnt[eBin + 1] -= 1;
    }
    let bestBin = 0;
    let bestCnt = 0;
    let runCnt = 0;
    for (let k = 0; k < nBins; k++) {
      runCnt += diffCnt[k];
      if (gt(runCnt, bestCnt)) {
        bestCnt = runCnt;
        bestBin = k;
      }
    }
    return minP + (bestBin + 0.5) * step;
  };

  /** calcMostTouchedPriceVol(): POC, then the bars touching it and their volumes (summed from toIdx back) */
  const pocVolume = (i: number, fromIdx: number, toIdx: number) => {
    const poc = mostTouchedPrice(i, fromIdx, toIdx, N_BINS);
    let touches = 0;
    let totVol = 0;
    let bullVol = 0;
    let bearVol = 0;
    const span = toIdx - fromIdx;
    if (!isNaN(poc) && span >= 0) {
      for (let step = 0; step <= span; step++) {
        const idx = toIdx - step;
        if (i - idx < 0) continue;
        const lo = l[idx];
        const hi = h[idx];
        if (!isNaN(lo) && !isNaN(hi) && le(lo, poc) && ge(hi, poc)) {
          touches += 1;
          if (!isNaN(vTot[idx])) totVol += vTot[idx];
          if (!isNaN(vBull[idx])) bullVol += vBull[idx];
          if (!isNaN(vBear[idx])) bearVol += vBear[idx];
        }
      }
    }
    return { poc, touches, totVol, bullVol, bearVol };
  };

  /** hasGapBetween(): a gap between two consecutive bars of anchorIdx..bosIdx */
  const hasGapBetween = (i: number, anchorIdx: number, bosIdx: number, isBull: boolean): boolean => {
    const fromIdx = Math.min(anchorIdx, bosIdx);
    const toIdx = Math.max(anchorIdx, bosIdx);
    if (toIdx - fromIdx < 1) return false;
    for (let absIdx = fromIdx + 1; absIdx <= toIdx; absIdx++) {
      if (i - absIdx < 0) continue;
      const hiPrev = h[absIdx - 1];
      const loPrev = l[absIdx - 1];
      const hiNow = h[absIdx];
      const loNow = l[absIdx];
      if (isNaN(hiPrev) || isNaN(loPrev) || isNaN(hiNow) || isNaN(loNow)) continue;
      if (isBull ? gt(loNow, hiPrev) : lt(hiNow, loPrev)) return true;
    }
    return false;
  };

  const obs: ObRec[] = [];
  const obRetests: RetestRec[] = [];
  let lastBullRetestBar = NaN;
  let lastBearRetestBar = NaN;
  let shPrice = NaN;
  let shIdx = NaN;
  let slPrice = NaN;
  let slIdx = NaN;
  let prevBosBearNow = false;
  let prevBosBullNow = false;
  let prevShIdx = NaN;
  let prevSlIdx = NaN;
  let leftVisIdx = NaN;

  const pruneObs = (i: number) => {
    const minLeft = Math.max(0, i - 4999);
    for (let k = obs.length - 1; k >= 0; k--) {
      if (obs[k].leftIndex < minLeft) obs.splice(k, 1);
    }
    while (obs.length > MAX_STORED_OBS) {
      let removed = false;
      for (let j = obs.length - 1; j >= 0; j--) {
        if (!obs[j].active) {
          obs.splice(j, 1);
          removed = true;
          break;
        }
      }
      if (!removed && obs.length > 0) obs.pop();
    }
  };

  const addObFromPoc = (i: number, baseIdx: number, top: number, bottom: number, isBull: boolean,
    tot: number, bVol: number, createdIdx: number) => {
    const hasDelta = gt(tot, 0);
    const bullPct = hasDelta ? (math.round((bVol / tot) * 100) as number) : 50;
    const bearPct = hasDelta ? 100 - bullPct : 50;
    obs.unshift({
      leftIndex: baseIdx, createdIndex: createdIdx, top, bottom, isBull, active: true, invalidIndex: NaN,
      totalVol: tot, bullPct, bearPct, hasDelta,
    });
    pruneObs(i);
  };

  const obOverlapsActive = (zoneTop: number, zoneBottom: number): boolean => {
    const zTop = Math.max(zoneTop, zoneBottom);
    const zBot = Math.min(zoneTop, zoneBottom);
    for (const ob of obs) {
      if (!ob.active) continue;
      const oTop = Math.max(ob.top, ob.bottom);
      const oBot = Math.min(ob.top, ob.bottom);
      if (ge(zTop, oBot) && le(zBot, oTop)) return true;
    }
    return false;
  };

  /** The order block bar of a BOS: touches the POC with the running highest high (bear) / lowest low (bull) */
  const bestIndex = (i: number, fromIdx: number, toIdx: number, poc: number, isBull: boolean): number => {
    const span = toIdx - fromIdx;
    let best = NaN;
    let run = NaN;
    if (span >= 0) {
      for (let step = 0; step <= span; step++) {
        const idx = toIdx - step;
        if (i - idx < 0) continue;
        const lo = l[idx];
        const hi = h[idx];
        if (isNaN(lo) || isNaN(hi)) continue;
        if (isBull) {
          run = isNaN(run) ? lo : Math.min(run, lo);
          if (le(lo, poc) && ge(hi, poc) && eq(lo, run)) best = idx;
        } else {
          run = isNaN(run) ? hi : Math.max(run, hi);
          if (le(lo, poc) && ge(hi, poc) && eq(hi, run)) best = idx;
        }
      }
    }
    return best;
  };

  /** A BOS of one side (bosIdx = the bar before, range from the swing of the bar before) */
  const onBos = (i: number, fromIdx: number, isBull: boolean) => {
    const bosIdx = i - 1;
    const toIdx = bosIdx;
    const v = pocVolume(i, fromIdx, toIdx);
    if (isNaN(v.poc) || v.touches <= 0 || isNaN(fromIdx)) return;
    const best = bestIndex(i, fromIdx, toIdx, v.poc, isBull);
    const gapLeg = !isNaN(best) ? hasGapBetween(i, best, bosIdx, isBull) : false;
    if (isNaN(best) || gapLeg) return;
    const top = h[best];
    const bottom = l[best];
    if (!obOverlapsActive(top, bottom)) addObFromPoc(i, best, top, bottom, isBull, v.totVol, v.bullVol, bosIdx);
  };

  // Draw engine
  resetDrawings(LIMITS);
  let allBoxes: Box[] = [];
  let allPolys: Polyline[] = [];
  let allLabels: Label[] = [];
  const isVert = cfg.displayStyle === 'Vertical';
  const bullCol = cfg.vdEnable ? cfg.vdBullColor : cfg.bullObColor;
  const bearCol = cfg.vdEnable ? cfg.vdBearColor : cfg.bearObColor;
  const vd3D = cfg.vd3D && cfg.vdEnable;
  const showTotalVol = cfg.showTotalVol && cfg.vdEnable;
  const showDeltaPct = cfg.showDeltaPct && cfg.vdEnable;
  const polyLine = String(color.new(fg, 90));
  const bullFace = String(color.new(bullCol, 70));
  const bearFace = String(color.new(bearCol, 70));

  const drawPoly = (pts: ChartPoint[], fill: string) => {
    if (pts.length > 0) allPolys.unshift(polyline.new(pts, false, false, 'bar_index', polyLine, fill));
  };
  /** sideBox(): the right face (points added at the front, as array.unshift) */
  const sideBox = (x: number, btm: number, top: number, depthY: number, widthX: number): ChartPoint[] => [
    chartPoint.from_index(x, btm),
    chartPoint.from_index(x, top),
    chartPoint.from_index(x + widthX, top + depthY),
    chartPoint.from_index(x + widthX, btm + depthY),
    chartPoint.from_index(x, btm),
  ];
  /** A top face from x1 to x2 (points in the order of the original after its unshift calls) */
  const topFace = (x1: number, x2: number, yT: number, depthY: number, widthX: number): ChartPoint[] => [
    chartPoint.from_index(x2 + widthX, yT + depthY),
    chartPoint.from_index(x2, yT),
    chartPoint.from_index(x1, yT),
    chartPoint.from_index(x1 + widthX, yT + depthY),
    chartPoint.from_index(x2 + widthX, yT + depthY),
  ];

  const obRightIndex = (i: number, ob: ObRec) => {
    const activeRight = i + cfg.extendZones;
    if (ob.active) return activeRight;
    return isNaN(ob.invalidIndex) ? activeRight : ob.invalidIndex;
  };

  const drawZoneAndVolume = (i: number, ob: ObRec) => {
    // obColors(), drawObZoneBox()
    const baseCol = ob.isBull ? bullCol : bearCol;
    const faded = ob.active ? baseCol : String(color.new(baseCol, 85));
    const minBar = i - 4999;
    const xL = Math.max(ob.leftIndex, minBar);
    const xR = Math.max(obRightIndex(i, ob), xL);
    allBoxes.unshift(box.new(xL, ob.top, xR, ob.bottom, 'transparent', 0, 'solid', 'none', 'bar_index', faded,
      '', 'auto', '#FFFFFF'));
    if (!(cfg.vdEnable && ob.hasDelta)) return;
    // obGeom()
    const widthX = cfg.vd3DDepth;
    const yT = ob.top;
    const yB = ob.bottom;
    const hgt = yT - yB;
    const bullTxt = showDeltaPct ? str.tostring(ob.bullPct) + '%' : '';
    const bearTxt = showDeltaPct ? str.tostring(ob.bearPct) + '%' : '';
    // drawTotalVolLabel()
    if (showTotalVol) {
      const cx = Math.max(xR - 1, xL);
      allLabels.unshift(label.new(cx, yB + hgt * 0.25, str.tostring(ob.totalVol, 'volume'), 'bar_index', 'price',
        '#ffffff00', 'label_right', cfg.vdTextColor, 'small', undefined, undefined, undefined, true));
    }
    // drawDeltaFills()
    const fillBox = (left: number, top: number, right: number, bottom: number, bg: string, text: string) =>
      box.new(left, top, right, bottom, undefined, 0, undefined, undefined, 'bar_index', bg, text, 'small', cfg.vdTextColor);
    if (isVert) {
      let splitX = xL + Math.trunc((xR - xL) * (ob.bullPct / 100));
      splitX = xR - xL >= 2 ? Math.max(xL + 1, Math.min(xR - 1, splitX)) : xL;
      allBoxes.unshift(fillBox(xL, yT, splitX, yB, bullCol, bullTxt));
      allBoxes.unshift(fillBox(splitX, yT, xR, yB, bearCol, bearTxt));
    } else {
      const midY = yB + hgt * (ob.bullPct / 100);
      allBoxes.unshift(fillBox(xL, midY, xR, yB, bullCol, bullTxt));
      allBoxes.unshift(fillBox(xL, yT, xR, midY, bearCol, bearTxt));
    }
    // drawDelta3D()
    if (!vd3D) return;
    const depthY = dayAtr[i] * (0.1 * cfg.vd3DDepth);
    const visibleLeft = isNaN(leftVisIdx) ? xL : Math.max(xL, leftVisIdx);
    const visibleRight = xR;
    if (!isVert) {
      const midY = yB + hgt * (ob.bullPct / 100);
      if (ob.bullPct > 0) drawPoly(sideBox(xR, yB, midY, depthY, widthX), bullFace);
      if (ob.bullPct < 100) drawPoly(sideBox(xR, midY, yT, depthY, widthX), bearFace);
      if (visibleRight > visibleLeft) drawPoly(topFace(visibleLeft, visibleRight, yT, depthY, widthX), bearFace);
    } else {
      drawPoly(sideBox(xR, yB, yT, depthY, widthX), bearFace);
      if (visibleRight > visibleLeft) {
        let bullRight = visibleLeft + Math.trunc((visibleRight - visibleLeft) * (ob.bullPct / 100));
        bullRight = Math.max(visibleLeft, Math.min(visibleRight, bullRight));
        if (ob.bullPct > 0 && bullRight > visibleLeft) drawPoly(topFace(visibleLeft, bullRight, yT, depthY, widthX), bullFace);
        if (ob.bullPct < 100 && visibleRight > bullRight) drawPoly(topFace(bullRight, visibleRight, yT, depthY, widthX), bearFace);
      }
    }
  };

  /** pickNearest(): indexes of the kMax active order blocks of one side nearest to the close */
  const pickNearest = (i: number, wantBull: boolean, kMax: number): number[] => {
    const dists: number[] = [];
    const idxs: number[] = [];
    for (let k = 0; k < obs.length; k++) {
      const ob = obs[k];
      if (ob.isBull !== wantBull || !ob.active) continue;
      const px = c[i];
      const dist = gt(px, ob.top) ? px - ob.top : lt(px, ob.bottom) ? ob.bottom - px : 0;
      let pos = dists.length;
      for (let j = 0; j < dists.length; j++) {
        if (lt(dist, dists[j])) {
          pos = j;
          break;
        }
      }
      dists.splice(pos, 0, dist);
      idxs.splice(pos, 0, k);
      while (dists.length > kMax) {
        dists.pop();
        idxs.pop();
      }
    }
    return idxs;
  };

  const drawRetestLabels = (i: number, bullAct: number[], bearAct: number[], bullInv: number[], bearInv: number[]) => {
    if (!cfg.showRetestLbl || obRetests.length === 0) return;
    const minBar = i - 4999;
    let lastBullLbl = NaN;
    let lastBearLbl = NaN;
    const parentIn = (list: number[], r: RetestRec) => list.some((k) => {
      const ob = obs[k];
      return ob.leftIndex === r.obLeftIndex && ob.createdIndex === r.obCreatedIndex;
    });
    for (let k = obRetests.length - 1; k >= 0; k--) {
      const r = obRetests[k];
      if (r.barIndex < minBar || r.barIndex > i) {
        obRetests.splice(k, 1);
        continue;
      }
      let shown = parentIn(r.isBull ? bullAct : bearAct, r);
      if (!shown && !cfg.hideInvalid) shown = parentIn(r.isBull ? bullInv : bearInv, r);
      if (!shown) continue;
      const age = i - r.barIndex;
      if (age < 0 || age > 4999) continue;
      if (r.isBull) {
        if (!isNaN(lastBullLbl) && r.barIndex - lastBullLbl < 3) continue;
        lastBullLbl = r.barIndex;
      } else {
        if (!isNaN(lastBearLbl) && r.barIndex - lastBearLbl < 3) continue;
        lastBearLbl = r.barIndex;
      }
      const baseCol = String(color.new(r.isBull ? cfg.bullObColor : cfg.bearObColor, 0));
      allLabels.unshift(label.new(r.barIndex, c[r.barIndex], '', 'bar_index', r.isBull ? 'belowbar' : 'abovebar', baseCol,
        r.isBull ? 'triangleup' : 'triangledown', baseCol, RETEST_SIZE, undefined, undefined, undefined, true));
    }
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    // ORDER BLOCK ENGINE
    if (!isNaN(ph[i])) {
      shPrice = ph[i];
      shIdx = i - swingLen;
    }
    if (!isNaN(pl[i])) {
      slPrice = pl[i];
      slIdx = i - swingLen;
    }
    const cPrev = i > 0 ? c[i - 1] : NaN;
    const bosBearNow = !isNaN(slPrice) && i > slIdx && lt(c[i], slPrice) && ge(cPrev, slPrice);
    const bosBullNow = !isNaN(shPrice) && i > shIdx && gt(c[i], shPrice) && le(cPrev, shPrice);
    const bosBear = prevBosBearNow;
    const bosBull = prevBosBullNow;
    prevBosBearNow = bosBearNow;
    prevBosBullNow = bosBullNow;
    // fromIdx = slIdx[1] / shIdx[1]
    const fromIdxBear = prevSlIdx;
    const fromIdxBull = prevShIdx;

    if (bosBear) {
      onBos(i, fromIdxBear, false);
      slPrice = NaN;
      slIdx = NaN;
    }
    if (bosBull) {
      onBos(i, fromIdxBull, true);
      shPrice = NaN;
      shIdx = NaN;
    }
    prevSlIdx = slIdx;
    prevShIdx = shIdx;

    // Invalidation and retests
    for (const ob of obs) {
      if (!ob.active) continue;
      let invalid = false;
      let invIdx = NaN;
      if (cfg.invMethod === 'Wick') {
        invalid = ob.isBull ? lt(l[i], ob.bottom) : gt(h[i], ob.top);
        invIdx = i;
      } else if (i > 0) {
        invalid = ob.isBull ? lt(c[i - 1], ob.bottom) : gt(c[i - 1], ob.top);
        invIdx = i - 1;
      }
      if (invalid) {
        ob.active = false;
        ob.invalidIndex = invIdx;
      }
      if (i === 0) continue;
      const retestPrev = ob.isBull
        ? gt(o[i - 1], ob.top) && gt(c[i - 1], ob.top) && le(l[i - 1], ob.top) && ge(l[i - 1], ob.bottom)
        : lt(o[i - 1], ob.bottom) && lt(c[i - 1], ob.bottom) && ge(h[i - 1], ob.bottom) && le(h[i - 1], ob.top);
      const retestBar = i - 1;
      if (retestPrev && retestBar > ob.createdIndex) {
        const lastSideBar = ob.isBull ? lastBullRetestBar : lastBearRetestBar;
        if (isNaN(lastSideBar) || retestBar - lastSideBar >= 4) {
          obRetests.unshift({ barIndex: retestBar, isBull: ob.isBull, obLeftIndex: ob.leftIndex, obCreatedIndex: ob.createdIndex });
          if (ob.isBull) lastBullRetestBar = retestBar;
          else lastBearRetestBar = retestBar;
        }
      }
    }

    // DRAW ENGINE
    if (isNaN(leftVisIdx) && bars[i].time * toMs >= leftVisTime) leftVisIdx = i;
    for (const b of allBoxes) box.delete(b);
    for (const p of allPolys) polyline.delete(p);
    for (const lb of allLabels) label.delete(lb);
    allBoxes = [];
    allPolys = [];
    allLabels = [];

    const bullActive = pickNearest(i, true, cfg.showNearestX);
    const bearActive = pickNearest(i, false, cfg.showNearestX);
    const bullInvalid: number[] = [];
    const bearInvalid: number[] = [];
    if (!cfg.hideInvalid) {
      obs.forEach((ob, k) => {
        if (!ob.active) (ob.isBull ? bullInvalid : bearInvalid).push(k);
      });
      for (const k of bearInvalid) drawZoneAndVolume(i, obs[k]);
    }
    for (const k of bearActive) drawZoneAndVolume(i, obs[k]);
    if (!cfg.hideInvalid) for (const k of bullInvalid) drawZoneAndVolume(i, obs[k]);
    for (const k of bullActive) drawZoneAndVolume(i, obs[k]);
    drawRetestLabels(i, bullActive, bearActive, bullInvalid, bearInvalid);
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: out.boxes ?? [],
    labels: out.labels ?? [],
    polylines: out.polylines ?? [],
  };
}

export const OrderBlocksVolumeDelta3dFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
