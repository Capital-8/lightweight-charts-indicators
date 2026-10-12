/**
 * Unit tests for the bars of other symbols: `securityOther` (PineScript `request.security` of another ticker) on small
 * bar sets that cover the measured rules, the spread symbols ("A * B", "A / B"), and `symbolBarsOf` /
 * `MissingSymbolDataError` of the chart context.
 */

import { describe, it, expect } from 'vitest';
import {
  securityOther, securityOtherValues, spreadSymbols, spreadBars, spreadOptions, symbolBarsOf, MissingSymbolDataError,
  type ChartContext,
} from '../../src/index';

/** UNIX seconds of a UTC date and time (month 1-12). */
const utc = (y: number, m: number, d: number, h = 0, mi = 0) => Date.UTC(y, m - 1, d, h, mi) / 1000;
const bars = (times: number[]) => times.map((time) => ({ time, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
const days = (y: number, m: number, from: number, to: number, h = 0, mi = 0) =>
  Array.from({ length: to - from + 1 }, (_, k) => utc(y, m, from + k, h, mi));

const NY = { timezone: 'America/New_York', session: '0930-1600' };
const CRYPTO = { timezone: 'Etc/UTC', session: '24x7' };
// a stock: Monday 05/10/2026 to Monday 12/10/2026, daily bars at the session start (09:30 New York = 13:30 UTC)
const stockDays = [...days(2026, 10, 5, 9, 13, 30), utc(2026, 10, 12, 13, 30)];
// a 24x7 symbol: every day from Saturday 03/10/2026 to Monday 12/10/2026 at 00:00 UTC
const cryptoDays = days(2026, 10, 3, 12);

describe('securityOther: daily bars of symbols on other calendars', () => {
  it('a stock chart shows the 24x7 bar that closed before the stock bar closes (lookahead off), the same day with lookahead on', () => {
    const chart: ChartContext = { timeframe: '1D', ...NY };
    // Monday's stock bar closes at 20:00 UTC: the 24x7 Monday bar closes at 00:00 the day after, Sunday's is shown
    expect(securityOther(bars(stockDays), bars(cryptoDays), '', {}, chart)).toEqual([1, 2, 3, 4, 5, 8]);
    expect(securityOther(bars(stockDays), bars(cryptoDays), '', { lookahead: true }, chart)).toEqual([2, 3, 4, 5, 6, 9]);
  });

  it('a 24x7 chart shows the stock bar of the same day, repeats it on weekends (gaps off), na with gaps on', () => {
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO };
    const stock = bars(stockDays);
    // Saturday 03 and Sunday 04 come before the first stock bar: na
    expect(securityOther(bars(cryptoDays), stock, '', NY, chart)).toEqual([-1, -1, 0, 1, 2, 3, 4, 4, 4, 5]);
    expect(securityOther(bars(cryptoDays), stock, '', { ...NY, gaps: true }, chart)).toEqual([-1, -1, 0, 1, 2, 3, 4, -1, -1, 5]);
    expect(securityOther(bars(cryptoDays), stock, '', { ...NY, lookahead: true }, chart)).toEqual([-1, -1, 0, 1, 2, 3, 4, 4, 4, 5]);
    expect(securityOther(bars(cryptoDays), stock, '', { ...NY, lookahead: true, gaps: true }, chart))
      .toEqual([-1, -1, 0, 1, 2, 3, 4, -1, -1, 5]);
  });

  it('takes the times in ms with chart.timeUnit "ms"', () => {
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO, timeUnit: 'ms' };
    const ms = (t: number[]) => bars(t.map((x) => x * 1000));
    expect(securityOther(ms(cryptoDays), ms(stockDays), '', NY, chart)).toEqual([-1, -1, 0, 1, 2, 3, 4, 4, 4, 5]);
  });

  it('dates the trading day in the exchange time zone (a session that opens on the previous UTC day)', () => {
    // Sydney, 10:00 to 16:00 (UTC+11 in October): the bar of Tuesday 13/10 opens on Monday 12/10 at 23:00 UTC
    const sydney = { timezone: 'Australia/Sydney', session: '1000-1600' };
    const other = bars([utc(2026, 10, 11, 23), utc(2026, 10, 12, 23), utc(2026, 10, 13, 23)]);
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO };
    const chartBars = bars(days(2026, 10, 12, 14));
    expect(securityOther(chartBars, other, '', { ...sydney, lookahead: true }, chart)).toEqual([0, 1, 2]);
    expect(securityOther(chartBars, other, '', sydney, chart)).toEqual([0, 1, 2]);
  });

  it('reads the time zone and session of the other symbol from chart.symbolInfo', () => {
    const sydney = { timezone: 'Australia/Sydney', session: '1000-1600' };
    const other = bars([utc(2026, 10, 11, 23), utc(2026, 10, 12, 23), utc(2026, 10, 13, 23)]);
    const chartBars = bars(days(2026, 10, 12, 14));
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO, symbolInfo: (s) => (s === 'ASX:BHP' ? sydney : undefined) };
    const given = securityOther(chartBars, other, '', { ...sydney, lookahead: true }, chart);
    expect(given).toEqual([0, 1, 2]);
    expect(securityOther(chartBars, other, '', { symbol: 'ASX:BHP', lookahead: true }, chart)).toEqual(given);
    // unknown symbol: the UTC fallback dates the Sydney bars one day early
    expect(securityOther(chartBars, other, '', { symbol: 'ASX:XYZ', lookahead: true }, chart)).toEqual([1, 2, 2]);
  });
});

