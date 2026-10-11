/**
 * Fibonacci Auto Trend Scouter
 *
 * Two swing trackers, a long one (21 bars) and a short one (8 bars). A bar that makes the highest high of the
 * period (and not the lowest low) turns the direction up, a bar that makes the lowest low turns it down. Each turn
 * adds a swing point (extreme value, bar time, source price) to a list of 7 points; while the direction holds, a
 * more extreme bar replaces the newest point.
 *
 * From the 7 points of each tracker, on the last bar:
 * - trend lines: a top line and a bottom line between two pairs of points ("Front" = points 1-2, "Mid" = 3-4,
 *   "Back" = 5-6), each with an optional copy extended to the right, coloured by the slope of the channel middle;
 *   an optional "sight" line from the middle of two points through the close; an optional custom pair of lines
 *   between points of both trackers
 * - Fibonacci levels (0, 0.236, 0.382, 0.5, 0.618, 0.786, 1) between the lowest and the highest source price of
 *   the 7 points, recomputed when the newest point changes. Each level has a state from the close (next
 *   resistance, next support, far ...): the next levels and the chosen number of far levels are drawn as short
 *   lines around the last bar, the next levels with a label
 * - optional labels on the swing points and on the two ends of the Fibonacci range
 *
 * Three levels of other timeframes of the same symbol: the EMA of the source on that timeframe, drawn on the last
 * `Size` bars, with a label after the last bar. Every chart bar of a period shows the value of that period at its
 * end (the last period is still open). The bars of the timeframe are built from the chart bars, so the average
 * starts at the first chart bar (the original reads the whole history of the timeframe: the first values differ
 * until the average has converged) and the close of a day or a week is the close of its last chart bar (on stocks
 * the original has the official close of the day, which can differ by a few cents). A level whose
 * timeframe is below the chart timeframe needs data that the bars do not carry: the port throws an Error (with
 * the default timeframes 360 and 720 this happens on daily and higher bars: switch the plot and the label of
 * that level off, or choose a timeframe at or above the chart timeframe).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the
 * session of the symbol (`timezone`, `session`) the periods are those of the exchange calendar, see
 * src/anchor-period.ts. Without them the port uses the UTC calendar and the bars. `timeframe`, when given, is the
 * chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Not ported: the plot style and width inputs of the three levels (the plot configuration is static: a line of
 * width 4, the defaults).
 *
 * Reference: "Fibonacci Auto Trend Scouter" by sirkriz
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: (c) sirkriz
 */

import {
  ta, Series, getSourceSeries, color, timeframe, str, array,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import type { LabelData, LineDrawingData } from '../types';

type Pair = 'Front' | 'Mid' | 'Back';
type Dash = 'Solid' | 'Dashed' | 'Dotted';
type Group = 'Long' | 'Short';
type Trend = 's1' | 's2';
type AnyTrend = Trend | 's3';
type Level = 1 | 2 | 3;
type Ratio = '0' | '236' | '382' | '50' | '618' | '786' | '1';
type FibSide = 'fibLong' | 'fibShort';

export type FibonacciAutoTrendScouterInputs = {
  /** Source of the swing point prices (and of the swing extremes when `trendData` is "Source") */
  src: SourceType;
  /** Swing extremes: the source, or the bar high / low */
  trendData: 'Source' | 'High/Low';
  mediumPeriod: number;
  smallPeriod: number;
  showSmCoordLabels: boolean;
  showMdCoordLabels: boolean;
  s3ShowTop: boolean;
  s3TopFromGroup: Group;
  s3TopFromPair: Pair;
  s3TopToGroup: Group;
  s3TopToPair: Pair;
  s3ShowBtm: boolean;
  s3BottomFromGroup: Group;
  s3BottomFromPair: Pair;
  s3BottomToGroup: Group;
  s3BottomToPair: Pair;
  showFibSrcLine: boolean;
  showFibLabelsGroup: boolean;
  showFibSrcLabel: boolean;
  showFibFarLabels: boolean;
  showFibSrcLabelInfo: 'Ratio' | 'Order' | 'None';
  fibColorStyle: 'Multi' | 'Kind' | 'Default';
  fibColorResistance: string;
  fibColorSupport: string;
  fibColorDefaultS: string;
  fibColorDefault: string;
}
  // Short trend (s1) and long trend (s2): the pairs of points of the top and bottom lines, the sight line
  & { [K in `${Trend}${'TopFrom' | 'TopTo' | 'BottomFrom' | 'BottomTo'}`]: Pair }
  & { [K in `${Trend}${'ShowSight'}`]: boolean }
  & { [K in `${Trend}${'SightStyle'}`]: Dash }
  & { [K in `${Trend}${'SightWidth'}`]: number }
  // Lines of the short, long and custom (s3) trends
  & { [K in `${AnyTrend}${'LineStyle' | 'XlineStyle'}`]: Dash }
  & { [K in `${AnyTrend}${'LineWidth' | 'XlineWidth'}`]: number }
  & { [K in `${AnyTrend}${'LineExtend' | 'UseColors'}`]: boolean }
  & { [K in `${AnyTrend}${'ColorUp' | 'ColorDn' | 'ColorDefault'}`]: string }
  // Levels of other timeframes
  & { [K in `htf${Level}${'Show' | 'Label'}`]: boolean }
  & { [K in `htf${Level}Source`]: SourceType }
  & { [K in `htf${Level}Timeframe`]: string }
  & { [K in `htf${Level}${'Length' | 'Size' | 'Width'}`]: number }
  & { [K in `htf${Level}Style`]: 'Line' | 'Cross' | 'Circle' }
  & { [K in `htf${Level}Color`]: string }
  // Level colours: `fibColor<ratio>` colours the levels of the long tracker, `smFibColor<ratio>` those of the short one
  & { [K in `${'fibColor' | 'smFibColor'}${Ratio}`]: string }
  // Level lines of the long and the short tracker
  & { [K in `${FibSide}${'Far' | 'ActiveWidth' | 'InactiveWidth' | 'Left' | 'Right'}`]: number }
  & { [K in `${FibSide}${'ActiveStyle' | 'InactiveStyle'}`]: Dash };

const PAIRS: Pair[] = ['Front', 'Mid', 'Back'];
const DASHES: Dash[] = ['Solid', 'Dashed', 'Dotted'];
const GROUPS: Group[] = ['Long', 'Short'];
const LEVELS: Level[] = [1, 2, 3];
const RATIOS: Ratio[] = ['0', '236', '382', '50', '618', '786', '1'];

/** Spaces of the original input titles (U+2000 ... U+200D, used there to align the settings) */
const sp = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_v, k) => String.fromCharCode(from + k)).join('');
const EM = '\u2001';

