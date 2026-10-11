/**
 * TrendWave Bands [BigBeluga]
 *
 * Upper band: highest of SMA(close, 25) + volatility over length / 2 bars; lower band: lowest of
 * SMA(close, length) - volatility over length / 2 bars (volatility = SMA(high - low, 70) * factor). hlc3 crossing over
 * the upper band starts an up trend (the upper band is hidden), crossing under the lower band a down trend (the lower
 * band is hidden). The visible band fades while the trend lasts (transparency = trend duration, max 70), and a
 * dotted wave is drawn at 5 * ATR(100) on the other side of it. Circles mark the trend changes.
 *
 * Last bar: a cross of the bands counts on a closed bar only. The port reads the state of the last bar from the
 * optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "TrendWave Bands [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TrendWaveBandsInputs {
  length: number;
  factor: number;
  /** Up colour */
  colUp: string;
  /** Down colour */
  colDn: string;
  /** Wave colour */
  colUl: string;
}

export const defaultInputs: TrendWaveBandsInputs = {
  length: 50,
  factor: 1.0,
  colUp: color.lime,
  colDn: '#DD1A1A',
  colUl: color.aqua,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 50 },
  { id: 'factor', type: 'float', title: 'Factor', defval: 1.0, step: 0.1 },
  { id: 'colUp', type: 'color', title: 'Up Color', defval: color.lime },
  { id: 'colDn', type: 'color', title: 'Down Color', defval: '#DD1A1A' },
  { id: 'colUl', type: 'color', title: 'Wave Color', defval: color.aqua },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Wave', color: color.aqua, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Lower Wave', color: color.aqua, lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Upper Band', color: '#DD1A1A', lineWidth: 2, style: 'linebr' },
  { id: 'plot3', title: 'Lower Band', color: color.lime, lineWidth: 2, style: 'linebr' },
  { id: 'plot4', title: 'Upper Band Shadow', color: '#DD1A1A', lineWidth: 6, style: 'linebr' },
  { id: 'plot5', title: 'Lower Band Shadow', color: color.lime, lineWidth: 6, style: 'linebr' },
];

export const metadata = {
  title: 'TrendWave Bands [BigBeluga]',
  shortTitle: 'TrendWave Bands',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendWaveBandsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const { length, factor, colUp, colDn, colUl } = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const half = Math.trunc(length / 2); // int(length / 2)

  // volatility = ta.sma(high - low, 70) * factor
  const vol = arr(ta.sma(Series.fromArray(bars, bars.map((b) => b.high - b.low)), 70)).map((v) => v * factor);
  const smaFast = arr(ta.sma(new Series(bars, (b) => b.close), 25));
  const smaSlow = arr(ta.sma(new Series(bars, (b) => b.close), length));
  // upper = ta.highest(ta.sma(close, 25) + volatility, int(length / 2)); lower = ta.lowest(ta.sma(close, length) - volatility, ...)
  const upperRaw = arr(ta.highest(Series.fromArray(bars, smaFast.map((v, i) => v + vol[i])), half));
  const lowerRaw = arr(ta.lowest(Series.fromArray(bars, smaSlow.map((v, i) => v - vol[i])), half));
  const atr = arr(ta.atr(bars, 100));

  const upper: number[] = new Array(n);
  const lower: number[] = new Array(n);
  const direction: number[] = new Array(n);
  const countUp: number[] = new Array(n);
  const countDn: number[] = new Array(n);
  let dir = 0;
  let cUp = 0;
  let cDn = 0;
  for (let i = 0; i < n; i++) {
    const hlc3 = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const prevHlc3 = i > 0 ? (bars[i - 1].high + bars[i - 1].low + bars[i - 1].close) / 3 : NaN;
    // sig_up = ta.crossover(hlc3, upper) and barstate.isconfirmed; sig_dn = ta.crossunder(hlc3, lower) and ...
    // (the band values passed to the calls, before the na reassignment)
    const sigUp = i > 0 && hlc3 > upperRaw[i] && prevHlc3 <= upperRaw[i - 1] && barIsConfirmed(i);
    const sigDn = i > 0 && hlc3 < lowerRaw[i] && prevHlc3 >= lowerRaw[i - 1] && barIsConfirmed(i);
    if (sigUp) dir = 1;
    else if (sigDn) dir = -1;
    upper[i] = dir === 1 ? NaN : upperRaw[i];
    lower[i] = dir === -1 ? NaN : lowerRaw[i];
    if (dir === 1) {
      cUp += 0.5;
      cDn = 0;
    }
    if (dir === -1) {
      cDn += 0.5;
      cUp = 0;
    }
    cUp = cUp > 70 ? 70 : cUp;
    cDn = cDn > 70 ? 70 : cDn;
    direction[i] = dir;
    countUp[i] = cUp;
    countDn[i] = cDn;
  }

  const col = (c: string, transp: number) => String(color.new(c, transp));
  const plots: Record<string, { time: number; value: number; color: string }[]> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [],
  };
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // upper_band = lower + ta.atr(100) * 5; lower_band = upper - ta.atr(100) * 5
    const upperBand = lower[i] + atr[i] * 5;
    const lowerBand = upper[i] - atr[i] * 5;
    const cu = Math.trunc(countUp[i]);
    const cd = Math.trunc(countDn[i]);
    // Waves: color = bar_index % 2 == 0 ? na : color.new(col_ul, 70 - int(count))
    plots.plot0.push({ time: t, value: upperBand, color: i % 2 === 0 ? 'transparent' : col(colUl, 70 - cu) });
    plots.plot1.push({ time: t, value: lowerBand, color: i % 2 === 0 ? 'transparent' : col(colUl, 70 - cd) });
    plots.plot2.push({ time: t, value: upper[i], color: col(colDn, cd) });
    plots.plot3.push({ time: t, value: lower[i], color: col(colUp, cu) });
    plots.plot4.push({ time: t, value: upper[i], color: col(colDn, Math.trunc(countDn[i] * 2)) });
    plots.plot5.push({ time: t, value: lower[i], color: col(colUp, Math.trunc(countUp[i] * 2)) });
    // plotshape(direction != direction[1] and direction == 1 ? lower : na, circle, tiny col_up / small col_up 70)
    const changed = i > 0 && direction[i] !== direction[i - 1];
    if (changed && direction[i] === 1 && !isNaN(lower[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: lower[i], shape: 'circle', color: colUp, size: 'tiny' });
      markers.push({ time: t, position: 'atPriceMiddle', price: lower[i], shape: 'circle', color: col(colUp, 70), size: 'small' });
    }
    if (changed && direction[i] === -1 && !isNaN(upper[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: upper[i], shape: 'circle', color: colDn, size: 'tiny' });
      markers.push({ time: t, position: 'atPriceMiddle', price: upper[i], shape: 'circle', color: col(colDn, 70), size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
  };
}

export const TrendWaveBands = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
