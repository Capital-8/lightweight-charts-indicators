/**
 * HalfTrend Long/Short Signal Engine
 *
 * HalfTrend line: the trend turns down when the SMA of the highs (amplitude bars) is below the highest low since the
 * last turn and the close is below the low of the bar before; it turns up when the SMA of the lows is above the
 * lowest high and the close is above the high of the bar before. The line is the highest low (up trend) or the lowest
 * high (down trend); two bands at the line +- deviation * ATR(100) / 2.
 * - LONG / SHORT labels on the bars where the trend turns (closed bars only).
 * - Each signal opens a trade: stop loss at close -+ base risk * ATR(100) / 2, three targets at 1x, 2x and 3x that
 *   distance. A target hit counts a win and draws a check mark label ("✓1".."✓3"); the stop counts a loss (a stop
 *   after the first target cancels that win and the loss). Plots of the stop, the entry and the targets with four
 *   gradient fills.
 * - Performance table (win rate, target ratio, current trade) and a multi-asset table with the HalfTrend direction of
 *   five other symbols on the chart timeframe.
 *
 * Other symbols: the bars of the five symbols come from the `bars` accessor of the chart context (`requiredSymbols`
 * lists them); without them `calculate` throws a `MissingSymbolDataError`. The HalfTrend is computed on the bars of
 * each symbol, then aligned with the chart bars as `request.security` does.
 * The cell border colour of the tables is the chart background colour of the context (fallback: dark theme).
 *
 * Reference: "HalfTrend Long/Short Signal Engine [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga. Credit to everget for the original HalfTrend logic.
 */

import {
  ta, Series, color, str, label, resetDrawings, setDrawingBar, timeframe,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData, LabelData, TableData, TableCellData } from '../types';
import type { ChartContext, SymbolRequest } from '../chart-context';
import { backgroundColorOf, lastBarConfirmedOf, symbolBarsOf } from '../chart-context';
import { chartTimeframe } from '../anchor-period';
import { securityOther } from '../other-symbol';

export interface HalftrendLongShortSignalEngineInputs {
  amplitude: number;
  channelDeviation: number;
  /** Base Risk: stop distance and first target distance, in ATR(100) / 2 */
  baseRiskMult: number;
  sym1: string;
  sym2: string;
  sym3: string;
  sym4: string;
  sym5: string;
  /** Channel Deviation Transparency */
  channelDeviationUp: number;
  colorBull: string;
  colorBear: string;
  colorEntry: string;
  colorTP: string;
  colorSL: string;
  colorFillTP: string;
  colorFillSL: string;
  colorText: string;
  colorDashBg: string;
  colorDashHd: string;
  colorWin: string;
  colorLoss: string;
}

export const defaultInputs: HalftrendLongShortSignalEngineInputs = {
  amplitude: 20,
  channelDeviation: 2.0,
  baseRiskMult: 3,
  sym1: 'BINANCE:BTCUSD',
  sym2: 'BINANCE:ETHUSD',
  sym3: 'BINANCE:SOLUSD',
  sym4: 'OANDA:EURUSD',
  sym5: 'OANDA:XAUUSD',
  channelDeviationUp: 70,
  colorBull: '#00E676',
  colorBear: '#F23645',
  colorEntry: '#FFFFFF',
  colorTP: '#089981',
  colorSL: '#F23645',
  colorFillTP: '#08998133',
  colorFillSL: '#F2364566',
  colorText: '#FFFFFF',
  colorDashBg: '#363A45CC',
  colorDashHd: '#787B8699',
  colorWin: '#4CAF50',
  colorLoss: '#FF9800',
};

const HT = 'HalfTrend Settings';
const RISK = 'Risk Management';
const DASH = 'Multi-Asset Scanner';
const STYLE = 'Style & Colors';

