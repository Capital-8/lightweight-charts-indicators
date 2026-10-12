/**
 * Supply and Demand Anchored
 *
 * Between two anchor times picked on the chart (left and right), the highest high, the lowest low and the total
 * volume are accumulated. On the right anchor bar the range is cut into 'Resolution' levels. Going down from the top
 * (supply) and up from the bottom (demand) one level at a time, the volume of the bars whose high (supply) / low
 * (demand) lies inside the level is accumulated (cumulative over the levels, bars after the left anchor bar up to
 * the right anchor bar), a volume column box is drawn per level, and when the accumulated volume passes 'Threshold %'
 * of the total volume the zone is set: an area box from the top (bottom) to that level, its average line and its
 * volume-weighted average line (dashed), all extended to the right. Once both zones are set, the equilibrium
 * (middle of the range) and the weighted equilibrium (dashed, mean of the two weighted averages) lines are drawn.
 *
 * Intrabar TF: the original reads the highs, lows and volumes of the bars of 'Intrabar TF' inside each chart bar
 * (request.security_lower_tf). The default '' (the chart timeframe), or the chart timeframe itself, gives one intrabar
 * per chart bar: the chart bars, ported exactly. A lower timeframe needs bars that the chart bars do not have: the
 * port throws an Error; a higher one is the error of the original.
 *
 * Chart values read: the chart timeframe (Intrabar TF check), from the chart context when given, else from the bar
 * spacing.
 *
 * Reference: "Supply and Demand Anchored [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  box, line, color, timeframe, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box, type Line,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface SupplyAndDemandAnchoredInputs {
  /** Threshold % */
  per: number;
  /** Resolution */
  div: number;
  /** Intrabar TF ('' = chart timeframe) */
  tf: string;
  showSupply: boolean;
  supplyCss: string;
  supplyArea: boolean;
  supplyAvg: boolean;
  supplyWavg: boolean;
  showEqui: boolean;
  equiCss: string;
  equiAvg: boolean;
  equiWavg: boolean;
  showDemand: boolean;
  demandCss: string;
  demandArea: boolean;
  demandAvg: boolean;
  demandWavg: boolean;
  /** Left anchor (time in ms; 0 = not set) */
  timeLeft: number;
  /** Right anchor (time in ms; 0 = not set) */
  timeRight: number;
}

export const defaultInputs: SupplyAndDemandAnchoredInputs = {
  per: 10,
  div: 50,
  tf: '',
  showSupply: true,
  supplyCss: '#2157f3',
  supplyArea: true,
  supplyAvg: true,
  supplyWavg: true,
  showEqui: true,
  equiCss: '#787B86',
  equiAvg: true,
  equiWavg: true,
  showDemand: true,
  demandCss: '#ff5d00',
  demandArea: true,
  demandAvg: true,
  demandWavg: true,
  timeLeft: 0,
  timeRight: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'per', type: 'float', title: 'Threshold %', defval: 10, min: 0, max: 100 },
  { id: 'div', type: 'int', title: 'Resolution', defval: 50, min: 2, max: 500 },
  { id: 'tf', type: 'timeframe', title: 'Intrabar TF', defval: '' },
  { id: 'showSupply', type: 'bool', title: 'Supply        ', defval: true, group: 'Style', inline: 'supply' },
  { id: 'supplyCss', type: 'color', title: '', defval: '#2157f3', group: 'Style', inline: 'supply' },
  { id: 'supplyArea', type: 'bool', title: 'Area', defval: true, group: 'Style', inline: 'supply' },
  { id: 'supplyAvg', type: 'bool', title: 'Average', defval: true, group: 'Style', inline: 'supply' },
  { id: 'supplyWavg', type: 'bool', title: 'Weighted', defval: true, group: 'Style', inline: 'supply' },
  { id: 'showEqui', type: 'bool', title: 'Equilibrium', defval: true, group: 'Style', inline: 'equi' },
  { id: 'equiCss', type: 'color', title: '', defval: '#787B86', group: 'Style', inline: 'equi' },
  { id: 'equiAvg', type: 'bool', title: 'Average', defval: true, group: 'Style', inline: 'equi' },
  { id: 'equiWavg', type: 'bool', title: 'Weighted', defval: true, group: 'Style', inline: 'equi' },
  { id: 'showDemand', type: 'bool', title: 'Demand    ', defval: true, group: 'Style', inline: 'demand' },
  { id: 'demandCss', type: 'color', title: '', defval: '#ff5d00', group: 'Style', inline: 'demand' },
  { id: 'demandArea', type: 'bool', title: 'Area', defval: true, group: 'Style', inline: 'demand' },
  { id: 'demandAvg', type: 'bool', title: 'Average', defval: true, group: 'Style', inline: 'demand' },
  { id: 'demandWavg', type: 'bool', title: 'Weighted', defval: true, group: 'Style', inline: 'demand' },
  { id: 'timeLeft', type: 'time', title: 'timeLeft', defval: 0, confirm: true },
  { id: 'timeRight', type: 'time', title: 'timeRight', defval: 0, confirm: true },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Supply and Demand Anchored [LuxAlgo]',
  shortTitle: 'LuxAlgo - Supply and Demand Anchored',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** UDT bin */
