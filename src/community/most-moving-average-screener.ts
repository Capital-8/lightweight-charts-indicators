/**
 * MOST + Moving Average Screener
 *
 * MOST (Moving Stop Loss): a moving average of the source (VAR by default, or SMA, EMA, WMA, DEMA, TMA, WWMA, ZLEMA,
 * TSF, HULL, Tillson T3) with a trailing stop "STOP LOSS Percent" below it in an up trend and above it in a down
 * trend. The trend turns down when the average falls under the long stop of the bar before, and up when it rises
 * above the short stop of the bar before. Buy / sell signals: the average crossing the MOST line, or the close
 * crossing the average ("Moving Average Screening Mode"), or the average turning up / down (both screening modes on,
 * which also colours the average green / red).
 *
 * Screener: for up to 20 symbols, on their own bars (the chart timeframe, or the timeframe set for the symbol), the
 * direction of the last signal (1 after a buy, -1 after a sell) and the number of bars since the direction last
 * changed. The value of each symbol on the chart bars is that of `request.security(symbol, timeframe, ...)` without
 * lookahead (see src/other-symbol.ts). The labels of the last bar list them right of the chart: "MOST Screener", then
 * one line per symbol: an up / down / square mark, the bar count in brackets and the symbol, in the up / down colour
 * (grey before the first signal; no colour for a symbol that is switched off or has no bar yet). The labels are
 * placed "Horizontal Axis" bars after the last bar, at the highest high of the last 200 bars plus "Vertical Axis"
 * per mille.
 *
 * Other symbols: the bars of every symbol that is switched on come from the `bars` accessor of the chart context
 * (`requiredSymbols` lists them); without them `calculate` throws a `MissingSymbolDataError`. The exchange time zone
 * and session of each symbol come from `symbolInfo` of the context. A symbol timeframe below the chart timeframe
 * shows the last bar of that timeframe that closes by the close of the chart bar, as `request.security`.
 *
 * Chart context (optional third argument of calculate): the chart timeframe (`timeframe`, else read from the bar
 * spacing) is the timeframe of the symbols without their own; with the exchange calendar (`timezone` and
 * `session`) the labels are drawn on the future bar of the trading calendar; `lastBarConfirmed` false (the last bar
 * still open) shows the open bar of each other symbol on the last bar.
 *
 * Reference: "MOST + Moving Average Screener" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, math, Series, getSourceSeries,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { LabelData, MarkerData } from '../types';
import { barTime } from '../bar-time';
import { chartTimeframe, timeAfterLastBar } from '../anchor-period';
import { symbolBarsOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { otherSymbolChart, securityOther } from '../other-symbol';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'DEMA' | 'TMA' | 'VAR' | 'WWMA' | 'ZLEMA' | 'TSF' | 'HULL' | 'TILL';
type Slot = '01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10'
  | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20';

const SLOTS = Array.from({ length: 20 }, (_v, i) => String(i + 1).padStart(2, '0') as Slot);

/** sh01..sh20 (show), tf01..tf20 (timeframe, '' = chart timeframe), s01..s20 (ticker id) */
export interface MOSTScreenerInputs extends Record<`sh${Slot}`, boolean>, Record<`tf${Slot}`, string>, Record<`s${Slot}`, string> {
  /** Moving Average Length */
  length: number;
  /** STOP LOSS Percent */
  percent: number;
  src: SourceType;
  /** Moving Average Type */
  mav: MaType;
  /** TILLSON T3 Volume Factor */
  t3a1: number;
  /** Activate Moving Average Screening Mode */
  maScreening: boolean;
  /** Activate Moving Average Color Change Screening Mode */
  colorChangeScreening: boolean;
  /** Show Signals? */
  showSignals: boolean;
  /** Show Label */
  showLabel: boolean;
  /** Label Size */
  labelSize: 'Auto' | 'Tiny' | 'Small' | 'Normal' | 'Large' | 'Huge';
  /** Horizontal Axis: label x = bar_index + this */
  horizontalAxis: number;
  /** Vertical Axis: label y = highest high of 200 bars * (1 + this / 1000) */
  verticalAxis: number;
  /** Colours (up) */
  upColor: string;
  /** Colours (down) */
  downColor: string;
}

