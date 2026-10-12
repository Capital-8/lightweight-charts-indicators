/**
 * AlphaTrend - Screener
 *
 * AlphaTrend: ATR = SMA of the true range over 'Length' bars. When the money flow index of hlc3 (or the RSI of the
 * source with "Change Calculation (No Volume Data)") is 50 or more, the line follows low - ATR * Multiplier and may
 * only rise; otherwise it follows high + ATR * Multiplier and may only fall. The trigger is the line 2 bars back; the
 * fill between them is green while the line rises (red while it falls). BUY / SELL labels mark a cross of the line and
 * its trigger that changes the direction (the first cross after a cross of the other side).
 *
 * Screener: the same direction is computed on the bars of up to 20 other symbols (each on the timeframe of its input,
 * the chart timeframe when empty) and shown in a list of labels 20 bars after the last bar: an up / down triangle (or
 * a square when there is no direction yet), the bars since the direction changed and the symbol, coloured by the
 * direction. Symbols that are switched off show a square and "NaN" with no text colour.
 *
 * The bars of the other symbols come from the chart context (`bars` accessor, `requiredSymbols` lists them); without
 * them `calculate` throws a MissingSymbolDataError. A timeframe below the chart timeframe shows the last bar of that
 * timeframe that closes by the close of the chart bar, as `request.security`.
 *
 * Reference: "AlphaTrend - Screener" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Created & Developed by : Kıvanç Özbilgiç (@KivancOzbilgic); Screener Panel & Adjustments: @dg_factor
 */

