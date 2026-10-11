/**
 * Nadaraya-Watson Smoothers [LuxAlgo]
 *
 * Kernel regression of the source with a Gaussian window of the given bandwidth.
 *
 * "Repainting Smoothing" on (default): on the last bar, the smoothed value of each of the last 500 bars is the mean
 * of the last 500 source values, each weighted by the Gaussian of its distance to that bar. The curve is drawn with
 * lines between consecutive points (one colour when the curve goes up, the other when it goes down), and a triangle
 * label marks every bar where the direction changes. The whole curve is computed again on every new bar, so past
 * values change. A small table says that this mode is on.
 *
 * "Repainting Smoothing" off: the plot "NWE Endpoint Estimator" is the Gaussian weighted mean of the last 500 source
 * values ending on the current bar (no future value is used); it needs 500 bars.
 *
 * Reference: "Nadaraya-Watson Smoothers [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { array, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { LabelData, LineDrawingData, TableData } from '../types';
import { barTime } from '../bar-time';

export interface NadarayaWatsonSmoothersInputs {
  /** Bandwidth of the Gaussian window */
  h: number;
  src: SourceType;
  /** Repainting Smoothing */
  repaint: boolean;
  upCss: string;
  dnCss: string;
}

export const defaultInputs: NadarayaWatsonSmoothersInputs = {
  h: 8,
  src: 'close',
  repaint: true,
  upCss: '#00897B',
  dnCss: '#FF5252',
};

export const inputConfig: InputConfig[] = [
  { id: 'h', type: 'float', title: 'Bandwidth', defval: 8, min: 0 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  {
    id: 'repaint', type: 'bool', title: 'Repainting Smoothing', defval: true,
    tooltip: 'Repainting is an effect where the indicators historical output is subject to change over time. Disabling repainting will cause the indicator to output the endpoint of the estimator',
  },
  { id: 'upCss', type: 'color', title: 'Colors', defval: '#00897B', inline: 'inline1', group: 'Style' },
  { id: 'dnCss', type: 'color', title: '', defval: '#FF5252', inline: 'inline1', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'NWE Endpoint Estimator', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Nadaraya-Watson Smoothers [LuxAlgo]',
  shortTitle: 'LuxAlgo - Nadaraya-Watson Smoothers',
  overlay: true,
};

/** Number of bars of the window (and of lines of the curve) */
const WINDOW = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

/** Gaussian window */
const gauss = (x: number, h: number) => Math.exp(-(Math.pow(x, 2) / (h * h * 2)));

export function calculate(
  bars: Bar[],
  inputs: Partial<NadarayaWatsonSmoothersInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { h, repaint, upCss, dnCss } = cfg;
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // End point method
  const out: number[] = new Array(n).fill(NaN);
  if (!repaint) {
    const coefs: number[] = [];
    for (let i = 0; i < WINDOW; i++) coefs.push(gauss(i, h));
    const den = array.sum(coefs);
    for (let t = 0; t < n; t++) {
      let sum = 0;
      for (let i = 0; i < WINDOW; i++) sum += (t - i >= 0 ? src[t - i] : NaN) * coefs[i];
      out[t] = sum / den;
    }
  }
  // With the repainting mode `out` is 0 / 0 (na) on every bar: nothing is plotted and the colour is the second one
  const plot0 = bars.map((b, t) => ({
    time: b.time,
    value: repaint || !Number.isFinite(out[t]) ? NaN : out[t],
    color: t > 0 && gt(out[t], out[t - 1]) ? upCss : dnCss,
  }));

  // Repainting curve, on the last bar
  const lines: LineDrawingData[] = [];
  const labels: LabelData[] = [];
  const last = n - 1;
  if (repaint && last >= 1) {
    const m = Math.min(WINDOW - 1, last - 1);
    let y1 = NaN;
    let y1d = NaN;
    for (let i = 0; i <= m; i++) {
      let sum = 0;
      let sumw = 0;
      for (let j = 0; j <= m; j++) {
        const w = gauss(i - j, h);
        sum += src[last - j] * w;
        sumw += w;
      }
      const y2 = sum / sumw;
      const d = y2 - y1;
      // A line with an na end (the first one) is not drawn
      if (!isNaN(y1) && !isNaN(y2)) {
        lines.push({
          time1: barTime(bars, last - i + 1), price1: y1, time2: barTime(bars, last - i), price2: y2,
          color: gt(y2, y1) ? dnCss : upCss, width: 2,
        });
      }
      if (lt(d * y1d, 0)) {
        const up = lt(y1d, 0);
        labels.push({
          time: barTime(bars, last - i + 1), price: src[last - i], text: up ? '▲' : '▼', color: 'transparent',
          style: up ? 'label_up' : 'label_down', textColor: up ? upCss : dnCss, textAlign: 'center',
        });
      }
      y1 = y2;
      y1d = d;
    }
  }

  // Dashboard
  const tables: TableData[] = [{
    position: 'top_right', columns: 1, rows: 1,
    cells: repaint ? [{ column: 0, row: 0, text: 'Repainting Mode Enabled', textColor: '#FFFFFF', textSize: 'small' }] : [],
    bgColor: '#1e222d', borderColor: '#373a46', borderWidth: 1, frameColor: '#373a46', frameWidth: 1,
  }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    lines,
    labels,
    tables,
  };
}

export const NadarayaWatsonSmoothers = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
