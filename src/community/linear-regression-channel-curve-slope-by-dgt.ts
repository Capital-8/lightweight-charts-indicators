/**
 * Linear Regression Channel / Curve / Slope by DGT
 *
 * On the last bar the script fits a least-squares line to the last Count values of a source and draws it with up
 * to three pairs of parallel lines at a multiple of the standard deviation of the values around the line, and a
 * label for each line. A second channel does the same with its own Count; on an intraday chart it can be extended
 * to a higher timeframe (1 hour, 4 hours or 1 day): its Count is then multiplied by the ratio of that timeframe to
 * the chart timeframe, and its lines can be shortened to a number of bars.
 * It also plots the linear regression curve (the end point of the regression of each bar) with optional bands at
 * 1, 2 and 3 standard deviations or average true ranges, optional arrows for the regression slope, optional marks
 * on bars of high volatility (range above a multiple of the average true range) and of exhaustion (volume above a
 * multiple of its average), and it colours the bars by their volume against the volume average. These outputs are
 * shown on the last 3 x Count bars only (the Count of the first channel).
 *
 * Chart values read from the optional third argument (see src/chart-context.ts): the symbol tick for the prices in
 * label texts and tooltips (0.01 without it), and the chart timeframe (read from the bar spacing without it).
 * As the original, the port stops with an error when a channel needs more than 5,000 bars of history (the extended
 * second channel on a low timeframe). The alerts of the original are not ported.
 *
 * Reference: "Linear Regression Channel / Curve / Slope by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import { ta, str, timeframe, Series, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData, LabelData, LineDrawingData, MarkerData, TableData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';

type LevelLabels = 'Levels' | 'Levels (Prices)' | 'None';
type TextSize = 'Small' | 'Normal';
type LineStyleName = 'Dashed' | 'Dotted' | 'Solid';

export interface LinearRegressionChannelCurveSlopeByDgtInputs {
  linreg: boolean;
  linregLength: number;
  linregSrc: SourceType;
  extendLines: boolean;
  trendColor: boolean;
  channelLevels: LevelLabels;
  levelTextSize: TextSize;
  levelOffset: number;
  linreg2: boolean;
  linregLength2: number;
  linregSrc2: SourceType;
  /** Multiply the Count of the second channel by (higher timeframe / chart timeframe) on intraday charts */
  useTF: boolean;
  htfUser: '1D' | '4H' | '1H';
  shorten: boolean;
  showLast: number;
  extendLines2: boolean;
  trendColor2: boolean;
  channelLevels2: LevelLabels;
  levelTextSize2: TextSize;
  levelOffset2: number;
  lrColorM: string;
  lrStyleM: LineStyleName;
  lrWidthM: number;
  lrShow1: boolean;
  lrValue1: number;
  lrColor1: string;
  lrStyle1: LineStyleName;
  lrWidth1: number;
  lrShow2: boolean;
  lrValue2: number;
  lrColor2: string;
  lrStyle2: LineStyleName;
  lrWidth2: number;
  lrShow3: boolean;
  lrValue3: number;
  lrColor3: string;
  lrStyle3: LineStyleName;
  lrWidth3: number;
  lr2ColorM: string;
  lr2StyleM: LineStyleName;
  lr2WidthM: number;
  lr2Show1: boolean;
  lr2Value1: number;
  lr2Color1: string;
  lr2Style1: LineStyleName;
  lr2Width1: number;
  lr2Show2: boolean;
  lr2Value2: number;
  lr2Color2: string;
  lr2Style2: LineStyleName;
  lr2Width2: number;
  lr2Show3: boolean;
  lr2Value3: number;
  lr2Color3: string;
  lr2Style3: LineStyleName;
  lr2Width3: number;
  showCurve: boolean;
  linregCurveL: number;
  lrColorCurve: string;
  showCurveBand: boolean;
  lrColorBand1: string;
  lrColorBand2: string;
  lrColorBand3: string;
  showCurveBTyp: 'StdDev' | 'ATR';
  linregCurveBL: number;
  linregCurveAL: number;
  showSlope: boolean;
  linregSlopeL: number;
  lrColorSlopeU: string;
  lrColorSlopeD: string;
  hATRLb: boolean;
  atrLength: number;
  atrMultiplier: number;
  vSmaLength: number;
  vSpikeLb: boolean;
  vSpikeThresh: number;
  vwcb: boolean;
  vwcbHighThresh: number;
  vwcbLowThresh: number;
}

