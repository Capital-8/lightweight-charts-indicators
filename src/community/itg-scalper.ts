/**
 * ITG Scalper Buy/Sell [Complector]
 *
 * A triple exponential average of the close, TEMA = 3 * (ema1 - ema2) + ema3 (three chained EMAs of 'TEMA period'),
 * drawn lime when it rises (or stays equal) and red when it falls. A buy signal is given when the TEMA rises and the
 * last signal was not a buy; a sell signal when it falls and the last signal was a buy. With the noise filter a buy
 * also needs MACD >= signal and a sell MACD < signal, where MACD = ema(close, fast) - ema(close, slow) and the signal
 * is its simple average, on the chart timeframe or on another timeframe of the same symbol.
 *
 * Signals are drawn as labels with the close of the signal bar as text (at most 50 labels are kept), or as shapes
 * without a text. A sell is red when the sell price is above the last buy price, else yellow. An optional label
 * above the last bar shows the change in percent since the last signal.
 *
 * Close used: the original asks the close of the ticker built from the exchange prefix and the ticker of the chart
 * symbol, on the chart timeframe. That is the chart symbol itself, so the port reads the close of the bars.
 *
 * Other timeframe of the filter: the bars of that timeframe are built from the chart bars (so its averages start at
 * the first chart bar), and a chart bar shows the values of the latest completed bar of that timeframe. A timeframe
 * below the chart timeframe needs data that the bars do not carry: the port throws an Error.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars. `timeframe`, when given, is the chart timeframe; without
 * it the chart timeframe is read from the bar spacing. A signal needs a closed bar: `lastBarConfirmed` of the
 * context says whether the last bar is closed (without a context it is).
 *
 * The 2 alert conditions of the script have no output.
 *
 * Reference: "ITG Scalper Buy/Sell [Complector]" by Complector
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Complector
 */

import { ta, Series, color, str, timeframe, barInterval, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, MarkerData } from '../types';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface ItgScalperInputs {
  /** Plot TEMA? */
  shc: boolean;
  /** Green/redshift on/off? (off: the line is aqua) */
  cc: boolean;
  /** Show buy/sell? */
  showtext: boolean;
  /** Use labels? (max 50); off: shapes without a price */
  uselabel: boolean;
  /** Show % change since last buy/sell */
  showperc: boolean;
  /** Noise filter on/off? */
  nfilter: boolean;
  /** Use Current Chart Resolution for filter? */
  useCurrentRes: boolean;
  /** Timeframe of the filter when `useCurrentRes` is false */
  resCustom: string;
  /** TEMA period */
  len: number;
  FfastLength: number;
  FslowLength: number;
  FsignalLength: number;
}

export const defaultInputs: ItgScalperInputs = {
  shc: true,
  cc: true,
  showtext: true,
  uselabel: true,
  showperc: false,
  nfilter: true,
  useCurrentRes: true,
  resCustom: '60',
  len: 14,
  FfastLength: 12,
  FslowLength: 26,
  FsignalLength: 9,
};

export const inputConfig: InputConfig[] = [
  { id: 'shc', type: 'bool', title: 'Plot TEMA?', defval: true },
  { id: 'cc', type: 'bool', title: 'Green/redshift on/off?', defval: true },
  { id: 'showtext', type: 'bool', title: 'Show buy/sell?', defval: true },
  { id: 'uselabel', type: 'bool', title: 'Use labels? (max 50)', defval: true },
  { id: 'showperc', type: 'bool', title: 'Show % change since last buy/sell', defval: false },
  { id: 'nfilter', type: 'bool', title: 'Noise filter on/off?', defval: true },
  { id: 'useCurrentRes', type: 'bool', title: 'Use Current Chart Resolution for filter?', defval: true },
  { id: 'resCustom', type: 'timeframe', title: 'Use Different Timeframe for filter? Uncheck Box Above', defval: '60' },
  { id: 'len', type: 'int', title: 'TEMA period', defval: 14 },
  { id: 'FfastLength', type: 'int', title: 'Filter fast length', defval: 12, min: 1 },
  { id: 'FslowLength', type: 'int', title: 'Filter slow length', defval: 26, min: 1 },
  { id: 'FsignalLength', type: 'int', title: 'Filter signal length', defval: 9, min: 1 },
];

// Colour constants of Pine version 4
const LIME = '#00E676';
const RED = '#FF5252';
const AQUA = '#00BCD4';
const ORANGE = '#FF9800';
const YELLOW = '#FFEB3B';
const BLACK = '#363A45';
const WHITE = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TEMA', color: LIME, lineWidth: 2 },
];

export const metadata = {
  title: 'ITG Scalper Buy/Sell [Complector]',
  shortTitle: 'ITG_Scalper',
  overlay: true,
};

/** Labels kept by Pine (the default of study()) */
const MAX_LABELS = 50;

