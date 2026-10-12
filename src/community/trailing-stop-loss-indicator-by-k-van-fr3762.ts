/**
 * Trailing Stop Loss Indicator
 *
 * K1 = the previous bar's low at the second latest bar whose low is above the previous low
 * (`valuewhen(low > low[1], low[1], 1)`), computed on the bars of the "Time Frame" input and shown on the chart.
 *
 * Higher timeframe: the bars of that timeframe are built from the chart bars (same symbol). Without lookahead, a
 * chart bar shows the value of the latest completed bar of the timeframe (the bar that completes a period shows that
 * period). A timeframe below the chart timeframe needs data that the bars do not carry: the port throws an Error.
 * The periods follow the exchange calendar of the chart context (time zone and session) when it is given, else
 * the UTC calendar and the bars (see src/anchor-period.ts).
 *
 * Reference: "Trailing Stop Loss Indicator by KıvanÇ fr3762" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { timeframe, mapToChart, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface TrailingStopLossIndicatorByKVanFr3762Inputs {
  /** Timeframe of the computation */
  res: string;
}

export const defaultInputs: TrailingStopLossIndicatorByKVanFr3762Inputs = {
  res: 'D',
};

export const inputConfig: InputConfig[] = [
  { id: 'res', type: 'timeframe', title: 'Time Frame', defval: 'D' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TSL', color: '#9C27B0', lineWidth: 2 },
];

export const metadata = {
  title: 'Trailing Stop Loss',
  shortTitle: 'TSL',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;

/** valuewhen(low > low[1], low[1], 1) on a list of bars */
function k1Of(bars: ReadonlyArray<Bar>): number[] {
  const out: number[] = new Array(bars.length);
  let last = NaN;
  let beforeLast = NaN;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0 && gt(bars[i].low, bars[i - 1].low)) {
      beforeLast = last;
      last = bars[i - 1].low;
    }
    out[i] = beforeLast;
  }
  return out;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrailingStopLossIndicatorByKVanFr3762Inputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const chartTf = chartTimeframe(bars, chart);
  let tsl: number[];
  if (cfg.res.trim() === '' || chartTf === '' || timeframe.in_seconds(cfg.res) === timeframe.in_seconds(chartTf)) {
    tsl = k1Of(bars);
  } else if (timeframe.in_seconds(cfg.res) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Trailing Stop Loss: the timeframe "${cfg.res}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  } else {
    // security(syminfo.tickerid, res, K1) without lookahead: the value of the latest completed period
    const { htf, group, latest } = higherTimeframeBars(bars, cfg.res, chart);
    tsl = mapToChart(k1Of(htf), group, latest, false, false);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: bars.map((b, i) => ({ time: b.time, value: tsl[i] })) },
  };
}

export const TrailingStopLossIndicatorByKVanFr3762 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