interface Bin {
  lvl: number;
  prev: number;
  sum: number;
  prev_sum: number;
  csum: number;
  avg: number;
  isreached: boolean;
}

/** UDT area */
interface Area {
  bx: Box;
  avg: Line;
  wavg: Line;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupplyAndDemandAnchoredInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines'> & { boxes: BoxData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { per, showSupply, supplyCss, supplyArea, supplyAvg, supplyWavg, showEqui, equiCss, equiAvg, equiWavg } = cfg;
  const { showDemand, demandCss, demandArea, demandAvg, demandWavg, timeLeft, timeRight } = cfg;
  const div = Math.trunc(cfg.div);
  const nBars = bars.length;

  // [h, l, v] = request.security_lower_tf(syminfo.tickerid, tf, [high, low, volume])
  const chartTf = chartTimeframe(bars, chart);
  if (cfg.tf.trim() !== '' && chartTf !== '') {
    const lower = timeframe.in_seconds(cfg.tf);
    const chartSeconds = timeframe.in_seconds(chartTf);
    if (lower > chartSeconds) {
      throw new Error(`The chart's timeframe must be greater or equal to the \`${cfg.tf}\` timeframe used with \`request.security_lower_tf()\`.`);
    }
    if (lower < chartSeconds) {
      throw new Error(`Supply and Demand Anchored: an 'Intrabar TF' below the chart timeframe needs the bars of that timeframe, which the chart bars do not have`);
    }
  }

  resetDrawings({ box: 500 });

  const setArea = (id: Area, n: number, x1: number, top: number, btm: number, avg: number, wavg: number,
    showArea: boolean, showAvg: boolean, showWavg: boolean) => {
    if (showArea) {
      box.set_lefttop(id.bx, x1, top);
      box.set_rightbottom(id.bx, n, btm);
    }
    if (showAvg) {
      line.set_xy1(id.avg, x1, avg);
      line.set_xy2(id.avg, n, avg);
    }
    if (showWavg) {
      line.set_xy1(id.wavg, x1, wavg);
      line.set_xy2(id.wavg, n, wavg);
    }
  };

  let max = 0;
  let min = 0;
  let x1 = 0;
  let csum = 0;
  let supplyArea_: Area | undefined;
  let demandArea_: Area | undefined;
  let equi: Line | undefined;
  let wequi: Line | undefined;
  let supplyWavgVal = NaN;
  let demandWavgVal = NaN;

