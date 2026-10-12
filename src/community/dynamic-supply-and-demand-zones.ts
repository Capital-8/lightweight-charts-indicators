/**
 * Dynamic Supply and Demand Zones
 *
 * A volume profile of the bars since the last major pivot (pivot high or low over `plen` bars on each side; or a
 * fixed look-back): the range from the lowest low to the highest high is cut into `res` bins and each bin sums the
 * volume of the bars that touch it. A bin with clearly less volume than both neighbours (below `tolerance` times
 * each) is a zone: a box from the start of the look-back to the last bar, with a label of its volume deficit in
 * percent. The profile is drawn to the right of the last bar, a box shows the look-back range, and the zone and
 * profile boxes turn green below the close and red above it. Dots mark the pivots (drawn `plen` bars back).
 *
 * All the boxes and labels are drawn again on every bar: the output is the set of the last bar.
 * `chart.fg_color` / `chart.bg_color` come from the chart context (`foregroundColor` / `backgroundColor`), with the
 * dark theme colours without a context.
 *
 * Reference: "Dynamic Supply and Demand Zones [AlgoAlpha]" by AlgoAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © AlgoAlpha
 */

import {
  ta, Series, color, str, math, box, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import type { ChartContext } from '../chart-context';
import { backgroundColorOf, foregroundColorOf } from '../chart-context';

export interface DynamicSupplyAndDemandZonesInputs {
  dynamic: boolean;
  len: number;
  plen: number;
  res: number;
  scale: number;
  tolerance: number;
  /** Show Profile */
  h: boolean;
  /** Show Background Box */
  h1: boolean;
  neut: string;
  green: string;
  red: string;
}

export const defaultInputs: DynamicSupplyAndDemandZonesInputs = {
  dynamic: true,
  len: 100,
  plen: 200,
  res: 40,
  scale: 33,
  tolerance: 0.93,
  h: true,
  h1: true,
  neut: '#787B86',
  green: '#00ffbb',
  red: '#ff1100',
};

const G_MAIN = 'Main Calculation';
const G_APP = 'Appearance';

export const inputConfig: InputConfig[] = [
  {
    id: 'dynamic', type: 'bool', title: 'Use Dynamic Look-Back', defval: true, group: G_MAIN,
    tooltip: 'If true, the indicator adjusts its lookback such that it considers data from the previous major pivot point to present',
  },
  {
    id: 'len', type: 'int', title: 'Look-back (For Non-Dynamic Look-Back)', defval: 100, group: G_MAIN,
    tooltip: 'If Dynamic Look-Back is disabled, the indicator will use this fixed look-back instead',
  },
  {
    id: 'plen', type: 'int', title: 'Pivot Point Detection Period', defval: 200, group: G_MAIN,
    tooltip: 'The look-back period of pivot points detection, pivots are detected with delay(depending on user imput, 100 by default)',
  },
  { id: 'res', type: 'int', title: 'Resolution', defval: 40, group: G_MAIN, tooltip: 'The profile resolution' },
  {
    id: 'scale', type: 'int', title: 'Profile Horizontal Width', defval: 33, min: 1, max: 100, group: G_MAIN,
    tooltip: 'The Horizontal Width of the profile, a smaller value will make the profile thinner',
  },
  {
    id: 'tolerance', type: 'float', title: 'Zone Tolerance', defval: 0.93, min: 0.01, max: 1, group: G_MAIN,
    tooltip: 'The tolerance for zone detection, the lower the value the less zones will be marked',
  },
  { id: 'h', type: 'bool', title: 'Show Profile', defval: true, group: G_APP },
  { id: 'h1', type: 'bool', title: 'Show Background Box', defval: true, group: G_APP },
  { id: 'neut', type: 'color', title: 'Levels Color', defval: '#787B86', group: G_APP },
  { id: 'green', type: 'color', title: 'Bullish Color', defval: '#00ffbb', group: G_APP },
  { id: 'red', type: 'color', title: 'Bearish Color', defval: '#ff1100', group: G_APP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Dynamic Supply and Demand Zones [AlgoAlpha]',
  shortTitle: 'AlgoAlpha - 📦Dynamic Supply/Demand',
  overlay: true,
};

/** Pine float comparisons within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

const GRAY = '#787B86';
const BLUE = '#2962FF';
// color.black of Pine version 5
const BLACK = '#363A45';

export function calculate(
  bars: Bar[],
  inputs: Partial<DynamicSupplyAndDemandZonesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { plen, res } = cfg;
  const fg = foregroundColorOf(chart);
  const bg = backgroundColorOf(chart);
  resetDrawings({ box: 500 });

  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ph = A(ta.pivothigh(Series.fromArray(bars, bars.map((b) => b.high)), plen, plen));
  const pl = A(ta.pivotlow(Series.fromArray(bars, bars.map((b) => b.low)), plen, plen));

  // plotchar(ph != 0 ? true : false, "Pivot Highs", "●", location.abovebar, chart.fg_color, offset = -plen):
  // na != 0 is false, so a dot on the pivot bar
  const markers: MarkerData[] = [];
  let pivotindex = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isNaN(ph[i]) || !Number.isNaN(pl[i])) pivotindex = i - plen;
    if (i - plen < 0) continue;
    const time = bars[i - plen].time;
    if (!Number.isNaN(ph[i]) && ph[i] !== 0) {
      markers.push({ time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '●', textColor: fg, size: 'tiny' });
    }
    if (!Number.isNaN(pl[i]) && pl[i] !== 0) {
      markers.push({ time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '●', textColor: fg, size: 'tiny' });
    }
  }

  const empty = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
  };
  if (n === 0) return empty;

  // The drawings of the last bar (every bar deletes the objects of the bar before and draws them again)
  const bi = n - 1;
  setDrawingBar(bi, true);
  const len1 = cfg.dynamic ? bi - pivotindex : cfg.len;
  const highs: number[] = [];
  const lows: number[] = [];
  const volumes: number[] = [];
  // for i = 0 to bar_index - (bar_index - len1): x[i] before the first bar is na
  const count = bi - (bi - len1);
  for (let i = 0; count >= 0 ? i <= count : i >= count; count >= 0 ? i++ : i--) {
    const b = bi - i >= 0 && bi - i <= bi ? bars[bi - i] : undefined;
    highs.push(b ? b.high : NaN);
    lows.push(b ? b.low : NaN);
    volumes.push(b ? (b.volume ?? NaN) : NaN);
  }
  // array.max / array.min skip na values
  const finite = (a: number[]) => a.filter((v) => !Number.isNaN(v));
  const maxx = Math.max(...finite(highs));
  const minn = Math.min(...finite(lows));
  const size = highs.length;

  // array.new_float(res) then insert(i, ...): the first res elements are the values, then res na elements
  const top: number[] = [];
  const bottom: number[] = [];
  const binlen: number[] = [];
  if (size > 0) {
    const step = (maxx - minn) / res;
    for (let i = 0; i <= res - 1; i++) {
      let binSize = 0.0;
      const lo = minn + i * step;
      const hi = minn + (i + 1) * step;
      bottom.push(lo);
      top.push(hi);
      for (let j = 0; j <= size - 1; j++) {
        const above = gt(lows[j], hi);
        const below = lt(highs[j], lo);
        binSize += !(above || below) ? volumes[j] : 0;
      }
      binlen.push(binSize);
    }
  }
  const binMax = Math.max(...finite(binlen));

  const boxes: Array<Box | null> = [];
  const close = bars[bi].close;
  for (let i = 0; i <= res - 1; i++) {
    const b = binlen[i] ?? NaN;
    const next = i + 1 < binlen.length ? binlen[i + 1] : NaN;
    const prev = i - 1 >= 0 ? binlen[i - 1] : NaN;
    const iskey = (i === res - 1 ? true : lt(b, next * cfg.tolerance)) && (i === 0 ? true : lt(b, prev * cfg.tolerance));
    if (iskey) {
      const left = bi - len1;
      boxes.push(box.new(left, top[i] ?? NaN, bi, bottom[i] ?? NaN, String(color.new(cfg.neut, 70)), 1, 'solid', 'none',
        'bar_index', String(color.new(cfg.neut, 80))));
      label.new(left, ((top[i] ?? NaN) + (bottom[i] ?? NaN)) / 2, str.tostring((1 - b / binMax) * 100, 'percent'),
        'bar_index', 'price', fg, 'label_right', bg);
    }
  }

  for (let i = 0; i <= res - 1; i++) {
    const right = bi + 7 + cfg.scale;
    // box_left = box_right - math.round(bin) / math.round(max) * scale is a fractional bar index; given to the int
    // parameter of box.new it is truncated (measured: the reference box of 5537.94 starts on bar 5537)
    const left = Math.trunc(right - (math.round(binlen[i] ?? NaN) / math.round(binMax)) * cfg.scale);
    boxes.push(cfg.h
      ? box.new(left, top[i] ?? NaN, right, bottom[i] ?? NaN, BLACK, 1, 'solid', 'none', 'bar_index', GRAY)
      : null);
  }

  if (cfg.h1) {
    box.new(bi - len1, Math.max(...finite(top)), bi, Math.min(...finite(bottom)), String(color.new(BLUE, 70)), 1, 'solid',
      'none', 'bar_index', String(color.new(BLUE, 90)), 'Total Look-Back Data', 'tiny', GRAY, 'center', 'top');
  }

  if (boxes.length > 0) {
    for (let ln = boxes.length - 1; ln >= 0; ln--) {
      const cL = boxes[ln];
      if (!cL) continue;
      const yL = box.get_top(cL);
      const yLa = box.get_bottom(cL);
      if (gt(close, yL)) {
        box.set_border_color(cL, String(color.new(cfg.green, 50)));
        box.set_bgcolor(cL, String(color.new(cfg.green, 50)));
      } else if (lt(close, yLa)) {
        box.set_border_color(cL, String(color.new(cfg.red, 50)));
        box.set_bgcolor(cL, String(color.new(cfg.red, 50)));
      }
    }
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, bars[0].time >= 1e12 ? 'ms' : 's');
  return { ...empty, boxes: out.boxes ?? [], labels: out.labels ?? [] };
}

export const DynamicSupplyAndDemandZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
