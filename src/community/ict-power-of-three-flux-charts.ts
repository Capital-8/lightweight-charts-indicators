/**
 * ICT Power Of Three | Flux Charts
 *
 * Finds the three phases accumulation, manipulation and distribution on the last 4,800 bars and trades the
 * distribution. One setup at a time:
 * 1. Accumulation: the range of the last N bars (highest high less lowest low; N = 40, or 11 with the other
 *    algorithm modes) is at most 5 x ATR(50) (2 x with "Short Accumulation"). The zone is that range widened by half
 *    an ATR on each side. It lasts until a bar leaves the zone (high / low, or close with "Breakout Method" Close).
 * 2. Manipulation: a later bar goes beyond the zone by more than 0.6 x ATR (1 x with the other modes). A break
 *    above is a bullish manipulation, a break below a bearish one.
 * 3. Distribution: the trade is entered at the close of that bar, against the manipulation (long after a bearish
 *    one, short after a bullish one). Targets: Dynamic = stop at ATR x the risk factor from the entry, take profit
 *    at 0.86 x the stop distance; Fixed = the two percentages. The trade ends on the first later bar that reaches a
 *    target (the stop wins when one bar reaches both). The next bar starts a new setup.
 *
 * Outputs: "TP" / "SL" markers on the exit bars; for the 76 most recent setups, the accumulation and manipulation
 * boxes, a "Buy" / "Sell" label on the entry bar and the dashed target lines with "TP" / "SL" labels (or two boxes
 * with the "Alternative" layout; an open trade ends 15 bars after the last bar); the backtesting table (entries,
 * wins, losses, win rate, average and total profit in %).
 *
 * Chart context (optional third argument):
 * - `chart.lastBarConfirmed`: the original works on closed bars only. When the last bar is still open, it is not
 *   read, and the lines, labels and boxes are those of the bar before it. Without it every bar is a closed bar.
 * - `chart.mintick`: the symbol tick of the prices in the texts of the "Alternative" layout. Without it 0.01.
 *
 * Reference: "ICT Power Of Three | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, str, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, TableData, TableCellData, TablePosition } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

export interface IctPowerOfThreeFluxChartsInputs {
  algorithmMode: 'Small Manipulation' | 'Short Accumulation' | 'Big Manipulation';
  breakoutMethod: 'Close' | 'Wick';
  showTPSL: boolean;
  /** TP / SL Layout */
  dbgTPSLVersion: 'Default' | 'Alternative';
  tpslMethod: 'Dynamic' | 'Fixed';
  riskAmount: 'Highest' | 'High' | 'Normal' | 'Low' | 'Lowest';
  tpPercent: number;
  slPercent: number;
  backtestDisplayEnabled: boolean;
  backtestingLocation: 'Top Right' | 'Right Center' | 'Top Center';
  fillBackgrounds: boolean;
  screenerColor: string;
  showZones: boolean;
  highColor: string;
  lowColor: string;
  textColor: string;
  buyAlertEnabled: boolean;
  sellAlertEnabled: boolean;
  tpAlertEnabled: boolean;
  slAlertEnabled: boolean;
}

export const defaultInputs: IctPowerOfThreeFluxChartsInputs = {
  algorithmMode: 'Small Manipulation',
  breakoutMethod: 'Wick',
  showTPSL: true,
  dbgTPSLVersion: 'Default',
  tpslMethod: 'Dynamic',
  riskAmount: 'Normal',
  tpPercent: 0.3,
  slPercent: 0.4,
  backtestDisplayEnabled: true,
  backtestingLocation: 'Top Center',
  fillBackgrounds: true,
  screenerColor: '#1B1F2B',
  showZones: true,
  highColor: '#4CAF50',
  lowColor: '#FF5252',
  textColor: '#FFFFFF',
  buyAlertEnabled: true,
  sellAlertEnabled: true,
  tpAlertEnabled: true,
  slAlertEnabled: true,
};

