/**
 * Open Interest Suite [Aggregated] - By Leviathan
 *
 * Open interest of the perpetual futures of the chart's base currency, added over six markets (Binance USDT, USD and
 * BUSD margined, BitMEX USD and USDT margined, Kraken USD margined; the coin-margined ones are divided by the chart
 * close to get coins) and quoted in coins or in USD (times the close). Four displays: open interest candles (open =
 * previous close), open interest delta columns, delta times relative volume (volume / SMA(volume, 20)), and an RSI
 * of the open interest. Thresholds: SMA(300) of the positive / negative deltas times a multiplier; large increases /
 * decreases can colour the candles, columns, background and chart bars. Optional EMA of the open interest, a
 * screener table (open interest, "rekt" and "aggressive" longs / shorts over a lookback) and a distribution profile
 * of the open interest of the visible bars (nodes, value area, point of control).
 *
 * The open interest series are other symbols (EXCHANGE:<base><quote>.P_OI) on the chart timeframe; a symbol that
 * does not exist has no bars (ignore_invalid_symbol: na, counted as 0). The base currency (syminfo.basecurrency) is
 * derived from the chart context: for crypto and forex pairs the ticker without ".P" and without the quote currency,
 * else none, as the context has no such field.
 *
 * Reference: "Open Interest Suite [Aggregated] - By Leviathan" by LeviathanCapital
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LeviathanCapital. The profile code is from KioseffTrading's "Profile Any Indicator" script
 * (used with their permission).
 */

import { ta, Series, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData, BoxData, LineDrawingData, LinefillData, PlotCandleData, TableData } from '../types';
import {
  symbolBarsOf, tickerOf, currencyOf, symbolTypeOf, foregroundColorOf, visibleRangeOf, type ChartContext, type SymbolRequest,
} from '../chart-context';
import { securityOther } from '../other-symbol';
import { chartTimeframe } from '../anchor-period';

export interface OpenInterestSuiteByLeviathanInputs {
  /** 'Open Interest', 'Open Interest Delta', 'OIΔ x rVOL' or 'Open Interest RSI' */
  maindisp: string;
  /** 'USD' or 'COIN' */
  quotecur: string;
  upcol: string;
  downcol: string;
  /** Binance USDT.P_OI */
  binance: boolean;
  /** Binance USD.P_OI */
  binance2: boolean;
  /** Binance BUSD.P_OI */
  binance3: boolean;
  /** BitMEX USD.P_OI */
  bitmex: boolean;
  /** BitMEX USDT.P_OI */
  bitmex2: boolean;
  /** Kraken USD.P_OI */
  kraken: boolean;
  /** Threshold multiplier */
  dMult: number;
  showLoi: boolean;
  showLod: boolean;
  upoicol: string;
  dwoicol: string;
  /** Colour chart bars */
  colCha: boolean;
  /** Colour background */
  colBg: boolean;
  showThresh: boolean;
  showEma: boolean;
  emaLen: number;
  emaCol: string;
  rsiLen: number;
  rsiCol: string;
  /** Screener lookback (bars) */
  lookback: number;
  showScreener: boolean;
  showOI: boolean;
  showRekt: boolean;
  showAgg: boolean;
  /** Generate a profile */
  prof: boolean;
  /** Value area % */
  vapct: number;
  /** Node size */
  profSize: number;
  /** Rows (the script uses rows - 1) */
  rows: number;
  vancol: string;
  nvancol: string;
  poc: boolean;
  poccol: string;
  val: boolean;
  vafill: string;
}

export const defaultInputs: OpenInterestSuiteByLeviathanInputs = {
  maindisp: 'Open Interest',
  quotecur: 'USD',
  upcol: '#d1d4dc',
  downcol: '#9598A1F5',
  binance: true,
  binance2: true,
  binance3: true,
  bitmex: true,
  bitmex2: true,
  kraken: true,
  dMult: 5,
  showLoi: false,
  showLod: false,
  upoicol: '#a5d6a7',
  dwoicol: '#fe5f6d',
  colCha: false,
  colBg: false,
  showThresh: false,
  showEma: false,
  emaLen: 50,
  emaCol: '#787B86',
  rsiLen: 20,
  rsiCol: '#787B86',
  lookback: 200,
  showScreener: false,
  showOI: true,
  showRekt: true,
  showAgg: true,
  prof: false,
  vapct: 70,
  profSize: 2,
  rows: 40,
  vancol: '#2962FF40',
  nvancol: '#787B8640',
  poc: false,
  poccol: '#FF525280',
  val: false,
  vafill: '#2962FF0D',
};

