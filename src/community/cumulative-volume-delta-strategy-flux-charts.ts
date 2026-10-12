/**
 * Cumulative Volume Delta Strategy | Flux Charts
 *
 * One setup at a time, on closed bars:
 * 1. Signal: the cumulative volume delta of the "Anchor Period" (CVD, the sum of the volume deltas of the bars since
 *    the start of the period) crossing under 0 is a sell signal, crossing over 0 a buy signal.
 * 2. Entry: on a fair value gap of the direction formed on a later bar ("FVGs"), or on the latest order block of the
 *    direction that starts after the signal ("Order Blocks"); with "Require Retracement" a later bar must come back
 *    into the zone. An opposite signal before the entry aborts the setup. The trade is entered at the close.
 *    Targets: Dynamic = stop at ATR(50) x the risk factor, take profit at 0.57 x the stop distance; Fixed = the two
 *    percentages. The stop wins when one bar reaches both.
 * Fair value gaps: three bars of the same type, the gap and the bodies large enough for the ATR(10) and the
 * sensitivity; the two latest unfilled gaps are kept. Order blocks: swing highs / lows of "Swing Length", the block is
 * the candle with the lowest low (highest high) since the swing, up to 3.5 x ATR(10); five are kept.
 *
 * Outputs: the "CVDS Line" (RMA(3) of the high + ATR(10) x range / RMA(10) of the range after a buy signal, of the low
 * minus it after a sell signal; buy / sell colour); "TP" / "SL" markers on the exit bars; for the 101 most recent
 * setups with an entry, the zone of the entry (box), a "Buy" / "Sell" label and the dashed target lines with "TP" /
 * "SL" labels (or two boxes with the "Alternative" layout; an open trade ends 15 bars after the current bar); the
 * backtesting table. Zone boxes of older setups stay on the chart (up to 500 boxes), as in the original. The four
 * alert conditions and the alert() calls give no output.
 *
 * Limit, lower-timeframe volume: the original reads the volume delta of each bar from the bars of a lower timeframe
 * (1 minute on intraday charts, 5 minutes on daily charts, 60 minutes above; `ta.requestVolumeDelta` of the ta
 * library, with the range of the CVD inside the bar). These bars are not in the chart bars: the port uses the
 * ESTIMATE of the chart bars (src/lower-tf-volume.ts): all the volume of a bar is up or down volume by the library
 * rule (up when close > open, down when close < open, else by the close before), so the range inside a bar is the
 * volume of the bar. The signals, the line and the trades are therefore NOT those of the original. Also the original
 * has the delta only on the bars where lower-timeframe data exists (its line and its signals start there), while the
 * port has the estimate on every bar. With the chart bars as the lower timeframe the original gives the same values
 * as the port. The original stops on 1-minute and seconds charts ("CVDS Indicator cannot run on 1-min & 1-second
 * charts.") and when the anchor period is below the chart timeframe: the port throws the same errors.
 *
 * Chart context (optional third argument):
 * - `chart.lastBarConfirmed`: the original works on closed bars only. When the last bar is still open, it is not
 *   read by the strategy, and the drawings are those of the bar before it. Without it every bar is a closed bar.
 * - `chart.timezone` / `chart.session` (and `chart.timeframe`): the anchor periods, the bar close times and the times
 *   after the last bar follow the exchange calendar; without them the UTC rule of the bars.
 * - `chart.mintick`: the tick of the prices in the texts of the "Alternative" layout. Without it 0.01.
 *
 * Reference: "Cumulative Volume Delta Strategy | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import {
  ta, str, color, timeframe, periodClose, Series, box, resetDrawings, setDrawingBar,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, TableData, TableCellData, TablePosition } from '../types';
import { chartTimeframe, hasCalendar, periodChanges, timeAfterLastBar, barsAfterLastBar } from '../anchor-period';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';
import { upDownVolumeOfChartBars } from '../lower-tf-volume';

export interface CumulativeVolumeDeltaStrategyFluxChartsInputs {
  anchorInput: string;
  entryMode: 'FVGs' | 'Order Blocks';
  requireRetracement: boolean;
  showCVDSLines: boolean;
  fvgSensitivityText: 'All' | 'Extreme' | 'High' | 'Normal' | 'Low';
  showFVG: boolean;
  swingLength: number;
  showOB: boolean;
  showTPSL: boolean;
  tpslMethod: 'Dynamic' | 'Fixed';
  riskAmount: 'Highest' | 'High' | 'Normal' | 'Low' | 'Lowest';
  tpPercent: number;
  slPercent: number;
  backtestDisplayEnabled: boolean;
  backtestingLocation: 'Top Right' | 'Right Center' | 'Top Center';
  fillBackgrounds: boolean;
  screenerColor: string;
  buyAlertEnabled: boolean;
  sellAlertEnabled: boolean;
  tpAlertEnabled: boolean;
  slAlertEnabled: boolean;
  /** TP / SL Layout */
  dbgTPSLVersion: 'Default' | 'Alternative';
  fvgBullColor: string;
  fvgBearColor: string;
  highColor: string;
  lowColor: string;
  textColor: string;
}

export const defaultInputs: CumulativeVolumeDeltaStrategyFluxChartsInputs = {
  anchorInput: '1D',
  entryMode: 'FVGs',
  requireRetracement: true,
  showCVDSLines: true,
  fvgSensitivityText: 'High',
  showFVG: true,
  swingLength: 10,
  showOB: true,
  showTPSL: true,
  tpslMethod: 'Dynamic',
  riskAmount: 'High',
  tpPercent: 0.3,
  slPercent: 0.4,
  backtestDisplayEnabled: true,
  backtestingLocation: 'Top Center',
  fillBackgrounds: true,
  screenerColor: '#1B1F2B',
  buyAlertEnabled: true,
  sellAlertEnabled: true,
  tpAlertEnabled: true,
  slAlertEnabled: true,
  dbgTPSLVersion: 'Default',
  fvgBullColor: 'rgba(8, 153, 129, 0.5)',
  fvgBearColor: 'rgba(242, 54, 70, 0.5)',
  highColor: '#089981',
  lowColor: '#f23646',
  textColor: '#ffffff',
};