export const inputConfig: InputConfig[] = [
  { id: 'amplitude', type: 'int', title: 'Amplitude', defval: 20, min: 1, group: HT,
    tooltip: 'Determines the lookback period for highest highs and lowest lows used in the trend calculation.' },
  { id: 'channelDeviation', type: 'float', title: 'Channel Deviation', defval: 2.0, min: 0.1, step: 0.1, group: HT,
    tooltip: 'Multiplier for the Average True Range (ATR) to establish the upper and lower channel bands.' },
  { id: 'baseRiskMult', type: 'float', title: 'Base Risk', defval: 3, step: 0.1, group: RISK,
    tooltip: 'Sets SL distance from HalfTrend line, and TP1 distance from entry. TP2 is 2x, TP3 is 3x.' },
  { id: 'sym1', type: 'string', title: 'Symbol 1', defval: 'BINANCE:BTCUSD', group: DASH, tooltip: 'First symbol tracked in the multi-asset dashboard.' },
  { id: 'sym2', type: 'string', title: 'Symbol 2', defval: 'BINANCE:ETHUSD', group: DASH, tooltip: 'Second symbol tracked in the multi-asset dashboard.' },
  { id: 'sym3', type: 'string', title: 'Symbol 3', defval: 'BINANCE:SOLUSD', group: DASH, tooltip: 'Third symbol tracked in the multi-asset dashboard.' },
  { id: 'sym4', type: 'string', title: 'Symbol 4', defval: 'OANDA:EURUSD', group: DASH, tooltip: 'Fourth symbol tracked in the multi-asset dashboard.' },
  { id: 'sym5', type: 'string', title: 'Symbol 5', defval: 'OANDA:XAUUSD', group: DASH, tooltip: 'Fifth symbol tracked in the multi-asset dashboard.' },
  { id: 'channelDeviationUp', type: 'int', title: 'Channel Deviation Transparency', defval: 70, min: 0, max: 100, group: STYLE },
  { id: 'colorBull', type: 'color', title: 'Bullish', defval: '#00E676', inline: 'trend', group: STYLE },
  { id: 'colorBear', type: 'color', title: 'Bearish', defval: '#F23645', inline: 'trend', group: STYLE,
    tooltip: 'Primary color for bullish trends, target lines, and dashboard highlights.\nPrimary color for bearish trends and channel bands.' },
  { id: 'colorEntry', type: 'color', title: 'Entry', defval: '#FFFFFF', inline: 'trade', group: STYLE },
  { id: 'colorTP', type: 'color', title: 'Take Profit', defval: '#089981', inline: 'trade', group: STYLE },
  { id: 'colorSL', type: 'color', title: 'Stop Loss', defval: '#F23645', inline: 'trade', group: STYLE,
    tooltip: 'Color used to mark the active trade entry price.\nColor used for the Take Profit target lines.\nColor used for stop loss lines and short trade text.' },
  { id: 'colorFillTP', type: 'color', title: 'TP Fill', defval: '#08998133', inline: 'fills', group: STYLE },
  { id: 'colorFillSL', type: 'color', title: 'SL Fill', defval: '#F2364566', inline: 'fills', group: STYLE,
    tooltip: 'Base color for the Take Profit zone gradient fills.\nBase color for the Stop Loss zone gradient fills.' },
  { id: 'colorText', type: 'color', title: 'Text Color', defval: '#FFFFFF', group: STYLE, tooltip: 'Base color for labels and dashboard text.' },
  { id: 'colorDashBg', type: 'color', title: 'Dashboard Background', defval: '#363A45CC', group: STYLE, tooltip: 'Background color for the dashboard tables.' },
  { id: 'colorDashHd', type: 'color', title: 'Dashboard Header', defval: '#787B8699', group: STYLE, tooltip: 'Background color for the header rows in the dashboards.' },
  { id: 'colorWin', type: 'color', title: 'Win Rate High Color', defval: '#4CAF50', group: STYLE, tooltip: 'Text color when the win rate is 50% or above.' },
  { id: 'colorLoss', type: 'color', title: 'Win Rate Low Color', defval: '#FF9800', group: STYLE, tooltip: 'Text color when the win rate falls below 50%.' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HalfTrend', color: '#00E676', lineWidth: 3 },
  { id: 'plot1', title: 'ATR High Band', color: '#F236454D', lineWidth: 1 },
  { id: 'plot2', title: 'ATR Low Band', color: '#00E6764D', lineWidth: 1 },
  { id: 'plot3', title: 'Bull SL', color: '#F2364599', lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Bear SL', color: '#F2364599', lineWidth: 1, style: 'linebr' },
  { id: 'plot5', title: 'Trade Entry', color: '#FFFFFF', lineWidth: 1, style: 'linebr' },
  { id: 'plot6', title: 'Bull TP1', color: '#089981B3', lineWidth: 1, style: 'linebr' },
  { id: 'plot7', title: 'Bull TP2', color: '#089981D9', lineWidth: 1, style: 'linebr' },
  { id: 'plot8', title: 'Bull TP3', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot9', title: 'Bear TP1', color: '#089981B3', lineWidth: 1, style: 'linebr' },
  { id: 'plot10', title: 'Bear TP2', color: '#089981D9', lineWidth: 1, style: 'linebr' },
  { id: 'plot11', title: 'Bear TP3', color: '#089981', lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'HalfTrend Long/Short Signal Engine [BigBeluga]',
  shortTitle: 'HalfTrend Long/Short Signal Engine [BigBeluga]',
  overlay: true,
};

/** indicator(max_labels_count = 500) */
const MAX_LABELS = 500;

/** Pine float comparisons within 1e-10 */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

/** The HalfTrend state of each bar: trend (0 up, 1 down), line, ATR(100) / 2. */
interface HalfTrendSeries {
  trend: number[];
  line: number[];
  atr2: number[];
}

/** The HalfTrend engine of the script (also run on the bars of the other symbols, for `trend`). */
function halfTrend(bars: ReadonlyArray<Bar>, amplitude: number): HalfTrendSeries {
  const n = bars.length;
  const atr2 = ta.atr(bars as Bar[], 100).toArray().map((v) => (v ?? NaN) / 2);
  const highS = new Series(bars as Bar[], (b) => b.high);
  const lowS = new Series(bars as Bar[], (b) => b.low);
  const hb = ta.highestbars(highS, amplitude).toArray();
  const lb = ta.lowestbars(lowS, amplitude).toArray();
  const highma = ta.sma(highS, amplitude).toArray();
  const lowma = ta.sma(lowS, amplitude).toArray();

  const trendArr: number[] = new Array(n);
  const lineArr: number[] = new Array(n);
  let trend = 0;
  let nextTrend = 0;
  let maxLowPrice = n > 0 ? bars[0].low : NaN;
  let minHighPrice = n > 0 ? bars[0].high : NaN;
  let up = 0;
  let down = 0;

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // high[math.abs(ta.highestbars(high, amplitude))]: an na offset reads the current bar
    const ho = Math.abs(hb[i] ?? NaN);
    const lo = Math.abs(lb[i] ?? NaN);
    const highPrice = bars[i - (Number.isNaN(ho) ? 0 : ho)]?.high ?? NaN;
    const lowPrice = bars[i - (Number.isNaN(lo) ? 0 : lo)]?.low ?? NaN;
    const hma = highma[i] ?? NaN;
    const lma = lowma[i] ?? NaN;
    const prevTrend = i > 0 ? trend : NaN;

    if (nextTrend === 1) {
      maxLowPrice = Math.max(lowPrice, maxLowPrice);
      if (lt(hma, maxLowPrice) && lt(b.close, i > 0 ? bars[i - 1].low : b.low)) {
        trend = 1;
        nextTrend = 0;
        minHighPrice = highPrice;
      }
    } else {
      minHighPrice = Math.min(highPrice, minHighPrice);
      if (gt(lma, minHighPrice) && gt(b.close, i > 0 ? bars[i - 1].high : b.high)) {
        trend = 0;
        nextTrend = 1;
        maxLowPrice = lowPrice;
      }
    }

    // up[1] / down[1]: the values of the bar before (na on the first bar)
    const upPrev = i > 0 ? up : NaN;
    const downPrev = i > 0 ? down : NaN;
    if (trend === 0) {
      if (!Number.isNaN(prevTrend) && prevTrend !== 0) up = Number.isNaN(downPrev) ? down : downPrev;
      else up = Number.isNaN(upPrev) ? maxLowPrice : Math.max(maxLowPrice, upPrev);
    } else if (!Number.isNaN(prevTrend) && prevTrend !== 1) {
      down = Number.isNaN(upPrev) ? up : upPrev;
    } else {
      down = Number.isNaN(downPrev) ? minHighPrice : Math.min(minHighPrice, downPrev);
    }
    trendArr[i] = trend;
    lineArr[i] = trend === 0 ? up : down;
  }
  return { trend: trendArr, line: lineArr, atr2 };
}

/** The symbols of the multi-asset table (input.symbol), once each. */
function symbolsOf(cfg: HalftrendLongShortSignalEngineInputs): string[] {
  return [...new Set([cfg.sym1, cfg.sym2, cfg.sym3, cfg.sym4, cfg.sym5])];
}

/**
 * Bars of other symbols the inputs need: the five symbols of the multi-asset table on the chart timeframe
 * (`chart.timeframe`; an empty timeframe when the context does not give it: `calculate` then asks for the timeframe
 * of the bars in its `MissingSymbolDataError`).
 */
export function requiredSymbols(
  inputs: Partial<HalftrendLongShortSignalEngineInputs> = {},
  chart?: ChartContext,
): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  const tf = chart?.timeframe ? timeframe.info(chart.timeframe).period : '';
  return symbolsOf(cfg).map((symbol) => ({ symbol, timeframe: tf }));
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HalftrendLongShortSignalEngineInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // request.security(symN, timeframe.period, trend): all the bars first (one error lists every missing symbol)
  const tf = chartTimeframe(bars, chart);
  const symbols = symbolsOf(cfg);
  const otherBars = symbolBarsOf(symbols.map((symbol) => ({ symbol, timeframe: tf })), chart);
  const otherTrend = new Map<string, number>();
  symbols.forEach((symbol, k) => {
    const index = securityOther(bars, otherBars[k], tf, { symbol }, chart);
    const trend = halfTrend(otherBars[k], cfg.amplitude).trend;
    const j = n > 0 ? index[n - 1] : -1;
    otherTrend.set(symbol, j < 0 ? NaN : trend[j]);
  });

  const { trend, line: htLine, atr2 } = halfTrend(bars, cfg.amplitude);
  const lastConfirmed = lastBarConfirmedOf(chart);

  const bearBand = String(color.new(cfg.colorBear, cfg.channelDeviationUp));
  const bullBand = String(color.new(cfg.colorBull, cfg.channelDeviationUp));
  const slColor = String(color.new(cfg.colorSL, 40));
  const entryColor = String(color.new(cfg.colorEntry, 0));
  const tp1Color = String(color.new(cfg.colorTP, 30));
  const tp2Color = String(color.new(cfg.colorTP, 15));
  const tp3Color = String(color.new(cfg.colorTP, 0));
  const fillTP = String(cfg.colorFillTP);
  const fillTP95 = String(color.new(cfg.colorFillTP, 95));
  const fillSL = String(cfg.colorFillSL);
  const fillSL95 = String(color.new(cfg.colorFillSL, 95));

  const plotKeys = ['plot0', 'plot1', 'plot2', 'plot3', 'plot4', 'plot5', 'plot6', 'plot7', 'plot8', 'plot9', 'plot10', 'plot11'];
  const series: Record<string, Array<{ time: number; value: number; color?: string }>> = {};
  for (const k of plotKeys) series[k] = [];
  const markers: MarkerData[] = [];
  const slArr: number[] = [];
  const entryArr: number[] = [];
  const tp3Arr: number[] = [];

  let activeSL = NaN;
  let activeTP1 = NaN;
  let activeTP2 = NaN;
  let activeTP3 = NaN;
  let tradeState = 0;
  let entryPx = NaN;
  let wins = 0;
  let losses = 0;
  let longTPHit1 = false;
  let shortTPHit1 = false;
  let count = 0;
  let currentDistPct = 0;

  resetDrawings({ label: MAX_LABELS });

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = trend[i];
    const prev = i > 0 ? trend[i - 1] : NaN;
    const confirmed = i < n - 1 || lastConfirmed;
    const a2 = atr2[i];
    const dev = cfg.channelDeviation * a2;
    const buySignal = t === 0 && prev === 1 && confirmed;
    const sellSignal = t === 1 && prev === 0 && confirmed;

    let longTPHit = false;
    let shortTPHit = false;
    if (tradeState === 1) {
      if (!Number.isNaN(activeSL)) {
        if (ge(b.high, activeTP1)) {
          wins += 1;
          activeTP1 = NaN;
          longTPHit = true;
          longTPHit1 = true;
        } else if (ge(b.high, activeTP2)) {
          wins += 1;
          activeTP2 = NaN;
          longTPHit = true;
        } else if (ge(b.high, activeTP3)) {
          wins += 1;
          activeTP3 = NaN;
          longTPHit = true;
          tradeState = 0;
          activeSL = NaN;
        }
      }
      if (le(b.low, activeSL)) {
        losses += 1;
        tradeState = 0;
        activeSL = NaN;
        if (longTPHit1) {
          wins -= 1;
          losses -= 1;
        }
      }
    } else if (tradeState === -1) {
      if (!Number.isNaN(activeSL)) {
        if (le(b.low, activeTP1)) {
          wins += 1;
          activeTP1 = NaN;
          shortTPHit = true;
          shortTPHit1 = true;
        } else if (le(b.low, activeTP2)) {
          wins += 1;
          activeTP2 = NaN;
          shortTPHit = true;
        } else if (le(b.low, activeTP3)) {
          wins += 1;
          activeTP3 = NaN;
          shortTPHit = true;
          tradeState = 0;
          activeSL = NaN;
        }
      }
      if (ge(b.high, activeSL)) {
        losses += 1;
        tradeState = 0;
        activeSL = NaN;
        if (shortTPHit1) {
          wins -= 1;
          losses -= 1;
        }
      }
    }

    if (buySignal) {
      longTPHit1 = false;
      const dist = a2 * cfg.baseRiskMult;
      activeSL = b.close - dist;
      activeTP1 = b.close + dist;
      activeTP2 = b.close + dist * 2;
      activeTP3 = b.close + dist * 3;
      tradeState = 1;
      entryPx = b.close;
    } else if (sellSignal) {
      shortTPHit1 = false;
      const dist = a2 * cfg.baseRiskMult;
      activeSL = b.close + dist;
      activeTP1 = b.close - dist;
      activeTP2 = b.close - dist * 2;
      activeTP3 = b.close - dist * 3;
      tradeState = -1;
      entryPx = b.close;
    }

    currentDistPct = 0;
    if (tradeState === 1) currentDistPct = ((b.close - entryPx) / entryPx) * 100;
    else if (tradeState === -1) currentDistPct = ((entryPx - b.close) / entryPx) * 100;

    // plots
    const time = b.time;
    const push = (k: string, value: number, css: string) => {
      series[k].push({ time, value: Number.isFinite(value) ? value : NaN, color: css });
    };
    push('plot0', htLine[i], t === 0 ? cfg.colorBull : cfg.colorBear);
    push('plot1', htLine[i] + dev, bearBand);
    push('plot2', htLine[i] - dev, bullBand);
    const open = tradeState !== 0;
    const slOk = !Number.isNaN(activeSL);
    const tp3Ok = !Number.isNaN(activeTP3);
    push('plot3', t === 0 && open && tp3Ok ? activeSL : NaN, slColor);
    push('plot4', t === 1 && open && tp3Ok ? activeSL : NaN, slColor);
    push('plot5', open && tp3Ok && slOk ? entryPx : NaN, entryColor);
    push('plot6', t === 0 && open && slOk ? activeTP1 : NaN, tp1Color);
    push('plot7', t === 0 && open && slOk ? activeTP2 : NaN, tp2Color);
    push('plot8', t === 0 && open && slOk ? activeTP3 : NaN, tp3Color);
    push('plot9', t === 1 && open && slOk ? activeTP1 : NaN, tp1Color);
    push('plot10', t === 1 && open && slOk ? activeTP2 : NaN, tp2Color);
    push('plot11', t === 1 && open && slOk ? activeTP3 : NaN, tp3Color);
    slArr.push(activeSL);
    entryArr.push(entryPx);
    tp3Arr.push(activeTP3);

    if (buySignal) {
      markers.push({ time, position: 'belowBar', shape: 'labelUp', color: cfg.colorBull, text: 'LONG', textColor: cfg.colorText, size: 'normal' });
    }
    if (sellSignal) {
      markers.push({ time, position: 'aboveBar', shape: 'labelDown', color: cfg.colorBear, text: 'SHORT', textColor: cfg.colorText, size: 'normal' });
    }

    // target hit labels
    if (i > 0 && t !== prev) count = 0;
    if (longTPHit) {
      count += 1;
      label.new(i, b.high, '✓' + str.tostring(count), 'bar_index', 'price', 'transparent', 'label_down', cfg.colorTP);
      if (count === 3) count = 0;
    }
    if (shortTPHit) {
      count += 1;
      label.new(i, b.low, '✓' + str.tostring(count), 'bar_index', 'price', 'transparent', 'label_up', cfg.colorTP);
      if (count === 3) count = 0;
    }
  }
  setDrawingBar(null);

  // dashboards (barstate.islast)
  const tables: TableData[] = [];
  if (n > 0) {
    const border = backgroundColorOf(chart);
    const cell = (column: number, row: number, text: string, textColor: string, extra: Partial<TableCellData> = {}): TableCellData => ({
      column, row, text, textColor, textSize: 'normal', ...extra,
    });
    const totalTrades = wins + losses;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0.0;
    const tradeTxt = tradeState === 1 ? 'LONG' : tradeState === -1 ? 'SHORT' : 'NONE';
    const tradeCol = tradeState === 1 ? cfg.colorBull : tradeState === -1 ? cfg.colorSL : cfg.colorText;
    const distTxt = tradeState !== 0 ? ' (' + (gt(currentDistPct, 0) ? '+' : '') + str.tostring(currentDistPct, '#.##') + '%)' : '';
    tables.push({
      position: 'bottom_right', columns: 2, rows: 5, bgColor: cfg.colorDashBg, borderColor: border, borderWidth: 2,
      cells: [
        cell(0, 0, 'PERFORMANCE', cfg.colorText, { bgColor: cfg.colorDashHd, textHAlign: 'left' }),
        cell(1, 0, 'DATA', cfg.colorText, { bgColor: cfg.colorDashHd }),
        cell(0, 1, 'Win Rate', cfg.colorText, { textHAlign: 'left' }),
        cell(1, 1, str.tostring(winRate, '#.##') + '% (' + str.tostring(wins) + 'W | ' + str.tostring(losses) + 'L)',
          ge(winRate, 50) ? cfg.colorWin : cfg.colorLoss, { tooltip: 'Win Rate (Wins/ Losses)' }),
        cell(0, 2, 'Target R:R', cfg.colorText, { textHAlign: 'left' }),
        cell(1, 2, '1 : 3', cfg.colorText),
        cell(0, 4, 'Current Trade', cfg.colorText, { textHAlign: 'left' }),
        cell(1, 4, tradeTxt + distTxt, tradeCol, { bgColor: String(color.new(tradeCol, 85)) }),
      ],
    });
    const rows = [cfg.sym1, cfg.sym2, cfg.sym3, cfg.sym4, cfg.sym5].flatMap((symbol, k) => {
      const long = otherTrend.get(symbol) === 0;
      return [
        cell(0, k + 1, symbol, cfg.colorText, { textHAlign: 'left' }),
        cell(1, k + 1, long ? 'LONG' : 'SHORT', long ? cfg.colorBull : cfg.colorSL,
          { bgColor: String(long ? color.new(cfg.colorBull, 85) : color.new(cfg.colorBear, 85)) }),
      ];
    });
    tables.push({
      position: 'top_right', columns: 2, rows: 6, bgColor: cfg.colorDashBg, borderColor: border, borderWidth: 2,
      cells: [
        cell(0, 0, 'MULTI-ASSET', cfg.colorText, { bgColor: cfg.colorDashHd, textHAlign: 'left' }),
        cell(1, 0, 'TRADE', cfg.colorText, { bgColor: cfg.colorDashHd }),
        ...rows,
      ],
    });
  }

  const T = (x: number) => bars[x].time;
  const gradient = (top: number[], bottom: number[], topColor: string, bottomColor: string) => ({
    topValue: top, bottomValue: bottom, topColor: bars.map(() => topColor), bottomColor: bars.map(() => bottomColor),
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: series,
    fills: [
      { plot1: 'plot8', plot2: 'plot5', options: { title: 'Bull TP Gradient' }, gradient: gradient(tp3Arr, entryArr, fillTP, fillTP95) },
      { plot1: 'plot5', plot2: 'plot3', options: { title: 'Bull SL Gradient' }, gradient: gradient(entryArr, slArr, fillSL95, fillSL) },
      { plot1: 'plot5', plot2: 'plot11', options: { title: 'Bear TP Gradient' }, gradient: gradient(entryArr, tp3Arr, fillTP95, fillTP) },
      { plot1: 'plot4', plot2: 'plot5', options: { title: 'Bear SL Gradient' }, gradient: gradient(slArr, entryArr, fillSL, fillSL95) },
    ],
    markers,
    labels: label.all().map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: 'transparent', textColor: String(l.textcolor),
      style: l.style as 'label_down' | 'label_up', size: 'normal' as const,
    })),
    tables,
  };
}

export const HalftrendLongShortSignalEngine = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