const DEFAULT_SYMBOLS = [
  'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:BNBUSDT', 'BINANCE:ADAUSDT', 'BINANCE:AVAXUSDT',
  'BINANCE:CHZUSDT', 'BINANCE:DOGEUSDT', 'BINANCE:SOLUSDT', 'BINANCE:TRXUSDT', 'BINANCE:XRPUSDT',
  'NASDAQ:AAPL', 'NASDAQ:TSLA', 'NASDAQ:AMZN', 'NASDAQ:GOOGL', 'NASDAQ:NVDA',
  'NASDAQ:META', 'NYSE:C', 'NASDAQ:NFLX', 'NYSE:BABA', 'NASDAQ:ABNB',
];

export const defaultInputs: MOSTScreenerInputs = {
  length: 3,
  percent: 2.0,
  src: 'close',
  mav: 'VAR',
  t3a1: 0.7,
  maScreening: false,
  colorChangeScreening: false,
  showSignals: false,
  showLabel: true,
  labelSize: 'Normal',
  horizontalAxis: 20,
  verticalAxis: 1,
  upColor: '#00bb00',
  downColor: '#ff0000',
  ...(Object.fromEntries(SLOTS.map((s, i) => [`sh${s}`, i < 10])) as Record<`sh${Slot}`, boolean>),
  ...(Object.fromEntries(SLOTS.map((s) => [`tf${s}`, ''])) as Record<`tf${Slot}`, string>),
  ...(Object.fromEntries(SLOTS.map((s, i) => [`s${s}`, DEFAULT_SYMBOLS[i]])) as Record<`s${Slot}`, string>),
};

const GR_SC = 'SCREENER';
const GR_SY = 'SYMBOL';

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Moving Average Length', defval: 3, min: 1 },
  { id: 'percent', type: 'float', title: 'STOP LOSS Percent', defval: 2.0, min: 0, step: 0.1 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'mav', type: 'string', title: 'Moving Average Type', defval: 'VAR', options: ['SMA', 'EMA', 'WMA', 'DEMA', 'TMA', 'VAR', 'WWMA', 'ZLEMA', 'TSF', 'HULL', 'TILL'] },
  { id: 't3a1', type: 'float', title: 'TILLSON T3 Volume Factor', defval: 0.7, step: 0.1 },
  { id: 'maScreening', type: 'bool', title: 'Activate Moving Average Screening Mode', defval: false },
  { id: 'colorChangeScreening', type: 'bool', title: 'Activate Moving Average Color Change Screening Mode', defval: false },
  { id: 'showSignals', type: 'bool', title: 'Show Signals?', defval: false },
  { id: 'showLabel', type: 'bool', title: 'Show Label', defval: true, group: GR_SC },
  { id: 'labelSize', type: 'string', title: 'Label Size', defval: 'Normal', options: ['Auto', 'Tiny', 'Small', 'Normal', 'Large', 'Huge'], group: GR_SC },
  { id: 'horizontalAxis', type: 'int', title: 'Horizontal Axis', defval: 20, group: GR_SC, tooltip: 'Label Position x Axis' },
  { id: 'verticalAxis', type: 'int', title: 'Vertical Axis', defval: 1, group: GR_SC, tooltip: 'Label Position y Axis' },
  { id: 'upColor', type: 'color', title: 'Colours', defval: '#00bb00', group: GR_SC, inline: '0' },
  { id: 'downColor', type: 'color', title: '', defval: '#ff0000', group: GR_SC, inline: '0' },
  ...SLOTS.map((s, i): InputConfig => ({ id: `sh${s}`, type: 'bool', title: s, defval: i < 10, group: GR_SY, inline: s })),
  ...SLOTS.map((s): InputConfig => ({ id: `tf${s}`, type: 'timeframe', title: '', defval: '', group: GR_SY, inline: s })),
  ...SLOTS.map((s, i): InputConfig => ({ id: `s${s}`, type: 'symbol', title: '', defval: DEFAULT_SYMBOLS[i], group: GR_SY, inline: s })),
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MOST', color: '#880E4F', lineWidth: 3 },
  { id: 'plot1', title: 'exMov', color: '#2962FF', lineWidth: 2 },
];

