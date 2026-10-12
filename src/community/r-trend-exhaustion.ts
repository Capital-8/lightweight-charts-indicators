/**
 * %R Trend Exhaustion
 *
 * Two Williams %R lines: a fast one (21 bars) and a slow one (112 bars), %R = 100 * (source - highest high) /
 * (highest high - lowest low), each smoothed with the chosen moving average. Both lines in the top zone (above
 * -threshold) is an overbought trend, both in the bottom zone (below -100 + threshold) an oversold trend. The "Average"
 * formula uses the smoothed mean of the two raw lines instead. The script marks the start of a trend (a character),
 * every bar of the trend (a square) and the bar where it ends (a triangle, the "reversal"). With "Draw Boxes on Chart"
 * a box on the price pane spans the high / low range of each trend (at most "#" boxes) and a triangle on the price pane
 * marks the top (overbought) or bottom (oversold) of the box on the reversal bar. Optional: dots on the crosses of
 * the two lines, triangles on crosses of the -50 line, and entry markers of a selected strategy.
 *
 * The "Signal to TTS" plot (data window) is the value of the "tts_convention" library (by jason5480, ported here): a
 * handshake value on the first bar (16^10: schema 0.1, framework 0), then 10 * long + short, where a channel is 2
 * on a deal start and 0 otherwise.
 * The moving average types are the `ma` function of the library "ta" by HeWhoMustNotBeNamed (ported here); its
 * "highlow" type is the mid value of the highest high and the lowest low (it does not read the source).
 *
 * Chart context (optional third argument): `chart.foregroundColor` (Pine `chart.fg_color`) colours the fast and
 * average %R lines, the middle line and the strategy texts. Without it #DBDBDB.
 *
 * Limits of the port: the alerts (6 alert conditions and 6 alert() calls with their inputs) give no output.
 *
 * Reference: "%R Trend Exhaustion [upslidedown]" by upslidedown
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © upslidedown
 */

import {
  ta, color, Series, box, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box,
} from 'oakscriptjs';
import type { BoxData, MarkerData, MarkerPosition } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';

const MODE1 = '1 Oscillator Mode';
const MODE2 = '2 Overlay Mode (top and bottom no oscillator)';
const MODE3 = '3 Candle Mode';
type Mode = typeof MODE1 | typeof MODE2 | typeof MODE3;
const FORMULA1 = 'Standard (2 Period)';
const FORMULA2 = 'Average';
type SmoothType = 'sma' | 'ema' | 'hma' | 'rma' | 'wma' | 'vwma' | 'swma' | 'highlow' | 'linreg' | 'median' | 'mom' | 'percentrank';
const STRATEGIES = [
  '1 Trend Following @ Square',
  '2 Reversal @ Square',
  '3 Reversal Trade @ Triangle',
  '4 Re-enter Trend Trade @ Triangle',
  '5 Pings',
  '6 Zero Line Cross',
] as const;
type StrategyEntry = (typeof STRATEGIES)[number];
type SourceName = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'hlcc4' | 'ohlc4' | 'volume';

export interface RTrendExhaustionInputs {
  coldColor: string;
  hotColor: string;
  /** Draw Boxes on Chart */
  drawBoxes: boolean;
  /** Number of boxes kept */
  maxBoxes: number;
  mode: Mode;
  transparency: number;
  formula: typeof FORMULA1 | typeof FORMULA2;
  src: SourceName;
  threshold: number;
  smoothType: SmoothType;
  averageMa: number;
  plotShading: boolean;
  plotCrosses: boolean;
  plotZeroCrosses: boolean;
  shortLength: number;
  shortSmoothingLength: number;
  longLength: number;
  longSmoothingLength: number;
  bullStartOn: boolean;
  bullStartTxt: string;
  bearStartOn: boolean;
  bearStartTxt: string;
  bullReversalOn: boolean;
  bullReversalTxt: string;
  bearReversalOn: boolean;
  bearReversalTxt: string;
  bullCrossOn: boolean;
  bullCrossTxt: string;
  bearCrossOn: boolean;
  bearCrossTxt: string;
  plotStrategyEntry: boolean;
  longDealsEnabled: boolean;
  shortDealsEnabled: boolean;
  strategyEntry: StrategyEntry;
}

