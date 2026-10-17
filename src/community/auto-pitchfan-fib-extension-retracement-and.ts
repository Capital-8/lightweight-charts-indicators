/**
 * Auto PitchFan, Fib Extension/Retracement and ZigZag by DGT
 *
 * A zigzag gives the swings: a bar is a swing high (low) candidate when no bar of the Depth window around it is
 * higher (lower); a candidate in the direction of the running leg moves the end of the leg, a candidate in the other
 * direction starts a new leg when its distance to the last swing, in percent, is above Deviation x ATR(10) / close.
 * From the last three confirmed swings the script draws, on the last bar:
 * - a pitchfan: rays from the first swing through the middle of the last confirmed leg (the median line) and through
 *   points on both sides of it, at each level that is switched on (a fraction of half the leg), filled in between,
 *   with labels of the level and its price on the last bar
 * - optionally Fibonacci retracement or extension levels of the last confirmed leg
 * - optionally the zigzag lines
 * "Historical PitchFan/Fibonacci Levels" moves the three swings back in the history. At most 500 lines and 50 labels
 * are kept.
 *
 * Chart value read from the optional third argument (see src/chart-context.ts): the symbol tick for the prices in
 * label texts and tooltips (0.01 without it) and the ticker for the alert messages (empty without it).
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): on every bar on which the close crosses a level
 * (the level between the close and the previous close), "AutoPitchFan: <ticker> crossing median level", "...
 * crossing resistance level <level>" / "... crossing support level <level>" for each pitchfan level shown, and
 * "AutoFib Retracment : <ticker> crossing level <level>" (or "AutoFib Extention : ...") for each Fibonacci level shown,
 * in the order of the original.
 *
 * Reference: "Auto PitchFan, Fib Extension/Retracement and ZigZag by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import {
  ta, str, math, color, line, label, linefill, resetDrawings, setDrawingBar, varDrawing, holdDrawing,
  type Label, type Line, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData, TableData, AlertCall } from '../types';
import { mintickOf, tickerOf, type ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';

type PitchLabels = 'Levels' | 'Prices' | 'Levels (Prices)' | 'None';
type LineStyleName = 'Dashed' | 'Dotted' | 'Solid';
type TextSize = 'Small' | 'Normal';

/** The 9 pitchfan levels: input key, input line, shown by default, value, colour, width, style */
const PITCH_LEVELS = [
  ['025', '0_25', false, 0.25, '#ffb74d', 1, 'Dashed'],
  ['0382', '0_382', false, 0.382, '#81c784', 1, 'Dotted'],
  ['050', '0_50', true, 0.5, '#4caf50', 1, 'Solid'],
  ['0618', '0_618', false, 0.618, '#009688', 1, 'Dotted'],
  ['075', '0_75', false, 0.75, '#64b5f6', 1, 'Dashed'],
  ['1', '1', true, 1, '#2196f3', 2, 'Solid'],
  ['150', '1_50', false, 1.5, '#9c27b0', 1, 'Solid'],
  ['175', '1_75', false, 1.75, '#e91e63', 1, 'Dashed'],
  ['2', '2', false, 2, '#e57373', 2, 'Solid'],
] as const;

/** The 22 Fibonacci levels: input key, shown by default, default value, default colour, input line */
const FIB_LEVELS = [
  ['0', true, 0, '#787b86', 'Level0'],
  ['0236', true, 0.236, '#f44336', 'Level0'],
  ['0382', true, 0.382, '#81c784', 'Level1'],
  ['05', true, 0.5, '#4caf50', 'Level1'],
  ['0618', true, 0.618, '#009688', 'Level2'],
  ['065', false, 0.65, '#009688', 'Level2'],
  ['0786', true, 0.786, '#64b5f6', 'Level3'],
  ['1', true, 1, '#787b86', 'Level3'],
  ['1272', false, 1.272, '#81c784', 'Level4'],
  ['1414', false, 1.414, '#f44336', 'Level4'],
  ['1618', true, 1.618, '#2196f3', 'Level5'],
  ['165', false, 1.65, '#2196f3', 'Level5'],
  ['2618', false, 2.618, '#f44336', 'Level6'],
  ['265', false, 2.65, '#f44336', 'Level6'],
  ['3618', false, 3.618, '#9c27b0', 'Level7'],
  ['365', false, 3.65, '#9c27b0', 'Level7'],
  ['4236', false, 4.236, '#e91e63', 'Level8'],
  ['4618', false, 4.618, '#81c784', 'Level8'],
  ['Neg0236', false, -0.236, '#f44336', 'Level9'],
  ['Neg0382', false, -0.382, '#81c784', 'Level9'],
  ['Neg0618', false, -0.618, '#009688', 'Level10'],
  ['Neg065', false, -0.65, '#009688', 'Level10'],
] as const;

