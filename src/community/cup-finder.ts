/**
 * Cup Finder
 *
 * Looks for cup shapes: a half circle of prices between an earlier extreme and the current bar.
 * - Bullish cup: the current bar breaks above a high that is 20 to `Number of Bars to search` bars back, that high was
 *   the highest of its last 30 bars, no bar in between was higher, and the previous close was still below it.
 *   Bearish cup: the mirror with lows (only searched when no bullish cup starts on the bar).
 * - The cup is a half circle from that bar to the current bar. Its height unit is 1 % of the range (highest high -
 *   lowest low) of the last 292 bars, so the circle keeps the same look on any price scale.
 * - The cup is kept when enough bars touch the band around the half circle (`Channel Width of the Cup` units on
 *   each side): at least `Contained Bar Rate %` of the bars.
 * - Drawings: the half circle (lines of width 3), a dashed line between its two ends, the optional channel lines, and
 *   a label with the radius and the rate of contained bars.
 *
 * At most 500 lines and 50 labels are kept (the oldest are removed).
 *
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Cup Found', 'Bearish Cup Found' and 'Cup Found' (either),
 * true on the bars where a cup is kept; the messages read the hidden "included" plot.
 *
 * Chart values (third argument): the port reads the symbol tick (the radius in the label is rounded to the tick;
 * without it: 0.01).
 *
 * Reference: "Cup Finder" by LonesomeTheBlue
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LonesomeTheBlue
 */

