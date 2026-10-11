/**
 * ORB Algo | Flux Charts
 *
 * Opening range breakout trades on intraday charts up to 15 minutes. Every trading day starts a new opening range:
 * the high and the low of the bars of the first "ORB Timeframe" minutes. After the range:
 * 1. Breakout: the close (or the EMA of (high + low) / 2, "Breakout Condition") leaves the range. It fails when a
 *    close comes back inside. Each later bar that closes outside and touches the range with its wick is a retest.
 * 2. Entry when the breakout has the retests that the "Sensitivity" asks for (High 0, Medium 1, Low 2, Lowest 3),
 *    at the close. Stop loss: the range centre (Balanced), half way to the broken side (Safer) or to the other
 *    side (Risky); with "Adaptive SL" it moves to the entry price at the first take profit.
 * 3. Take profits (3 at most). Dynamic: the EMA is at least 0.2 % in profit and the close crosses back over it; the
 *    next ones need an EMA 0.075 % further. ATR: 0.75 / 1.5 / 2.25 x ATR(12) of the entry bar from the entry.
 * 4. A trade still open at the next opening range is closed at the last close ("Exit").
 *
 * Outputs: the EMA plot ("Plot EMA"), markers "TP 1" / "TP 2" / "TP 3" / "SL" / "Exit", and on the last bar the
 * range lines and "Buy" / "Sell" labels of the ranges that start in the last 5,000 bars, the ORB dashboard (signal,
 * entry price, current profit, stop and targets) and the backtesting table (days, wins, losses, win rate, average
 * and total profit in %, with the "Backtesting Exit Ratios" of the three take profits).
 *
 * Chart context (third argument), all optional:
 * - Regular session hours and exchange time zone: a range starts on the first bar of the regular session, as in the
 *   original. Without the session hours the port starts a range on the first bar of each UTC day (symbols with
 *   weekend bars: 00:00 UTC). This is the same bar on 24x7 UTC symbols and on bars of the regular session only
 *   (e.g. US stocks); not with bars of extended hours, nor on sessions that cross 00:00 UTC.
 * - Exchange time zone: the hours of "Custom Session" are read in it; in UTC without it.
 * - Price tick of the symbol: the prices of the dashboard; 0.01 without it.
 * - State of the last bar: the original computes on closed bars only. While the last bar is open, its state is the
 *   one of the bar before. Without the value every bar is a closed bar.
 * The original throws above 15 minutes: the port throws the same error; the chart timeframe is taken from the most
 * frequent gap between two bars.
 *
 * Reference: "ORB Algo | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, str, timeframe, time as pineTime, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, MarkerData, TableData, TableCellData, TableMergeData, TablePosition } from '../types';
import { chartTimeframe, periodStarts } from '../anchor-period';
import { lastBarConfirmedOf, mintickOf, timezoneOf, type ChartContext } from '../chart-context';

type Position = 'Top Right' | 'Right Center' | 'Top Center';

export interface OrbAlgoFluxChartsInputs {
  /** ORB Timeframe */
  orbTimeStr: string;
  sensitivity: 'High' | 'Medium' | 'Low' | 'Lowest';
  breakoutCondition: 'Close' | 'EMA';
  tpMethod: 'Dynamic' | 'ATR';
  emaLength: number;
  /** Stop-Loss */
  slMethod: 'Safer' | 'Balanced' | 'Risky';
  adaptiveSL: boolean;
  customSessionEnabled: boolean;
  customSessionTime: string;
  orbDisplayEnabled: boolean;
  orbLocation: Position;
  backtestDisplayEnabled: boolean;
  backtestingLocation: Position;
  backtestingExitRatios: string;
  showORBZones: boolean;
  plotEMA: boolean;
  highColor: string;
  lowColor: string;
}

