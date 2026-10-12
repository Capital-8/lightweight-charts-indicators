/**
 * Fixture context for the ports that read other symbols: the bars of every requested symbol are a seeded random walk
 * on the same daily times as the chart bars, with a seed of its own, on a 24/7 UTC calendar.
 */

import { makeBars } from './community-top100.helpers';
import type { ChartContext, SymbolRequest } from '../../src/index';

const STEP: Record<string, number> = { '': 86400, D: 86400, '1D': 86400, W: 7 * 86400, '1W': 7 * 86400, M: 30 * 86400, '1M': 30 * 86400 };

function seedOf(text: string): number {
  let h = 7;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 100003;
  return h;
}

/** Bars of another symbol: the fixture walk scaled by a factor from the symbol name */
export function otherBars(r: SymbolRequest, count: number) {
  const step = STEP[r.timeframe] ?? 86400;
  const k = 0.5 + (seedOf(`${r.symbol}|${r.timeframe}`) % 1000) / 500;
  const n = Math.ceil((count * 86400) / step);
  return makeBars(n, step).map((b) => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k }));
}

/** Daily chart context that gives every requested symbol */
export function fixtureContext(count: number): ChartContext {
  return {
    timeframe: '1D',
    timezone: 'Etc/UTC',
    session: '24x7',
    bars: (symbol, timeframe) => otherBars({ symbol, timeframe }, count),
    symbolInfo: () => ({ timezone: 'Etc/UTC', session: '24x7' }),
  };
}
