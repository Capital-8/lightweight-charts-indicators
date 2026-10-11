/**
 * Supply and Demand Visible Range [LuxAlgo]
 *
 * Supply and demand zones of the bars visible on the chart, from the volume traded near the top and the bottom of
 * the visible price range.
 * - The price range of the visible bars (highest high to lowest low) is cut in 'Resolution' intervals. Going down
 *   from the top, the volume of the bars whose high is inside the interval is added up (supply); going up from
 *   the bottom, the volume of the bars whose low is inside the interval (demand).
 * - While a side has not reached the threshold, each interval draws a column from the first visible bar: its
 *   length is the share of the accumulated volume in the total visible volume.
 * - When the accumulated volume of a side goes above 'Threshold %' of the total volume, its zone is drawn from the
 *   range top (bottom) to that interval: an area, its average (solid line) and its volume weighted average
 *   (dashed line).
 * - When both zones exist: the equilibrium lines, average of the range top and bottom (solid) and average of the
 *   two weighted averages (dashed).
 * The first visible bar itself is not read by the volume loop, as in the original.
 *
 * Visible range: the indicator reads the first and the last visible bar of the chart (`leftVisibleBarTime` /
 * `rightVisibleBarTime` of the chart context, third argument of calculate). It must be calculated again when the
 * user scrolls or zooms. Without these values the range is all the bars. When no bar is in the range nothing is
 * drawn.
 *
 * Visible ranges where the original stops:
 * - one visible bar: the original reads a bar after the current one and stops with an error; the port throws.
 * - a long range (more than about 3,400 bars): the original stops on its history limit; the port has no such
 *   limit and gives the zones.
 *
 * Limits of the port:
 * - 'Intrabar TF' is ported for the chart timeframe only (the default, an empty value). A lower timeframe needs
 *   the bars of that timeframe, which the port does not have: it throws an Error.
 *
 * Reference: "Supply and Demand Visible Range [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe } from '../anchor-period';
import type { BoxData, LineDrawingData } from '../types';
import { visibleRangeOf, type ChartContext } from '../chart-context';

export interface SupplyAndDemandVisibleRangeInputs {
  /** Threshold % */
  per: number;
  /** Resolution */
  div: number;
  /** Intrabar TF */
  tf: string;
  /** Supply */
  showSupply: boolean;
  supplyCss: string;
  /** Area (supply) */
  supplyArea: boolean;
  /** Average (supply) */
  supplyAvg: boolean;
  /** Weighted (supply) */
  supplyWavg: boolean;
  /** Equilibrium */
  showEqui: boolean;
  equiCss: string;
  /** Average (equilibrium) */
  equiAvg: boolean;
  /** Weighted (equilibrium) */
  equiWavg: boolean;
  /** Demand */
  showDemand: boolean;
  demandCss: string;
  /** Area (demand) */
  demandArea: boolean;
  /** Average (demand) */
  demandAvg: boolean;
  /** Weighted (demand) */
  demandWavg: boolean;
}

export const defaultInputs: SupplyAndDemandVisibleRangeInputs = {
  per: 10,
  div: 50,
  tf: '',
  showSupply: true,
  supplyCss: '#2157F3',
  supplyArea: true,
  supplyAvg: true,
  supplyWavg: true,
  showEqui: true,
  equiCss: '#787B86',
  equiAvg: true,
  equiWavg: true,
  showDemand: true,
  demandCss: '#FF5D00',
  demandArea: true,
  demandAvg: true,
  demandWavg: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'per', type: 'float', title: 'Threshold %', defval: 10, min: 0, max: 100 },
  { id: 'div', type: 'int', title: 'Resolution', defval: 50, min: 2, max: 500 },
  { id: 'tf', type: 'timeframe', title: 'Intrabar TF', defval: '' },
  { id: 'showSupply', type: 'bool', title: 'Supply        ', defval: true, inline: 'supply', group: 'Style' },
  { id: 'supplyCss', type: 'color', title: '', defval: '#2157F3', inline: 'supply', group: 'Style' },
  { id: 'supplyArea', type: 'bool', title: 'Area', defval: true, inline: 'supply', group: 'Style' },
  { id: 'supplyAvg', type: 'bool', title: 'Average', defval: true, inline: 'supply', group: 'Style' },
  { id: 'supplyWavg', type: 'bool', title: 'Weighted', defval: true, inline: 'supply', group: 'Style' },
  { id: 'showEqui', type: 'bool', title: 'Equilibrium', defval: true, inline: 'equi', group: 'Style' },
  { id: 'equiCss', type: 'color', title: '', defval: '#787B86', inline: 'equi', group: 'Style' },
  { id: 'equiAvg', type: 'bool', title: 'Average', defval: true, inline: 'equi', group: 'Style' },
  { id: 'equiWavg', type: 'bool', title: 'Weighted', defval: true, inline: 'equi', group: 'Style' },
  { id: 'showDemand', type: 'bool', title: 'Demand    ', defval: true, inline: 'demand', group: 'Style' },
  { id: 'demandCss', type: 'color', title: '', defval: '#FF5D00', inline: 'demand', group: 'Style' },
  { id: 'demandArea', type: 'bool', title: 'Area', defval: true, inline: 'demand', group: 'Style' },
  { id: 'demandAvg', type: 'bool', title: 'Average', defval: true, inline: 'demand', group: 'Style' },
  { id: 'demandWavg', type: 'bool', title: 'Weighted', defval: true, inline: 'demand', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Supply and Demand Visible Range [LuxAlgo]',
  shortTitle: 'Supply and Demand Visible Range [LuxAlgo]',
  overlay: true,
};