const g2 = 'Thresholds';
const g3 = 'Additional Settings';
const g4 = 'Distribution profile ';
const g5 = 'Screener';
const g6 = 'Data Sources and Aggregation';

export const inputConfig: InputConfig[] = [
  { id: 'maindisp', type: 'string', title: 'Display', defval: 'Open Interest', options: ['Open Interest', 'Open Interest Delta', 'OIΔ x rVOL', 'Open Interest RSI'] },
  { id: 'quotecur', type: 'string', title: 'Quoted in', defval: 'USD', options: ['USD', 'COIN'] },
  { id: 'upcol', type: 'color', title: 'Color                ▲', defval: '#d1d4dc', inline: 'udcol' },
  { id: 'downcol', type: 'color', title: '▼', defval: '#9598A1F5', inline: 'udcol' },
  { id: 'binance', type: 'bool', title: 'Binance USDT.P_OI', defval: true, inline: 'src', group: g6 },
  { id: 'binance2', type: 'bool', title: 'Binance USD.P_OI', defval: true, inline: 'src', group: g6 },
  { id: 'binance3', type: 'bool', title: 'Binance BUSD.P_OI', defval: true, inline: 'src2', group: g6 },
  { id: 'bitmex', type: 'bool', title: 'BitMEX USD.P_OI', defval: true, inline: 'src2', group: g6 },
  { id: 'bitmex2', type: 'bool', title: 'BitMEX USDT.P_OI ', defval: true, inline: 'src3', group: g6 },
  { id: 'kraken', type: 'bool', title: 'Kraken USD.P_OI', defval: true, inline: 'src3', group: g6 },
  { id: 'dMult', type: 'float', title: 'Threshold Multiplier', defval: 5, step: 0.1, group: g2 },
  { id: 'showLoi', type: 'bool', title: 'Highlight Large OI Increase ', defval: false, inline: 'loi', group: g2 },
  { id: 'showLod', type: 'bool', title: 'Highlight Large OI Decrease', defval: false, inline: 'lod', group: g2 },
  { id: 'upoicol', type: 'color', title: '', defval: '#a5d6a7', inline: 'loi', group: g2 },
  { id: 'dwoicol', type: 'color', title: '', defval: '#fe5f6d', inline: 'lod', group: g2 },
  { id: 'colCha', type: 'bool', title: 'Color Chart Bars', defval: false, group: g2 },
  { id: 'colBg', type: 'bool', title: 'Color Background', defval: false, group: g2 },
  { id: 'showThresh', type: 'bool', title: 'Show Thresholds', defval: false, group: g2 },
  { id: 'showEma', type: 'bool', title: 'OI EMA', defval: false, inline: 'ema', group: g3 },
  { id: 'emaLen', type: 'int', title: '', defval: 50, inline: 'ema', group: g3 },
  { id: 'emaCol', type: 'color', title: '', defval: '#787B86', inline: 'ema', group: g3 },
  { id: 'rsiLen', type: 'int', title: 'OI RSI      ', defval: 20, inline: 'rsi', group: g3 },
  { id: 'rsiCol', type: 'color', title: '', defval: '#787B86', inline: 'rsi', group: g3 },
  { id: 'lookback', type: 'int', title: 'Lookback (bars)', defval: 200, group: g5 },
  { id: 'showScreener', type: 'bool', title: 'Show Screener', defval: false, group: g5 },
  { id: 'showOI', type: 'bool', title: ' ● Open Interest', defval: true, group: g5 },
  { id: 'showRekt', type: 'bool', title: ' ● Rekt Longs & Shorts', defval: true, group: g5 },
  { id: 'showAgg', type: 'bool', title: ' ● Aggressive Longs & Shorts', defval: true, group: g5 },
  { id: 'prof', type: 'bool', title: 'Generate a profile', defval: false, group: g4 },
  { id: 'vapct', type: 'float', title: 'Value Area %', defval: 70, min: 5, max: 95, group: g4 },
  { id: 'profSize', type: 'int', title: 'Node Size', defval: 2, min: 1, group: g4 },
  { id: 'rows', type: 'int', title: 'Rows', defval: 40, min: 6, max: 500, step: 25, group: g4 },
  { id: 'vancol', type: 'color', title: 'Node Colors         ', defval: '#2962FF40', inline: 'nc', group: g4 },
  { id: 'nvancol', type: 'color', title: '━', defval: '#787B8640', inline: 'nc', group: g4 },
  { id: 'poc', type: 'bool', title: 'POC', defval: false, inline: 'POC', group: g4 },
  { id: 'poccol', type: 'color', title: '            ', defval: '#FF525280', inline: 'POC', group: g4 },
  { id: 'val', type: 'bool', title: 'VA', defval: false, inline: 'VA', group: g4 },
  { id: 'vafill', type: 'color', title: '             ', defval: '#2962FF0D', inline: 'VA', group: g4 },
];

