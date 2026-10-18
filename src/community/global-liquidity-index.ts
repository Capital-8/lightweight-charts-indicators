/**
 * Global Liquidity Index
 *
 * Sum (in trillions of US dollars) of central bank balance sheets (Fed minus reverse repo and Treasury account, ECB,
 * PBC, BOJ and 11 other central banks) and M2 money supplies (USA, Europe, China, Japan and 14 others), each a daily
 * series of another symbol; the groups can be switched off (0). The line is the SMA of the total (length 0 = the
 * total) or, with a ROC length, the SMA of its rate of change, with an offset in bars. A table on the last bar gives:
 * the trend of a fast and a slow moving average of the total, the smoothed change of the total over the change
 * period in %, whether the chart symbol leads or lags the total (z-scores of their changes), the correlations of
 * price and line over 1, 3, 6, 12 and 36 months (21 bars a month, 30 on crypto), the beta of the chart symbol
 * against the total, and the offset in -150..150 (by 10 bars) with the best correlation of the two SMAs.
 *
 * Other symbols: the bars of the economic series (ECONOMICS:..., FRED:...) and of the exchange rates (FX_IDC:...)
 * come from the `bars` accessor of the chart context on "D" (`requiredSymbols` lists them). A spread "<series> *
 * <currency in USD>" is built as the reference platform does it: one bar per trading day of either part (from the
 * later first bar of the two), with the last close of each part at or before that day; its "currency = USD" changes
 * nothing (measured), and the four single series are in US dollars. The trading day of an FX_IDC rate starts at
 * 22:00 UTC the day before: it comes from the time zone and session of each symbol (`symbolInfo` of the context);
 * without them a bar that opens at 12:00 UTC or later belongs to the next UTC day. Without the bars the port throws
 * a MissingSymbolDataError. `syminfo.type` comes from the context (`chart.symbolType`, crypto: 30 bars a month).
 *
 * Alerts (alertcondition, `alerts` of the result): the trend turning bullish / bearish (fast and slow moving averages of
 * the total) and the chart symbol starting to lead / lag the total (tracking >= 0 / < 0), on the bar of the change.
 *
 * Limit of the port: the line is drawn on the price scale of the chart (the original uses the left scale).
 *
 * Reference: "Global Liquidity Index" by QuantitativeAlpha
 * Original notice: © QuantitativeAlpha
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, Series, barInterval, barTime,
  type Bar, type IndicatorResult, type InputConfig, type PlotConfig,
} from 'oakscriptjs';
import type { TableCellData, TableData, TablePosition } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { symbolBarsOf, symbolTypeOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { otherSymbolChart, securityOtherValues, spreadBars, spreadOptions, spreadSymbols } from '../other-symbol';

type TrendType = 'EMA' | 'SMA' | 'RMA' | 'WMA';
type BetaLength = '3M' | '6M' | '9M' | '1Y' | '3Y' | '5Y';
type CorrLength = '1M' | '3M' | '6M' | '9M' | '1Y' | '2Y' | '3Y' | '5Y';

export interface GlobalLiquidityIndexInputs {
  fedActive: boolean;
  tgaActive: boolean;
  rrpActive: boolean;
  ecbActive: boolean;
  pbcActive: boolean;
  bojActive: boolean;
  otherActive: boolean;
  usaActive: boolean;
  europeActive: boolean;
  chinaActive: boolean;
  japanActive: boolean;
  otherM2Active: boolean;
  smaInputRaw: number;
  rocInput: number;
  offsetInput: number;
  strategyType: TrendType;
  fastLength: number;
  slowLength: number;
  changeLength: number;
  changeSma: number;
  betaInput: BetaLength;
  maxOffset: number;
  minOffset: number;
  corrInput: CorrLength;
  r2ThresholdInput: number;
  widthInput: number;
  tableInput: 'High' | 'Middle' | 'Low';
}

export const defaultInputs: GlobalLiquidityIndexInputs = {
  fedActive: true,
  tgaActive: true,
  rrpActive: true,
  ecbActive: true,
  pbcActive: true,
  bojActive: true,
  otherActive: true,
  usaActive: true,
  europeActive: true,
  chinaActive: true,
  japanActive: true,
  otherM2Active: true,
  smaInputRaw: 0,
  rocInput: 0,
  offsetInput: 0,
  strategyType: 'EMA',
  fastLength: 30,
  slowLength: 60,
  changeLength: 30,
  changeSma: 10,
  betaInput: '1Y',
  maxOffset: 150,
  minOffset: -150,
  corrInput: '6M',
  r2ThresholdInput: 25.0,
  widthInput: 10,
  tableInput: 'Low',
};

export const inputConfig: InputConfig[] = [
  { id: 'fedActive', type: 'bool', title: 'FED Balance Sheet', defval: true },
  { id: 'tgaActive', type: 'bool', title: 'Treasury General Account', defval: true },
  { id: 'rrpActive', type: 'bool', title: 'Reverse Repo Facility', defval: true },
  { id: 'ecbActive', type: 'bool', title: 'ECB Balance Sheet', defval: true },
  { id: 'pbcActive', type: 'bool', title: 'PBC Balance Sheet', defval: true },
  { id: 'bojActive', type: 'bool', title: 'BOJ Balance Sheet', defval: true },
  { id: 'otherActive', type: 'bool', title: 'Other CB Balance Sheets', defval: true },
  { id: 'usaActive', type: 'bool', title: 'USA Money Supply', defval: true },
  { id: 'europeActive', type: 'bool', title: 'Europe Money Supply', defval: true },
  { id: 'chinaActive', type: 'bool', title: 'China Money Supply', defval: true },
  { id: 'japanActive', type: 'bool', title: 'Japan Money Supply', defval: true },
  { id: 'otherM2Active', type: 'bool', title: 'Other M2 Money Supplies', defval: true },
  { id: 'smaInputRaw', type: 'int', title: 'SMA Length', defval: 0, min: 0 },
  { id: 'rocInput', type: 'int', title: 'ROC Length', defval: 0, min: 0 },
  { id: 'offsetInput', type: 'int', title: 'Offset Bars', defval: 0 },
  { id: 'strategyType', type: 'string', title: 'Trend Type', defval: 'EMA', options: ['EMA', 'SMA', 'RMA', 'WMA'] },
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 30, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 60, min: 2 },
  { id: 'changeLength', type: 'int', title: 'Change Period', defval: 30, min: 1 },
  { id: 'changeSma', type: 'int', title: 'Change SMA', defval: 10, min: 1 },
  { id: 'betaInput', type: 'string', title: 'Beta Length', defval: '1Y', options: ['3M', '6M', '9M', '1Y', '3Y', '5Y'] },
  { id: 'maxOffset', type: 'int', title: 'Max Offset', defval: 150 },
  { id: 'minOffset', type: 'int', title: 'Min Offset', defval: -150 },
  {
    id: 'corrInput', type: 'string', title: 'Offset Corr', defval: '6M',
    options: ['1M', '3M', '6M', '9M', '1Y', '2Y', '3Y', '5Y'],
  },
  { id: 'r2ThresholdInput', type: 'float', title: 'R² Threshold', defval: 25.0, min: 0.0 },
  { id: 'widthInput', type: 'int', title: 'Table Width', defval: 10, min: 1 },
  { id: 'tableInput', type: 'string', title: 'Table Position', defval: 'Low', options: ['High', 'Middle', 'Low'] },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'GLI Line', color: '#FDD835', lineWidth: 2 },
];

export const metadata = {
  title: 'Global Liquidity Index',
  shortTitle: 'GLI',
  overlay: true,
};

type Group = keyof Pick<GlobalLiquidityIndexInputs, 'fedActive' | 'tgaActive' | 'rrpActive' | 'ecbActive' | 'pbcActive'
  | 'bojActive' | 'otherActive' | 'usaActive' | 'europeActive' | 'chinaActive' | 'japanActive' | 'otherM2Active'>;

/** The requests of the original in the order of its sum: input group, symbol expression, sign */
const SERIES: Array<[Group, string, 1 | -1]> = [
  ['fedActive', 'ECONOMICS:USCBBS', 1],
  ['rrpActive', 'FRED:RRPONTSYD', -1],
  ['tgaActive', 'FRED:WTREGEN', -1],
  ['bojActive', 'ECONOMICS:JPCBBS*FX_IDC:JPYUSD', 1],
  ['pbcActive', 'ECONOMICS:CNCBBS*FX_IDC:CNYUSD', 1],
  ['otherActive', 'ECONOMICS:GBCBBS*FX_IDC:GBPUSD', 1],
  ['ecbActive', 'ECONOMICS:EUCBBS*FX_IDC:EURUSD', 1],
  ['otherActive', 'ECONOMICS:INCBBS*FX_IDC:INRUSD', 1],
  ['otherActive', 'ECONOMICS:CACBBS*FX_IDC:CADUSD', 1],
  ['otherActive', 'ECONOMICS:AUCBBS*FX_IDC:AUDUSD', 1],
  ['otherActive', 'ECONOMICS:CHCBBS*FX_IDC:CHFUSD', 1],
  ['otherActive', 'ECONOMICS:RUCBBS*FX_IDC:RUBUSD', 1],
  ['otherActive', 'ECONOMICS:BRCBBS*FX_IDC:BRLUSD', 1],
  ['otherActive', 'ECONOMICS:KRCBBS*FX_IDC:KRWUSD', 1],
  ['otherActive', 'ECONOMICS:NZCBBS*FX_IDC:NZDUSD', 1],
  ['otherActive', 'ECONOMICS:SECBBS*FX_IDC:SEKUSD', 1],
  ['otherActive', 'ECONOMICS:MYCBBS*FX_IDC:MYRUSD', 1],
  ['usaActive', 'ECONOMICS:USM2', 1],
  ['europeActive', 'ECONOMICS:EUM2*FX_IDC:EURUSD', 1],
  ['chinaActive', 'ECONOMICS:CNM2*FX_IDC:CNYUSD', 1],
  ['japanActive', 'ECONOMICS:JPM2*FX_IDC:JPYUSD', 1],
  ['otherM2Active', 'ECONOMICS:GBM2*FX_IDC:GBPUSD', 1],
  ['otherM2Active', 'ECONOMICS:CAM2*FX_IDC:CADUSD', 1],
  ['otherM2Active', 'ECONOMICS:AUM3*FX_IDC:AUDUSD', 1],
  ['otherM2Active', 'ECONOMICS:INM2*FX_IDC:INRUSD', 1],
  ['otherM2Active', 'ECONOMICS:CHM2*FX_IDC:CHFUSD', 1],
  ['otherM2Active', 'ECONOMICS:RUM2*FX_IDC:RUBUSD', 1],
  ['otherM2Active', 'ECONOMICS:BRM2*FX_IDC:BRLUSD', 1],
  ['otherM2Active', 'ECONOMICS:KRM2*FX_IDC:KRWUSD', 1],
  ['otherM2Active', 'ECONOMICS:MXM2*FX_IDC:MXNUSD', 1],
  ['otherM2Active', 'ECONOMICS:IDM2*FX_IDC:IDRUSD', 1],
  ['otherM2Active', 'ECONOMICS:ZAM2*FX_IDC:ZARUSD', 1],
  ['otherM2Active', 'ECONOMICS:MYM2*FX_IDC:MYRUSD', 1],
  ['otherM2Active', 'ECONOMICS:SEM2*FX_IDC:SEKUSD', 1],
];

