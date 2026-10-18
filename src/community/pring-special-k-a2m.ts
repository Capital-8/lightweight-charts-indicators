/**
 * Pring Special K|a2m
 *
 * Martin Pring's Special K: a weighted sum of twelve SMAs of rates of change of the source (ROC 10 / 15 / 50 / 65 /
 * 75 / 100 / 130 / 195 bars, SMA 10 to 530 bars, weights 1 to 4). The line is green at or above 0, red below.
 * An optional smoothing MA (SMA / EMA / RMA / WMA / VWMA) of the line, or an SMA with Bollinger Bands (hidden band
 * lines with a fill), and a dotted zero line.
 *
 * Reference: "Pring Special K|a2m" by ask2maniish
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';

type SmoothingType = 'None' | 'SMA' | 'SMA + Bollinger Bands' | 'EMA' | 'SMMA (RMA)' | 'WMA' | 'VWMA';

export interface PringSpecialKA2mInputs {
  src: SourceType;
  /** Smoothing type */
  maType: SmoothingType;
  /** Smoothing length */
  maLength: number;
  /** Bollinger Bands standard deviation multiplier */
  bbMult: number;
}

export const defaultInputs: PringSpecialKA2mInputs = {
  src: 'close',
  maType: 'SMA',
  maLength: 20,
  bbMult: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'maType', type: 'string', title: 'Type', defval: 'SMA', group: 'Smoothing',
    options: ['None', 'SMA', 'SMA + Bollinger Bands', 'EMA', 'SMMA (RMA)', 'WMA', 'VWMA'] },
  { id: 'maLength', type: 'int', title: 'Length', defval: 20, group: 'Smoothing' },
  { id: 'bbMult', type: 'float', title: 'BB StdDev', defval: 2.0, min: 0.001, max: 50, step: 0.5, group: 'Smoothing' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'PSK', color: '#0ebb23', lineWidth: 2 },
  { id: 'plot1', title: 'Smoothing MA', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: 'Upper Band', color: color.green, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Lower Band', color: color.green, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Pring Special K|a2m',
  shortTitle: 'Pring Special K|a2m',
  overlay: false,
};

/** Pine float comparison a >= b: false when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** (ROC length, SMA length, weight) of the twelve terms, in the Pine order */
const TERMS: ReadonlyArray<[number, number, number]> = [
  [10, 10, 1], [10, 15, 2], [10, 20, 3], [15, 30, 4],
  [50, 40, 1], [65, 65, 2], [75, 75, 3], [100, 100, 4],
  [130, 195, 1], [130, 265, 2], [130, 390, 3], [195, 530, 4],
];

export function calculate(bars: Bar[], inputs: Partial<PringSpecialKA2mInputs> = {}): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const src = getSourceSeries(bars, cfg.src);

  // psk = sma(roc(src, 10), 10) + sma(roc(src, 10), 15) * 2 + ... (left to right: the first term has no weight)
  const terms = TERMS.map(([r, s, w]) => {
    const v = A(ta.sma(ta.roc(src, r), s));
    return w === 1 ? v : v.map((x) => x * w);
  });
  const psk = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let sum = terms[0][i];
    for (let k = 1; k < terms.length; k++) sum = sum + terms[k][i];
    psk[i] = sum;
  }

  // Smoothing (the MA type is a constant input: the switch runs one branch on every bar)
  const enableMA = cfg.maType !== 'None';
  const isBB = cfg.maType === 'SMA + Bollinger Bands';
  const pskS = S(psk);
  let smoothingMA = new Array<number>(n).fill(NaN);
  if (enableMA) {
    let maS: Series;
    switch (cfg.maType) {
      case 'EMA': maS = ta.ema(pskS, cfg.maLength); break;
      case 'SMMA (RMA)': maS = ta.rma(pskS, cfg.maLength); break;
      case 'WMA': maS = ta.wma(pskS, cfg.maLength); break;
      case 'VWMA': maS = ta.vwma(pskS, cfg.maLength, S(bars.map((b) => b.volume ?? NaN))); break;
      default: maS = ta.sma(pskS, cfg.maLength); break;
    }
    smoothingMA = A(maS);
  }
  const smoothingStDev = isBB ? A(ta.stdev(pskS, cfg.maLength)).map((v) => v * cfg.bbMult) : new Array<number>(n).fill(NaN);

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const t = (i: number) => bars[i].time;
  const plots = {
    // pskColor = psk >= 0 ? #0ebb23 : #ff0000
    plot0: bars.map((_b, i) => ({ time: t(i), value: fin(psk[i]), color: ge(psk[i], 0) ? '#0ebb23' : '#ff0000' })),
    plot1: bars.map((_b, i) => ({ time: t(i), value: fin(smoothingMA[i]), color: color.blue })),
    plot2: bars.map((_b, i) => ({ time: t(i), value: isBB ? fin(smoothingMA[i] + smoothingStDev[i]) : NaN, color: color.green })),
    plot3: bars.map((_b, i) => ({ time: t(i), value: isBB ? fin(smoothingMA[i] - smoothingStDev[i]) : NaN, color: color.green })),
  };

  // fill(bbUpperBand, bbLowerBand, color.new(color.green, 90), "BB Fill", display = isBB ? display.all : display.none)
  // The fill is always declared (Style settings); without the bands (display.none) it draws nothing
  const fills = [{ plot1: 'plot2', plot2: 'plot3', options: { title: 'BB Fill' },
    colors: new Array<string>(n).fill(isBB ? String(color.new(color.green, 90)) : 'transparent') }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [{ value: 0, options: { title: 'Zero', color: color.gray, linestyle: 'dotted' } }],
    fills,
  };
}

export const PringSpecialKA2m = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
