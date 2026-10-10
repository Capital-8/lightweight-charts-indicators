/**
 * ICT Turtle Soup | Flux Charts
 *
 * Trades false breaks of the range of the higher timeframe, on the last 4,900 bars. The range is the highest high
 * and the lowest low of the last N chart bars (N = higher timeframe / chart timeframe). One setup at a time:
 * 1. The setup stores the range of its first bar. A later bar that goes below the range low (low, or close with
 *    "Breakout Method" Close) is a sell-side liquidity grab and prepares a long; a bar above the range high is a
 *    buy-side grab and prepares a short ("Entry Method" Adaptive can reverse the side: it follows the side whose
 *    trades won more often).
 * 2. Entry on a later bar that breaks the market structure the other way: for a long, the high (or close) goes above
 *    the highest high of the "MSS Swing Length" bars before it; for a short, below the lowest low.
 * 3. Targets: Dynamic = stop at the swing low / high less / plus ATR(5) x the risk factor, take profit at 0.9 x the
 *    stop distance; Fixed = the two percentages. The trade ends on the first bar that reaches a target (the stop
 *    wins when one bar reaches both). The next bar starts a new setup.
 *
 * Outputs: "TP" / "SL" markers on the exit bars; for the 126 most recent setups, a circle on the grab bar, a "Buy" /
 * "Sell" label on the entry bar, the dashed target lines with "TP" / "SL" labels (or two boxes with the
 * "Alternative" layout; an open trade ends 15 bars after the last bar), and with "Show Liquidity Zones" a box on
 * the broken range; the backtesting table (entries, wins, losses, win rate, average and total profit in %).
 *
 * The original throws when the higher timeframe is not above the chart timeframe: the port throws the same error.
 * The chart timeframe is taken from the most frequent gap between two bars. The original redraws on closed bars
 * only: every bar of the port is a closed bar. Prices in the texts of the "Alternative" layout use a tick of 0.01
 * (the original uses the tick of the symbol).
 *
 * Reference: "ICT Turtle Soup | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, str, color, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, MarkerData, TableData, TableCellData, TablePosition } from '../types';
import { barTime } from '../bar-time';
import { chartTimeframe } from '../anchor-period';

export interface IctTurtleSoupFluxChartsInputs {
  mssOffset: number;
  higherTimeframe: string;
  breakoutMethod: 'Close' | 'Wick';
  entryMethod: 'Classic' | 'Adaptive';
  /** TP / SL Layout */
  dbgTPSLVersion: 'Default' | 'Alternative';
  /** Show Liquidity Zones */
  showHL: boolean;
  showLiqGrabs: boolean;
  showTPSL: boolean;
  tpslMethod: 'Dynamic' | 'Fixed';
  riskAmount: 'Highest' | 'High' | 'Normal' | 'Low' | 'Lowest';
  tpPercent: number;
  slPercent: number;
  backtestDisplayEnabled: boolean;
  backtestingLocation: 'Top Right' | 'Right Center' | 'Top Center';
  fillBackgrounds: boolean;
  screenerColor: string;
  highColor: string;
  lowColor: string;
  textColor: string;
  buyAlertEnabled: boolean;
  sellAlertEnabled: boolean;
  tpAlertEnabled: boolean;
  slAlertEnabled: boolean;
}