const G = 'General Configuration';
export const inputConfig: InputConfig[] = [
  { id: 'anchorInput', type: 'timeframe', title: 'Anchor Period', defval: '1D', group: G },
  { id: 'entryMode', type: 'string', title: 'Entry Mode', defval: 'FVGs', options: ['FVGs', 'Order Blocks'], group: G },
  {
    id: 'requireRetracement', type: 'bool', title: 'Require Retracement', defval: true, group: G,
    tooltip: 'A retracement to the FVG or Order Block will be required for entry confirmation if enabled.',
  },
  { id: 'showCVDSLines', type: 'bool', title: 'Show CVDS Lines', defval: true, group: G },
  {
    id: 'fvgSensitivityText', type: 'string', title: 'FVG Detection Sensitivity', defval: 'High',
    options: ['All', 'Extreme', 'High', 'Normal', 'Low'], group: 'Fair Value Gaps',
  },
  { id: 'showFVG', type: 'bool', title: 'Show FVGs', defval: true, inline: 'bb', group: 'Fair Value Gaps' },
  {
    id: 'swingLength', type: 'int', title: 'Swing Length', defval: 10, min: 3, max: 45, group: 'Order Blocks',
    tooltip: 'Swing length is used when finding order block formations. Smaller values will result in finding smaller order blocks.',
  },
  { id: 'showOB', type: 'bool', title: 'Show Order Blocks', defval: true, group: 'Order Blocks' },
  { id: 'showTPSL', type: 'bool', title: 'Enabled', defval: true, group: 'TP / SL' },
  { id: 'tpslMethod', type: 'string', title: 'TP / SL Method', defval: 'Dynamic', options: ['Dynamic', 'Fixed'], group: 'TP / SL' },
  {
    id: 'riskAmount', type: 'string', title: 'Dynamic Risk', defval: 'High', options: ['Highest', 'High', 'Normal', 'Low', 'Lowest'], group: 'TP / SL',
    tooltip: 'The risk amount when Dynamic TP / SL method is selected.\n\nDifferent assets may have different volatility so changing this setting may result in change of performance of the indicator.',
  },
  { id: 'tpPercent', type: 'float', title: 'Fixed Take Profit %', defval: 0.3, step: 0.1, group: 'TP / SL' },
  { id: 'slPercent', type: 'float', title: 'Fixed Stop Loss %', defval: 0.4, step: 0.1, group: 'TP / SL' },
  { id: 'backtestDisplayEnabled', type: 'bool', title: 'Enabled', defval: true, group: 'Backtesting Dashboard' },
  {
    id: 'backtestingLocation', type: 'string', title: 'Position', defval: 'Top Center', options: ['Top Right', 'Right Center', 'Top Center'],
    group: 'Backtesting Dashboard',
  },
  { id: 'fillBackgrounds', type: 'bool', title: 'Fill Backgrounds', defval: true, group: 'Backtesting Dashboard' },
  { id: 'screenerColor', type: 'color', title: 'Background', defval: '#1B1F2B', inline: '1', group: 'Backtesting Dashboard' },
  { id: 'buyAlertEnabled', type: 'bool', title: 'Buy Signal', defval: true, inline: 'BS', group: 'Alerts' },
  { id: 'sellAlertEnabled', type: 'bool', title: 'Sell Signal', defval: true, inline: 'BS', group: 'Alerts' },
  { id: 'tpAlertEnabled', type: 'bool', title: 'Take-Profit Signal', defval: true, inline: 'TS', group: 'Alerts' },
  { id: 'slAlertEnabled', type: 'bool', title: 'Stop-Loss Signal ', defval: true, inline: 'TS', group: 'Alerts' },
  { id: 'dbgTPSLVersion', type: 'string', title: 'TP / SL Layout', defval: 'Default', options: ['Default', 'Alternative'], group: 'Visuals' },
  { id: 'fvgBullColor', type: 'color', title: 'Bullish Structure', defval: 'rgba(8, 153, 129, 0.5)', inline: 'fvgColor', group: 'Visuals' },
  { id: 'fvgBearColor', type: 'color', title: 'Bearish Structure', defval: 'rgba(242, 54, 70, 0.5)', inline: 'fvgColor', group: 'Visuals' },
  { id: 'highColor', type: 'color', title: 'Buy', defval: '#089981', inline: 'colors', group: 'Visuals' },
  { id: 'lowColor', type: 'color', title: 'Sell', defval: '#f23646', inline: 'colors', group: 'Visuals' },
  { id: 'textColor', type: 'color', title: 'Text', defval: '#ffffff', inline: 'colors', group: 'Visuals' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CVDS Line', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Cumulative Volume Delta Strategy | Flux Charts',
  shortTitle: 'CVDS | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const MAX_BOXES = 500;
const MAX_DISTANCE_TO_LAST_BAR = 100000;
const SHOW_LAST_X_FVGS = 2;
const MAX_ORDER_BLOCKS = 5;
const MAX_BARS_BACK = 50;
const EXTEND_LAST_X_FVGS = 20;
const ATR_LEN = 10;
const DELETE_UNTOUCHED_AFTER = 200;
const MAX_ATR_MULT = 3.5;
const EXTEND_ZONES_BY = 15;
const MAX_CVDS = 100;
const ATR_LEN_CVDS = 50;
const DYNAMIC_RR = 0.57;
/** Colour constants of Pine v5 */
const RED = '#FF5252';
const BLUE = '#2962FF';
const WHITE = '#FFFFFF';
const BLACK = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10; na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** Pine math.max: na when an argument is na */
const max2 = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));

