/**
 * Logistic RSI, STOCH, ROC, AO, ... by DGT
 *
 * Logistic map applied to an oscillator. The base value r is one of: Awesome Oscillator (sma(hl2, 5) / sma(hl2, 34)
 * - 1), Logistic Dominance (a logistic term of the source and of its negative, with the rate of change over "Length :
 * Logistic Dominance" bars as growth rate), Rate of Change, RSI / 100 - 0.5 or Stochastic / 100 - 0.5. The map value is
 * mapeq = r * s / H * (1 - s / H) with s the source and H the highest high of "Logistic Map Length" bars. The
 * iterations are r * |mapeq[k]| * (1 - mapeq[k]) for the past bars k = 0 .. 29: the script plots the last one
 * ("Last Iteration") and 25 others, each teal when >= 0 and red below. The thick line is the standard deviation of
 * the 29 iterations, with the sign of their average (cyan when the average is >= 0, orange below).
 *
 * Backtest framework (off by default): the trades follow the crosses of the standard deviation line over / under 0,
 * confirmed one bar later (entry at the open of the next bar), within the last "Period (Years)" years before the
 * current time, with an optional stop loss. It draws entry / exit labels, early warning labels, a statistics label
 * after the last bar, a background colour and the entry / exit price as circles on the price pane.
 *
 * Inputs whose effect a static plot setting cannot follow: "Style" (Cross / Line / StepLine) sets the style of the
 * 26 iteration plots; the plot configuration keeps the default (cross). The plots use display = all except the
 * status line.
 *
 * Chart context (optional third argument of calculate): the current time (`timenow`, the backtest period and the
 * statistics), the symbol tick (`syminfo.mintick`, the floor of the trade prices) and the chart timeframe (statistics
 * text). Without it the port uses the computer clock, a tick of 0.01 and the timeframe of the bar spacing.
 *
 * Reference: "Logistic RSI, STOCH, ROC, AO, ... by DGT" by dgtrd
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © dgtrd
 */

import {
  ta, array, str, color, label, table, Series, getSourceSeries, resetDrawings, setDrawingBar, varDrawing,
  drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType, type Label,
} from 'oakscriptjs';
import type { BgColorData, LabelData, TableData } from '../types';
import { mintickOf, nowOf, type ChartContext } from '../chart-context';
import { chartTimeframe } from '../anchor-period';

type Indicator = 'Awesome Oscillator (AO)' | 'Logistic Dominance' | 'Rate of Change (ROC)'
  | 'Relative Strength Index (RSI)' | 'Stochastic (STOCH)';

export interface LogisticRsiStochRocAoByDgtInputs {
  ti: Indicator;
  source: SourceType;
  length: number;
  lenLD: number;
  lenROC: number;
  lenRSI: number;
  lenSTO: number;
  style: 'Cross' | 'Line' | 'StepLine';
  uC: string;
  dC: string;
  /** Standard Deviation Line Alone */
  d: boolean;
  isBackTest: boolean;
  tradeMode: 'Long Only' | 'Short Only' | 'Both';
  reverseOnSignal: boolean;
  dasCapital: number;
  lenBckTst: number;
  isStopLoss: boolean;
  /** Stop loss in % */
  stopLoss: number;
  useCandleL: boolean;
  useCandleS: boolean;
  isSudden: boolean;
  isTest: boolean;
  lblInOutSL: boolean;
  lblWarnings: boolean;
  lblTrdStat: boolean;
}

const TEAL = '#089981';
const RED = '#F23645';
const GRAY = '#787B86';

export const defaultInputs: LogisticRsiStochRocAoByDgtInputs = {
  ti: 'Logistic Dominance',
  source: 'close',
  length: 13,
  lenLD: 5,
  lenROC: 9,
  lenRSI: 14,
  lenSTO: 14,
  style: 'Cross',
  uC: TEAL,
  dC: RED,
  d: false,
  isBackTest: false,
  tradeMode: 'Both',
  reverseOnSignal: true,
  dasCapital: 1000,
  lenBckTst: 1,
  isStopLoss: false,
  stopLoss: 1,
  useCandleL: false,
  useCandleS: false,
  isSudden: true,
  isTest: false,
  lblInOutSL: true,
  lblWarnings: true,
  lblTrdStat: true,
};