/** The indicator reads the visible range of the chart: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

/** max_boxes_count */
const MAX_BOXES = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Bx { left: number; top: number; right: number; bottom: number; bg: string; dead: boolean }
interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; dashed: boolean }
/** Pine type bin */
interface Bin { lvl: number; prev: number; sum: number; prevSum: number; csum: number; avg: number; isreached: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<SupplyAndDemandVisibleRangeInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { per, div } = cfg;
  const result = (boxes: BoxData[], lines: LineDrawingData[]) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
  });
  if (bars.length === 0) return result([], []);

  // request.security_lower_tf(syminfo.tickerid, tf, [high, low, volume]): with the chart timeframe each bar gives
  // one intrabar, the bar itself
  const tf = cfg.tf.trim();
  if (tf !== '') {
    const chartTf = chartTimeframe(bars, chart);
    const tfSeconds = timeframe.in_seconds(tf);
    const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
    if (tfSeconds !== chartSeconds) {
      throw new Error(
        `Supply and Demand Visible Range: 'Intrabar TF' = ${tf} needs the bars of that timeframe; the port reads the chart bars only (leave it empty)`,
      );
    }
  }

  // the visible bars: Pine `time == chart.left_visible_bar_time` / `time == chart.right_visible_bar_time`
  const range = visibleRangeOf(bars, chart);
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const { left, right } = range;
  const visible = left <= right && bars[left].time * toMs >= range.leftTime && bars[right].time * toMs <= range.rightTime;

  // var drawings: the two areas (box, average, weighted average) and the equilibrium lines, created with na points
  const boxList: Bx[] = [];
  const newBox = (bx: Omit<Bx, 'dead'>): Bx => {
    const b: Bx = { ...bx, dead: false };
    boxList.push(b);
    if (boxList.length > MAX_BOXES + 5) for (const old of boxList.splice(0, boxList.length - MAX_BOXES)) old.dead = true;
    return b;
  };
  const newLine = (css: string, dashed: boolean): Ln => ({ x1: NaN, y1: NaN, x2: NaN, y2: NaN, color: css, dashed });
  const naBox = (css: string) => newBox({ left: NaN, top: NaN, right: NaN, bottom: NaN, bg: String(color.new(css, 80)) });
  const supplyArea = { bx: naBox(cfg.supplyCss), avg: newLine(cfg.supplyCss, false), wavg: newLine(cfg.supplyCss, true) };
  const demandArea = { bx: naBox(cfg.demandCss), avg: newLine(cfg.demandCss, false), wavg: newLine(cfg.demandCss, true) };
  const equi = newLine(cfg.equiCss, false);
  const wequi = newLine(cfg.equiCss, true);
  const lineList = [supplyArea.avg, supplyArea.wavg, demandArea.avg, demandArea.wavg, equi, wequi];

  if (visible) {
    const n = right;
    const x1 = left;
    // range and volume of the visible bars, up to the last visible bar
    let max = bars[left].high;
    let min = bars[left].low;
    let csum = bars[left].volume ?? NaN;
    for (let i = left + 1; i <= right; i++) {
      max = Math.max(bars[i].high, max);
      min = Math.min(bars[i].low, min);
      csum += bars[i].volume ?? NaN;
    }

    const setArea = (
      id: typeof supplyArea, top: number, btm: number, avg: number, wavg: number,
      showArea: boolean, showAvg: boolean, showWavg: boolean,
    ) => {
      if (showArea && !id.bx.dead) Object.assign(id.bx, { left: x1, top, right: n, bottom: btm });
      if (showAvg) Object.assign(id.avg, { x1, y1: avg, x2: n, y2: avg });
      if (showWavg) Object.assign(id.wavg, { x1, y1: wavg, x2: n, y2: wavg });
    };

    const r = (max - min) / div;
    const supply: Bin = { lvl: max, prev: max, sum: 0, prevSum: 0, csum: 0, avg: 0, isreached: false };
    const demand: Bin = { lvl: min, prev: min, sum: 0, prevSum: 0, csum: 0, avg: 0, isreached: false };
    let supplyWavg = NaN;
    let demandWavg = NaN;
    const supplyColumn = String(color.new(cfg.supplyCss, 50));
    const demandColumn = String(color.new(cfg.demandCss, 50));
    // Pine `for j = 0 to (n - x1) - 1`: the bars after the first visible bar, newest first. With one visible bar
    // the loop counts down from 0 to -1 and reads a bar in the future: a Pine runtime error
    if (n - x1 - 1 < 0) throw new Error(ONE_BAR_ERROR);

    for (let i = 0; i < div; i++) {
      supply.lvl -= r;
      demand.lvl += r;

      // accumulated volume column
      if (!supply.isreached && cfg.showSupply && cfg.supplyArea) {
        newBox({ left: x1, top: supply.prev, right: x1 + Math.trunc((supply.sum / csum) * (n - x1)), bottom: supply.lvl, bg: supplyColumn });
      }
      if (!demand.isreached && cfg.showDemand && cfg.demandArea) {
        newBox({ left: x1, top: demand.lvl, right: x1 + Math.trunc((demand.sum / csum) * (n - x1)), bottom: demand.prev, bg: demandColumn });
      }

      for (let j = 0; j <= n - x1 - 1; j++) {
        const b = bars[n - j];
        const v = b.volume ?? NaN;
        // accumulate if within the upper interval
        supply.sum += gt(b.high, supply.lvl) && lt(b.high, supply.prev) ? v : 0;
        supply.avg += supply.lvl * (supply.sum - supply.prevSum);
        supply.csum += supply.sum - supply.prevSum;
        supply.prevSum = supply.sum;
        // accumulate if within the lower interval
        demand.sum += lt(b.low, demand.lvl) && gt(b.low, demand.prev) ? v : 0;
        demand.avg += demand.lvl * (demand.sum - demand.prevSum);
        demand.csum += demand.sum - demand.prevSum;
        demand.prevSum = demand.sum;

        // supply: accumulated volume above the threshold
        if (gt((supply.sum / csum) * 100, per) && !supply.isreached) {
          supplyWavg = supply.avg / supply.csum;
          if (cfg.showSupply) {
            setArea(supplyArea, max, supply.lvl, (max + supply.lvl) / 2, supplyWavg, cfg.supplyArea, cfg.supplyAvg, cfg.supplyWavg);
          }
          supply.isreached = true;
        }
        // demand: accumulated volume above the threshold (only when the demand is shown, as the original)
        if (gt((demand.sum / csum) * 100, per) && !demand.isreached && cfg.showDemand) {
          demandWavg = demand.avg / demand.csum;
          setArea(demandArea, demand.lvl, min, (min + demand.lvl) / 2, demandWavg, cfg.demandArea, cfg.demandAvg, cfg.demandWavg);
          demand.isreached = true;
        }
        if (supply.isreached && demand.isreached) break;
      }

      if (supply.isreached && demand.isreached && cfg.showEqui) {
        if (cfg.equiAvg) {
          const avg = (max + min) / 2;
          Object.assign(equi, { x1, y1: avg, x2: n, y2: avg });
        }
        if (cfg.equiWavg) {
          const wavg = (supplyWavg + demandWavg) / 2;
          Object.assign(wequi, { x1, y1: wavg, x2: n, y2: wavg });
        }
        break;
      }

      supply.prev = supply.lvl;
      demand.prev = demand.lvl;
    }
  }

  // objects with an na point are not drawn
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  const boxes: BoxData[] = boxList
    .filter((b) => !b.dead && drawn(b.left, b.top, b.right, b.bottom))
    .map((b) => ({
      time1: bars[b.left].time, price1: b.top, time2: bars[b.right].time, price2: b.bottom,
      bgColor: b.bg, borderColor: 'transparent',
    }));
  const lines: LineDrawingData[] = lineList
    .filter((l) => drawn(l.x1, l.y1, l.x2, l.y2))
    .map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
    }));
  return result(boxes, lines);
}

/** Pine runtime error of the original when the visible range is one bar */
const ONE_BAR_ERROR = 'Supply and Demand Visible Range: the visible range must have at least two bars';

export const SupplyAndDemandVisibleRange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