interface FVGInfo {
  max: number;
  min: number;
  isBull: boolean;
  startTime: number;
  endTime: number;
  endBarIndex: number;
  extendInfinite: boolean;
  isInverse: boolean;
  lastTouched: number;
}
/** type FVG: the info and the two boxes of renderFVG (zone, text) */
interface FVG {
  info: FVGInfo;
  boxes: Box[];
}
interface OBInfo {
  top: number;
  bottom: number;
  obType: 'Bull' | 'Bear';
  startTime: number;
  breaker: boolean;
  breakTime: number;
  breakerEndTime: number;
}
interface OB {
  info: OBInfo;
  boxes: Box[];
}
type State = 'Waiting For CVDS' | 'Aborted' | 'Waiting For FVG' | 'Waiting For OB' | 'Waiting For FVG Retracement'
  | 'Waiting For OB Retracement' | 'Enter Position' | 'Entry Taken' | 'Take Profit' | 'Stop Loss' | 'Done';
interface CVDS {
  state: State;
  overlapDirection: 'Bull' | 'Bear' | null;
  breakTime: number;
  fvg: FVG | null;
  fvgEndTime: number;
  ob: OB | null;
  slTarget: number;
  tpTarget: number;
  entryType: 'Long' | 'Short' | null;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
}

const POSITIONS: Record<string, TablePosition> = {
  'Top Right': 'top_right',
  'Top Center': 'top_center',
  'Right Center': 'middle_right',
};