export const inputConfig: InputConfig[] = [
  {
    id: 'algorithmMode', type: 'string', title: 'Algorithm Mode', defval: 'Small Manipulation',
    options: ['Small Manipulation', 'Short Accumulation', 'Big Manipulation'], group: 'General Configuration',
  },
  { id: 'breakoutMethod', type: 'string', title: 'Breakout Method', defval: 'Wick', options: ['Close', 'Wick'], group: 'General Configuration' },
  { id: 'showTPSL', type: 'bool', title: 'Enabled', defval: true, group: 'TP / SL' },
  { id: 'dbgTPSLVersion', type: 'string', title: 'TP / SL Layout', defval: 'Default', options: ['Default', 'Alternative'], group: 'TP / SL' },
  { id: 'tpslMethod', type: 'string', title: 'TP / SL Method', defval: 'Dynamic', options: ['Dynamic', 'Fixed'], group: 'TP / SL' },
  {
    id: 'riskAmount', type: 'string', title: 'Risk', defval: 'Normal', options: ['Highest', 'High', 'Normal', 'Low', 'Lowest'], group: 'TP / SL',
    tooltip: 'The risk amount when Dynamic TP / SL method is selected.\n\nDifferent assets may have different volatility so changing this setting may result in change of performance of the indicator.',
  },
  { id: 'tpPercent', type: 'float', title: 'Take Profit %', defval: 0.3, group: 'TP / SL' },
  { id: 'slPercent', type: 'float', title: 'Stop Loss %', defval: 0.4, group: 'TP / SL' },
  { id: 'backtestDisplayEnabled', type: 'bool', title: 'Enabled', defval: true, group: 'Backtesting Dashboard' },
  { id: 'backtestingLocation', type: 'string', title: 'Position', defval: 'Top Center', options: ['Top Right', 'Right Center', 'Top Center'], group: 'Backtesting Dashboard' },
  { id: 'fillBackgrounds', type: 'bool', title: 'Fill Backgrounds', defval: true, group: 'Backtesting Dashboard' },
  { id: 'screenerColor', type: 'color', title: 'Background', defval: '#1B1F2B', inline: '1', group: 'Backtesting Dashboard' },
  { id: 'showZones', type: 'bool', title: 'Show Zones', defval: true, group: 'Visuals' },
  { id: 'highColor', type: 'color', title: 'Buy', defval: '#4CAF50', inline: 'colors', group: 'Visuals' },
  { id: 'lowColor', type: 'color', title: 'Sell', defval: '#FF5252', inline: 'colors', group: 'Visuals' },
  { id: 'textColor', type: 'color', title: 'Text', defval: '#FFFFFF', inline: 'colors', group: 'Visuals' },
  { id: 'buyAlertEnabled', type: 'bool', title: 'Buy Signal', defval: true, inline: 'BS', group: 'Alerts' },
  { id: 'sellAlertEnabled', type: 'bool', title: 'Sell Signal', defval: true, inline: 'BS', group: 'Alerts' },
  { id: 'tpAlertEnabled', type: 'bool', title: 'Take-Profit Signal', defval: true, inline: 'TS', group: 'Alerts' },
  { id: 'slAlertEnabled', type: 'bool', title: 'Stop-Loss Signal ', defval: true, inline: 'TS', group: 'Alerts' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Power Of Three | Flux Charts',
  shortTitle: 'Power Of Three | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const MAX_DISTANCE_TO_LAST_BAR = 4800;
const MAX_PO3 = 75;
const ATR_LEN = 50;
const ACCUMULATION_EXPAND_MULT = 0.5;
const ACCUMULATION_COLOR = '#34352780';
const MANIPULATION_COLOR = '#311c27dd';
const RR = 0.86;
/** time("", -15): an open trade is drawn up to 15 bars after the current bar */
const OPEN_TRADE_BARS = 15;
/** Colour constants of the original Pine version */
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

type State = 'Waiting For Accumulation' | 'Waiting For Accumulation End' | 'Waiting For Manipulation' | 'Waiting For Distribution'
  | 'Entry Taken' | 'Take Profit' | 'Stop Loss' | 'Done';

/** type PO3: an na number or time is NaN; indexes are bar indexes */
interface PO3 {
  state: State;
  startTime: number;
  accumulationTop: number;
  accumulationBottom: number;
  accumulationEndTop: number;
  accumulationEndBottom: number;
  accumulationStartIndex: number;
  accumulationEndIndex: number;
  manipulationTop: number;
  manipulationBottom: number;
  manipulationStartIndex: number;
  manipulationEndIndex: number;
  manipulationDirection: 'Bullish' | 'Bearish' | null;
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
  inputs: Partial<IctPowerOfThreeFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const markers: MarkerData[] = [];
  const lines: LineDrawingData[] = [];
  const boxes: BoxData[] = [];
  const labels: LabelData[] = [];
  const tables: TableData[] = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines,
    boxes,
    labels,
    tables,
  });
  if (n === 0) return result();

  // syminfo.mintick (format.mintick in the texts)
  const MINTICK = mintickOf(chart);
  const small = cfg.algorithmMode === 'Small Manipulation';
  const accumulationLength = small ? 40 : 11;
  const accumulationATRMult = cfg.algorithmMode === 'Short Accumulation' ? 2 : 5;
  const manipulationATRMult = small ? 0.6 : 1;
  const closeBreak = cfg.breakoutMethod === 'Close';
  const fixed = cfg.tpslMethod === 'Fixed';
  const { tpPercent, slPercent } = cfg;
  const slATRMult = cfg.riskAmount === 'Highest' ? 9.5 : cfg.riskAmount === 'High' ? 6 : cfg.riskAmount === 'Normal' ? 5
    : cfg.riskAmount === 'Low' ? 4 : cfg.riskAmount === 'Lowest' ? 1.5 : 6.5;

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const atr = arr(ta.atr(bars, ATR_LEN));
  const highestAccumulation = arr(ta.highest(new Series(bars, (b) => b.high), accumulationLength));
  const lowestAccumulation = arr(ta.lowest(new Series(bars, (b) => b.low), accumulationLength));

  const po3List: PO3[] = [];
  let lastPO3: PO3 | null = null;
  // The original reads and draws closed bars only (barstate.isconfirmed)
  const lastConfirmed = lastBarConfirmedOf(chart);
  const drawBar = lastConfirmed ? last : last - 1;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    const confirmed = i < last || lastConfirmed;
    const lowBreakout = closeBreak ? b.close : b.low;
    const highBreakout = closeBreak ? b.close : b.high;

    if (i > last - MAX_DISTANCE_TO_LAST_BAR && confirmed) {
      // A new setup when no trade is open
      if (lastPO3 === null || !isNaN(lastPO3.exitPrice)) {
        lastPO3 = {
          state: 'Waiting For Accumulation', startTime: time, accumulationTop: NaN, accumulationBottom: NaN, accumulationEndTop: NaN,
          accumulationEndBottom: NaN, accumulationStartIndex: NaN, accumulationEndIndex: NaN, manipulationTop: NaN,
          manipulationBottom: NaN, manipulationStartIndex: NaN, manipulationEndIndex: NaN, manipulationDirection: null,
          slTarget: NaN, tpTarget: NaN, entryType: null, entryTime: NaN, exitTime: NaN, entryPrice: NaN, exitPrice: NaN,
        };
        po3List.unshift(lastPO3);
      }
      const po3: PO3 = lastPO3;

      // Find the accumulation
      if (po3.state === 'Waiting For Accumulation') {
        if (le(highestAccumulation[i] - lowestAccumulation[i], atr[i] * accumulationATRMult)) {
          po3.state = 'Waiting For Accumulation End';
          po3.accumulationStartIndex = i - accumulationLength;
          po3.accumulationEndIndex = i;
          po3.accumulationTop = highestAccumulation[i] + atr[i] * ACCUMULATION_EXPAND_MULT;
          po3.accumulationBottom = lowestAccumulation[i] - atr[i] * ACCUMULATION_EXPAND_MULT;
        }
      }
      if (po3.state === 'Waiting For Accumulation End') {
        if (gt(highBreakout, po3.accumulationTop) || lt(lowBreakout, po3.accumulationBottom)) {
          po3.state = 'Waiting For Manipulation';
          po3.accumulationEndTop = highBreakout;
          po3.accumulationEndBottom = lowBreakout;
        } else {
          po3.accumulationEndIndex = i;
        }
      }

      // Find the manipulation
      if (po3.state === 'Waiting For Manipulation') {
        if (i > po3.accumulationEndIndex) {
          if (gt(highBreakout, po3.accumulationTop + atr[i] * manipulationATRMult)) {
            po3.state = 'Waiting For Distribution';
            po3.manipulationDirection = 'Bullish';
            po3.manipulationStartIndex = po3.accumulationEndIndex;
            po3.manipulationEndIndex = i;
            po3.manipulationTop = highBreakout;
            po3.manipulationBottom = po3.accumulationEndBottom;
          } else if (lt(lowBreakout, po3.accumulationBottom - atr[i] * manipulationATRMult)) {
            po3.state = 'Waiting For Distribution';
            po3.manipulationDirection = 'Bearish';
            po3.manipulationStartIndex = po3.accumulationEndIndex;
            po3.manipulationEndIndex = i;
            po3.manipulationTop = po3.accumulationEndTop;
            po3.manipulationBottom = lowBreakout;
          }
        }
      }

      // Distribution: the entry
      if (po3.state === 'Waiting For Distribution') {
        po3.state = 'Entry Taken';
        po3.entryTime = time;
        po3.entryPrice = b.close;
        if (po3.manipulationDirection === 'Bearish') {
          po3.entryType = 'Long';
          if (fixed) {
            po3.slTarget = po3.entryPrice * (1 - slPercent / 100.0);
            po3.tpTarget = po3.entryPrice * (1 + tpPercent / 100.0);
          } else {
            po3.slTarget = po3.entryPrice - atr[i] * slATRMult;
            po3.tpTarget = po3.entryPrice + Math.abs(po3.entryPrice - po3.slTarget) * RR;
          }
        } else {
          po3.entryType = 'Short';
          if (fixed) {
            po3.slTarget = po3.entryPrice * (1 + slPercent / 100.0);
            po3.tpTarget = po3.entryPrice * (1 - tpPercent / 100.0);
          } else {
            po3.slTarget = po3.entryPrice + atr[i] * slATRMult;
            po3.tpTarget = po3.entryPrice - Math.abs(po3.entryPrice - po3.slTarget) * RR;
          }
        }
      }

      // Exits: the four tests run one after the other (a stop on the same bar replaces a take profit)
      if (po3.state === 'Entry Taken' && time > po3.entryTime) {
        const long = po3.entryType === 'Long';
        const short = po3.entryType === 'Short';
        const exit = (price: number, state: State) => {
          po3.exitPrice = price;
          po3.exitTime = time;
          po3.state = state;
        };
        if (fixed) {
          if (long && ge((b.high / po3.entryPrice - 1) * 100, tpPercent)) exit(po3.entryPrice * (1 + tpPercent / 100.0), 'Take Profit');
          if (short && le((b.low / po3.entryPrice - 1) * 100, -tpPercent)) exit(po3.entryPrice * (1 - tpPercent / 100.0), 'Take Profit');
          if (long && le((b.low / po3.entryPrice - 1) * 100, -slPercent)) exit(po3.entryPrice * (1 - slPercent / 100.0), 'Stop Loss');
          if (short && ge((b.high / po3.entryPrice - 1) * 100, slPercent)) exit(po3.entryPrice * (1 + slPercent / 100.0), 'Stop Loss');
        } else {
          if (long && ge(b.high, po3.tpTarget)) exit(po3.tpTarget, 'Take Profit');
          if (short && le(b.low, po3.tpTarget)) exit(po3.tpTarget, 'Take Profit');
          if (long && le(b.low, po3.slTarget)) exit(po3.slTarget, 'Stop Loss');
          if (short && ge(b.high, po3.slTarget)) exit(po3.slTarget, 'Stop Loss');
        }
      }
    }

    // Exit markers
    if (lastPO3 !== null) {
      const po3: PO3 = lastPO3;
      const mark = (shape: 'circle' | 'xcross', above: boolean, col: string, text: string) => markers.push({
        time, position: above ? 'aboveBar' : 'belowBar', shape, color: col, text, textColor: cfg.textColor, size: 'tiny',
      });
      if (po3.state === 'Stop Loss' && time >= po3.exitTime) {
        mark('circle', po3.entryType !== 'Long', RED, 'SL');
        po3.state = 'Done';
      }
      if (po3.state === 'Take Profit') {
        mark('xcross', po3.entryType === 'Long', BLUE, 'TP');
        po3.state = 'Done';
      }
    }

    // Drawings: every closed bar deletes them and draws the 76 most recent setups again
    if (i === drawBar) {
      const interval = barInterval(bars);
      const T = (index: number) => barTime(bars, index, interval);
      const lblSize = 'normal';
      const offset = atr[i] / 3.0;
      const endOpen = T(i + OPEN_TRADE_BARS);
      const half = (c: string) => String(color.new(c, 50));
      const textBox = (x1: number, y: number, x2: number, text: string, bg: string): BoxData => ({
        time1: x1, price1: y + offset, time2: x2, price2: y - offset, text, textColor: cfg.textColor, borderWidth: 0,
        bgColor: half(bg), textSize: 'small',
      });
      const dashed = (x1: number, y1: number, x2: number, y2: number, col: string): LineDrawingData => ({
        time1: x1, price1: y1, time2: x2, price2: y2, color: col, style: 'dashed',
      });
      for (let k = 0; k <= Math.min(MAX_PO3, po3List.length - 1); k++) {
        const cur = po3List[k];
        if (cfg.showZones) {
          // Accumulation box
          if (!isNaN(cur.accumulationEndIndex) && i - cur.accumulationStartIndex < MAX_DISTANCE_TO_LAST_BAR) {
            boxes.push({
              time1: T(cur.accumulationStartIndex), price1: cur.accumulationTop, time2: T(cur.accumulationEndIndex),
              price2: cur.accumulationBottom, bgColor: ACCUMULATION_COLOR, borderWidth: 0,
            });
          }
          // Manipulation box
          if (!isNaN(cur.manipulationEndIndex) && i - cur.manipulationStartIndex < MAX_DISTANCE_TO_LAST_BAR) {
            boxes.push({
              time1: T(cur.manipulationStartIndex), price1: cur.manipulationTop, time2: T(cur.manipulationEndIndex),
              price2: cur.manipulationBottom, bgColor: MANIPULATION_COLOR, borderWidth: 0,
            });
          }
        }
        if (isNaN(cur.entryTime)) continue;
        // Entry label
        labels.push(cur.entryType === 'Long'
          ? { time: cur.entryTime, price: b.close, text: 'Buy', yloc: 'belowbar', textColor: cfg.textColor, color: cfg.highColor, style: 'label_up', size: lblSize }
          : { time: cur.entryTime, price: b.close, text: 'Sell', yloc: 'abovebar', textColor: cfg.textColor, color: cfg.lowColor, style: 'label_down', size: lblSize });
        // Take profit and stop loss
        if (!cfg.showTPSL) continue;
        const endTime = isNaN(cur.exitTime) ? endOpen : cur.exitTime;
        if (cfg.dbgTPSLVersion === 'Alternative') {
          boxes.push(textBox(cur.entryTime, cur.tpTarget, endTime, `TAKE PROFIT (${str.tostring(cur.tpTarget, 'mintick', MINTICK)})`, cfg.highColor));
          boxes.push(textBox(cur.entryTime, cur.slTarget, endTime, `STOP LOSS (${str.tostring(cur.slTarget, 'mintick', MINTICK)})`, cfg.lowColor));
        } else if (cfg.dbgTPSLVersion === 'Default') {
          lines.push(dashed(cur.entryTime, cur.entryPrice, cur.entryTime, cur.tpTarget, cfg.highColor));
          lines.push(dashed(cur.entryTime, cur.tpTarget, endTime, cur.tpTarget, cfg.highColor));
          labels.push({ time: endTime, price: cur.tpTarget, text: 'TP', textColor: cfg.textColor, color: half(cfg.highColor), style: 'label_left', size: lblSize });
          lines.push(dashed(cur.entryTime, cur.entryPrice, cur.entryTime, cur.slTarget, cfg.lowColor));
          lines.push(dashed(cur.entryTime, cur.slTarget, endTime, cur.slTarget, cfg.lowColor));
          labels.push({ time: endTime, price: cur.slTarget, text: 'SL', textColor: cfg.textColor, color: half(cfg.lowColor), style: 'label_left', size: lblSize });
        }
      }
    }
  }

  // Backtesting dashboard, on the last bar
  if (cfg.backtestDisplayEnabled) {
    let totalProfitPercent = 0;
    let wins = 0;
    let losses = 0;
    const diffPercent = (val1: number, val2: number) => (Math.abs(val1 - val2) / val2) * 100.0;
    for (const cur of po3List) {
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
    cell(0, 0, 'PO3 Backtesting');
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

export const IctPowerOfThreeFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