interface Def extends InputConfig { id: keyof FibonacciAutoTrendScouterInputs }

function trendInputs(t: Trend, group: string, tag: string, up: string, down: string): Def[] {
  const n = t === 's1' ? '1' : '2';
  return [
    { id: `${t}TopFrom`, type: 'string', title: 'Top', defval: 'Back', options: PAIRS, group, inline: `${t}topsel` },
    { id: `${t}TopTo`, type: 'string', title: '--->', defval: 'Mid', options: PAIRS, group, inline: `${t}topsel` },
    { id: `${t}BottomFrom`, type: 'string', title: 'Bottom', defval: 'Back', options: PAIRS, group, inline: `${t}btmsel` },
    { id: `${t}BottomTo`, type: 'string', title: '--->', defval: 'Mid', options: PAIRS, group, inline: `${t}btmsel` },
    { id: `${t}LineStyle`, type: 'string', title: 'Lines', defval: 'Solid', options: DASHES, group, inline: `t${t}line` },
    { id: `${t}LineWidth`, type: 'int', title: '', defval: 4, min: 1, group, inline: `t${t}line` },
    { id: `${t}LineExtend`, type: 'bool', title: 'Extend', defval: true, group, inline: `extend${n}` },
    { id: `${t}XlineStyle`, type: 'string', title: '', defval: 'Dashed', options: DASHES, group, inline: `extend${n}` },
    { id: `${t}XlineWidth`, type: 'int', title: '', defval: 1, min: 1, group, inline: `extend${n}` },
    { id: `${t}ShowSight`, type: 'bool', title: 'Sight', defval: false, group, inline: `sight${n}` },
    { id: `${t}SightStyle`, type: 'string', title: '', defval: 'Solid', options: DASHES, group, inline: `sight${n}` },
    { id: `${t}SightWidth`, type: 'int', title: '', defval: 2, min: 1, group, inline: `sight${n}` },
    { id: `${t}UseColors`, type: 'bool', title: 'Colors: ', defval: true, group, inline: tag },
    { id: `${t}ColorUp`, type: 'color', title: 'Up', defval: up, group, inline: tag },
    { id: `${t}ColorDn`, type: 'color', title: 'Down', defval: down, group, inline: tag },
    { id: `${t}ColorDefault`, type: 'color', title: 'Default', defval: '#FFFFFF', group, inline: tag },
  ];
}

function customInputs(): Def[] {
  const group = 'Custom Trend';
  const side = (show: 's3ShowTop' | 's3ShowBtm', name: 'Top' | 'Bottom', tag: string): Def[] => [
    { id: show, type: 'bool', title: name, defval: false, group, inline: `${tag}1` },
    { id: `s3${name}FromGroup`, type: 'string', title: '', defval: 'Long', options: GROUPS, group, inline: `${tag}1` },
    { id: `s3${name}FromPair`, type: 'string', title: '', defval: 'Mid', options: PAIRS, group, inline: `${tag}1` },
    { id: `s3${name}ToGroup`, type: 'string', title: '--->', defval: 'Short', options: GROUPS, group, inline: `${tag}2` },
    { id: `s3${name}ToPair`, type: 'string', title: '', defval: 'Mid', options: PAIRS, group, inline: `${tag}2` },
  ];
  return [
    ...side('s3ShowTop', 'Top', 's3topsel'),
    ...side('s3ShowBtm', 'Bottom', 's3btmsel'),
    { id: 's3LineStyle', type: 'string', title: 'Lines', defval: 'Solid', options: DASHES, group, inline: 'ts3line' },
    { id: 's3LineWidth', type: 'int', title: '', defval: 2, min: 1, group, inline: 'ts3line' },
    { id: 's3LineExtend', type: 'bool', title: 'Extend', defval: false, group, inline: 'extend2' },
    { id: 's3XlineStyle', type: 'string', title: '', defval: 'Dashed', options: DASHES, group, inline: 'extend2' },
    { id: 's3XlineWidth', type: 'int', title: '', defval: 1, min: 1, group, inline: 'extend2' },
    { id: 's3UseColors', type: 'bool', title: 'Colors: ', defval: false, group, inline: 'T2Color' },
    { id: 's3ColorUp', type: 'color', title: 'Up', defval: 'rgba(103, 58, 183, 0.9)', group, inline: 'T2Color' },
    { id: 's3ColorDn', type: 'color', title: 'Down', defval: 'rgba(156, 39, 176, 0.9)', group, inline: 'T2Color' },
    { id: 's3ColorDefault', type: 'color', title: 'Default', defval: '#FFFFFF', group, inline: 'T2Color' },
  ];
}

