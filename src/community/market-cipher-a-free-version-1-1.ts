/**
 * Market Cipher A free version 1.1
 *
 * A ribbon of eight EMAs of the close (5, 11, 15, 18, 21, 24, 28, 34 by default). Signals: a green circle above the
 * bar when EMA 2 crosses over EMA 8, a red cross above the bar when EMA 1 crosses under EMA 2, and a blue triangle
 * below the bar when EMA 2 crosses over EMA 3. The three alert conditions of the script give no output.
 *
 * Reference: "Market Cipher A free version 1.1" by falconCoin
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface MarketCipherAFreeVersion11Inputs {
  ema1: number;
  ema2: number;
  ema3: number;
  ema4: number;
  ema5: number;
  ema6: number;
  ema7: number;
  ema8: number;
}

export const defaultInputs: MarketCipherAFreeVersion11Inputs = {
  ema1: 5,
  ema2: 11,
  ema3: 15,
  ema4: 18,
  ema5: 21,
  ema6: 24,
  ema7: 28,
  ema8: 34,
};

export const inputConfig: InputConfig[] = [
  { id: 'ema1', type: 'int', title: 'ema1', defval: 5 },
  { id: 'ema2', type: 'int', title: 'ema2', defval: 11 },
  { id: 'ema3', type: 'int', title: 'ema3', defval: 15 },
  { id: 'ema4', type: 'int', title: 'ema4', defval: 18 },
  { id: 'ema5', type: 'int', title: 'ema5', defval: 21 },
  { id: 'ema6', type: 'int', title: 'ema6', defval: 24 },
  { id: 'ema7', type: 'int', title: 'ema7', defval: 28 },
  { id: 'ema8', type: 'int', title: 'ema8', defval: 34 },
];

// plot(..., linewidth = 2, transp = 50)
const C1 = String(color.new('#265aa6', 50));
const C2 = String(color.new('#1976d2', 50));
const C3 = String(color.new('#7fb3ff', 50));
const C4 = String(color.new('#bbdefb', 50));
const COLORS = [C1, C1, C2, C2, C3, C3, C4, C4];
// Pine v3 colour constants
const GREEN = '#008000';
const RED = '#FF0000';
const BLUE = '#0000FF';

export const plotConfig: PlotConfig[] = COLORS.map((c, k) => ({ id: `plot${k}`, title: `EMA ${k + 1}`, color: c, lineWidth: 2 }));

export const metadata = {
  title: 'Market Cipher A',
  shortTitle: 'Market Cipher A',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketCipherAFreeVersion11Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const close = Series.fromArray(bars, bars.map((b) => b.close));
  const lengths = [cfg.ema1, cfg.ema2, cfg.ema3, cfg.ema4, cfg.ema5, cfg.ema6, cfg.ema7, cfg.ema8];
  const emas = lengths.map((len) => ta.ema(close, len));
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const values = emas.map(arr);

  // ta.crossover / ta.crossunder of the library (exact comparison, last bar where both values were not na)
  const longEma = arr(ta.crossover(emas[1], emas[7]));
  const redCross = arr(ta.crossunder(emas[0], emas[1]));
  const blueTriangle = arr(ta.crossover(emas[1], emas[2]));

  const markers: MarkerData[] = [];
  bars.forEach((b, i) => {
    if (longEma[i]) markers.push({ time: b.time, position: 'aboveBar', shape: 'circle', color: GREEN, size: 'tiny' });
    if (redCross[i]) markers.push({ time: b.time, position: 'aboveBar', shape: 'xcross', color: RED, size: 'tiny' });
    if (blueTriangle[i]) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: BLUE, size: 'small' });
    }
  });

  const plots: Record<string, { time: number; value: number }[]> = {};
  values.forEach((v, k) => {
    plots[`plot${k}`] = bars.map((b, i) => ({ time: b.time, value: v[i] }));
  });

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
  };
}

export const MarketCipherAFreeVersion11 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
