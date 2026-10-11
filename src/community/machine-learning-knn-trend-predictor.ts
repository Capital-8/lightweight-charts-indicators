/**
 * Machine Learning: kNN Trend Predictor
 *
 * A k-nearest-neighbour style curve: on each bar the distance |src - src[1]| is pushed into a ring of K distances,
 * and the neighbour value (src[1] when the new distance is below the smallest stored distance, else src) is pushed
 * into a ring of N neighbours. The kNN curve is the average of the stored neighbours (na values skipped). The
 * direction is bullish when the curve is below the source (src[1] when the look-ahead adjustment is off), bearish
 * when above. The curve is green / red by direction and a fill goes from the curve to the candle body edge
 * (min(open, close) when bullish, max(open, close) when bearish). Optional Long / Short characters mark the
 * direction changes.
 *
 * Last bar: a trading signal needs a closed bar. The port reads the state of the last bar from the optional third
 * argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Machine Learning: kNN Trend Predictor" by tkarolak
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © tkarolak
 */

import { getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface MachineLearningKnnTrendPredictorInputs {
  /** Source */
  source: SourceType;
  /** Number of stored neighbours (N, min 2) */
  N: number;
  /** Number of stored distances (K, 1..500) */
  K: number;
  /** Compare the curve with the current source (true) or the previous source (false) */
  ADJ: boolean;
  /** Show the Long / Short characters */
  SIG: boolean;
}

export const defaultInputs: MachineLearningKnnTrendPredictorInputs = {
  source: 'close',
  N: 50,
  K: 100,
  ADJ: true,
  SIG: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close' },
  { id: 'N', type: 'int', title: 'Nearest Neighbors (N)', defval: 50, min: 2 },
  { id: 'K', type: 'int', title: 'Distance Ranking (K)', defval: 100, min: 1, max: 500 },
  { id: 'ADJ', type: 'bool', title: 'Prevent Look-Ahead Bias', defval: true },
  { id: 'SIG', type: 'bool', title: 'Show Trading Signals', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'kNN Curve', color: '#2962FF', lineWidth: 2 },
  { id: 'plot1', title: 'Price Line', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Machine Learning: kNN Trend Predictor',
  shortTitle: 'ML Trend',
  overlay: true,
  format: 'price' as const,
  precision: 4,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MachineLearningKnnTrendPredictorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const data = getSourceSeries(bars, cfg.source).toArray().map((v) => v ?? NaN);

  // var neighbors = array.new_float(N, na); var distances = array.new_float(K, na)
  const neighbors: number[] = new Array(cfg.N).fill(NaN);
  const distances: number[] = new Array(cfg.K).fill(NaN);
  const adj = cfg.ADJ ? 0 : 1;

  const trend: number[] = new Array(n);
  const direction: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const cur = data[i];
    const prev = i > 0 ? data[i - 1] : NaN;
    neighbors.shift();
    distances.shift();
    const d = Math.sqrt(Math.pow(cur - prev, 2));
    distances.push(d);
    // distances.min(): na values skipped (na when all are na)
    let mn = NaN;
    for (const x of distances) if (!isNaN(x) && (isNaN(mn) || x < mn)) mn = x;
    neighbors.push(lt(d, mn) ? prev : cur);

    // array.avg(neighbors): na values skipped
    let sum = 0;
    let cnt = 0;
    for (const x of neighbors) {
      if (!isNaN(x)) {
        sum += x;
        cnt++;
      }
    }
    const prediction = cnt > 0 ? sum / cnt : NaN;
    const ref = i - adj >= 0 ? data[i - adj] : NaN;
    trend[i] = prediction;
    direction[i] = lt(prediction, ref) ? 1 : gt(prediction, ref) ? -1 : 0;
  }

  const getColor = (dir: number, transparency: number) => (dir === 1 ? String(color.new(color.green, transparency))
    : dir === -1 ? String(color.new(color.red, transparency)) : 'transparent');

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    // startLongTrade = confirmed and direction == 1 and direction[1] != 1 (na != 1 is false)
    const prevDir = i > 0 ? direction[i - 1] : NaN;
    const startLong = barIsConfirmed(i) && direction[i] === 1 && !isNaN(prevDir) && prevDir !== 1;
    const startShort = barIsConfirmed(i) && direction[i] === -1 && !isNaN(prevDir) && prevDir !== -1;
    // plotchar(SIG and startLongTrade, 'Long', '▲', location.belowbar, size.tiny, color.green)
    if (cfg.SIG && startLong) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: 'transparent', text: '▲',
        textColor: color.green, size: 'tiny' });
    }
    if (cfg.SIG && startShort) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: 'transparent', text: '▼',
        textColor: color.red, size: 'tiny' });
    }
  }

  return {
    metadata: {
      title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay,
      format: metadata.format, precision: metadata.precision,
    },
    plots: {
      // plot(trend, 'kNN Curve', getColor(direction, 5), 2)
      plot0: bars.map((b, i) => ({ time: b.time, value: trend[i], color: getColor(direction[i], 5) })),
      // plot(direction == 1 ? min(close, open) : direction == -1 ? max(close, open) : na, display = display.none)
      plot1: bars.map((b, i) => ({
        time: b.time,
        value: direction[i] === 1 ? Math.min(b.close, b.open) : direction[i] === -1 ? Math.max(b.close, b.open) : NaN,
      })),
    },
    // fill(trendPlot, priceLine, getColor(direction, 90), fillgaps = false)
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: direction.map((d) => getColor(d, 90)) }],
    markers,
  };
}

export const MachineLearningKnnTrendPredictor = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