function levelInputs(k: Level, tf: string, colour: string): Def[] {
  const group = `Higher TF Level ${k}`;
  const tag = (m: number) => `htf${k}_${m}`;
  return [
    { id: `htf${k}Show`, type: 'bool', title: 'Show Plot', defval: true, group, inline: tag(0) },
    { id: `htf${k}Label`, type: 'bool', title: 'Show Label', defval: true, group, inline: tag(0) },
    { id: `htf${k}Source`, type: 'source', title: '', defval: 'close', group, inline: tag(1) },
    { id: `htf${k}Timeframe`, type: 'timeframe', title: '', defval: tf, group, inline: tag(1) },
    { id: `htf${k}Length`, type: 'int', title: 'Length', defval: 13, group, inline: tag(3) },
    { id: `htf${k}Size`, type: 'int', title: 'Size', defval: 200, min: 1, group, inline: tag(3) },
    { id: `htf${k}Style`, type: 'string', title: 'Style: ', defval: 'Line', options: ['Line', 'Cross', 'Circle'], group, inline: tag(2) },
    { id: `htf${k}Width`, type: 'int', title: '', defval: 4, min: 0, group, inline: tag(2) },
    { id: `htf${k}Color`, type: 'color', title: '', defval: colour, group, inline: tag(2) },
  ];
}

function fibColourInputs(): Def[] {
  const group = 'Fibonacci';
  // ratio, default colour, title of the first input, title of the second one
  const rows: Array<[Ratio, string, string, string]> = [
    ['0', '#d1d4dc', `Short 0${EM}`, `${EM.repeat(6)}Long 0${EM}`],
    ['236', '#81c784', 'Short .236', `${EM.repeat(4)} Long .236`],
    ['382', '#4caf50', 'Short .382', `${EM.repeat(4)} Long .382`],
    ['50', '#f44336', 'Short .50', `${EM.repeat(5)} Long .50`],
    ['618', '#fbc02d', 'Short .618', `${EM.repeat(4)} Long .618`],
    ['786', '#64b5f6', 'Short .786', `${EM.repeat(4)} Long .786`],
    ['1', '#d1d4dc', `Short 1${EM}`, `${EM.repeat(6)} Long 1${EM}`],
  ];
  return rows.flatMap(([r, c, first, second]): Def[] => [
    { id: `fibColor${r}`, type: 'color', title: first, defval: c, group, inline: `fibcol${r}` },
    { id: `smFibColor${r}`, type: 'color', title: second, defval: c, group, inline: `fibcol${r}` },
  ]);
}

function fibLineInputs(side: FibSide, group: string, far: string, left: number, right: number, row: string): Def[] {
  return [
    { id: `${side}Far`, type: 'int', title: far, defval: 1, min: 0, max: 6, group },
    { id: `${side}ActiveStyle`, type: 'string', title: 'Active Line', defval: 'Solid', options: DASHES, group, inline: 'fibactive' },
    { id: `${side}ActiveWidth`, type: 'int', title: '', defval: 2, min: 1, group, inline: 'fibactive' },
    { id: `${side}InactiveStyle`, type: 'string', title: 'Inactive Line', defval: 'Dotted', options: DASHES, group, inline: 'fibinactive' },
    { id: `${side}InactiveWidth`, type: 'int', title: '', defval: 1, min: 1, group, inline: 'fibinactive' },
    { id: `${side}Left`, type: 'int', title: 'Size: Left', defval: left, min: 0, group, inline: row },
    { id: `${side}Right`, type: 'int', title: 'Right', defval: right, min: 0, group, inline: row },
  ];
}