const BT = '=============   Backtest Framework   =============';
export const inputConfig: InputConfig[] = [
  { id: 'ti', type: 'string', title: 'Select Indicator', defval: 'Logistic Dominance',
    options: ['Awesome Oscillator (AO)', 'Logistic Dominance', 'Rate of Change (ROC)', 'Relative Strength Index (RSI)', 'Stochastic (STOCH)'] },
  { id: 'source', type: 'source', title: 'Source', defval: 'close', group: 'Logistic Settings' },
  { id: 'length', type: 'int', title: 'Logistic Map Length', defval: 13, min: 1, group: 'Logistic Settings' },
  { id: 'lenLD', type: 'int', title: 'Length : Logistic Dominance', defval: 5, min: 1, group: 'Optimization / Customization Metrics' },
  { id: 'lenROC', type: 'int', title: 'Length : Rate of Change (ROC)', defval: 9, min: 1, group: 'Optimization / Customization Metrics' },
  { id: 'lenRSI', type: 'int', title: 'Length : Relative Strength Index (RSI)', defval: 14, min: 1, group: 'Optimization / Customization Metrics' },
  { id: 'lenSTO', type: 'int', title: 'Length : Stochastic (STOCH)', defval: 14, min: 1, group: 'Optimization / Customization Metrics' },
  { id: 'style', type: 'string', title: 'Style', defval: 'Cross', options: ['Cross', 'Line', 'StepLine'], group: 'Display Settings' },
  { id: 'uC', type: 'color', title: 'Colors : Bullish', defval: TEAL, inline: 'PLOT', group: 'Display Settings' },
  { id: 'dC', type: 'color', title: 'Bearish', defval: RED, inline: 'PLOT', group: 'Display Settings' },
  { id: 'd', type: 'bool', title: 'Standard Deviation Line Alone', defval: false, group: 'Display Settings' },
  { id: 'isBackTest', type: 'bool', title: 'Enable Backtest', defval: false, group: BT },
  { id: 'tradeMode', type: 'string', title: 'Trade Mode', defval: 'Both', options: ['Long Only', 'Short Only', 'Both'], group: BT },
  { id: 'reverseOnSignal', type: 'bool', title: 'Reverse on Opposite Signal', defval: true, group: BT },
  { id: 'dasCapital', type: 'float', title: 'Initial Capital', defval: 1000, group: BT },
  { id: 'lenBckTst', type: 'float', title: 'Period (Years)', defval: 1, min: 0, step: 0.1, group: BT },
  { id: 'isStopLoss', type: 'bool', title: 'Apply Stop Loss', defval: false, inline: 'sl', group: BT },
  { id: 'stopLoss', type: 'float', title: '  %', defval: 1, min: 0, step: 0.1, inline: 'sl', group: BT },
  { id: 'useCandleL', type: 'bool', title: 'Long Candle Confirmation', defval: false, group: BT },
  { id: 'useCandleS', type: 'bool', title: 'Short Candle Confirmation', defval: false, group: BT },
  { id: 'isSudden', type: 'bool', title: 'Avoid Same-Bar Conflicts', defval: true, group: BT },
  { id: 'isTest', type: 'bool', title: '❗ Next Bar Mode (Repaints)', defval: false, group: BT },
  { id: 'lblInOutSL', type: 'bool', title: 'Show Entry / Exit Labels', defval: true, group: BT },
  { id: 'lblWarnings', type: 'bool', title: 'Show Early Warnings', defval: true, group: BT },
  { id: 'lblTrdStat', type: 'bool', title: 'Show Trade Statistics', defval: true, group: BT },
];

