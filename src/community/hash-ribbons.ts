/**
 * Hash Ribbons (Capriole Investments)
 *
 * Miner capitulation from the bitcoin hash rate (a daily series of another symbol): a short (30) and a long (60)
 * SMA of the hash rate, computed on its daily bars. "Ribbons": both SMAs, the short one red below the long one (with
 * a red fill between them) and lime above; "Oscillator": columns of (short - long) / short in %, red below 0 and
 * blue above. Signals at the top of the pane: capitulation (the short SMA crosses under the long one), miner
 * capitulation (short below long), recovering (short below long and above its values of the 3 bars before),
 * recovered (the short SMA crosses over the long one) and buy (the 10-day SMA of the chart symbol crosses over its
 * 20-day SMA after a recovery that came after the last capitulation and the last cross under, or the 10-day above
 * the 20-day on a recovery). The background is red 2 days around the halvings of 2012, 2016 and 2020 (dates in the
 * exchange time zone); a table names the source.
 *
 * Other symbols: the bars of the hash rate symbol ("Source Hash Rate") come from the `bars` accessor of the chart
 * context on "D" (`requiredSymbols`); without them the port throws a MissingSymbolDataError. The 10 and 20-day SMAs of
 * the chart symbol are its daily bars (`request.security` on "D"). On the open last bar (`chart.lastBarConfirmed`
 * false) the hash rate is read with lookahead, as the original; there the daily SMAs of an intraday chart keep the
 * value of the previous bar except on the last bar of the day, and the value of the developing daily bar is not
 * modelled (it only changes the buy signal of that bar).
 *
 * Limit of the port: the three alert conditions give no output.
 *
 * Reference: "Hash Ribbons" by capriole_charles
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, timeframe, time as pineTime,
  type Bar, type IndicatorResult, type InputConfig, type PlotConfig,
} from 'oakscriptjs';
import type { BgColorData, MarkerData, TableData } from '../types';
import { chartTimeframe, higherTimeframeBars, periodChanges } from '../anchor-period';
import { lastBarConfirmedOf, symbolBarsOf, timezoneOf, type ChartContext, type SymbolRequest } from '../chart-context';
import { securityOtherValues } from '../other-symbol';

type HashSource = 'QUANDL:BCHAIN/HRATE' | 'INTOTHEBLOCK:BTC_HASHRATE';

export interface HashRibbonsInputs {
  /** Plot Type */
  type: 'Ribbons' | 'Oscillator';
  /** Hash Rate Short SMA (days) */
  lenS: number;
  /** Hash Rate Long SMA (days) */
  lenL: number;
  signals: boolean;
  plotHalvings: boolean;
  raw: boolean;
  source: HashSource;
}

export const defaultInputs: HashRibbonsInputs = {
  type: 'Ribbons',
  lenS: 30,
  lenL: 60,
  signals: true,
  plotHalvings: true,
  raw: false,
  source: 'INTOTHEBLOCK:BTC_HASHRATE',
};

export const inputConfig: InputConfig[] = [
  { id: 'type', type: 'string', title: 'Plot Type', defval: 'Ribbons', options: ['Ribbons', 'Oscillator'] },
  { id: 'lenS', type: 'int', title: 'Hash Rate Short SMA (days).', defval: 30 },
  { id: 'lenL', type: 'int', title: 'Hash Rate Long SMA (days).', defval: 60 },
  { id: 'signals', type: 'bool', title: 'Plot Signals', defval: true },
  { id: 'plotHalvings', type: 'bool', title: 'Plot Halvings', defval: true },
  { id: 'raw', type: 'bool', title: 'Plot Raw Hash Rate', defval: false },
  {
    id: 'source', type: 'string', title: 'Source Hash Rate', defval: 'INTOTHEBLOCK:BTC_HASHRATE',
    options: ['QUANDL:BCHAIN/HRATE', 'INTOTHEBLOCK:BTC_HASHRATE'],
  },
];

const RED = '#FF5252';
const LIME = '#00E676';
const GREEN = '#4CAF50';
const GRAY = '#787B86';
const BLUE = '#2962FF';
const FILL_RED = '#FF5252B3';
const HALVING_BG = '#FF5252CC';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HR Raw', color: GREEN, lineWidth: 1 },
  { id: 'plot1', title: 'HR SMA Long', color: GRAY, lineWidth: 2 },
  { id: 'plot2', title: 'HR SMA Short', color: LIME, lineWidth: 2 },
  { id: 'plot3', title: 'Oscillator', color: BLUE, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'Hash Ribbons (Capriole Investments)',
  shortTitle: 'Hash Ribbons (Capriole Investments)',
  overlay: false,
};

