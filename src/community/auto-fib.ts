/**
 * Auto Fibonacci
 *
 * Automatic Fibonacci retracement levels based on highest high and lowest low
 * over a lookback period. Plots 7 standard Fibonacci levels.
 * On the last bar, the original's level labels (%0 ... %161.8, 15 bars after the last bar, at the original's levels:
 * from the low up when the highest high is older than the lowest low, else from the high down) and the High / Low
 * labels on the bars of the highest high / lowest low.
 * Alerts (alertcondition, `alerts` of the result): the close crossing over / under the 0.236 ... 0.786 levels of the
 * original, in an upward (highest high more recent than the lowest low) or a downward retracement.
 *
 * Reference: "Auto Fibonacci" (community)
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AutoFibInputs {
  length: number;
  /** Draw the 1.618 level label */
  plotF1618: boolean;
}

export const defaultInputs: AutoFibInputs = {
  length: 50,
  plotF1618: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Length', defval: 50, min: 2 },
  { id: 'plotF1618', type: 'bool', title: 'Plot 1.618 Level?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fib 0.0', color: '#787B86', lineWidth: 1 },
  { id: 'plot1', title: 'Fib 0.236', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot2', title: 'Fib 0.382', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot3', title: 'Fib 0.5', color: '#FFEB3B', lineWidth: 1 },
  { id: 'plot4', title: 'Fib 0.618', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot5', title: 'Fib 0.786', color: '#FF6D00', lineWidth: 1 },
  { id: 'plot6', title: 'Fib 1.0', color: '#787B86', lineWidth: 1 },
];

export const metadata = {
  title: 'Auto Fibonacci',
  shortTitle: 'AutoFib',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoFibInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { length, plotF1618 } = { ...defaultInputs, ...inputs };

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  const highestArr = ta.highest(highSeries, length).toArray();
  const lowestArr = ta.lowest(lowSeries, length).toArray();

  const warmup = length;
  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];

  const plots: Record<string, { time: number; value: number }[]> = {};
  for (let f = 0; f < fibLevels.length; f++) {
    plots[`plot${f}`] = [];
  }

  for (let i = 0; i < bars.length; i++) {
    if (i < warmup || isNaN(highestArr[i]) || isNaN(lowestArr[i])) {
      for (let f = 0; f < fibLevels.length; f++) {
        plots[`plot${f}`].push({ time: bars[i].time, value: NaN });
      }
    } else {
      const h = highestArr[i];
      const l = lowestArr[i];
      const range = h - l;
      for (let f = 0; f < fibLevels.length; f++) {
        plots[`plot${f}`].push({ time: bars[i].time, value: l + range * fibLevels[f] });
      }
    }
  }

  // Pine fills between adjacent fib level plots:
  // fill(ON,SS, red), fill(SS,SO, #3399FF), fill(SO,FI, lime),
  // fill(FI,TE, lime), fill(TE,TT, #3399FF), fill(TT,ZZ, red)
  // Levels: plot6=1.0, plot5=0.786, plot4=0.618, plot3=0.5, plot2=0.382, plot1=0.236, plot0=0.0
  const fills = [
    { plot1: 'plot6', plot2: 'plot5', options: { color: 'rgba(255,0,0,0.20)' } },
    { plot1: 'plot5', plot2: 'plot4', options: { color: 'rgba(51,153,255,0.20)' } },
    { plot1: 'plot4', plot2: 'plot3', options: { color: 'rgba(0,255,0,0.20)' } },
    { plot1: 'plot3', plot2: 'plot2', options: { color: 'rgba(0,255,0,0.20)' } },
    { plot1: 'plot2', plot2: 'plot1', options: { color: 'rgba(51,153,255,0.20)' } },
    { plot1: 'plot1', plot2: 'plot0', options: { color: 'rgba(255,0,0,0.20)' } },
  ];

  // The original's levels: FH / FL = ta.highestbars(high) / ta.lowestbars(low), downfibo = FH < FL; a downward fib
  // goes up from the low (Flow + range * r), an upward fib down from the high (Fhigh - range * r)
  const n = bars.length;
  const num = (v: number | null | undefined) => (v == null ? NaN : v);
  const FH = ta.highestbars(highSeries, length).toArray().map(num);
  const FL = ta.lowestbars(lowSeries, length).toArray().map(num);
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.618];
  const F: number[][] = ratios.map(() => new Array(n));
  for (let i = 0; i < n; i++) {
    const h = num(highestArr[i]), l = num(lowestArr[i]);
    const down = FH[i] < FL[i];
    ratios.forEach((r, k) => {
      F[k][i] = down ? (h - l) * r + l : h - (h - l) * r;
    });
  }

  // plotshape(F<r>, style = shape.labeldown, location.absolute, color = Fcolor, show_last = 1, text = '%<r>',
  // offset = 15) and the High / Low labels (size.large, yellow, offset = FH / FL): drawn on the last bar only
  const markers: MarkerData[] = [];
  const last = n - 1;
  if (last >= 0) {
    const interval = barInterval(bars);
    const down = FH[last] < FL[last];
    const fColor = down ? '#00cc00' : '#E41019';
    const textColor = String(color.new(color.black, 30));
    const texts = ['%0', '%23.6', '%38.2', '%50', '%61.8', '%78.6', '%100', '%161.8'];
    texts.forEach((text, k) => {
      let v = F[k][last];
      // plotF1618 and F1618 ? F1618 : na
      if (k === 7 && !(plotF1618 && v !== 0 && !isNaN(v))) v = NaN;
      if (isNaN(v)) return;
      markers.push({ id: `shape${k}`, time: barTime(bars, last + 15, interval), position: 'atPriceTop', price: v,
        shape: 'labelDown', color: fColor, text, textColor });
    });
    const yellow = '#FFEB3B';
    const lo = num(lowestArr[last]), hi = num(highestArr[last]);
    if (!isNaN(lo) && !isNaN(FL[last])) {
      markers.push({ id: 'shape8', time: barTime(bars, last + FL[last], interval), position: 'atPriceBottom', price: lo,
        shape: 'labelUp', color: yellow, text: 'Low', textColor: color.black, size: 'large' });
    }
    if (!isNaN(hi) && !isNaN(FH[last])) {
      markers.push({ id: 'shape9', time: barTime(bars, last + FH[last], interval), position: 'atPriceTop', price: hi,
        shape: 'labelDown', color: yellow, text: 'High', textColor: color.black, size: 'large' });
    }
  }

  // alertcondition(FH > FL and ta.crossover(close, F<r>)) ... for r = 0.236 ... 0.786: upward buy, upward sell,
  // downward buy (FH < FL), downward sell
  const close = bars.map((b) => b.close);
  const up = FH.map((h, i) => h > FL[i]);
  const dn = FH.map((h, i) => h < FL[i]);
  const alertLevels = [1, 2, 3, 4, 5];
  const over = alertLevels.map((k) => crossedOver(close, F[k]));
  const under = alertLevels.map((k) => crossedUnder(close, F[k]));
  const flags: boolean[][] = [
    ...over.map((c) => c.map((x, i) => x && up[i])),
    ...under.map((c) => c.map((x, i) => x && up[i])),
    ...over.map((c) => c.map((x, i) => x && dn[i])),
    ...under.map((c) => c.map((x, i) => x && dn[i])),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = (['Upward Buy', 'Upward Sell', 'Downward Buy', 'Downward Sell'] as const)
  .flatMap((kind) => ['F236', 'F382', 'F500', 'F618', 'F786'].map((lvl) => `${kind} ${lvl}`))
  .map((m, k) => ({ id: `alert${k}`, title: `${m} Signal`, message: m }));

export const AutoFib = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
