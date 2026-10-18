/**
 * Candle Range Theory | Flux Charts
 *
 * One setup at a time, on closed bars:
 * 1. Bulky candle: a higher-timeframe candle (input "Higher Timeframe", completed candles as `request.security`
 *    gives them) whose high differs from the candle before and whose true range is above its ATR(10) x 2.1 / 1.6 /
 *    1.3 ("HTF Candle Size"). Its high and low are the range; the line starts are the chart bars of the last 200
 *    whose low / high is nearest to them.
 * 2. Side retest: a close outside the range aborts the setup. A bar that wicks above the high and closes below it
 *    (bearish) or wicks below the low and closes above it (bullish) is the break.
 * 3. Entry: on a fair value gap of the direction formed on that bar or later ("FVGs"), or on the latest order block
 *    of the direction that starts after the break ("Order Blocks"); with "Require Retracement" a later bar must come
 *    back into the zone. The trade is entered at the close. Targets: Dynamic = stop at ATR(50) x the risk factor,
 *    take profit at 0.39 x the stop distance; Fixed = the two percentages. The stop wins when one bar reaches both.
 * Fair value gaps: three bars of the same type, the gap and the bodies large enough for the ATR(10) and the
 * sensitivity; the two latest unfilled gaps are kept. Order blocks: swing highs / lows of "Swing Length", the
 * block is the candle with the lowest low (highest high) since the swing, up to 3.5 x ATR(10); five are kept.
 *
 * Outputs: "TP" / "SL" markers on the exit bars; for the 76 most recent setups with an entry, the two range lines,
 * the zone of the entry (box), a "Buy" / "Sell" label and the dashed target lines with "TP" / "SL" labels (or two
 * boxes with the "Alternative" layout; an open trade ends 15 bars after the current bar); the backtesting table.
 * Zone boxes of older setups stay on the chart (up to 500 boxes), as in the original.
 * Alerts: the four alert conditions (`alerts` of the result: 'Buy Signal' and 'Sell Signal' on the entry bars of a
 * long / short trade, 'Take-Profit Signal' and 'Stop-Loss Signal' on its exit bars) and the alert() calls of the same
 * names (`alertCalls`, once per bar, each with its "... Signal" input on), as in the original only from the last closed
 * bar of the history on (the bars before it are the initial run): the last bar, or the bar before it when the last bar
 * is still open.
 *
 * Chart context (optional third argument):
 * - `chart.lastBarConfirmed`: the original works on closed bars only. When the last bar is still open, it is not
 *   read, and the drawings are those of the bar before it. Without it every bar is a closed bar.
 * - `chart.timezone` / `chart.session` (and `chart.timeframe`): the higher-timeframe candles, the bar close times
 *   and the times after the last bar follow the exchange calendar; without them the UTC rule of the bars.
 * - `chart.mintick`: the tick of the prices in the texts of the "Alternative" layout. Without it 0.01.
 *
 * Reference: "Candle Range Theory | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import {
  ta, str, color, timeframe, periodClose, Series, box, resetDrawings, setDrawingBar,
  type Box, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { AlertCall, BoxData, LabelData, LineDrawingData, MarkerData, TableData, TableCellData, TablePosition } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { chartTimeframe, hasCalendar, higherTimeframeBars, timeAfterLastBar, barsAfterLastBar } from '../anchor-period';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

export interface CandleRangeTheoryFluxChartsInputs {
  higherTF: string;
  bulkyCandleATRStr: 'Big' | 'Normal' | 'Small';
  entryMode: 'FVGs' | 'Order Blocks';
  requireRetracement: boolean;
  showHTFLines: boolean;
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

export const defaultInputs: CandleRangeTheoryFluxChartsInputs = {
  higherTF: '240',
  bulkyCandleATRStr: 'Big',
  entryMode: 'FVGs',
  requireRetracement: false,
  showHTFLines: true,
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
  {
    id: 'higherTF', type: 'timeframe', title: 'Higher Timeframe', defval: '240', group: G,
    tooltip: 'M15 -> H4 is recommended.\n\nAll Recommended Timeframes :\nWeekly -> Monthly\nDaily -> Weekly\nH4 -> Daily\nM15 -> H4\nM3 -> M30',
  },
  {
    id: 'bulkyCandleATRStr', type: 'string', title: 'HTF Candle Size', defval: 'Big', options: ['Big', 'Normal', 'Small'], group: G,
    tooltip: "The size of the higher timeframe candle. A candle will be considered eligible for CRT if it's range obliges to this setting.",
  },
  { id: 'entryMode', type: 'string', title: 'Entry Mode', defval: 'FVGs', options: ['FVGs', 'Order Blocks'], group: G },
  {
    id: 'requireRetracement', type: 'bool', title: 'Require Retracement', defval: false, group: G,
    tooltip: 'A retracement to the FVG or Order Block will be required for entry confirmation if enabled.',
  },
  { id: 'showHTFLines', type: 'bool', title: 'Show HTF Candle Lines', defval: true, group: G },
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
  { id: 'fvgBullColor', type: 'color', title: 'Bullish FVG', defval: 'rgba(8, 153, 129, 0.5)', inline: 'fvgColor', group: 'Visuals' },
  { id: 'fvgBearColor', type: 'color', title: 'Bearish FVG', defval: 'rgba(242, 54, 70, 0.5)', inline: 'fvgColor', group: 'Visuals' },
  { id: 'highColor', type: 'color', title: 'Buy', defval: '#089981', inline: 'colors', group: 'Visuals' },
  { id: 'lowColor', type: 'color', title: 'Sell', defval: '#f23646', inline: 'colors', group: 'Visuals' },
  { id: 'textColor', type: 'color', title: 'Text', defval: '#ffffff', inline: 'colors', group: 'Visuals' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Candle Range Theory | Flux Charts',
  shortTitle: 'CRT | Flux Charts',
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
const MAX_ARR_COUNT = 200;
const DELETE_UNTOUCHED_AFTER = 200;
const MAX_ATR_MULT = 3.5;
const EXTEND_ZONES_BY = 15;
const MAX_CRT = 75;
const ATR_LEN_CRT = 50;
const DYNAMIC_RR = 0.39;
const BULL_OB_COLOR = '#08998180';
const BEAR_OB_COLOR = '#f2364680';
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
type State = 'Waiting For Bulky Candle' | 'Waiting For Side Retest' | 'Aborted' | 'Waiting For FVG' | 'Waiting For OB'
  | 'Waiting For FVG Retracement' | 'Waiting For OB Retracement' | 'Enter Position' | 'Entry Taken' | 'Take Profit'
  | 'Stop Loss' | 'Done';
interface CRT {
  state: State;
  overlapDirection: 'Bull' | 'Bear' | null;
  bulkyTimeLow: number;
  bulkyTimeHigh: number;
  bulkyHigh: number;
  bulkyLow: number;
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
  inputs: Partial<CandleRangeTheoryFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] }
  & { alerts: AlertConditionState[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const markers: MarkerData[] = [];
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];
  const boxesOut: BoxData[] = [];
  // buyAlertTick / sellAlertTick / tpAlertTick / slAlertTick and not initRun, per bar
  const alertFlags: boolean[][] = [[], [], [], []];
  const alertCalls: AlertCall[] = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines,
    boxes: boxesOut,
    labels,
    tables,
    alerts: alertStates(alertConditions, bars, alertFlags),
    alertCalls,
  });
  if (n === 0) return result();

  // if timeframe.in_seconds() > timeframe.in_seconds(higherTF): runtime.error(...)
  const chartTf = chartTimeframe(bars, chart);
  const chartSec = timeframe.in_seconds(chartTf);
  const htfSec = cfg.higherTF.trim() === '' ? chartSec : timeframe.in_seconds(cfg.higherTF);
  if (chartSec > htfSec) throw new Error('Higher timeframe must be higher than current timeframe.');

  // Bar times are in s or ms; Pine adds ms
  const isMs = bars[0].time >= 1e12;
  const U = isMs ? 1 : 1000;
  const ms = (x: number) => x / U;
  const tfMs = chartSec * 1000;

  const bulkyCandleATR = cfg.bulkyCandleATRStr === 'Big' ? 2.1 : cfg.bulkyCandleATRStr === 'Normal' ? 1.6 : 1.3;
  const fvgSensitivity = cfg.fvgSensitivityText === 'All' ? 100 : cfg.fvgSensitivityText === 'Extreme' ? 6
    : cfg.fvgSensitivityText === 'High' ? 2 : cfg.fvgSensitivityText === 'Normal' ? 1.5 : 1;
  const slATRMult = cfg.riskAmount === 'Highest' ? 10 : cfg.riskAmount === 'High' ? 8 : cfg.riskAmount === 'Normal' ? 6.5
    : cfg.riskAmount === 'Low' ? 5 : cfg.riskAmount === 'Lowest' ? 3 : 6.5;
  const fixed = cfg.tpslMethod === 'Fixed';
  const { tpPercent, slPercent } = cfg;
  const swingLength = Math.trunc(cfg.swingLength);
  const MINTICK = mintickOf(chart);

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const atr = arr(ta.atr(bars, ATR_LEN));
  const atrCRT = arr(ta.atr(bars, ATR_LEN_CRT));
  const upperArr = arr(ta.highest(new Series(bars, (b) => b.high), swingLength));
  const lowerArr = arr(ta.lowest(new Series(bars, (b) => b.low), swingLength));

  // request.security(syminfo.tickerid, higherTF, barInfo.new(open, high, low, close, ta.tr, ta.atr(10))): the latest
  // completed candle of the timeframe (on the chart timeframe: the chart bar itself)
  let htfHigh: number[];
  let htfLow: number[];
  let htfTr: number[];
  let htfAtr: number[];
  let latest: number[];
  if (htfSec === chartSec) {
    htfHigh = bars.map((b) => b.high);
    htfLow = bars.map((b) => b.low);
    htfTr = arr(ta.tr(bars, false));
    htfAtr = atr;
    latest = bars.map((_, i) => i);
  } else {
    const sec = higherTimeframeBars(bars, cfg.higherTF, chart);
    htfHigh = sec.htf.map((b) => b.high);
    htfLow = sec.htf.map((b) => b.low);
    htfTr = arr(ta.tr(sec.htf, false));
    htfAtr = arr(ta.atr(sec.htf, ATR_LEN));
    latest = sec.latest;
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

  // The original reads and draws closed bars only (barstate.isconfirmed)
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
  // bar (at most 456 lines and 228 labels: below the limit), so only the last drawing bar is kept for them
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
    const info = fvg.info;
    const zoneBox = createFVGBox(info.isBull ? cfg.fvgBullColor : cfg.fvgBearColor, 1.5);
    const textBox = createFVGBox(String(color.new(WHITE, 100)));
    fvg.boxes = [zoneBox, textBox];
    let zoneSize = isNaN(info.endTime) ? ms(EXTEND_ZONES_BY * tfMs) : info.endTime - info.startTime;
    if (isNaN(info.endTime) && info.extendInfinite) zoneSize = time + ms(1) - info.startTime;
    if (!isNaN(customEndTime)) zoneSize = customEndTime - info.startTime;
    const maxEndX = info.startTime + zoneSize / 3;
    moveBox(zoneBox, info.startTime, info.max, info.startTime + zoneSize, info.min);
    moveBox(textBox, maxEndX, info.max, info.startTime + zoneSize, info.min);
  };
  // renderOrderBlock(ob)
  const renderOrderBlock = (ob: OB, time: number) => {
    const info = ob.info;
    const orderColor = info.obType === 'Bull' ? BULL_OB_COLOR : BEAR_OB_COLOR;
    const zoneBox = createFVGBox(orderColor, 1.5);
    const textBox = createFVGBox(String(color.new(WHITE, 100)));
    ob.boxes = [zoneBox, textBox];
    let zoneSize = isNaN(info.breakTime) ? ms(EXTEND_ZONES_BY * tfMs) : (info.breakTime - ms(chartSec * 1000)) - info.startTime;
    if (isNaN(info.breakTime)) zoneSize = time + ms(1) - info.startTime;
    const maxEndX = info.startTime + zoneSize / 3;
    moveBox(zoneBox, info.startTime, info.top, info.startTime + zoneSize, info.bottom);
    moveBox(textBox, maxEndX, info.top, info.startTime + zoneSize, info.bottom);
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
  // CRT
  const crtList: CRT[] = [];
  let lastCRT: CRT | null = null;
  let latestFVG: FVG | null = null;
  let latestOB: OB | null = null;
  let lastHigh = NaN;
  let lastLow = NaN;
  let boxX: Box[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const b = bars[i];
    const time = b.time;
    const confirmed = i < last || lastConfirmed;
    const active = confirmed && i > last - MAX_DISTANCE_TO_LAST_BAR;
    // buyAlertTick = false, sellAlertTick = false, tpAlertTick = false, slAlertTick = false on every bar
    let buyAlertTick = false, sellAlertTick = false, tpAlertTick = false, slAlertTick = false;
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
      allFVGList = fvgInfoList.map((info) => ({ info: { ...info }, boxes: [] }));
      let extended = 0;
      for (const f of allFVGList) {
        if (isNaN(f.info.endTime) && extended < EXTEND_LAST_X_FVGS) {
          extended += 1;
          f.info.extendInfinite = true;
        }
      }
      for (const ob of allOrderBlocksList) deleteBoxes(ob);
      allOrderBlocksList = orderBlockInfoList.map((info) => ({ info: { ...info }, boxes: [] }));
    }
    if (allFVGList.length > 0) latestFVG = allFVGList[0];
    if (allOrderBlocksList.length > 0) latestOB = allOrderBlocksList[0];

    // Bulky candle of the higher timeframe
    let newBulkyCandle = false;
    const cur = latest[i];
    const old = i > 0 ? latest[i - 1] : -1;
    if (old >= 0 && cur >= 0) {
      if (ne(htfHigh[old], htfHigh[cur]) && gt(htfTr[cur], htfAtr[cur] * bulkyCandleATR)) {
        newBulkyCandle = true;
        lastHigh = htfHigh[cur];
        lastLow = htfLow[cur];
      }
    }

    // findValRtnTime(value, "Low" / "High", "Nearest"): the newest of the last 200 bars nearest to the value
    const nearestTime = (value: number, useLow: boolean) => {
      let rtn = NaN;
      let minDiff = NaN;
      for (let k = Math.max(0, i - MAX_ARR_COUNT + 1); k <= i; k++) {
        const diff = Math.abs(value - (useLow ? bars[k].low : bars[k].high));
        if (isNaN(minDiff)) {
          rtn = bars[k].time;
          minDiff = diff;
        } else if (le(diff, minDiff)) {
          minDiff = diff;
          rtn = bars[k].time;
        }
      }
      return rtn;
    };

    if (active) {
      if (lastCRT === null || !(isNaN(lastCRT.exitPrice) && lastCRT.state !== 'Aborted')) {
        lastCRT = {
          state: 'Waiting For Bulky Candle', overlapDirection: null, bulkyTimeLow: NaN, bulkyTimeHigh: NaN, bulkyHigh: NaN,
          bulkyLow: NaN, breakTime: NaN, fvg: null, fvgEndTime: NaN, ob: null, slTarget: NaN, tpTarget: NaN,
          entryType: null, entryTime: NaN, exitTime: NaN, entryPrice: NaN, exitPrice: NaN,
        };
        crtList.unshift(lastCRT);
      }
      const crt: CRT = lastCRT;
      if (crt.state === 'Waiting For Bulky Candle' && newBulkyCandle) {
        crt.bulkyHigh = lastHigh;
        crt.bulkyLow = lastLow;
        crt.bulkyTimeLow = nearestTime(lastLow, true);
        crt.bulkyTimeHigh = nearestTime(lastHigh, false);
        crt.state = 'Waiting For Side Retest';
      } else if (crt.state === 'Waiting For Side Retest') {
        if (gt(b.close, crt.bulkyHigh)) crt.state = 'Aborted';
        else if (lt(b.close, crt.bulkyLow)) crt.state = 'Aborted';
        if (crt.state !== 'Aborted') {
          const bearOverlap = gt(b.high, crt.bulkyHigh) && le(b.close, crt.bulkyHigh);
          const bullOverlap = lt(b.low, crt.bulkyLow) && ge(b.close, crt.bulkyLow);
          if (bearOverlap !== bullOverlap) {
            crt.overlapDirection = bearOverlap ? 'Bear' : 'Bull';
            crt.breakTime = time;
            crt.state = cfg.entryMode === 'FVGs' ? 'Waiting For FVG' : 'Waiting For OB';
          }
        }
      }
      const wantBull = crt.overlapDirection !== 'Bear';
      if (crt.state === 'Waiting For OB' && latestOB !== null) {
        if (latestOB.info.startTime > crt.breakTime && latestOB.info.obType === (wantBull ? 'Bull' : 'Bear')) {
          crt.ob = latestOB;
          crt.state = cfg.requireRetracement ? 'Waiting For OB Retracement' : 'Enter Position';
        }
      }
      if (crt.state === 'Waiting For FVG' && latestFVG !== null) {
        if (latestFVG.info.startTime === time && latestFVG.info.isBull === wantBull) {
          crt.fvg = latestFVG;
          crt.state = cfg.requireRetracement ? 'Waiting For FVG Retracement' : 'Enter Position';
        }
      }
      // FVG retests and invalidation
      if (crt.fvg !== null && isNaN(crt.fvgEndTime)) {
        const f = crt.fvg.info;
        if (crt.state === 'Waiting For FVG Retracement' && time > f.startTime) {
          if (f.isBull && le(b.low, f.max)) crt.state = 'Enter Position';
          if (!f.isBull && ge(b.high, f.min)) crt.state = 'Enter Position';
        }
        if (f.isBull && lt(b.low, f.min)) crt.fvgEndTime = time;
        if (!f.isBull && gt(b.high, f.max)) crt.fvgEndTime = time;
      }
      // OB retests and invalidation
      if (crt.ob !== null && isNaN(crt.ob.info.breakTime)) {
        const o = crt.ob.info;
        if (crt.state === 'Waiting For OB Retracement' && time > o.startTime) {
          if (o.obType === 'Bull' && le(b.low, o.top)) crt.state = 'Enter Position';
          if (o.obType === 'Bear' && ge(b.high, o.bottom)) crt.state = 'Enter Position';
        }
        if (o.obType === 'Bull' && lt(b.low, o.bottom)) o.breakTime = time;
        if (o.obType === 'Bear' && gt(b.high, o.top)) o.breakTime = time;
      }
      // Enter position
      if (crt.state === 'Enter Position') {
        crt.state = 'Entry Taken';
        crt.entryTime = time;
        crt.entryPrice = b.close;
        if (crt.overlapDirection === 'Bull') {
          crt.entryType = 'Long';
          buyAlertTick = true;
          if (fixed) {
            crt.slTarget = crt.entryPrice * (1 - slPercent / 100.0);
            crt.tpTarget = crt.entryPrice * (1 + tpPercent / 100.0);
          } else {
            crt.slTarget = crt.entryPrice - atrCRT[i] * slATRMult;
            crt.tpTarget = crt.entryPrice + Math.abs(crt.entryPrice - crt.slTarget) * DYNAMIC_RR;
          }
        } else {
          crt.entryType = 'Short';
          sellAlertTick = true;
          if (fixed) {
            crt.slTarget = crt.entryPrice * (1 + slPercent / 100.0);
            crt.tpTarget = crt.entryPrice * (1 - tpPercent / 100.0);
          } else {
            crt.slTarget = crt.entryPrice + atrCRT[i] * slATRMult;
            crt.tpTarget = crt.entryPrice - Math.abs(crt.entryPrice - crt.slTarget) * DYNAMIC_RR;
          }
        }
      }
      // Exits: the four tests run one after the other (a stop on the same bar replaces a take profit)
      if (crt.state === 'Entry Taken' && time > crt.entryTime) {
        const long = crt.entryType === 'Long';
        const short = crt.entryType === 'Short';
        const exit = (price: number, state: State) => {
          if (state === 'Take Profit') tpAlertTick = true;
          else slAlertTick = true;
          crt.exitPrice = price;
          crt.exitTime = time;
          crt.state = state;
          if (isNaN(crt.fvgEndTime)) crt.fvgEndTime = time;
          if (crt.ob !== null && isNaN(crt.ob.info.breakTime)) crt.ob.info.breakTime = time;
        };
        if (fixed) {
          if (long && ge((b.high / crt.entryPrice - 1) * 100, tpPercent)) exit(crt.entryPrice * (1 + tpPercent / 100.0), 'Take Profit');
          if (short && le((b.low / crt.entryPrice - 1) * 100, -tpPercent)) exit(crt.entryPrice * (1 - tpPercent / 100.0), 'Take Profit');
          if (long && le((b.low / crt.entryPrice - 1) * 100, -slPercent)) exit(crt.entryPrice * (1 - slPercent / 100.0), 'Stop Loss');
          if (short && ge((b.high / crt.entryPrice - 1) * 100, slPercent)) exit(crt.entryPrice * (1 + slPercent / 100.0), 'Stop Loss');
        } else {
          if (long && ge(b.high, crt.tpTarget)) exit(crt.tpTarget, 'Take Profit');
          if (short && le(b.low, crt.tpTarget)) exit(crt.tpTarget, 'Take Profit');
          if (long && le(b.low, crt.slTarget)) exit(crt.slTarget, 'Stop Loss');
          if (short && ge(b.high, crt.slTarget)) exit(crt.slTarget, 'Stop Loss');
        }
      }
    }

    // if barstate.islastconfirmedhistory: initRun := false (var initRun = true): the last bar when it is closed, else
    // the bar before it
    const initRun = i < (lastConfirmed ? last : last - 1);
    // alertcondition(<tick> and not initRun, "<name> Signal", ""); if not initRun: if <tick> and <enabled>: alert(...)
    const ticks = [buyAlertTick, sellAlertTick, tpAlertTick, slAlertTick];
    const enabled = [cfg.buyAlertEnabled, cfg.sellAlertEnabled, cfg.tpAlertEnabled, cfg.slAlertEnabled];
    ticks.forEach((tick, k) => {
      alertFlags[k].push(tick && !initRun);
      if (tick && !initRun && enabled[k]) alertCalls.push({ time, message: alertConditions[k].title, freq: 'once_per_bar' });
    });

    // Exit markers
    if (lastCRT !== null) {
      const crt: CRT = lastCRT;
      const mark = (shape: 'circle' | 'xcross', above: boolean, col: string, text: string) => markers.push({
        time, position: above ? 'aboveBar' : 'belowBar', shape, color: col, text, textColor: cfg.textColor, size: 'tiny',
      });
      if (crt.state === 'Stop Loss' && time >= crt.exitTime) {
        mark('circle', crt.entryType !== 'Long', RED, 'SL');
        crt.state = 'Done';
      }
      if (crt.state === 'Take Profit') {
        mark('xcross', crt.entryType === 'Long', BLUE, 'TP');
        crt.state = 'Done';
      }
    }

    // Drawings: every closed bar deletes them and draws the 76 most recent setups again
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
      for (let k = 0; k <= Math.min(MAX_CRT, crtList.length - 1); k++) {
        const ts = crtList[k];
        if (isNaN(ts.entryTime)) continue;
        const long = ts.entryType === 'Long';
        if (drawBar && cfg.showHTFLines) {
          lines.push({
            time1: snap(ts.bulkyTimeLow), price1: ts.bulkyLow, time2: snap(ts.breakTime), price2: ts.bulkyLow, color: cfg.lowColor,
            width: 2, style: long ? 'dotted' : 'solid',
          });
          lines.push({
            time1: snap(ts.bulkyTimeHigh), price1: ts.bulkyHigh, time2: snap(ts.breakTime), price2: ts.bulkyHigh, color: cfg.highColor,
            width: 2, style: long ? 'solid' : 'dotted',
          });
        }
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
          const offset = atrCRT[i] / 3.0;
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

  // Backtesting dashboard, on the last bar
  if (cfg.backtestDisplayEnabled) {
    let totalProfitPercent = 0;
    let wins = 0;
    let losses = 0;
    const diffPercent = (val1: number, val2: number) => (Math.abs(val1 - val2) / val2) * 100.0;
    for (const cur of crtList) {
      if (isNaN(cur.entryPrice)) continue;
      let isSuccess = false;
      if (!isNaN(cur.exitPrice)) {
        if ((cur.entryType === 'Long' && gt(cur.exitPrice, cur.entryPrice)) || (cur.entryType === 'Short' && lt(cur.exitPrice, cur.entryPrice))) {
          totalProfitPercent += Math.abs(diffPercent(cur.entryPrice, cur.exitPrice));
          isSuccess = true;
        } else {
          totalProfitPercent -= Math.abs(diffPercent(cur.entryPrice, cur.exitPrice));
        }
      }
      if (isSuccess) wins += 1;
      else losses += 1;
    }
    const total = wins + losses;
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string) => cells.push({
      column, row, text, textColor: WHITE, bgColor: cfg.screenerColor, textSize: 'auto',
    });
    cell(0, 0, 'CRT Backtesting');
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

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: '' },
  { id: 'alert1', title: 'Sell Signal', message: '' },
  { id: 'alert2', title: 'Take-Profit Signal', message: '' },
  { id: 'alert3', title: 'Stop-Loss Signal', message: '' },
];

/** The original makes alert() calls */
export const hasAlertFunction = true;

export const CandleRangeTheoryFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
  hasAlertFunction,
};