import {
  ta, Series, str, getSourceSeries, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { LabelData, MarkerData } from '../types';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { chartTimeframe, timeAfterLastBar } from '../anchor-period';
import { otherSymbolChart, securityOther } from '../other-symbol';

const COUNT = 20;
type Size = 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';

export interface AlphaTrendScreenerInputs {
  src: SourceType;
  /** ALPHATREND: Length */
  AP: number;
  /** Multiplier */
  coeff: number;
  /** Change Calculation (No Volume Data): RSI of the source instead of the MFI of hlc3 */
  novolumedata: boolean;
  showsignalsk: boolean;
  /** SCREENER: Show Label */
  lbSh: boolean;
  /** Horizontal Axis: bars after the current bar */
  lbXa: number;
  /** Vertical Axis: per mille above the highest high of 200 bars */
  lbYa: number;
  lbSz: Size;
  /** Text colour of an up direction */
  lbCl: string;
  /** Text colour of a down direction */
  lbCs: string;
  sh01: boolean; sh02: boolean; sh03: boolean; sh04: boolean; sh05: boolean;
  sh06: boolean; sh07: boolean; sh08: boolean; sh09: boolean; sh10: boolean;
  sh11: boolean; sh12: boolean; sh13: boolean; sh14: boolean; sh15: boolean;
  sh16: boolean; sh17: boolean; sh18: boolean; sh19: boolean; sh20: boolean;
  tf01: string; tf02: string; tf03: string; tf04: string; tf05: string;
  tf06: string; tf07: string; tf08: string; tf09: string; tf10: string;
  tf11: string; tf12: string; tf13: string; tf14: string; tf15: string;
  tf16: string; tf17: string; tf18: string; tf19: string; tf20: string;
  s01: string; s02: string; s03: string; s04: string; s05: string;
  s06: string; s07: string; s08: string; s09: string; s10: string;
  s11: string; s12: string; s13: string; s14: string; s15: string;
  s16: string; s17: string; s18: string; s19: string; s20: string;
}

const SYMBOLS = [
  'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:BNBUSDT', 'BINANCE:ADAUSDT', 'BINANCE:AVAXUSDT',
  'BINANCE:CHZUSDT', 'BINANCE:DOGEUSDT', 'BINANCE:SOLUSDT', 'BINANCE:TRXUSDT', 'BINANCE:XRPUSDT',
  'NASDAQ:AAPL', 'NASDAQ:TSLA', 'NASDAQ:AMZN', 'NASDAQ:GOOGL', 'NASDAQ:NVDA',
  'NASDAQ:META', 'NYSE:C', 'NASDAQ:NFLX', 'NYSE:BABA', 'NASDAQ:ABNB',
];
const nums = Array.from({ length: COUNT }, (_, k) => String(k + 1).padStart(2, '0'));
const key = <P extends 'sh' | 'tf' | 's'>(p: P, k: number) => `${p}${nums[k]}` as `${P}${string}` & keyof AlphaTrendScreenerInputs;

export const defaultInputs: AlphaTrendScreenerInputs = {
  src: 'close',
  AP: 14,
  coeff: 1.0,
  novolumedata: false,
  showsignalsk: true,
  lbSh: true,
  lbXa: 20,
  lbYa: 1,
  lbSz: 'Normal',
  lbCl: '#00bb00',
  lbCs: '#ff0000',
  ...(Object.fromEntries(nums.map((n, k) => [`sh${n}`, k < 10])) as Record<`sh${string}`, boolean>),
  ...(Object.fromEntries(nums.map((n) => [`tf${n}`, ''])) as Record<`tf${string}`, string>),
  ...(Object.fromEntries(nums.map((n, k) => [`s${n}`, SYMBOLS[k]])) as Record<`s${string}`, string>),
} as AlphaTrendScreenerInputs;

const GA = 'ALPHATREND';
const GSC = 'SCREENER';
const GSY = 'SYMBOL';

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: GA },
  { id: 'AP', type: 'int', title: 'Length', defval: 14, group: GA },
  { id: 'coeff', type: 'float', title: 'Multiplier', defval: 1.0, step: 0.1, group: GA },
  { id: 'novolumedata', type: 'bool', title: 'Change Calculation (No Volume Data)', defval: false, group: GA },
  { id: 'showsignalsk', type: 'bool', title: 'Show Signals ', defval: true, group: GA },
  { id: 'lbSh', type: 'bool', title: 'Show Label', defval: true, group: GSC },
  { id: 'lbXa', type: 'int', title: 'Horizontal Axis', defval: 20, group: GSC, tooltip: 'Label Position x Axis' },
  { id: 'lbYa', type: 'int', title: 'Vertical Axis', defval: 1, group: GSC, tooltip: 'Label Position y Axis' },
  {
    id: 'lbSz', type: 'string', title: 'Label Size', defval: 'Normal', group: GSC,
    options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'],
  },
  { id: 'lbCl', type: 'color', title: 'Colours', defval: '#00bb00', group: GSC, inline: '0' },
  { id: 'lbCs', type: 'color', title: '', defval: '#ff0000', group: GSC, inline: '0' },
  ...nums.map((n, k): InputConfig => ({ id: `sh${n}`, type: 'bool', title: n, defval: k < 10, group: GSY, inline: n })),
  ...nums.map((n): InputConfig => ({ id: `tf${n}`, type: 'timeframe', title: '', defval: '', group: GSY, inline: n })),
  ...nums.map((n, k): InputConfig => ({ id: `s${n}`, type: 'symbol', title: '', defval: SYMBOLS[k], group: GSY, inline: n })),
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'AlphaTrend', color: '#0022fc', lineWidth: 3 },
  { id: 'plot1', title: 'Trigger', color: '#fc0400', lineWidth: 3 },
];

export const metadata = {
  title: 'AlphaTrend - Screener',
  shortTitle: 'AlphaTrend - Screener',
  overlay: true,
};

const GREEN = '#00E60F';
const RED = '#80000B';
const BLUE_LABEL = '#0022FC';
/** color.maroon */
const MAROON = '#880E4F';
/** c00: colour of the title and of a symbol without a direction */
const C00 = '#686868';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);