const GRAY = String(color.gray);

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Open Interest Delta', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'OI EMA', color: '#787B86', lineWidth: 1 },
  { id: 'plot2', title: 'OI RSI', color: '#787B86', lineWidth: 1 },
  { id: 'plot3', title: 'Upper Threshold', color: GRAY, lineWidth: 1 },
  { id: 'plot4', title: 'Lower Threshold', color: GRAY, lineWidth: 1 },
];

export const metadata = {
  title: 'Open Interest Suite [Aggregated] - By Leviathan',
  shortTitle: 'Open Interest Suite [Aggregated] - By Leviathan',
  overlay: false,
  format: 'volume',
};

/** The profile reads the visible range of the chart: calculate again when the user scrolls or zooms */
export const usesVisibleRange = true;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

/** PineScript `syminfo.basecurrency`: the base of a crypto or forex pair ("BTCUSDT.P" quoted in USDT -> "BTC"); else '' (na) */
function baseCurrencyOf(chart?: ChartContext): string {
  const type = symbolTypeOf(chart);
  if (type !== 'crypto' && type !== 'forex') return '';
  const pair = tickerOf(chart).replace(/\.P$/, '');
  const quote = currencyOf(chart);
  return pair.length > quote.length && pair.endsWith(quote) ? pair.slice(0, -quote.length) : '';
}

/** The six open interest symbols, with their switch and whether the value is divided by the close */
function sources(cfg: OpenInterestSuiteByLeviathanInputs, chart?: ChartContext) {
  const base = baseCurrencyOf(chart);
  const mex = base === 'BTC' ? 'XBT' : base;
  return [
    { on: cfg.binance, symbol: `BINANCE:${base}USDT.P_OI`, perClose: false },
    { on: cfg.binance2, symbol: `BINANCE:${base}USD.P_OI`, perClose: true },
    { on: cfg.binance3, symbol: `BINANCE:${base}BUSD.P_OI`, perClose: false },
    { on: cfg.bitmex, symbol: `BITMEX:${mex}USD.P_OI`, perClose: true },
    { on: cfg.bitmex2, symbol: `BITMEX:${mex}USDT.P_OI`, perClose: true },
    { on: cfg.kraken, symbol: `KRAKEN:${base}USD.P_OI`, perClose: true },
  ];
}

/**
 * Bars of other symbols the indicator reads: the open interest symbols that are switched on, on the chart
 * timeframe. An app gives an empty array for a symbol that does not exist (PineScript ignore_invalid_symbol).
 */
export function requiredSymbols(inputs: Partial<OpenInterestSuiteByLeviathanInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  const tf = chartTimeframe([], chart);
  return sources(cfg, chart).filter((s) => s.on).map((s) => ({ symbol: s.symbol, timeframe: tf }));
}

type Result = IndicatorResult & {
  plotCandles: Record<string, PlotCandleData[]>;
  barColors: BarColorData[];
  bgColors: BgColorData[];
  boxes: BoxData[];
  lines: LineDrawingData[];
  linefills: LinefillData[];
  tables: TableData[];
};