export const defaultInputs: RTrendExhaustionInputs = {
  coldColor: '#2466A7',
  hotColor: '#CA0017',
  drawBoxes: true,
  maxBoxes: 60,
  mode: MODE1,
  transparency: 80,
  formula: FORMULA1,
  src: 'close',
  threshold: 20,
  smoothType: 'ema',
  averageMa: 3,
  plotShading: true,
  plotCrosses: false,
  plotZeroCrosses: false,
  shortLength: 21,
  shortSmoothingLength: 7,
  longLength: 112,
  longSmoothingLength: 3,
  bullStartOn: true,
  bullStartTxt: '%RTE bull trend start ⏹',
  bearStartOn: true,
  bearStartTxt: '%RTE bear trend start ⏹',
  bullReversalOn: true,
  bullReversalTxt: '%RTE bull trend break ▼',
  bearReversalOn: true,
  bearReversalTxt: '%RTE bear trend break ▲',
  bullCrossOn: false,
  bullCrossTxt: 'Bullish crossover',
  bearCrossOn: false,
  bearCrossTxt: 'Bearish crossover',
  plotStrategyEntry: false,
  longDealsEnabled: true,
  shortDealsEnabled: true,
  strategyEntry: '3 Reversal Trade @ Triangle',
};

const G_SETTINGS = 'Settings v2.3';
const G_LOOKBACK = 'Dual Signal Setup (Fast/Slow Lookback)';
const G_ALERTS = 'Alerts';
const G_STRATEGY = 'Strategy (send external signal to TTS backtester)';