type PitchKey = (typeof PITCH_LEVELS)[number][0];
type FibKey = (typeof FIB_LEVELS)[number][0];
type PitchLevelInputs = { [K in PitchKey as `pshow${K}`]: boolean } & { [K in PitchKey as `pvalue${K}`]: number } & {
  [K in PitchKey as `pcolor${K}`]: string;
} & { [K in PitchKey as `pwidth${K}`]: number } & { [K in PitchKey as `pstyle${K}`]: LineStyleName };
type FibLevelInputs = { [K in FibKey as `show${K}`]: boolean } & { [K in FibKey as `value${K}`]: number } & {
  [K in FibKey as `color${K}`]: string;
};

export interface AutoPitchfanFibExtensionRetracementAndInputs extends PitchLevelInputs, FibLevelInputs {
  /** Multiplier of ATR(10) / close, in percent: smallest move that starts a new leg */
  deviation: number;
  depth: number;
  histPivot: number;
  pitch: boolean;
  pitchBackground: boolean;
  pitchLabels: PitchLabels;
  pitchLabelSize: TextSize;
  medianColor: string;
  medianWidth: number;
  medianStyle: LineStyleName;
  zigZag: boolean;
  zzColor: string;
  zzWidth: number;
  zzStyle: LineStyleName;
  isFib: boolean;
  fibTool: 'Retracements' | 'Extentions';
  reverse: boolean;
  extend: boolean;
  levels: PitchLabels;
  levelsP: 'Last Bar' | 'Pivot Start';
  levelsF: TextSize;
}

const pitchDefaults = Object.fromEntries(
  PITCH_LEVELS.flatMap(([k, , show, value, css, width, style]) => [
    [`pshow${k}`, show], [`pvalue${k}`, value], [`pcolor${k}`, css], [`pwidth${k}`, width], [`pstyle${k}`, style],
  ]),
) as unknown as PitchLevelInputs;
const fibDefaults = Object.fromEntries(
  FIB_LEVELS.flatMap(([k, show, value, css]) => [[`show${k}`, show], [`value${k}`, value], [`color${k}`, css]]),
) as unknown as FibLevelInputs;

export const defaultInputs: AutoPitchfanFibExtensionRetracementAndInputs = {
  deviation: 3,
  depth: 11,
  histPivot: 0,
  pitch: true,
  pitchBackground: true,
  pitchLabels: 'Levels (Prices)',
  pitchLabelSize: 'Small',
  medianColor: '#f44336',
  medianWidth: 3,
  medianStyle: 'Solid',
  zigZag: false,
  zzColor: '#FF9800',
  zzWidth: 1,
  zzStyle: 'Solid',
  isFib: false,
  fibTool: 'Retracements',
  reverse: false,
  extend: false,
  levels: 'Levels',
  levelsP: 'Pivot Start',
  levelsF: 'Small',
  ...pitchDefaults,
  ...fibDefaults,
};

const G_PITCH = 'PitchFan Settings';
const G_ZZ = 'Zig Zag Settings';
const G_FIB = 'Fibonacci Retracement/Extension Settings';
const STYLES = ['Dashed', 'Dotted', 'Solid'];
const LABEL_OPTIONS = ['Levels', 'Prices', 'Levels (Prices)', 'None'];
const SIZES = ['Small', 'Normal'];
/** Figure space, used by the original to align its input titles */
const FS = ' ';

const TIP_THRESHOLD =
  'Deviation is a multiplier that affects how much the price should deviate from the previous pivot in order for the bar to become a new pivot'
  + '\n\nDepth affects the minimum number of bars that will be taken into account when building';
const TIP_PITCH =
  'A Pitchfan is a set of rays spreading out of the point of a trend\'s beginning. These rays inclined with the coefficients formed by a Fibonacci number sequence'
  + '\nIt is recommended to apply a Pitchfan after the first wave of the trend has passed and the correction has clearly begun';

