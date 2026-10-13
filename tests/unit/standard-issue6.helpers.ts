/**
 * Fixtures for the standard indicators added for the built-in list: 3,200 daily bars with a context that gives every
 * requested symbol (other symbols, higher timeframes of the chart symbol), and 4,000 60-minute bars with a context
 * that gives none (the ports fall back to the chart bars, or throw a MissingSymbolDataError).
 */

import { makeBars } from './community-top100.helpers';
import { fixtureContext } from './community-other-symbols.helpers';
import type { ChartContext } from '../../src/index';

export const STANDARD_ISSUE6_IDS = [
  '24-hour-volume', 'accumulation-distribution', 'adr-bars', 'auto-fib-extension', 'auto-fib-retracement',
  'auto-pitchfork', 'chandelier', 'correlation-coefficient', 'gaps', 'kama', 'linreg-channel',
  'multi-time-period-charts', 'performance', 'pivot-points-high-low', 'pivot-points-standard', 'pmo',
  'rob-booker-ziv-ghost-pivots', 'rsi-divergence-indicator', 'seasonality', 'smi', 'technicals', 'trading-sessions',
  'visible-average-price',
];

export const fixtures = {
  daily: { bars: makeBars(3200, 86400), chart: fixtureContext(3200) as ChartContext },
  m60: {
    bars: makeBars(4000, 3600),
    chart: { timeframe: '60', timezone: 'Etc/UTC', session: '24x7', bars: () => undefined } as ChartContext,
  },
};