const DEFS: Def[] = [
  { id: 'src', type: 'source', title: 'Source data:', defval: 'hlc3', group: 'Trend', inline: 'period' },
  { id: 'trendData', type: 'string', title: 'Trend Coords:', defval: 'High/Low', options: ['Source', 'High/Low'], group: 'Trend', inline: 'period2' },
  { id: 'mediumPeriod', type: 'int', title: 'Length: \u200D\u200DLong', defval: 21, group: 'Trend', inline: 'period1' },
  { id: 'smallPeriod', type: 'int', title: 'Short', defval: 8, group: 'Trend', inline: 'period1' },
  { id: 'showSmCoordLabels', type: 'bool', title: 'Short HH/LL Labels', defval: false, group: 'Trend' },
  { id: 'showMdCoordLabels', type: 'bool', title: 'Long HH/LL Labels', defval: false, group: 'Trend' },
  ...trendInputs('s1', 'Short Trend', 'TColor', 'rgba(33, 150, 243, 0.9)', 'rgba(255, 152, 0, 0.9)'),
  ...trendInputs('s2', 'Long Trend', 'T2Color', 'rgba(76, 175, 80, 0.9)', 'rgba(255, 82, 82, 0.9)'),
  ...customInputs(),
  ...levelInputs(1, '360', 'rgba(255, 235, 59, 0.5)'),
  ...levelInputs(2, '720', 'rgba(0, 188, 212, 0.5)'),
  ...levelInputs(3, '1D', 'rgba(178, 181, 190, 0.5)'),
  { id: 'showFibSrcLine', type: 'bool', title: `Show source line${sp(0x2000, 0x200d)}`, defval: false, group: 'Fibonacci', inline: 'fiblvlconf1' },
  { id: 'showFibLabelsGroup', type: 'bool', title: 'Show TF on labels', defval: false, group: 'Fibonacci', inline: 'fiblvlconf1' },
  { id: 'showFibSrcLabel', type: 'bool', title: `Show source labels${sp(0x2001, 0x2009)}`, defval: false, group: 'Fibonacci', inline: 'fiblvlconf2' },
  { id: 'showFibFarLabels', type: 'bool', title: 'Show far labels', defval: false, group: 'Fibonacci', inline: 'fiblvlconf2' },
  { id: 'showFibSrcLabelInfo', type: 'string', title: 'Show Info', defval: 'Order', options: ['Ratio', 'Order', 'None'], group: 'Fibonacci', inline: 'fiblvlconf3' },
  { id: 'fibColorStyle', type: 'string', title: 'Coloring', defval: 'Multi', options: ['Multi', 'Kind', 'Default'], group: 'Fibonacci', inline: 'fiblvlconf3' },
  { id: 'fibColorResistance', type: 'color', title: 'Resistance', defval: '#e91e63', group: 'Fibonacci', inline: 'fibrescol' },
  { id: 'fibColorSupport', type: 'color', title: `${sp(0x2000, 0x200d)}Support`, defval: '#2196f3', group: 'Fibonacci', inline: 'fibrescol' },
  ...fibColourInputs(),
  { id: 'fibColorDefaultS', type: 'color', title: 'Default Short', defval: '#FFFFFF', group: 'Fibonacci', inline: 'fibdefcol' },
  { id: 'fibColorDefault', type: 'color', title: `${sp(0x2000, 0x2004)}Default Long`, defval: '#B2B5BE', group: 'Fibonacci', inline: 'fibdefcol' },
  ...fibLineInputs('fibLong', 'Fib Long TF', 'Long TF far levels shown', 20, 10, 'fibsizerow1'),
  ...fibLineInputs('fibShort', 'Fib Short TF', 'Short TF far levels shown', 10, 20, 'fibsizerow2'),
];

export const inputConfig: InputConfig[] = DEFS;

export const defaultInputs = Object.fromEntries(DEFS.map((d) => [d.id, d.defval])) as FibonacciAutoTrendScouterInputs;

export const plotConfig: PlotConfig[] = LEVELS.map((k) => ({
  id: `plot${k - 1}`, title: 'HTF 1', color: String(defaultInputs[`htf${k}Color`]), lineWidth: 4,
}));

export const metadata = {
  title: 'Fibonacci Auto Trend Scouter',
  shortTitle: 'FATS',
  overlay: true,
};

// Colour constants of Pine version 4
const CLEAR_BLACK = String(color.new('#363A45', 100));
const CLEAR_WHITE = String(color.new('#FFFFFF', 100));
const WHITE = '#FFFFFF';
const YELLOW = '#FFEB3B';
const BLUE = '#2196F3';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

const dash = (d: Dash) => (d === 'Solid' ? 'solid' : d === 'Dashed' ? 'dashed' : 'dotted');

/** A swing point: the extreme value, the bar time (ms) and the source price */
interface Ball { v: number; x: number; y: number }

/** One swing tracker (the long or the short one) */
interface Track {
  /** Offset to the highest / lowest bar of the period, per bar */
  highBars: number[];
  lowBars: number[];
  /** True: the swing test reads the extreme as a condition (0 is false), as the short tracker of the original */
  asCondition: boolean;
  direction: number;
  /** value, time, price of each point, the newest first (21 numbers at most) */
  bag: number[];
  ready: boolean;
  /** The 7 points (na until the list is full) */
  balls: Ball[];
  /** True when the newest point differs from the one of the previous bar */
  changed: boolean;
  /** The 7 Fibonacci levels (empty until the first change of a full list) */
  fibs: number[];
}

const NO_BALLS: Ball[] = Array.from({ length: 7 }, () => ({ v: NaN, x: NaN, y: NaN }));
const MAX_BAG = 21;

/** Range of the 7 points: lowest and highest price with their times, and the direction from the older to the newer */
function fibSource(balls: Ball[]): { minX: number; minY: number; maxX: number; maxY: number; dir: number } {
  const values = balls.map((b) => b.y);
  const maxY = array.max(values);
  const maxIdx = array.indexof(values, maxY);
  const maxX = maxIdx >= 0 ? balls[maxIdx].x : NaN;
  const minY = array.min(values);
  const minIdx = array.indexof(values, minY);
  const minX = minIdx >= 0 ? balls[minIdx].x : NaN;
  return { minX, minY, maxX, maxY, dir: lt(minX, maxX) ? 1 : gt(minX, maxX) ? -1 : 0 };
}