export const defaultInputs: IctTurtleSoupFluxChartsInputs = {
  mssOffset: 10,
  higherTimeframe: '60',
  breakoutMethod: 'Wick',
  entryMethod: 'Classic',
  dbgTPSLVersion: 'Default',
  showHL: false,
  showLiqGrabs: true,
  showTPSL: true,
  tpslMethod: 'Dynamic',
  riskAmount: 'Low',
  tpPercent: 0.3,
  slPercent: 0.4,
  backtestDisplayEnabled: true,
  backtestingLocation: 'Top Center',
  fillBackgrounds: true,
  screenerColor: '#1B1F2B',
  highColor: '#4CAF50',
  lowColor: '#FF5252',
  textColor: '#FFFFFF',
  buyAlertEnabled: true,
  sellAlertEnabled: true,
  tpAlertEnabled: true,
  slAlertEnabled: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'mssOffset', type: 'int', title: 'MSS Swing Length', defval: 10, group: 'General Configuration' },
  { id: 'higherTimeframe', type: 'timeframe', title: 'Higher Timeframe', defval: '60', group: 'General Configuration' },
  { id: 'breakoutMethod', type: 'string', title: 'Breakout Method', defval: 'Wick', options: ['Close', 'Wick'], group: 'General Configuration' },
  {
    id: 'entryMethod', type: 'string', title: 'Entry Method', defval: 'Classic', options: ['Classic', 'Adaptive'], group: 'General Configuration',
    tooltip: 'The entry method for the indicator to use. Try changing this setting if you are getting poor results.',
  },
  { id: 'dbgTPSLVersion', type: 'string', title: 'TP / SL Layout', defval: 'Default', options: ['Default', 'Alternative'], group: 'General Configuration' },
  { id: 'showHL', type: 'bool', title: 'Show Liquidity Zones', defval: false, inline: '3', group: 'General Configuration' },
  { id: 'showLiqGrabs', type: 'bool', title: 'Liq Grabs', defval: true, inline: '3', group: 'General Configuration' },
  { id: 'showTPSL', type: 'bool', title: 'TP / SL', defval: true, inline: '3', group: 'General Configuration' },
  { id: 'tpslMethod', type: 'string', title: 'TP / SL Method', defval: 'Dynamic', options: ['Dynamic', 'Fixed'], group: 'TP / SL' },
  {
    id: 'riskAmount', type: 'string', title: 'Risk', defval: 'Low', options: ['Highest', 'High', 'Normal', 'Low', 'Lowest'], group: 'TP / SL',
    tooltip: 'The risk amount when Dynamic TP / SL method is selected.\n\nDifferent assets may have different volatility so changing this setting may result in change of performance of the indicator.',
  },
  { id: 'tpPercent', type: 'float', title: 'Take Profit %', defval: 0.3, group: 'TP / SL' },
  { id: 'slPercent', type: 'float', title: 'Stop Loss %', defval: 0.4, group: 'TP / SL' },
  { id: 'backtestDisplayEnabled', type: 'bool', title: 'Enabled', defval: true, group: 'Backtesting Dashboard' },
  { id: 'backtestingLocation', type: 'string', title: 'Position', defval: 'Top Center', options: ['Top Right', 'Right Center', 'Top Center'], group: 'Backtesting Dashboard' },
  { id: 'fillBackgrounds', type: 'bool', title: 'Fill Backgrounds', defval: true, group: 'Backtesting Dashboard' },
  { id: 'screenerColor', type: 'color', title: 'Background', defval: '#1B1F2B', inline: '1', group: 'Backtesting Dashboard' },
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
  title: 'ICT Turtle Soup | Flux Charts',
  shortTitle: 'Turtle Soup | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const MAX_DISTANCE_TO_LAST_BAR = 4900;
const ATR_LEN = 5;
const RR = 0.9;
const MAX_SHOWN = 125;
/** time("", -15): an open trade is drawn up to 15 bars after the current bar */
const OPEN_TRADE_BARS = 15;
/** Price tick of the texts (the original uses the tick of the symbol) */
const MINTICK = 0.01;
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
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

type State = 'Waiting For Liquidity Break' | 'Waiting For Execution' | 'Entry Taken' | 'Take Profit' | 'Stop Loss' | 'Done';

/** type Sweep: times are bar times */
interface Sweep {
  startTime: number;
  endTime: number;
  price: number;
}

/** type TurtleSoup: an na number is NaN, an na time is NaN */
interface TurtleSoup {
  state: State;
  startTime: number;
  lastHour: number;
  lastHourHigh: number;
  lastHourLow: number;
  brokenSweep: Sweep | null;
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
  inputs: Partial<IctTurtleSoupFluxChartsInputs> = {},
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

  const chartSeconds = timeframe.in_seconds(chartTimeframe(bars));
  const htfSeconds = timeframe.in_seconds(cfg.higherTimeframe);
  if (htfSeconds <= chartSeconds) throw new Error('Higher timeframe must be higher than current timeframe.');
  const barLength = Math.trunc(htfSeconds / 60 / (chartSeconds / 60));
  const mssOffset = Math.trunc(cfg.mssOffset);
  const closeBreak = cfg.breakoutMethod === 'Close';
  const classic = cfg.entryMethod === 'Classic';
  const fixed = cfg.tpslMethod === 'Fixed';
  const slATRMult = cfg.riskAmount === 'Highest' ? 10 : cfg.riskAmount === 'High' ? 6.5 : cfg.riskAmount === 'Normal' ? 5.5
    : cfg.riskAmount === 'Low' ? 3.5 : cfg.riskAmount === 'Lowest' ? 1.15 : 6.5;

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const highS = new Series(bars, (b) => b.high);
  const lowS = new Series(bars, (b) => b.low);
  const atr = arr(ta.atr(bars, ATR_LEN));
  const high12 = arr(ta.highest(highS, barLength));
  const low12 = arr(ta.lowest(lowS, barLength));
  const highMSS = arr(ta.highest(highS, mssOffset));
  const lowMSS = arr(ta.lowest(lowS, mssOffset));

