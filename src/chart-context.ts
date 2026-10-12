/**
 * What the caller knows about the chart and its symbol, for the indicators whose output depends on it: the optional
 * third argument of `calculate(bars, inputs, chart)`.
 *
 * It is the oakscriptjs ChartContext (chart timeframe, exchange time zone, session, symbol tick, ticker id, symbol
 * type and currency, chart colours, current time, state of the last bar) with the visible range of the chart. Every
 * value is optional. Without a value the indicator uses the fallback given below, which is what it did before this
 * argument existed.
 */

import type { Bar } from 'oakscriptjs';
import type { ChartContext as ScriptChartContext } from 'oakscriptjs/script';

export interface ChartContext extends ScriptChartContext {
  /**
   * Time of the first bar visible on the chart, in ms (PineScript `chart.left_visible_bar_time`); fallback: the
   * first bar given to the indicator
   */
  leftVisibleBarTime?: number;
  /**
   * Time of the last bar visible on the chart, in ms (PineScript `chart.right_visible_bar_time`); fallback: the
   * last bar given to the indicator. An indicator that reads the visible range (`usesVisibleRange` in its registry
   * entry) must be calculated again when the user scrolls or zooms the chart.
   */
  rightVisibleBarTime?: number;
  /**
   * Bars of another symbol (PineScript `request.security` of another ticker): the caller returns the bars it has
   * loaded for `symbol` ("NASDAQ:MSFT", "CRYPTOCAP:BTC") on `timeframe` (the timeframe the indicator asks for, the
   * chart timeframe when the script uses `timeframe.period`), in the time unit of the chart bars, or `undefined`
   * when it has not loaded them yet. The indicator then throws a `MissingSymbolDataError` that lists what it needs:
   * load those bars and calculate again. An indicator that reads other symbols has `requiredSymbols` in its registry
   * entry.
   */
  bars?: (symbol: string, timeframe: string) => Bar[] | undefined;
  /**
   * Exchange time zone and session of another symbol (as `timezone` / `session` of this context), for the indicators
   * that read its bars: they need them to know when its bars close and which trading day they belong to. Without
   * them the other symbol is taken as trading around the clock in UTC when its bars include weekends, else as
   * trading on the calendar of the chart symbol.
   */
  symbolInfo?: (symbol: string) => Pick<ChartContext, 'timezone' | 'session'> | undefined;
}

/** Bars of another symbol that an indicator needs */
export interface SymbolRequest {
  /** Ticker id, e.g. "NASDAQ:MSFT" */
  symbol: string;
  /** Timeframe, e.g. "1D", "60" */
  timeframe: string;
}

/**
 * Thrown by an indicator that needs bars of another symbol that the chart context does not give (no `bars`
 * accessor, or the accessor returned `undefined`): load the bars of `requests` and calculate again.
 */
export class MissingSymbolDataError extends Error {
  readonly requests: SymbolRequest[];

  constructor(requests: SymbolRequest[]) {
    super(`Bars of other symbols are needed: ${requests.map((r) => `${r.symbol} (${r.timeframe})`).join(', ')}`);
    this.name = 'MissingSymbolDataError';
    this.requests = requests;
  }
}

/**
 * Bars of other symbols from the chart context, all at once: throws one `MissingSymbolDataError` that lists every
 * request the context cannot give, so that the caller loads them together.
 */
export function symbolBarsOf(requests: SymbolRequest[], chart?: ChartContext): Bar[][] {
  const out = requests.map((r) => chart?.bars?.(r.symbol, r.timeframe));
  const missing = requests.filter((_, i) => out[i] === undefined);
  if (missing.length) throw new MissingSymbolDataError(missing);
  return out as Bar[][];
}

/** Symbol tick (PineScript `syminfo.mintick`); fallback 0.01 */
export function mintickOf(chart?: ChartContext): number {
  if (chart?.mintick !== undefined) return chart.mintick;
  if (chart?.minmove !== undefined && chart.pricescale !== undefined) return chart.minmove / chart.pricescale;
  return 0.01;
}