export const inputConfig: InputConfig[] = [
  { id: 'coldColor', type: 'color', title: 'Cold Color', defval: '#2466A7', group: G_SETTINGS, inline: 'col' },
  { id: 'hotColor', type: 'color', title: 'Hot Color', defval: '#CA0017', group: G_SETTINGS, inline: 'col' },
  { id: 'drawBoxes', type: 'bool', title: 'Draw Boxes on Chart', defval: true, group: G_SETTINGS, inline: 'overlay' },
  { id: 'maxBoxes', type: 'int', title: '#', defval: 60, min: 1, max: 300, group: G_SETTINGS, inline: 'overlay', active: 'drawBoxes' },
  { id: 'mode', type: 'string', title: 'Display Mode', defval: MODE1, options: [MODE1, MODE2, MODE3], group: G_SETTINGS,
    tooltip: 'Modes 2 & 3 are more advanced and expect that you most likely overlay the indicator on top of price action itself or another indiciator using the object tree panel.' },
  { id: 'transparency', type: 'int', title: 'Base Transparency', defval: 80, min: 0, max: 100, group: G_SETTINGS },
  { id: 'formula', type: 'string', title: 'Formula', defval: FORMULA1, options: [FORMULA1, FORMULA2], group: G_SETTINGS },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: G_SETTINGS },
  { id: 'threshold', type: 'int', title: 'Exhaustion Threshold', defval: 20, min: 1, max: 50, group: G_SETTINGS,
    tooltip: 'Sets the overbought/oversold zone size and offset. Lower values will produce less results, higher values towards 50 will produce many results.' },
  { id: 'smoothType', type: 'string', title: 'Smoothing Type', defval: 'ema', group: G_SETTINGS,
    options: ['sma', 'ema', 'hma', 'rma', 'wma', 'vwma', 'swma', 'highlow', 'linreg', 'median', 'mom', 'percentrank'] },
  { id: 'averageMa', type: 'int', title: 'Average Formula MA', defval: 3, group: G_SETTINGS },
  { id: 'plotShading', type: 'bool', title: 'Fill Gradients in OB/OS Zone', defval: true, group: G_SETTINGS },
  { id: 'plotCrosses', type: 'bool', title: 'Highlight Crossovers', defval: false, group: G_SETTINGS,
    tooltip: 'Experimental idea for plotting crossovers with attempted bull/bear coloring. This needs to be combined with other TA but typically crossover condition results in interesting price action during or after.' },
  { id: 'plotZeroCrosses', type: 'bool', title: 'Plot Zero Line Crosses', defval: false, group: G_SETTINGS,
    tooltip: 'Experimental idea for plotting crosses' },
  { id: 'shortLength', type: 'int', title: 'Fast Length', defval: 21, group: G_LOOKBACK },
  { id: 'shortSmoothingLength', type: 'int', title: 'Fast Smoothing Length', defval: 7, group: G_LOOKBACK },
  { id: 'longLength', type: 'int', title: 'Slow Length', defval: 112, min: 1, group: G_LOOKBACK },
  { id: 'longSmoothingLength', type: 'int', title: 'Slow Smoothing Length', defval: 3, group: G_LOOKBACK },
  { id: 'bullStartOn', type: 'bool', title: 'Bull trend start ⏹', defval: true, group: G_ALERTS, inline: 'bullStart' },
  { id: 'bullStartTxt', type: 'string', title: '', defval: '%RTE bull trend start ⏹', group: G_ALERTS, inline: 'bullStart' },
  { id: 'bearStartOn', type: 'bool', title: 'Bear trend start ⏹', defval: true, group: G_ALERTS, inline: 'bearStart' },
  { id: 'bearStartTxt', type: 'string', title: '', defval: '%RTE bear trend start ⏹', group: G_ALERTS, inline: 'bearStart' },
  { id: 'bullReversalOn', type: 'bool', title: 'Bull trend break ▼', defval: true, group: G_ALERTS, inline: 'bullReversal' },
  { id: 'bullReversalTxt', type: 'string', title: '', defval: '%RTE bull trend break ▼', group: G_ALERTS, inline: 'bullReversal' },
  { id: 'bearReversalOn', type: 'bool', title: 'Bear trend break ▲', defval: true, group: G_ALERTS, inline: 'bearReversal' },
  { id: 'bearReversalTxt', type: 'string', title: '', defval: '%RTE bear trend break ▲', group: G_ALERTS, inline: 'bearReversal' },
  { id: 'bullCrossOn', type: 'bool', title: 'Bull cross ⏺', defval: false, group: G_ALERTS, inline: 'bullCross' },
  { id: 'bullCrossTxt', type: 'string', title: '', defval: 'Bullish crossover', group: G_ALERTS, inline: 'bullCross' },
  { id: 'bearCrossOn', type: 'bool', title: 'Bear cross ⏺', defval: false, group: G_ALERTS, inline: 'bearCross' },
  { id: 'bearCrossTxt', type: 'string', title: '', defval: 'Bearish crossover', group: G_ALERTS, inline: 'bearCross' },
  { id: 'plotStrategyEntry', type: 'bool', title: 'Plot Strategy Entries on Chart', defval: false, group: G_STRATEGY },
  { id: 'longDealsEnabled', type: 'bool', title: 'Enable Long Deals', defval: true, group: G_STRATEGY },
  { id: 'shortDealsEnabled', type: 'bool', title: 'Enable Short Deals', defval: true, group: G_STRATEGY },
  { id: 'strategyEntry', type: 'string', title: 'Strategy Entry', defval: '3 Reversal Trade @ Triangle',
    options: [...STRATEGIES], group: G_STRATEGY },
];

const FG_DEFAULT = '#DBDBDB';
const LONG_COLOR = 'rgb(139, 174, 255)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast Period %R', color: FG_DEFAULT, lineWidth: 1 },
  { id: 'plot1', title: 'Slow Period %R', color: LONG_COLOR, lineWidth: 1 },
  { id: 'plot2', title: 'Average Formula %R', color: FG_DEFAULT, lineWidth: 1 },
  { id: 'plot3', title: 'Crossover Dot (small)', color: '#CA0017', lineWidth: 4, style: 'circles' },
  { id: 'plot4', title: 'Crossover Dot (big)', color: '#CA0017', lineWidth: 12, style: 'circles' },
  { id: 'plot5', title: '🔌Signal to TTS', color: '#808000', lineWidth: 1, display: 'data_window' },
];

