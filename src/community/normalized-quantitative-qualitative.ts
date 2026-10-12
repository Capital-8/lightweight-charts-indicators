/**
 * Normalized Quantitative Qualitative Estimation (nQQE)
 *
 * QQE centred on zero: the fast line is the EMA (smoothing factor) of the RSI, minus 50. The volatility of the fast
 * line (absolute change, smoothed twice with a Wilder alpha 1 / RSI length) times 4.236 gives the upper and lower
 * bands, and the slow line is a trailing level that follows them. The fast line is also drawn as columns coloured by
 * the zone (above 10 green, below -10 red, else yellow). Optional Buy / Sell labels on the crossings of the two lines.
 *
 * Reference: "Normalized Quantitative Qualitative Estimation" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © KivancOzbilgic
 */

import { taCore, getSource, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';

export interface NormalizedQuantitativeQualitativeInputs {
  /** Source */
  src: SourceType;
  /** RSI length */
  length: number;
  /** EMA length of the RSI (smoothing factor) */
  ssf: number;
  /** Buy / Sell labels on the crossings */
  showSignals: boolean;
}

export const defaultInputs: NormalizedQuantitativeQualitativeInputs = {
  src: 'close',
  length: 14,
  ssf: 5,
  showSignals: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'src', defval: 'close' },
  { id: 'length', type: 'int', title: 'RSI Length', defval: 14, min: 1 },
  { id: 'ssf', type: 'int', title: 'SF RSI SMoothing Factor', defval: 5, min: 1 },
  { id: 'showSignals', type: 'bool', title: 'Show Crossing Signals?', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'FAST', color: '#880E4F', lineWidth: 2 },
  { id: 'plot1', title: 'Plot', color: '#E8E81A', lineWidth: 2, style: 'columns' },
  { id: 'plot2', title: 'SLOW', color: '#0007E1', lineWidth: 2 },
];

export const metadata = {
  title: ' Normalized Quantitative Qualitative Estimation',
  shortTitle: 'nQQE',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (x: number) => (Number.isNaN(x) ? 0 : x);

export function calculate(
  bars: Bar[],
  inputs: Partial<NormalizedQuantitativeQualitativeInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSource(bars, cfg.src);

  // QQEF = ema(rsi(src, length), SSF) (RSII is the same series)
  const qqef = taCore.ema(taCore.rsi(src, cfg.length), cfg.ssf);
  const wwalpha = 1 / cfg.length;
  const qqes: number[] = new Array(n);
  let wwma = 0;
  let atrRsi = 0;
  let prevQqes = NaN;
  for (let i = 0; i < n; i++) {
    const tr = Math.abs(qqef[i] - (i > 0 ? qqef[i - 1] : NaN));
    // WWMA := wwalpha * TR + (1 - wwalpha) * nz(WWMA[1]); ATRRSI likewise from WWMA
    wwma = wwalpha * tr + (1 - wwalpha) * nz(wwma);
    atrRsi = wwalpha * wwma + (1 - wwalpha) * nz(atrRsi);
    const f = qqef[i];
    const f1 = i > 0 ? qqef[i - 1] : NaN;
    const qup = f + atrRsi * 4.236;
    const qdn = f - atrRsi * 4.236;
    const p = nz(prevQqes);
    let q: number;
    if (lt(qup, p)) q = qup;
    else if (gt(f, p) && lt(f1, p)) q = qdn;
    else if (gt(qdn, p)) q = qdn;
    else if (lt(f, p) && gt(f1, p)) q = qup;
    else q = p;
    qqes[i] = q;
    prevQqes = q;
  }

  const t = (i: number) => bars[i].time;
  const v = (x: number) => (Number.isFinite(x) ? x : NaN);
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  for (let i = 0; i < n; i++) {
    const fast = qqef[i] - 50;
    // Colorh = QQEF - 50 > 10 ? #007002 : QQEF - 50 < -10 ? color.red : #E8E81A
    const colorh = gt(fast, 10) ? '#007002' : lt(fast, -10) ? '#FF5252' : '#E8E81A';
    plot0.push({ time: t(i), value: v(fast) });
    plot1.push({ time: t(i), value: v(fast), color: colorh });
    plot2.push({ time: t(i), value: v(qqes[i] - 50) });
  }

  const markers: MarkerData[] = [];
  if (cfg.showSignals) {
    const buy = taCore.crossover(qqef, qqes);
    const sell = taCore.crossunder(qqef, qqes);
    for (let i = 0; i < n; i++) {
      // plotshape(buySignalr and showsignals ? (QQES - 50) * 0.995 : na, location.absolute, shape.labelup, size.tiny)
      if (buy[i]) {
        markers.push({ time: t(i), position: 'atPriceBottom', price: (qqes[i] - 50) * 0.995, shape: 'labelUp',
          color: '#4CAF50', text: 'Buy', textColor: '#FFFFFF', size: 'tiny' });
      }
      if (sell[i]) {
        markers.push({ time: t(i), position: 'atPriceTop', price: (qqes[i] - 50) * 1.005, shape: 'labelDown',
          color: '#FF5252', text: 'Sell', textColor: '#FFFFFF', size: 'tiny' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    hlines: [
      { value: 10, options: { title: 'Level', color: '#787B86', linestyle: 'dashed' } },
      { value: -10, options: { title: 'Level', color: '#787B86', linestyle: 'dashed' } },
    ],
    markers,
  };
}

export const NormalizedQuantitativeQualitative = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