export const defaultInputs: OrbAlgoFluxChartsInputs = {
  orbTimeStr: '30',
  sensitivity: 'Medium',
  breakoutCondition: 'Close',
  tpMethod: 'Dynamic',
  emaLength: 9,
  slMethod: 'Balanced',
  adaptiveSL: true,
  customSessionEnabled: false,
  customSessionTime: '1000-1100',
  orbDisplayEnabled: true,
  orbLocation: 'Top Right',
  backtestDisplayEnabled: true,
  backtestingLocation: 'Top Center',
  backtestingExitRatios: '90% | 5% | 5%',
  showORBZones: true,
  plotEMA: false,
  highColor: '#4CAF50',
  lowColor: '#F23645',
};

const POSITION_OPTIONS = ['Top Right', 'Right Center', 'Top Center'];

export const inputConfig: InputConfig[] = [
  { id: 'orbTimeStr', type: 'timeframe', title: 'ORB Timeframe', defval: '30', group: 'Algorithm' },
  { id: 'sensitivity', type: 'string', title: 'Sensitivity', defval: 'Medium', options: ['High', 'Medium', 'Low', 'Lowest'], group: 'Algorithm' },
  { id: 'breakoutCondition', type: 'string', title: 'Breakout Condition', defval: 'Close', options: ['Close', 'EMA'], group: 'Algorithm' },
  { id: 'tpMethod', type: 'string', title: 'TP Method', defval: 'Dynamic', options: ['Dynamic', 'ATR'], group: 'Algorithm' },
  { id: 'emaLength', type: 'int', title: 'EMA Length', defval: 9, min: 4, max: 34, group: 'Algorithm' }, // Pine options = [4, 9, 13, 20, 34]
  { id: 'slMethod', type: 'string', title: 'Stop-Loss', defval: 'Balanced', options: ['Safer', 'Balanced', 'Risky'], group: 'Algorithm' },
  { id: 'adaptiveSL', type: 'bool', title: 'Adaptive SL', defval: true, group: 'Algorithm' },
  { id: 'customSessionEnabled', type: 'bool', title: 'Enabled', defval: false, group: 'Custom Session' },
  { id: 'customSessionTime', type: 'session', title: 'Session', defval: '1000-1100', group: 'Custom Session' },
  { id: 'orbDisplayEnabled', type: 'bool', title: 'Enabled', defval: true, group: 'ORB Dashboard' },
  { id: 'orbLocation', type: 'string', title: 'Position', defval: 'Top Right', options: POSITION_OPTIONS, group: 'ORB Dashboard' },
  { id: 'backtestDisplayEnabled', type: 'bool', title: 'Enabled', defval: true, group: 'Backtesting' },
  { id: 'backtestingLocation', type: 'string', title: 'Position', defval: 'Top Center', options: POSITION_OPTIONS, group: 'Backtesting' },
  {
    id: 'backtestingExitRatios', type: 'string', title: 'Backtesting Exit Ratios', defval: '90% | 5% | 5%',
    options: ['75% | 15% | 10%', '50% | 25% | 25%', '34% | 33% | 33%', '90% | 5% | 5%', '100% | 0% | 0%', '0% | 100% | 0%', '0% | 0% | 100%'],
    tooltip: 'TP 1 | TP 2 | TP 3', group: 'Backtesting',
  },
  { id: 'showORBZones', type: 'bool', title: 'Draw ORB Zones', defval: true, group: 'Visuals', inline: 'group1' },
  { id: 'plotEMA', type: 'bool', title: 'Plot EMA', defval: false, group: 'Visuals', inline: 'group1' },
  { id: 'highColor', type: 'color', title: 'High', defval: '#4CAF50', inline: 'colors', group: 'Visuals' },
  { id: 'lowColor', type: 'color', title: 'Low', defval: '#F23645', inline: 'colors', group: 'Visuals' },
];

/** Colour constants of the original Pine version */
const BLUE = '#2962FF';
const GREEN = '#4CAF50';
const RED = '#F23645';
const WHITE = '#FFFFFF';
const BLACK = '#363A45';
const ORB_COLOR = '#3B3B3B43';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Plot', color: BLUE, lineWidth: 1 },
];