export const defaultInputs: LinearRegressionChannelCurveSlopeByDgtInputs = {
  linreg: true,
  linregLength: 200,
  linregSrc: 'close',
  extendLines: false,
  trendColor: false,
  channelLevels: 'Levels',
  levelTextSize: 'Small',
  levelOffset: 0,
  linreg2: true,
  linregLength2: 50,
  linregSrc2: 'close',
  useTF: true,
  htfUser: '4H',
  shorten: true,
  showLast: 500,
  extendLines2: false,
  trendColor2: false,
  channelLevels2: 'Levels',
  levelTextSize2: 'Small',
  levelOffset2: 0,
  lrColorM: '#f44336',
  lrStyleM: 'Solid',
  lrWidthM: 3,
  lrShow1: true,
  lrValue1: 1,
  lrColor1: '#2196f3',
  lrStyle1: 'Dashed',
  lrWidth1: 1,
  lrShow2: true,
  lrValue2: 2,
  lrColor2: '#2196f3',
  lrStyle2: 'Solid',
  lrWidth2: 2,
  lrShow3: true,
  lrValue3: 3,
  lrColor3: '#2196f3',
  lrStyle3: 'Dotted',
  lrWidth3: 2,
  lr2ColorM: '#ff9800',
  lr2StyleM: 'Solid',
  lr2WidthM: 3,
  lr2Show1: true,
  lr2Value1: 1,
  lr2Color1: '#00bcd4',
  lr2Style1: 'Dashed',
  lr2Width1: 1,
  lr2Show2: true,
  lr2Value2: 2,
  lr2Color2: '#00bcd4',
  lr2Style2: 'Solid',
  lr2Width2: 2,
  lr2Show3: true,
  lr2Value3: 3,
  lr2Color3: '#00bcd4',
  lr2Style3: 'Dotted',
  lr2Width3: 2,
  showCurve: true,
  linregCurveL: 50,
  lrColorCurve: '#872323',
  showCurveBand: false,
  lrColorBand1: '#00897b',
  lrColorBand2: '#00897b',
  lrColorBand3: '#00897b',
  showCurveBTyp: 'StdDev',
  linregCurveBL: 21,
  linregCurveAL: 13,
  showSlope: false,
  linregSlopeL: 5,
  lrColorSlopeU: 'rgba(6,186,209,0.5)',
  lrColorSlopeD: 'rgba(245,127,23,0.5)',
  hATRLb: false,
  atrLength: 13,
  atrMultiplier: 2.718,
  vSmaLength: 89,
  vSpikeLb: false,
  vSpikeThresh: 4.669,
  vwcb: true,
  vwcbHighThresh: 1.618,
  vwcbLowThresh: 0.618,
};

const G1 = 'Linear Regression — 1st Channel';
const G2 = 'Linear Regression — 2nd Channel (HTF)';
const GC = 'Linear Regression Curve';
const GS = 'Linear Regression Slope';
const GV = 'Volume / Volatility AddOns';
const STYLES = ['Dashed', 'Dotted', 'Solid'];
const LEVEL_OPTIONS = ['Levels', 'Levels (Prices)', 'None'];
const SIZES = ['Small', 'Normal'];
const SOURCES = ['open', 'high', 'low', 'close', 'hl2', 'hlc3', 'hlcc4', 'ohlc4', 'volume'];
/** Figure space, used by the original to align its input titles */
const FS = ' ';

const TIP_LINREG =
  'Linear Regression Channel\nBase Line: The line that best fits price over the selected period (Count),\ncalculated using the least-squares method.';
const TIP_LINREG2 =
  'Second Linear Regression Channel — User-Defined Timeframe'
  + '\n\nWhen enabled, the Linear Regression Channel extends by:'
  + '\nCount × (Selected Higher Timeframe ÷ Current Timeframe).'
  + '\n\nLimitations:'
  + '\n• May exceed the maximum allowed history limit (5000 bars),'
  + '\n  resulting in: "The study references too many candles in history (5001)".'
  + '\n  Solution: Reduce Count or select 1H / 4H.'
  + '\n\n• Lines may not be visible while labels are present.'
  + '\n  Solution: Scroll left or enable "Shorten Display when TF Extend is enabled".'
  + '\n\n• Applicable to intraday timeframes only.';