export const inputConfig: InputConfig[] = [
  { id: 'deviation', type: 'float', title: 'Deviation', defval: 3, min: 0, inline: 'Pivots', tooltip: TIP_THRESHOLD },
  { id: 'depth', type: 'int', title: `${FS.repeat(9)}Depth`, defval: 11, min: 1, inline: 'Pivots' },
  { id: 'histPivot', type: 'int', title: `Historical PitchFan/Fibonacci Levels${FS.repeat(3)}`, defval: 0, min: 0 },
  { id: 'pitch', type: 'bool', title: `PitchFan Rays ${FS.repeat(5)}|${FS.repeat(5)}Background`, defval: true, inline: 'pfan', group: G_PITCH, tooltip: TIP_PITCH },
  { id: 'pitchBackground', type: 'bool', title: '', defval: true, inline: 'pfan', group: G_PITCH },
  { id: 'pitchLabels', type: 'string', title: 'PitchFan Level Labels', defval: 'Levels (Prices)', options: LABEL_OPTIONS, inline: 'pLines', group: G_PITCH },
  { id: 'pitchLabelSize', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'pLines', group: G_PITCH },
  { id: 'medianColor', type: 'color', title: `Median Line${FS.repeat(10)}`, defval: '#f44336', inline: 'PLM', group: G_PITCH },
  { id: 'medianWidth', type: 'int', title: '', defval: 3, min: 1, inline: 'PLM', group: G_PITCH },
  { id: 'medianStyle', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'PLM', group: G_PITCH },
  { id: 'zigZag', type: 'bool', title: `Zig Zag${FS.repeat(3)}`, defval: false, inline: 'ZZ', group: G_ZZ },
  { id: 'zzColor', type: 'color', title: '', defval: '#FF9800', inline: 'ZZ', group: G_ZZ },
  { id: 'zzWidth', type: 'int', title: '', defval: 1, min: 1, inline: 'ZZ', group: G_ZZ },
  { id: 'zzStyle', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'ZZ', group: G_ZZ },
  { id: 'isFib', type: 'bool', title: 'Pick a Fibonacci Tool', defval: false, inline: 'FIB', group: G_FIB },
  { id: 'fibTool', type: 'string', title: FS.repeat(13), defval: 'Retracements', options: ['Retracements', 'Extentions'], inline: 'FIB', group: G_FIB },
  { id: 'reverse', type: 'bool', title: `Reverse Levels${FS.repeat(3)}`, defval: false, inline: 'fLines', group: G_FIB },
  { id: 'extend', type: 'bool', title: 'Extend Lines', defval: false, inline: 'fLines', group: G_FIB },
  { id: 'levels', type: 'string', title: 'Level Labels', defval: 'Levels', options: LABEL_OPTIONS, inline: 'fLines1', group: G_FIB },
  { id: 'levelsP', type: 'string', title: '', defval: 'Pivot Start', options: ['Last Bar', 'Pivot Start'], inline: 'fLines1', group: G_FIB },
  { id: 'levelsF', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'fLines1', group: G_FIB },
  ...PITCH_LEVELS.flatMap(([k, name, show, value, css, width, style]): InputConfig[] => {
    const inline = `pLevel_${name}`;
    return [
      { id: `pshow${k}`, type: 'bool', title: '', defval: show, inline, group: G_PITCH },
      { id: `pvalue${k}`, type: 'float', title: '', defval: value, min: 0, inline, group: G_PITCH },
      { id: `pcolor${k}`, type: 'color', title: '', defval: css, inline, group: G_PITCH },
      { id: `pwidth${k}`, type: 'int', title: '', defval: width, min: 1, inline, group: G_PITCH },
      { id: `pstyle${k}`, type: 'string', title: '', defval: style, options: STYLES, inline, group: G_PITCH },
    ];
  }),
  ...FIB_LEVELS.flatMap(([k, show, value, css, inline]): InputConfig[] => [
    { id: `show${k}`, type: 'bool', title: '', defval: show, inline, group: G_FIB },
    { id: `value${k}`, type: k === '0' || k === '1' ? 'int' : 'float', title: '', defval: value, inline, group: G_FIB },
    { id: `color${k}`, type: 'color', title: '', defval: css, inline, group: G_FIB },
  ]),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Auto PitchFan, Fib Extension/Retracement and ZigZag by DGT',
  shortTitle: 'PitchFan ʙʏ DGT ☼☾',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;
/** Default max_labels_count */
const MAX_LABELS = 50;
const GRAY = '#787B86';
const TEAL = '#00897B';
const CLEAR = '#00000000';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** ta.valuewhen(ta.change(x), x, occurrence): the values of x on the bars where it changed (na changes do not count) */
function changeValues(): { update: (v: number) => void; get: (occurrence: number) => number } {
  const values: number[] = [];
  let prev = NaN;
  return {
    update: (v) => {
      const d = v - prev;
      if (!isNaN(d) && d !== 0) values.push(v);
      prev = v;
    },
    get: (occurrence) => (values.length > occurrence ? values[values.length - 1 - occurrence] : NaN),
  };
}

const lineStyle = (s: LineStyleName): 'solid' | 'dashed' | 'dotted' => (s === 'Solid' ? 'solid' : s === 'Dotted' ? 'dotted' : 'dashed');
const avg = (a: number, b: number) => (a + b) / 2;
const round = (v: number) => math.round(v) as number;

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoPitchfanFibExtensionRetracementAndInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
  lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[]; tables: TableData[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  // syminfo.mintick
  const mintick = mintickOf(chart);
  const priceText = (v: number) => str.tostring(v, 'mintick', mintick);
  const atr10 = ta.atr(bars, 10).toArray();
  // syminfo.ticker, for the alert() messages
  const ticker = tickerOf(chart);
  const alertCalls: AlertCall[] = [];

  // Drawings of the library registry (500 lines, the default 50 labels). As in the script, the pitchfan rays and
  // their fills are deleted and made again on each bar, the lines and labels of f_drawLineX / f_drawLabelX are `var`
  // objects made on their first call and moved on each bar, and the zigzag lines stay until the line maximum.
  resetDrawings({ line: MAX_LINES, label: MAX_LABELS });

  // Zigzag. pivots(src, i_depth / 2, isHigh): the division keeps its fraction (5.5 for a depth of 11); the history
  // index is truncated and the loop runs up to twice the length.
  const half = cfg.depth / 2;
  const back = Math.trunc(half);
  const span = half * 2;
  const pivotAt = (i: number, isHigh: boolean): [number, number] => {
    const c = i >= back ? (isHigh ? bars[i - back].high : bars[i - back].low) : 0;
    for (let k = 0; k <= span && k <= i; k++) {
      if (isHigh ? gt(bars[i - k].high, c) : lt(bars[i - k].low, c)) return [NaN, NaN];
    }
    return [i >= back ? i - back : NaN, c];
  };
  const lineLast = varDrawing<Line>(); // var line lineLast = na
  let iLast = 0;
  let pLast = 0;
  let isHighLast = false;
  let iPrevPivotRef = 0;
  let pPrevPivotRef = 0;
  let iLastPivotRef = 0;
  let pLastPivotRef = 0;
  const iPrevValues = changeValues();
  const pPrevValues = changeValues();
  const iLastValues = changeValues();
  const pLastValues = changeValues();
  const show = cfg.zigZag;
  const swing = (i: number, isHigh: boolean, index: number, price: number) => {
    const dev = (100 * (price - pLast)) / price;
    // pivotFound()
    const before = lineLast.value;
    let id: Line | undefined;
    let direction = isHighLast;
    if (isHighLast === isHigh && before) {
      if (isHighLast ? gt(price, pLast) : lt(price, pLast)) {
        line.set_xy2(before, index, price);
        id = before;
      }
    } else if (gt(Math.abs(dev), ((atr10[i] ?? NaN) / bars[i].close) * 100 * cfg.deviation)) {
      id = show
        ? line.new(iLast, pLast, index, price, 'bar_index', 'none', cfg.zzColor, lineStyle(cfg.zzStyle), cfg.zzWidth)
        : line.new(iLast, pLast, index, price, 'bar_index', 'none', undefined, 'dashed', 1); // color = na
      direction = isHigh;
    }
    if (!id) return;
    // `id != lineLast` is also true while lineLast is na (the first line): the four values become na
    if (id !== before) {
      iPrevPivotRef = before ? line.get_x1(before) : NaN;
      pPrevPivotRef = before ? line.get_y1(before) : NaN;
      iLastPivotRef = before ? line.get_x2(before) : NaN;
      pLastPivotRef = before ? line.get_y2(before) : NaN;
      if (!show && before) line.delete(before);
    }
    lineLast.value = id;
    isHighLast = direction;
    iLast = index;
    pLast = price;
  };

  const pitchLevels = PITCH_LEVELS.map(([k]) => ({
    show: cfg[`pshow${k}`], level: cfg[`pvalue${k}`], css: cfg[`pcolor${k}`], width: cfg[`pwidth${k}`], style: lineStyle(cfg[`pstyle${k}`]),
  }));
  const fibLevels = FIB_LEVELS.map(([k]) => ({ show: cfg[`show${k}`], level: cfg[`value${k}`], css: cfg[`color${k}`] }));
  const ext = cfg.fibTool === 'Extentions';
  const hist = cfg.histPivot;
  const sizeOf = (s: TextSize) => (s === 'Small' ? 'small' : 'normal');

  // `var` objects of f_drawLineX / f_drawLabelX, one per call site (made on the first call)
  const varLines = new Map<string, Line>();
  const varLabels = new Map<string, Label>();
  /** f_drawLineX(): `var id = line.new(...)`, then moved */
  const drawLineX = (site: string, x1: number, y1: number, x2: number, y2: number, extend: 'none' | 'right' | 'both', css: string,
    style: 'solid' | 'dashed' | 'dotted', width: number) => {
    let id = varLines.get(site);
    if (!id) varLines.set(site, (id = holdDrawing(line.new(x1, y1, x2, y2, 'bar_index', extend, css, style, width))));
    line.set_xy1(id, x1, y1);
    line.set_xy2(id, x2, y2);
  };
  /** f_drawLabelX(): `var id = label.new(...)`, then moved; its text gets two line breaks. The text is only needed
   *  on the last bar (`keep`). */
  const drawLabelX = (site: string, keep: boolean, x: number, y: number, text: () => string, css: string, style: 'label_left' | 'label_right' | 'circle',
    textColor: string, size: 'small' | 'normal' | 'auto', tooltip: () => string) => {
    let id = varLabels.get(site);
    if (!id) varLabels.set(site, (id = holdDrawing(label.new(x, y, '', 'bar_index', 'price', css, style, textColor, size, 'left', ''))));
    label.set_xy(id, x, y);
    if (keep) {
      label.set_text(id, `${text()}\n\n`);
      label.set_tooltip(id, tooltip());
    }
  };

  // a_lnr, a_lns, a_lf: the pitchfan rays and fills of the bar
  let lnr: Line[] = [];
  let lns: Line[] = [];
  let fills: Linefill[] = [];
  const draw = (i: number, keep: boolean) => {
    // f_crossingLevel(close, level): level > close and level < close[1] or level < close and level > close[1]
    const close = bars[i].close;
    const close1 = i > 0 ? bars[i - 1].close : NaN;
    const crossing = (level: number) => (gt(level, close) && lt(level, close1)) || (lt(level, close) && gt(level, close1));
    const alertCall = (message: string) => alertCalls.push({ time: bars[i].time, message, freq: 'once_per_bar' });
    const iStartMedian = iPrevValues.get(hist > 0 ? hist + 1 : 1);
    const pStartMedian = pPrevValues.get(hist > 0 ? hist + 1 : 1);
    const iLastPivot = iLastValues.get(hist > 0 ? hist : 0);
    const pLastPivot = pLastValues.get(hist > 0 ? hist : 0);
    const iPrevPivot = iPrevValues.get(hist > 0 ? hist : 0);
    const pPrevPivot = pPrevValues.get(hist > 0 ? hist : 0);
    const iEndMedian = Math.trunc(avg(iPrevPivot, iLastPivot));
    const pEndMedian = avg(pPrevPivot, pLastPivot);
    // f_drawPitchLine()
    const ray = (iEnd: number, pEnd: number, css: string, width: number, style: 'solid' | 'dashed' | 'dotted', hg: boolean) => {
      if (!lt(iEnd, i)) return;
      (hg ? lnr : lns).push(line.new(iStartMedian, pStartMedian, iEnd, pEnd, 'bar_index', 'right', css, style, width));
    };
    // linefill.new() on two lines that already have a fill replaces it (rule measured with the first port; the library
    // adds a second fill)
    const fill = (a: Line, b: Line, css: string) => {
      const old = fills.find((f) => f.line1 === a && f.line2 === b);
      if (old) linefill.set_color(old, css);
      else fills.push(linefill.new(a, b, css));
    };
    const size = sizeOf(cfg.pitchLabelSize);

    if (cfg.pitch) {
      const mStyle = lineStyle(cfg.medianStyle);
      ray(iEndMedian, pEndMedian, cfg.medianColor, cfg.medianWidth, mStyle, true);
      ray(iEndMedian, pEndMedian, cfg.medianColor, cfg.medianWidth, mStyle, false);
      drawLineX('median', iPrevPivot, pPrevPivot, iLastPivot, pLastPivot, 'none', cfg.medianColor, 'solid', cfg.medianWidth);
      const slope = (pEndMedian - pStartMedian) / (iEndMedian - iStartMedian);
      const mPrice = slope * i + pStartMedian - slope * iStartMedian;
      if (cfg.pitchLabels !== 'None') {
        const tip = () => priceText(mPrice);
        const text = () => (cfg.pitchLabels === 'Prices' ? tip() : cfg.pitchLabels === 'Levels (Prices)' ? `PF M (${tip()})` : 'PF M');
        drawLabelX('m', keep, i, mPrice, text, CLEAR, 'label_left', cfg.medianColor, size, tip);
        drawLabelX('m circle', keep, i, mPrice, () => '', cfg.medianColor, 'circle', CLEAR, 'auto', () => '');
      }
      if (crossing(mPrice)) alertCall('AutoPitchFan: ' + ticker + ' crossing median level');
    }

    // processPitchLevel()
    pitchLevels.forEach(({ show: on, level, css, width, style }, k) => {
      if (!cfg.pitch) return;
      const iDiff = Math.abs(iPrevPivot - iLastPivot) / 2;
      const pDiff = Math.abs(pPrevPivot - pLastPivot) / 2;
      const down = gt(pPrevPivot, pLastPivot);
      const iEndX = Math.trunc(round(down ? iEndMedian - iDiff * level : iEndMedian + iDiff * level));
      const pEndX = pEndMedian + pDiff * level;
      const iEndY = Math.trunc(round(down ? iEndMedian + iDiff * level : iEndMedian - iDiff * level));
      const pEndY = pEndMedian - pDiff * level;
      if (!on) return;
      ray(iEndX, pEndX, css, width, style, true);
      ray(iEndY, pEndY, css, width, style, false);
      const slopeX = (pEndX - pStartMedian) / (iEndX - iStartMedian);
      const slopeY = (pEndY - pStartMedian) / (iEndY - iStartMedian);
      const rPrice = slopeX * i + pStartMedian - slopeX * iStartMedian;
      const sPrice = slopeY * i + pStartMedian - slopeY * iStartMedian;
      if (cfg.pitchLabels !== 'None') {
        const text = (price: number, side: string) => () => {
          const tip = priceText(price);
          const lv = `PF ${str.tostring(level)} ${side}`;
          return cfg.pitchLabels === 'Prices' ? tip : cfg.pitchLabels === 'Levels (Prices)' ? `${lv} (${tip})` : lv;
        };
        drawLabelX(`p${k} r`, keep, i, rPrice, text(rPrice, 'R'), CLEAR, 'label_left', css, size, () => priceText(rPrice));
        drawLabelX(`p${k} s`, keep, i, sPrice, text(sPrice, 'S'), CLEAR, 'label_left', css, size, () => priceText(sPrice));
        drawLabelX(`p${k} r circle`, keep, i, rPrice, () => '', css, 'circle', CLEAR, 'auto', () => '');
        drawLabelX(`p${k} s circle`, keep, i, sPrice, () => '', css, 'circle', CLEAR, 'auto', () => '');
      }
      if (crossing(rPrice)) alertCall('AutoPitchFan: ' + ticker + ' crossing resistance level ' + str.tostring(level));
      if (crossing(sPrice)) alertCall('AutoPitchFan: ' + ticker + ' crossing support level ' + str.tostring(level));
      if (cfg.pitchBackground) {
        const paint = String(color.new(css, 89));
        if (lnr.length > 1) fill(lnr[lnr.length - 2], lnr[lnr.length - 1], paint);
        if (lns.length > 1) fill(lns[lns.length - 2], lns[lns.length - 1], paint);
      }
    });

    // processFibLevel()
    if (cfg.isFib) {
      const diff = Math.abs(pPrevPivot - pLastPivot);
      const sign = cfg.reverse ? -1 : 1;
      fibLevels.forEach(({ show: on, level, css }, k) => {
        let price: number;
        if (ext) {
          drawLineX(`f${k} ext1`, iStartMedian, pStartMedian, iPrevPivot, pPrevPivot, 'none', GRAY, 'dashed', 1);
          drawLineX(`f${k} ext2`, iPrevPivot, pPrevPivot, iLastPivot, pLastPivot, 'none', GRAY, 'dashed', 1);
          const offset = Math.abs(pPrevPivot - pStartMedian);
          price = lt(pLastPivot, pPrevPivot) ? pPrevPivot - diff + sign * offset * level : pPrevPivot + diff - sign * offset * level;
        } else {
          drawLineX(`f${k} ret`, iPrevPivot, pPrevPivot, iLastPivot, pLastPivot, 'none', GRAY, 'dashed', 1);
          const from = cfg.reverse ? pLastPivot : pPrevPivot;
          price = lt(pLastPivot, pPrevPivot) ? from - sign * diff * level : from + sign * diff * level;
        }
        if (!on) return;
        drawLineX(`f${k}`, iPrevPivot, price, i, price, cfg.extend ? 'both' : 'right', css, 'solid', 1);
        if (cfg.levels !== 'None') {
          const tip = () => priceText(price);
          const txt = () => (cfg.levels === 'Levels' ? str.tostring(level) : cfg.levels === 'Prices' ? tip() : `${str.tostring(level)} (${tip()})`);
          const lastBar = cfg.levelsP === 'Last Bar';
          drawLabelX(`f${k}`, keep, lastBar ? i : iPrevPivot, price, () => `${ext ? 'EXT ' : 'RET '}${txt()}`, CLEAR, lastBar ? 'label_left' : 'label_right',
            css, sizeOf(cfg.levelsF), tip);
        }
        if (crossing(price)) {
          alertCall('AutoFib ' + (ext ? 'Extention : ' : 'Retracment : ') + ticker + ' crossing level ' + str.tostring(level));
        }
      });
    }
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const [iH, pH] = pivotAt(i, true);
    if (!isNaN(iH)) swing(i, true, iH, pH);
    else {
      const [iL, pL] = pivotAt(i, false);
      if (!isNaN(iL)) swing(i, false, iL, pL);
    }
    iPrevValues.update(iPrevPivotRef);
    pPrevValues.update(pPrevPivotRef);
    iLastValues.update(iLastPivotRef);
    pLastValues.update(pLastPivotRef);

    // if ta.change(time): the rays and fills of the bar before are deleted
    for (const l of lnr) line.delete(l);
    for (const l of lns) line.delete(l);
    for (const f of fills) linefill.delete(f);
    lnr = [];
    lns = [];
    fills = [];
    draw(i, i === last);
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const toLine = (l: Line): LineDrawingData => ({
    time1: barTime(bars, l.x1, interval), price1: l.y1, time2: barTime(bars, l.x2, interval), price2: l.y2,
    color: l.color === undefined ? 'transparent' : String(l.color), width: l.width ?? 1, ...(l.style === 'solid' ? {} : { style: l.style }),
    ...(l.extend === 'none' ? {} : { extend: l.extend }),
  });
  // an object with an na (or infinite) coordinate is not drawn
  const drawn = (l: LineDrawingData) => [l.time1, l.time2, l.price1, l.price2].every((v) => isFinite(v));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().map(toLine).filter(drawn),
    labels: label.all().map((l): LabelData => ({
      time: barTime(bars, l.x, interval), price: l.y, text: l.text ?? '', color: String(l.color), textColor: String(l.textcolor),
      style: l.style as LabelData['style'], size: l.size as LabelData['size'], textAlign: 'left', ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })).filter((l) => isFinite(l.time) && isFinite(l.price)),
    linefills: linefill.all().map((f) => ({ line1: toLine(f.line1), line2: toLine(f.line2), color: String(f.color) }))
      .filter((f) => drawn(f.line1) && drawn(f.line2)),
    // var table logo = table.new(position.bottom_right, 1, 1) with one cell
    tables: n > 0
      ? [{ position: 'bottom_right', columns: 1, rows: 1, cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL }] }]
      : [],
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const AutoPitchfanFibExtensionRetracementAnd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
