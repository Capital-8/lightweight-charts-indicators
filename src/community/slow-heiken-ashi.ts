/**
 * Slow Heiken Ashi
 *
 * As the original: the SMAs over "Period" of open / high / low / close (Om, Hm, Lm, Cm) give vClose = their mean;
 * vOpen is a KAMA of vClose[1] (fastend / slowend, length 1/2: an integer division, 0 bars, so the efficiency ratio
 * is 1 and the smoothing constant fastend^2); vHigh = max(Hm, vClose, vOpen), vLow = min(Lm, vClose, vOpen).
 * Candles red when vOpen > vClose, green otherwise (wick / border: the plotcandle defaults). With "Signal" on: a
 * white '▼' at vHigh when vOpen crosses above vClose (char0), a white '▲' at vLow when it crosses below (char1).
 * The original has no alerts.
 *
 * Reference: "Slow Heiken Ashi" (community)
 */

import { taCore, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { PlotCandleData, MarkerData } from '../types';

export interface SlowHeikenAshiInputs {
  /** Period of the SMAs */
  length: number;
  fastend: number;
  slowend: number;
  signal: boolean;
}

export const defaultInputs: SlowHeikenAshiInputs = {
  length: 6,
  fastend: 0.666,
  slowend: 0.0645,
  signal: true,
};

// Untitled inputs keep their variable names as titles
export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Period', defval: 6 },
  { id: 'fastend', type: 'float', title: 'fastend', defval: 0.666, step: 0.001 },
  { id: 'slowend', type: 'float', title: 'slowend', defval: 0.0645, step: 0.0001 },
  { id: 'signal', type: 'bool', title: 'Signal', defval: true },
];

export const plotConfig: PlotConfig[] = [];

export const plotCandleConfig = [
  { id: 'candle0', title: 'PlotCandle' },
];

export const metadata = {
  title: 'Slow Heiken Ashi',
  shortTitle: 'SlowHA',
  overlay: true,
};

/** Pine version 1 colours */
const RED = '#FF0000';
const GREEN = '#008000';
const WHITE = '#FFFFFF';
/** plotcandle defaults of wickcolor / bordercolor */
const WICK = '#737375';
const BORDER = '#000000';

/** hakamaper = 1/2: a division of two integer constants (0) */
const HA_KAMA_PER = Math.trunc(1 / 2);

/** kama(close, amaLength) of the original */
function kama(x: number[], amaLength: number, fastend: number, slowend: number): number[] {
  const n = x.length;
  const out: number[] = new Array(n);
  const diff = x.map((v, i) => (i > 0 ? Math.abs(v - x[i - 1]) : NaN));
  let prev = NaN;
  for (let i = 0; i < n; i++) {
    const signal = Math.abs(x[i] - (i - amaLength >= 0 ? x[i - amaLength] : NaN));
    let noise = 0;
    for (let k = 0; k < amaLength; k++) noise += i - k >= 0 ? diff[i - k] : NaN;
    if (amaLength > 0 && i < amaLength - 1) noise = NaN;
    const efratio = noise !== 0 && Number.isFinite(noise) ? signal / noise : 1;
    const smooth = Math.pow(efratio * (fastend - slowend) + slowend, 2);
    const base = Number.isFinite(prev) ? prev : x[i];
    const v = base + smooth * (x[i] - base);
    out[i] = v;
    prev = v;
  }
  return out;
}

export function calculate(bars: Bar[], inputs: Partial<SlowHeikenAshiInputs> = {}): Omit<IndicatorResult, 'markers'> & { plotCandles: Record<string, PlotCandleData[]>; markers: MarkerData[] } {
  const { length, fastend, slowend, signal } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const om = taCore.sma(bars.map((b) => b.open), length);
  const hm = taCore.sma(bars.map((b) => b.high), length);
  const lm = taCore.sma(bars.map((b) => b.low), length);
  const cm = taCore.sma(bars.map((b) => b.close), length);
  const vClose = om.map((o, i) => (o + hm[i] + lm[i] + cm[i]) / 4);
  const vOpen = kama(vClose.map((_, i) => (i > 0 ? vClose[i - 1] : NaN)), HA_KAMA_PER, fastend, slowend);
  // math.max / math.min with an na argument: na
  const vHigh = vClose.map((c, i) => Math.max(hm[i], c, vOpen[i]));
  const vLow = vClose.map((c, i) => Math.min(lm[i], c, vOpen[i]));

  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const ok = [vOpen[i], vHigh[i], vLow[i], vClose[i]].every(Number.isFinite);
    if (!ok) {
      candles.push({ time: bars[i].time as number, open: NaN, high: NaN, low: NaN, close: NaN });
      continue;
    }
    candles.push({
      time: bars[i].time as number,
      open: vOpen[i],
      high: vHigh[i],
      low: vLow[i],
      close: vClose[i],
      color: vOpen[i] > vClose[i] ? RED : GREEN,
      wickColor: WICK,
      borderColor: BORDER,
    });
  }

  // cross(vOpen, vClose) and vOpen[1] < vClose[1] -> '▼' at vHigh; and vOpen[1] > vClose[1] -> '▲' at vLow
  const markers: MarkerData[] = [];
  if (signal) {
    for (let i = 1; i < n; i++) {
      const o = vOpen[i], c = vClose[i], po = vOpen[i - 1], pc = vClose[i - 1];
      const cross = (o > c && po <= pc) || (o < c && po >= pc);
      if (cross && po < pc && Number.isFinite(vHigh[i])) {
        markers.push({ id: 'char0', time: bars[i].time, position: 'atPriceMiddle', price: vHigh[i], shape: 'circle', char: '▼', color: WHITE });
      }
      if (cross && po > pc && Number.isFinite(vLow[i])) {
        markers.push({ id: 'char1', time: bars[i].time, position: 'atPriceMiddle', price: vLow[i], shape: 'circle', char: '▲', color: WHITE });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    plotCandles: { candle0: candles },
    markers,
  };
}

export const SlowHeikenAshi = { calculate, metadata, defaultInputs, inputConfig, plotConfig, plotCandleConfig };