  const tsList: TurtleSoup[] = [];
  let lastTS: TurtleSoup | null = null;
  let highBreaks = 0;
  let lowBreaks = 0;
  // The original draws on closed bars: the drawings are those of the last bar
  const drawBar = last;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    if (i > last - MAX_DISTANCE_TO_LAST_BAR) {
      // A new setup when no trade is open
      if (lastTS === null || !isNaN(lastTS.exitPrice)) {
        lastTS = {
          state: 'Waiting For Liquidity Break', startTime: time, lastHour: i >= barLength ? bars[i - barLength].time : NaN,
          lastHourHigh: high12[i], lastHourLow: low12[i], brokenSweep: null, slTarget: NaN, tpTarget: NaN, entryType: null,
          entryTime: NaN, exitTime: NaN, entryPrice: NaN, exitPrice: NaN,
        };
        tsList.unshift(lastTS);
      }
      const ts: TurtleSoup = lastTS;

      // Liquidity grabs
      if (ts.state === 'Waiting For Liquidity Break' && time > ts.startTime) {
        if (lt(closeBreak ? b.close : b.low, ts.lastHourLow)) {
          ts.brokenSweep = { startTime: ts.lastHour, endTime: time, price: ts.lastHourLow };
          ts.entryType = classic || highBreaks > lowBreaks ? 'Long' : 'Short';
          ts.state = 'Waiting For Execution';
        } else if (gt(closeBreak ? b.close : b.high, ts.lastHourHigh)) {
          ts.brokenSweep = { startTime: ts.lastHour, endTime: time, price: ts.lastHourHigh };
          ts.entryType = classic || highBreaks <= lowBreaks ? 'Short' : 'Long';
          ts.state = 'Waiting For Execution';
        }
      }

      // Entry on a market structure shift
      if (ts.state === 'Waiting For Execution' && ts.brokenSweep !== null && time > ts.brokenSweep.endTime) {
        const prevLow = i > 0 ? lowMSS[i - 1] : NaN;
        const prevHigh = i > 0 ? highMSS[i - 1] : NaN;
        if (ts.entryType === 'Short') {
          if (lt(closeBreak ? b.close : b.low, prevLow)) {
            ts.state = 'Entry Taken';
            ts.entryTime = time;
            ts.entryPrice = closeBreak ? b.close : prevLow;
            if (fixed) {
              ts.slTarget = ts.entryPrice * (1 + cfg.slPercent / 100.0);
              ts.tpTarget = ts.entryPrice * (1 - cfg.tpPercent / 100.0);
            } else {
              ts.slTarget = highMSS[i] + atr[i] * slATRMult;
              ts.tpTarget = ts.entryPrice - Math.abs(ts.entryPrice - ts.slTarget) * RR;
            }
          }
        } else if (gt(closeBreak ? b.close : b.high, prevHigh)) {
          ts.state = 'Entry Taken';
          ts.entryTime = time;
          ts.entryPrice = closeBreak ? b.close : prevHigh;
          if (fixed) {
            ts.slTarget = ts.entryPrice * (1 - cfg.slPercent / 100.0);
            ts.tpTarget = ts.entryPrice * (1 + cfg.tpPercent / 100.0);
          } else {
            ts.slTarget = lowMSS[i] - atr[i] * slATRMult;
            ts.tpTarget = ts.entryPrice + Math.abs(ts.entryPrice - ts.slTarget) * RR;
          }
        }
      }

      // Exits: the four tests run one after the other (a stop on the same bar replaces a take profit)
      if (ts.state === 'Entry Taken') {
        const long = ts.entryType === 'Long';
        const exit = (price: number, state: State) => {
          ts.exitPrice = price;
          ts.exitTime = time;
          ts.state = state;
        };
        if (fixed) {
          if (long && ge((b.high / ts.entryPrice - 1) * 100, cfg.tpPercent)) {
            exit(ts.entryPrice * (1 + cfg.tpPercent / 100.0), 'Take Profit');
            highBreaks += 1;
          }
          if (!long && le((b.low / ts.entryPrice - 1) * 100, -cfg.tpPercent)) {
            exit(ts.entryPrice * (1 - cfg.tpPercent / 100.0), 'Take Profit');
            lowBreaks += 1;
          }
          if (long && le((b.low / ts.entryPrice - 1) * 100, -cfg.slPercent)) {
            exit(ts.entryPrice * (1 - cfg.slPercent / 100.0), 'Stop Loss');
            highBreaks -= 1;
          }
          if (!long && ge((b.high / ts.entryPrice - 1) * 100, cfg.slPercent)) {
            exit(ts.entryPrice * (1 + cfg.slPercent / 100.0), 'Stop Loss');
            lowBreaks -= 1;
          }
        } else {
          if (long && ge(b.high, ts.tpTarget)) {
            const hi = Math.max(ts.lastHourHigh, ts.tpTarget);
            exit(ge(b.high, hi) ? hi : Math.min(ts.lastHourHigh, ts.tpTarget), 'Take Profit');
            highBreaks += 1;
          }
          if (!long && le(b.low, ts.tpTarget)) {
            const lo = Math.min(ts.lastHourLow, ts.tpTarget);
            exit(le(b.low, lo) ? lo : Math.max(ts.lastHourLow, ts.tpTarget), 'Take Profit');
            lowBreaks += 1;
          }
          if (long && le(b.low, ts.slTarget)) {
            exit(ts.slTarget, 'Stop Loss');
            highBreaks -= 1;
          }
          if (!long && ge(b.high, ts.slTarget)) {
            exit(ts.slTarget, 'Stop Loss');
            lowBreaks -= 1;
          }
        }
      }
    }