describe('securityOther: intraday bars', () => {
  // a stock on 60 minutes: 13:30 to 19:30 UTC (the last bar of the day closes at 20:00); a 24x7 symbol on full hours
  const stockHours = Array.from({ length: 7 }, (_, k) => utc(2026, 10, 5, 13 + k, 30));
  const cryptoHours = Array.from({ length: 10 }, (_, k) => utc(2026, 10, 5, 12 + k));

  it('a stock chart shows the 24x7 bar that closed before it closes, and the bar open at its open', () => {
    const chart: ChartContext = { timeframe: '60', ...NY };
    const expected = [1, 2, 3, 4, 5, 6, 7];
    expect(securityOther(bars(stockHours), bars(cryptoHours), '', {}, chart)).toEqual(expected);
    expect(securityOther(bars(stockHours), bars(cryptoHours), '', { lookahead: true }, chart)).toEqual(expected);
  });

  it('a 24x7 chart shows the short last stock bar of the day as soon as it closes', () => {
    const chart: ChartContext = { timeframe: '60', ...CRYPTO };
    // the 19:30 bar closes at 20:00 with the 19:00 bar of the chart: the 18:30 bar is never shown with gaps on
    expect(securityOther(bars(cryptoHours), bars(stockHours), '', NY, chart)).toEqual([-1, -1, 0, 1, 2, 3, 4, 6, 6, 6]);
    expect(securityOther(bars(cryptoHours), bars(stockHours), '', { ...NY, gaps: true }, chart))
      .toEqual([-1, -1, 0, 1, 2, 3, 4, 6, -1, -1]);
    expect(securityOther(bars(cryptoHours), bars(stockHours), '', { ...NY, lookahead: true }, chart))
      .toEqual([-1, -1, 0, 1, 2, 3, 4, 5, 6, 6]);
  });

  it('a daily request on an intraday chart: the last completed day, or the day of the bar with lookahead on', () => {
    const chart: ChartContext = { timeframe: '60', ...NY };
    // 24x7 days from Saturday 03/10: Monday's stock hours show Sunday (lookahead off) or Monday (lookahead on)
    expect(securityOther(bars(stockHours), bars(cryptoDays), 'D', {}, chart)).toEqual(new Array(7).fill(1));
    expect(securityOther(bars(stockHours), bars(cryptoDays), 'D', { lookahead: true }, chart)).toEqual(new Array(7).fill(2));
    expect(securityOther(bars(stockHours), bars(cryptoDays), 'D', { gaps: true }, chart)).toEqual([1, -1, -1, -1, -1, -1, -1]);
  });
});