export const metadata = {
  title: 'MOST Screener',
  shortTitle: 'MOST',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number, other = 0) => (Number.isNaN(v) ? other : v);

const GREEN = 'rgb(14, 241, 52)';
const RED = '#FF5252';
const CYAN = 'rgb(59, 248, 255)';
const GREY = '#686868';
const SIGNAL = '#0F18BF';

const arr = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));

/** The MOST lines, the signals and the direction of the last signal on `bars` (the chart or another symbol) */
function mostOf(bars: ReadonlyArray<Bar>, cfg: MOSTScreenerInputs) {
  const b = bars as Bar[];
  const n = b.length;
  const length = Math.trunc(cfg.length);
  const S = (values: number[]) => Series.fromArray(b, values);
  const src = arr(getSourceSeries(b, cfg.src));
  const srcS = S(src);
  const ema = (x: Series) => ta.ema(x, length);

  const ma = (): number[] => {
    switch (cfg.mav) {
      case 'SMA':
        return arr(ta.sma(srcS, length));
      case 'EMA':
        return arr(ema(srcS));
      case 'WMA':
        return arr(ta.wma(srcS, length));
      case 'DEMA': {
        const e1 = ema(srcS);
        const e2 = arr(ema(e1));
        return arr(e1).map((v, i) => 2 * v - e2[i]);
      }
      case 'TMA':
        // length / 2 of an input int is a fractional division
        return arr(ta.sma(ta.sma(srcS, Math.ceil(length / 2)), Math.floor(length / 2) + 1));
      case 'WWMA': {
        const alpha = 1 / length;
        let prev = NaN;
        return src.map((v) => (prev = alpha * v + (1 - alpha) * nz(prev)));
      }
      case 'ZLEMA': {
        const lag = length / 2 === Math.round(length / 2) ? length / 2 : (length - 1) / 2;
        return arr(ema(S(src.map((v, i) => v + v - (i >= lag ? src[i - lag] : NaN)))));
      }
      case 'TSF': {
        const lrc = arr(ta.linreg(srcS, length, 0));
        const lrc1 = arr(ta.linreg(srcS, length, 1));
        return lrc.map((v, i) => v + (v - lrc1[i]));
      }
      case 'HULL': {
        const half = arr(ta.wma(srcS, length / 2));
        const full = arr(ta.wma(srcS, length));
        return arr(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(length))));
      }
      case 'TILL': {
        const a = cfg.t3a1;
        const e1 = ema(srcS);
        const e2 = ema(e1);
        const e3 = ema(e2);
        const e4 = ema(e3);
        const e5 = ema(e4);
        const e6 = ema(e5);
        const [x3, x4, x5, x6] = [e3, e4, e5, e6].map(arr);
        const c1 = -a * a * a;
        const c2 = 3 * a * a + 3 * a * a * a;
        const c3 = -6 * a * a - 3 * a - 3 * a * a * a;
        const c4 = 1 + 3 * a + a * a * a + 3 * a * a;
        return x3.map((v, i) => c1 * x6[i] + c2 * x5[i] + c3 * x4[i] + c4 * v);
      }
      default: {
        // VAR: Chande-momentum adaptive average
        const alpha = 2 / (length + 1);
        const ud = src.map((v, i) => (i > 0 && gt(v, src[i - 1]) ? v - src[i - 1] : 0));
        const dd = src.map((v, i) => (i > 0 && lt(v, src[i - 1]) ? src[i - 1] - v : 0));
        const sumUd = arr(math.sum(S(ud), 9));
        const sumDd = arr(math.sum(S(dd), 9));
        let prev = NaN;
        return src.map((v, i) => {
          const cmo = nz((sumUd[i] - sumDd[i]) / (sumUd[i] + sumDd[i]));
          prev = nz(alpha * Math.abs(cmo) * v) + (1 - alpha * Math.abs(cmo)) * nz(prev);
          return prev;
        });
      }
    }
  };

  const exMov = ma();
  const most = new Array<number>(n);
  let longPrevBar = NaN;
  let shortPrevBar = NaN;
  let dirPrev = NaN;
  for (let i = 0; i < n; i++) {
    const m = exMov[i];
    const fark = m * cfg.percent * 0.01;
    let longStop = m - fark;
    const longStopPrev = nz(longPrevBar, longStop);
    longStop = gt(m, longStopPrev) ? Math.max(longStop, longStopPrev) : longStop;
    let shortStop = m + fark;
    const shortStopPrev = nz(shortPrevBar, shortStop);
    shortStop = lt(m, shortStopPrev) ? Math.min(shortStop, shortStopPrev) : shortStop;
    let dir = nz(dirPrev, 1);
    dir = dir === -1 && gt(m, shortStopPrev) ? 1 : dir === 1 && lt(m, longStopPrev) ? -1 : dir;
    most[i] = dir === 1 ? longStop : shortStop;
    longPrevBar = longStop;
    shortPrevBar = shortStop;
    dirPrev = dir;
  }

  const exS = S(exMov);
  let up: Series;
  let down: Series;
  if (cfg.maScreening && cfg.colorChangeScreening) {
    up = ta.crossover(exS, exS.offset(1));
    down = ta.crossunder(exS, exS.offset(1));
  } else if (cfg.maScreening) {
    const close = S(b.map((x) => x.close));
    up = ta.crossover(close, exS);
    down = ta.crossunder(close, exS);
  } else {
    up = ta.crossover(exS, S(most));
    down = ta.crossunder(exS, S(most));
  }
  const cro = arr(up).map((v) => v === 1);
  const cru = arr(down).map((v) => v === 1);
  // direction := cro ? 1 : cru ? -1 : direction[1] (na before the first signal)
  const direction = new Array<number>(n);
  for (let i = 0; i < n; i++) direction[i] = cro[i] ? 1 : cru[i] ? -1 : i > 0 ? direction[i - 1] : NaN;
  return { exMov, most, cro, cru, direction };
}