export function calculate(
  bars: Bar[],
  inputs: Partial<CumulativeVolumeDeltaStrategyFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const markers: MarkerData[] = [];
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];
  const boxesOut: BoxData[] = [];
  const cvdsPlot: Array<{ time: number; value: number; color: string }> = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: cvdsPlot },
    markers,
    lines,
    boxes: boxesOut,
    labels,
    tables,
  });
  if (n === 0) return result();

  // Lower timeframe of the request: "1S" on seconds charts, "1" intraday, "5" daily, "60" above
  const chartTf = chartTimeframe(bars, chart);
  const chartSec = timeframe.in_seconds(chartTf);
  const info = timeframe.info(chartTf);
  const lowerTimeframe = info.isseconds ? '1S' : info.isintraday ? '1' : info.isdaily ? '5' : '60';
  if (chartSec <= timeframe.in_seconds(lowerTimeframe)) throw new Error('CVDS Indicator cannot run on 1-min & 1-second charts.');
  const anchorSec = cfg.anchorInput.trim() === '' ? chartSec : timeframe.in_seconds(cfg.anchorInput);
  if (chartSec > anchorSec) throw new Error('Anchor period must be higher than current timeframe.');

  // Bar times are in s or ms; Pine adds ms
  const isMs = bars[0].time >= 1e12;
  const U = isMs ? 1 : 1000;
  const ms = (x: number) => x / U;
  const tfMs = chartSec * 1000;

  const fvgSensitivity = cfg.fvgSensitivityText === 'All' ? 100 : cfg.fvgSensitivityText === 'Extreme' ? 6
    : cfg.fvgSensitivityText === 'High' ? 2 : cfg.fvgSensitivityText === 'Normal' ? 1.5 : 1;
  const slATRMult = cfg.riskAmount === 'Highest' ? 10 : cfg.riskAmount === 'High' ? 8.5 : cfg.riskAmount === 'Normal' ? 6.5
    : cfg.riskAmount === 'Low' ? 5 : cfg.riskAmount === 'Lowest' ? 3 : 6.5;
  const fixed = cfg.tpslMethod === 'Fixed';
  const { tpPercent, slPercent } = cfg;
  const swingLength = Math.trunc(cfg.swingLength);
  const MINTICK = mintickOf(chart);

  const arr = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const S = (v: number[]) => Series.fromArray(bars, v);
  const atr = arr(ta.atr(bars, ATR_LEN));
  const atr50 = arr(ta.atr(bars, ATR_LEN_CVDS));
  const trueRange = arr(ta.tr(bars, true));
  // atrCVDS = nz(ta.atr(50), ta.tr(true))
  const atrCVDS = atr50.map((v, i) => (isNaN(v) ? trueRange[i] : v));
  const upperArr = arr(ta.highest(new Series(bars, (b) => b.high), swingLength));
  const lowerArr = arr(ta.lowest(new Series(bars, (b) => b.low), swingLength));

  // [openVolume, maxVolume, minVolume, lastVolume] = ta.requestVolumeDelta(lowerTimeframe, anchorInput), with the
  // estimate of the chart bars: the delta of a bar, its highest and lowest value inside the bar (from 0)
  const { delta } = upDownVolumeOfChartBars(bars);
  const anchorChanges = cfg.anchorInput.trim() === '' ? null : periodChanges(bars, cfg.anchorInput, chart);
  const lastVolume: number[] = [];
  const curRange: number[] = [];
  let lastVol = 0;
  for (let i = 0; i < n; i++) {
    const hiVol = Math.max(delta[i], 0);
    const loVol = Math.min(delta[i], 0);
    // anchorChange: no period, a new period, or the first bar (lastVolume not na and lastVolume[1] na)
    const anchorChange = anchorChanges === null || anchorChanges[i] || i === 0;
    const openVolume = anchorChange ? 0 : lastVol;
    const maxVolume = openVolume + hiVol;
    const minVolume = openVolume + loVol;
    lastVol = openVolume + delta[i];
    lastVolume.push(lastVol);
    curRange.push(maxVolume - minVolume);
  }
  const vdAtr = arr(ta.rma(S(curRange), ATR_LEN));
  const bearishSignals = arr(ta.crossunder(S(lastVolume), S(new Array(n).fill(0))) as unknown as Series).map((v) => Boolean(v));
  const bullishSignals = arr(ta.crossover(S(lastVolume), S(new Array(n).fill(0))) as unknown as Series).map((v) => Boolean(v));
  // lastSignal, the line of the side and its RMA(3)
  const lineValue: number[] = [];
  const lineColor: string[] = [];
  let lastSignal: 'Null' | 'Bull' | 'Bear' = 'Null';
  for (let i = 0; i < n; i++) {
    if (bearishSignals[i]) lastSignal = 'Bear';
    if (bullishSignals[i]) lastSignal = 'Bull';
    const b = bars[i];
    lineValue.push(lastSignal === 'Bull' ? b.high + atr[i] * (curRange[i] / vdAtr[i]) : b.low - atr[i] * (curRange[i] / vdAtr[i]));
    lineColor.push(lastSignal === 'Bull' ? cfg.highColor : cfg.lowColor);
  }
  const lineRma = arr(ta.rma(S(lineValue), 3));
  for (let i = 0; i < n; i++) {
    const v = cfg.showCVDSLines ? lineRma[i] : NaN;
    cvdsPlot.push({ time: bars[i].time, value: Number.isFinite(v) ? v : NaN, color: lineColor[i] });
  }

  // var cumVol += nz(volume): no volume on the last bar is an error
  if (!bars.some((b) => (b.volume ?? 0) !== 0 && !isNaN(b.volume ?? 0))) {
    throw new Error("The data vendor doesn't provide volume data for this symbol.");
  }

  // time_close of each chart bar
  let timeClose: number[] = [];
  if (chart && hasCalendar(chart)) {
    try {
      const context = {
        timeframe: chartTf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
        timeUnit: isMs ? 'ms' as const : 's' as const,
      };
      timeClose = bars.map((b) => ms(periodClose(b.time * U, chartTf, context)));
    } catch {
      timeClose = [];
    }
  }
  if (timeClose.length !== n) timeClose = bars.map((b) => b.time + ms(tfMs));

  // The strategy reads and draws closed bars only (barstate.isconfirmed)
  const lastConfirmed = lastBarConfirmedOf(chart);

  /** Time after the last bar: the bar `count` bars after the last bar */
  const after = (count: number) => timeAfterLastBar(bars, count, chart);
  /** A drawing x given as a time is drawn on the first bar at or after that time */
  const snap = (t: number): number => {
    if (isNaN(t)) return NaN;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time < t) lo = mid + 1;
      else hi = mid;
    }
    if (lo < n) return bars[lo].time;
    const k = barsAfterLastBar(bars, t, chart);
    if (isNaN(k)) return t;
    const tk = after(k);
    return tk >= t ? tk : after(k + 1);
  };

  // Box registry with the limit of indicator(); lines and labels are all deleted and drawn again on every closed
  // bar (at most 404 lines and 303 labels: below the limit), so only the last drawing bar is kept for them
  resetDrawings({ box: MAX_BOXES, line: MAX_BOXES, label: MAX_BOXES });

  const colorWithTransparency = (c: string, x: number) => String(color.new(c, color.t(c) * x));
  /** createFVGBox(): box.new(na, na, na, na, text_size = size.normal, xloc = xloc.bar_time, ...) */
  const createFVGBox = (boxColor: string, transparencyX = 1.0) => box.new(
    NaN, NaN, NaN, NaN, '#00000000', 1, 'solid', 'none', 'bar_time', colorWithTransparency(boxColor, transparencyX), '',
    'normal', cfg.textColor, 'center',
  );
  const moveBox = (b: Box, x1: number, y1: number, x2: number, y2: number) => {
    box.set_lefttop(b, x1, y1);
    box.set_rightbottom(b, x2, y2);
  };
  const deleteBoxes = (obj: { boxes: Box[] }) => {
    for (const b of obj.boxes) box.delete(b);
    obj.boxes = [];
  };

  // renderFVG(fvg, customEndTime) with the constant settings of the script (no volumetric info, no IFVG)
  const renderFVG = (fvg: FVG, customEndTime: number, time: number) => {
    const fi = fvg.info;
    const zoneBox = createFVGBox(fi.isBull ? cfg.fvgBullColor : cfg.fvgBearColor, 1.5);
    const textBox = createFVGBox(String(color.new(WHITE, 100)));
    fvg.boxes = [zoneBox, textBox];
    let zoneSize = isNaN(fi.endTime) ? ms(EXTEND_ZONES_BY * tfMs) : fi.endTime - fi.startTime;
    if (isNaN(fi.endTime) && fi.extendInfinite) zoneSize = time + ms(1) - fi.startTime;
    if (!isNaN(customEndTime)) zoneSize = customEndTime - fi.startTime;
    const maxEndX = fi.startTime + zoneSize / 3;
    moveBox(zoneBox, fi.startTime, fi.max, fi.startTime + zoneSize, fi.min);
    moveBox(textBox, maxEndX, fi.max, fi.startTime + zoneSize, fi.min);
  };
  // renderOrderBlock(ob): the order block colours are the structure colours
  const renderOrderBlock = (ob: OB, time: number) => {
    const oi = ob.info;
    const orderColor = oi.obType === 'Bull' ? cfg.fvgBullColor : cfg.fvgBearColor;
    const zoneBox = createFVGBox(orderColor, 1.5);
    const textBox = createFVGBox(String(color.new(WHITE, 100)));
    ob.boxes = [zoneBox, textBox];
    let zoneSize = isNaN(oi.breakTime) ? ms(EXTEND_ZONES_BY * tfMs) : (oi.breakTime - ms(chartSec * 1000)) - oi.startTime;
    if (isNaN(oi.breakTime)) zoneSize = time + ms(1) - oi.startTime;
    const maxEndX = oi.startTime + zoneSize / 3;
    moveBox(zoneBox, oi.startTime, oi.top, oi.startTime + zoneSize, oi.bottom);
    moveBox(textBox, maxEndX, oi.top, oi.startTime + zoneSize, oi.bottom);
  };

  // FVGs
  let fvgInfoList: FVGInfo[] = [];
  let allFVGList: FVG[] = [];
  // Order blocks
  const orderBlockInfoList: OBInfo[] = [];
  let allOrderBlocksList: OB[] = [];
  let swingType = 0;
  let prevSwingType = NaN;
  let top = { x: NaN, y: NaN, crossed: false };
  let btm = { x: NaN, y: NaN, crossed: false };
  // CVDS
  const cvdsList: CVDS[] = [];
  let lastCVDS: CVDS | null = null;
  let latestFVG: FVG | null = null;
  let latestOB: OB | null = null;
  let boxX: Box[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const b = bars[i];
    const time = b.time;
    const confirmed = i < last || lastConfirmed;
    const active = confirmed && i > last - MAX_DISTANCE_TO_LAST_BAR;
    const bk = (k: number) => (i - k >= 0 ? bars[i - k] : null);

    // Fair value gaps
    if (active) {
      const b1 = bk(1);
      const b2 = bk(2);
      let bearCondition = false;
      let bullCondition = false;
      if (b1 && b2) {
        const size = (x: Bar) => Math.max(x.open, x.close) - Math.min(x.open, x.close);
        const barSizeSum = size(b) + size(b1) + size(b2);
        const sameType = (gt(b.open, b.close) && gt(b1.open, b1.close) && gt(b2.open, b2.close))
          || (le(b.open, b.close) && le(b1.open, b1.close) && le(b2.open, b2.close));
        if (sameType) {
          const maxCODiff = Math.max(Math.abs(b2.close - b1.open), Math.abs(b1.close - b.open));
          const cond = gt(barSizeSum * fvgSensitivity, atr[i] / 1.5) && le(maxCODiff, atr[i]);
          bearCondition = cond;
          bullCondition = cond;
        }
      }
      const bearFVG = !!b2 && lt(b.high, b2.low) && lt(b1!.close, b2.low) && bearCondition;
      const bullFVG = !!b2 && gt(b.low, b2.high) && gt(b1!.close, b2.high) && bullCondition;
      const fvgSize = bearFVG ? Math.abs(b2!.low - b.high) : bullFVG ? Math.abs(b.low - b2!.high) : 0;
      if (gt(fvgSize * fvgSensitivity, atr[i]) && (bearFVG || bullFVG)) {
        fvgInfoList.unshift({
          max: bearFVG ? b2!.low : b.low, min: bearFVG ? b.high : b2!.high, isBull: !bearFVG, startTime: time,
          endTime: NaN, endBarIndex: NaN, extendInfinite: false, isInverse: false, lastTouched: i,
        });
        while (fvgInfoList.length > SHOW_LAST_X_FVGS) fvgInfoList.pop();
      }
      // Find closed FVGs (end on a close beyond the far side)
      for (const f of fvgInfoList) {
        if ((f.isBull && le(b.low, f.max)) || (!f.isBull && ge(b.high, f.min))) f.lastTouched = i;
        if (isNaN(f.endBarIndex)) {
          if ((f.isBull && lt(b.close, f.min)) || (!f.isBull && gt(b.close, f.max))) {
            f.endBarIndex = i;
            f.endTime = time;
            f.isInverse = true;
          }
        }
      }
      // Remove old FVGs: inverse ones (IFVGs are off) and the ones untouched for more than 200 bars
      fvgInfoList = fvgInfoList.filter((f) => !f.isInverse && !(i - f.lastTouched > DELETE_UNTOUCHED_AFTER));
    }

    // Order blocks (findOrderBlocks)
    if (active) {
      const upper = upperArr[i];
      const lower = lowerArr[i];
      const back = bk(swingLength);
      const li = back ? back.low : NaN;
      const hi = back ? back.high : NaN;
      const bi = back ? i - swingLength : NaN;
      swingType = gt(hi, upper) ? 0 : lt(li, lower) ? 1 : swingType;
      if (swingType === 0 && !isNaN(prevSwingType) && prevSwingType !== 0) top = { x: bi, y: hi, crossed: false };
      if (swingType === 1 && !isNaN(prevSwingType) && prevSwingType !== 1) btm = { x: bi, y: li, crossed: false };
      prevSwingType = swingType;

      const b1 = bk(1);
      let boxBtmBull = b1 ? b1.high : NaN;
      let boxTopBull = b1 ? b1.low : NaN;
      let boxLocBull = b1 ? b1.time : NaN;
      if (!isNaN(top.x)) {
        for (let k = 1; k <= i - top.x - 1; k++) {
          if (k > MAX_BARS_BACK - 2) break;
          const x = bars[i - k];
          boxBtmBull = Math.min(x.low, boxBtmBull);
          if (!ne(boxBtmBull, x.low)) {
            boxTopBull = x.high;
            boxLocBull = x.time;
          }
        }
      }
      let boxBtmBear = b1 ? b1.low : NaN;
      let boxTopBear = b1 ? b1.high : NaN;
      let boxLocBear = b1 ? b1.time : NaN;
      if (!isNaN(btm.x)) {
        for (let k = 1; k <= i - btm.x - 1; k++) {
          if (k > MAX_BARS_BACK - 2) break;
          const x = bars[i - k];
          boxTopBear = Math.max(x.high, boxTopBear);
          if (!ne(boxTopBear, x.high)) {
            boxBtmBear = x.low;
            boxLocBear = x.time;
          }
        }
      }
      // Invalidations (close method for order blocks, wick method for breakers)
      for (const ob of orderBlockInfoList) {
        if (ob.obType === 'Bull') {
          if (!ob.breaker) {
            if (lt(Math.min(b.open, b.close), ob.bottom)) {
              ob.breaker = true;
              ob.breakTime = timeClose[i];
            }
          } else if (gt(b.high, ob.top) && isNaN(ob.breakerEndTime)) {
            ob.breakerEndTime = timeClose[i];
          }
        } else if (!ob.breaker) {
          if (gt(Math.max(b.open, b.close), ob.top)) {
            ob.breaker = true;
            ob.breakTime = timeClose[i];
          }
        } else if (lt(b.low, ob.bottom) && isNaN(ob.breakerEndTime)) {
          ob.breakerEndTime = timeClose[i];
        }
      }
      // Bullish order block
      if (gt(b.close, top.y) && !top.crossed) {
        top.crossed = true;
        if (le(Math.abs(boxTopBull - boxBtmBull), atr[i] * MAX_ATR_MULT)) {
          orderBlockInfoList.unshift({
            top: boxTopBull, bottom: boxBtmBull, obType: 'Bull', startTime: boxLocBull, breaker: false, breakTime: NaN,
            breakerEndTime: NaN,
          });
          if (orderBlockInfoList.length > MAX_ORDER_BLOCKS) orderBlockInfoList.pop();
        }
      }
      // Bearish order block
      if (lt(b.close, btm.y) && !btm.crossed) {
        btm.crossed = true;
        if (le(Math.abs(boxTopBear - boxBtmBear), atr[i] * MAX_ATR_MULT)) {
          orderBlockInfoList.unshift({
            top: boxTopBear, bottom: boxBtmBear, obType: 'Bear', startTime: boxLocBear, breaker: false, breakTime: NaN,
            breakerEndTime: NaN,
          });
          if (orderBlockInfoList.length > MAX_ORDER_BLOCKS) orderBlockInfoList.pop();
        }
      }
    }

    // handleFVGsFinal() / handleOrderBlocksFinal(): new copies of the lists; the boxes of the objects before are
    // deleted
    if (active) {
      for (const f of allFVGList) deleteBoxes(f);
      allFVGList = fvgInfoList.map((fi) => ({ info: { ...fi }, boxes: [] }));
      let extended = 0;
      for (const f of allFVGList) {
        if (isNaN(f.info.endTime) && extended < EXTEND_LAST_X_FVGS) {
          extended += 1;
          f.info.extendInfinite = true;
        }
      }
      for (const ob of allOrderBlocksList) deleteBoxes(ob);
      allOrderBlocksList = orderBlockInfoList.map((oi) => ({ info: { ...oi }, boxes: [] }));
    }
    if (allFVGList.length > 0) latestFVG = allFVGList[0];
    if (allOrderBlocksList.length > 0) latestOB = allOrderBlocksList[0];

    const bearishSignal = bearishSignals[i];
    const bullishSignal = bullishSignals[i];

    // Strategy
    if (active) {
      if (lastCVDS === null || !(isNaN(lastCVDS.exitPrice) && lastCVDS.state !== 'Aborted')) {
        lastCVDS = {
          state: 'Waiting For CVDS', overlapDirection: null, breakTime: NaN, fvg: null, fvgEndTime: NaN, ob: null,
          slTarget: NaN, tpTarget: NaN, entryType: null, entryTime: NaN, exitTime: NaN, entryPrice: NaN, exitPrice: NaN,
        };
        cvdsList.unshift(lastCVDS);
      }
      const cv: CVDS = lastCVDS;
      // Abort non valid: an opposite signal before the entry
      if (isNaN(cv.entryTime)) {
        if (cv.overlapDirection === 'Bull' && bearishSignal) cv.state = 'Aborted';
        if (cv.overlapDirection === 'Bear' && bullishSignal) cv.state = 'Aborted';
      }
      // Waiting for a signal
      if (cv.state === 'Waiting For CVDS' && (bullishSignal || bearishSignal)) {
        if (bearishSignal) {
          cv.overlapDirection = 'Bear';
          cv.breakTime = time;
          cv.state = cfg.entryMode === 'FVGs' ? 'Waiting For FVG' : 'Waiting For OB';
        }
        if (bullishSignal) {
          cv.overlapDirection = 'Bull';
          cv.breakTime = time;
          cv.state = cfg.entryMode === 'FVGs' ? 'Waiting For FVG' : 'Waiting For OB';
        }
      }
      const wantBull = cv.overlapDirection !== 'Bear';
      if (cv.state === 'Waiting For OB' && latestOB !== null) {
        if (latestOB.info.startTime > cv.breakTime && latestOB.info.obType === (wantBull ? 'Bull' : 'Bear')) {
          cv.ob = latestOB;
          cv.state = cfg.requireRetracement ? 'Waiting For OB Retracement' : 'Enter Position';
        }
      }
      if (cv.state === 'Waiting For FVG' && latestFVG !== null) {
        if (latestFVG.info.startTime === time && latestFVG.info.isBull === wantBull) {
          cv.fvg = latestFVG;
          cv.state = cfg.requireRetracement ? 'Waiting For FVG Retracement' : 'Enter Position';
        }
      }
      // FVG retests and invalidation
      if (cv.fvg !== null && isNaN(cv.fvgEndTime)) {
        const f = cv.fvg.info;
        if (cv.state === 'Waiting For FVG Retracement' && time > f.startTime) {
          if (f.isBull && le(b.low, f.max)) cv.state = 'Enter Position';
          if (!f.isBull && ge(b.high, f.min)) cv.state = 'Enter Position';
        }
        if (f.isBull && lt(b.low, f.min)) cv.fvgEndTime = time;
        if (!f.isBull && gt(b.high, f.max)) cv.fvgEndTime = time;
      }
      // OB retests and invalidation
      if (cv.ob !== null && isNaN(cv.ob.info.breakTime)) {
        const o = cv.ob.info;
        if (cv.state === 'Waiting For OB Retracement' && time > o.startTime) {
          if (o.obType === 'Bull' && le(b.low, o.top)) cv.state = 'Enter Position';
          if (o.obType === 'Bear' && ge(b.high, o.bottom)) cv.state = 'Enter Position';
        }
        if (o.obType === 'Bull' && lt(b.low, o.bottom)) o.breakTime = time;
        if (o.obType === 'Bear' && gt(b.high, o.top)) o.breakTime = time;
      }
      // Enter position
      if (cv.state === 'Enter Position') {
        cv.state = 'Entry Taken';
        cv.entryTime = time;
        cv.entryPrice = b.close;
        if (cv.overlapDirection === 'Bull') {
          cv.entryType = 'Long';
          if (fixed) {
            cv.slTarget = cv.entryPrice * (1 - slPercent / 100.0);
            cv.tpTarget = cv.entryPrice * (1 + tpPercent / 100.0);
          } else {
            cv.slTarget = cv.entryPrice - atrCVDS[i] * slATRMult;
            cv.tpTarget = cv.entryPrice + Math.abs(cv.entryPrice - cv.slTarget) * DYNAMIC_RR;
          }
        } else {
          cv.entryType = 'Short';
          if (fixed) {
            cv.slTarget = cv.entryPrice * (1 + slPercent / 100.0);
            cv.tpTarget = cv.entryPrice * (1 - tpPercent / 100.0);
          } else {
            cv.slTarget = cv.entryPrice + atrCVDS[i] * slATRMult;
            cv.tpTarget = cv.entryPrice - Math.abs(cv.entryPrice - cv.slTarget) * DYNAMIC_RR;
          }
        }
      }
      // Exits: the four tests run one after the other (a stop on the same bar replaces a take profit)
      if (cv.state === 'Entry Taken' && time > cv.entryTime) {
        const long = cv.entryType === 'Long';
        const short = cv.entryType === 'Short';
        const exit = (price: number, state: State) => {
          cv.exitPrice = price;
          cv.exitTime = time;
          cv.state = state;
          if (isNaN(cv.fvgEndTime)) cv.fvgEndTime = time;
          if (cv.ob !== null && isNaN(cv.ob.info.breakTime)) cv.ob.info.breakTime = time;
        };
        if (fixed) {
          if (long && ge((b.high / cv.entryPrice - 1) * 100, tpPercent)) exit(cv.entryPrice * (1 + tpPercent / 100.0), 'Take Profit');
          if (short && le((b.low / cv.entryPrice - 1) * 100, -tpPercent)) exit(cv.entryPrice * (1 - tpPercent / 100.0), 'Take Profit');
          if (long && le((b.low / cv.entryPrice - 1) * 100, -slPercent)) exit(cv.entryPrice * (1 - slPercent / 100.0), 'Stop Loss');
          if (short && ge((b.high / cv.entryPrice - 1) * 100, slPercent)) exit(cv.entryPrice * (1 + slPercent / 100.0), 'Stop Loss');
        } else {
          if (long && ge(b.high, cv.tpTarget)) exit(cv.tpTarget, 'Take Profit');
          if (short && le(b.low, cv.tpTarget)) exit(cv.tpTarget, 'Take Profit');
          if (long && le(b.low, cv.slTarget)) exit(cv.slTarget, 'Stop Loss');
          if (short && ge(b.high, cv.slTarget)) exit(cv.slTarget, 'Stop Loss');
        }
      }
    }

    // Exit markers
    if (lastCVDS !== null) {
      const cv: CVDS = lastCVDS;
      const mark = (shape: 'circle' | 'xcross', above: boolean, col: string, text: string) => markers.push({
        time, position: above ? 'aboveBar' : 'belowBar', shape, color: col, text, textColor: cfg.textColor, size: 'tiny',
      });
      if (cv.state === 'Stop Loss' && time >= cv.exitTime) {
        mark('circle', cv.entryType !== 'Long', RED, 'SL');
        cv.state = 'Done';
      }
      if (cv.state === 'Take Profit') {
        mark('xcross', cv.entryType === 'Long', BLUE, 'TP');
        cv.state = 'Done';
      }
    }

    // Drawings: every closed bar deletes them and draws the 101 most recent setups again
    if (confirmed) {
      for (const x of boxX) box.delete(x);
      boxX = [];
      const drawBar = i === last || (i === last - 1 && !lastConfirmed);
      if (drawBar) {
        lines.length = 0;
        labels.length = 0;
      }
      // time("", -15): the bar 15 bars after the current bar
      const endOpen = i + 15 <= last ? bars[i + 15].time : after(i + 15 - last);
      const half = (c: string) => String(color.new(c, 50));
      const textColor = String(color.new(cfg.textColor, 0));
      for (let k = 0; k <= Math.min(MAX_CVDS, cvdsList.length - 1); k++) {
        const ts = cvdsList[k];
        if (isNaN(ts.entryTime)) continue;
        const long = ts.entryType === 'Long';
        if (cfg.showFVG && ts.fvg !== null) {
          deleteBoxes(ts.fvg);
          renderFVG(ts.fvg, max2(ts.fvg.info.startTime + ms(chartSec * 1000 * 5), ts.fvgEndTime), time);
        }
        if (cfg.showOB && ts.ob !== null) {
          deleteBoxes(ts.ob);
          renderOrderBlock(ts.ob, time);
        }
        if (drawBar) {
          labels.push(long
            ? { time: snap(ts.entryTime), price: b.close, text: 'Buy', yloc: 'belowbar', textColor, color: cfg.highColor, style: 'label_up', size: 'normal' }
            : { time: snap(ts.entryTime), price: b.close, text: 'Sell', yloc: 'abovebar', textColor, color: cfg.lowColor, style: 'label_down', size: 'normal' });
        }
        if (!cfg.showTPSL) continue;
        const endTime = isNaN(ts.exitTime) ? endOpen : ts.exitTime;
        if (cfg.dbgTPSLVersion === 'Alternative') {
          const offset = atrCVDS[i] / 3.0;
          const altBox = (y: number, text: string, bg: string) => box.new(
            ts.entryTime, y + offset, endTime, y - offset, BLUE, 0, 'solid', 'none', 'bar_time', half(bg), text, 'small', cfg.textColor,
          );
          boxX.push(altBox(ts.tpTarget, `TAKE PROFIT (${str.tostring(ts.tpTarget, 'mintick', MINTICK)})`, cfg.highColor));
          boxX.push(altBox(ts.slTarget, `STOP LOSS (${str.tostring(ts.slTarget, 'mintick', MINTICK)})`, cfg.lowColor));
        } else if (drawBar) {
          const dashed = (x1: number, y1: number, x2: number, y2: number, col: string): LineDrawingData => ({
            time1: snap(x1), price1: y1, time2: snap(x2), price2: y2, color: col, style: 'dashed',
          });
          lines.push(dashed(ts.entryTime, ts.entryPrice, ts.entryTime, ts.tpTarget, cfg.highColor));
          lines.push(dashed(ts.entryTime, ts.tpTarget, endTime, ts.tpTarget, cfg.highColor));
          labels.push({ time: snap(endTime), price: ts.tpTarget, text: 'TP', yloc: 'price', textColor, color: half(cfg.highColor), style: 'label_left', size: 'normal' });
          lines.push(dashed(ts.entryTime, ts.entryPrice, ts.entryTime, ts.slTarget, cfg.lowColor));
          lines.push(dashed(ts.entryTime, ts.slTarget, endTime, ts.slTarget, cfg.lowColor));
          labels.push({ time: snap(endTime), price: ts.slTarget, text: 'SL', yloc: 'price', textColor, color: half(cfg.lowColor), style: 'label_left', size: 'normal' });
        }
      }
    }
  }
  setDrawingBar(null);

  for (const x of box.all()) {
    boxesOut.push({
      time1: snap(x.left), price1: x.top, time2: snap(x.right), price2: x.bottom, bgColor: String(x.bgcolor ?? 'transparent'),
      borderColor: String(x.border_color ?? 'transparent'), borderWidth: x.border_width ?? 1, text: x.text ?? '',
      textSize: x.text_size as BoxData['textSize'], textColor: String(x.text_color ?? cfg.textColor), textHAlign: x.text_halign ?? 'center',
    });
  }
  resetDrawings();

  // Backtesting dashboard, on the last bar
  if (cfg.backtestDisplayEnabled) {
    let totalProfitPercent = 0;
    let wins = 0;
    let losses = 0;
    const diffPercent = (val1: number, val2: number) => (Math.abs(val1 - val2) / val2) * 100.0;
    for (const cur of cvdsList) {
      if (isNaN(cur.exitPrice)) continue;
      let isSuccess = false;
      if ((cur.entryType === 'Long' && gt(cur.exitPrice, cur.entryPrice)) || (cur.entryType === 'Short' && lt(cur.exitPrice, cur.entryPrice))) {
        totalProfitPercent += Math.abs(diffPercent(cur.entryPrice, cur.exitPrice));
        isSuccess = true;
      } else {
        totalProfitPercent -= Math.abs(diffPercent(cur.entryPrice, cur.exitPrice));
      }
      if (isSuccess) wins += 1;
      else losses += 1;
    }
    const total = wins + losses;
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string) => cells.push({
      column, row, text, textColor: WHITE, bgColor: cfg.screenerColor, textSize: 'auto',
    });
    cell(0, 0, 'CVDS Backtesting');
    cell(0, 1, 'Total Entries');
    cell(1, 1, str.tostring(total));
    cell(0, 2, 'Wins');
    cell(1, 2, str.tostring(wins));
    cell(0, 3, 'Losses');
    cell(1, 3, str.tostring(losses));
    cell(0, 4, 'Winrate');
    cell(1, 4, `${str.tostring(100.0 * (wins / total), '#.##')}%`);
    cell(0, 5, 'Average Profit');
    cell(1, 5, `${str.tostring(totalProfitPercent / total, '#.##')}%`);
    cell(0, 6, 'Total Profit');
    cell(1, 6, `${str.tostring(totalProfitPercent, '#.##')}%`);
    tables.push({
      position: POSITIONS[cfg.backtestingLocation] ?? 'top_center', columns: 2, rows: 10, cells,
      merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }],
      bgColor: cfg.screenerColor, frameWidth: 2, frameColor: BLACK, borderWidth: 1, borderColor: BLACK,
    });
  }

  return result();
}

export const CumulativeVolumeDeltaStrategyFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
