/**
 * Smart Money Breakouts [ChartPrime]
 *
 * Swing highs and swing lows are pivots with "Length" bars on each side (a pivot with the same price as the pivot
 * before of its side is not taken, and neither is the first pivot of each side). The first high (or close, "Type")
 * above the latest swing high is a bullish break; the first low below the latest swing low is a bearish break.
 * While no trade is open, a break draws a line from the swing bar to the break bar with a text at its middle ("BOS",
 * or "CHoCH" when the break before was of the other side) and a small label below / above the bar. Under the text
 * a circle tells which side had more than 55 % of the volume of the bars since the swing (green, red, else yellow).
 *
 * A break opens a trade: the stop is 1.5 x ATR(14) beyond the low (long) or the high (short), the target is "RR
 * Ratio" times the distance from the close to the stop. A dashed line shows the target (and the stop, "Show SL")
 * until the trade ends: the "Target" label turns green when the target is reached, red when the stop is hit (by
 * the close or by the high / low, "SL Type"). Bars, candles and the background are coloured while a trade is open.
 * The table counts the winning and losing trades.
 * Alerts (alertcondition, `alerts` of the result): 'BUY' / 'Sell' on the bars of a bullish / bearish break that opens
 * a trade.
 *
 * At most 500 lines and 500 labels are kept (the oldest are removed first).
 * The tooltip of a stopped trade shows the stop rounded to the price tick.
 *
 * Chart values (third argument): the port reads the symbol tick for that tooltip (without it: 0.01).
 *
 * Reference: "Smart Money Breakouts [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { ta, math, str, array, color, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData, LabelData, LineDrawingData, PlotCandleData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SmartMoneyBreakoutsInputs {
  /** Swing length: bars on each side of a pivot */
  period: number;
  /** Price that breaks a swing: wicks (high / low) or body (close) */
  candleType: 'Wicks' | 'Body';
  /** Risk to reward ratio */
  rr1: number;
  /** Stop on the close or on the high / low */
  slType: 'Close' | 'High/Low';
  showSL: boolean;
  linestyle: 'Solid' | 'Dashed' | 'Dotted';
  bull: string;
  bear: string;
}

export const defaultInputs: SmartMoneyBreakoutsInputs = {
  period: 20,
  candleType: 'Wicks',
  rr1: 1.1,
  slType: 'Close',
  showSL: false,
  linestyle: 'Dashed',
  bull: '#028545',
  bear: '#F60707',
};

const CORE = '➞ Core Settings 🔸';