/** The AlphaTrend line, its signals and the direction on one symbol's bars */
function alphaTrend(bars: Bar[], cfg: AlphaTrendScreenerInputs) {
  const n = bars.length;
  const AP = cfg.AP;
  const atr = ta.sma(ta.tr(bars), AP).toArray();
  const momentum = cfg.novolumedata
    ? ta.rsi(getSourceSeries(bars, cfg.src), AP).toArray()
    : ta.mfi(new Series(bars, (b) => (b.high + b.low + b.close) / 3), AP, new Series(bars, (b) => b.volume ?? NaN)).toArray();

  const at = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const upT = bars[i].low - atr[i] * cfg.coeff;
    const downT = bars[i].high + atr[i] * cfg.coeff;
    const prev = i > 0 && !Number.isNaN(at[i - 1]) ? at[i - 1] : 0; // nz(AlphaTrend[1])
    at[i] = ge(momentum[i], 50) ? (lt(upT, prev) ? prev : upT) : gt(downT, prev) ? prev : downT;
  }
  const atS = Series.fromArray(bars, at);
  const at2 = atS.offset(2);
  const buyS = ta.crossover(atS, at2);
  const sellS = ta.crossunder(atS, at2);
  const buy = buyS.toArray().map((v) => v === 1);
  const sell = sellS.toArray().map((v) => v === 1);
  const K1 = ta.barssince(buyS).toArray();
  const K2 = ta.barssince(sellS).toArray();
  const O1 = ta.barssince(buyS.offset(1)).toArray();
  const O2 = ta.barssince(sellS.offset(1)).toArray();

  const buyOk = new Array<boolean>(n);
  const sellOk = new Array<boolean>(n);
  const direction = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    buyOk[i] = buy[i] && O1[i] > K2[i];
    sellOk[i] = sell[i] && O2[i] > K1[i];
    direction[i] = buyOk[i] ? 1 : sellOk[i] ? -1 : i > 0 ? direction[i - 1] : NaN;
  }
  return { at, buyOk, sellOk, direction };
}

/** f_screener(true): the direction and the bars since it changed (x != x[1]: false when one of them is na) */
function screener(bars: Bar[], cfg: AlphaTrendScreenerInputs): { x: number[]; y: number[] } {
  const x = alphaTrend(bars, cfg).direction;
  const change = x.map((v, i) => (i > 0 && v !== x[i - 1] && !Number.isNaN(v) && !Number.isNaN(x[i - 1]) ? 1 : 0));
  const y = ta.barssince(Series.fromArray(bars, change)).toArray();
  return { x, y };
}

/** Timeframe of request k: its input, or the chart timeframe when empty */
function requestTimeframe(tf: string, chartTf: string): string {
  return tf.trim() === '' ? chartTf : tf;
}

/** Requests of the symbols that are switched on (a symbol that is off shows na without its bars) */
function requestsOf(cfg: AlphaTrendScreenerInputs, chartTf: string): SymbolRequest[] {
  const out: SymbolRequest[] = [];
  for (let k = 0; k < COUNT; k++) {
    if (cfg[key('sh', k)]) out.push({ symbol: cfg[key('s', k)] as string, timeframe: requestTimeframe(cfg[key('tf', k)] as string, chartTf) });
  }
  return out;
}

/** Bars of the other symbols that are switched on */
export function requiredSymbols(inputs: Partial<AlphaTrendScreenerInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  return requestsOf({ ...defaultInputs, ...inputs }, chartTimeframe([], chart));
}