  for (let n = 0; n < nBars; n++) {
    setDrawingBar(n, n === nBars - 1);
    const bar = bars[n];
    const time = bar.time * 1000;
    const volume = bar.volume ?? NaN;

    // Init on the left bar, else accumulate up to the right bar
    if (time === timeLeft) {
      max = bar.high;
      min = bar.low;
      csum = volume;
      x1 = n;
    } else if (time <= timeRight) {
      max = Math.max(bar.high, max);
      min = Math.min(bar.low, min);
      csum += volume;
    }

    // var area / var line: made on the first bar
    if (n === 0) {
      supplyArea_ = {
        bx: box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, 'right', undefined, String(color.new(supplyCss, 80))),
        avg: line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', supplyCss),
        wavg: line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', supplyCss, 'dashed'),
      };
      demandArea_ = {
        bx: box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, 'right', undefined, String(color.new(demandCss, 80))),
        avg: line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', demandCss),
        wavg: line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', demandCss, 'dashed'),
      };
      equi = line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', equiCss);
      wequi = line.new(NaN, NaN, NaN, NaN, 'bar_index', 'right', equiCss, 'dashed');
    }

    if (time === timeRight) {
      const r = (max - min) / div;
      const supply: Bin = { lvl: max, prev: max, sum: 0, prev_sum: 0, csum: 0, avg: 0, isreached: false };
      const demand: Bin = { lvl: min, prev: min, sum: 0, prev_sum: 0, csum: 0, avg: 0, isreached: false };

      for (let i = 0; i <= div - 1; i++) {
        supply.lvl -= r;
        demand.lvl += r;

        // Accumulated volume column
        if (!supply.isreached && showSupply && supplyArea) {
          box.new(x1, supply.prev, x1 + Math.trunc(supply.sum / csum * (n - x1)), supply.lvl, 'transparent',
            undefined, undefined, undefined, undefined, String(color.new(supplyCss, 50)));
        }
        if (!demand.isreached && showDemand && demandArea) {
          box.new(x1, demand.lvl, x1 + Math.trunc(demand.sum / csum * (n - x1)), demand.prev, 'transparent',
            undefined, undefined, undefined, undefined, String(color.new(demandCss, 50)));
        }

        // Loop through the bars (j bars back, from the right bar to the bar after the left bar); one intrabar each
        const jEnd = n - x1 - 1;
        if (jEnd < 0) {
          // the same bar for both anchors: `for j = 0 to -1` counts down and v[-1] stops the script (RE10008)
          throw new Error(`Error on bar ${n}: The script attempts to reference historical data that is too far from the current bar (-1 bars back). The history-referencing length for the expression must be a value between 0 and 5000.`);
        }
        for (let j = 0; j <= jEnd; j++) {
          const b = bars[n - j];
          const hk = b.high;
          const lk = b.low;
          const vk = b.volume ?? NaN;

          // Accumulate if within the upper interval
          supply.sum += gt(hk, supply.lvl) && lt(hk, supply.prev) ? vk : 0;
          supply.avg += supply.lvl * (supply.sum - supply.prev_sum);
          supply.csum += supply.sum - supply.prev_sum;
          supply.prev_sum = supply.sum;

          // Accumulate if within the lower interval
          demand.sum += lt(lk, demand.lvl) && gt(lk, demand.prev) ? vk : 0;
          demand.avg += demand.lvl * (demand.sum - demand.prev_sum);
          demand.csum += demand.sum - demand.prev_sum;
          demand.prev_sum = demand.sum;

          // Supply accumulated volume above the threshold: set the zone
          if (gt(supply.sum / csum * 100, per) && !supply.isreached) {
            const avg = (max + supply.lvl) / 2;
            supplyWavgVal = supply.avg / supply.csum;
            if (showSupply) {
              setArea(supplyArea_!, n, x1, max, supply.lvl, avg, supplyWavgVal, supplyArea, supplyAvg, supplyWavg);
            }
            supply.isreached = true;
          }

          // Demand accumulated volume above the threshold: set the zone
          if (gt(demand.sum / csum * 100, per) && !demand.isreached && showDemand) {
            const avg = (min + demand.lvl) / 2;
            demandWavgVal = demand.avg / demand.csum;
            setArea(demandArea_!, n, x1, demand.lvl, min, avg, demandWavgVal, demandArea, demandAvg, demandWavg);
            demand.isreached = true;
          }

          if (supply.isreached && demand.isreached) break;
        }

        if (supply.isreached && demand.isreached && showEqui) {
          // Equilibrium and weighted equilibrium
          if (equiAvg) {
            const avg = (max + min) / 2;
            line.set_xy1(equi!, x1, avg);
            line.set_xy2(equi!, n, avg);
          }
          if (equiWavg) {
            const wavg = (supplyWavgVal + demandWavgVal) / 2;
            line.set_xy1(wequi!, x1, wavg);
            line.set_xy2(wequi!, n, wavg);
          }
          break;
        }

        supply.prev = supply.lvl;
        demand.prev = demand.lvl;
      }
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (...v: number[]) => v.every((x) => !Number.isNaN(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // objects with an na coordinate are not drawn
    boxes: box.all().filter((b) => drawn(b.left, b.top, b.right, b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: String(b.bgcolor), borderColor: 'transparent', textColor: '#363A45', // v5 box text colour
      ...(b.extend === 'right' ? { extend: 'right' as const } : {}),
    })),
    lines: line.all().filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), extend: 'right' as const,
      ...(l.style === 'dashed' ? { style: 'dashed' as const } : {}),
    })),
  };
}

export const SupplyAndDemandAnchored = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