/** The trackers and their step, to be called on every bar in order */
function createTracks(bars: Bar[], cfg: FibonacciAutoTrendScouterInputs): { md: Track; sm: Track; step: (i: number) => void; ms: number[] } {
  const unit = bars.length > 0 && bars[0].time >= 1e12 ? 1 : 1000;
  const ms = bars.map((b) => b.time * unit);
  const srcSeries = getSourceSeries(bars, cfg.src);
  const src = srcSeries.toArray().map((v) => v ?? NaN);
  const useSrc = cfg.trendData === 'Source';
  const hic = useSrc ? src : bars.map((b) => b.high);
  const loc = useSrc ? src : bars.map((b) => b.low);
  const hicSeries = useSrc ? srcSeries : Series.fromArray(bars, hic);
  const locSeries = useSrc ? srcSeries : Series.fromArray(bars, loc);
  const offsets = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const track = (period: number, asCondition: boolean): Track => ({
    highBars: offsets(ta.highestbars(hicSeries, period)),
    lowBars: offsets(ta.lowestbars(locSeries, period)),
    asCondition, direction: 0, bag: [], ready: false, balls: NO_BALLS, changed: false, fibs: [],
  });
  const md = track(cfg.mediumPeriod, false);
  const sm = track(cfg.smallPeriod, true);

  const add = (bag: number[], value: number, time: number, price: number) => {
    bag.unshift(value, time, price);
    if (bag.length > MAX_BAG) bag.length -= 3;
  };

  const stepTrack = (t: Track, i: number) => {
    const highCoord = t.highBars[i] === 0 ? hic[i] : NaN;
    const lowCoord = t.lowBars[i] === 0 ? loc[i] : NaN;
    const newHigh = (t.asCondition ? truthy(highCoord) : !isNaN(highCoord)) && isNaN(lowCoord);
    const newLow = (t.asCondition ? truthy(lowCoord) : !isNaN(lowCoord)) && isNaN(highCoord);
    const before = t.direction;
    t.direction = newHigh ? 1 : newLow ? -1 : t.direction;
    const value = t.direction === 1 ? highCoord : lowCoord;
    // change(direction) is na on the first bar
    if (i > 0 && t.direction !== before) {
      add(t.bag, value, ms[i], src[i]);
    } else if (t.bag.length === 0) {
      add(t.bag, value, ms[i], src[i]);
    } else if ((t.direction === 1 && gt(value, t.bag[0])) || (t.direction === -1 && lt(value, t.bag[0]))) {
      t.bag[0] = value;
      t.bag[1] = ms[i];
      t.bag[2] = src[i];
    }

    const previous = t.balls[0];
    t.ready = t.bag.length > 18;
    t.balls = t.ready
      ? Array.from({ length: 7 }, (_v, k) => ({ v: t.bag[3 * k], x: Math.round(t.bag[3 * k + 1]), y: t.bag[3 * k + 2] }))
      : NO_BALLS;
    const first = t.balls[0];
    t.changed = truthy(first.y - previous.y) || truthy(first.x - previous.x) || truthy(first.v - previous.v);

    if (t.ready && t.changed) {
      const { minY, maxY, dir } = fibSource(t.balls);
      // getFibRetracements(dir, L, H) with L = the older end of the range: the levels go from the newer end (0) back
      const L = dir === 1 ? minY : maxY;
      const H = dir === 1 ? maxY : minY;
      t.fibs = [H, ...[23.6, 38.2, 50.0, 61.8, 78.6].map((p) => H - (H - L) * (p / 100)), L];
    }
  };

  return { md, sm, ms, step: (i) => { stepTrack(md, i); stepTrack(sm, i); } };
}

type Point = [time: number, price: number];

/** The higher (top) or lower (bottom) point of a pair of swing points; the price is the source or the extreme */
function selection(t: Track, top: boolean, pair: Pair, useSrc: boolean): Point {
  const k = pair === 'Front' ? 0 : pair === 'Mid' ? 2 : 4;
  const a = t.balls[k];
  const b = t.balls[k + 1];
  const y1 = useSrc ? a.y : a.v;
  const y2 = useSrc ? b.y : b.v;
  const y = top ? Math.max(y1, y2) : Math.min(y1, y2);
  return [eq(y, y1) ? a.x : b.x, y];
}

/** Top and bottom line of a tracker, and the direction of the middle of the channel */
function channel(t: Track, id: Trend, cfg: FibonacciAutoTrendScouterInputs): { topFrom: Point; topTo: Point; bottomFrom: Point; bottomTo: Point; up: boolean } {
  const useSrc = cfg.trendData === 'Source';
  const topFrom = selection(t, true, cfg[`${id}TopFrom`], useSrc);
  const topTo = selection(t, true, cfg[`${id}TopTo`], useSrc);
  const bottomFrom = selection(t, false, cfg[`${id}BottomFrom`], useSrc);
  const bottomTo = selection(t, false, cfg[`${id}BottomTo`], useSrc);
  return { topFrom, topTo, bottomFrom, bottomTo, up: gt((topTo[1] + bottomTo[1]) / 2, (topFrom[1] + bottomFrom[1]) / 2) };
}

/**
 * State of a level from the close: 0 = top level still rising (the bar high), 1 = far resistance, 2 = next
 * resistance, 3 = next support, 4 = far support, 5 = bottom level still falling (the bar low), -1 = none.
 */
function fibState(dir: number, prev: number, level: number, next: number, bar: Bar): number {
  const c = bar.close;
  if (dir === 1 && prev === -1) return eq(level, bar.high) ? 0 : gt(c, level) ? 3 : lt(c, next) ? 1 : 2;
  if (dir === 1 && next === -1) return lt(c, level) ? 2 : gt(c, next) ? 4 : 3;
  if (dir === 1) {
    return ge(c, level) && le(c, prev) ? 3 : ge(c, level) && ge(c, prev) ? 4
      : le(c, level) && ge(c, next) ? 2 : le(c, level) && le(c, next) ? 1 : -1;
  }
  if (dir === -1 && next === -1) return gt(c, level) ? 3 : lt(c, prev) ? 1 : 2;
  if (dir === -1 && prev === -1) return eq(level, bar.low) ? 5 : lt(c, level) ? 2 : gt(c, next) ? 4 : 3;
  if (dir === -1) {
    return ge(c, level) && le(c, next) ? 3 : ge(c, level) && ge(c, next) ? 4
      : le(c, level) && ge(c, prev) ? 2 : le(c, level) && le(c, prev) ? 1 : -1;
  }
  return -1;
}

