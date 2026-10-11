/**
 * What the caller knows about the chart and its symbol, for the indicators whose output depends on it: the optional
 * third argument of `calculate(bars, inputs, chart)`.
 *
 * It is the oakscriptjs ChartContext (chart timeframe, exchange time zone, session, symbol tick, ticker id, state of
 * the last bar) with a few more values that scripts read from the chart: the symbol type and currency, the chart
 * colours and the current time. Every value is optional. Without a value the indicator uses the fallback given
 * below, which is what it did before this argument existed.
 */

import type { ChartContext as ScriptChartContext } from 'oakscriptjs/script';

export interface ChartContext extends ScriptChartContext {
  /** Symbol type (PineScript `syminfo.type`): "stock", "crypto", "forex", "futures", "index", "fund"... */
  symbolType?: string;
  /** Currency of the symbol (PineScript `syminfo.currency`), e.g. "USD" */
  currency?: string;
  /** Chart foreground colour (PineScript `chart.fg_color`); fallback: the dark theme value #DBDBDB */
  foregroundColor?: string;
  /** Chart background colour (PineScript `chart.bg_color`); fallback: the dark theme value #0F0F0F */
  backgroundColor?: string;
  /** Current time in ms (PineScript `timenow`); fallback: the clock of the computer */
  now?: number;
}

/** Symbol tick (PineScript `syminfo.mintick`); fallback 0.01 */
export function mintickOf(chart?: ChartContext): number {
  if (chart?.mintick !== undefined) return chart.mintick;
  if (chart?.minmove !== undefined && chart.pricescale !== undefined) return chart.minmove / chart.pricescale;
  return 0.01;
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
