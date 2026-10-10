/**
 * Auto Pitchfork, Fib Retracement and Zig Zag by DGT
 *
 * Two zigzags (each with its own Deviation and Depth) give the swings: a bar is a swing high (low) candidate when no
 * bar of the Depth window around it is higher (lower); a candidate in the direction of the running leg moves the end
 * of the leg, a candidate in the other direction starts a new leg when its distance to the last swing, in percent,
 * is above Deviation x ATR(10) / close. From the last three confirmed swings of a zigzag the script draws, on the
 * last bar:
 * - a pitchfork (Original, Schiff, Modified Schiff or Inside): the median line, parallel lines at each level that is
 *   switched on, filled in between, and labels with the level and its price on the last bar (first zigzag: first
 *   pitchfork; second zigzag: second pitchfork, off by default)
 * - Fibonacci extension or retracement levels of the first zigzag
 * - optionally the zigzag lines
 * It also draws the Camarilla levels R3 to R6 and S3 to S6 of the previous period of a higher timeframe (chosen from
 * the chart timeframe with "Auto", or set by hand), and "Show Historical Pivots" plots them for every past period.
 * At most 500 lines are kept.
 *
 * Limits of the port: the periods of the higher timeframe come from the UTC calendar and the bars (see
 * src/anchor-period.ts), and the day of the week ("Daily" and "Weekly" pivots) is the UTC day of the bar, where the
 * original uses the time zone of the exchange; prices in label texts use a tick of 0.01 (the bars carry no symbol
 * tick); the "Last Bar" position of the pivot labels uses the current time, as the original; the alerts of the
 * original are not ported.
 *
 * Reference: "Auto Pitchfork, Fib Retracement and Zig Zag by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import { ta, str, math, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, LinefillData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe } from '../anchor-period';

type PitchforkType = 'Original' | 'Schiff' | 'Modified Schiff' | 'Inside';
type PitchLabels = 'Levels' | 'Prices' | 'Levels (Prices)' | 'None';
type LineStyleName = 'Dashed' | 'Dotted' | 'Solid';
type TextSize = 'Small' | 'Normal';

/** The 9 pitchfork levels of each pitchfork: input key, shown by default, value, colour, width, style */
const PITCH_LEVELS = [
  ['025', false, 0.25, '#ffb74d', 1, 'Dashed'],
  ['0382', false, 0.382, '#81c784', 1, 'Dotted'],
  ['050', true, 0.5, '#4caf50', 1, 'Solid'],
  ['0618', false, 0.618, '#009688', 1, 'Dotted'],
  ['075', false, 0.75, '#64b5f6', 1, 'Dashed'],
  ['1', true, 1, '#2196f3', 2, 'Solid'],
  ['150', false, 1.5, '#9c27b0', 1, 'Solid'],
  ['175', false, 1.75, '#e91e63', 1, 'Dashed'],
  ['2', false, 2, '#e57373', 2, 'Solid'],
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
type PitchLevelInputs<S extends string> = { [K in PitchKey as `pshow${K}${S}`]: boolean } & { [K in PitchKey as `pvalue${K}${S}`]: number } & {
  [K in PitchKey as `pcolor${K}${S}`]: string;
} & { [K in PitchKey as `pwidth${K}${S}`]: number } & { [K in PitchKey as `pstyle${K}${S}`]: LineStyleName };
type FibLevelInputs = { [K in FibKey as `show${K}`]: boolean } & { [K in FibKey as `value${K}`]: number } & {
  [K in FibKey as `color${K}`]: string;
};

export interface AutoPitchforkFibRetracementZigZagInputs extends PitchLevelInputs<''>, PitchLevelInputs<'Second'>, FibLevelInputs {
  pitch: boolean;
  pitchType: PitchforkType;
  /** Multiplier of ATR(10) / close, in percent: smallest move that starts a new leg */
  deviation: number;
  depth: number;
  pitchLabels: PitchLabels;
  pitchLabelSize: TextSize;
  pitchBackground: number;
  histPivot: number;
  pitchExtend: boolean;
  medianColor: string;
  medianWidth: number;
  medianStyle: LineStyleName;
  pitchSecond: boolean;
  pitchTypeSecond: PitchforkType;
  deviationSecond: number;
  depthSecond: number;
  pitchLabelsSecond: PitchLabels;
  pitchLabelSizeSecond: TextSize;
  pitchBackgroundSecond: number;
  histPivotSecond: number;
  pitchExtendSecond: boolean;
  medianColorSecond: string;
  medianWidthSecond: number;
  medianStyleSecond: LineStyleName;
  zigZag: boolean;
  zzColor: string;
  zzWidth: number;
  zzStyle: LineStyleName;
  zigZagSecond: boolean;
  zzColorSecond: string;
  zzWidthSecond: number;
  zzStyleSecond: LineStyleName;
  isFib: boolean;
  fibTool: 'Retracements' | 'Extentions';
  reverse: boolean;
  extend: boolean;
  levels: PitchLabels;
  levelsP: 'Last Bar' | 'Pivot Start';
  levelsF: TextSize;
  pivot: 'Camarilla' | 'None';
  pivotTimeframe: 'Auto' | '15 Min' | '1 Hour' | '4 Hour' | 'Session' | 'Daily' | 'Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';
  weekStart: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  srLabel: 'Levels' | 'Levels (Prices)' | 'None';
  srLabelPos: 'Last Bar' | 'Pivot End';
  srLabelSize: TextSize;
  showR: boolean;
  styleR: LineStyleName;
  widthR: number;
  colorR3: string;
  colorR4: string;
  colorR5: string;
  colorR6: string;
  showS: boolean;
  styleS: LineStyleName;
  widthS: number;
  colorS3: string;
  colorS4: string;
  colorS5: string;
  colorS6: string;
  dispHist: 'Selected Pivots' | 'None';
}

const pitchDefaults = <S extends string>(suffix: S) => Object.fromEntries(
  PITCH_LEVELS.flatMap(([k, show, value, css, width, style]) => [
    [`pshow${k}${suffix}`, show], [`pvalue${k}${suffix}`, value], [`pcolor${k}${suffix}`, css], [`pwidth${k}${suffix}`, width],
    [`pstyle${k}${suffix}`, style],
  ]),
) as unknown as PitchLevelInputs<S>;
const fibDefaults = Object.fromEntries(
  FIB_LEVELS.flatMap(([k, show, value, css]) => [[`show${k}`, show], [`value${k}`, value], [`color${k}`, css]]),
) as unknown as FibLevelInputs;

export const defaultInputs: AutoPitchforkFibRetracementZigZagInputs = {
  pitch: true,
  pitchType: 'Original',
  deviation: 5,
  depth: 34,
  pitchLabels: 'Levels (Prices)',
  pitchLabelSize: 'Small',
  pitchBackground: 89,
  histPivot: 0,
  pitchExtend: false,
  medianColor: '#f44336',
  medianWidth: 3,
  medianStyle: 'Solid',
  ...pitchDefaults(''),
  pitchSecond: false,
  pitchTypeSecond: 'Original',
  deviationSecond: 3,
  depthSecond: 13,
  pitchLabelsSecond: 'None',
  pitchLabelSizeSecond: 'Small',
  pitchBackgroundSecond: 89,
  histPivotSecond: 0,
  pitchExtendSecond: false,
  medianColorSecond: '#f44336',
  medianWidthSecond: 3,
  medianStyleSecond: 'Solid',
  ...pitchDefaults('Second'),
  zigZag: false,
  zzColor: '#FF9800',
  zzWidth: 1,
  zzStyle: 'Solid',
  zigZagSecond: false,
  zzColorSecond: '#FF9800',
  zzWidthSecond: 1,
  zzStyleSecond: 'Solid',
  isFib: true,
  fibTool: 'Extentions',
  reverse: false,
  extend: false,
  levels: 'Levels',
  levelsP: 'Pivot Start',
  levelsF: 'Small',
  ...fibDefaults,
  pivot: 'Camarilla',
  pivotTimeframe: 'Auto',
  weekStart: 'Monday',
  srLabel: 'Levels (Prices)',
  srLabelPos: 'Pivot End',
  srLabelSize: 'Small',
  showR: true,
  styleR: 'Solid',
  widthR: 2,
  colorR3: '#ff9800',
  colorR4: '#ff9800',
  colorR5: '#ff9800',
  colorR6: '#ff980000',
  showS: true,
  styleS: 'Solid',
  widthS: 2,
  colorS3: '#ff9800',
  colorS4: '#ff9800',
  colorS5: '#ff9800',
  colorS6: '#ff980000',
  dispHist: 'None',
};

const G_PITCH = 'First Pitchfork Settings';
const G_PITCH2 = 'Second Pitchfork Settings';
const G_ZZ = 'Zig Zag Settings';
const G_FIB = 'Fibonacci Retracement/Extension Settings';
const G_PIVOT = 'Pivot Points Setup';
const STYLES = ['Dashed', 'Dotted', 'Solid'];
const LABEL_OPTIONS = ['Levels', 'Prices', 'Levels (Prices)', 'None'];
const TYPES = ['Original', 'Schiff', 'Modified Schiff', 'Inside'];
const SIZES = ['Small', 'Normal'];
const FS = ' ';

const TIP_THRESHOLD =
  'Deviation is a multiplier that affects how much the price should deviate from the previous pivot in order for the bar to become a new pivot'
  + '\n\nDepth affects the minimum number of bars that will be taken into account when building';
const TIP_PITCHFORK =
  'Pitchfork is a technical indicator for a quick and easy way for traders to identify possible levels of support and resistance'
  + '\n\nAndrews\' Pitchfork (Original) best fit in a Strong Trending Market'
  + '\nSchiff and Modified Pitchfork better with Correcting or Sideways Market'
  + '\nModified Pitchfork is almost identical to a Parallel Chanel';
const TIP_PIVOT = 'Pivot Points is a technical analysis indicator used to determine the overall trend of the market over different time frames.';
const TIP_TF =
  'The indicator resolution is set by the input of the Pivot Points TF. If the Pivot Points TF is set to AUTO (the default value), then the increased resolution is determined by the following algorithm:\n'
  + ' - for intraday resolutions up to and including 15 min, DAY (1D) is used\n - for intraday resolutions more than 15 min, WEEK (1W) is used\n - for daily resolutions MONTH is used (1M)\n - for weekly and monthly resolutions, 12-MONTH (12M) is used\n\n'
  + 'ps : difference between Session and Daily - Daily will take into account extended hours (if present on the chart) during pivot calculations, whereas Session will assume only regular trading hours. Session is default value for AUTO pivot timeframe';

/** Inputs of one pitchfork group, in the order of the original (the level inputs come later in the list) */
const pitchInputs = (s: '' | 'Second', group: string, typeTitle: string, deviation: number, depth: number, labels: string): InputConfig[] => [
  { id: `pitch${s}`, type: 'bool', title: `${s === '' ? 'First' : 'Second'} Pitchfork Type`, defval: s === '', inline: s === '' ? 'PIT' : 'PIT2', group, tooltip: TIP_PITCHFORK },
  { id: `pitchType${s}`, type: 'string', title: typeTitle, defval: 'Original', options: TYPES, inline: s === '' ? 'PIT' : 'PIT2', group },
  { id: `deviation${s}`, type: 'float', title: 'Deviation', defval: deviation, min: 0, inline: 'Pivots', group, tooltip: TIP_THRESHOLD },
  { id: `depth${s}`, type: 'int', title: `${FS.repeat(9)}Depth`, defval: depth, min: 1, inline: 'Pivots', group },
  { id: `pitchLabels${s}`, type: 'string', title: 'Pitchfork Level Labels', defval: labels, options: LABEL_OPTIONS, inline: 'pLines', group },
  { id: `pitchLabelSize${s}`, type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'pLines', group },
  { id: `pitchBackground${s}`, type: 'int', title: 'Background Transparency', defval: 89, min: 0, max: 100, group },
  { id: `histPivot${s}`, type: 'int', title: 'Historical Pitchforks/Fibonacci Levels', defval: 0, min: 0, group },
  { id: `pitchExtend${s}`, type: 'bool', title: 'Extend Pitchfork Lines', defval: false, group },
  { id: `medianColor${s}`, type: 'color', title: `Median Line ${FS.repeat(8)}`, defval: '#f44336', inline: 'PLM', group },
  { id: `medianWidth${s}`, type: 'int', title: '', defval: 3, min: 1, inline: 'PLM', group },
  { id: `medianStyle${s}`, type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'PLM', group },
];
const pitchLevelInputs = (s: '' | 'Second', group: string): InputConfig[] => PITCH_LEVELS.flatMap(([k, show, value, css, width, style]): InputConfig[] => {
  const names: Record<string, string> = { '025': '0_25', '0382': '0_382', '050': '0_50', '0618': '0_618', '075': '0_75', 1: '1', 150: '1_50', 175: '1_75', 2: '2' };
  const inline = `pLevel_${names[k]}${s === '' ? '' : '2'}`;
  return [
    { id: `pshow${k}${s}`, type: 'bool', title: '', defval: show, inline, group },
    { id: `pvalue${k}${s}`, type: 'float', title: '', defval: value, min: 0, step: 0.1, inline, group },
    { id: `pcolor${k}${s}`, type: 'color', title: '', defval: css, inline, group },
    { id: `pwidth${k}${s}`, type: 'int', title: '', defval: width, min: 1, inline, group },
    { id: `pstyle${k}${s}`, type: 'string', title: '', defval: style, options: STYLES, inline, group },
  ];
});

export const inputConfig: InputConfig[] = [
  ...pitchInputs('', G_PITCH, FS.repeat(14), 5, 34, 'Levels (Prices)'),
  ...pitchInputs('Second', G_PITCH2, FS.repeat(13), 3, 13, 'None'),
  { id: 'zigZag', type: 'bool', title: `First Zig Zag${FS.repeat(3)}`, defval: false, inline: 'ZZ', group: G_ZZ, tooltip: 'Deviation/Depth settings from First Pitchfork' },
  { id: 'zzColor', type: 'color', title: '', defval: '#FF9800', inline: 'ZZ', group: G_ZZ },
  { id: 'zzWidth', type: 'int', title: '', defval: 1, min: 1, inline: 'ZZ', group: G_ZZ },
  { id: 'zzStyle', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'ZZ', group: G_ZZ },
  { id: 'zigZagSecond', type: 'bool', title: `Second Zig Zag${FS.repeat(3)}`, defval: false, inline: 'ZZ2', group: G_ZZ, tooltip: 'Deviation/Depth settings from Second Pitchfork' },
  { id: 'zzColorSecond', type: 'color', title: '', defval: '#FF9800', inline: 'ZZ2', group: G_ZZ },
  { id: 'zzWidthSecond', type: 'int', title: '', defval: 1, min: 1, inline: 'ZZ2', group: G_ZZ },
  { id: 'zzStyleSecond', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'ZZ2', group: G_ZZ },
  { id: 'isFib', type: 'bool', title: 'Pick a Fibonacci Tool', defval: true, inline: 'FIB', group: G_FIB, tooltip: 'Deviation/Depth settings from First Pitchfork' },
  { id: 'fibTool', type: 'string', title: FS.repeat(13), defval: 'Extentions', options: ['Retracements', 'Extentions'], inline: 'FIB', group: G_FIB },
  { id: 'reverse', type: 'bool', title: `Reverse Levels${FS.repeat(3)}`, defval: false, inline: 'fLines', group: G_FIB },
  { id: 'extend', type: 'bool', title: 'Extend Lines', defval: false, inline: 'fLines', group: G_FIB },
  { id: 'levels', type: 'string', title: 'Level Labels', defval: 'Levels', options: LABEL_OPTIONS, inline: 'fLines1', group: G_FIB },
  { id: 'levelsP', type: 'string', title: '', defval: 'Pivot Start', options: ['Last Bar', 'Pivot Start'], inline: 'fLines1', group: G_FIB },
  { id: 'levelsF', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'fLines1', group: G_FIB },
  { id: 'pivot', type: 'string', title: 'Pick a Pivot', defval: 'Camarilla', options: ['Camarilla', 'None'], group: G_PIVOT, tooltip: TIP_PIVOT },
  {
    id: 'pivotTimeframe', type: 'string', title: 'Pivot Points Timeframe', defval: 'Auto', group: G_PIVOT, tooltip: TIP_TF,
    options: ['Auto', '15 Min', '1 Hour', '4 Hour', 'Session', 'Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
  },
  {
    id: 'weekStart', type: 'string', title: '* Start Trading Week from Specific Day', defval: 'Monday', group: G_PIVOT,
    options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], tooltip: 'Applicable for Weekly Pivot Points Timeframe only',
  },
  { id: 'srLabel', type: 'string', title: 'Pivot S&R Levels', defval: 'Levels (Prices)', options: ['Levels', 'Levels (Prices)', 'None'], inline: 'LBL', group: G_PIVOT },
  { id: 'srLabelPos', type: 'string', title: '', defval: 'Pivot End', options: ['Last Bar', 'Pivot End'], inline: 'LBL', group: G_PIVOT },
  { id: 'srLabelSize', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'LBL', group: G_PIVOT },
  { id: 'showR', type: 'bool', title: 'Resistance Lines', defval: true, inline: 'rLevel11', group: G_PIVOT },
  { id: 'styleR', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'rLevel11', group: G_PIVOT },
  { id: 'widthR', type: 'int', title: '', defval: 2, min: 1, inline: 'rLevel11', group: G_PIVOT },
  { id: 'colorR3', type: 'color', title: 'R3', defval: '#ff9800', inline: 'rLevel13', group: G_PIVOT },
  { id: 'colorR4', type: 'color', title: 'R4', defval: '#ff9800', inline: 'rLevel13', group: G_PIVOT },
  { id: 'colorR5', type: 'color', title: 'R5', defval: '#ff9800', inline: 'rLevel13', group: G_PIVOT },
  { id: 'colorR6', type: 'color', title: 'R6', defval: '#ff980000', inline: 'rLevel13', group: G_PIVOT },
  { id: 'showS', type: 'bool', title: 'Support Lines ', defval: true, inline: 'sLevel1', group: G_PIVOT },
  { id: 'styleS', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'sLevel1', group: G_PIVOT },
  { id: 'widthS', type: 'int', title: '', defval: 2, min: 1, inline: 'sLevel1', group: G_PIVOT },
  { id: 'colorS3', type: 'color', title: 'S3', defval: '#ff9800', inline: 'sLevel', group: G_PIVOT },
  { id: 'colorS4', type: 'color', title: 'S4', defval: '#ff9800', inline: 'sLevel', group: G_PIVOT },
  { id: 'colorS5', type: 'color', title: 'S5', defval: '#ff9800', inline: 'sLevel', group: G_PIVOT },
  { id: 'colorS6', type: 'color', title: 'S6', defval: '#ff980000', inline: 'sLevel', group: G_PIVOT },
  { id: 'dispHist', type: 'string', title: 'Show Historical Pivots', defval: 'None', options: ['Selected Pivots', 'None'], group: G_PIVOT },
  ...pitchLevelInputs('', G_PITCH),
  ...pitchLevelInputs('Second', G_PITCH2),
  ...FIB_LEVELS.flatMap(([k, show, value, css, inline]): InputConfig[] => [
    { id: `show${k}`, type: 'bool', title: '', defval: show, inline, group: G_FIB },
    { id: `value${k}`, type: k === '0' || k === '1' ? 'int' : 'float', title: '', defval: value, inline, group: G_FIB },
    { id: `color${k}`, type: 'color', title: '', defval: css, inline, group: G_FIB },
  ]),
];

/** The 8 Camarilla levels in plot order */
const PIVOT_LEVELS = ['R6', 'R5', 'R4', 'R3', 'S3', 'S4', 'S5', 'S6'] as const;

export const plotConfig: PlotConfig[] = PIVOT_LEVELS.map((name, k) => ({
  id: `plot${k}`, title: `Historical ${name}`, color: defaultInputs[`color${name}`], lineWidth: 2, style: 'linebr',
}));

export const metadata = {
  title: 'Auto Pitchfork, Fib Retracement and Zig Zag by DGT',
  shortTitle: 'PITCHFORK ʙʏ DGT ☼☾',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;
/** syminfo.mintick is not available to the port (Bar has no symbol info) */
const MINTICK = 0.01;
const GRAY = '#787B86';
const TEAL = '#00897B';
const CLEAR = '#00000000';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** null = na */
  color: string | null;
  width: number;
  style: 'solid' | 'dashed' | 'dotted';
  extend: 'none' | 'right' | 'both';
  /** xloc.bar_time: x1 and x2 are times */
  byTime: boolean;
  /** kept in a variable of the script: the limit of 500 lines does not delete it */
  held: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string;
  style: 'label_left' | 'label_right' | 'circle';
  size: 'small' | 'normal' | 'auto';
  tooltip: string;
  byTime: boolean;
}

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

const lineStyle = (s: LineStyleName) => (s === 'Solid' ? 'solid' : s === 'Dotted' ? 'dotted' : 'dashed');
const avg = (a: number, b: number) => (a + b) / 2;
const round = (v: number) => math.round(v) as number;

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoPitchforkFibRetracementZigZagInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; linefills: LinefillData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const priceText = (v: number) => str.tostring(v, 'mintick', MINTICK);
  const ms = n > 0 && bars[0].time >= 1e12;
  const atr10 = ta.atr(bars, 10).toArray();

  // Limit of 500 lines: the zigzag lines are the only ones that it can delete (`zzLines`, in creation order); the
  // other live lines (kept in a variable of the script, or made on a bar and deleted on the next one) only count
  const zzLines: Ln[] = [];
  let otherLines = 0;
  const lineCreated = (zz?: Ln) => {
    if (zz) zzLines.push(zz);
    else otherLines++;
    if (zzLines.length + otherLines > MAX_LINES + 5) {
      let excess = zzLines.length + otherLines - MAX_LINES;
      const kept = zzLines.filter((l) => l.held || excess-- <= 0);
      zzLines.length = 0;
      zzLines.push(...kept);
    }
  };

  /**
   * One zigzag. pivots(src, depth / 2, isHigh): the division keeps its fraction (6.5 for a depth of 13); the history
   * index is truncated and the loop runs up to twice the length.
   */
  const zigzag = (depth: number, deviation: number, show: boolean, css: string, width: number, style: LineStyleName) => {
    const half = depth / 2;
    const back = Math.trunc(half);
    const span = half * 2;
    const pivotAt = (i: number, isHigh: boolean): [number, number] => {
      const c = i >= back ? (isHigh ? bars[i - back].high : bars[i - back].low) : 0;
      for (let k = 0; k <= span && k <= i; k++) {
        if (isHigh ? gt(bars[i - k].high, c) : lt(bars[i - k].low, c)) return [NaN, NaN];
      }
      return [i >= back ? i - back : NaN, c];
    };
    const state = {
      line: null as Ln | null,
      iPrev: changeValues(),
      pPrev: changeValues(),
      iLast: changeValues(),
      pLast: changeValues(),
    };
    let iLast = 0;
    let pLast = 0;
    let isHighLast = false;
    let iPrevPivotRef = 0;
    let pPrevPivotRef = 0;
    let iLastPivotRef = 0;
    let pLastPivotRef = 0;
    const swing = (i: number, isHigh: boolean, index: number, price: number) => {
      const dev = (100 * (price - pLast)) / price;
      // pivotFound()
      let id: Ln | null = null;
      let direction = isHighLast;
      if (isHighLast === isHigh && state.line !== null) {
        if (isHighLast ? gt(price, pLast) : lt(price, pLast)) {
          state.line.x2 = index;
          state.line.y2 = price;
          id = state.line;
        }
      } else if (gt(Math.abs(dev), (atr10[i] / bars[i].close) * 100 * deviation)) {
        id = {
          x1: iLast, y1: pLast, x2: index, y2: price, color: show ? css : null, width: show ? width : 1,
          style: show ? lineStyle(style) : 'dashed', extend: 'none', byTime: false, held: true,
        };
        // without the zigzag option the line before is deleted below: only the running line is alive
        lineCreated(show ? id : undefined);
        direction = isHigh;
      }
      if (id === null) return;
      // `id != lineLast` is also true while lineLast is na (the first line): the four values become na
      if (id !== state.line) {
        iPrevPivotRef = state.line?.x1 ?? NaN;
        pPrevPivotRef = state.line?.y1 ?? NaN;
        iLastPivotRef = state.line?.x2 ?? NaN;
        pLastPivotRef = state.line?.y2 ?? NaN;
        if (state.line !== null) {
          state.line.held = false;
          if (!show) otherLines--;
        }
      }
      state.line = id;
      isHighLast = direction;
      iLast = index;
      pLast = price;
    };
    const step = (i: number) => {
      const [iH, pH] = pivotAt(i, true);
      if (!isNaN(iH)) swing(i, true, iH, pH);
      else {
        const [iL, pL] = pivotAt(i, false);
        if (!isNaN(iL)) swing(i, false, iL, pL);
      }
      state.iPrev.update(iPrevPivotRef);
      state.pPrev.update(pPrevPivotRef);
      state.iLast.update(iLastPivotRef);
      state.pLast.update(pLastPivotRef);
    };
    return { state, step };
  };
  const zz1 = zigzag(cfg.depth, cfg.deviation, cfg.zigZag, cfg.zzColor, cfg.zzWidth, cfg.zzStyle);
  const zz2 = zigzag(cfg.depthSecond, cfg.deviationSecond, cfg.zigZagSecond, cfg.zzColorSecond, cfg.zzWidthSecond, cfg.zzStyleSecond);

  // Pitchfork levels in the order of the calls of the original. The second 0.382 level is passed to the function of
  // the first pitchfork there: the port does the same.
  const pitchLevel = (k: PitchKey, s: '' | 'Second') => ({
    show: cfg[`pshow${k}${s}`], level: cfg[`pvalue${k}${s}`], css: cfg[`pcolor${k}${s}`], width: cfg[`pwidth${k}${s}`],
    style: cfg[`pstyle${k}${s}`],
  });
  type PitchCall = ReturnType<typeof pitchLevel>;
  const calls1: PitchCall[] = [
    { show: cfg.pitch, level: 0, css: cfg.medianColor, width: cfg.medianWidth, style: cfg.medianStyle },
    ...PITCH_LEVELS.map(([k]) => pitchLevel(k, '')),
  ];
  const calls2: PitchCall[] = [
    { show: cfg.pitchSecond, level: 0, css: cfg.medianColorSecond, width: cfg.medianWidthSecond, style: cfg.medianStyleSecond },
    ...PITCH_LEVELS.filter(([k]) => k !== '0382').map(([k]) => pitchLevel(k, 'Second')),
  ];
  const stray = pitchLevel('0382', 'Second');
  const fibLevels = FIB_LEVELS.map(([k]) => ({ show: cfg[`show${k}`], level: cfg[`value${k}`], css: cfg[`color${k}`] }));
  const pitchLines1 = cfg.pitch ? 2 * (calls1.filter((c) => c.show).length + (stray.show ? 1 : 0)) : 0;
  const pitchLines2 = cfg.pitchSecond ? 2 * calls2.filter((c) => c.show).length : 0;
  const heldLines = (type: PitchforkType) => 2 + (type !== 'Original' ? 1 : 0) + (type === 'Inside' ? 1 : 0);
  const varLines = (cfg.pitch ? heldLines(cfg.pitchType) : 0) + (cfg.pitchSecond ? heldLines(cfg.pitchTypeSecond) : 0)
    + (cfg.isFib ? fibLevels.length * (cfg.fibTool === 'Extentions' ? 2 : 1) + fibLevels.filter((l) => l.show).length : 0);

  // Higher timeframe of the pivot levels
  const chart = chartTimeframe(bars);
  const info = chart === '' ? null : timeframe.info(chart);
  const fixed: Record<string, string> = {
    '15 Min': '15', '1 Hour': '60', '4 Hour': '240', Session: 'D', Daily: 'D', Weekly: 'W', Monthly: 'M', Quarterly: '3M', Yearly: '12M',
  };
  const htf = fixed[cfg.pivotTimeframe]
    ?? (['1', '3', '5', '15'].includes(chart) ? 'D'
      : ['30', '45', '60', '120', '180', '240'].includes(chart) ? 'W'
        : info?.isdaily ? 'M'
          : info?.isweekly || info?.ismonthly ? '12M' : '3M');
  const starts = periodStarts(bars, htf);
  const dayStarts = htf === 'W' ? periodStarts(bars, 'D') : starts;
  /** dayofweek: 1 = Sunday ... 7 = Saturday (UTC day of the bar) */
  const dayOfWeek = (i: number) => new Date(ms ? bars[i].time : bars[i].time * 1000).getUTCDay() + 1;
  const wStart = { Monday: 2, Tuesday: 3, Wednesday: 4, Thursday: 5, Friday: 6, Saturday: 7, Sunday: 1 }[cfg.weekStart];
  const newPeriod = (i: number) => {
    if (i === 0) return false;
    if (htf === 'D' && cfg.pivotTimeframe === 'Daily') return dayOfWeek(i) !== dayOfWeek(i - 1);
    if (htf === 'W') return dayOfWeek(i) === wStart && dayStarts[i] !== dayStarts[i - 1];
    return starts[i] !== starts[i - 1];
  };

  // f_htf_ohlc() and f_get_pivot()
  let htfH = 0;
  let htfL = 0;
  let htfH1 = 0;
  let htfL1 = 0;
  let htfC1 = 0;
  const camarilla = [0, 0, 0, 0, 0, 0, 0, 0];
  let timeX10 = 0;
  let timeX11 = 0;
  const showHist = cfg.dispHist === 'Selected Pivots';
  const pivotColors = PIVOT_LEVELS.map((name) => cfg[`color${name}`]);
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  for (const p of plotConfig) plots[p.id] = [];

  let tempLines = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    zz1.step(i);
    zz2.step(i);

    // The pitchfork lines of the bar before are deleted, then made again when the running leg ended before this bar
    otherLines -= tempLines;
    tempLines = 0;
    if (i === 0) for (let k = 0; k < varLines; k++) lineCreated();
    const made = (lt(zz1.state.line?.x2 ?? NaN, i) ? pitchLines1 : 0) + (lt(zz2.state.line?.x2 ?? NaN, i) ? pitchLines2 : 0);
    for (let k = 0; k < made; k++) lineCreated();
    tempLines = made;

    const change = newPeriod(i);
    if (change) {
      htfH1 = htfH;
      htfH = b.high;
      htfL1 = htfL;
      htfL = b.low;
      htfC1 = bars[i - 1].close;
      timeX10 = timeX11;
      timeX11 = b.time;
    } else {
      htfH = Math.max(b.high, htfH);
      htfL = Math.min(b.low, htfL);
    }
    if (cfg.pivot === 'Camarilla') {
      const range = htfH1 - htfL1;
      const r5 = (htfH1 / htfL1) * htfC1;
      const r4 = htfC1 + (range * 1.1) / 2;
      const r3 = htfC1 + (range * 1.1) / 4;
      const r6 = r5 + 1.168 * (r5 - r4);
      const s3 = htfC1 - (range * 1.1) / 4;
      const s4 = htfC1 - (range * 1.1) / 2;
      const s5 = htfC1 - (r5 - htfC1);
      const s6 = htfC1 - (r6 - htfC1);
      camarilla.splice(0, 8, r6, r5, r4, r3, s3, s4, s5, s6);
    }
    // islast: the bar is in the last period of the higher timeframe
    const hidden = change || starts[i] === starts[last];
    camarilla.forEach((v, k) => {
      const value = showHist && gt(v, 0) && !hidden && isFinite(v) ? v : NaN;
      plots[`plot${k}`].push({ time: b.time, value, color: pivotColors[k] });
    });
  }

  // Drawings of the last bar
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const linefills: Array<{ a: Ln; b: Ln; color: string }> = [];
  const addLine = (x1: number, y1: number, x2: number, y2: number, extend: Ln['extend'], css: string, style: Ln['style'], width: number): Ln => {
    const l: Ln = { x1, y1, x2, y2, color: css, width, style, extend, byTime: false, held: true };
    lines.push(l);
    return l;
  };
  const sizeOf = (s: TextSize) => (s === 'Small' ? 'small' : 'normal');

  if (n > 0) {
    const close = bars[last].close;
    const pitchfork = (
      zz: ReturnType<typeof zigzag>, on: boolean, type: PitchforkType, hist: number, extendAll: boolean, medianCss: string, medianWidth: number,
      medianStyle: LineStyleName, medianLabels: boolean, labelMode: PitchLabels, labelSize: TextSize, background: number, name: string,
    ) => {
      const { state } = zz;
      const iPrev2 = state.iPrev.get(hist > 0 ? hist + 1 : 1);
      const pPrev2 = state.pPrev.get(hist > 0 ? hist + 1 : 1);
      const iLastP = state.iLast.get(hist > 0 ? hist : 0);
      const pLastP = state.pLast.get(hist > 0 ? hist : 0);
      const iPrev = state.iPrev.get(hist > 0 ? hist : 0);
      const pPrev = state.pPrev.get(hist > 0 ? hist : 0);
      const iEnd = state.line?.x2 ?? NaN;
      const extend = extendAll ? 'both' : 'right';

      // f_getPitchfork()
      let iStartMedian = iPrev2;
      let pStartMedian = pPrev2;
      let iEndMedian = Math.trunc(avg(iPrev, iLastP));
      let pEndMedian = avg(pPrev, pLastP);
      if (type === 'Schiff') pStartMedian = avg(pPrev, pPrev2);
      else if (type === 'Modified Schiff') {
        iStartMedian = Math.trunc(avg(iPrev, iPrev2));
        pStartMedian = avg(pPrev, pPrev2);
      } else if (type === 'Inside') {
        iStartMedian = Math.trunc(avg(iPrev, iLastP));
        pStartMedian = avg(pPrev, pLastP);
        const iDiff = Math.abs(iPrev - iLastP) / 2;
        const pDiff = Math.abs(pPrev - pLastP) / 2;
        const slopeInside = (pLastP - avg(pPrev, pPrev2)) / (iLastP - avg(iPrev, iPrev2));
        const intercept = pLastP + (gt(pPrev, pLastP) ? 1 : -1) * pDiff - slopeInside * (iLastP - iDiff);
        iEndMedian = iEnd;
        pEndMedian = slopeInside * iEndMedian + intercept;
      }
      const slope = (pEndMedian - pStartMedian) / (iEndMedian - iStartMedian);
      const lnr: Ln[] = [];
      const lns: Ln[] = [];

      const median = () => {
        if (!on) return;
        addLine(iStartMedian, pStartMedian, iEndMedian, pEndMedian, extend, medianCss, lineStyle(medianStyle), medianWidth);
        addLine(iPrev, pPrev, iLastP, pLastP, 'none', medianCss, 'solid', medianWidth);
        if (type !== 'Original') addLine(iPrev2, pPrev2, iPrev, pPrev, 'none', medianCss, 'solid', medianWidth);
        if (type === 'Inside') addLine(Math.trunc(round(avg(iPrev, iPrev2))), avg(pPrev, pPrev2), iLastP, pLastP, 'none', medianCss, 'solid', medianWidth);
        const mPrice = slope * last + pStartMedian - slope * iStartMedian;
        if (medianLabels) {
          const tip = priceText(mPrice);
          const text = labelMode === 'Prices' ? tip : labelMode === 'Levels (Prices)' ? `${name} M (${tip})` : `${name} M`;
          labels.push({ x: last, y: mPrice, text: `${text}\n\n`, color: CLEAR, textColor: medianCss, style: 'label_left', size: sizeOf(labelSize), tooltip: tip, byTime: false });
          labels.push({ x: last, y: mPrice, text: '\n\n', color: medianCss, textColor: CLEAR, style: 'circle', size: 'auto', tooltip: '', byTime: false });
        }
      };

      // processPitchforkLevel()
      const level = ({ show, level: lvl, css, width, style }: PitchCall) => {
        if (!on) return;
        const iDiff = Math.abs(iPrev - iLastP) / 2;
        const pDiff = Math.abs(pPrev - pLastP) / 2;
        const baseI = type === 'Inside' ? iStartMedian : iEndMedian;
        const baseP = type === 'Inside' ? pStartMedian : pEndMedian;
        const down = gt(pPrev, pLastP);
        const iStartX = Math.trunc(round(down ? baseI - iDiff * lvl : baseI + iDiff * lvl));
        const interceptX = baseP + pDiff * lvl - slope * iStartX;
        const iStartY = Math.trunc(round(down ? baseI + iDiff * lvl : baseI - iDiff * lvl));
        const interceptY = baseP - pDiff * lvl - slope * iStartY;
        if (!show) return;
        if (lt(iEnd, last)) {
          const st = lineStyle(style);
          lnr.push(addLine(iStartX, slope * iStartX + interceptX, iEnd, slope * iEnd + interceptX, extend, css, st, width));
          lns.push(addLine(iStartY, slope * iStartY + interceptY, iEnd, slope * iEnd + interceptY, extend, css, st, width));
        }
        const rPrice = slope * last + interceptX;
        const sPrice = slope * last + interceptY;
        if (labelMode !== 'None' && Math.abs(lvl) > EPS) {
          const text = (price: number, side: string) => {
            const tip = priceText(price);
            const lv = `${name} ${str.tostring(lvl)} ${side}`;
            return labelMode === 'Prices' ? tip : labelMode === 'Levels (Prices)' ? `${lv} (${tip})` : lv;
          };
          const size = sizeOf(labelSize);
          labels.push({ x: last, y: rPrice, text: `${text(rPrice, 'R')}\n\n`, color: CLEAR, textColor: css, style: 'label_left', size, tooltip: priceText(rPrice), byTime: false });
          labels.push({ x: last, y: sPrice, text: `${text(sPrice, 'S')}\n\n`, color: CLEAR, textColor: css, style: 'label_left', size, tooltip: priceText(sPrice), byTime: false });
          labels.push({ x: last, y: rPrice, text: '\n\n', color: css, textColor: CLEAR, style: 'circle', size: 'auto', tooltip: '', byTime: false });
          labels.push({ x: last, y: sPrice, text: '\n\n', color: css, textColor: CLEAR, style: 'circle', size: 'auto', tooltip: '', byTime: false });
        }
        if (background > 0) {
          const fill = String(color.new(css, background));
          if (lnr.length > 1) linefills.push({ a: lnr[lnr.length - 2], b: lnr[lnr.length - 1], color: fill });
          if (lns.length > 1) linefills.push({ a: lns[lns.length - 2], b: lns[lns.length - 1], color: fill });
        }
      };
      return { median, level, iPrev2, pPrev2, iPrev, pPrev, iLastP, pLastP };
    };

    const pf1 = pitchfork(zz1, cfg.pitch, cfg.pitchType, cfg.histPivot, cfg.pitchExtend, cfg.medianColor, cfg.medianWidth, cfg.medianStyle,
      cfg.pitchLabels !== 'None', cfg.pitchLabels, cfg.pitchLabelSize, cfg.pitchBackground, 'PF1');
    // the median labels of the second pitchfork follow the label option of the first one, as in the original
    const pf2 = pitchfork(zz2, cfg.pitchSecond, cfg.pitchTypeSecond, cfg.histPivotSecond, cfg.pitchExtendSecond, cfg.medianColorSecond,
      cfg.medianWidthSecond, cfg.medianStyleSecond, cfg.pitchLabels !== 'None', cfg.pitchLabelsSecond, cfg.pitchLabelSizeSecond,
      cfg.pitchBackgroundSecond, 'PF2');
    pf1.median();
    calls1.forEach(pf1.level);
    pf2.median();
    pf2.level(calls2[0]);
    pf2.level(calls2[1]);
    pf1.level(stray);
    calls2.slice(2).forEach(pf2.level);

    // processFibLevel()
    if (cfg.isFib) {
      const { iPrev2, pPrev2, iPrev, pPrev, iLastP, pLastP } = pf1;
      const diff = Math.abs(pPrev - pLastP);
      const sign = cfg.reverse ? -1 : 1;
      const ext = cfg.fibTool === 'Extentions';
      for (const { show, level, css } of fibLevels) {
        let price: number;
        if (ext) {
          addLine(iPrev2, pPrev2, iPrev, pPrev, 'none', GRAY, 'dashed', 1);
          addLine(iPrev, pPrev, iLastP, pLastP, 'none', GRAY, 'dashed', 1);
          const offset = Math.abs(pPrev - pPrev2);
          price = lt(pLastP, pPrev) ? pPrev - diff + sign * offset * level : pPrev + diff - sign * offset * level;
        } else {
          addLine(iPrev, pPrev, iLastP, pLastP, 'none', GRAY, 'dashed', 1);
          const from = cfg.reverse ? pLastP : pPrev;
          price = lt(pLastP, pPrev) ? from - sign * diff * level : from + sign * diff * level;
        }
        if (!show) continue;
        addLine(iPrev, price, last, price, cfg.extend ? 'both' : 'right', css, 'solid', 1);
        if (cfg.levels !== 'None') {
          const tip = priceText(price);
          const txt = cfg.levels === 'Levels' ? str.tostring(level) : cfg.levels === 'Prices' ? tip : `${str.tostring(level)} (${tip})`;
          labels.push({
            x: cfg.levelsP === 'Last Bar' ? last : iPrev, y: price, text: `${ext ? 'EXT ' : 'RET '}${txt}\n\n`, color: CLEAR, textColor: css,
            style: cfg.levelsP === 'Last Bar' ? 'label_left' : 'label_right', size: sizeOf(cfg.levelsF), tooltip: tip, byTime: false,
          });
        }
      }
    }

    // f_processPivotLevelX(): the Camarilla levels of the period before, on the last bar
    if (cfg.pivot !== 'None') {
      const timeX21 = 2 * timeX11 - timeX10;
      const nowTime = ms ? Date.now() : Math.floor(Date.now() / 1000);
      PIVOT_LEVELS.forEach((name, k) => {
        const resistance = k < 4;
        if (!(resistance ? cfg.showR : cfg.showS)) return;
        const y = camarilla[k];
        const css = pivotColors[k];
        const ok = gt(y, 0);
        // these lines are made on the last bar: they count for the limit of 500 lines
        lineCreated();
        lines.push({
          x1: timeX11, y1: ok ? y : close, x2: timeX21, y2: ok ? y : close, color: ok ? css : '#ffffff00',
          width: resistance ? cfg.widthR : cfg.widthS, style: lineStyle(resistance ? cfg.styleR : cfg.styleS), extend: 'none', byTime: true,
          held: true,
        });
        if (cfg.srLabel !== 'None') {
          const priced = `${name} (${priceText(y)})`;
          const lastBar = cfg.srLabelPos === 'Last Bar';
          labels.push({
            x: lastBar ? nowTime : timeX21, y: ok ? y : close, text: (cfg.srLabel === 'Levels' ? name : priced) + (lastBar ? '\n\n' : ''),
            color: CLEAR, textColor: ok ? css : CLEAR, style: 'label_left', size: sizeOf(cfg.srLabelSize), tooltip: `${cfg.pivot} ${priced}`,
            byTime: true,
          });
        }
      });
    }
  }

  const interval = barInterval(bars);
  const toLine = (l: Ln): LineDrawingData => ({
    time1: l.byTime ? l.x1 : barTime(bars, l.x1, interval), price1: l.y1, time2: l.byTime ? l.x2 : barTime(bars, l.x2, interval),
    price2: l.y2, color: l.color ?? 'transparent', width: l.width,
    ...(l.style === 'solid' ? {} : { style: l.style }), ...(l.extend === 'none' ? {} : { extend: l.extend }),
  });
  // an object with an na (or infinite) coordinate is not drawn
  const drawn = (l: LineDrawingData) => [l.time1, l.time2, l.price1, l.price2].every((v) => isFinite(v));
  const running = [zz1, zz2].filter((z, k) => !(k === 0 ? cfg.zigZag : cfg.zigZagSecond) && z.state.line !== null).map((z) => z.state.line as Ln);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    lines: [...zzLines, ...running, ...lines].map(toLine).filter(drawn),
    labels: labels.map((l): LabelData => ({
      time: l.byTime ? l.x : barTime(bars, l.x, interval), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style,
      size: l.size, textAlign: 'left', ...(l.tooltip === '' ? {} : { tooltip: l.tooltip }),
    })).filter((l) => isFinite(l.time) && isFinite(l.price)),
    linefills: linefills.map((f) => ({ line1: toLine(f.a), line2: toLine(f.b), color: f.color }))
      .filter((f) => drawn(f.line1) && drawn(f.line2)),
    // var table logo = table.new(position.bottom_right, 1, 1) with one cell
    tables: n > 0
      ? [{ position: 'bottom_right', columns: 1, rows: 1, cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL }] }]
      : [],
  };
}

export const AutoPitchforkFibRetracementZigZag = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