/** f_screener(): ta.barssince(x != x[1]) of the direction (na compares false) */
function barsSinceChange(direction: number[]): number[] {
  let last = -1;
  return direction.map((x, i) => {
    if (i > 0 && !Number.isNaN(x) && !Number.isNaN(direction[i - 1]) && x !== direction[i - 1]) last = i;
    return last < 0 ? NaN : i - last;
  });
}

/** Timeframe of a symbol: its input, else the chart timeframe */
const timeframeOf = (cfg: MOSTScreenerInputs, slot: Slot, chartTf: string) => (cfg[`tf${slot}`] !== '' ? cfg[`tf${slot}`] : chartTf);

/** One request per symbol switched on (a symbol and timeframe set twice is asked once) */
function symbolRequests(cfg: MOSTScreenerInputs, chartTf: string): SymbolRequest[] {
  const seen = new Map<string, SymbolRequest>();
  for (const slot of SLOTS) {
    if (!cfg[`sh${slot}`]) continue;
    const r = { symbol: cfg[`s${slot}`], timeframe: timeframeOf(cfg, slot, chartTf) };
    seen.set(`${r.symbol}|${r.timeframe}`, r);
  }
  return [...seen.values()];
}

/**
 * Bars of other symbols that the inputs need: each symbol switched on, on its timeframe or the chart timeframe of
 * the context ('' when the context has no timeframe: the port then asks for the chart timeframe read from the bar
 * spacing)
 */
export function requiredSymbols(inputs: Partial<MOSTScreenerInputs> = {}, chart?: ChartContext): SymbolRequest[] {
  const cfg = { ...defaultInputs, ...inputs };
  return symbolRequests(cfg, chartTimeframe([], chart));
}

