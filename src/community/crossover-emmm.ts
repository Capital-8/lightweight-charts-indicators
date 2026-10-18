/**
 * Crossover EMMM
 *
 * A fast and a slow EMA of hl2. Each line is green when it rises, red when it falls (no colour when it is flat).
 * Triangles mark the crossovers (BUY) and crossunders (SELL) of the two lines; circles mark the bars where the fast
 * line turns red (green) while the slow line is red (green). The signals are drawn one bar earlier (offset -1).
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close) on confirmed bars (`barstate.isconfirmed`:
 * the last bar only when the chart context, the optional third argument, says it is closed, `lastBarConfirmed`; true
 * without a context): "BUY EMM" on a crossover, else "SELL EMM" on a crossunder, else "Point Buy" on a buy circle,
 * else "Point Sell" on a sell circle.
 *
 * Reference: "Crossover EMMM" by NunyadzilaTrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { barInterval, barTime } from '../bar-time';

export interface CrossoverEmmmInputs {
  /** Fast EMA length */
  ma1Length: number;
  /** Plot offset of the fast line */
  offset: number;
  /** Slow EMA length */
  ma2Length: number;
  /** Plot offset of the slow line */
  offset2: number;
}

export const defaultInputs: CrossoverEmmmInputs = {
  ma1Length: 9,
  offset: 0,
  ma2Length: 33,
  offset2: 0,
};

export const inputConfig: InputConfig[] = [
  { id: 'ma1Length', type: 'int', title: 'Fast EMMM Length', defval: 9 },
  { id: 'offset', type: 'int', title: 'Offset Fast EMMM', defval: 0, min: -500, max: 500 },
  { id: 'ma2Length', type: 'int', title: 'Slow EMMM Length', defval: 33 },
  { id: 'offset2', type: 'int', title: 'Offset Slow EMMM', defval: 0, min: -500, max: 500 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast EMMM', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'Slow EMMM', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'CrossoverV2025',
  shortTitle: 'CrossoverV2025',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<CrossoverEmmmInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));

  const hl2 = Series.fromArray(bars, bars.map((b) => (b.high + b.low) / 2));
  const ma1S = ta.ema(hl2, cfg.ma1Length);
  const ma2S = ta.ema(hl2, cfg.ma2Length);
  const ma1 = A(ma1S);
  const ma2 = A(ma2S);

  // maColor = ma > ma[1] ? color.green : ma < ma[1] ? color.red : na (null = na)
  const dirColor = (a: number[], i: number): string | null => {
    const prev = i > 0 ? a[i - 1] : NaN;
    return gt(a[i], prev) ? color.green : lt(a[i], prev) ? color.red : null;
  };
  const ma1Color = ma1.map((_v, i) => dirColor(ma1, i));
  const ma2Color = ma2.map((_v, i) => dirColor(ma2, i));

  // ta.crossover / ta.crossunder (exact comparisons, last bar where both values were not na)
  const crossover = B(ta.crossover(ma1S, ma2S));
  const crossunder = B(ta.crossunder(ma1S, ma2S));

  const interval = barInterval(bars);
  // plot(..., offset = k): the value (and colour) of bar i is drawn on bar i + k
  const shifted = (values: number[], colors: (string | null)[], k: number): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      if (i + k < 0) continue;
      out.push({ time: barTime(bars, i + k, interval), value: values[i], color: colors[i] ?? 'transparent' });
    }
    return out;
  };

  const markers: MarkerData[] = [];
  const pointSell = String(color.rgb(255, 82, 82, 46));
  const pointBuy = String(color.rgb(76, 175, 79, 49));
  const alertCalls: AlertCall[] = [];
  const lastConfirmed = lastBarConfirmedOf(chart);
  for (let i = 1; i < n; i++) {
    // color == color: na colours compare false
    const redCircle = ma1Color[i - 1] === color.green && ma1Color[i] === color.red && ma2Color[i] === color.red;
    const greenCircle = ma1Color[i - 1] === color.red && ma1Color[i] === color.green && ma2Color[i] === color.green;
    // plotshape(..., offset = -1): drawn on the bar before
    const t = bars[i - 1].time;
    if (crossover[i]) {
      markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: color.green, size: 'small' });
    }
    if (crossunder[i]) {
      markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }
    if (redCircle) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: pointSell, size: 'small' });
    }
    if (greenCircle) {
      markers.push({ time: t, position: 'belowBar', shape: 'circle', color: pointBuy, size: 'small' });
    }
    // if barstate.isconfirmed: alert_message := crossover ? "BUY EMM" : crossunder ? "SELL EMM" : green circle ?
    // "Point Buy" : red circle ? "Point Sell" : na; if not na(alert_message): alert(alert_message, once_per_bar_close)
    if (i < n - 1 || lastConfirmed) {
      const message = crossover[i] ? 'BUY EMM' : crossunder[i] ? 'SELL EMM' : greenCircle ? 'Point Buy'
        : redCircle ? 'Point Sell' : null;
      if (message) alertCalls.push({ time: bars[i].time, message, freq: 'once_per_bar_close' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: shifted(ma1, ma1Color, cfg.offset),
      plot1: shifted(ma2, ma2Color, cfg.offset2),
    },
    markers,
    alertCalls,
  };
}

/** The original makes alert() calls */
export const hasAlertFunction = true;

export const CrossoverEmmm = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