/** States of the 7 levels (0 for every level before the first levels exist) */
function fibStates(fibs: number[], dir: number, bar: Bar): number[] {
  return RATIOS.map((_r, k) => (fibs.length >= k + 1
    ? fibState(dir, k === 0 ? -1 : fibs[k - 1], fibs[k], k === 6 ? -1 : fibs[k + 1], bar)
    : 0));
}

/** "1 D 2 H 3 m " from a number of seconds (seconds only below one day) */
function timeToString(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds - d * 86400) / 3600);
  const m = Math.floor((seconds - d * 86400 - h * 3600) / 60);
  const s = Math.floor(seconds - d * 86400 - h * 3600 - m * 60);
  let ret = d > 0 ? `${str.tostring(d)} D ` : '';
  ret += h > 0 ? `${str.tostring(h)} H ` : '';
  ret += m > 0 ? `${str.tostring(m)} m ` : '';
  if (d === 0) ret += s > 0 ? `${str.tostring(s)} s ` : '';
  return ret;
}

/** Name of a timeframe on its label: a number of minutes as a duration, else the timeframe string */
function timeframeToString(tf: string): string {
  const chars = str.split(tf, '');
  const last = str.tonumber(chars[chars.length - 1]);
  return last === null || Number.isNaN(last) ? tf : timeToString((str.tonumber(tf) ?? NaN) * 60);
}

/**
 * security(tickerid, tf, ...) on the chart symbol with lookahead: the bars of timeframe `tf` built from the chart
 * bars, and the function that brings one value per bar of that timeframe back to the chart bars (every chart bar
 * of a period shows the value of the period).
 */
