/**
 * Open Liquidity Heatmap
 *
 * On the last bar only. The range from the lowest low (minus the leverage %) to the highest high (plus the leverage
 * %) of the last `back` bars is cut into `step` levels, each a line from `back` bars ago to the last bar. Over the
 * last `back` + 1 bars:
 * - the volume of a bar goes to each level whose band the bar covers (volume profile)
 * - the "liquidation" price of a bar (low minus the leverage %, high plus the leverage %) beyond the extremes met
 *   so far adds the bar volume to the level band that holds it (liquidation heatmap); a level outside these
 *   extremes starts at that bar
 * Each level line takes a gradient colour from transparent to green (above the close) or red (below the close) by
 * its liquidation volume. Boxes to the right of the last bar show the liquidation profile, boxes to the left of the
 * range show the volume profile (gradient from the chart background colour). A POC line and label mark the level
 * with the most liquidation volume, and two vertical polylines mark the range.
 *
 * `chart.bg_color` / `chart.fg_color` come from the chart context (`backgroundColor` / `foregroundColor`), with the
 * dark theme colours without a context.
 *
 * Reference: "Open Liquidity Heatmap [Bigbeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Bigbeluga
 */

import {
  ta, Series, color, str, math, line, box, label, polyline, chartPoint, resetDrawings, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { ChartContext } from '../chart-context';
import { backgroundColorOf, foregroundColorOf } from '../chart-context';

export interface OpenLiquidityHeatmapInputs {
  /** Lookback */
  back: number;
  /** Leverage (%) */
  lvgr: number;
  /** Levels */
  step: number;
  offs: 'Auto' | 'Manual';
  /** Manual offset */
  ofle: number;
  disP: boolean;
  pocC: string;
  pocW: number;
  disV: boolean;
  vpC: string;
  VPL: boolean;
  VPUP: string;
  VPDN: string;
  disR: boolean;
  disL: boolean;
}

export const defaultInputs: OpenLiquidityHeatmapInputs = {
  back: 200,
  lvgr: 4.5,
  step: 250,
  offs: 'Auto',
  ofle: 100,
  disP: true,
  pocC: '#13dffa',
  pocW: 4,
  disV: true,
  vpC: '#434651',
  VPL: true,
  VPUP: '#006446',
  VPDN: '#801922',
  disR: true,
  disL: true,
};

const GS = 'Settings';
const GD = 'Display';

export const inputConfig: InputConfig[] = [
  { id: 'back', type: 'int', title: 'Lookback', defval: 200, min: 50, max: 500, step: 1, tooltip: 'Range period lookback for the liquidity calculation', inline: '1', group: GS },
  { id: 'lvgr', type: 'float', title: 'Leverage', defval: 4.5, min: 0.1, max: 20, step: 0.01, tooltip: 'Leverage (counts as distance from price) for the liquidation', inline: '2', group: GS },
  { id: 'step', type: 'int', title: 'Levels    ', defval: 250, min: 50, max: 250, step: 1, tooltip: 'Amount of total levels', inline: '3', group: GS },
  {
    id: 'offs', type: 'string', title: 'Offset    ', defval: 'Auto', options: ['Auto', 'Manual'],
    tooltip: '[Auto] Automatic Offset via lookback period\n[Manual] Offset by input', inline: 'o', group: GS,
  },
  { id: 'ofle', type: 'int', title: '', defval: 100, min: 10, inline: 'o', group: GS },
  { id: 'disP', type: 'bool', title: 'POC                ', defval: true, tooltip: 'Display POC Liquidation\n[INPUT] Width of the POC line', inline: '5', group: GD },
  { id: 'pocC', type: 'color', title: '', defval: '#13dffa', inline: '5', group: GD },
  { id: 'pocW', type: 'int', title: '', defval: 4, inline: '5', group: GD },
  { id: 'disV', type: 'bool', title: 'VP                 ', defval: true, tooltip: 'Display Volume Profile', inline: '6', group: GD },
  { id: 'vpC', type: 'color', title: '', defval: '#434651', inline: '6', group: GD },
  { id: 'VPL', type: 'bool', title: 'VP LIQ', defval: true, tooltip: 'Display Liquidation Volume Profile', inline: '7', group: GD },
  { id: 'VPUP', type: 'color', title: '', defval: '#006446', inline: '7', group: GD },
  { id: 'VPDN', type: 'color', title: '', defval: '#801922', inline: '7', group: GD },
  { id: 'disR', type: 'bool', title: 'Display Resting Liquidity', defval: true, tooltip: 'Display Resting liquidity on the chart', inline: '8', group: GD },
  { id: 'disL', type: 'bool', title: 'Display Vertical Line', defval: true, tooltip: 'Display Max range calculation', inline: '9', group: GD },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Open Liquidity Heatmap [Bigbeluga]',
  shortTitle: 'Open Liquidity Heatmap [1.5]',
  overlay: true,
};

/** Pine float comparisons within 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && a - b <= EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && b - a <= EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** Default label text colour of Pine version 5 */
const LABEL_TEXT = '#363A45';

export function calculate(
  bars: Bar[],
  inputs: Partial<OpenLiquidityHeatmapInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  resetDrawings({ line: 500, box: 500, label: 500, polyline: 100 });
  const empty: IndicatorResult = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (n === 0) return empty;

  const ms = bars[0].time >= 1e12;
  const back = cfg.back;
  const step = cfg.step;
  const lvgr = cfg.lvgr / 100;
  const last = n - 1;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const hs = A(ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), back))[last] * (1 + lvgr);
  const ls = A(ta.lowest(Series.fromArray(bars, bars.map((b) => b.low)), back))[last] * (1 - lvgr);
  const diff = (hs - ls) / step;

  // history of the last bar: x[k] (na before the first bar); time in ms as in Pine
  const at = (k: number) => (k >= 0 && k <= last ? bars[last - k] : undefined);
  const time = (k: number) => {
    const b = at(k);
    return b ? (ms ? b.time : b.time * 1000) : NaN;
  };
  const high = (k: number) => at(k)?.high ?? NaN;
  const low = (k: number) => at(k)?.low ?? NaN;
  const volume = (k: number) => at(k)?.volume ?? NaN;
  const close = bars[last].close;
  const barMs = time(0) - time(1);

  // var store cls = store.new(array.new<line>(step), array.new<float>(step, 0.), map.new<float, float>(), high, low, hs)
  const hm: number[] = new Array(step).fill(0);
  const vp = new Map<number, number>();
  let lH = high(0);
  let lL = low(0);

  if (cfg.disL) {
    // cp.unshift(...) twice: the points are (time[back], ls), (time[back], hs + diff)
    polyline.new([chartPoint.from_time(time(back), ls), chartPoint.from_time(time(back), hs + diff)], false, false,
      'bar_time', '#FFFFFF', null, 'solid', 1, true);
    polyline.new([chartPoint.from_time(time(0), ls), chartPoint.from_time(time(0), hs + diff)], false, false,
      'bar_time', String(color.new(foregroundColorOf(chart), 50)), null, 'dotted', 1, true);
  }

  const grid: Line[] = [];
  for (let i = 0; i < step; i++) {
    const plotter = i === 0 ? hs : hs - diff * i;
    grid.push(line.new(time(back), plotter, time(0), plotter, 'bar_time', 'none', 'transparent', 'solid', 4));
    vp.set(plotter, 0);
  }

  const y2 = (l: Line) => line.get_y2(l);
  for (let i = 0; i <= back; i++) {
    for (let x = 0; x <= grid.length - 2; x++) {
      const current = grid[x];
      const next = grid[x + 1];
      const lP = low(i) * (1 - lvgr);
      const hP = high(i) * (1 + lvgr);
      const cL = y2(current);
      const nL = y2(next);

      if (le(low(i), cL) && ge(high(i), nL)) vp.set(cL, (vp.get(cL) ?? NaN) + volume(i));
      if (lt(cL, lL)) line.set_x1(current, time(i));
      if (gt(cL, lH)) line.set_x1(current, time(i));
      if (lt(lP, lL)) {
        if (lt(low(i), lL)) lL = low(i);
        if (ge(lP, nL) && le(lP, cL)) hm[x] += volume(i);
      }
      if (gt(hP, lH)) {
        if (gt(high(i), lH)) lH = high(i);
        if (ge(hP, nL) && le(hP, cL)) hm[x] += volume(i);
      }
    }
  }

  const heat = hm;
  const volt = [...vp.values()];
  const heatMax = Math.max(...heat);
  const heatMin = Math.min(...heat);
  const voltMax = Math.max(...volt);
  const voltMin = Math.min(...volt);
  const span = cfg.offs === 'Auto' ? back / 2 : cfg.ofle;
  const bg = backgroundColorOf(chart);
  let pocL = NaN;
  for (let i = 0; i <= grid.length - 2; i++) {
    const ln = grid[i];
    const lx = grid[i + 1];
    const ancor = math.round((span * heat[i]) / heatMax);
    const bC = color.from_gradient(heat[i], heatMin, heatMax, '#ffffff00', gt(close, y2(ln)) ? cfg.VPUP : cfg.VPDN);
    const gC = color.from_gradient(heat[i], heatMin, heatMax, '#ffffff00', lt(close, y2(ln)) ? cfg.VPDN : cfg.VPUP);
    const vC = color.from_gradient(volt[i], voltMin, voltMax, bg, cfg.vpC);
    pocL = eq(heat[i], heatMax) ? ancor : pocL;

    if (cfg.disR) line.set_color(ln, gC);
    if (cfg.VPL) {
      box.new(time(0), y2(lx) + diff + diff / 2, time(0) + barMs * ancor, y2(lx) + diff / 2, bC, 1, 'solid', 'none',
        'bar_time', bC);
    }
    if (cfg.disV) {
      const vpcim = math.round((span * volt[i]) / voltMax);
      box.new(time(back + vpcim), y2(ln), time(back), y2(lx), vC, 1, 'solid', 'none', 'bar_time', vC);
    }
  }

  if (cfg.disP) {
    // heat.indexof(heat.max()): the first element equal to the maximum
    const k = heat.findIndex((v) => eq(v, heatMax));
    const avg = (y2(grid[k]) + y2(grid[k + 1])) / 2;
    const xPoc = time(0) + barMs * pocL;
    line.new(time(back), avg + diff / 2, xPoc, avg + diff / 2, 'bar_time', 'none', cfg.pocC, 'solid', cfg.pocW, true);
    label.new(xPoc, avg + diff / 2, 'POC | ' + str.tostring(math.round(avg, 2)), 'bar_time', 'price', '#ffffff00',
      'label_left', cfg.pocC, 'normal');
    label.new(xPoc, avg + diff / 2, '', 'bar_time', 'price', cfg.pocC, 'circle', LABEL_TEXT, 'tiny', undefined,
      undefined, undefined, true);
  }

  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  return {
    ...empty,
    lines: out.lines ?? [],
    boxes: out.boxes ?? [],
    labels: out.labels ?? [],
    polylines: out.polylines ?? [],
  };
}

export const OpenLiquidityHeatmap = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