export const metadata = {
  title: 'ORB Algo | Flux Charts',
  shortTitle: 'ORB Algo | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const RENDER_MAX_BARS_BACK = 5000;
const MINIMUM_PROFIT_PERCENT = 0.2;
const MINIMUM_PROFIT_INCREMENT_PERCENT = 0.075;
const ATR_TP_MULT = [0.75, 1.5, 2.25];
const MAX_LINES = 500;
const MAX_LABELS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10; na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

/** type Breakout */
interface Breakout {
  isBullish: boolean;
  startIndex: number;
  retests: number;
}

/** type ORB: an na number or bar index is NaN */
interface Orb {
  h: number;
  l: number;
  startTime: number;
  startIndex: number;
  endIndex: number;
  state: 'Opening Range' | 'Waiting For Breakouts' | 'In Breakout' | 'Entry Taken';
  breakouts: Breakout[];
  entryBullish: boolean;
  entryIndex: number;
  entryPrice: number;
  entryATR: number;
  tp1Index: number;
  tp1Price: number;
  tp2Index: number;
  tp2Price: number;
  tp3Index: number;
  tp3Price: number;
  slIndex: number;
  slPrice: number;
}

const POSITIONS: Record<string, TablePosition> = {
  'Top Right': 'top_right',
  'Top Center': 'top_center',
  'Right Center': 'middle_right',
};

export function calculate(
  bars: Bar[],
  inputs: Partial<OrbAlgoFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const markers: MarkerData[] = [];
  let lines: LineDrawingData[] = [];
  let labels: LabelData[] = [];
  const tables: TableData[] = [];
  const plot0: Array<{ time: number; value: number }> = [];
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    lines,
    labels,
    tables,
  });
  if (n === 0) return result();

  if (timeframe.in_seconds(chartTimeframe(bars)) > timeframe.in_seconds('15')) {
    throw new Error('ORB Algo only works on timeframes lower than 15 min.');
  }
  const ms = bars[0].time >= 1e12;
  const tMs = bars.map((b) => (ms ? b.time : b.time * 1000));
  const orbMs = timeframe.in_seconds(cfg.orbTimeStr) * 1000;
  const retestsNeededForEntry = cfg.sensitivity === 'High' ? 0 : cfg.sensitivity === 'Medium' ? 1 : cfg.sensitivity === 'Low' ? 2 : 3;
  const dynamicTP = cfg.tpMethod === 'Dynamic';
  const atrTP = cfg.tpMethod === 'ATR';
  const exitRatios = cfg.backtestingExitRatios.split(' | ').map((s) => (str.tonumber(s.replace('%', '')) ?? NaN) / 100.0);

  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ema = arr(ta.ema(new Series(bars, (b) => (b.high + b.low) / 2.0), cfg.emaLength));
  const atr = arr(ta.atr(bars, 12));

  // First bar of the trading day (session.isfirstbar_regular), or the first bar of the custom session:
  // sessionBegins(): t = time('1440', sess) is the start of the session run of the bar (na outside the session); a range
  // starts when the bar is in the session and the bar before was not, or when a run started after the bar before
  // (t[1] < t). The function is called from bar 1 on: t[1] is na on its first call.
  // The session hours are read in the exchange time zone (chart context; UTC without it).
  const dayStart = periodStarts(bars, 'D');
  const tz = timezoneOf(chart);
  const utc = tz === 'UTC' || tz === 'Etc/UTC';
  const DAY = 86400000;
  // Clock of the exchange time zone minus UTC, at time t
  const zoneOffset = (t: number) => (utc ? 0 : Date.UTC(
    pineTime.year(t, tz), pineTime.month(t, tz) - 1, pineTime.dayofmonth(t, tz),
    pineTime.hour(t, tz), pineTime.minute(t, tz), pineTime.second(t, tz),
  ) - Math.floor(t / 1000) * 1000);
  /** Bar i is the first bar of a run of the session `sess` (`firstCall`: the bar before has no session state) */
  const runBegins = (sess: string, firstCall: number) => {
    const inSession = (i: number) => pineTime.inSession(tMs[i], sess, tz);
    const runStarts = sess.trim() === '24x7' ? [0]
      : [...sess.matchAll(/(\d\d)(\d\d)-\d{4}/g)].map((m) => ((Number(m[1]) * 60 + Number(m[2])) % 1440) * 60000);
    return (i: number): boolean => {
      if (!inSession(i)) return false;
      if (i === firstCall || !inSession(i - 1)) return true;
      const offset = zoneOffset(tMs[i]);
      const clock = tMs[i] + offset;
      return runStarts.some((m) => {
        let s = Math.floor(clock / DAY) * DAY + m;
        if (s > clock) s -= DAY;
        return s - offset > tMs[i - 1] && pineTime.inSession(s - offset, sess, tz);
      });
    };
  };
  const customBegins = runBegins(cfg.customSessionTime, 1);
  // session.isfirstbar_regular: with the regular session hours of the chart context, the first bar of a session run;
  // without them, the first bar of a UTC day
  const regular = chart?.regularSession ?? chart?.session;
  const regularBegins = typeof regular === 'string' && /^(24x7|\d{4}-\d{4}(,\d{4}-\d{4})*(:\d+)?)$/.test(regular.trim())
    ? runBegins(regular, -1) : null;
  const newRange = (i: number): boolean => {
    if (cfg.customSessionEnabled) return customBegins(i);
    return regularBegins !== null ? regularBegins(i) : dayStart[i] !== dayStart[i - 1];
  };

  const diffPercent = (val1: number, val2: number) => (Math.abs(val1 - val2) / val2) * 100.0;
  const orbList: Orb[] = [];
  // The original computes on closed bars only (barstate.isconfirmed): the last bar is left out while it is open
  // (chart context; without it every bar is closed)
  const lastClosed = lastBarConfirmedOf(chart) ? last : last - 1;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = b.time;
    plot0.push({ time, value: cfg.plotEMA ? ema[i] : NaN });

    let lastORB: Orb | null = orbList.length > 0 ? orbList[0] : null;
    let previousORB: Orb | null = null;
    let tp1Found = false;
    let tp2Found = false;
    let tp3Found = false;
    let slFound = false;

    // `last_bar_index - bar_index < last_bar_index`: the first bar is left out
    if (i > 0 && i <= lastClosed) {
      // New opening range; a trade still open is closed at the last close
      if (newRange(i)) {
        if (lastORB !== null) {
          lastORB.endIndex = i - 1;
          if (!isNaN(lastORB.entryIndex) && isNaN(lastORB.slIndex)) {
            lastORB.slPrice = bars[i - 1].close;
            lastORB.slIndex = i - 1;
            previousORB = lastORB;
          }
        }
        lastORB = {
          h: NaN, l: NaN, startTime: tMs[i], startIndex: i, endIndex: NaN, state: 'Opening Range', breakouts: [],
          entryBullish: false, entryIndex: NaN, entryPrice: NaN, entryATR: NaN, tp1Index: NaN, tp1Price: NaN,
          tp2Index: NaN, tp2Price: NaN, tp3Index: NaN, tp3Price: NaN, slIndex: NaN, slPrice: NaN,
        };
        orbList.unshift(lastORB);
      }

      if (lastORB !== null) {
        const orb: Orb = lastORB;
        // Range high and low
        if (orb.state === 'Opening Range' && tMs[i] < orb.startTime + orbMs) {
          orb.h = Math.max(isNaN(orb.h) ? 0 : orb.h, b.high);
          orb.l = Math.min(isNaN(orb.l) ? b.low : orb.l, b.low);
        }
        if (orb.state === 'Opening Range' && tMs[i] >= orb.startTime + orbMs) orb.state = 'Waiting For Breakouts';

        // Breakouts
        if (orb.state === 'Waiting For Breakouts') {
          const conditionPrice = cfg.breakoutCondition === 'EMA' ? ema[i] : b.close;
          if (gt(conditionPrice, orb.h) || lt(conditionPrice, orb.l)) {
            orb.breakouts.unshift({ isBullish: gt(conditionPrice, orb.h), startIndex: i, retests: 0 });
            orb.state = 'In Breakout';
          }
        }

        if (orb.state === 'In Breakout') {
          const cur = orb.breakouts[0];
          // Failed breakout
          if ((cur.isBullish && lt(b.close, orb.h)) || (!cur.isBullish && gt(b.close, orb.l))) orb.state = 'Waiting For Breakouts';
          // Retest
          if (i > cur.startIndex && ((cur.isBullish && gt(b.close, orb.h) && lt(b.low, orb.h)) || (!cur.isBullish && lt(b.close, orb.l) && gt(b.high, orb.l)))) {
            cur.retests += 1;
          }
          if (cur.retests >= retestsNeededForEntry) {
            orb.state = 'Entry Taken';
            orb.entryATR = atr[i];
            orb.entryIndex = i;
            orb.entryPrice = b.close;
            orb.entryBullish = cur.isBullish;
            const center = (orb.h + orb.l) / 2.0;
            if (cfg.slMethod === 'Safer') orb.slPrice = orb.entryBullish ? (center + orb.h) / 2.0 : (center + orb.l) / 2.0;
            if (cfg.slMethod === 'Balanced') orb.slPrice = center;
            if (cfg.slMethod === 'Risky') orb.slPrice = orb.entryBullish ? (center + orb.l) / 2.0 : (center + orb.h) / 2.0;
          }
        }

        if (orb.state === 'Entry Taken') {
          const bull = orb.entryBullish;
          const e = ema[i];
          const noStop = isNaN(orb.slIndex);
          if (dynamicTP) {
            const isProfitable = (bull && gt(e, orb.entryPrice)) || (!bull && lt(e, orb.entryPrice));
            if (isProfitable && ge(diffPercent(e, orb.entryPrice), MINIMUM_PROFIT_PERCENT)) {
              const crossed = (bull && lt(b.close, e)) || (!bull && gt(b.close, e));
              const further = (price: number) => ((bull && gt(e, price)) || (!bull && lt(e, price)))
                && ge(diffPercent(e, price), MINIMUM_PROFIT_INCREMENT_PERCENT);
              if (noStop && isNaN(orb.tp1Index) && crossed) {
                orb.tp1Index = i;
                orb.tp1Price = e;
                tp1Found = true;
                if (cfg.adaptiveSL) orb.slPrice = orb.entryPrice;
              } else if (noStop && !isNaN(orb.tp1Index) && isNaN(orb.tp2Index) && crossed) {
                if (further(orb.tp1Price)) {
                  orb.tp2Index = i;
                  orb.tp2Price = e;
                  tp2Found = true;
                }
              } else if (noStop && !isNaN(orb.tp2Index) && isNaN(orb.tp3Index) && crossed) {
                if (further(orb.tp2Price)) {
                  orb.tp3Index = i;
                  orb.tp3Price = e;
                  tp3Found = true;
                  orb.slIndex = -1;
                }
              }
            }
          }
          if (atrTP) {
            const target = (k: number) => orb.entryPrice + orb.entryATR * ATR_TP_MULT[k] * (bull ? 1 : -1);
            const reached = (price: number) => (bull && ge(b.high, price)) || (!bull && le(b.low, price));
            if (noStop && isNaN(orb.tp1Index) && reached(target(0))) {
              orb.tp1Index = i;
              orb.tp1Price = target(0);
              tp1Found = true;
              if (cfg.adaptiveSL) orb.slPrice = orb.entryPrice;
            } else if (noStop && !isNaN(orb.tp1Index) && isNaN(orb.tp2Index) && reached(target(1))) {
              orb.tp2Index = i;
              orb.tp2Price = target(1);
              tp2Found = true;
            } else if (noStop && !isNaN(orb.tp2Index) && isNaN(orb.tp3Index) && reached(target(2))) {
              orb.tp3Index = i;
              orb.tp3Price = target(2);
              tp3Found = true;
              orb.slIndex = -1;
            }
          }
          // Stop loss, not on the bar of a take profit
          if (!isNaN(orb.slPrice) && isNaN(orb.slIndex) && ((bull && lt(b.low, orb.slPrice)) || (!bull && gt(b.high, orb.slPrice)))) {
            if (!(i === orb.tp1Index || i === orb.tp2Index || i === orb.tp3Index)) {
              slFound = true;
              orb.slIndex = i;
            }
          }
        }
      }
    }

    // Markers (the series is the close: a close of 0 draws nothing)
    if (i > last - RENDER_MAX_BARS_BACK && b.close !== 0 && !isNaN(b.close)) {
      const mark = (t: number, above: boolean, text: string, col: string) => markers.push({
        time: t, position: above ? 'aboveBar' : 'belowBar', shape: 'xcross', color: col, text, textColor: WHITE, size: 'tiny',
      });
      if (lastORB !== null) {
        const bull = lastORB.entryBullish;
        if (tp1Found) mark(time, bull, 'TP 1', BLUE);
        if (tp2Found) mark(time, bull, 'TP 2', BLUE);
        if (tp3Found) mark(time, bull, 'TP 3', BLUE);
        if (slFound) mark(time, !bull, 'SL', RED);
      }
      // offset = -1: on the last bar of the range that ended
      if (previousORB !== null) mark(bars[i - 1].time, !previousORB.entryBullish, 'Exit', RED);
    }
  }

  // Range lines and entry labels, on the last bar (newest range first). The original keeps 500 lines and 500 labels:
  // a creation that brings the count above 505 deletes the oldest ones until 500 remain.
  for (const orb of orbList) {
    if (!(orb.startIndex > last - RENDER_MAX_BARS_BACK)) continue;
    if (cfg.showORBZones) {
      const x2 = bars[isNaN(orb.endIndex) ? last : orb.endIndex].time;
      const x1 = bars[orb.startIndex].time;
      lines.push({ time1: x1, price1: orb.h, time2: x2, price2: orb.h, color: cfg.highColor, width: 2 });
      if (lines.length > MAX_LINES + 5) lines = lines.slice(lines.length - MAX_LINES);
      lines.push({ time1: x1, price1: orb.l, time2: x2, price2: orb.l, color: cfg.lowColor, width: 2 });
      if (lines.length > MAX_LINES + 5) lines = lines.slice(lines.length - MAX_LINES);
    }
    if (!isNaN(orb.entryIndex)) {
      labels.push({
        time: bars[orb.entryIndex].time, price: orb.entryPrice + orb.entryATR * 3 * (orb.entryBullish ? -1 : 1),
        text: orb.entryBullish ? 'Buy' : 'Sell', color: orb.entryBullish ? GREEN : RED, textColor: WHITE,
        style: orb.entryBullish ? 'label_up' : 'label_down',
      });
      if (labels.length > MAX_LABELS + 5) labels = labels.slice(labels.length - MAX_LABELS);
    }
  }

  const mintick = mintickOf(chart);
  const priceText = (v: number) => str.tostring(v, 'mintick', mintick);
  const close = bars[last].close;

  // ORB dashboard
  if (cfg.orbDisplayEnabled) {
    const cells: TableCellData[] = [];
    const merges: TableMergeData[] = [];
    const cell = (column: number, row: number, text: string, bgColor?: string) => cells.push({
      column, row, text, textColor: WHITE, textSize: 'auto', ...(bgColor !== undefined ? { bgColor } : {}),
    });
    const merge = (startColumn: number, startRow: number, endColumn: number, endRow: number) => merges.push({ startColumn, startRow, endColumn, endRow });
    const orb = orbList.length > 0 ? orbList[0] : null;
    const entryPrice = orb !== null ? orb.entryPrice : NaN;
    const bull = orb !== null && orb.entryBullish;
    const none = isNaN(entryPrice);
    const side = none ? ORB_COLOR : bull ? GREEN : RED;

    merge(0, 0, 3, 0);
    cell(0, 0, 'ORB Dashboard', ORB_COLOR);
    merge(0, 1, 0, 2);
    cell(0, 1, none ? 'No Signal' : bull ? 'Bullish' : 'Bearish', side);
    cell(1, 1, bull ? 'Buy Price' : 'Sell Price', side);
    cell(1, 2, none ? 'No Signal' : priceText(entryPrice), side);
    merge(2, 1, 3, 1);
    merge(2, 2, 3, 2);
    const curProfit = (close - entryPrice) * (bull ? 1 : -1);
    const curProfitPercent = (curProfit / entryPrice) * 100.0;
    const profitColor = none ? ORB_COLOR : gt(curProfit, 0) ? GREEN : RED;
    cell(2, 1, 'Current Profit %', profitColor);
    cell(2, 2, isNaN(curProfitPercent) ? 'No Signal' : `${str.tostring(curProfitPercent, '#.##')}%`, profitColor);
    if (orb !== null && !none) {
      if (atrTP) {
        ['TP 1', 'TP 2', 'TP 3', 'SL'].forEach((text, column) => cell(column, 3, text));
        ATR_TP_MULT.forEach((mult, column) => cell(column, 4, priceText(orb.entryPrice + orb.entryATR * mult * (bull ? 1 : -1))));
        cell(3, 4, priceText(orb.slPrice));
      } else {
        merge(0, 3, 3, 3);
        merge(0, 4, 3, 4);
        cell(0, 3, 'SL');
        cell(0, 4, priceText(orb.slPrice));
      }
    }
    tables.push({
      position: POSITIONS[cfg.orbLocation] ?? 'middle_left', columns: 4, rows: 5, cells, merges,
      bgColor: ORB_COLOR, frameWidth: 2, frameColor: BLACK, borderWidth: 1, borderColor: BLACK,
    });
  }

  // Backtesting dashboard
  if (cfg.backtestDisplayEnabled) {
    let totalProfitPercent = 0;
    let wins = 0;
    let losses = 0;
    for (const orb of orbList) {
      if (isNaN(orb.entryIndex)) continue;
      let isSuccess = false;
      let totalProfitTaken = 0.0;
      [orb.tp1Price, orb.tp2Price, orb.tp3Price].forEach((price, k) => {
        if (isNaN(price)) return;
        isSuccess = true;
        totalProfitPercent += diffPercent(price, orb.entryPrice) * exitRatios[k];
        totalProfitTaken += exitRatios[k];
      });
      if (!isNaN(orb.slIndex) && orb.slIndex !== -1) {
        totalProfitPercent -= diffPercent(orb.slPrice, orb.entryPrice) * (1.0 - totalProfitTaken);
        if (Math.abs(totalProfitTaken) <= EPS) losses += 1;
      }
      if (isSuccess) wins += 1;
    }
    const total = wins + losses;
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string) => cells.push({
      column, row, text, textColor: WHITE, bgColor: ORB_COLOR, textSize: 'auto',
    });
    cell(0, 0, 'ORB Backtesting');
    cell(0, 1, 'Total Days');
    cell(1, 1, str.tostring(orbList.length));
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
      position: POSITIONS[cfg.backtestingLocation] ?? 'middle_left', columns: 2, rows: 10, cells,
      merges: [{ startColumn: 0, startRow: 0, endColumn: 1, endRow: 0 }],
      bgColor: ORB_COLOR, frameWidth: 2, frameColor: BLACK, borderWidth: 1, borderColor: BLACK,
    });
  }

  return result();
}

export const OrbAlgoFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
