/**
 * UCS Top & Bottom Candle
 *
 * Panel indicator (overlay=false) with:
 * - Momentum histogram (plot.style_columns, yellow)
 * - SMI line (blue): na until the nested emas of the range exist (smi = 0 only on a zero range)
 * - SMI Signal line (red)
 * - 3 hlines: 40 (overbought/red), -40 (oversold/green), 0 (zero/blue)
 * - Fills between hlines: H0-H2 green (oversold zone), H0-H1 red (overbought zone)
 * - barcolor: lime when SMI < -35 and mom crosses above 0, red when SMI > 35 and mom crosses below 0
 *   (no markers: the original only colours the bars)
 *
 * Reference: "UCS_Top & Bottom Candle" (community)
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';

export interface TopBottomCandleInputs {
  percentKLength: number;
  percentDLength: number;
}

export const defaultInputs: TopBottomCandleInputs = {
  percentKLength: 5,
  percentDLength: 3,
};

export const inputConfig: InputConfig[] = [
  { id: 'percentKLength', type: 'int', title: 'Percent K Length', defval: 5, min: 1 },
  { id: 'percentDLength', type: 'int', title: 'Percent D Length', defval: 3, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'momentum', title: 'Momentum', color: '#FFEB3B', lineWidth: 1, style: 'histogram' },
  { id: 'smi', title: 'Stochastic Momentum Index', color: '#2196F3', lineWidth: 1 },
  { id: 'smiSignal', title: 'SMI Signal Line', color: '#EF5350', lineWidth: 1 },
];

export const metadata = {
  title: 'Top & Bottom Candle',
  shortTitle: 'UCS_T&B',
  overlay: false,
};

export function calculate(bars: Bar[], inputs: Partial<TopBottomCandleInputs> = {}): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] } {
  const { percentKLength: a, percentDLength: b } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const lowSeries = new Series(bars, (bar) => bar.low);
  const highSeries = new Series(bars, (bar) => bar.high);
  const closeSeries = new Series(bars, (bar) => bar.close);

  const ll = ta.lowest(lowSeries, a);
  const hh = ta.highest(highSeries, a);
  const hhArr = hh.toArray();
  const llArr = ll.toArray();
  const closeArr = closeSeries.toArray();

  // diff = hh - ll, rdiff = close - (hh+ll)/2
  const diffArr: number[] = new Array(n);
  const rdiffArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    diffArr[i] = (hhArr[i] ?? 0) - (llArr[i] ?? 0);
    rdiffArr[i] = (closeArr[i] ?? 0) - ((hhArr[i] ?? 0) + (llArr[i] ?? 0)) / 2;
  }

  // avgrel = ema(ema(rdiff, b), b), avgdiff = ema(ema(diff, b), b)
  const rdiffS = Series.fromArray(bars, rdiffArr);
  const diffS = Series.fromArray(bars, diffArr);
  const avgrelArr = ta.ema(ta.ema(rdiffS, b), b).toArray();
  const avgdiffArr = ta.ema(ta.ema(diffS, b), b).toArray();

  // Momentum = (close - close[b]) / close[b] * 1000
  const momArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (i >= b && closeArr[i - b] !== 0 && closeArr[i - b] != null) {
      momArr[i] = ((closeArr[i]! - closeArr[i - b]!) / closeArr[i - b]!) * 1000;
    } else {
      momArr[i] = NaN;
    }
  }

  // SMI = avgdiff != 0 ? (avgrel / (avgdiff / 2) * 100) : 0
  const smiArr: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const ad = avgdiffArr[i] ?? 0;
    smiArr[i] = ad !== 0 ? ((avgrelArr[i] ?? 0) / (ad / 2)) * 100 : 0;
  }

  // SMIsignal = ema(SMI, b)
  const smiS = Series.fromArray(bars, smiArr);
  const smiSignalArr = ta.ema(smiS, b).toArray();

  // Each plot exists from its first computable bar: Momentum from bar b, SMI from bar a + 2 (b - 1) - 1 (the two
  // nested emas over the a-bar range), the signal b - 1 bars later.
  // Momentum plot (histogram, yellow)
  const momentumPlot = momArr.map((v, i) => ({
    time: bars[i].time,
    value: isNaN(v) ? NaN : v,
    color: '#FFEB3B',
  }));

  // SMI plot (blue line)
  const smiPlot = smiArr.map((v, i) => ({
    time: bars[i].time,
    value: isNaN(v) ? NaN : v,
  }));

  // SMI Signal plot (red line)
  const smiSignalPlot = smiSignalArr.map((v, i) => ({
    time: bars[i].time,
    value: (v == null || isNaN(v)) ? NaN : v,
  }));

  // barcolor(long): SMI < -35 and mom > 0 and mom[1] < 0 -> lime (barcolor0)
  // barcolor(short): SMI > 35 and mom < 0 and mom[1] > 0 -> red (barcolor1)
  // No markers: the original only colours the bars. na comparisons are false, so the colours start
  // on the first bar where SMI and mom[1] exist.
  const barColors: BarColorData[] = [];
  for (let i = 1; i < n; i++) {
    const smi = smiArr[i];
    const mom = momArr[i];
    const prevMom = momArr[i - 1];
    if (smi < -35 && mom > 0 && prevMom < 0) {
      barColors.push({ time: bars[i].time, color: '#00E676', id: 'barcolor0' }); // lime
    }
    if (smi > 35 && mom < 0 && prevMom > 0) {
      barColors.push({ time: bars[i].time, color: '#EF5350', id: 'barcolor1' }); // red
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'momentum': momentumPlot,
      'smi': smiPlot,
      'smiSignal': smiSignalPlot,
    },
    hlines: [
      { value: 40, options: { color: '#EF5350', linestyle: 'solid' as const, title: 'Over Bought' } },
      { value: -40, options: { color: '#26A69A', linestyle: 'solid' as const, title: 'Over Sold' } },
      { value: 0, options: { color: '#2196F3', linestyle: 'solid' as const, title: 'Zero Line' } },
    ],
    fills: [
      { plot1: 'hline_2', plot2: 'hline_1', options: { color: 'rgba(38, 166, 154, 0.15)', title: 'Oversold' } },
      { plot1: 'hline_2', plot2: 'hline_0', options: { color: 'rgba(239, 83, 80, 0.15)', title: 'Overbought' } },
    ],
    barColors,
  } as Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[] };
}

export const TopBottomCandle = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