/**
 * Session hours of the symbol (the hours of `chart.session`, a string or the `session` of a session object), e.g.
 * "0930-1600"; fallback: an empty string
 */
export function sessionHoursOf(chart?: ChartContext): string {
  return (typeof chart?.session === 'string' ? chart.session : chart?.session?.session) ?? '';
}

/** Exchange time zone (PineScript `syminfo.timezone`); fallback UTC */
export function timezoneOf(chart?: ChartContext): string {
  return chart?.timezone ?? 'Etc/UTC';
}

/** PineScript `syminfo.tickerid` ("NASDAQ:AAPL"); fallback: an empty string */
export function tickeridOf(chart?: ChartContext): string {
  return chart?.tickerid ?? '';
}

/** PineScript `syminfo.ticker` ("AAPL"): the ticker id without its exchange prefix; fallback: an empty string */
export function tickerOf(chart?: ChartContext): string {
  const id = tickeridOf(chart);
  return id.includes(':') ? id.slice(id.indexOf(':') + 1) : id;
}

/** PineScript `syminfo.type`; fallback: an empty string (no type-specific rule applies) */
export function symbolTypeOf(chart?: ChartContext): string {
  return chart?.symbolType ?? '';
}

/** PineScript `syminfo.currency`; fallback "USD" */
export function currencyOf(chart?: ChartContext): string {
  return chart?.currency ?? 'USD';
}

/** PineScript `chart.fg_color`; fallback #DBDBDB */
export function foregroundColorOf(chart?: ChartContext): string {
  return chart?.foregroundColor ?? '#DBDBDB';
}

/** PineScript `chart.bg_color`; fallback #0F0F0F */
export function backgroundColorOf(chart?: ChartContext): string {
  return chart?.backgroundColor ?? '#0F0F0F';
}

/**
 * True when the last bar is closed (PineScript `barstate.isconfirmed` on the last bar). Fallback true: without a
 * context every bar given to an indicator is taken as closed.
 */
export function lastBarConfirmedOf(chart?: ChartContext): boolean {
  return chart?.lastBarConfirmed ?? true;
}

/** PineScript `timenow` (ms); fallback: the clock of the computer */
export function nowOf(chart?: ChartContext): number {
  return chart?.now ?? Date.now();
}

/** The bars visible on the chart: indexes in `bars` and times in ms. */
export interface VisibleRange {
  /** Index of the first visible bar */
  left: number;
  /** Index of the last visible bar */
  right: number;
  /** PineScript `chart.left_visible_bar_time` (ms) */
  leftTime: number;
  /** PineScript `chart.right_visible_bar_time` (ms) */
  rightTime: number;
}

/**
 * Visible range of the chart (PineScript `chart.left_visible_bar_time` / `chart.right_visible_bar_time`); fallback:
 * all the bars. The times of the context are in ms; `Bar.time` is in seconds unless `chart.timeUnit` is 'ms'. A
 * visible time between two bars is taken as the next bar on the left side and the previous bar on the right side.
 */
export function visibleRangeOf(bars: ReadonlyArray<{ time: number }>, chart?: ChartContext): VisibleRange {
  const toMs = chart?.timeUnit === 'ms' ? 1 : 1000;
  const last = bars.length - 1;
  if (last < 0) return { left: 0, right: -1, leftTime: NaN, rightTime: NaN };
  const leftTime = chart?.leftVisibleBarTime ?? bars[0].time * toMs;
  const rightTime = chart?.rightVisibleBarTime ?? bars[last].time * toMs;
  let left = 0;
  while (left < last && bars[left].time * toMs < leftTime) left++;
  let right = last;
  while (right > 0 && bars[right].time * toMs > rightTime) right--;
  return { left, right, leftTime, rightTime };
}