    // Exit markers
    if (lastTS !== null) {
      const ts: TurtleSoup = lastTS;
      const mark = (shape: 'circle' | 'xcross', above: boolean, col: string, text: string) => markers.push({
        time, position: above ? 'aboveBar' : 'belowBar', shape, color: col, text, textColor: cfg.textColor, size: 'tiny',
      });
      if (ts.state === 'Stop Loss' && time >= ts.exitTime) {
        mark('circle', ts.entryType !== 'Long', RED, 'SL');
        ts.state = 'Done';
      }
      if (ts.state === 'Take Profit') {
        mark('xcross', ts.entryType === 'Long', BLUE, 'TP');
        ts.state = 'Done';
      }
    }

    // Drawings: every closed bar deletes them and draws the 126 most recent setups again
    if (i === drawBar) {
      const lblSize = 'normal';
      const offset = atr[i] / 3.0;
      const endOpen = barTime(bars, i + OPEN_TRADE_BARS);
      const half = (c: string) => String(color.new(c, 50));
      const textBox = (x1: number, y: number, x2: number, text: string, bg: string): BoxData => ({
        time1: x1, price1: y + offset, time2: x2, price2: y - offset, text, textColor: cfg.textColor, borderWidth: 0,
        bgColor: half(bg), textSize: 'small',
      });
      const dashed = (x1: number, y1: number, x2: number, y2: number, col: string): LineDrawingData => ({
        time1: x1, price1: y1, time2: x2, price2: y2, color: col, style: 'dashed',
      });
      const drawn = (...v: number[]) => v.every((x) => !isNaN(x));
      for (let k = 0; k <= Math.min(MAX_SHOWN, tsList.length - 1); k++) {
        const cur = tsList[k];
        const sweep = cur.brokenSweep;
        if (sweep !== null) {
          const buyside = eq(sweep.price, cur.lastHourHigh);
          // Target liquidity (a box with an na time is not drawn)
          if (cfg.showHL && drawn(sweep.startTime)) {
            const level = buyside ? cur.lastHourHigh : cur.lastHourLow;
            boxes.push(textBox(sweep.startTime, level, sweep.endTime, `TARGET LIQUIDITY (${cfg.higherTimeframe})`, buyside ? cfg.highColor : cfg.lowColor));
          }
          // Liquidity grab
          if (cfg.showLiqGrabs) {
            labels.push(buyside
              ? { time: sweep.endTime, price: b.high, text: '', yloc: 'abovebar', style: 'circle', size: 'tiny', color: half(cfg.lowColor), textColor: BLACK }
              : { time: sweep.endTime, price: b.low, text: '', yloc: 'belowbar', style: 'circle', size: 'tiny', color: half(cfg.highColor), textColor: BLACK });
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
    for (const cur of tsList) {
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
    cell(0, 0, 'TS Backtesting');
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

export const IctTurtleSoupFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