export function calculate(
  bars: Bar[],
  inputs: Partial<OpenInterestSuiteByLeviathanInputs> = {},
  chart?: ChartContext,
): Result {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const close = bars.map((b) => b.close);
  const pc = cfg.maindisp === 'Open Interest';
  let pd = cfg.maindisp === 'Open Interest Delta';
  const prdv = cfg.maindisp === 'OIΔ x rVOL';
  const poir = cfg.maindisp === 'Open Interest RSI';
  const coin = cfg.quotecur === 'COIN';

  // request.security(<symbol>, timeframe.period, [close - close[1], close, open, high, low], ignore_invalid_symbol = true)
  const tf = chartTimeframe(bars, chart);
  const src = sources(cfg, chart).filter((s) => s.on);
  const otherBars = symbolBarsOf(src.map((s) => ({ symbol: s.symbol, timeframe: tf })), chart);
  const series = src.map((s, k) => {
    const ob = otherBars[k];
    const index = securityOther(bars, ob, '', { symbol: s.symbol }, chart);
    const at = (j: number, f: (b: Bar) => number) => (j < 0 ? NaN : f(ob[j]));
    return {
      perClose: s.perClose,
      d: index.map((j) => (j < 1 ? NaN : ob[j].close - ob[j - 1].close)),
      c: index.map((j) => at(j, (b) => b.close)),
      o: index.map((j) => at(j, (b) => b.open)),
      h: index.map((j) => at(j, (b) => b.high)),
      l: index.map((j) => at(j, (b) => b.low)),
    };
  });

  // deltaOI = (binance ? nz(oid1, 0) : 0) + (binance2 ? nz(oid2, 0) / close : 0) + ...; O = ... nz(oio2 / close, 0)
  const all = sources(cfg, chart);
  const sum = (i: number, field: 'd' | 'c' | 'o' | 'h' | 'l') => {
    let out = 0;
    let k = 0;
    for (const s of all) {
      let v = 0;
      if (s.on) {
        const x = series[k++][field][i];
        v = !s.perClose ? nz(x) : field === 'd' ? nz(x) / close[i] : nz(x / close[i]);
      }
      out = out + v;
    }
    return out;
  };
  const deltaRaw = new Array<number>(n);
  const O = new Array<number>(n);
  const H = new Array<number>(n);
  const L = new Array<number>(n);
  const C = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    deltaRaw[i] = sum(i, 'd');
    O[i] = sum(i, 'o');
    H[i] = sum(i, 'h');
    L[i] = sum(i, 'l');
    C[i] = sum(i, 'c');
  }

  // thresholds: ta.sma(deltaOI > 0 ? deltaOI : 0, 300) * d_mult
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const pThresh = A(ta.sma(Series.fromArray(bars, deltaRaw.map((x) => (gt(x, 0) ? x : 0))), 300)).map((x) => x * cfg.dMult);
  const nThresh = A(ta.sma(Series.fromArray(bars, deltaRaw.map((x) => (lt(x, 0) ? x : 0))), 300)).map((x) => x * cfg.dMult);
  const largeUp = deltaRaw.map((x, i) => gt(x, pThresh[i]));
  const largeDw = deltaRaw.map((x, i) => lt(x, nThresh[i]));

  const scale = (x: number, i: number) => (coin ? x : x * close[i]);
  const O_ = O.map(scale);
  const H_ = H.map(scale);
  const L_ = L.map(scale);
  const C_ = C.map(scale);

  // rvol = volume / ta.sma(volume, 20); 'OIΔ x rVOL': deltaOI := deltaOI * rvol, pd := true
  const volume = bars.map((b) => b.volume ?? NaN);
  const volSma = A(ta.sma(Series.fromArray(bars, volume), 20));
  const deltaOI = prdv ? deltaRaw.map((x, i) => x * (volume[i] / volSma[i])) : deltaRaw;
  if (prdv) pd = true;

  const ema = cfg.showEma && pc ? A(ta.ema(Series.fromArray(bars, C_), cfg.emaLen)) : null;
  const rsi = poir ? A(ta.rsi(Series.fromArray(bars, C), cfg.rsiLen)) : null;

  const candles: PlotCandleData[] = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  const deltaPlot: IndicatorResult['plots'][string] = [];
  const fin = (x: number) => (Number.isFinite(x) ? x : NaN);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    let pccol = gt(C_[i], O_[i]) ? cfg.upcol : cfg.downcol;
    let pdcol = gt(deltaOI[i], 0) ? cfg.upcol : cfg.downcol;
    if (cfg.showLoi && largeUp[i]) {
      pccol = cfg.upoicol;
      pdcol = cfg.upoicol;
    }
    if (cfg.showLod && largeDw[i]) {
      pccol = cfg.dwoicol;
      pdcol = cfg.dwoicol;
    }
    // plotcandle(pc ? C_[1] : na, pc ? H_ : na, pc ? L_ : na, pc ? C_ : na): no candle on a bar with an na value
    if (pc) {
      const open = i > 0 ? fin(C_[i - 1]) : NaN;
      candles.push({ time: t, open, high: fin(H_[i]), low: fin(L_[i]), close: fin(C_[i]), color: pccol, wickColor: pccol, borderColor: pccol });
    }
    deltaPlot.push({ time: t, value: pd ? fin(deltaOI[i]) : NaN, color: pdcol });
    // bgcolor(col_bg and show_loi and large_oi_up ? color.new(pdcol, 85) : na), the same for decreases
    if (cfg.colBg && cfg.showLoi && largeUp[i]) bgColors.push({ time: t, color: String(color.new(pdcol, 85)) });
    if (cfg.colBg && cfg.showLod && largeDw[i]) bgColors.push({ time: t, color: String(color.new(pdcol, 85)) });
    // barcolor(col_cha and show_loi and large_oi_up ? color.new(pdcol, 0) : na), the same for decreases
    if (cfg.colCha && cfg.showLoi && largeUp[i]) barColors.push({ time: t, color: String(color.new(pdcol, 0)) });
    if (cfg.colCha && cfg.showLod && largeDw[i]) barColors.push({ time: t, color: String(color.new(pdcol, 0)) });
  }

  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const fromMs = (ms: number) => ms / toMs;
  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  const linefills: LinefillData[] = [];
  if (cfg.prof && (poir || pc) && n > 0) {
    const profile = distributionProfile(cfg, bars.map((b) => Math.round(b.time * toMs)), C_, visibleRangeOf(bars, chart));
    for (const b of profile.boxes) {
      boxes.push({ time1: fromMs(b.left), price1: b.top, time2: fromMs(b.right), price2: b.bottom, bgColor: b.color, borderColor: b.color });
    }
    for (const l of profile.lines) {
      lines.push({ time1: fromMs(l.x1), price1: l.y, time2: fromMs(l.x2), price2: l.y, color: l.color, width: 1 });
    }
    if (cfg.val) {
      // linefill.new(vadn, vaup, vafill)
      const k = cfg.poc ? 1 : 0;
      linefills.push({ line1: lines[k], line2: lines[k + 1], color: cfg.vafill });
    }
  }

  // Screener: the table of the last bar
  const tables: TableData[] = [];
  if (cfg.showScreener && n > 0) {
    const last = n - 1;
    let rektLongs = 0;
    let rektShorts = 0;
    let aggressiveLongs = 0;
    let aggressiveShorts = 0;
    for (let i = 0; i <= cfg.lookback - 1; i++) {
      const b = last - i;
      if (b < 0) continue; // history before the first bar: na, false
      const up = gt(close[b], bars[b].open);
      const down = lt(close[b], bars[b].open);
      const flow = Math.abs(deltaOI[b] * close[b]);
      if (largeDw[b] && down) rektLongs = rektLongs + flow;
      if (largeDw[b] && up) rektShorts = rektShorts + flow;
      if (largeUp[b] && up) aggressiveLongs = aggressiveLongs + flow;
      if (largeUp[b] && down) aggressiveShorts = aggressiveShorts + flow;
    }
    const fg = foregroundColorOf(chart);
    const cells: TableData['cells'] = [];
    const cell = (column: number, row: number, text: string) => cells.push({ column, row, text, textHAlign: 'left', textColor: fg, textSize: 'auto' });
    if (cfg.showOI) {
      cell(0, 0, 'Open Interest:');
      cell(1, 0, (coin ? `${str.tostring(C[last], 'volume')} BTC` : `$${str.tostring(C[last] * close[last], 'volume')}`) + ' ');
    }
    if (cfg.showRekt) {
      cell(0, 2, 'Rekt Longs:');
      cell(0, 3, 'Rekt Shorts:');
      cell(1, 2, `$${str.tostring(rektLongs, 'volume')} `);
      cell(1, 3, `$${str.tostring(rektShorts, 'volume')} `);
    }
    if (cfg.showAgg) {
      cell(0, 4, 'Aggressive Longs:');
      cell(0, 5, 'Aggressive Shorts:');
      cell(1, 4, `$${str.tostring(aggressiveLongs, 'volume')} `);
      cell(1, 5, `$${str.tostring(aggressiveShorts, 'volume')} `);
    }
    tables.push({ position: 'top_right', columns: 2, rows: 6, cells, bgColor: String(color.rgb(120, 123, 134, 82)) });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, format: metadata.format },
    plots: {
      plot0: deltaPlot,
      // plot(show_ema and pc ? ta.ema(C_, ema_len) : na, color = ema_col)
      plot1: bars.map((b, i) => ({ time: b.time, value: ema ? fin(ema[i]) : NaN, color: cfg.emaCol })),
      // plot(poir ? ta.rsi(C, rsi_len) : na, color = rsi_col)
      plot2: bars.map((b, i) => ({ time: b.time, value: rsi ? fin(rsi[i]) : NaN, color: cfg.rsiCol })),
      plot3: bars.map((b, i) => ({ time: b.time, value: cfg.showThresh ? fin(pThresh[i]) : NaN, color: GRAY })),
      plot4: bars.map((b, i) => ({ time: b.time, value: cfg.showThresh ? fin(nThresh[i]) : NaN, color: GRAY })),
    },
    // hline(poir ? 30 : na): drawn with the RSI display only
    hlines: poir
      ? [30, 70, 50].map((value) => ({ value, options: { title: `Level ${value}`, color: '#787B86', linestyle: 'dashed' as const } }))
      : [],
    plotCandles: pc ? { oiCandles: candles } : {},
    barColors,
    bgColors,
    boxes,
    lines,
    linefills,
    tables,
  };
}