const TIP_VOLATILITY = 'High Volatility\nDetected when the current bar range exceeds ATR × Threshold over the selected period.';
const TIP_SPIKE =
  'Sign of Exhaustion\nA volume spike occurs when the current volume exceeds the volume moving average multiplied by the threshold value.';
const TIP_VWCB = 'Volume-Weighted Colored Bars\nColors bars based on the bar’s volume relative to the volume moving average.';

/** The inputs of one "StdDev" level row */
const levelInputs = (prefix: 'lr' | 'lr2', k: 1 | 2 | 3, group: string): InputConfig[] => {
  const inline = `${prefix === 'lr' ? '' : '2'}lrLevel_${k}`;
  const d = defaultInputs;
  return [
    { id: `${prefix}Show${k}`, type: 'bool', title: 'StdDev', defval: true, inline, group },
    { id: `${prefix}Value${k}`, type: 'float', title: '', defval: k, min: k - 1, step: 0.1, inline, group },
    { id: `${prefix}Color${k}`, type: 'color', title: '', defval: d[`${prefix}Color${k}`], inline, group },
    { id: `${prefix}Style${k}`, type: 'string', title: '', defval: d[`${prefix}Style${k}`], options: STYLES, inline, group },
    { id: `${prefix}Width${k}`, type: 'int', title: '', defval: d[`${prefix}Width${k}`], min: 1, inline, group },
  ];
};

