/**
 * Auto Fibonacci
 *
 * Fibonacci levels between the highest high and the lowest low of the last "Fibo Period" bars (144). When the
 * highest high is older than the lowest low (a downward leg) the levels go up from the low (low + range x ratio,
 * green #00cc00), else down from the high (high - range x ratio, red #E41019). Levels 0, 0.236, 0.382, 0.5, 0.618,
 * 0.786, 1 and 1.618 (the last one when "Plot 1.618 Level?" is on and the level is not 0).
 * As in the original, each level plot has a value on the last bar only (show_last = 1) and a price line at that value
 * across the chart (trackprice = true, `lines` of the result, dashed, in the level colour); na until "Fibo Period"
 * bars exist. On the last bar, the original's level labels (%0 ... %161.8, 15 bars after the last bar) and the
 * High / Low labels on the bars of the highest high / lowest low.
 * Alerts (alertcondition, `alerts` of the result): the close crossing over / under the 0.236 ... 0.786 levels of the
 * original, in an upward (highest high more recent than the lowest low) or a downward retracement.
 *
 * Reference: "Auto Fibonacci" (community)
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AutoFibInputs {
  /** Fibo Period */
  length: number;
  /** Draw the 1.618 level label */
  plotF1618: boolean;
}

export const defaultInputs: AutoFibInputs = {
  length: 144,
  plotF1618: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Fibo Period', defval: 144, min: 1 },
  { id: 'plotF1618', type: 'bool', title: 'Plot 1.618 Level?', defval: true },
];

/** Level colours: downward leg (levels from the low up) / upward leg (from the high down) */
const DOWN_COLOR = '#00cc00';
const UP_COLOR = '#E41019';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '0', color: DOWN_COLOR, lineWidth: 2 },
  { id: 'plot1', title: '0.236', color: DOWN_COLOR, lineWidth: 1 },
  { id: 'plot2', title: '0.382', color: DOWN_COLOR, lineWidth: 1 },
  { id: 'plot3', title: '0.5', color: DOWN_COLOR, lineWidth: 2 },
  { id: 'plot4', title: '0.618', color: DOWN_COLOR, lineWidth: 1 },
  { id: 'plot5', title: '0.786', color: DOWN_COLOR, lineWidth: 1 },
  { id: 'plot6', title: '1', color: DOWN_COLOR, lineWidth: 2 },
  { id: 'plot7', title: '1.618', color: DOWN_COLOR, lineWidth: 3 },
];

export const metadata = {
  title: 'Auto Fibonacci',
  shortTitle: 'AutoFib',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoFibInputs> = {},
): Omit<IndicatorResult, 'markers' | 'lines'> & { markers: MarkerData[]; lines: LineDrawingData[] } & { alerts: AlertConditionState[] } {
  const { length, plotF1618 } = { ...defaultInputs, ...inputs };

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  // Fhigh = ta.highest(FPeriod), Flow = ta.lowest(FPeriod): na until FPeriod bars exist
  const highestArr = ta.highest(highSeries, length).toArray();
  const lowestArr = ta.lowest(lowSeries, length).toArray();

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
  // plot(plotF1618 and F1618 ? F1618 : na, ...): na when off, 0 or na
  const shown = (k: number, v: number) => (k === 7 && !(plotF1618 && v !== 0 && !isNaN(v)) ? NaN : v);

  // plot(F<r>, color = Fcolor, trackprice = true, show_last = 1): only the value of the last bar is drawn, with a
  // price line at that value across the chart
  const last = n - 1;
  const lastColor = last >= 0 && FH[last] < FL[last] ? DOWN_COLOR : UP_COLOR;
  const plots: Record<string, { time: number; value: number; color?: string }[]> = {};
  const lines: LineDrawingData[] = [];
  ratios.forEach((_r, k) => {
    const lastValue = last >= 0 ? shown(k, F[k][last]) : NaN;
    plots[`plot${k}`] = bars.map((b, i) => (i === last && !isNaN(lastValue)
      ? { time: b.time, value: lastValue, color: lastColor }
      : { time: b.time, value: NaN }));
    if (!isNaN(lastValue)) {
      lines.push({ time1: bars[0].time as number, price1: lastValue, time2: bars[last].time as number, price2: lastValue,
        color: lastColor, width: 1, style: 'dashed', extend: 'both' });
    }
  });

  // plotshape(F<r>, style = shape.labeldown, location.absolute, color = Fcolor, show_last = 1, text = '%<r>',
  // offset = 15) and the High / Low labels (size.large, yellow, offset = FH / FL): drawn on the last bar only
  const markers: MarkerData[] = [];
  if (last >= 0) {
    const interval = barInterval(bars);
    const down = FH[last] < FL[last];
    const fColor = down ? DOWN_COLOR : UP_COLOR;
    const textColor = String(color.new(color.black, 30));
    const texts = ['%0', '%23.6', '%38.2', '%50', '%61.8', '%78.6', '%100', '%161.8'];
    texts.forEach((text, k) => {
      // plotF1618 and F1618 ? F1618 : na
      const v = shown(k, F[k][last]);
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
    markers,
    lines,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = (['Upward Buy', 'Upward Sell', 'Downward Buy', 'Downward Sell'] as const)
  .flatMap((kind) => ['F236', 'F382', 'F500', 'F618', 'F786'].map((lvl) => `${kind} ${lvl}`))
  .map((m, k) => ({ id: `alert${k}`, title: `${m} Signal`, message: m }));

export const AutoFib = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
