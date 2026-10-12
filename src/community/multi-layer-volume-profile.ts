/**
 * Multi-Layer Volume Profile [BigBeluga]
 *
 * Four volume profiles drawn on the last bar, over the last "Period" bars and over a half, a quarter and an eighth of
 * it (each one can be switched off). The high-low range of the profile bars is cut into "Resolution" rows; a bar adds
 * its volume to every row whose range, widened by 1.5 rows on each side, contains its close. The profile is a filled
 * polyline at the start of the period, as wide as 25 bars for the largest row. The largest row (the point of control)
 * gets a thick line, half the period long (the whole period for the last profile), and a label with its volume. Each
 * profile also has lines at the high and the low of the range (solid for the first profile, dashed for the others),
 * a vertical line at its start, a label with the total volume and a label with the delta volume (volume of the bars
 * that closed above their open minus the others).
 *
 * Chart values (third argument): the chart foreground colour (range lines; #DBDBDB without it).
 *
 * Reference: "Multi-Layer Volume Profile [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import {
  array, str, color, line, label, polyline, chartPoint, resetDrawings, setDrawingBar, drawingOutputs,
  type ChartPoint, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, PolylineData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

export interface MultiLayerVolumeProfileInputs {
  /** Period */
  len: number;
  /** Resolution (rows) */
  bins: number;
  prfCol: string;
  pocCol: string;
  deltaCol1: string;
  deltaCol2: string;
  profile1: boolean;
  profile2: boolean;
  profile3: boolean;
  profile4: boolean;
}

export const defaultInputs: MultiLayerVolumeProfileInputs = {
  len: 300,
  bins: 100,
  prfCol: 'rgba(0, 187, 212, 0.4)',
  pocCol: '#2962ff',
  deltaCol1: '#00BCD4',
  deltaCol2: '#F23645',
  profile1: true,
  profile2: true,
  profile3: true,
  profile4: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Period', defval: 300 },
  { id: 'bins', type: 'int', title: 'Resolution', defval: 100 },
  { id: 'prfCol', type: 'color', title: 'Profile', defval: 'rgba(0, 187, 212, 0.4)' },
  { id: 'pocCol', type: 'color', title: 'PoC', defval: '#2962ff' },
  { id: 'deltaCol1', type: 'color', title: 'Delta+', defval: '#00BCD4', inline: '1' },
  { id: 'deltaCol2', type: 'color', title: 'Delta-', defval: '#F23645', inline: '1' },
  { id: 'profile1', type: 'bool', title: 'VP1', defval: true, inline: 'vp' },
  { id: 'profile2', type: 'bool', title: 'VP2', defval: true, inline: 'vp' },
  { id: 'profile3', type: 'bool', title: 'VP3', defval: true, inline: 'vp' },
  { id: 'profile4', type: 'bool', title: 'VP4', defval: true, inline: 'vp' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Multi-Layer Volume Profile [BigBeluga]',
  shortTitle: 'Multi-Layer Volume Profile [BigBeluga]',
  overlay: true,
};

/** Pine float comparisons: a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const le = (a: number, b: number) => b - a >= -EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MultiLayerVolumeProfileInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fg = foregroundColorOf(chart);
  const bins = cfg.bins;

  // indicator(max_boxes_count = 500, max_lines_count = 500); polylines: default 50
  resetDrawings({ line: 500, box: 500 });

  // Everything happens on the last bar (barstate.islast)
  const profile = (length: number, pocMult: number, solid: boolean) => {
    const last = n - 1;
    setDrawingBar(last, true);
    const at = (i: number) => (last - i >= 0 ? bars[last - i] : undefined);

    let maxVal = -Infinity;
    let minVal = Infinity;
    for (let i = 0; i <= length - 1; i++) {
      const b = at(i);
      if (!b) continue; // high[i] / low[i] before the first bar are na; array.max / min skip them
      maxVal = Math.max(maxVal, b.high, b.low);
      minVal = Math.min(minVal, b.high, b.low);
    }
    if (maxVal === -Infinity) {
      maxVal = NaN;
      minVal = NaN;
    }
    const step = (maxVal - minVal) / bins;

    const volBins: number[] = new Array(bins).fill(0);
    const totVol: number[] = [];
    const deltaVol: number[] = [];
    for (let i = 0; i <= length - 1; i++) {
      const b = at(i);
      const c = b ? b.close : NaN;
      const o = b ? b.open : NaN;
      const vol = b ? (b.volume ?? NaN) : NaN;
      totVol.push(vol);
      deltaVol.push(gt(c, o) ? vol : -vol);
      for (let j = 0; j <= bins - 1; j++) {
        const lower = minVal + step * j;
        const upper = lower + step;
        if (le(c, upper + step * 1.5) && ge(c, lower - step * 1.5)) volBins[j] = volBins[j] + vol;
      }
    }
    const sum = (a: number[]) => array.sum(a);
    const binMax = array.max(volBins);

    const poly: ChartPoint[] = [];
    let check = false;
    for (let i = 0; i <= bins - 1; i++) {
      const lower = minVal + step * i;
      const upper = lower + step;
      const mid = (upper + lower) / 2;
      const vol = Math.trunc(volBins[i] / binMax * 25);
      const start = last - length;
      const end = start + vol;
      poly.push(chartPoint.from_index(i === 0 ? start : i === bins - 1 ? start : end + 1, mid));
      if (eq(volBins[i], binMax) && !check) {
        check = true;
        label.new(start, mid, str.tostring(volBins[i], 'volume'), 'bar_index', 'price', String(color.new(cfg.pocCol, 25)),
          'label_right', '#ffffff', undefined, undefined, undefined, undefined, true);
        line.new(start, mid, start + Math.trunc(length / pocMult), mid, 'bar_index', undefined, cfg.pocCol, undefined, 3, true);
        const style = solid ? 'solid' : 'dashed';
        line.new(start, maxVal, last, maxVal, 'bar_index', undefined, fg, style);
        line.new(start, minVal, last, minVal, 'bar_index', undefined, fg, style);
        line.new(start, maxVal, start, minVal, 'bar_index', undefined, fg, 'solid');
        line.new(start, maxVal, start, minVal, 'bar_index', undefined, fg, 'solid');
        label.new(start, maxVal, `Total\n${str.tostring(sum(totVol), 'volume')}`, 'bar_index', 'price', '#2962ff',
          'label_down', '#ffffff', 'small', undefined, 'Total Volume over VolumeProfile period', 'monospace');
        const delta = sum(deltaVol);
        label.new(start, minVal, `${str.tostring(delta, 'volume')}\nDelta`, 'bar_index', 'price',
          delta < -EPS ? cfg.deltaCol2 : cfg.deltaCol1, 'label_up', '#ffffff', 'small', undefined,
          'Delta Volume over VolumeProfile period', 'monospace');
      }
    }
    // polyline.delete(polyline.new(...)[1]): the call of the bar before did not run, nothing is deleted
    polyline.new(poly, false, false, 'bar_index', '#00e67700', cfg.prfCol);
  };

  if (n > 0) {
    if (cfg.profile1) profile(cfg.len, 2, true);
    if (cfg.profile2) profile(Math.trunc(cfg.len / 2), 2, false);
    if (cfg.profile3) profile(Math.trunc(cfg.len / 4), 2, false);
    if (cfg.profile4) profile(Math.trunc(cfg.len / 8), 1, false);
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, n > 0 && bars[0].time >= 1e12 ? 'ms' : 's');
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    polylines: out.polylines ?? [],
  };
}

export const MultiLayerVolumeProfile = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