export const inputConfig: InputConfig[] = [
  { id: 'linreg', type: 'bool', title: 'LinReg1 ⇨ Count', defval: true, inline: 'LinReg1', group: G1, tooltip: TIP_LINREG },
  { id: 'linregLength', type: 'int', title: '', defval: 200, min: 2, max: 5000, inline: 'LinReg1', group: G1 },
  { id: 'linregSrc', type: 'source', title: `${FS.repeat(7)}Source`, defval: 'close', options: SOURCES, inline: 'LinReg1', group: G1 },
  { id: 'extendLines', type: 'bool', title: `Extend Lines${FS.repeat(7)}`, defval: false, inline: 'Lines', group: G1 },
  { id: 'trendColor', type: 'bool', title: 'Use Trend Colors', defval: false, inline: 'Lines', group: G1 },
  { id: 'channelLevels', type: 'string', title: 'Level Labels', defval: 'Levels', options: LEVEL_OPTIONS, inline: 'Level', group: G1 },
  { id: 'levelTextSize', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'Level', group: G1 },
  { id: 'levelOffset', type: 'int', title: 'Offset', defval: 0, min: 0, inline: 'Level', group: G1 },
  { id: 'linreg2', type: 'bool', title: 'LinReg2 ⇨ Count', defval: true, inline: 'LinReg2', group: G2 },
  { id: 'linregLength2', type: 'int', title: '', defval: 50, min: 2, max: 5000, inline: 'LinReg2', group: G2 },
  { id: 'linregSrc2', type: 'source', title: `${FS.repeat(7)}Source`, defval: 'close', options: SOURCES, inline: 'LinReg2', group: G2 },
  { id: 'useTF', type: 'bool', title: 'LinReg2 ⇨ Extend to User-Defined TF (Intraday Only)', defval: true, inline: 'HTF2', group: G2, tooltip: TIP_LINREG2 },
  { id: 'htfUser', type: 'string', title: '', defval: '4H', options: ['1D', '4H', '1H'], inline: 'HTF2', group: G2 },
  { id: 'shorten', type: 'bool', title: 'LinReg2 ⇨ Shorten Display when TF Extend Enabled', defval: true, inline: 'SHORT', group: G2 },
  { id: 'showLast', type: 'int', title: '', defval: 500, min: 200, inline: 'SHORT', group: G2 },
  { id: 'extendLines2', type: 'bool', title: `Extend Lines${FS.repeat(7)}`, defval: false, inline: 'Lines', group: G2 },
  { id: 'trendColor2', type: 'bool', title: 'Use Trend Colors', defval: false, inline: 'Lines', group: G2 },
  { id: 'channelLevels2', type: 'string', title: 'Level Labels', defval: 'Levels', options: LEVEL_OPTIONS, inline: 'Level', group: G2 },
  { id: 'levelTextSize2', type: 'string', title: '', defval: 'Small', options: SIZES, inline: 'Level', group: G2 },
  { id: 'levelOffset2', type: 'int', title: 'Offset', defval: 0, min: 0, inline: 'Level', group: G2 },
  { id: 'lrColorM', type: 'color', title: `Linear Regression Line ${FS.repeat(6)}`, defval: '#f44336', inline: 'lrLine', group: G1 },
  { id: 'lrStyleM', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: 'lrLine', group: G1 },
  { id: 'lrWidthM', type: 'int', title: '', defval: 3, min: 1, inline: 'lrLine', group: G1 },
  ...levelInputs('lr', 1, G1),
  ...levelInputs('lr', 2, G1),
  ...levelInputs('lr', 3, G1),
  { id: 'lr2ColorM', type: 'color', title: `Linear Regression Line ${FS.repeat(6)}`, defval: '#ff9800', inline: '2lrLine', group: G2 },
  { id: 'lr2StyleM', type: 'string', title: '', defval: 'Solid', options: STYLES, inline: '2lrLine', group: G2 },
  { id: 'lr2WidthM', type: 'int', title: '', defval: 3, min: 1, inline: '2lrLine', group: G2 },
  ...levelInputs('lr2', 1, G2),
  ...levelInputs('lr2', 2, G2),
  ...levelInputs('lr2', 3, G2),
  { id: 'showCurve', type: 'bool', title: `Linear Regression Curve ${FS.repeat(5)}|${FS.repeat(4)} Length`, defval: true, inline: 'Curve', group: GC },
  { id: 'linregCurveL', type: 'int', title: '', defval: 50, inline: 'Curve', group: GC },
  { id: 'lrColorCurve', type: 'color', title: '', defval: '#872323', inline: 'Curve', group: GC },
  { id: 'showCurveBand', type: 'bool', title: `Linear Regression Curve Bands${FS.repeat(11)}`, defval: false, inline: 'Bands', group: GC },
  { id: 'lrColorBand1', type: 'color', title: '1', defval: '#00897b', inline: 'Bands', group: GC },
  { id: 'lrColorBand2', type: 'color', title: '2', defval: '#00897b', inline: 'Bands', group: GC },
  { id: 'lrColorBand3', type: 'color', title: '3', defval: '#00897b', inline: 'Bands', group: GC },
  { id: 'showCurveBTyp', type: 'string', title: 'Bands', defval: 'StdDev', options: ['StdDev', 'ATR'], inline: 'Bands2', group: GC },
  { id: 'linregCurveBL', type: 'int', title: `${FS.repeat(2)}StdDev`, defval: 21, inline: 'Bands2', group: GC },
  { id: 'linregCurveAL', type: 'int', title: `${FS}ATR`, defval: 13, inline: 'Bands2', group: GC },
  { id: 'showSlope', type: 'bool', title: `Linear Regression Slope ${FS}|${FS} Length`, defval: false, inline: 'Slope', group: GS },
  { id: 'linregSlopeL', type: 'int', title: '', defval: 5, inline: 'Slope', group: GS },
  { id: 'lrColorSlopeU', type: 'color', title: '', defval: 'rgba(6,186,209,0.5)', inline: 'Slope', group: GS },
  { id: 'lrColorSlopeD', type: 'color', title: '', defval: 'rgba(245,127,23,0.5)', inline: 'Slope', group: GS },
  { id: 'hATRLb', type: 'bool', title: '⚡', defval: false, inline: 'ATR', group: GV, tooltip: TIP_VOLATILITY },
  { id: 'atrLength', type: 'int', title: 'ATR : Length', defval: 13, inline: 'ATR', group: GV },
  { id: 'atrMultiplier', type: 'float', title: `${FS.repeat(4)}Multiplier`, defval: 2.718, min: 0.1, step: 0.1, inline: 'ATR', group: GV },
  { id: 'vSmaLength', type: 'int', title: 'Volume Moving Average Length', defval: 89, group: GV },
  { id: 'vSpikeLb', type: 'bool', title: '🚦', defval: false, inline: 'SRS1', group: GV, tooltip: TIP_SPIKE },
  { id: 'vSpikeThresh', type: 'float', title: `Volume Spike Threshold${FS.repeat(20)}`, defval: 4.669, min: 0.1, step: 0.1, inline: 'SRS1', group: GV },
  { id: 'vwcb', type: 'bool', title: '', defval: true, inline: 'VWC', group: GV, tooltip: TIP_VWCB },
  { id: 'vwcbHighThresh', type: 'float', title: 'VWCB Thresholds :  High ', defval: 1.618, min: 1, step: 0.1, inline: 'VWC', group: GV },
  { id: 'vwcbLowThresh', type: 'float', title: `${FS.repeat(2)}Low`, defval: 0.618, min: 0.1, step: 0.1, inline: 'VWC', group: GV },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'LRC', color: '#872323', lineWidth: 3 },
  { id: 'plot1', title: 'LRC Band StdDev 1', color: '#00897b', lineWidth: 1 },
  { id: 'plot2', title: 'LRC Band StdDev 1', color: '#00897b', lineWidth: 1 },
  { id: 'plot3', title: 'LRC Band StdDev 2', color: '#00897b', lineWidth: 1 },
  { id: 'plot4', title: 'LRC Band StdDev 2', color: '#00897b', lineWidth: 1 },
  { id: 'plot5', title: 'LRC Band StdDev 3', color: '#00897b', lineWidth: 1 },
  { id: 'plot6', title: 'LRC Band StdDev 3', color: '#00897b', lineWidth: 1 },
];