describe('securityOther: higher timeframes', () => {
  it('a week that opens on a Tuesday after a holiday starts on Monday (lookahead on)', () => {
    const stock = { timezone: 'America/New_York', session: { session: '0930-1600', holidays: '20260119' } };
    // weeks of 12/01/2026 (opens Monday 14:30 UTC) and of 19/01/2026 (Monday is a holiday: opens Tuesday)
    const weeks = bars([utc(2026, 1, 12, 14, 30), utc(2026, 1, 20, 14, 30)]);
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO };
    const chartBars = bars(days(2026, 1, 17, 21));
    expect(securityOther(chartBars, weeks, 'W', { ...stock, lookahead: true }, chart)).toEqual([0, 0, 1, 1, 1]);
    // lookahead off: the week of 12/01 closed on Friday 16/01, the week of 19/01 is not closed yet
    expect(securityOther(chartBars, weeks, 'W', stock, chart)).toEqual([0, 0, 0, 0, 0]);
  });

  it('a week of the same calendar appears on the bar that closes it; the open last bar shows the open week', () => {
    const chart: ChartContext = { timeframe: '1D', ...NY };
    const weeks = bars([utc(2026, 9, 28, 13, 30), utc(2026, 10, 5, 13, 30), utc(2026, 10, 12, 13, 30)]);
    // no calendar for the other symbol: its bars open at the week starts of the chart calendar, which is used
    expect(securityOther(bars(stockDays), weeks, 'W', {}, chart)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(securityOther(bars(stockDays), weeks, 'W', { gaps: true }, chart)).toEqual([0, -1, -1, -1, 1, -1]);
    expect(securityOther(bars(stockDays), weeks, 'W', { lookahead: true }, chart)).toEqual([1, 1, 1, 1, 1, 2]);
    // realtime updates of the open last bar (gaps off): the open week
    const open: ChartContext = { ...chart, lastBarConfirmed: false };
    expect(securityOther(bars(stockDays), weeks, 'W', {}, open)).toEqual([0, 0, 0, 0, 1, 2]);
    expect(securityOther(bars(stockDays), weeks, 'W', { gaps: true }, open)).toEqual([0, -1, -1, -1, 1, -1]);
  });

  it('rejects a timeframe lower than the chart timeframe', () => {
    expect(() => securityOther(bars(stockDays), bars(cryptoDays), '60', {}, { timeframe: '1D', ...NY })).toThrow(RangeError);
  });

  it('gives na everywhere without bars of the other symbol', () => {
    expect(securityOther(bars(stockDays), [], 'D', {}, { timeframe: '1D', ...NY })).toEqual(new Array(6).fill(-1));
    expect(securityOther([], bars(stockDays), 'D')).toEqual([]);
  });
});

describe('securityOtherValues', () => {
  it('maps the values of an expression on the other bars to the chart bars, NaN for na', () => {
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO };
    const stock = bars(stockDays).map((b, k) => ({ ...b, close: 100 + k }));
    const expected = [NaN, NaN, 100, 101, 102, 103, 104, 104, 104, 105];
    expect(securityOtherValues(bars(cryptoDays), stock, '', stock.map((b) => b.close), NY, chart)).toEqual(expected);
    expect(securityOtherValues(bars(cryptoDays), stock, '', (b) => b.map((x) => x.close), NY, chart)).toEqual(expected);
  });
});