interface ProfileBox { left: number; top: number; right: number; bottom: number; color: string }
interface ProfileLine { x1: number; x2: number; y: number; color: string }

/**
 * The distribution profile of the last bar (ori = 'Left'): times in ms. Throws the runtime errors of the script
 * (an index out of the arrays, e.g. no bar in the visible range).
 */
function distributionProfile(
  cfg: OpenInterestSuiteByLeviathanInputs,
  timesMs: number[],
  srcp: number[],
  range: { leftTime: number; rightTime: number },
): { boxes: ProfileBox[]; lines: ProfileLine[] } {
  const n = timesMs.length;
  const rows = Math.trunc(cfg.rows) - 1;
  const left = range.leftTime;
  const right = range.rightTime;
  const get = (arr: number[], i: number) => {
    if (!(i >= 0 && i < arr.length)) throw new Error(`Index ${i} is out of bounds, array size is ${arr.length}`);
    return arr[i];
  };

  // timeArray: array.unshift(timeArray, math.round(time)) on every bar (index 0 = the last bar)
  const timeArray = timesMs.slice().reverse();
  // vh = matrix.new<float>(1, 1) (one na column), one column more per visible bar
  const vh: number[] = [NaN];
  for (let i = 0; i < n; i++) if (timesMs[i] >= left && timesMs[i] <= right) vh.push(srcp[i]);

  // [pos, n] = [chart.left_visible_bar_time, array.indexof(timeArray, chart.left_visible_bar_time)]
  const pos = left;
  const nIdx = timeArray.indexOf(left);
  const values = vh.filter((v) => !isNaN(v));
  const vMax = values.length ? Math.max(...values) : NaN;
  const vMin = values.length ? Math.min(...values) : NaN;
  const calc = (vMax - vMin) / (rows + 1);
  const dist: number[] = [];
  for (let i = 0; i <= rows; i++) dist.push(vMin + i * calc);
  const x2 = new Array<number>(rows + 1).fill(5);

  // for i = 1 to matrix.columns(vh) - 1 (counts down from 1 to 0 when there is no visible bar)
  const last = vh.length - 1;
  const step = last >= 1 ? 1 : -1;
  for (let i = 1; step > 0 ? i <= last : i >= last; i += step) {
    const cur = get(vh, i);
    const prev = get(vh, i - 1);
    for (let x = 0; x <= dist.length - 1; x++) {
      if (ge(cur, prev)) {
        if (ge(dist[x], prev) && le(dist[x], cur)) x2[x] = x2[x] + cfg.profSize;
      } else if (ge(dist[x], cur) && le(dist[x], prev)) {
        x2[x] = x2[x] + cfg.profSize;
      }
    }
  }

  const boc: ProfileBox[] = [];
  for (let i = 1; i <= rows; i++) {
    // right = timeArray[n + x2[i]] (read first: an index out of the array stops the script), then with ori == "Left":
    // switch math.sign(n - x2[i]): -1 => chart.right_visible_bar_time, else timeArray[n - x2[i]]
    get(timeArray, nIdx + get(x2, i));
    const rightTime = Math.sign(nIdx - x2[i]) === -1 ? right : get(timeArray, nIdx - x2[i]);
    boc.push({ left: pos, top: dist[i - 1], right: rightTime, bottom: dist[i], color: cfg.nvancol });
    if (i === rows) {
      boc.push({ left: pos, top: dist[dist.length - 1], right: rightTime, bottom: dist[dist.length - 1] + calc, color: cfg.nvancol });
    }
  }

  // value area: from the largest node outwards until vapct % of the node sizes
  x2.shift();
  const size = x2.length;
  const maxX2 = Math.max(...x2);
  let nx = x2.indexOf(maxX2);
  let nzI = nx - 1;
  let nz2 = 0;
  let nz3 = 0;
  let nz4 = 0;
  const total = x2.reduce((a, b) => a + b, 0);
  for (let i = 0; i <= size - 1; i++) {
    if (nzI > -1 && nx <= size - 1) {
      if (get(x2, nx) >= get(x2, nzI)) {
        nz2 += get(x2, nx);
        nx += 1;
      } else {
        nz2 += get(x2, nzI);
        nzI -= 1;
      }
    } else if (nzI <= -1) {
      nz2 += get(x2, nx);
      nx += 1;
    } else if (nx >= size) {
      nz2 += get(x2, nzI);
      nzI -= 1;
    }
    if (nz2 >= total * (cfg.vapct / 100)) {
      nz3 = nx <= size - 1 ? nx : size - 1;
      nz4 = nzI <= -1 ? 0 : nzI;
      break;
    }
  }
  // for i = nz3 to nz4 (counts down when nz3 > nz4)
  const vaStep = nz3 <= nz4 ? 1 : -1;
  for (let i = nz3; vaStep > 0 ? i <= nz4 : i >= nz4; i += vaStep) {
    if (!(i >= 0 && i < boc.length)) throw new Error(`Index ${i} is out of bounds, array size is ${boc.length}`);
    boc[i].color = cfg.vancol;
  }

  const lines: ProfileLine[] = [];
  if (cfg.poc) {
    const b = boc[x2.indexOf(maxX2)];
    const y = (b.top + b.bottom) / 2;
    lines.push({ x1: left, x2: right, y, color: cfg.poccol });
  }
  if (cfg.val) {
    const ydn = boc[nz3].bottom;
    const yup = boc[nz4].top;
    lines.push({ x1: left, x2: right, y: ydn, color: cfg.vancol });
    lines.push({ x1: left, x2: right, y: yup, color: cfg.vancol });
  }
  return { boxes: boc, lines };
}

export const OpenInterestSuiteByLeviathan = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
  usesVisibleRange,
};
