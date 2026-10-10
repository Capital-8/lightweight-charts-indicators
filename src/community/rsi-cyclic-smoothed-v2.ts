/**
 * RSI cyclic smoothed v2
 *
 * An RSI of half the dominant cycle length, smoothed with a phase lead: crsi = torque * (2 * rsi - rsi[lag]) +
 * (1 - torque) * crsi[1], with torque 2 / 11 and a lag of 4 bars. Two adaptive bands are read from the last
 * 2 * cycle values of crsi: the low band is the first of 101 steps from the lowest value up where at least 10 % of
 * the values are below it, the high band the first step from the highest value down where at least 10 % are at or
 * above it. Fixed lines at 30 and 70.
 *
 * Reference: "RSI cyclic smoothed" by StockMarketCycles
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Copyright (C) 2017 CC BY, whentotrade / Lars von Thienen. Source: Book: Decoding The Hidden
 * Market Rhythm - Part 1: Dynamic Cycles (2017), Chapter 4: "Fine-tuning technical indicators".
 */

import { ta, Series, compare, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar } from 'oakscriptjs';

export interface RsiCyclicSmoothedV2Inputs {
  /** Dominant Cycle Length */
  domcycle: number;
}

export const defaultInputs: RsiCyclicSmoothedV2Inputs = {
  domcycle: 20,
};

export const inputConfig: InputConfig[] = [
  { id: 'domcycle', type: 'int', title: 'Dominant Cycle Length', defval: 20, min: 10 },
];

// Colours of the original Pine version
const AQUA = '#00BCD4';
const FUCHSIA = '#E040FB';
const SILVER = '#B2B5BE';
const SILVER_FILL = 'rgba(178, 181, 190, 0.1)';
const GRAY_FILL = 'rgba(120, 123, 134, 0.1)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'LowBand', color: AQUA, lineWidth: 1 },
  { id: 'plot1', title: 'HighBand', color: AQUA, lineWidth: 1 },
  { id: 'plot2', title: 'CRSI', color: FUCHSIA, lineWidth: 1 },
];

export const hlineConfig: HLineConfig[] = [
  { id: 'hline_0', price: 30, title: 'Level', color: SILVER, linestyle: 'dashed' },
  { id: 'hline_1', price: 70, title: 'Level', color: SILVER, linestyle: 'dashed' },
];

export const fillConfig: FillConfig[] = [
  { id: 'fill_0', plot1: 'hline_0', plot2: 'hline_1', color: SILVER_FILL, title: 'Hlines Background' },
  { id: 'fill_1', plot1: 'plot0', plot2: 'plot1', color: GRAY_FILL, title: 'Plots Background' },
];

export const metadata = {
  title: 'RSI cyclic smoothed',
  shortTitle: 'cRSI',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<RsiCyclicSmoothedV2Inputs> = {}): IndicatorResult {
  const { domcycle } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const cyclelen = domcycle / 2;
  const vibration = 10;
  const leveling = 10.0;
  const cyclicmemory = domcycle * 2;
  const torque = 2.0 / (vibration + 1);
  // rsi[phasingLag] with phasingLag = 4.5: the history index is truncated
  const phasingLag = Math.trunc((vibration - 1) / 2.0);

  const close = new Series(bars, (b) => b.close);
  const chg = A(ta.change(close));
  // max(na, 0) and min(na, 0) are na
  const up = A(ta.rma(Series.fromArray(bars, chg.map((c) => (isNaN(c) ? NaN : Math.max(c, 0)))), cyclelen));
  const down = A(ta.rma(Series.fromArray(bars, chg.map((c) => (isNaN(c) ? NaN : -Math.min(c, 0)))), cyclelen));

  const rsi: number[] = new Array(n);
  const crsi: number[] = new Array(n);
  const db: number[] = new Array(n);
  const ub: number[] = new Array(n);
  const aperc = leveling / 100;
  for (let i = 0; i < n; i++) {
    rsi[i] = compare.eq(down[i], 0) ? 100 : compare.eq(up[i], 0) ? 0 : 100 - 100 / (1 + up[i] / down[i]);
    const lagged = i - phasingLag >= 0 ? rsi[i - phasingLag] : NaN;
    const prev = i > 0 && !isNaN(crsi[i - 1]) ? crsi[i - 1] : 0;
    crsi[i] = torque * (2 * rsi[i] - lagged) + (1 - torque) * prev;

    // crsi[m] of the last `cyclicmemory` bars (na before the first bar)
    const hist = (m: number) => (i - m >= 0 ? crsi[i - m] : NaN);

    let lmax = -999999.0;
    let lmin = 999999.0;
    for (let m = 0; m <= cyclicmemory - 1; m++) {
      const v = hist(m);
      if (compare.gt(isNaN(v) ? -999999.0 : v, lmax)) lmax = isNaN(v) ? 0 : v;
      else if (compare.lt(isNaN(v) ? 999999.0 : v, lmin)) lmin = isNaN(v) ? 0 : v;
    }
    const mstep = (lmax - lmin) / 100;

    let low = 0.0;
    for (let steps = 0; steps <= 100; steps++) {
      const testvalue = lmin + mstep * steps;
      let below = 0;
      for (let m = 0; m <= cyclicmemory - 1; m++) if (compare.lt(hist(m), testvalue)) below++;
      if (compare.ge(below / cyclicmemory, aperc)) {
        low = testvalue;
        break;
      }
    }
    db[i] = low;

    let high = 0.0;
    for (let steps = 0; steps <= 100; steps++) {
      const testvalue = lmax - mstep * steps;
      let above = 0;
      for (let m = 0; m <= cyclicmemory - 1; m++) if (compare.ge(hist(m), testvalue)) above++;
      if (compare.ge(above / cyclicmemory, aperc)) {
        high = testvalue;
        break;
      }
    }
    ub[i] = high;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: db[i] })),
      plot1: bars.map((b, i) => ({ time: b.time, value: ub[i] })),
      plot2: bars.map((b, i) => ({ time: b.time, value: crsi[i] })),
    },
    hlines: [
      { value: 30, options: { color: SILVER, linestyle: 'dashed' } },
      { value: 70, options: { color: SILVER, linestyle: 'dashed' } },
    ],
    fills: [
      // fill(h1, h2, color = color.silver, transp = 90)
      { plot1: 'hline_0', plot2: 'hline_1', options: { color: SILVER_FILL } },
      // fill(lowband, highband, color = color.gray, transp = 90)
      { plot1: 'plot0', plot2: 'plot1', options: { color: GRAY_FILL } },
    ],
  };
}

export const RsiCyclicSmoothedV2 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
};
