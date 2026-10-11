/**
 * Chart Context
 * What the demo page knows about its chart and symbol, given to every indicator as the third argument of calculate
 */

import { ColorType, type IChartApi } from 'lightweight-charts';
import type { Bar } from 'oakscriptjs';
import type { ChartContext } from '../../src/index';

/**
 * Symbol of the loaded data (public/data/SPX.csv): closed daily bars of the S&P 500 index
 */
const symbol: ChartContext = {
  tickerid: 'SP:SPX',
  symbolType: 'index',
  currency: 'USD',
  mintick: 0.01,
  // the CSV stamps its daily bars at 00:00 UTC, so the bar times are read in UTC (with the New York time zone a
  // daily bar would fall on the evening before); a caller with bars stamped at the session open gives
  // 'America/New_York' and '0930-1600'
  timezone: 'Etc/UTC',
  lastBarConfirmed: true, // the CSV is history
};

/**
 * Chart timeframe ("15", "60", "1D", "1W", "1M") from the most frequent spacing of the bars (times in seconds).
 * Weekends, holidays and gaps of the data are less frequent than the spacing of two consecutive bars.
 */
export function timeframeOf(bars: Bar[]): string {
  const counts = new Map<number, number>();
  for (let i = 1; i < bars.length; i++) {
    const spacing = bars[i].time - bars[i - 1].time;
    if (spacing > 0) counts.set(spacing, (counts.get(spacing) ?? 0) + 1);
  }

  let seconds = 86400; // one bar or none: daily
  let best = 0;
  for (const [spacing, count] of counts) {
    if (count > best || (count === best && spacing < seconds)) {
      seconds = spacing;
      best = count;
    }
  }

  if (seconds < 60) return `${seconds}S`;
  if (seconds < 86400) return `${Math.round(seconds / 60)}`;
  const days = Math.round(seconds / 86400);
  if (days < 7) return `${days}D`;
  if (days < 28) return `${Math.round(days / 7)}W`;
  return `${Math.round(days / 30)}M`;
}

/**
 * First and last bar visible on the chart (indexes in `bars`), from the visible logical range of the time scale: the
 * bars whose centre is in view, as the visible time range of lightweight-charts. Logical index i is bar i (the
 * candlestick series holds every bar; the slots the renderer adds are after the last bar). Clamped to the loaded
 * bars. Null when the chart has no range yet (no data).
 */
export function visibleBarsOf(bars: Bar[], chart: IChartApi): { left: number; right: number } | null {
  const range = chart.timeScale().getVisibleLogicalRange();
  if (!range || bars.length === 0) return null;
  const last = bars.length - 1;
  const left = Math.min(Math.max(Math.ceil(range.from), 0), last);
  const right = Math.max(Math.min(Math.floor(range.to), last), left);
  return { left, right };
}

/**
 * Build the context for the loaded bars. The colours are read from the chart options, so they follow its theme; the
 * visible range is the one of the chart at the time of the call (bar times in seconds, the context takes ms).
 */
export function buildChartContext(bars: Bar[], chart: IChartApi): ChartContext {
  const { background, textColor } = chart.options().layout;
  const visible = visibleBarsOf(bars, chart);

  return {
    ...symbol,
    timeframe: timeframeOf(bars),
    foregroundColor: textColor,
    backgroundColor: background.type === ColorType.Solid ? background.color : background.topColor,
    ...(visible && {
      leftVisibleBarTime: bars[visible.left].time * 1000,
      rightVisibleBarTime: bars[visible.right].time * 1000,
    }),
  };
}