const SIZES = { Auto: 'auto', Tiny: 'tiny', Small: 'small', Normal: 'normal', Large: 'large', Huge: 'huge' } as const;

export function calculate(
  bars: Bar[],
  inputs: Partial<MOSTScreenerInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const chartTf = chartTimeframe(bars, chart);
  const requests = symbolRequests(cfg, chartTf);
  const other = symbolBarsOf(requests, chart);

  const { exMov, most, cro, cru } = mostOf(bars, cfg);
  const both = cfg.maScreening && cfg.colorChangeScreening;
  const plot0 = bars.map((b, i) => ({ time: b.time, value: cfg.maScreening ? NaN : most[i] }));
  const plot1 = bars.map((b, i) => {
    const prev = i > 0 ? exMov[i - 1] : NaN;
    const color = both && gt(exMov[i], prev) ? GREEN : both && lt(exMov[i], prev) ? RED : CYAN;
    return { time: b.time, value: exMov[i], color };
  });

  const markers: MarkerData[] = [];
  if (cfg.showSignals) {
    for (let i = 0; i < n; i++) {
      if (cro[i]) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: SIGNAL, text: 'BUY',
          textColor: '#FFFFFF', size: 'tiny' });
      }
      if (cru[i]) {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: SIGNAL, text: 'SELL',
          textColor: '#FFFFFF', size: 'tiny' });
      }
    }
  }

  // The labels of each bar delete those of the bar before: only the labels of the last bar stay
  const labels: LabelData[] = [];
  if (cfg.showLabel && n > 0) {
    const last = n - 1;
    // direction and bar count of each requested symbol on the last chart bar
    const lastValues = new Map<string, { x: number; y: number; onBar: boolean }>();
    requests.forEach((r, k) => {
      const { direction } = mostOf(other[k], cfg);
      const since = barsSinceChange(direction);
      const j = securityOther(bars, other[k], r.timeframe, otherSymbolChart(bars, chart), { other: chart?.symbolInfo?.(r.symbol) })[last];
      lastValues.set(`${r.symbol}|${r.timeframe}`,
        j < 0 ? { x: NaN, y: NaN, onBar: false } : { x: direction[j], y: since[j], onBar: true });
    });

    const highest = arr(ta.highest(Series.fromArray(bars, bars.map((b) => b.high)), 200))[last];
    const hl2 = (bars[last].high + bars[last].low) / 2;
    const y = last > 200 ? highest * (1 + cfg.verticalAxis / 1000) : hl2 * (1 + cfg.verticalAxis / 1000);
    const xa = Math.trunc(cfg.horizontalAxis);
    const time = xa > 0 ? timeAfterLastBar(bars, xa, chart) : barTime(bars, last + xa);
    const size = SIZES[cfg.labelSize] ?? 'auto';
    const lines: { text: string; color: string }[] = [{ text: 'MOST Screener', color: GREY }];
    for (const slot of SLOTS) {
      const symbol = cfg[`s${slot}`];
      // f_screener(false), or no bar of the symbol yet: na direction, count and colour
      const v = cfg[`sh${slot}`]
        ? lastValues.get(`${symbol}|${timeframeOf(cfg, slot, chartTf)}`)!
        : { x: NaN, y: NaN, onBar: false };
      const mark = v.x === 1 ? '▲' : v.x === -1 ? '▼' : '■';
      const color = !v.onBar ? 'transparent' : v.x === 1 ? cfg.upColor : v.x === -1 ? cfg.downColor : GREY;
      lines.push({ text: `${mark} [${Number.isNaN(v.y) ? 'NaN' : String(v.y)}] ${symbol}`, color });
    }
    lines.forEach((l, k) => {
      labels.push({
        time,
        price: y,
        text: '\n\n'.repeat(2 * k + 1) + l.text,
        color: '#00000000',
        textColor: l.color,
        style: 'label_left',
        size,
        textAlign: 'right',
      });
    });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    labels,
  };
}

export const MOSTScreener = { calculate, metadata, defaultInputs, inputConfig, plotConfig, requiredSymbols };
