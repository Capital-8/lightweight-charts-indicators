/**
 * Swing Failure Pattern [LuxAlgo]
 *
 * Finds the bars that break the latest swing and close back inside it. A swing high is a high above the highs of
 * the "Swings" bars before it and above the high of the bar after it (a swing low is the mirror). A bearish pattern
 * is a bar whose high is above the latest swing high while its open and its close are below it; a bullish pattern
 * is a bar whose low is below the latest swing low while its open and its close are above it.
 *
 * Drawings of a pattern: a line on the swing level from the swing bar, a dotted confirmation line on the lowest low
 * (bearish) or the highest high (bullish) between the swing and the pattern bar, a thick line on the part of the
 * wick that is outside the swing, and an "SFP" label. Both level lines follow the current bar until a close crosses
 * the confirmation level: the pattern is then confirmed and gets a triangle label. A pattern that is not confirmed
 * is removed when a close crosses the swing level, when the swing is more than 500 bars old, or when a new pattern
 * of the same side appears. At most 500 lines and 500 labels are kept.
 *
 * The "Validation" options compare the closes of lower-timeframe bars with the swing level, which the chart bars
 * do not have: the port throws an Error when "Validation" is not "None". The dashboard only shows that lower
 * timeframe, so it has no cell here.
 *
 * Reference: "Swing Failure Pattern [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableData } from '../types';

export interface SwingFailurePatternInputs {
  /** Bars before a swing */
  len: number;
  bull: boolean;
  bear: boolean;
  /** Volume validation on lower-timeframe bars (not available: throws when not "None") */
  iVal: 'Volume outside swing < Threshold' | 'Volume outside swing > Threshold' | 'None';
  percent: number;
  auto: boolean;
  mlt: number;
  res: string;
  prem: boolean;
  showDash: boolean;
  dashLoc: 'Top Right' | 'Bottom Right' | 'Bottom Left';
  textSize: 'Tiny' | 'Small' | 'Normal';
  dSwingLine: boolean;
  dOpposLine: boolean;
  dSFP_Line: boolean;
  dSFP_Label: boolean;
  colBl: string;
  colBr: string;
  colBl2: string;
  colBr2: string;
}

export const defaultInputs: SwingFailurePatternInputs = {
  len: 5,
  bull: true,
  bear: true,
  iVal: 'None',
  percent: 25,
  auto: true,
  mlt: 50,
  res: '1',
  prem: false,
  showDash: true,
  dashLoc: 'Top Right',
  textSize: 'Normal',
  dSwingLine: true,
  dOpposLine: true,
  dSFP_Line: true,
  dSFP_Label: true,
  colBl: '#089981',
  colBr: '#f23645',
  colBl2: '#08998180',
  colBr2: '#f2364580',
};