describe('spread symbols', () => {
  // an economic series at 00:00 UTC (Thursday 01/10 and Tuesday 06/10/2026) and a rate whose trading day starts at
  // 22:00 UTC the day before (bars of Monday 05/10 to Friday 09/10/2026 open on 04/10 to 08/10 at 22:00 UTC)
  const closes = (times: number[], first: number) => bars(times).map((b, k) => ({ ...b, close: first + k }));
  const series = closes([utc(2026, 10, 1), utc(2026, 10, 6)], 100);
  const rate = closes(days(2026, 10, 4, 8, 22), 2);
  const bySymbol = new Map([['ECONOMICS:XXM2', series], ['FX_IDC:XXXUSD', rate]]);
  const spread = (b: Array<{ time: number; close: number }>) => b.map((x) => [x.time, x.close]);

  it('gives the tickers of an expression and the options of its bars', () => {
    expect(spreadSymbols('ECONOMICS:XXM2 * FX_IDC:XXXUSD')).toEqual(['ECONOMICS:XXM2', 'FX_IDC:XXXUSD']);
    expect(spreadSymbols('ECONOMICS:FIM2/FX_IDC:USDFIM')).toEqual(['ECONOMICS:FIM2', 'FX_IDC:USDFIM']);
    expect(spreadSymbols(' ECONOMICS:USM2 ')).toEqual(['ECONOMICS:USM2']);
    expect(spreadOptions('ECONOMICS:USM2')).toEqual({ symbol: 'ECONOMICS:USM2' });
    expect(spreadOptions('A * B')).toEqual({ timezone: 'Etc/UTC', session: '24x7' });
  });

  it('one bar per trading day of either part from the later first day, last closes of both parts', () => {
    // without symbolInfo a bar that opens at 12:00 UTC or later belongs to the next UTC day
    const expected = [5, 6, 7, 8, 9].map((d, k) => [utc(2026, 10, d), [200, 303, 404, 505, 606][k]]);
    expect(spread(spreadBars('ECONOMICS:XXM2 * FX_IDC:XXXUSD', bySymbol))).toEqual(expected);
    // the same days from the time zone and session of the rate, in ms with chart.timeUnit 'ms'
    const ms = (b: typeof rate) => b.map((x) => ({ ...x, time: x.time * 1000 }));
    const chart: ChartContext = {
      timeUnit: 'ms',
      symbolInfo: (s) => (s === 'FX_IDC:XXXUSD' ? { timezone: 'Etc/UTC', session: '2200-2200' } : undefined),
    };
    const get = (s: string) => (s === 'ECONOMICS:XXM2' ? ms(series) : s === 'FX_IDC:XXXUSD' ? ms(rate) : undefined);
    expect(spread(spreadBars('ECONOMICS:XXM2*FX_IDC:XXXUSD', get, chart)))
      .toEqual(expected.map(([t, c]) => [t * 1000, c]));
    expect(spread(spreadBars('ECONOMICS:XXM2 / FX_IDC:XXXUSD', bySymbol)).map(([, c]) => c))
      .toEqual([100 / 2, 101 / 3, 101 / 4, 101 / 5, 101 / 6]);
  });

  it('gives the bars of one ticker as they are, none without bars, and throws for a missing ticker', () => {
    expect(spreadBars('ECONOMICS:XXM2', bySymbol)).toEqual(series);
    expect(spreadBars('ECONOMICS:XXM2 * FX_IDC:XXXUSD', new Map([['ECONOMICS:XXM2', series], ['FX_IDC:XXXUSD', []]])))
      .toEqual([]);
    expect(() => spreadBars('ECONOMICS:XXM2 * FX_IDC:YYYUSD', bySymbol)).toThrow(RangeError);
  });

  it('merges with securityOtherValues on the 24x7 UTC calendar', () => {
    const chart: ChartContext = { timeframe: '1D', ...CRYPTO };
    // 24x7 chart from Saturday 03/10 to Sunday 11/10/2026: na before the first spread bar, repeated on the weekend
    const chartBars = bars(days(2026, 10, 3, 11));
    const expr = 'ECONOMICS:XXM2 * FX_IDC:XXXUSD';
    expect(securityOtherValues(chartBars, spreadBars(expr, bySymbol, chart), 'D', (b) => b.map((x) => x.close),
      spreadOptions(expr), chart)).toEqual([NaN, NaN, 200, 303, 404, 505, 606, 606, 606]);
  });
});

describe('symbolBarsOf / MissingSymbolDataError', () => {
  const msft = bars(stockDays);
  const btc = bars(cryptoDays);
  const accessor = (symbol: string, timeframe: string) =>
    symbol === 'NASDAQ:MSFT' && timeframe === '1D' ? msft : symbol === 'BITSTAMP:BTCUSD' ? btc : undefined;

  it('gives the bars of every request in order', () => {
    const chart: ChartContext = { bars: accessor };
    expect(symbolBarsOf([{ symbol: 'BITSTAMP:BTCUSD', timeframe: 'W' }, { symbol: 'NASDAQ:MSFT', timeframe: '1D' }], chart))
      .toEqual([btc, msft]);
    expect(symbolBarsOf([], chart)).toEqual([]);
  });

  it('throws one error that lists every missing request', () => {
    const chart: ChartContext = { bars: accessor };
    const requests = [
      { symbol: 'NASDAQ:MSFT', timeframe: '1D' }, { symbol: 'NASDAQ:MSFT', timeframe: 'W' },
      { symbol: 'CRYPTOCAP:BTC', timeframe: '1D' },
    ];
    let error: unknown;
    try {
      symbolBarsOf(requests, chart);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(MissingSymbolDataError);
    expect(error).toBeInstanceOf(Error);
    const missing = error as MissingSymbolDataError;
    expect(missing.name).toBe('MissingSymbolDataError');
    expect(missing.requests).toEqual([requests[1], requests[2]]);
    expect(missing.message).toContain('NASDAQ:MSFT (W)');
    expect(missing.message).toContain('CRYPTOCAP:BTC (1D)');
  });

  it('lists all requests without a bars accessor or without a context', () => {
    const requests = [{ symbol: 'NASDAQ:MSFT', timeframe: '1D' }, { symbol: 'BITSTAMP:BTCUSD', timeframe: '60' }];
    expect(() => symbolBarsOf(requests, {})).toThrow(MissingSymbolDataError);
    try {
      symbolBarsOf(requests);
    } catch (e) {
      expect((e as MissingSymbolDataError).requests).toEqual(requests);
    }
    expect.assertions(2);
  });
});