/** Pine float comparisons: a >= b when a - b >= -1e-10, a < b when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;
const lt = (a: number, b: number) => b - a > EPS;
const gt = (a: number, b: number) => a - b > EPS;

/** truncate(number, decimals) of the script: int(number * 10^decimals) / 10^decimals */
function truncate(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

/**
 * security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart bars, and
 * for each chart bar the index of the latest completed bar of that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`ITG Scalper: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, latest: exchange.latest };
  const n = bars.length;
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });

  // A bar completes its period when its close reaches the end of the period. Symbols that trade every day follow
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period.
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf) : [];
  // The last bar of a symbol that does not trade every day: its period is complete when the next possible bar is in
  // another period. The next bar is on the same day while the bar is earlier in the day than the last bar of the
  // trading day before; else it is on the next weekday.
  let lastEnds = true;
  if (!calendar && n > 1) {
    const DAY = 86400000;
    const toMs = (t: number) => (ms ? t : t * 1000);
    const lastMs = toMs(bars[n - 1].time);
    const day = Math.floor(lastMs / DAY) * DAY;
    let next = lastMs + toMs(interval);
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(ms ? next : next / 1000)) next += DAY;
    }
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf);
    lastEnds = withNext[n] !== withNext[n - 1];
  }
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 ? lastEnds : starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

/** A label of the script (`dead` = deleted) */
interface Lb extends LabelData {
  dead: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ItgScalperInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // realC = security(tickerid(syminfo.prefix, syminfo.ticker), timeframe.period, close): the close of the bars
  const realC = Series.fromArray(bars, bars.map((b) => b.close));
  const ema1 = ta.ema(realC, cfg.len);
  const ema2 = ta.ema(ema1, cfg.len);
  const ema3 = A(ta.ema(ema2, cfg.len));
  const e1 = A(ema1);
  const e2 = A(ema2);
  // out1 = security(t_id, timeframe.period, out): the same series
  const out1 = e1.map((v, i) => 3 * (v - e2[i]) + ema3[i]);

  // Filter: MACD and its signal on the bars of Fres
  const { htf, latest } = timeframeBars(bars, cfg.useCurrentRes ? '' : cfg.resCustom, chart);
  const fSource = Series.fromArray(htf, htf.map((b) => b.close));
  const fastMA = A(ta.ema(fSource, cfg.FfastLength));
  const slowMA = A(ta.ema(fSource, cfg.FslowLength));
  const fMacd = fastMA.map((v, i) => v - slowMA[i]);
  const fSignal = A(ta.sma(Series.fromArray(htf, fMacd), cfg.FsignalLength));

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const markers: MarkerData[] = [];
  const labels: Lb[] = [];
  const addLabel = (label: Lb) => {
    labels.push(label);
    // above max + 5 labels the oldest are deleted until max remain (the label of a `var` variable is kept)
    if (labels.length > MAX_LABELS + 5) {
      let extra = labels.length - MAX_LABELS;
      for (let k = 0; k < labels.length && extra > 0;) {
        if (labels[k] === percLab) {
          k++;
        } else {
          labels[k].dead = true;
          labels.splice(k, 1);
          extra--;
        }
      }
    }
  };
  let percLab: Lb | null = null;

  let buyprice = 0;
  let sellprice = 0;
  let lastTran = false;
  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const prev = i > 0 ? out1[i - 1] : NaN;
    const maUp = ge(out1[i], prev);
    const maDown = lt(out1[i], prev);
    const col = cfg.cc ? (maUp ? LIME : maDown ? RED : LIME) : AQUA;
    const tNon = maUp === maDown;

    const outMacD = latest[i] >= 0 ? fMacd[latest[i]] : NaN;
    const outSignal = latest[i] >= 0 ? fSignal[latest[i]] : NaN;
    const fBuy = ge(outMacD, outSignal) || !cfg.nfilter;
    const fSell = lt(outMacD, outSignal) || !cfg.nfilter;

    // plot(out1, color = col, transp = iff(shc, 0, 100))
    plot0.push({ time: bar.time, value: out1[i], color: cfg.shc ? col : String(color.new(col, 100)) });

    const confirmed = i < n - 1 || lastBarConfirmedOf(chart);
    const long = maUp && !lastTran && !tNon && fBuy && confirmed;
    const short = maDown && lastTran && !tNon && fSell && confirmed;
    if (long) {
      buyprice = bar.close;
      lastTran = true;
    }
    if (short) {
      sellprice = bar.close;
      lastTran = false;
    }

    // Percent change since the last buy / sell: one label, made again on each bar
    if (cfg.showperc) {
      const percVal = lastTran ? (100 * (bar.close - buyprice)) / buyprice : (100 * (bar.close - sellprice)) / sellprice;
      const percCol = ge(percVal, 0) ? LIME : ORANGE;
      if (percLab) {
        percLab.dead = true;
        labels.splice(labels.indexOf(percLab), 1);
      }
      percLab = {
        dead: false, time: bar.time, price: bar.high, yloc: 'abovebar', color: BLACK, textColor: percCol, style: 'none',
        text: `${str.tostring(truncate(percVal, 2))} %`,
      };
      addLabel(percLab);
    }

    const goodshort = short && gt(sellprice, buyprice);
    const sellColor = goodshort ? RED : YELLOW;
    if (cfg.showtext && long) {
      if (cfg.uselabel) {
        addLabel({
          dead: false, time: bar.time, price: bar.high, text: str.tostring(truncate(buyprice, 8)), yloc: 'belowbar',
          color: LIME, textColor: WHITE, style: 'triangleup', size: 'small',
        });
      } else {
        markers.push({ time: bar.time, position: 'belowBar', shape: 'triangleUp', color: LIME, size: 'small' });
      }
    }
    if (cfg.showtext && short) {
      if (cfg.uselabel) {
        addLabel({
          dead: false, time: bar.time, price: bar.high, text: str.tostring(truncate(sellprice, 8)), yloc: 'abovebar',
          color: sellColor, textColor: WHITE, style: 'triangledown', size: 'small',
        });
      } else {
        markers.push({ time: bar.time, position: 'aboveBar', shape: 'triangleDown', color: sellColor, size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    labels: labels.map(({ dead: _dead, ...label }) => label),
  };
}

export const ItgScalper = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