const VALIDATION = 'Volume Validation';
const SP = '            ';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Swings', defval: 5, min: 1 },
  { id: 'bull', type: 'bool', title: 'Bullish SFP', defval: true },
  { id: 'bear', type: 'bool', title: 'Bearish SFP', defval: true },
  {
    id: 'iVal', type: 'string', title: `Validation${SP}\u00a0\u00a0\u00a0`, defval: 'None', group: VALIDATION,
    options: ['Volume outside swing < Threshold', 'Volume outside swing > Threshold', 'None'],
  },
  {
    id: 'percent', type: 'float', title: 'Volume Threshold %', defval: 25, min: 0, max: 100, inline: 'valy',
    group: VALIDATION, tooltip: '% of Total Volume',
  },
  { id: 'auto', type: 'bool', title: '', defval: true, inline: 'auto', group: VALIDATION },
  { id: 'mlt', type: 'int', title: `\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0Auto${SP}`, defval: 50, inline: 'auto', group: VALIDATION },
  { id: 'res', type: 'timeframe', title: `${SP}\u00a0\u00a0\u00a0LTF${SP}\u00a0\u00a0`, defval: '1', inline: 'ltf', group: VALIDATION },
  { id: 'prem', type: 'bool', title: '\u00a0\u00a0\u00a0\u00a0Premium', defval: false, group: VALIDATION, tooltip: 'Premium Plan or higher' },
  { id: 'showDash', type: 'bool', title: 'Show Dashboard', defval: true, group: 'Dashboard' },
  {
    id: 'dashLoc', type: 'string', title: 'Location', defval: 'Top Right',
    options: ['Top Right', 'Bottom Right', 'Bottom Left'], group: 'Dashboard',
  },
  { id: 'textSize', type: 'string', title: 'Size', defval: 'Normal', options: ['Tiny', 'Small', 'Normal'], group: 'Dashboard' },
  { id: 'dSwingLine', type: 'bool', title: 'Swing Lines', defval: true, group: 'Style' },
  { id: 'dOpposLine', type: 'bool', title: 'Confirmation Lines', defval: true, group: 'Style' },
  { id: 'dSFP_Line', type: 'bool', title: 'Swing Failure Wick', defval: true, group: 'Style' },
  { id: 'dSFP_Label', type: 'bool', title: 'Swing Failure Label', defval: true, group: 'Style' },
  { id: 'colBl', type: 'color', title: 'Lines / Labels', defval: '#089981', inline: 'lin', group: 'Style' },
  { id: 'colBr', type: 'color', title: '', defval: '#f23645', inline: 'lin', group: 'Style', tooltip: 'Bullish/Bearish' },
  { id: 'colBl2', type: 'color', title: 'SFP Wicks\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0', defval: '#08998180', inline: 'wic', group: 'Style' },
  {
    id: 'colBr2', type: 'color', title: '', defval: '#f2364580', inline: 'wic', group: 'Style',
    tooltip: 'Wick outside Swing, Bullish/Bearish',
  },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Failure Pattern [LuxAlgo]',
  shortTitle: 'LuxAlgo - Swing Failure Pattern',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  dotted: boolean;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_down' | 'label_up';
  deleted: boolean;
}
/** The pattern of one side (`type piv`) */
interface Piv {
  swingPrc: number;
  swingBix: number;
  opposPrc: number;
  active: boolean;
  confirmed: boolean;
  swingLine: Ln | null;
  opposLine: Ln | null;
  wickyLine: Ln | null;
  wickyLabel: Lb | null;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SwingFailurePatternInputs> = {},
): Omit<IndicatorResult, 'labels' | 'lines' | 'tables'> & { labels: LabelData[]; lines: LineDrawingData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  if (cfg.iVal !== 'None') {
    throw new Error('Swing Failure Pattern: "Validation" needs the bars of a lower timeframe, which the chart bars do not have');
  }
  const n = bars.length;
  const len = Math.trunc(cfg.len);

  const ph = ta.pivothigh(new Series(bars, (b) => b.high), len, 1).toArray();
  const pl = ta.pivotlow(new Series(bars, (b) => b.low), len, 1).toArray();

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A deleted object ignores later changes.
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    while (list.length > MAX_OBJECTS) list.shift()!.deleted = true;
  };
  const newLine = (x1: number, y1: number, x2: number, y2: number, color: string, width = 1, dotted = false): Ln => {
    const o: Ln = { x1, y1, x2, y2, color, width, dotted, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newLabel = (x: number, y: number, text: string, textColor: string, style: Lb['style']): Lb => {
    const o: Lb = { x, y, text, textColor, style, deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const removeAll = (p: Piv) => {
    remove(lines, p.swingLine);
    remove(lines, p.opposLine);
    remove(lines, p.wickyLine);
    remove(labels, p.wickyLabel);
  };

  /** One side: the bearish patterns on swing highs, or the bullish patterns on swing lows */
  const side = (bearish: boolean) => {
    const pivots = bearish ? ph : pl;
    const css = bearish ? cfg.colBr : cfg.colBl;
    const wickCss = bearish ? cfg.colBr2 : cfg.colBl2;
    const style = bearish ? 'label_down' as const : 'label_up' as const;
    // var swing = swing.new(), var piv = piv.new(): every field is na
    let swBix = NaN;
    let swPrc = NaN;
    let piv: Piv = {
      swingPrc: NaN, swingBix: NaN, opposPrc: NaN, active: false, confirmed: false,
      swingLine: null, opposLine: null, wickyLine: null, wickyLabel: null,
    };

    return (i: number) => {
      const b = bars[i];
      const p = pivots[i] ?? NaN;
      if (!isNaN(p)) {
        swBix = i - 1;
        swPrc = p;
      }
      const sw = swPrc;
      const bx = swBix;
      const extreme = bearish ? b.high : b.low;
      const broken = bearish
        ? gt(b.high, sw) && lt(b.open, sw) && lt(b.close, sw)
        : lt(b.low, sw) && gt(b.open, sw) && gt(b.close, sw);
      if (broken) {
        // the lowest low (bearish) / highest high (bullish) beyond the swing level since the swing
        let oppos = sw;
        let opposB = i;
        const to = i - bx - 1;
        // `for k = 1 to n - bx - 1`: counts down to 0 when the swing is the bar before
        for (let k = 1; to >= 1 ? k <= to : k >= to; k += to >= 1 ? 1 : -1) {
          const v = bearish ? bars[i - k].low : bars[i - k].high;
          if (bearish ? lt(v, oppos) : gt(v, oppos)) {
            oppos = v;
            opposB = i - k;
          }
        }
        if (!piv.confirmed) removeAll(piv);
        piv = {
          swingPrc: sw, swingBix: bx, opposPrc: oppos, active: true, confirmed: false,
          swingLine: null, opposLine: null, wickyLine: null, wickyLabel: null,
        };
        if (cfg.dSwingLine) piv.swingLine = newLine(bx, sw, i, sw, css);
        if (cfg.dOpposLine) piv.opposLine = newLine(opposB, oppos, i, oppos, css, 1, true);
        if (cfg.dSFP_Line) piv.wickyLine = newLine(i, extreme, i, sw, wickCss, 3);
        if (cfg.dSFP_Label) piv.wickyLabel = newLabel(i, extreme, 'SFP', css, style);
      }

      if (piv.active && !piv.confirmed) {
        if (piv.swingLine && !piv.swingLine.deleted) piv.swingLine.x2 = i;
        if (piv.opposLine && !piv.opposLine.deleted) piv.opposLine.x2 = i;
        if (bearish ? lt(b.close, piv.opposPrc) : gt(b.close, piv.opposPrc)) {
          piv.confirmed = true;
          if (piv.wickyLabel && !piv.wickyLabel.deleted && piv.wickyLabel.x === i) {
            piv.wickyLabel.text = bearish ? 'SFP\n▼' : '▲\nSFP';
          } else {
            newLabel(i, extreme, bearish ? '▼' : '▲', css, style);
          }
        }
      }

      if (i - piv.swingBix > 500 || (bearish ? gt(b.close, piv.swingPrc) : lt(b.close, piv.swingPrc))) {
        piv.active = false;
        if (!piv.confirmed) removeAll(piv);
      }
    };
  };

  const bear = side(true);
  const bull = side(false);
  for (let i = 0; i < n; i++) {
    if (cfg.bear) bear(i);
    if (cfg.bull) bull(i);
  }

  const T = (index: number) => bars[index].time;
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: lines.map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color,
      ...(l.width !== 1 ? { width: l.width } : {}), ...(l.dotted ? { style: 'dotted' as const } : {}),
    })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style, size: 'normal' as const,
    })),
    // var tb = table.new(...): the dashboard has a cell only with a validation
    tables: n === 0 ? [] : [{
      position: cfg.dashLoc === 'Bottom Left' ? 'bottom_left' : cfg.dashLoc === 'Top Right' ? 'top_right' : 'bottom_right',
      columns: 2, rows: 3, cells: [], bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1,
      frameColor: '#373a46', frameWidth: 1,
    }],
  };
}

export const SwingFailurePattern = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