export const metadata = {
  title: 'Linear Regression Channel / Curve / Slope by DGT',
  shortTitle: 'LɪɴRᴇɢ ☼☾',
  overlay: true,
};

const RED = '#F23645';
const GREEN = '#4CAF50';
const TEAL = '#089981';
const BLUE = '#2962FF';
const CLEAR = '#00000000';
/** max_bars_back(_source, 5000) */
const MAX_BARS_BACK = 5000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<LinearRegressionChannelCurveSlopeByDgtInputs> = {},
  chart?: ChartContext,
): IndicatorResult & {
    markers: MarkerData[]; barColors: BarColorData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const mintick = mintickOf(chart);
  const priceText = (v: number) => str.tostring(v, 'mintick', mintick);
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const srcS = getSourceSeries(bars, cfg.linregSrc);
  const src1 = arr(srcS);
  const src2 = cfg.linregSrc2 === cfg.linregSrc ? src1 : arr(getSourceSeries(bars, cfg.linregSrc2));

  // Count of the second channel on an intraday chart: Count x (higher timeframe / chart timeframe)
  const chartTf = chartTimeframe(bars, chart);
  const info = chartTf === '' ? null : timeframe.info(chartTf);
  const htfMultiplier = cfg.htfUser === '1H' ? 60 : cfg.htfUser === '4H' ? 240 : 1440;
  const length1 = cfg.linregLength;
  const length2 = cfg.useTF && info !== null && info.isintraday && htfMultiplier > info.multiplier
    ? (cfg.linregLength2 * htfMultiplier) / info.multiplier
    : cfg.linregLength2;
  // The deviation loop reads `_source[i]` up to Count - 1 bars back on every bar: above 5,000 the original stops
  for (const length of [length1, length2]) {
    if (n > 0 && Math.floor(length - 1) > MAX_BARS_BACK) {
      throw new Error(
        `Error on bar 0: The script attempts to reference historical data that is too far from the current bar (${MAX_BARS_BACK + 1} bars back). `
        + `The history-referencing length for the expression must be a value between 0 and ${MAX_BARS_BACK}.`,
      );
    }
  }

  /** f_calcSlope() and f_calcDev() on the last bar: [slope, intercept, standard deviation] */
  const regression = (src: number[], length: number): [number, number, number] => {
    let sumX = 0;
    let sumY = 0;
    let sumXSqr = 0;
    let sumXY = 0;
    for (let i = 0; i <= length - 1; i++) {
      const val = i <= last ? src[last - i] : NaN;
      const per = i + 1;
      sumX += per;
      sumY += val;
      sumXSqr += per * per;
      sumXY += val * per;
    }
    const slope = (length * sumXY - sumX * sumY) / (length * sumXSqr - sumX * sumX);
    const intercept = sumY / length - (slope * sumX) / length + slope;
    let acc = 0;
    const periods = length - 1;
    let val = intercept;
    for (let i = 0; i <= periods; i++) {
      const price = (i <= last ? src[last - i] : NaN) - val;
      acc += price * price;
      val += slope;
    }
    return [slope, intercept, Math.sqrt(acc / periods)];
  };

  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const interval = barInterval(bars);
  const styleOf = (s: LineStyleName | 'Arrow') => (s === 'Solid' ? 'solid' : s === 'Dotted' ? 'dotted' : s === 'Dashed' ? 'dashed' : 'arrow_right');
  // f_drawLine(): an object with an na coordinate is not drawn; a bar index with a fraction is truncated
  const drawLine = (x1: number, y1: number, x2: number, y2: number, css: string, width: number, style: LineStyleName | 'Arrow', extend: boolean) => {
    if (![x1, y1, x2, y2].every((v) => isFinite(v))) return;
    const st = styleOf(style);
    lines.push({
      time1: barTime(bars, Math.trunc(x1), interval), price1: y1, time2: barTime(bars, Math.trunc(x2), interval), price2: y2, color: css, width,
      ...(st === 'solid' ? {} : { style: st }), ...(extend ? { extend: 'right' as const } : {}),
    });
  };
  // f_drawLabel()
  const drawLabel = (x: number, y: number, text: string, css: string, size: TextSize, extend: boolean) => {
    if (!isFinite(y)) return;
    labels.push({
      time: barTime(bars, x, interval), price: y, text: extend ? `${text}\n\n` : text, color: CLEAR, textColor: css, style: 'label_left',
      size: size === 'Small' ? 'small' : 'normal', textAlign: 'left', tooltip: priceText(y),
    });
  };

  if (n > 0) {
    const channel = (first: boolean) => {
      const on = first ? cfg.linreg : cfg.linreg2;
      const length = first ? length1 : length2;
      const [slope, intercept, dev] = regression(first ? src1 : src2, length);
      const short = !first && cfg.shorten && cfg.useTF && cfg.showLast < length;
      const pStart = intercept + slope * (short ? cfg.showLast : length - 1);
      const pEnd = intercept;
      const span = short ? cfg.showLast : length;
      const trend = first ? cfg.trendColor : cfg.trendColor2;
      const levelsMode = first ? cfg.channelLevels : cfg.channelLevels2;
      const textSize = first ? cfg.levelTextSize : cfg.levelTextSize2;
      const offset = first ? cfg.levelOffset : cfg.levelOffset2;
      const extend = first ? cfg.extendLines : cfg.extendLines2;
      const mainColor = first ? cfg.lrColorM : cfg.lr2ColorM;
      const trendCss = gt(pStart, pEnd) ? RED : GREEN;
      const priced = (v: number) => (levelsMode === 'Levels (Prices)' ? ` (${priceText(v)})` : '');
      const name = first ? '1' : '2';
      if (on) {
        const css = trend ? trendCss : mainColor;
        drawLine(last - span + 1, pStart, last, pEnd, css, first ? cfg.lrWidthM : cfg.lr2WidthM, first ? cfg.lrStyleM : cfg.lr2StyleM, extend);
        if (levelsMode !== 'None') {
          drawLabel(last + offset, pEnd, `LRL ${first ? '1ST' : '2ND'}${priced(pEnd)}`, css, textSize, extend);
          if (offset > 9) drawLine(last + 3, pEnd, last + offset, pEnd, mainColor, 1, 'Arrow', false);
        }
      }
      // processLinRegLevel()
      for (const k of [1, 2, 3] as const) {
        const p = first ? 'lr' : 'lr2';
        if (!cfg[`${p}Show${k}`] || !on) continue;
        const level = cfg[`${p}Value${k}`];
        const css = trend ? trendCss : cfg[`${p}Color${k}`];
        const width = cfg[`${p}Width${k}`];
        const style = cfg[`${p}Style${k}`];
        drawLine(last - span + 1, pStart + level * dev, last, pEnd + level * dev, css, width, style, extend);
        drawLine(last - span + 1, pStart - level * dev, last, pEnd - level * dev, css, width, style, extend);
        if (levelsMode !== 'None') {
          const up = pEnd + level * dev;
          const down = pEnd - level * dev;
          drawLabel(last + offset, up, `SD ${str.tostring(level)} R${name}${priced(up)}`, css, textSize, extend);
          drawLabel(last + offset, down, `SD ${str.tostring(level)} S${name}${priced(down)}`, css, textSize, extend);
          if (offset > 9) {
            drawLine(last + 3, up, last + offset, up, css, 1, 'Arrow', false);
            drawLine(last + 3, down, last + offset, down, css, 1, 'Arrow', false);
          }
        }
      }
    };
    channel(true);
    channel(false);
  }

  // Linear regression curve, bands, slope arrows, volume and volatility marks: show_last = 3 x Count
  const shown = (i: number) => i >= n - 3 * cfg.linregLength;
  const dev = cfg.showCurveBTyp === 'StdDev' ? arr(ta.stdev(srcS, cfg.linregCurveBL)) : arr(ta.atr(bars, cfg.linregCurveAL));
  const lrc = arr(ta.linreg(srcS, cfg.linregCurveL, 0));
  const closeS = new Series(bars, (b) => b.close);
  const indexS = new Series(bars, (_, i) => i);
  const weightedAtr = arr(ta.atr(bars, cfg.atrLength)).map((v) => v * cfg.atrMultiplier);
  const volume = bars.map((b) => (b.volume === undefined || isNaN(b.volume) ? 0 : b.volume));
  const vSma = arr(ta.sma(Series.fromArray(bars, volume), cfg.vSmaLength));
  let slope: number[] = [];
  if (cfg.showSlope) {
    const corr = arr(ta.correlation(closeS, indexS, cfg.linregSlopeL));
    const sdClose = arr(ta.stdev(closeS, cfg.linregSlopeL));
    const sdIndex = arr(ta.stdev(indexS, cfg.linregSlopeL));
    slope = corr.map((c, i) => (c * sdClose[i]) / sdIndex[i]);
  }

  const bandColors = [cfg.lrColorBand1, cfg.lrColorBand1, cfg.lrColorBand2, cfg.lrColorBand2, cfg.lrColorBand3, cfg.lrColorBand3];
  const plots: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  for (const p of plotConfig) plots[p.id] = [];
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const show = shown(i);
    plots.plot0.push({ time: b.time, value: show && cfg.showCurve ? lrc[i] : NaN, color: cfg.lrColorCurve });
    for (let k = 0; k < 6; k++) {
      const mult = (Math.floor(k / 2) + 1) * (k % 2 === 0 ? 1 : -1);
      const value = show && cfg.showCurve && cfg.showCurveBand ? lrc[i] + mult * dev[i] : NaN;
      plots[`plot${k + 1}`].push({ time: b.time, value: isFinite(value) ? value : NaN, color: bandColors[k] });
    }
    if (!show) continue;
    // plotarrow(): up arrow below the bar for a positive slope, down arrow above the bar for a negative one
    if (cfg.showSlope && isFinite(slope[i]) && slope[i] !== 0) {
      markers.push(slope[i] > 0
        ? { time: b.time, position: 'belowBar', shape: 'arrowUp', color: cfg.lrColorSlopeU }
        : { time: b.time, position: 'aboveBar', shape: 'arrowDown', color: cfg.lrColorSlopeD });
    }
    const hasVolume = volume[i] !== 0;
    if (cfg.vSpikeLb && hasVolume && gt(volume[i], cfg.vSpikeThresh * vSma[i])) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '🚦', textColor: BLUE, size: 'tiny' });
    }
    if (cfg.hATRLb && gt(Math.abs(b.high - b.low), weightedAtr[i])) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '⚡', textColor: BLUE, size: 'tiny' });
    }
    // Volume weighted coloured bars
    if (cfg.vwcb && hasVolume) {
      if (gt(volume[i], vSma[i] * cfg.vwcbHighThresh)) barColors.push({ time: b.time, color: gt(b.close, b.open) ? '#006400' : '#910000' });
      else if (lt(volume[i], vSma[i] * cfg.vwcbLowThresh)) barColors.push({ time: b.time, color: lt(b.close, b.open) ? '#FF9800' : '#7FFFD4' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
    lines,
    labels,
    // var table logo = table.new(position.bottom_right, 1, 1) with one cell on the last bar
    tables: n > 0
      ? [{
        position: 'bottom_right', columns: 1, rows: 1,
        cells: [{ column: 0, row: 0, text: '☼☾  ', textSize: 'normal', textColor: TEAL, tooltip: 'SoleMare Analytics' }],
      }]
      : [],
  };
}

export const LinearRegressionChannelCurveSlopeByDgt = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