const SIZES: Record<Size, string> = { Auto: 'auto', Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' };

export function calculate(
  bars: Bar[],
  inputs: Partial<AlphaTrendScreenerInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'labels'> & { markers: MarkerData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;

  // other symbols: all bars at once (one MissingSymbolDataError for everything missing)
  const chartTf = chartTimeframe(bars, chart);
  const on = Array.from({ length: COUNT }, (_, k) => !!cfg[key('sh', k)]);
  const otherBars = symbolBarsOf(requestsOf(cfg, chartTf), chart);

  // chart symbol
  const { at, buyOk, sellOk } = alphaTrend(bars, cfg);
  const markers: MarkerData[] = [];
  const fillColors = new Array<string>(n);
  const plot0 = new Array<{ time: number; value: number }>(n);
  const plot1 = new Array<{ time: number; value: number }>(n);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const a2 = i >= 2 ? at[i - 2] : NaN;
    plot0[i] = { time: t, value: at[i] };
    plot1[i] = { time: t, value: a2 };
    const a1 = i >= 1 ? at[i - 1] : NaN;
    const a3 = i >= 3 ? at[i - 3] : NaN;
    fillColors[i] = gt(at[i], a2) ? GREEN : lt(at[i], a2) ? RED : gt(a1, a3) ? GREEN : RED;
    if (cfg.showsignalsk && buyOk[i] && !Number.isNaN(a2 * 0.9999)) {
      markers.push({ time: t, position: 'atPriceBottom', price: a2 * 0.9999, shape: 'labelUp', color: BLUE_LABEL, size: 'tiny', text: 'BUY', textColor: '#FFFFFF' });
    }
    if (cfg.showsignalsk && sellOk[i] && !Number.isNaN(a2 * 1.0001)) {
      markers.push({ time: t, position: 'atPriceTop', price: a2 * 1.0001, shape: 'labelDown', color: MAROON, size: 'tiny', text: 'SELL', textColor: '#FFFFFF' });
    }
  }

  // screener labels: drawn again on every bar (label.delete then label.new), so those of the last bar remain
  resetDrawings({ label: 50 });
  if (n > 0 && cfg.lbSh) {
    const last = n - 1;
    setDrawingBar(last, true);
    const rows: { text: string; color: string }[] = [{ text: 'Alpha Trend Screener', color: C00 }];
    let r = 0;
    for (let k = 0; k < COUNT; k++) {
      const sym = cfg[key('s', k)] as string;
      let a = NaN;
      let b = NaN;
      if (on[k]) {
        const other = otherBars[r++];
        const { x, y } = screener(other, cfg);
        const idx = securityOther(bars, other, cfg[key('tf', k)] as string, otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(sym) });
        const j = idx[last];
        if (j >= 0) {
          a = x[j];
          b = y[j];
        }
      }
      const bars_ = ` [${str.tostring(b)}] `;
      const text = a === 1 ? `▲${bars_}${sym}` : a === -1 ? `▼${bars_}${sym}` : `■${bars_}${sym}`;
      const color = !on[k] ? 'transparent' : a === 1 ? cfg.lbCl : a === -1 ? cfg.lbCs : C00;
      rows.push({ text, color });
    }
    // ta.highest(200): the highest high of the last 200 bars
    let hh = NaN;
    if (n >= 200) {
      hh = -Infinity;
      for (let i = n - 200; i < n; i++) hh = Math.max(hh, bars[i].high);
    }
    const hl2 = (bars[last].high + bars[last].low) / 2;
    const y = (last > 200 ? hh : hl2) * (1 + cfg.lbYa / 1000);
    rows.forEach((row, l) => {
      // for i = l * 2 to 0: 2l + 1 times "\n\n" (one time for the title)
      const text = '\n\n'.repeat(l * 2 + 1) + row.text;
      label.new(last + cfg.lbXa, y, text, 'bar_index', 'price', '#00000000', 'label_left', row.color, SIZES[cfg.lbSz], 'right');
    });
  }
  const drawings = drawingOutputs(bars, chart?.timeUnit === 'ms' ? 'ms' : 's');
  const lastTime = n > 0 ? bars[n - 1].time : 0;
  const labels = (drawings.labels ?? []).map((l) => (l.time > lastTime && n >= 2 ? { ...l, time: timeAfterLastBar(bars, cfg.lbXa, chart) } : l));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Fill Color' }, colors: fillColors }],
    markers,
    labels,
  };
}

export const AlphaTrendScreener = { calculate, metadata, defaultInputs, inputConfig, plotConfig, requiredSymbols };