/** Array elements plotted: 1 .. 24, 26 and 28 (the 26th, 28th and 30th iterations are commented out in the source) */
const ITERATIONS: Array<[number, string]> = [
  [1, '2nd'], [2, '3rd'], [3, '4th'], [4, '5th'], [5, '6th'], [6, '7th'], [7, '8th'], [8, '9th'], [9, '10th'],
  [10, '11th'], [11, '12th'], [12, '13th'], [13, '14th'], [14, '15th'], [15, '16th'], [16, '17th'], [17, '18th'],
  [18, '19th'], [19, '20th'], [20, '21st'], [21, '22nd'], [22, '23rd'], [23, '24th'], [24, '25th'], [26, '27th'],
  [28, '29th'],
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Last Iteration', color: TEAL, lineWidth: 1, style: 'cross' },
  ...ITERATIONS.map(([, name], k): PlotConfig => (
    { id: `plot${k + 1}`, title: `${name} Iteration`, color: TEAL, lineWidth: 1, style: 'cross' })),
  { id: 'plot27', title: 'Standard Deviation of Array\'s Elements', color: '#26c6da', lineWidth: 2 },
  { id: 'plot28', title: 'Entry / Exit Price', color: GRAY, lineWidth: 1, style: 'circles', forceOverlay: true },
];