/** Other symbols the inputs need: the hash rate on "D" */
export function requiredSymbols(inputs: Partial<HashRibbonsInputs> = {}): SymbolRequest[] {
  return [{ symbol: { ...defaultInputs, ...inputs }.source, timeframe: 'D' }];
}

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

export function calculate(
  bars: Bar[], inputs: Partial<HashRibbonsInputs> = {}, chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[]; bgColors: BgColorData[]; tables: TableData[] } {
  const { type, lenS, lenL, signals, plotHalvings, raw, source } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const [hr] = symbolBarsOf(requiredSymbols({ source }), chart);
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : Number(v)));
  const realtime = !lastBarConfirmedOf(chart);

  // request.security(source, 'D', expr, gaps_off, lookahead on / off), the expression on the hash rate's bars
  const hrClose = hr.map((b) => b.close);
  const hrShort = A(ta.sma(Series.fromArray(hr, hrClose), lenS));
  const hrLong = A(ta.sma(Series.fromArray(hr, hrClose), lenL));
  const sec = (values: number[], lookahead: boolean) =>
    securityOtherValues(bars, hr, 'D', values, { lookahead, symbol: source }, chart);
  const live = { raw: sec(hrClose, true), short: sec(hrShort, true), long: sec(hrLong, true) };
  const hist = { raw: sec(hrClose, false), short: sec(hrShort, false), long: sec(hrLong, false) };

  // request.security(syminfo.tickerid, 'D', ta.sma(close, 10 / 20), lookahead off)
  const tf = chartTimeframe(bars, chart);
  const dailySma = (len: number): number[] => {
    if (tf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds('D')) {
      return A(ta.sma(Series.fromArray(bars, bars.map((b) => b.close)), len));
    }
    if (timeframe.in_seconds(tf) > timeframe.in_seconds('D')) {
      throw new Error(`The daily SMAs need a chart timeframe of 1 day or lower (chart: ${tf})`);
    }
    const res = higherTimeframeBars(bars, 'D', chart);
    const sma = A(ta.sma(Series.fromArray(res.htf, res.htf.map((b) => b.close)), len));
    return res.latest.map((g) => (g < 0 ? NaN : sma[g]));
  };
  const dailyS10 = dailySma(10);
  const dailyS20 = dailySma(20);

  // is_newbar('D'): ta.change(time('D')) != 0 (false on the first bar); since_new_bar = ta.barssince(...)
  const newDay = periodChanges(bars, 'D', chart);
  const sinceNewBar = A(ta.barssince(Series.fromArray(bars, newDay.map((x) => (x ? 1 : 0)))));
  const dTotalBars = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const prevSince = i > 0 ? sinceNewBar[i - 1] : NaN;
    dTotalBars[i] = sinceNewBar[i] === 0 ? prevSince : (i > 0 ? dTotalBars[i - 1] : NaN);
  }

  // barstate.isrealtime: the open last bar
  const isRt = (i: number) => realtime && i === n - 1;
  const hrShortS = new Array<number>(n);
  const hrLongS = new Array<number>(n);
  const hrRawS = new Array<number>(n);
  const s10 = new Array<number>(n);
  const s20 = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const rt = isRt(i);
    hrShortS[i] = rt ? live.short[i] : hist.short[i];
    hrLongS[i] = rt ? live.long[i] : hist.long[i];
    hrRawS[i] = rt ? live.raw[i] : hist.raw[i];
    const sameBar = sinceNewBar[i] === dTotalBars[i];
    s10[i] = rt ? (sameBar ? dailyS10[i] : (i > 0 ? s10[i - 1] : NaN)) : dailyS10[i];
    s20[i] = rt ? (sameBar ? dailyS20[i] : (i > 0 ? s20[i - 1] : NaN)) : dailyS20[i];
  }

  const S = (arr: number[]) => Series.fromArray(bars, arr);
  const capitulation = A(ta.crossunder(S(hrShortS), S(hrLongS))).map((x) => x === 1);
  const recovered = A(ta.crossover(S(hrShortS), S(hrLongS))).map((x) => x === 1);
  const s10Up = A(ta.crossover(S(s10), S(s20))).map((x) => x === 1);
  const s10Down = A(ta.crossunder(S(s10), S(s20)));
  const sinceRecovered = A(ta.barssince(S(recovered.map((x) => (x ? 1 : 0)))));
  const sinceS10Down = A(ta.barssince(S(s10Down)));
  const sinceCapitulation = A(ta.barssince(S(capitulation.map((x) => (x ? 1 : 0)))));
  const lt = (a: number, b: number) => gt(b, a);

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const fillColors: string[] = [];
  const markers: MarkerData[] = [];
  const bgColors: BgColorData[] = [];
  const tz = timezoneOf(chart);
  const unit = chart?.timeUnit === 'ms' || (chart?.timeUnit === undefined && n > 0 && bars[0].time >= 1e12) ? 1 : 1000;
  // timestamp(y, m, d, 0, 0) in the exchange time zone; the band of 2 days on each side
  const band = 2 * 24 * 60 * 60 * 1000;
  const halvings = [[2012, 11, 28], [2016, 7, 9], [2020, 5, 12]].map(([y, m, d]) => pineTime.timestamp(tz, y, m, d, 0, 0));

  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const short = hrShortS[i];
    const long = hrLongS[i];
    const below = lt(short, long);
    const minerCapitulation = below;
    const recovering = gt(short, i >= 1 ? hrShortS[i - 1] : NaN) && gt(short, i >= 2 ? hrShortS[i - 2] : NaN)
      && gt(short, i >= 3 ? hrShortS[i - 3] : NaN) && minerCapitulation;
    const buy = (s10Up[i] && lt(sinceRecovered[i], sinceS10Down[i]) && lt(sinceRecovered[i], sinceCapitulation[i]))
      || (gt(s10[i], s20[i]) && recovered[i]);
    const diff = ((short - long) / short) * 100;

    const num = (v: number) => (Number.isFinite(v) ? v : NaN);
    plot0.push({ time: t, value: raw ? num(hrRawS[i]) : NaN });
    plot1.push({ time: t, value: type === 'Ribbons' ? num(long) : NaN });
    plot2.push({ time: t, value: type === 'Ribbons' ? num(short) : NaN, color: below ? RED : LIME });
    plot3.push({ time: t, value: type === 'Oscillator' ? num(diff) : NaN, color: lt(diff, 0) ? RED : BLUE });
    fillColors.push(below ? FILL_RED : 'transparent');

    if (signals) {
      if (capitulation[i]) {
        markers.push({ time: t, position: 'top', shape: 'circle', color: '#787B8680', size: 'normal', text: 'Capitulation', textColor: '#363A4580' });
      }
      if (minerCapitulation) markers.push({ time: t, position: 'top', shape: 'circle', color: '#4CAF501A', size: 'normal' });
      if (recovering) markers.push({ time: t, position: 'top', shape: 'circle', color: '#4CAF5080', size: 'normal' });
      if (recovered[i]) markers.push({ time: t, position: 'top', shape: 'circle', color: LIME, size: 'normal', textColor: '#FFFFFF' });
      if (buy) markers.push({ time: t, position: 'top', shape: 'circle', color: BLUE, size: 'normal', text: 'Buy', textColor: BLUE });
    }

    // three bgcolor() calls, one per halving
    const ms = t * unit;
    for (const h of halvings) {
      if (plotHalvings && ms >= h - band && ms <= h + band) bgColors.push({ time: t, color: HALVING_BG });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    fills: [{ plot1: 'plot1', plot2: 'plot2', options: { title: 'Plots Background', color: FILL_RED }, colors: fillColors }],
    markers,
    bgColors,
    tables: n > 0 ? [{
      position: 'bottom_left', columns: 1, rows: 1, bgColor: '#FFFFFF', borderWidth: 1,
      cells: [{
        column: 0, row: 0, text: 'Source: Capriole Investments Limited', bgColor: '#FFFFFF', textColor: '#363A45',
        width: 20, height: 7, textSize: 'normal', textHAlign: 'left',
      }],
    }] : [],
  };
}

export const HashRibbons = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  requiredSymbols,
};
