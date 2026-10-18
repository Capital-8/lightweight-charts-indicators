/**
 * Instantaneous Trendline with Cloud
 *
 * Instantaneous trendline: filt = alpha * (src + 2 * src[1] + src[2]) / 4 + (1 - alpha) * filt[1] (src on the
 * first bar, na history read as 0). The line is lime when it rises, red when it falls, yellow when flat. A cloud
 * between the source and the line is lime when the source is above the line, red otherwise. Triangles mark the
 * crosses of the source over / under the line, drawn one bar back (offset -1).
 * Alerts (alertcondition, `alerts` of the result): 'ITL Bullish Cross' / 'ITL Bearish Cross', true on the bar where
 * the source crosses over / under the line.
 *
 * Reference: "Instantaneous Trendline with Cloud v2" by Sesilya
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface InstantaneousTrendlineWithCloudInputs {
  /** Smoothing coefficient */
  alphaIT: number;
  /** Source */
  itlSrc: SourceType;
  /** Line width of the trendline (the plot config keeps the default width 2) */
  itlWidth: number;
}

export const defaultInputs: InstantaneousTrendlineWithCloudInputs = {
  alphaIT: 0.2,
  itlSrc: 'close',
  itlWidth: 2,
};

const GROUP = 'Instantaneous Trendline Settings';

export const inputConfig: InputConfig[] = [
  { id: 'alphaIT', type: 'float', title: 'Alpha (Smoothing Coeff 0.1-0.3)', defval: 0.2, step: 0.01, group: GROUP },
  { id: 'itlSrc', type: 'source', title: 'Source (any plot / price)', defval: 'close', group: GROUP },
  { id: 'itlWidth', type: 'int', title: 'ITL Line Width', defval: 2, min: 1, max: 5, group: GROUP },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Price / Source', color: color.gray, lineWidth: 1 },
  { id: 'plot1', title: 'Instantaneous Trendline', color: color.lime, lineWidth: 2 },
];

export const metadata = {
  title: 'Instantaneous Trendline with Cloud v2',
  shortTitle: 'ITL_Cloud_v2',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number, r = 0) => (Number.isFinite(v) ? v : r);

export function calculate(
  bars: Bar[],
  inputs: Partial<InstantaneousTrendlineWithCloudInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const alpha = cfg.alphaIT;
  const src = getSourceSeries(bars, cfg.itlSrc).toArray().map((v) => v ?? NaN);

  // filt := barstate.isfirst ? src : alpha * ((src + 2 * nz(src[1]) + nz(src[2])) / 4) + (1 - alpha) * nz(filt[1])
  const it: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i === 0) {
      it[i] = src[i];
    } else {
      const s2 = i >= 2 ? src[i - 2] : NaN;
      it[i] = alpha * ((src[i] + 2 * nz(src[i - 1]) + nz(s2)) / 4) + (1 - alpha) * nz(it[i - 1]);
    }
  }

  const bullFill = String(color.new(color.lime, 80));
  const bearFill = String(color.new(color.red, 80));
  const plot0 = bars.map((b, i) => ({ time: b.time, value: src[i], color: color.gray }));
  const plot1 = bars.map((b, i) => {
    const prev = i > 0 ? nz(it[i - 1], it[i]) : it[i];
    const c = gt(it[i], prev) ? color.lime : lt(it[i], prev) ? color.red : color.yellow;
    return { time: b.time, value: Number.isFinite(it[i]) ? it[i] : NaN, color: c };
  });
  // fill(plotPrice, plotITL, color = isBullish ? color.new(color.lime, 80) : color.new(color.red, 80))
  const fillColors = bars.map((_b, i) => (gt(src[i], it[i]) ? bullFill : bearFill));

  // ta.crossover / ta.crossunder (exact comparisons); plotshape(..., offset = -1): drawn on the bar before
  const srcS = Series.fromArray(bars, src);
  const itS = Series.fromArray(bars, it);
  const bullCross = ta.crossover(srcS, itS).toArray();
  const bearCross = ta.crossunder(srcS, itS).toArray();
  const markers: MarkerData[] = [];
  for (let i = 1; i < n; i++) {
    if (bullCross[i]) {
      markers.push({ time: bars[i - 1].time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'tiny' });
    }
    if (bearCross[i]) {
      markers.push({ time: bars[i - 1].time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Trend Cloud' }, colors: fillColors }],
    markers,
    // alertcondition(bullCross, "ITL Bullish Cross", ...) / alertcondition(bearCross, "ITL Bearish Cross", ...)
    alerts: alertStates(alertConditions, bars, [bullCross.map(Boolean), bearCross.map(Boolean)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ITL Bullish Cross', message: 'Price crossed ABOVE Instantaneous Trendline (bullish signal).' },
  { id: 'alert1', title: 'ITL Bearish Cross', message: 'Price crossed BELOW Instantaneous Trendline (bearish signal).' },
];

export const InstantaneousTrendlineWithCloud = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
