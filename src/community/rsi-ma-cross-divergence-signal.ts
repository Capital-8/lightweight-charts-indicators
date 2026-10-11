/**
 * RSI MA Cross + Divergence Signal
 *
 * The RSI of the source is crossed with its moving average (SMA / EMA / WMA). A long signal needs a cross up of the
 * RSI over its MA on a bar with a bullish divergence: the low is below the low of the last confirmed price pivot low
 * and the RSI is above the RSI of the last confirmed RSI pivot low (pivots with left = right = lookback). A short
 * signal is the mirror (cross down, high above the last pivot high, RSI below the last RSI pivot high). Signals are
 * drawn as triangles with a text and as 'L' / 'S' characters at the bottom / top of the chart.
 *
 * Last bar: with the bar close option a signal needs a closed bar. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "RSI MA Cross + Divergence Signal (fixed)" by noxum
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface RsiMaCrossDivergenceSignalInputs {
  rsiLength: number;
  /** Length of the moving average of the RSI */
  maLength: number;
  maType: 'SMA' | 'EMA' | 'WMA';
  /** RSI source */
  src: SourceType;
  /** Pivot left / right length of the divergence detection */
  lookback: number;
  /** Only signal on a closed bar */
  confirmClose: boolean;
}

export const defaultInputs: RsiMaCrossDivergenceSignalInputs = {
  rsiLength: 14,
  maLength: 9,
  maType: 'SMA',
  src: 'close',
  lookback: 5,
  confirmClose: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'rsiLength', type: 'int', title: 'RSI Length', defval: 14, min: 2 },
  { id: 'maLength', type: 'int', title: 'RSI MA Length', defval: 9, min: 1 },
  { id: 'maType', type: 'string', title: 'MA Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA'] },
  { id: 'src', type: 'source', title: 'RSI Source', defval: 'close' },
  { id: 'lookback', type: 'int', title: 'Divergence Lookback (L=R)', defval: 5, min: 2 },
  { id: 'confirmClose', type: 'bool', title: 'Only signal on bar close', defval: true },
];

// No plot(): the outputs are the plotshape / plotchar markers
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'RSI MA Cross + Divergence Signal (fixed)',
  shortTitle: 'RSI MA Cross + Divergence Signal (fixed)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<RsiMaCrossDivergenceSignalInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lb = cfg.lookback;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const rsiS = ta.rsi(getSourceSeries(bars, cfg.src), cfg.rsiLength);
  // ma = switch maType (only the selected call runs)
  const maS = cfg.maType === 'EMA' ? ta.ema(rsiS, cfg.maLength)
    : cfg.maType === 'WMA' ? ta.wma(rsiS, cfg.maLength)
    : ta.sma(rsiS, cfg.maLength);
  const rsi = A(rsiS);
  const crossUp = A(ta.crossover(rsiS, maS));
  const crossDown = A(ta.crossunder(rsiS, maS));

  const lowS = new Series(bars, (b) => b.low);
  const highS = new Series(bars, (b) => b.high);
  const pl = A(ta.pivotlow(lowS, lb, lb));
  const ph = A(ta.pivothigh(highS, lb, lb));
  const rl = A(ta.pivotlow(rsiS, lb, lb));
  const rh = A(ta.pivothigh(rsiS, lb, lb));

  const lime = String(color.new(color.lime, 0));
  const red = String(color.new(color.red, 0));
  const markers: MarkerData[] = [];
  // ta.valuewhen(cond, x[lookback], 0): x[lookback] on the last bar where cond was true (na before)
  let pLowPrice = NaN;
  let pHighPrice = NaN;
  let pLowRSI = NaN;
  let pHighRSI = NaN;
  for (let i = 0; i < n; i++) {
    const back = i - lb;
    if (!isNaN(pl[i])) pLowPrice = back >= 0 ? bars[back].low : NaN;
    if (!isNaN(ph[i])) pHighPrice = back >= 0 ? bars[back].high : NaN;
    if (!isNaN(rl[i])) pLowRSI = back >= 0 ? rsi[back] : NaN;
    if (!isNaN(rh[i])) pHighRSI = back >= 0 ? rsi[back] : NaN;

    const b = bars[i];
    const bullDiv = !isNaN(pLowPrice) && !isNaN(pLowRSI) && lt(b.low, pLowPrice) && gt(rsi[i], pLowRSI);
    const bearDiv = !isNaN(pHighPrice) && !isNaN(pHighRSI) && gt(b.high, pHighPrice) && lt(rsi[i], pHighRSI);
    // longSignal = confirmClose ? (rawLong and barstate.isconfirmed) : rawLong
    const confirmed = !cfg.confirmClose || barIsConfirmed(i);
    const longSignal = crossUp[i] === 1 && bullDiv && confirmed;
    const shortSignal = crossDown[i] === 1 && bearDiv && confirmed;

    if (longSignal) {
      // plotshape(longSignal, 'Bullish Signal', color.new(color.lime, 0), shape.triangleup, location.belowbar, size.tiny, text = '▲ Long')
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: lime, size: 'tiny', text: '▲ Long', textColor: '#2962FF' });
    }
    if (shortSignal) {
      // plotshape(shortSignal, 'Bearish Signal', color.new(color.red, 0), shape.triangledown, location.abovebar, size.tiny, text = '▼ Short')
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: red, size: 'tiny', text: '▼ Short', textColor: '#2962FF' });
    }
    if (longSignal) {
      // plotchar(longSignal, 'Bull Cross Flag', 'L', location.bottom, color.lime, size.tiny)
      markers.push({ time: b.time, position: 'bottom', shape: 'circle', color: 'transparent', text: 'L', textColor: color.lime, size: 'tiny' });
    }
    if (shortSignal) {
      // plotchar(shortSignal, 'Bear Cross Flag', 'S', location.top, color.red, size.tiny)
      markers.push({ time: b.time, position: 'top', shape: 'circle', color: 'transparent', text: 'S', textColor: color.red, size: 'tiny' });
    }
  }
  // alertcondition x2: not ported (no output)

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
  };
}

export const RsiMaCrossDivergenceSignal = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