export const metadata = {
  title: '%R Trend Exhaustion [upslidedown]',
  shortTitle: '%R Trend Exhaustion [upslidedown]',
  overlay: false,
};

/** indicator(max_boxes_count = 300) */
const MAX_BOXES = 300;
/** Default box text colour of Pine v6 (the boxes have no text) */
const BOX_TEXT = '#FFFFFF';
/** Pine float comparisons: a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

type Point = { time: number; value: number; color?: string };

function sourceValue(b: Bar, name: SourceName): number {
  switch (name) {
    case 'open': return b.open;
    case 'high': return b.high;
    case 'low': return b.low;
    case 'hl2': return (b.high + b.low) / 2;
    case 'hlc3': return (b.high + b.low + b.close) / 3;
    case 'hlcc4': return (b.high + b.low + 2 * b.close) / 4;
    case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
    case 'volume': return b.volume ?? NaN;
    default: return b.close;
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RTrendExhaustionInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'boxes'> & { markers: MarkerData[]; boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const volS = new Series(bars, (b) => b.volume ?? NaN);
  const src = bars.map((b) => sourceValue(b, cfg.src));

  const mode = cfg.mode;
  const compact = mode === MODE2;
  const useAverage = cfg.formula === FORMULA2;
  const threshold = cfg.threshold;

  // colours
  const bullcol = cfg.coldColor;
  const bearcol = cfg.hotColor;
  const invisible = String(color.rgb(0, 0, 0, 100));
  const bullXlight = String(color.new(bullcol, cfg.transparency));
  const bearXlight = String(color.new(bearcol, cfg.transparency));
  const bullLight = String(color.new(bullcol, cfg.transparency - 10));
  const bearLight = String(color.new(bearcol, cfg.transparency - 10));
  const bullMedium = String(color.new(bullcol, cfg.transparency - 20));
  const bearMedium = String(color.new(bearcol, cfg.transparency - 20));
  const shortcol = foregroundColorOf(chart);
  const bullSignalLoc = -107;
  const bearSignalLoc = 5;

  // ta.ma() of the library "ta" (HeWhoMustNotBeNamed/ta/1): customseries(source, type, length)
  const ma = (x: number[], type: SmoothType, length: number): number[] => {
    const s = S(x);
    switch (type) {
      case 'ema': return A(ta.ema(s, length));
      case 'sma': return A(ta.sma(s, length));
      case 'rma': return A(ta.rma(s, length));
      case 'hma': return A(ta.hma(s, length));
      case 'wma': return A(ta.wma(s, length));
      case 'vwma': return A(ta.vwma(s, length, volS));
      case 'swma': return A(ta.swma(s));
      case 'linreg': return A(ta.linreg(s, length, 0));
      case 'median': return A(ta.median(s, length));
      case 'mom': return A(ta.mom(s, length));
      case 'percentrank': return A(ta.percentrank(s, length));
      default: {
        // => (ta.highest(length) + ta.lowest(length)) / 2: high / low of the bars, not the source
        const hh = A(ta.highest(highS, length));
        const ll = A(ta.lowest(lowS, length));
        return hh.map((h, i) => (h + ll[i]) / 2);
      }
    }
  };

  // _pr(length) = 100 * (src - ta.highest(length)) / (ta.highest(length) - ta.lowest(length))
  const pr = (length: number): number[] => {
    const max = A(ta.highest(highS, length));
    const min = A(ta.lowest(lowS, length));
    return src.map((v, i) => (100 * (v - max[i])) / (max[i] - min[i]));
  };
  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);

  let sR = pr(cfg.shortLength);
  let lR = pr(cfg.longLength);
  let avgR = sR.map((v, i) => (v + lR[i]) / 2);
  if (cfg.shortSmoothingLength > 1) sR = ma(sR, cfg.smoothType, cfg.shortSmoothingLength);
  if (cfg.longSmoothingLength > 1) lR = ma(lR, cfg.smoothType, cfg.longSmoothingLength);
  if (cfg.averageMa > 1) avgR = ma(avgR, cfg.smoothType, cfg.averageMa);

  const crossLong1 = A(ta.crossover(S(sR), -50));
  const crossLong2 = A(ta.crossover(S(lR), -50));
  const crossShort1 = A(ta.crossunder(S(sR), -50));
  const crossShort2 = A(ta.crossunder(S(lR), -50));
  const crossBearArr = A(ta.crossover(S(lR), S(sR)));
  const crossBullArr = A(ta.crossunder(S(lR), S(sR)));

  const location = (tORb: 'top' | 'bottom'): 'absolute' | 'top' | 'bottom' | 'aboveBar' | 'belowBar' => {
    if (mode === MODE2) return tORb === 'top' ? 'top' : 'bottom';
    if (mode === MODE3) return tORb === 'top' ? 'aboveBar' : 'belowBar';
    return 'absolute';
  };
  const topLoc = location('top');
  const bottomLoc = location('bottom');
  const markers: MarkerData[] = [];
  /** plotshape / plotchar at getlocation(mode, ...) with a series value of 5 or -107 */
  const shapeAt = (time: number, loc: ReturnType<typeof location>, value: number, m: Omit<MarkerData, 'time' | 'position'>) => {
    const position: MarkerPosition = loc === 'absolute' ? 'atPriceMiddle' : loc;
    markers.push({ time, position, ...(loc === 'absolute' ? { price: value } : {}), ...m });
  };

  // drawings
  resetDrawings({ box: MAX_BOXES });
  const obBox = varDrawing<Box>();
  const osBox = varDrawing<Box>();
  let obBoxTop = NaN;
  let obBoxBottom = NaN;
  let osBoxTop = NaN;
  let osBoxBottom = NaN;
  const printedBoxes: Box[] = [];

  const fast: number[] = new Array(n).fill(NaN);
  const slow: number[] = new Array(n).fill(NaN);
  const average: number[] = new Array(n).fill(NaN);
  const dotSmall: Point[] = [];
  const dotBig: Point[] = [];
  const signal: number[] = new Array(n).fill(NaN);

  let prevOb = false;
  let prevOs = false;
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = b.time;
    const s = sR[i];
    const l = lR[i];

    // ob/os logic
    let overbought = ge(s, -threshold) && ge(l, -threshold);
    let oversold = le(s, -100 + threshold) && le(l, -100 + threshold);
    const crossZeroLong = crossLong1[i] === 1 || crossLong2[i] === 1;
    const crossZeroShort = crossShort1[i] === 1 || crossShort2[i] === 1;
    const zeroLong = gt(s, -50) && gt(l, -50) && crossZeroLong;
    const zeroShort = lt(s, -50) && lt(l, -50) && crossZeroShort;
    if (useAverage) {
      overbought = ge(avgR[i], -threshold);
      oversold = le(avgR[i], -100 + threshold);
    }
    const obReversal = !overbought && prevOb;
    const osReversal = !oversold && prevOs;
    const obTrendStart = overbought && !prevOb;
    const osTrendStart = oversold && !prevOs;
    prevOb = overbought;
    prevOs = oversold;
    const crossBear = crossBearArr[i] === 1;
    const crossBull = crossBullArr[i] === 1;

    // plots
    if (mode === MODE1 && !useAverage) {
      fast[i] = finite(s);
      slow[i] = finite(l);
    }
    if (mode === MODE1 && useAverage) average[i] = finite(avgR[i]);

    // plotshapes before the box block (they read the box top / bottom of the bar before)
    const tiny = { text: '', textColor: invisible, size: 'tiny' as const };
    if (obReversal) shapeAt(t, topLoc, bearSignalLoc, { shape: 'triangleDown', color: bearcol, ...tiny });
    if (osReversal) shapeAt(t, bottomLoc, bullSignalLoc, { shape: 'triangleUp', color: bullcol, ...tiny });
    if (cfg.drawBoxes && obReversal && !isNaN(obBoxTop)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: obBoxTop, shape: 'triangleDown', color: bearcol, ...tiny, forceOverlay: true });
    }
    if (cfg.drawBoxes && osReversal && !isNaN(osBoxBottom)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: osBoxBottom, shape: 'triangleUp', color: bullcol, ...tiny, forceOverlay: true });
    }
    if (overbought) shapeAt(t, topLoc, bearSignalLoc, { shape: 'square', color: bearMedium, ...tiny });
    if (oversold) shapeAt(t, bottomLoc, bullSignalLoc, { shape: 'square', color: bullMedium, ...tiny });

    if (cfg.drawBoxes) {
      // overbought box: started on the first OB bar, extended while the condition holds, frozen when it ends
      if (obTrendStart) {
        if (obBox.value) box.delete(obBox.value);
        obBoxTop = b.high;
        obBoxBottom = b.low;
        obBox.value = box.new(i - 1, obBoxTop, i, obBoxBottom, bearMedium, 1, undefined, undefined, undefined, bearXlight,
          undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true);
        printedBoxes.push(obBox.value);
        if (printedBoxes.length > cfg.maxBoxes) box.delete(printedBoxes.shift() as Box);
      } else if (overbought && obBox.value) {
        box.set_right(obBox.value, i);
        if (gt(b.high, obBoxTop)) {
          obBoxTop = b.high;
          box.set_top(obBox.value, obBoxTop);
        }
        if (lt(b.low, obBoxBottom)) {
          obBoxBottom = b.low;
          box.set_bottom(obBox.value, obBoxBottom);
        }
      } else if (!overbought && obBox.value) {
        box.set_right(obBox.value, i - 1);
        obBox.value = undefined;
      }

      // oversold box
      if (osTrendStart) {
        if (osBox.value) box.delete(osBox.value);
        osBoxTop = b.high;
        osBoxBottom = b.low;
        osBox.value = box.new(i - 1, osBoxTop, i, osBoxBottom, bullMedium, 1, undefined, undefined, undefined, bullXlight,
          undefined, undefined, BOX_TEXT, undefined, undefined, undefined, undefined, true);
        printedBoxes.push(osBox.value);
        if (printedBoxes.length > cfg.maxBoxes) box.delete(printedBoxes.shift() as Box);
      } else if (oversold && osBox.value) {
        box.set_right(osBox.value, i);
        if (gt(b.high, osBoxTop)) {
          osBoxTop = b.high;
          box.set_top(osBox.value, osBoxTop);
        }
        if (lt(b.low, osBoxBottom)) {
          osBoxBottom = b.low;
          box.set_bottom(osBox.value, osBoxBottom);
        }
      } else if (!oversold && osBox.value) {
        box.set_right(osBox.value, i - 1);
        osBox.value = undefined;
      }
    }

    if (zeroLong && cfg.plotZeroCrosses) shapeAt(t, topLoc, bearSignalLoc, { shape: 'triangleUp', color: color.yellow, ...tiny });
    if (zeroShort && cfg.plotZeroCrosses) shapeAt(t, bottomLoc, bullSignalLoc, { shape: 'triangleDown', color: color.yellow, ...tiny });

    // crossover dots
    const dot = !compact && cfg.plotCrosses && (crossBull || crossBear) ? finite(l) : NaN;
    dotSmall.push({ time: t, value: dot, color: crossBull ? bullcol : bearcol });
    dotBig.push({ time: t, value: dot, color: crossBull ? bullLight : bearLight });

    // plotchar: trend start
    if (obTrendStart) shapeAt(t, topLoc, bearSignalLoc, { shape: 'circle', color: 'transparent', text: '◡', textColor: bearcol });
    if (osTrendStart) shapeAt(t, bottomLoc, bullSignalLoc, { shape: 'circle', color: 'transparent', text: '◠', textColor: bullcol });

    // strategy entries
    let startLongDeal = false;
    let startShortDeal = false;
    switch (cfg.strategyEntry) {
      case '1 Trend Following @ Square':
        if (obTrendStart && cfg.longDealsEnabled) startLongDeal = true;
        else if (osTrendStart && cfg.shortDealsEnabled) startShortDeal = true;
        break;
      case '2 Reversal @ Square':
        if (osTrendStart && cfg.longDealsEnabled) startLongDeal = true;
        else if (obTrendStart && cfg.shortDealsEnabled) startShortDeal = true;
        break;
      case '3 Reversal Trade @ Triangle':
        if (obReversal && cfg.shortDealsEnabled) startShortDeal = true;
        else if (osReversal && cfg.longDealsEnabled) startLongDeal = true;
        break;
      case '4 Re-enter Trend Trade @ Triangle':
        if (osReversal && cfg.shortDealsEnabled) startShortDeal = true;
        else if (obReversal && cfg.longDealsEnabled) startLongDeal = true;
        break;
      case '5 Pings':
        if (crossBull && cfg.longDealsEnabled) startLongDeal = true;
        else if (crossBear && cfg.shortDealsEnabled) startShortDeal = true;
        break;
      case '6 Zero Line Cross':
        if (zeroLong && cfg.longDealsEnabled) startLongDeal = true;
        else if (zeroShort && cfg.shortDealsEnabled) startShortDeal = true;
        break;
    }
    // conv.getSignal(): the handshake on the first bar (minor version 1 in the 11th hexadecimal digit), then the
    // decimal channels short (units) and long (tens), 2 = deal start, 0 = no operation
    signal[i] = i === 0 ? 16 ** 10 : (startShortDeal ? 2 : 0) + 10 * (startLongDeal ? 2 : 0);

    if (cfg.plotStrategyEntry && startLongDeal) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: bullcol, size: 'tiny', text: 'Long',
        textColor: shortcol, forceOverlay: true });
    }
    if (cfg.plotStrategyEntry && startShortDeal) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: bearcol, size: 'tiny', text: 'Short',
        textColor: shortcol, forceOverlay: true });
    }
  }
  setDrawingBar(null);

  // fills between the fast and slow %R: gradients from 0 to -30 and from -70 to -100
  const gradientBullColor = cfg.plotShading ? String(color.new(bullcol, 100)) : invisible;
  const gradientBearColor = cfg.plotShading ? String(color.new(bearcol, 100)) : invisible;
  const constant = <T>(v: T): T[] => new Array<T>(n).fill(v);

  const P = (values: number[], c: string): Point[] => values.map((value, i) => ({ time: bars[i].time, value, color: c }));
  const hl = (value: number, title: string, c: string) => ({ value, options: { title, color: c, linestyle: 'solid' as const, linewidth: 1 } });
  const middleColor = String(color.new(shortcol, 80));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 2 },
    plots: {
      plot0: P(fast, shortcol),
      plot1: P(slow, LONG_COLOR),
      plot2: P(average, shortcol),
      plot3: dotSmall,
      plot4: dotBig,
      plot5: signal.map((value, i) => ({ time: bars[i].time, value })),
    },
    // the hlines are na outside the oscillator mode
    hlines: mode === MODE1
      ? [
        hl(0, 'Top', bearMedium),
        hl(-threshold, 'Top Threshold', bearMedium),
        hl(-50, 'Middle Line', middleColor),
        hl(-100 + threshold, 'Bottom Threshold', bullMedium),
        hl(-100, 'Bottom', bullMedium),
      ]
      : [],
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Overbought Gradient Fill' }, gradient: {
        topValue: constant(0), bottomValue: constant(-30),
        topColor: constant<string | null>(String(color.new(gradientBearColor, 0))),
        bottomColor: constant<string | null>(gradientBearColor),
      } },
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Oversold Gradient Fill' }, gradient: {
        topValue: constant(-70), bottomValue: constant(-100),
        topColor: constant<string | null>(gradientBullColor),
        bottomColor: constant<string | null>(String(color.new(gradientBullColor, 0))),
      } },
    ],
    markers,
    boxes: drawingOutputs(bars).boxes ?? [],
  };
}

export const RTrendExhaustion = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