export const metadata = {
  title: 'Logistic RSI, STOCH, ROC, AO, ... by DGT',
  shortTitle: 'LOGISTIC ☼☾',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Average number of ms in a year, as the source */
const YEAR = 31556952000;

export function calculate(
  bars: Bar[],
  inputs: Partial<LogisticRsiStochRocAoByDgtInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { labels: LabelData[]; tables: TableData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const src = A(getSourceSeries(bars, cfg.source));
  const highS = new Series(bars, (b) => b.high);
  const length = cfg.length;

  // f_logmap(_s, _r, _l) = _r * _s / ta.highest(_l) * (1 - _s / ta.highest(_l)): ta.highest(_l) is the highest high
  const logmap = (s: number[], r: number[], hh: number[]) => s.map((v, i) => r[i] * v / hh[i] * (1 - v / hh[i]));
  const hhOf = (len: number) => A(ta.highest(highS, len));
  const past = (x: number[], k: number, i: number) => (i - k >= 0 ? x[i - k] : NaN);
  const changeRate = (len: number) => src.map((v, i) => (v - past(src, len, i)) / past(src, len, i));

  let r: number[];
  switch (cfg.ti) {
    case 'Awesome Oscillator (AO)': {
      const hl2 = new Series(bars, (b) => (b.high + b.low) / 2);
      const s5 = A(ta.sma(hl2, 5));
      const s34 = A(ta.sma(hl2, 34));
      r = s5.map((v, i) => v / s34[i] - 1);
      break;
    }
    case 'Logistic Dominance': {
      const rate = changeRate(cfg.lenLD);
      const hh = hhOf(cfg.lenLD);
      const a = logmap(src.map((v) => -v), rate, hh);
      const b = logmap(src, rate, hh);
      r = a.map((v, i) => -v - b[i]);
      break;
    }
    case 'Rate of Change (ROC)':
      r = changeRate(cfg.lenROC);
      break;
    case 'Relative Strength Index (RSI)':
      r = A(ta.rsi(Series.fromArray(bars, src), cfg.lenRSI)).map((v) => v / 100 - 0.5);
      break;
    case 'Stochastic (STOCH)':
      r = A(ta.stoch(Series.fromArray(bars, src), highS, new Series(bars, (b) => b.low), cfg.lenSTO)).map((v) => v / 100 - 0.5);
      break;
    default:
      r = new Array<number>(n).fill(NaN);
  }

  // f_map(source, r, v): mapeq = f_logmap(source, r, length); v = [mapeq, r * |mapeq[0]| * (1 - mapeq[0]), ...,
  // r * |mapeq[28]| * (1 - mapeq[28])]; the result is r * |mapeq[29]| * (1 - mapeq[29])
  const mapeq = logmap(src, r, hhOf(length));
  const iterate = (i: number, k: number) => {
    const m = past(mapeq, k, i);
    return r[i] * Math.abs(m) * (1 - m);
  };

  const t = (i: number) => bars[i].time;
  type Point = { time: number; value: number; color: string };
  const iterPlots: Point[][] = Array.from({ length: ITERATIONS.length + 1 }, () => []);
  const stdPlot: Point[] = [];
  const aStDev: number[] = [];
  const iterColor = (v: number) => (ge(v, 0) ? cfg.uC : cfg.dC);
  for (let i = 0; i < n; i++) {
    const v: number[] = [mapeq[i]];
    for (let k = 0; k < 29; k++) v.push(iterate(i, k));
    const val = iterate(i, 29);
    const shown = (x: number) => (cfg.d || !Number.isFinite(x) ? NaN : x);
    iterPlots[0].push({ time: t(i), value: shown(val), color: iterColor(val) });
    ITERATIONS.forEach(([e], k) => iterPlots[k + 1].push({ time: t(i), value: shown(v[e]), color: iterColor(v[e]) }));
    // array.remove(v, 0); aStDev = math.sign(array.avg(v)) * array.stdev(v)
    array.remove(v, 0);
    const avg = array.avg(v);
    const sd = Math.sign(avg) * array.stdev(v);
    aStDev.push(sd);
    stdPlot.push({ time: t(i), value: Number.isFinite(sd) ? sd : NaN, color: ge(avg, 0) ? '#26c6da' : '#ffa726' });
  }

  // longAlertCondition / shortAlertCondition: ta.crossover / ta.crossunder(aStDev, 0)
  const sdS = Series.fromArray(bars, aStDev);
  const longAlert = ta.crossover(sdS, 0).toArray().map(Boolean);
  const shortAlert = ta.crossunder(sdS, 0).toArray().map(Boolean);
  const hist = (x: boolean[], k: number, i: number) => (i - k >= 0 ? x[i - k] : false);

  // ── Backtest framework ──
  resetDrawings({ label: 500 });
  const now = nowOf(chart);
  const mintick = mintickOf(chart);
  const ms = (time: number) => (time >= 1e12 ? time : time * 1000);
  const period = chartTimeframe(bars, chart);
  const stopLoss = cfg.stopLoss / 100;
  const canLong = cfg.tradeMode !== 'Short Only';
  const canShort = cfg.tradeMode !== 'Long Only';
  const fmt2 = (x: number) => str.tostring(x, '#.##');

  let dir = 0;
  let entry = 0;
  let exit = 0;
  let cap = cfg.dasCapital;
  let trades = 0;
  let winL = 0;
  let lossL = 0;
  let winS = 0;
  let lossS = 0;
  const wLabel = varDrawing<Label>();
  let wLabelPrev: Label | undefined;
  const statLbl = varDrawing<Label>();
  let years = NaN;
  let startPrev = false;

  const exitPlot: Point[] = [];
  const bgColors: BgColorData[] = [];
  const logo = varDrawing<ReturnType<typeof table.new>>();
  const logo2 = varDrawing<ReturnType<typeof table.new>>();

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const startBckTst = ms(b.time) > now - cfg.lenBckTst * YEAR;

    const fOpen = (d: number, lbl: boolean) => {
      entry = b.open;
      dir = d;
      trades += 1;
      if (lbl) {
        label.new(i, d === 1 ? b.low : b.high, d === 1 ? 'L' : 'S', 'bar_index', 'price', d === 1 ? TEAL : RED,
          d === 1 ? 'label_up' : 'label_down', '#FFFFFF', 'tiny', undefined,
          'Direction .... : ' + (d === 1 ? 'Long' : 'Short') + '\n'
          + 'Entry price .. : ' + str.tostring(b.open) + '\n'
          + 'Capital ...... : ' + fmt2(cap), undefined, true);
      }
    };
    const fClose = (isSL: boolean, lbl: boolean) => {
      const d = dir;
      const ep = entry;
      const xp = isSL ? b.close : b.open;
      exit = xp;
      const entrySafe = Math.max(ep, mintick);
      const exitSafe = Math.max(xp, mintick);
      const pnl = d === 1 ? exitSafe / entrySafe : entrySafe / exitSafe;
      const newCap = cap * pnl;
      const profit = gt(pnl, 1);
      cap = newCap;
      if (d === 1) {
        winL += profit ? 1 : 0;
        lossL += profit ? 0 : 1;
      } else {
        winS += profit ? 1 : 0;
        lossS += profit ? 0 : 1;
      }
      if (lbl) {
        label.new(i, d === 1 ? b.high : b.low, isSL ? 'SL' : 'TP', 'bar_index', 'price', profit ? TEAL : RED,
          d === 1 ? 'label_down' : 'label_up', '#FFFFFF', 'tiny', undefined,
          'Exit type .... : ' + (isSL ? 'Stop Loss' : 'Take Profit') + '\n'
          + 'Direction .... : ' + (d === 1 ? 'Long' : 'Short') + '\n'
          + 'Entry / Exit . : ' + str.tostring(ep) + ' / ' + str.tostring(xp) + '\n'
          + 'Change ....... : ' + fmt2((pnl - 1) * 100) + '%\n'
          + 'Capital ...... : ' + fmt2(newCap), undefined, true);
      }
      dir = 0;
    };

    if (cfg.isBackTest) {
      const sigL = cfg.isTest ? hist(longAlert, 1, i) : hist(longAlert, 2, i);
      const sigS = cfg.isTest ? hist(shortAlert, 1, i) : hist(shortAlert, 2, i);
      const candleRef = cfg.isTest ? 0 : 1;
      const conflict = hist(longAlert, candleRef, i) && hist(shortAlert, candleRef, i);
      const ref = i - candleRef >= 0 ? bars[i - candleRef] : null;
      const okL = (!cfg.useCandleL || (ref !== null && gt(ref.close, ref.open))) && (!cfg.isSudden || !conflict);
      const okS = (!cfg.useCandleS || (ref !== null && lt(ref.close, ref.open))) && (!cfg.isSudden || !conflict);
      const longCond = sigL && okL;
      const shortCond = sigS && okS;
      const slL = cfg.isStopLoss && dir === 1 && le(b.low, entry * (1 - stopLoss));
      const slS = cfg.isStopLoss && dir === -1 && ge(b.high, entry * (1 + stopLoss));
      const slHit = slL || slS;

      if (startBckTst) {
        let reversed = false;
        if (cfg.reverseOnSignal && cfg.tradeMode === 'Both') {
          if (dir === 1 && shortCond) {
            fClose(false, cfg.lblInOutSL);
            if (canShort) fOpen(-1, cfg.lblInOutSL);
            reversed = true;
          } else if (dir === -1 && longCond) {
            fClose(false, cfg.lblInOutSL);
            if (canLong) fOpen(1, cfg.lblInOutSL);
            reversed = true;
          }
        }
        if (!reversed) {
          const exitL = dir === 1 && (shortCond || slHit);
          const exitS = dir === -1 && (longCond || slHit);
          if (exitL || exitS) fClose(slHit, cfg.lblInOutSL);
        }
        if (dir === 0) {
          if (longCond && canLong) fOpen(1, cfg.lblInOutSL);
          if (shortCond && canShort) fOpen(-1, cfg.lblInOutSL);
        }
      }

      // early warnings: the label of the bar before is deleted on every bar after the first
      if (cfg.lblWarnings) {
        if (canLong && dir !== 1 && hist(longAlert, 1, i) && !shortAlert[i]) {
          wLabel.value = label.new(i, b.low, '⚠️', 'bar_index', 'price', TEAL, 'none', '#FFFFFF', 'large', undefined,
            'Probable long entry — awaiting confirmation\nIf confirmed, trade executes at next bar open.', undefined, true);
          if (wLabelPrev) label.delete(wLabelPrev);
        }
        if (canShort && dir !== -1 && hist(shortAlert, 1, i) && !longAlert[i]) {
          wLabel.value = label.new(i, b.high, '⚠️', 'bar_index', 'price', RED, 'none', '#FFFFFF', 'large', undefined,
            'Probable short entry — awaiting confirmation\nIf confirmed, trade executes at next bar open.', undefined, true);
          if (wLabelPrev) label.delete(wLabelPrev);
        }
        // bool(ta.change(time)): na on the first bar, then true
        if (i > 0 && wLabelPrev) label.delete(wLabelPrev);
      }

      if (cfg.lblTrdStat) {
        if (i === 0) years = (now - ms(b.time)) / YEAR;
        const totalTrades = trades;
        const totalWin = winL + winS;
        const totalLoss = lossL + lossS;
        const estimated = dir === 1 ? cap * (b.close / entry) : dir === -1 ? cap * (entry / b.close) : cap;
        const winRate = totalTrades > 0 ? totalWin / totalTrades * 100 : 0;
        const gainPct = (estimated / cfg.dasCapital - 1) * 100;
        const tradeDirTxt = dir === 1 ? 'Long' : dir === -1 ? 'Short' : 'Flat';
        const short = lt(years, cfg.lenBckTst);
        const perTxt = short
          ? fmt2(cfg.lenBckTst) + ' Yrs *** (' + str.tostring(i) + ' bars max)'
          : fmt2(cfg.lenBckTst) + ' Year(s)';
        const slTxt = cfg.isStopLoss
          ? str.tostring(stopLoss * 100, '#.#') + '% — level: '
            + fmt2(dir === 1 ? entry * (1 - stopLoss) : dir === -1 ? entry * (1 + stopLoss) : 0)
          : 'Off';
        const sep = '\n═════════════════════════════════════';
        const txt = '☼☾ Trade Statistics | ' + period
          + ' | ' + perTxt + ' | Trade Mode : ' + cfg.tradeMode
          + sep
          + '\nWin Rate : ' + str.tostring(winRate, '#.#') + '%'
          + ' | Trades : ' + str.tostring(totalTrades)
          + '\nWin/Loss : ' + str.tostring(totalWin) + '/' + str.tostring(totalLoss)
          + ' | Long  W/L : ' + str.tostring(winL) + '/' + str.tostring(lossL)
          + ' | Short W/L : ' + str.tostring(winS) + '/' + str.tostring(lossS)
          + sep
          + '\nGain/Loss : ' + fmt2(gainPct) + '%'
          + ' | Initial/Final Capital : ' + fmt2(cfg.dasCapital) + '/' + fmt2(estimated)
          + sep
          + '\nStatus : ' + tradeDirTxt
          + (dir !== 0
            ? ' | Entry Price : ' + str.tostring(entry)
              + ' | Unrealized : ' + fmt2((estimated / cap - 1) * 100) + '%'
              + '\nStop Loss : ' + slTxt
            : '')
          + (short ? '\n*** max available history for this timeframe' : '');
        const statCol = gt(gainPct, 0) ? TEAL : lt(gainPct, 0) ? RED : GRAY;
        if (statLbl.value) label.delete(statLbl.value);
        statLbl.value = label.new(i + 5, b.close, txt, 'bar_index', 'price', statCol, 'label_left', '#FFFFFF', 'small',
          'left', undefined, undefined, true);
      }
      wLabelPrev = wLabel.value;
    }

    // bgcolor(isBackTest and startBckTst ? startBckTst != startBckTst[1] ? gray 90 : dir colour 92 : na : na)
    if (cfg.isBackTest && startBckTst) {
      const c = startBckTst !== startPrev ? String(color.new(GRAY, 90))
        : dir === 1 ? String(color.new(TEAL, 92)) : dir === -1 ? String(color.new(RED, 92)) : null;
      if (c) bgColors.push({ time: b.time, color: c });
    }
    startPrev = startBckTst;

    // plot(bt_dir() != 0 ? bt_entry() : bt_exit() > 0 ? bt_exit() : na, force_overlay = true)
    exitPlot.push({
      time: b.time,
      value: dir !== 0 ? entry : gt(exit, 0) ? exit : NaN,
      color: dir === 1 ? TEAL : dir === -1 ? RED : GRAY,
    });

    // var table logo / logo2 = table.new(position.bottom_right, 1, 1[, force_overlay = true]); cells on the last bar
    if (i === 0) {
      logo.value = table.new('bottom_right', 1, 1);
      logo2.value = table.new('bottom_right', 1, 1, undefined, undefined, undefined, undefined, undefined, true);
    }
    if (i === n - 1) {
      for (const tb of [logo.value, logo2.value]) {
        if (tb) table.cell(tb, 0, 0, '☼☾  ', undefined, undefined, TEAL, undefined, undefined, 'normal', undefined, 'SoleMare Analytics');
      }
    }
  }
  setDrawingBar(null);
  const drawn = drawingOutputs(bars);
  resetDrawings();

  const plots: Record<string, Point[]> = {};
  iterPlots.forEach((p, k) => {
    plots[`plot${k}`] = p;
  });
  plots.plot27 = stdPlot;
  plots.plot28 = exitPlot;

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    bgColors,
    labels: drawn.labels ?? [],
    tables: drawn.tables ?? [],
  };
}

export const LogisticRsiStochRocAoByDgt = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