function timeframeBars(bars: Bar[], tf: string, name: string, context?: ChartContext): { htf: Bar[]; toChart: (values: number[]) => number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, toChart: (values) => values };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Fibonacci Auto Trend Scouter: the timeframe "${tf}" of ${name} is lower than the chart timeframe "${chart}": the chart bars do not have that data (choose another timeframe or switch "Show Plot" and "Show Label" of that level off)`);
  }
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, toChart: (values) => exchange.group.map((g) => values[g]) };
  const starts = periodStarts(bars, tf, context);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });
  return { htf, toChart: (values) => group.map((g) => values[g]) };
}

export function calculate(bars: Bar[], inputs: Partial<FibonacciAutoTrendScouterInputs> = {}, chart?: ChartContext): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;

  // Levels of other timeframes: ema(source, length) on the bars of the timeframe
  const levels = LEVELS.map((k) => {
    if (!cfg[`htf${k}Show`] && !cfg[`htf${k}Label`]) return null;
    const { htf, toChart } = timeframeBars(bars, cfg[`htf${k}Timeframe`], `Higher TF Level ${k}`, chart);
    return toChart(ta.ema(getSourceSeries(htf, cfg[`htf${k}Source`]), cfg[`htf${k}Length`]).toArray().map((v) => v ?? NaN));
  });
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  LEVELS.forEach((k) => {
    const values = levels[k - 1];
    // show_last = Size: only the last `Size` bars are drawn
    const from = n - cfg[`htf${k}Size`];
    plots[`plot${k - 1}`] = bars.map((b, i) => (values && cfg[`htf${k}Show`] && i >= from && Number.isFinite(values[i])
      ? { time: b.time, value: values[i], color: cfg[`htf${k}Color`] }
      : { time: b.time, value: NaN }));
  });

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const result = (): IndicatorResult => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots, lines, labels,
  });
  if (n === 0) return result();

  const tracks = createTracks(bars, cfg);
  for (let i = 0; i < n; i++) tracks.step(i);
  const { md, sm, ms } = tracks;

  // Everything below is the state of the last bar: the original deletes and redraws its objects on every bar
  const bar = bars[last];
  const now = ms[last];
  const candle = last > 0 ? now - ms[last - 1] : NaN;
  const unit = bars[0].time >= 1e12 ? 1 : 1000;
  type LineOptions = Pick<LineDrawingData, 'color' | 'width' | 'style' | 'extend'>;
  // An object with an na coordinate is not drawn
  const addLine = (x1: number, y1: number, x2: number, y2: number, options: LineOptions) => {
    if ([x1, y1, x2, y2].every(Number.isFinite)) lines.push({ time1: x1 / unit, price1: y1, time2: x2 / unit, price2: y2, ...options });
  };
  const addLabel = (x: number, y: number, options: Omit<LabelData, 'time' | 'price'>) => {
    if (Number.isFinite(x) && Number.isFinite(y)) labels.push({ time: x / unit, price: y, ...options });
  };

  // Labels of the swing points
  const coordLabels = (t: Track, show: boolean, group: Group, type: number) => {
    let pos = gt(t.balls[0].y, t.balls[1].y) ? 1 : 2;
    t.balls.forEach((b, k) => {
      const id = k + 1;
      const above = pos === 1;
      pos = above ? 2 : 1;
      if (!show) return;
      const prev = k < 6 ? t.balls[k + 1] : { x: -1, y: -1 };
      const barsAfterPrev = (b.x - prev.x) / candle;
      const sign = gt(b.y, prev.y) ? '+ ' : '- ';
      const tooltip = ` ${group} ${str.tostring(id)} | $${str.tostring(b.y, '#.##')}`
        + `\n x: ${str.tostring(b.x)}\n y: ${str.tostring(b.y)}\n v: ${str.tostring(b.v)}`
        + '\n----------------------\n Time since last coord:'
        + `\n ${timeToString((b.x - prev.x) / 1000)}\n ${str.tostring(barsAfterPrev)} bars`
        + '\n----------------------\n Value diff to last coord:'
        + `\n ${sign}${str.tostring(Math.abs(b.y - prev.y), '#.##')}`
        + `\n ${sign}${str.tostring(Math.abs((b.y - prev.y) / prev.y) * 100, '#.###')} %`
        + '\n----------------------\n Change per bar: '
        + `\n ${sign}${str.tostring(Math.abs((b.y - prev.y) / barsAfterPrev), '#.##')}`
        + `\n ${sign}${str.tostring(Math.abs(((b.y - prev.y) / barsAfterPrev) / prev.y) * 100, '#.###')} %`
        + '\n-------------------------';
      addLabel(b.x, b.y, {
        yloc: above ? 'abovebar' : 'belowbar',
        color: CLEAR_BLACK,
        textColor: type > 1 ? (type === 2 ? BLUE : YELLOW) : WHITE,
        style: type === 1 ? 'label_down' : 'label_up',
        size: 'small',
        text: above ? `${str.tostring(id)}\n\u25BC` : `\u25B2\n${str.tostring(id)}`,
        tooltip,
      });
    });
  };
  coordLabels(sm, cfg.showSmCoordLabels, 'Short', 1);
  coordLabels(md, cfg.showMdCoordLabels, 'Long', 3);

  // Trend lines
  const useSrc = cfg.trendData === 'Source';
  const NA: Point = [NaN, NaN];
  const trendLine = (id: AnyTrend, from: Point, to: Point, lineColor: string) => {
    addLine(from[0], from[1], to[0], to[1], {
      extend: 'none', color: lineColor, style: dash(cfg[`${id}LineStyle`]), width: cfg[`${id}LineWidth`],
    });
  };
  const extension = (id: AnyTrend, from: Point, to: Point, lineColor: string) => {
    if (!cfg[`${id}LineExtend`]) return;
    addLine(from[0], from[1], to[0], to[1], {
      extend: 'right', color: lineColor, style: dash(cfg[`${id}XlineStyle`]), width: cfg[`${id}XlineWidth`],
    });
  };
  const trend = (id: Trend, t: Track, eye: [Ball, Ball]) => {
    const { topFrom, topTo, bottomFrom, bottomTo, up } = channel(t, id, cfg);
    const colourOf = (isUp: boolean) => (!cfg[`${id}UseColors`] ? cfg[`${id}ColorDefault`] : isUp ? cfg[`${id}ColorUp`] : cfg[`${id}ColorDn`]);
    const lineColor = colourOf(up);
    const own = t.ready;
    trendLine(id, own ? topFrom : NA, own ? topTo : NA, lineColor);
    extension(id, own ? topFrom : NA, own ? topTo : NA, lineColor);
    trendLine(id, own ? bottomFrom : NA, own ? bottomTo : NA, lineColor);
    // as the original: the start of the extended bottom line always waits for the long tracker
    extension(id, md.ready ? bottomFrom : NA, own ? bottomTo : NA, lineColor);
    // sight line: from the middle of two points through the close of the bar
    const show = cfg[`${id}ShowSight`];
    const eyeY = (eye[0].y + eye[1].y) / 2;
    addLine(show ? (eye[0].x + eye[1].x) / 2 : NaN, show ? eyeY : NaN, now, bar.close, {
      extend: 'right', color: colourOf(lt(eyeY, bar.close)), style: dash(cfg[`${id}SightStyle`]), width: cfg[`${id}SightWidth`],
    });
  };
  trend('s1', sm, [sm.balls[2], sm.balls[3]]);
  trend('s2', md, [md.balls[5], md.balls[4]]);

  // Custom lines between points of both trackers
  const custom = (show: boolean, top: boolean, fromGroup: Group, fromPair: Pair, toGroup: Group, toPair: Pair) => {
    const from = selection(fromGroup === 'Long' ? md : sm, top, fromPair, useSrc);
    const to = selection(toGroup === 'Long' ? md : sm, top, toPair, useSrc);
    const lineColor = !cfg.s3UseColors ? cfg.s3ColorDefault : gt(to[1], from[1]) ? cfg.s3ColorUp : cfg.s3ColorDn;
    const on = show && md.ready;
    trendLine('s3', on ? from : NA, on ? to : NA, lineColor);
    extension('s3', on ? from : NA, on ? to : NA, lineColor);
  };
  custom(cfg.s3ShowTop, true, cfg.s3TopFromGroup, cfg.s3TopFromPair, cfg.s3TopToGroup, cfg.s3TopToPair);
  custom(cfg.s3ShowBtm, false, cfg.s3BottomFromGroup, cfg.s3BottomFromPair, cfg.s3BottomToGroup, cfg.s3BottomToPair);

  // Fibonacci range of each tracker: source line and labels
  const kind = cfg.fibColorStyle === 'Kind';
  const source = (t: Track, name: string) => {
    const s = fibSource(t.balls);
    if (cfg.showFibSrcLine) {
      // drawFibSrcLine(dir, x1 = minX, y1 = minY, x2 = maxX, y2 = maxY)
      const highIsFirst = eq(Math.max(s.minY, s.maxY), s.minY);
      const lowIsFirst = eq(Math.min(s.minY, s.maxY), s.minY);
      const xH = highIsFirst ? s.minX : s.maxX;
      const yH = highIsFirst ? s.minY : s.maxY;
      const xL = lowIsFirst ? s.minX : s.maxX;
      const yL = lowIsFirst ? s.minY : s.maxY;
      const up = s.dir === 1;
      addLine(up ? xL : xH, up ? yL : yH, up ? xH : xL, up ? yH : yL, {
        extend: 'none', color: kind ? (up ? cfg.fibColorSupport : cfg.fibColorResistance) : cfg.fibColorDefault,
        style: 'dotted', width: 3,
      });
    }
    if (cfg.showFibSrcLabel) {
      const end = (high: boolean, x: number, y: number) => addLabel(x, y, {
        yloc: high ? 'abovebar' : 'belowbar',
        color: CLEAR_BLACK,
        textColor: kind ? (high ? cfg.fibColorResistance : cfg.fibColorSupport) : cfg.fibColorDefault,
        style: high ? 'label_down' : 'label_up',
        size: 'small',
        text: high ? 'H\n\u25BC' : '\u25B2\nL',
        tooltip: `${name} Fib ${high ? 'High' : 'Low'} \n$( ${str.tostring(y)} )`,
      });
      end(false, s.minX, s.minY);
      end(true, s.maxX, s.maxY);
    }
    return s.dir;
  };
  const mdDir = source(md, 'MD');
  const smDir = source(sm, 'SM');

  // Fibonacci levels: lines, then labels
  const RATIO_TEXT = ['0', '.236', '.382', '.5', '.618', '.768', '1'];
  const fibLevels = (t: Track, dir: number, long: boolean) => {
    const side: FibSide = long ? 'fibLong' : 'fibShort';
    const states = fibStates(t.fibs, dir, bar);
    const first = long ? 1 : 8;
    const nextUp = array.indexof(states, 2) + first;
    const nextDown = array.indexof(states, 3) + first;
    const far = cfg[`${side}Far`];
    const levelColour = (k: number, state: number) => {
      if (cfg.fibColorStyle === 'Multi') return cfg[`${long ? 'fibColor' : 'smFibColor'}${RATIOS[k]}`];
      if (cfg.fibColorStyle === 'Default') return long ? cfg.fibColorDefault : cfg.fibColorDefaultS;
      if (kind && (state === 1 || state === 2)) return cfg.fibColorResistance;
      if (kind && (state === 3 || state === 4)) return cfg.fibColorSupport;
      return cfg.fibColorDefault;
    };
    const isFar = (id: number) => (id >= nextUp && id <= nextUp + far) || (id >= nextDown - far && id <= nextDown);
    const left = now - candle * cfg.fibLongLeft;
    t.fibs.forEach((v, k) => {
      const state = states[k];
      const next = state === 2 || state === 3;
      const draw = isFar(first + k) || next;
      const from = long ? left : now - candle * cfg.fibShortLeft;
      const to = now + candle * cfg[`${side}Right`];
      addLine(draw ? from : NaN, v, draw ? to : NaN, v, {
        style: dash(next || state === 0 ? cfg[`${side}ActiveStyle`] : cfg[`${side}InactiveStyle`]),
        color: levelColour(k, state),
        width: next ? cfg[`${side}ActiveWidth`] : cfg[`${side}InactiveWidth`],
        extend: 'none',
      });
    });
    t.fibs.forEach((v, k) => {
      const state = states[k];
      const draw = (cfg.showFibFarLabels && isFar(first + k)) || state === 2 || state === 3;
      const order = str.tostring(k + 1);
      const details = cfg.showFibSrcLabelInfo === 'Ratio' ? RATIO_TEXT[k] : cfg.showFibSrcLabelInfo === 'Order' ? order : '';
      addLabel(draw ? (long ? left : now + candle * cfg.fibShortRight) : NaN, v, {
        text: `${dir === -1 ? '\u25B2 ' : '\u25BC '}${details}${cfg.showFibLabelsGroup ? (long ? ' L' : ' S') : ''}`,
        color: CLEAR_WHITE,
        style: long ? 'label_right' : 'label_left',
        textColor: levelColour(k, state),
        size: 'normal',
        textAlign: long ? 'right' : 'left',
        tooltip: `${long ? 'Long' : 'Short'} TF [ ${order} ]\nRatio: ${RATIO_TEXT[k]}\nPrice: $${str.tostring(Math.trunc(v))}`,
      });
    });
  };
  fibLevels(md, mdDir, true);
  fibLevels(sm, smDir, false);

  // Labels of the levels of other timeframes, 2 bars after the last bar
  LEVELS.forEach((k) => {
    const values = levels[k - 1];
    if (!cfg[`htf${k}Label`] || !values) return;
    const txt = timeframeToString(cfg[`htf${k}Timeframe`]);
    addLabel(now + candle * 2, values[last], {
      color: CLEAR_BLACK,
      textColor: cfg[`htf${k}Color`],
      style: 'label_left',
      size: 'normal',
      text: `\u140A ${txt}`,
      tooltip: `HTF  [ ${txt} ] ${str.tostring(values[last], '#.##')}`,
    });
  });

  return result();
}

export const FibonacciAutoTrendScouter = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
