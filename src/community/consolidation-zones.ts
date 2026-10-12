/**
 * Consolidation Zones - Live
 *
 * A zig zag of the bars whose high (low) is the highest (lowest) of the loopback period gives the pivot of the
 * current swing (its most extreme point). While the pivot stays the same, or moves inside the zone, the count of
 * consolidation bars grows; a pivot outside the zone resets it. When the count reaches the minimum length, the zone
 * is the highest high / lowest low of that length; while the count goes on, the zone takes the new highs and lows.
 *
 * Drawings: the zone top and bottom as invisible step plots with a fill (painted while the consolidation is longer
 * than the minimum length), and two dashed lines over the bars of the consolidation, replaced on every bar of it.
 *
 * Reference: "Consolidation Zones - Live" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import {
  ta, Series, line, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { LineDrawingData } from '../types';

export interface ConsolidationZonesInputs {
  period: number;
  consLen: number;
  paintcons: boolean;
  zonecol: string;
}

export const defaultInputs: ConsolidationZonesInputs = {
  period: 10,
  consLen: 5,
  paintcons: true,
  zonecol: 'rgba(33, 150, 243, 0.3)',
};

export const inputConfig: InputConfig[] = [
  { id: 'period', type: 'int', title: 'Loopback Period', defval: 10, min: 2, max: 50 },
  { id: 'consLen', type: 'int', title: 'Min Consolidation Length', defval: 5, min: 2, max: 20 },
  { id: 'paintcons', type: 'bool', title: 'Paint Consolidation Area ', defval: true },
  { id: 'zonecol', type: 'color', title: 'Zone Color', defval: 'rgba(33, 150, 243, 0.3)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: 'transparent', lineWidth: 1, style: 'stepline' },
  { id: 'plot1', title: 'Plot', color: 'transparent', lineWidth: 1, style: 'stepline' },
];

export const metadata = {
  title: 'Consolidation Zones - Live',
  shortTitle: 'Consolidation Zones - Live',
  overlay: true,
};

/** Pine `if x` on a float: true when x is neither na nor 0 */
const truthy = (x: number) => !Number.isNaN(x) && x !== 0;

export function calculate(
  bars: Bar[],
  inputs: Partial<ConsolidationZonesInputs> = {},
): Omit<IndicatorResult, 'markers'> & { lines: LineDrawingData[] } {
  const { period: prd, consLen: conslen, paintcons, zonecol } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);
  const hbArr = ta.highestbars(highSeries, prd).toArray();
  const lbArr = ta.lowestbars(lowSeries, prd).toArray();
  const hArr = ta.highest(highSeries, conslen).toArray();
  const lArr = ta.lowest(lowSeries, conslen).toArray();

  const dirArr: number[] = new Array(n).fill(0);
  const zzArr: number[] = new Array(n).fill(NaN);
  let dir = 0;
  let ppPrev = NaN;
  let conscnt = 0;
  let condhigh = NaN;
  let condlow = NaN;

  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: Array<{ time: number; value: number }> = [];
  const fillColors: string[] = [];

  resetDrawings(); // max_lines_count 50
  const upline = varDrawing<Line>(); // var line upline
  const dnline = varDrawing<Line>(); // var line dnline

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const hb = hbArr[i] === 0 ? bars[i].high : NaN;
    const lb = lbArr[i] === 0 ? bars[i].low : NaN;
    if (truthy(hb) && Number.isNaN(lb)) dir = 1;
    else if (truthy(lb) && Number.isNaN(hb)) dir = -1;
    dirArr[i] = dir;
    let zz: number;
    if (truthy(hb) && truthy(lb)) zz = dir === 1 ? hb : lb;
    else zz = truthy(hb) ? hb : truthy(lb) ? lb : NaN;
    zzArr[i] = zz;

    // the most extreme point of the bars of the current direction (at most 1,000 bars back)
    let pp = NaN;
    for (let x = 0; x <= 1000 && x <= i; x++) {
      if (dir !== dirArr[i - x]) break;
      const z = zzArr[i - x];
      if (truthy(z)) {
        if (Number.isNaN(pp)) pp = z;
        else {
          if (dirArr[i - x] === 1 && z > pp) pp = z;
          if (dirArr[i - x] === -1 && z < pp) pp = z;
        }
      }
    }

    // Pine `if change(pp)`: na (first pivot) and 0 are false
    if (truthy(pp - ppPrev)) {
      if (conscnt > 0 && pp <= condhigh && pp >= condlow) conscnt += 1;
      else conscnt = 0;
    } else {
      conscnt += 1;
    }
    ppPrev = pp;

    if (conscnt >= conslen) {
      if (conscnt === conslen) {
        condhigh = hArr[i];
        condlow = lArr[i];
      } else {
        if (upline.value) line.delete(upline.value);
        if (dnline.value) line.delete(dnline.value);
        condhigh = Math.max(condhigh, bars[i].high);
        condlow = Math.min(condlow, bars[i].low);
      }
      upline.value = line.new(i, condhigh, i - conscnt, condhigh, 'bar_index', 'none', '#FF5252', 'dashed');
      dnline.value = line.new(i, condlow, i - conscnt, condlow, 'bar_index', 'none', '#00E676', 'dashed');
    }

    plot0.push({ time: bars[i].time, value: condhigh });
    plot1.push({ time: bars[i].time, value: condlow });
    fillColors.push(paintcons && conscnt > conslen ? zonecol : 'transparent');
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { color: zonecol }, colors: fillColors }],
    lines: drawingOutputs(bars).lines ?? [],
  };
}

export const ConsolidationZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