export const inputConfig: InputConfig[] = [
  { id: 'period', type: 'int', title: 'Length', defval: 20, group: CORE },
  { id: 'candleType', type: 'string', title: 'Type ➞', defval: 'Wicks', options: ['Wicks', 'Body'], group: CORE },
  { id: 'rr1', type: 'float', title: 'RR Ratio', defval: 1.1, step: 0.1, group: CORE },
  { id: 'slType', type: 'string', title: 'SL Type', defval: 'Close', options: ['Close', 'High/Low'], group: CORE },
  { id: 'showSL', type: 'bool', title: 'Show SL', defval: false, group: CORE },
  { id: 'linestyle', type: 'string', title: 'Line Style', defval: 'Dashed', options: ['Solid', 'Dashed', 'Dotted'], group: CORE, inline: 'Line' },
  { id: 'bull', type: 'color', title: '', defval: '#028545', group: CORE, inline: 'Line' },
  { id: 'bear', type: 'color', title: '', defval: '#F60707', group: CORE, inline: 'Line' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Money Breakouts [ChartPrime]',
  shortTitle: 'Smart Money Breakouts [ChartPrime]',
  overlay: true,
};

const GREEN = '#028545';
const TAIL = '#148D9A';
const RED = '#F60707';
const GREEN_2 = '#026A59';
/** color.rgb(52, 52, 54) */
const IDLE = '#343436';
/** color.rgb(103, 99, 99) */
const WICK = '#676363';
/** color.lime */
const LIME = '#00E676';
/** color.new(color.red, 100) */
const OFF = String(color.new('#FF5252', 100));
/** indicator(max_labels_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  width: number;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor?: string;
  style: 'label_down' | 'label_up' | 'label_left';
  size: 'tiny' | 'small';
  yloc?: 'abovebar' | 'belowbar';
  tooltip?: string;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyBreakoutsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines' | 'tables' | 'barColors' | 'bgColors' | 'plotCandles'> & {
  labels: LabelData[];
  lines: LineDrawingData[];
  tables: TableData[];
  barColors: BarColorData[];
  bgColors: BgColorData[];
  plotCandles: Record<string, PlotCandleData[]>;
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  // syminfo.mintick
  const mintick = mintickOf(chart);
  const period = Math.trunc(cfg.period);
  const wicks = cfg.candleType === 'Wicks';
  const slOnClose = cfg.slType === 'Close';
  const styleSwitch = cfg.linestyle === 'Dashed' ? 'dashed' : cfg.linestyle === 'Dotted' ? 'dotted' : 'solid';

  // Stop distance: 1.5 x ATR(14)
  const atr = ta.rma(ta.tr(bars, true), 14).toArray();
  const PH = ta.pivothigh(new Series(bars, (b) => b.high), period, period).toArray();
  const PL = ta.pivotlow(new Series(bars, (b) => b.low), period, period).toArray();

  // Live drawings in creation order. Limit: when a creation brings the count above max + 5, the oldest are deleted
  // until max remain; an object held by a `var` variable (the target line, the stop line and the target label of
  // the latest trade) is never deleted by the limit, but it counts.
  const held = new Set<object>();
  const lines: Ln[] = [];
  const labels: Lb[] = [];
  const add = <T extends object>(list: T[], o: T): T => {
    list.push(o);
    if (list.length > MAX_OBJECTS + 5) {
      for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
        if (held.has(list[k])) k++;
        else list.splice(k, 1);
      }
    }
    return o;
  };
  const hold = <T extends object>(before: T | null, now: T): T => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };

  const score = [0, 0];
  let updatedHigh = NaN;
  let updatedLow = NaN;
  let shortTrade = false;
  let tradeIsOn = false;
  let longTrade = false;
  let highIndex = NaN;
  let lowIndex = NaN;
  let phActive = false;
  let plActive = false;
  let hBreak = false;
  let tpLine: Ln | null = null;
  let slLine: Ln | null = null;
  let lab: Lb | null = null;
  let TP = 0;
  let SL = 0;
  let fixPH = NaN;
  let fixPL = NaN;

  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const candles: PlotCandleData[] = [];
  const bgBear = String(color.rgb(136, 4, 15, 90));
  const bgBull = String(color.rgb(8, 191, 158, 90));
  const longFlags: boolean[] = [];
  const shortFlags: boolean[] = [];

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    let BUY = false;
    let SELL = false;
    // Vol.new(): the four arrays of the bar (shared by the two calls of VolCal on a bar with both breaks)
    const volume = { total: [] as number[], green: [] as number[], red: [] as number[], scr: [] as number[] };
    const volCal = (index: number): string => {
      const count = Math.abs(index - i);
      for (let k = 0; k <= count - 1; k++) volume.scr.push(i - k >= 0 ? bars[i - k].close : NaN);
      for (let k = 0; k <= volume.scr.length - 1; k++) {
        const b = i - k >= 0 ? bars[i - k] : null;
        const open = b ? b.open : NaN;
        const vol = b ? (b.volume ?? NaN) : NaN;
        if (gt(volume.scr[k], open)) volume.green.push(vol);
        if (lt(volume.scr[k], open)) volume.red.push(vol);
        volume.total.push(vol);
      }
      const greenRatio = math.round((array.sum(volume.green) / array.sum(volume.total)) * 100, 2);
      const redRatio = math.round((array.sum(volume.red) / array.sum(volume.total)) * 100, 2);
      return gt(greenRatio, 55) ? '🟢' : gt(redRatio, 55) ? '🔴' : '🟡';
    };

    const x2 = bar.low - (atr[i] ?? NaN) * 1.5;
    const xz = (atr[i] ?? NaN) * 1.5 + bar.high;
    const longDiffSL2 = Math.abs(bar.close - xz);
    const longDiffSL = Math.abs(bar.close - x2);

    const ph = PH[i] ?? NaN;
    const pl = PL[i] ?? NaN;
    const scrHigh = wicks ? bar.high : bar.close;
    const scrLow = wicks ? bar.low : bar.close;

    // ta.change(fixnan(PH)) != 0
    const fixPH1 = fixPH;
    if (!isNaN(ph)) fixPH = ph;
    if (Math.abs(fixPH - fixPH1) > EPS) {
      updatedHigh = ph;
      phActive = true;
      highIndex = i - period;
    }
    const fixPL1 = fixPL;
    if (!isNaN(pl)) fixPL = pl;
    if (Math.abs(fixPL - fixPL1) > EPS) {
      updatedLow = pl;
      plActive = true;
      lowIndex = i - period;
    }

    if (gt(scrHigh, updatedHigh) && phActive) {
      BUY = true;
      phActive = false;
    }
    if (lt(scrLow, updatedLow) && plActive) {
      SELL = true;
      plActive = false;
    }

    if (BUY && !tradeIsOn) {
      const sign = volCal(highIndex);
      add<Ln>(lines, { x1: highIndex, y1: updatedHigh, x2: i, y2: updatedHigh, color: cfg.bull, style: styleSwitch, width: 2 });
      add<Lb>(labels, {
        x: Math.floor(i - (i - highIndex) / 2), y: updatedHigh, text: (!hBreak ? 'CHoCH\n' : 'BOS\n') + sign, color: OFF,
        textColor: '#FFFFFF', style: 'label_down', size: 'tiny',
      });
      add<Lb>(labels, { x: i, y: bar.low, text: '', color: LIME, style: 'label_up', size: 'small', yloc: 'belowbar' });
      hBreak = true;
    }
    if (SELL && !tradeIsOn) {
      const sign = volCal(lowIndex);
      add<Ln>(lines, { x1: lowIndex, y1: updatedLow, x2: i, y2: updatedLow, color: cfg.bear, style: styleSwitch, width: 2 });
      add<Lb>(labels, {
        x: Math.floor(i - (i - lowIndex) / 2), y: updatedLow, text: (hBreak ? 'CHoCH\n' : 'BOS\n') + sign, color: OFF,
        textColor: '#FFFFFF', style: 'label_up', size: 'tiny',
      });
      add<Lb>(labels, { x: i, y: bar.low, text: '', color: RED, style: 'label_down', size: 'small', yloc: 'abovebar' });
      hBreak = false;
    }

    const long = BUY && !tradeIsOn;
    const short = SELL && !tradeIsOn;
    const tradeFire = long || short;
    // alertcondition(Long, "BUY") / alertcondition(Short, "Sell")
    longFlags.push(long);
    shortFlags.push(short);
    if (long && !tradeIsOn) {
      longTrade = true;
      shortTrade = false;
    }
    if (short && !tradeIsOn) {
      longTrade = false;
      shortTrade = true;
    }

    if (tradeFire && !tradeIsOn) {
      TP = long ? bar.close + cfg.rr1 * longDiffSL : bar.close - cfg.rr1 * longDiffSL2;
      SL = long ? bar.close - longDiffSL : bar.close + longDiffSL2;
      tradeIsOn = true;
      add<Ln>(lines, { x1: i, y1: long ? bar.high : bar.low, x2: i, y2: TP, color: TAIL, style: 'dashed', width: 2 });
      tpLine = hold(tpLine, add<Ln>(lines, { x1: i, y1: TP, x2: i + 2, y2: TP, color: TAIL, style: 'dashed', width: 1 }));
      if (cfg.showSL) {
        slLine = hold(slLine, add<Ln>(lines, { x1: i, y1: SL, x2: i + 2, y2: SL, color: RED, style: 'dashed', width: 1 }));
      }
      lab = hold(lab, add<Lb>(labels, {
        x: i, y: TP, text: 'Target', color: TAIL, textColor: '#FFFFFF', style: 'label_left', size: 'small',
      }));
    }
    if (tradeIsOn) {
      if (tpLine) tpLine.x2 = i;
      if (lab) lab.x = i + 1;
      if (cfg.showSL && slLine) slLine.x2 = i;
    }

    const stopped = () => {
      score[1] += 1;
      if (lab) {
        lab.color = String(color.new(RED, 70));
        lab.tooltip = 'Stoploss Hit : ' + str.tostring(math.round_to_mintick(SL, mintick));
      }
      tradeIsOn = false;
    };
    const won = () => {
      if (lab) lab.color = GREEN;
      score[0] += 1;
      tradeIsOn = false;
    };
    if (longTrade && tradeIsOn) {
      if (ge(bar.high, TP)) won();
      if (le(slOnClose ? bar.close : bar.low, SL)) stopped();
    } else if (shortTrade && tradeIsOn) {
      if (le(bar.low, TP)) won();
      if (ge(slOnClose ? bar.close : bar.high, SL)) stopped();
    }

    const bearCon = tradeIsOn && shortTrade;
    const bullCon = tradeIsOn && longTrade;
    const c = bearCon ? RED : bullCon ? GREEN_2 : IDLE;
    barColors.push({ time: bar.time, color: c });
    candles.push({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close, color: c, wickColor: WICK, borderColor: c });
    if (bearCon || bullCon) bgColors.push({ time: bar.time, color: bearCon ? bgBear : bgBull });
  }

  // var tb = table.new(position.top_right, 3, 3, bgcolor = color.new(color.gray, 80)); cells on the last bar
  const table: TableData = {
    position: 'top_right',
    columns: 3,
    rows: 3,
    bgColor: String(color.new('#787B86', 80)),
    cells: n > 0 ? [
      { column: 0, row: 0, text: 'Winning Trades', textColor: '#A3A3B1', textSize: 'auto' },
      { column: 1, row: 0, text: str.tostring(score[0]), textColor: '#08C09B', textSize: 'auto' },
      { column: 0, row: 1, text: 'Losing Trades', textColor: '#A3A3B1', textSize: 'auto' },
      { column: 1, row: 1, text: str.tostring(score[1]), textColor: '#CD0202', textSize: 'auto' },
    ] : [],
  };

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    barColors,
    bgColors,
    plotCandles: { plotcandle0: candles },
    // a line with an na price is not drawn
    lines: lines.filter((l) => !isNaN(l.y1) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, style: l.style, width: l.width,
    })),
    labels: labels.filter((l) => !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, ...(l.textColor ? { textColor: l.textColor } : {}),
      style: l.style, size: l.size, ...(l.yloc ? { yloc: l.yloc } : {}), ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
    tables: [table],
    alerts: alertStates(alertConditions, bars, [longFlags, shortFlags]),
  };
}

/** The original's alertconditions (no message given: the default one) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'BUY', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Sell', message: 'Alert Fired!' },
];

export const SmartMoneyBreakouts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