import { ta, str, math, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface CupFinderInputs {
  /** Number of bars to search */
  loopback: number;
  /** Channel width of the cup */
  widthr: number;
  /** Source for the breakout */
  checkHc: 'Close' | 'High/Low';
  /** Contained bar rate % */
  includeRate: number;
  showChannel: boolean;
  noLabel: boolean;
  removeOldLines: boolean;
  removeOldLabels: boolean;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: CupFinderInputs = {
  loopback: 150,
  widthr: 5,
  checkHc: 'Close',
  includeRate: 75,
  showChannel: false,
  noLabel: false,
  removeOldLines: false,
  removeOldLabels: false,
  bullColor: '#00E676',
  bearColor: '#FF5252',
};

export const inputConfig: InputConfig[] = [
  { id: 'loopback', type: 'int', title: 'Number of Bars to search', defval: 150, min: 30, max: 250 },
  { id: 'widthr', type: 'float', title: 'Channel Width of the Cup', defval: 5, min: 1 },
  { id: 'checkHc', type: 'string', title: 'Source for Breakout', defval: 'Close', options: ['Close', 'High/Low'] },
  { id: 'includeRate', type: 'float', title: 'Contained Bar Rate %', defval: 75, min: 10, max: 100 },
  { id: 'showChannel', type: 'bool', title: 'Show Channels of Cups', defval: false },
  { id: 'noLabel', type: 'bool', title: "Don't Show Labels", defval: false },
  { id: 'removeOldLines', type: 'bool', title: 'Remove Old Lines', defval: false },
  { id: 'removeOldLabels', type: 'bool', title: 'Remove Old Labels', defval: false },
  { id: 'bullColor', type: 'color', title: 'Colors', defval: '#00E676', inline: 'colors' },
  { id: 'bearColor', type: 'color', title: '', defval: '#FF5252', inline: 'colors' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'included', color: '#2196F3', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Cup Finder',
  shortTitle: 'CF',
  overlay: true,
};

/** study(max_lines_count = 500); labels: the default limit */
const MAX_LINES = 500;
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Ln { x1: number; y1: number; x2: number; y2: number; color: string; dashed: boolean; width: number; deleted: boolean }
interface Lb { x: number; y: number; text: string; bull: boolean; deleted: boolean }

export function calculate(
  bars: Bar[],
  inputs: Partial<CupFinderInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const loopback = Math.trunc(cfg.loopback);
  const includeRate = cfg.includeRate / 100;
  const mintick = mintickOf(chart);
  const byClose = cfg.checkHc === 'Close';

  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const hi292 = A(ta.highest(highS, 292));
  const lo292 = A(ta.lowest(lowS, 292));
  // highestbars(30) == 0, lowestbars(30) == 0
  const highestBar = A(ta.highestbars(highS, 30)).map((v) => v === 0);
  const lowestBar = A(ta.lowestbars(lowS, 30)).map((v) => v === 0);

  // Live drawings in creation order: above max + 5 objects the oldest are deleted until max remain. The label held
  // by the `var` variable is not deleted by this limit, but it counts.
  const liveLines: Ln[] = [];
  const liveLabels: Lb[] = [];
  let cupLabel: Lb | null = null;
  const newLine = (x1: number, y1: number, x2: number, y2: number, color: string, dashed: boolean, width: number): Ln => {
    const o: Ln = { x1, y1, x2, y2, color, dashed, width, deleted: false };
    liveLines.push(o);
    if (liveLines.length > MAX_LINES + 5) for (const old of liveLines.splice(0, liveLines.length - MAX_LINES)) old.deleted = true;
    return o;
  };
  const cupLines: Ln[] = []; // var cup_lines

  const included: number[] = new Array(n).fill(NaN);
  const bullishCup: boolean[] = new Array(n).fill(false);
  const bearishCup: boolean[] = new Array(n).fill(false);

  for (let i = 0; i < n; i++) {
    const { high, low, close } = bars[i];
    const H = (x: number) => (i - x >= 0 ? bars[i - x].high : NaN);
    const L = (x: number) => (i - x >= 0 ? bars[i - x].low : NaN);
    const prevClose = i > 0 ? bars[i - 1].close : NaN;

    // Unit of the circle height
    const width = (hi292[i] - lo292[i]) / 100;
    const uwidth = width * cfg.widthr;
    const bullSrc = byClose ? close : high;
    const bearSrc = byClose ? close : low;

    let hh = 0;
    let lasthh = 0;
    let ind = 0;
    let bull = false;
    for (let x = 1; x <= loopback; x++) {
      // max() with an na value is na
      const hx = H(x);
      lasthh = isNaN(lasthh) || isNaN(hx) ? NaN : Math.max(lasthh, hx);
      if (le(bullSrc, lasthh)) break;
      if (x >= 20 && gt(bullSrc, hx) && lt(prevClose, hx) && ge(hx, lasthh) && highestBar[i - x]) {
        hh = hx;
        ind = x;
        bull = true;
      }
    }

    let ll = 0;
    let lastll = hi292[i];
    if (ind === 0) {
      for (let x = 1; x <= loopback; x++) {
        const lx = L(x);
        lastll = isNaN(lastll) || isNaN(lx) ? NaN : Math.min(lastll, lx);
        if (ge(bearSrc, lastll)) break;
        if (x >= 20 && lt(bearSrc, lx) && gt(prevClose, lx) && le(lx, lastll) && lowestBar[i - x]) {
          ll = lx;
          ind = x;
        }
      }
    }

    if (ind === 0) continue;

    // Half circle: levs[x] is the level of the bar x bars back (ind + 1 levels)
    const levs: number[] = [];
    const powRadius = (ind / 2) ** 2; // a float division, also for an odd number of bars
    const end = (ind - (ind % 2)) / 2;
    const level = (ycoord: number) => (bull ? hh - ycoord : ll + ycoord);
    if (ind % 2 === 0) levs.push(level(Math.sqrt(powRadius) * width));
    for (let x = 1; x <= end; x++) {
      const y = level(Math.sqrt(powRadius - x * x) * width);
      levs.push(y);
      levs.unshift(y);
    }
    if (ind % 2 === 1) {
      levs.push(bull ? hh : ll);
      levs.unshift(bull ? hh : ll);
    }

    let inCnt = 0;
    for (let x = 0; x < levs.length; x++) {
      const top = Math.min(levs[x] + uwidth, H(x));
      const bottom = Math.max(levs[x] - uwidth, L(x));
      if (gt(top - bottom, 0)) inCnt++;
    }

    if (!ge(inCnt / (ind + 1), includeRate)) continue;
    const css = bull ? cfg.bullColor : cfg.bearColor;
    if (!cfg.noLabel) {
      if (cfg.removeOldLabels && cupLabel && !cupLabel.deleted) {
        cupLabel.deleted = true;
        liveLabels.splice(liveLabels.indexOf(cupLabel), 1);
      }
      const rounded = math.round((width * ind) / 2 / mintick) * mintick;
      cupLabel = {
        x: i, y: levs[0], bull, deleted: false,
        text: `Cup\nRadius = ${str.tostring(rounded)}\nIncluded = ${str.tostring((100 * inCnt) / (ind + 1), '#.#')}%`,
      };
      liveLabels.push(cupLabel);
      if (liveLabels.length > MAX_LABELS + 5) {
        for (let k = 0; k < liveLabels.length && liveLabels.length > MAX_LABELS; ) {
          if (liveLabels[k] === cupLabel) k++;
          else liveLabels.splice(k, 1)[0].deleted = true;
        }
      }
    }

    if (cfg.removeOldLines) {
      for (const l of cupLines) {
        if (l.deleted) continue;
        l.deleted = true;
        liveLines.splice(liveLines.indexOf(l), 1);
      }
    }

    cupLines.push(newLine(i, levs[0], i - ind + 1, levs[0], css, true, 1));
    let xloc = ind;
    for (let x = 0; x <= levs.length - 2; x++) {
      cupLines.push(newLine(i - xloc, levs[x], i - xloc + 1, levs[x + 1], css, false, 3));
      if (cfg.showChannel && x % 2 === 0 && x > 0 && x < levs.length - 2) {
        cupLines.push(newLine(i - xloc, levs[x] + uwidth, i - xloc + 1, levs[x + 1] + uwidth, css, false, 1));
        cupLines.push(newLine(i - xloc, levs[x] - uwidth, i - xloc + 1, levs[x + 1] - uwidth, css, false, 1));
      }
      xloc--;
    }

    included[i] = math.round((100 * inCnt) / (ind + 1));
    if (bull) bullishCup[i] = true;
    else bearishCup[i] = true;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: bars.map((b, i) => ({ time: b.time, value: included[i] })) },
    lines: liveLines.map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
      ...(l.width !== 1 ? { width: l.width } : {}),
    })),
    labels: liveLabels.map((l) => ({
      time: bars[l.x].time, price: l.y, text: l.text,
      color: l.bull ? cfg.bullColor : cfg.bearColor,
      textColor: l.bull ? '#363A45' : '#FFFFFF',
      style: l.bull ? ('label_lower_right' as const) : ('label_upper_right' as const),
      textAlign: 'left' as const,
    })),
    // alertcondition(bullish_cup) / alertcondition(bearish_cup) / alertcondition(bullish_cup or bearish_cup)
    alerts: alertStates(alertConditions, bars, [bullishCup, bearishCup, bullishCup.map((v, i) => v || bearishCup[i])]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Cup Found', message: 'Bullish Cup Found, Included:{{plot("included")}}' },
  { id: 'alert1', title: 'Bearish Cup Found', message: 'Bearish Cup Found, Included:{{plot("included")}}' },
  { id: 'alert2', title: 'Cup Found', message: 'Cup Found, Included:{{plot("included")}}' },
];

export const CupFinder = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