/** Timeframe of every request */
const TF = 'D';

/** Every symbol of the active series, once */
function symbolsOf(cfg: GlobalLiquidityIndexInputs): string[] {
  const out: string[] = [];
  for (const [group, expr] of SERIES) {
    if (!cfg[group]) continue;
    for (const s of spreadSymbols(expr)) if (!out.includes(s)) out.push(s);
  }
  return out;
}

/** Other symbols the inputs need: every symbol of the active series, on "D" */
export function requiredSymbols(inputs: Partial<GlobalLiquidityIndexInputs> = {}): SymbolRequest[] {
  return symbolsOf({ ...defaultInputs, ...inputs }).map((symbol) => ({ symbol, timeframe: TF }));
}

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;

const GREEN = '#4CAF50';
const RED = '#F23645';
const GRAY = '#787B86';
const WHITE = '#FFFFFF';
const BLACK = '#000000';

export function calculate(
  bars: Bar[], inputs: Partial<GlobalLiquidityIndexInputs> = {}, chart?: ChartContext,
): IndicatorResult & { tables: TableData[]; alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const {
    smaInputRaw, rocInput, offsetInput, strategyType, fastLength, slowLength, changeLength, changeSma, betaInput,
    maxOffset, minOffset, corrInput, r2ThresholdInput, widthInput, tableInput,
  } = cfg;
  const n = bars.length;
  const symbols = symbolsOf(cfg);
  const other = symbolBarsOf(symbols.map((symbol) => ({ symbol, timeframe: TF })), chart);
  const bySymbol = new Map(symbols.map((s, k) => [s, other[k]]));

  // request.security(expr, 'D', close, currency = currency.USD) of each active series (0 when off)
  const values = new Map<string, number[]>();
  const seriesOf = (expr: string): number[] => {
    let v = values.get(expr);
    if (v) return v;
    // a spread is built from its two tickers and trades around the clock on the UTC calendar
    const exprBars = spreadBars(expr, bySymbol, chart);
    v = securityOtherValues(bars, exprBars, TF, exprBars.map((x) => x.close), otherSymbolChart(bars, chart), spreadOptions(expr, chart));
    values.set(expr, v);
    return v;
  };
  const columns = SERIES.map(([group, expr, sign]) => ({ v: cfg[group] ? seriesOf(expr) : null, sign }));
  const total = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (const { v, sign } of columns) {
      const x = v ? v[i] : 0;
      s = sign > 0 ? s + x : s - x;
    }
    total[i] = s / 1000000000000;
  }

  const S = (arr: number[]) => Series.fromArray(bars, arr);
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const close = bars.map((b) => b.close);
  const smaInput = smaInputRaw === 0 ? 1 : smaInputRaw;
  const ma = (src: number[], length: number) => A(
    strategyType === 'SMA' ? ta.sma(S(src), length) : strategyType === 'WMA' ? ta.wma(S(src), length)
      : strategyType === 'RMA' ? ta.rma(S(src), length) : ta.ema(S(src), length),
  );
  const totalSma = A(ta.sma(S(total), smaInput));
  const rocSma = rocInput === 0 ? totalSma : A(ta.sma(ta.roc(S(total), rocInput), smaInput));
  const fast = ma(total, fastLength);
  const slow = ma(total, slowLength);
  const priceSma = A(ta.sma(S(close), smaInput));
  const rocPriceSma = rocInput === 0 ? priceSma : A(ta.sma(ta.roc(S(close), rocInput), smaInput));
  const hist = (arr: number[], i: number, k: number) => (i - k >= 0 ? arr[i - k] : NaN);
  const absOffset = Math.abs(offsetInput);
  const gliTable = rocSma.map((v, i) => (offsetInput > 0 ? hist(rocSma, i, absOffset) : v));
  const priceTable = rocPriceSma.map((v, i) => (offsetInput < 0 ? hist(rocPriceSma, i, absOffset) : v));
  const isCrypto = symbolTypeOf(chart) === 'crypto';
  const tradingDays = isCrypto ? 30 : 21;
  const gliDiff = total.map((v, i) => v - hist(total, i, changeLength));
  const assetDiff = close.map((v, i) => v - hist(close, i, changeLength));
  const gliChangeSmooth = A(ta.sma(S(gliDiff), changeSma));
  const assetChangeSmooth = A(ta.sma(S(assetDiff), changeSma));
  const gliStd = A(ta.stdev(S(gliDiff), changeLength));
  const assetStd = A(ta.stdev(S(assetDiff), changeLength));
  const gliChange = gliChangeSmooth.map((v, i) => v / gliStd[i]);
  const assetChange = assetChangeSmooth.map((v, i) => v / assetStd[i]);
  const gliBaseSmooth = A(ta.sma(S(total.map((_, i) => hist(total, i, changeLength))), changeSma));
  const corr = (length: number) => A(ta.correlation(S(priceTable), S(gliTable), length));
  const betaLength = betaInput === '6M' ? tradingDays * 6 : betaInput === '9M' ? tradingDays * 9
    : betaInput === '1Y' ? tradingDays * 12 : betaInput === '3Y' ? tradingDays * 36
      : betaInput === '5Y' ? tradingDays * 60 : tradingDays * 3;
  const corrBeta = corr(betaLength);
  const stdAssetBeta = A(ta.stdev(S(close.map((v, i) => Math.log(v / hist(close, i, 1)))), betaLength));
  const stdGliBeta = A(ta.stdev(S(total.map((v, i) => Math.log(v / hist(total, i, 1)))), betaLength));
  const corrLength = corrInput === '3M' ? tradingDays * 3 : corrInput === '6M' ? tradingDays * 6
    : corrInput === '9M' ? tradingDays * 9 : corrInput === '1Y' ? tradingDays * 12
      : corrInput === '2Y' ? tradingDays * 24 : corrInput === '3Y' ? tradingDays * 36
        : corrInput === '5Y' ? tradingDays * 60 : tradingDays * 1;

  // is_bull = bull and not bull[1], ... (a bool is false on the bar before the first one)
  const bullAt = (i: number) => i >= 0 && ge(fast[i], slow[i]);
  const bearAt = (i: number) => i >= 0 && gt(slow[i], fast[i]);
  const trackingAt = (i: number) => {
    const gliTrack = offsetInput > 0 ? hist(gliChange, i, absOffset) : gliChange[i];
    const assetTrack = offsetInput < 0 ? hist(assetChange, i, absOffset) : assetChange[i];
    return assetTrack - gliTrack;
  };
  const tracking = total.map((_, i) => trackingAt(i));
  const aheadAt = (i: number) => i >= 0 && ge(tracking[i], 0);
  const behindAt = (i: number) => i >= 0 && gt(0, tracking[i]);
  const alertFlags = [bullAt, bearAt, aheadAt, behindAt].map((f) => total.map((_, i) => f(i) && !f(i - 1)));

  // plot(roc_sma, offset = offset_input): the value of bar i on bar i + offset
  const interval = barInterval(bars);
  const plot0 = [];
  for (let i = 0; i < n; i++) {
    const k = i + offsetInput;
    if (k < 0) continue;
    plot0.push({ time: barTime(bars, k, interval), value: Number.isFinite(rocSma[i]) ? rocSma[i] : NaN });
  }

  const tables: TableData[] = [];
  if (n > 0) {
    // the table shows the values of the last bar
    const i = n - 1;
    const bull = bullAt(i);
    const bear = bearAt(i);
    const changePct = gliChangeSmooth[i] / gliBaseSmooth[i];
    const ahead = aheadAt(i);
    const behind = behindAt(i);
    const corrs = [1, 3, 6, 12, 36].map((m) => corr(tradingDays * m)[i]);
    const beta = (corrBeta[i] * stdAssetBeta[i]) / stdGliBeta[i];

    // manual_corr(total_sma, price_sma, offset, corr_length) for each offset of the range, the best one kept
    const manualCorr = (offsetValue: number): number => {
      const abs = Math.abs(offsetValue);
      let sumX = 0;
      let sumY = 0;
      let sumX2 = 0;
      let sumY2 = 0;
      let sumXY = 0;
      let count = 0;
      for (let j = 0; j <= corrLength - 1; j++) {
        const x = offsetValue > 0 ? hist(totalSma, i, j + abs) : hist(totalSma, i, j);
        const y = offsetValue < 0 ? hist(priceSma, i, j + abs) : hist(priceSma, i, j);
        if (!Number.isNaN(x) && !Number.isNaN(y)) {
          sumX += x;
          sumY += y;
          sumX2 += x * x;
          sumY2 += y * y;
          sumXY += x * y;
          count += 1;
        }
      }
      const numerator = count * sumXY - sumX * sumY;
      const denominator = Math.sqrt((count * sumX2 - sumX * sumX) * (count * sumY2 - sumY * sumY));
      return count > 1 && Math.abs(denominator) > EPS ? numerator / denominator : NaN;
    };
    let bestCorr = -1.0;
    let bestOffset = 0;
    const step = minOffset <= maxOffset ? 10 : -10;
    for (let o = minOffset; step > 0 ? o <= maxOffset : o >= maxOffset; o += step) {
      const c = manualCorr(o);
      if (!Number.isNaN(c) && gt(c, bestCorr)) {
        bestCorr = c;
        bestOffset = o;
      }
    }

    const fmt = (x: number) => str.tostring(x, '#.#');
    const r2Threshold = r2ThresholdInput < 1 ? r2ThresholdInput : r2ThresholdInput / 100.0;
    const corrThreshold = Math.sqrt(r2Threshold);
    const corrColor = (c: number) => (gt(c, corrThreshold) ? GREEN : gt(-corrThreshold, c) ? RED : GRAY);
    const cells: TableCellData[] = [];
    const cell = (column: number, row: number, text: string, bgColor: string) => {
      cells.push({ column, row, text, width: widthInput, textColor: WHITE, bgColor });
    };
    ['Trend', 'Change', 'Tracking', '1M Corr', '3M Corr', '6M Corr', '1Y Corr', '3Y Corr', 'Beta (β)', 'Best Offset',
      'Offset Corr'].forEach((text, row) => cell(0, row, text, BLACK));
    cell(1, 0, bull ? 'Bullish' : 'Bearish', bull ? GREEN : bear ? RED : GRAY);
    cell(1, 1, str.tostring(changePct, '#.#%'), gt(changePct, 0) ? GREEN : gt(0, changePct) ? RED : GRAY);
    cell(1, 2, ahead ? 'Ahead' : 'Behind', behind ? GREEN : ahead ? RED : GRAY);
    corrs.forEach((c, k) => cell(1, 3 + k, fmt(c), corrColor(c)));
    cell(1, 8, fmt(beta), gt(beta, 1) ? GREEN : gt(0, beta) ? RED : GRAY);
    cell(1, 9, bestOffset > 0 ? `+${str.tostring(bestOffset)}` : str.tostring(bestOffset), GRAY);
    cell(1, 10, fmt(bestCorr), corrColor(bestCorr));
    const position: TablePosition = tableInput === 'High' ? 'top_right' : tableInput === 'Middle' ? 'middle_right' : 'bottom_right';
    tables.push({
      position, columns: 2, rows: 11, cells, frameColor: WHITE, frameWidth: 1, borderColor: WHITE, borderWidth: 1,
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    tables,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Trend Bullish', message: 'Global Liquidity Bullish!' },
  { id: 'alert1', title: 'Trend Bearish', message: 'Global Liquidity Bearish!' },
  { id: 'alert2', title: 'Tracking Ahead', message: '{{ticker}} Leading Global Liquidity!' },
  { id: 'alert3', title: 'Tracking Behind', message: '{{ticker}} Lagging Global Liquidity!' },
];

export const GlobalLiquidityIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
  alertConditions,
};
