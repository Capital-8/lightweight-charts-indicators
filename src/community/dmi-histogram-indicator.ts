/**
 * DMI Histogram Indicator
 *
 * Directional movement with Wilder smoothing: +DI is RMA-smoothed again (`Smoothed +DI Period`), -DI is not. The
 * histogram is +DI - -DI, coloured by its sign and by ADX against its SMA (strong / weak green, weak / strong red),
 * with a transparency of 100 - ADX * 1.9. Here ADX is 100 * EMA(|+DI - -DI| / (+DI + -DI), `ADX Signal Length`).
 * The same colours paint candles on the price pane. +DI - 20 and SMA(-DI) - 22 are drawn; -DI, ADX, its SMA and
 * RMA(5 + +DI - -DI, 3) are hidden. Triangles mark ADX crossing under its SMA (top: +DI above SMA(-DI); bottom:
 * SMA(-DI) above +DI), bright when ADX > 33.
 * Alerts (alertcondition, `alerts` of the result): the two ADX reversals (as the triangles, whether shown or not), ADX
 * crossing over +DI, over SMA(-DI) and over its SMA, and +DI crossing over / under SMA(-DI).
 *
 * Reference: "DMI Histogram Indicator" by Chart0bserver
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Chart0bserver
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, PlotCandleData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface DmiHistogramIndicatorInputs {
  /** EMA length of the ADX */
  lensig: number;
  /** DI length */
  len: number;
  /** RMA length of +DI */
  plusEma: number;
  /** SMA length of the ADX */
  smoothAdxPeriod: number;
  /** SMA length of -DI */
  smoothMinusPeriod: number;
  showColoredCandles: boolean;
  showAdxReversals: boolean;
}

export const defaultInputs: DmiHistogramIndicatorInputs = {
  lensig: 20,
  len: 14,
  plusEma: 4,
  smoothAdxPeriod: 8,
  smoothMinusPeriod: 8,
  showColoredCandles: true,
  showAdxReversals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lensig', type: 'int', title: 'ADX Signal Length', defval: 20, min: 3 },
  { id: 'len', type: 'int', title: 'DI Length', defval: 14, min: 1 },
  { id: 'plusEma', type: 'int', title: 'Smoothed +DI Period', defval: 4, min: 3 },
  { id: 'smoothAdxPeriod', type: 'int', title: 'Smoothed ADX Period', defval: 8, min: 3 },
  { id: 'smoothMinusPeriod', type: 'int', title: 'Smoothed -DI Period', defval: 8, min: 3 },
  { id: 'showColoredCandles', type: 'bool', title: 'Show Colored Candles', defval: true, group: 'Display Options' },
  { id: 'showAdxReversals', type: 'bool', title: 'Show ADX Reversals', defval: true, group: 'Display Options' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'DI Histogram', color: '#26a63d', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: '+DI', color: color.blue, lineWidth: 1 },
  { id: 'plot2', title: '-DI', color: color.orange, lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'ADX', color: color.purple, lineWidth: 2, display: 'none' },
  { id: 'plot4', title: 'Smooth ADX', color: color.white, lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Smooth -DI', color: color.orange, lineWidth: 1 },
  { id: 'plot6', title: 'PM Gap', color: color.silver, lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'DMI Histogram Indicator',
  shortTitle: 'DMI Histogram',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10; a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<DmiHistogramIndicatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]> }
  & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);

  // up = ta.change(high); down = -ta.change(low)
  const up = high.map((v, i) => (i > 0 ? v - high[i - 1] : NaN));
  const down = low.map((v, i) => (i > 0 ? -(v - low[i - 1]) : NaN));
  const plusDM = up.map((u, i) => (isNaN(u) ? NaN : gt(u, down[i]) && gt(u, 0) ? u : 0));
  const minusDM = down.map((d, i) => (isNaN(d) ? NaN : gt(d, up[i]) && gt(d, 0) ? d : 0));
  const trur = A(ta.rma(ta.tr(bars), cfg.len));
  const rmaPlus = A(ta.rma(S(plusDM), cfg.len));
  const rmaMinus = A(ta.rma(S(minusDM), cfg.len));
  // fixnan(100 * ta.rma(dm, len) / trur): a plain division (x / 0 is +-infinity, kept by fixnan; 0 / 0 is na)
  const fixnan = (x: number[]) => {
    let last = NaN;
    return x.map((v) => (isNaN(v) ? last : (last = v)));
  };
  const plus = A(ta.rma(S(fixnan(rmaPlus.map((v, i) => (100 * v) / trur[i]))), cfg.plusEma));
  const minus = fixnan(rmaMinus.map((v, i) => (100 * v) / trur[i]));
  const plusMinusGap = A(ta.rma(S(plus.map((p, i) => 5 + (p - minus[i]))), 3));
  // adx = 100 * ta.ema(math.abs(plus - minus) / (sum == 0 ? 1 : sum), lensig)
  const dx = plus.map((p, i) => {
    const sum = p + minus[i];
    return Math.abs(p - minus[i]) / (eq(sum, 0) ? 1 : sum);
  });
  const adx = A(ta.ema(S(dx), cfg.lensig)).map((v) => 100 * v);
  const smoothMinus = A(ta.sma(S(minus), cfg.smoothMinusPeriod));
  const smoothADX = A(ta.sma(S(adx), cfg.smoothAdxPeriod));

  // adxTrendReversal = ta.crossunder(adx, smoothADX) (exact comparison)
  const reversal = A(ta.crossunder(S(adx), S(smoothADX)));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const diDifference = plus.map((p, i) => p - minus[i]);
  const histColor = (i: number) => {
    const op = 100 - adx[i] * 1.9;
    return String(ge(diDifference[i], 0)
      ? (lt(smoothADX[i], adx[i]) ? color.new('#26a63d', op) : color.new('#b2dfbb', op))
      : (lt(adx[i], smoothADX[i]) ? color.new('#FFCDD2', op) : color.new('#FF5252', op)));
  };
  const histColors = bars.map((_b, i) => histColor(i));

  const line = (v: number[], c: string) => bars.map((b, i) => ({ time: b.time, value: fin(v[i]), color: c }));
  const blue = String(color.new(color.blue, 0));
  const orange = String(color.new(color.orange, 0));

  const candles: PlotCandleData[] = [];
  if (cfg.showColoredCandles) {
    for (let i = 0; i < n; i++) {
      const b = bars[i];
      const c = histColors[i];
      candles.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
        color: c, wickColor: c, borderColor: c, forceOverlay: true });
    }
  }

  const markers: MarkerData[] = [];
  if (cfg.showAdxReversals) {
    for (let i = 0; i < n; i++) {
      if (reversal[i] !== 1) continue;
      const t = bars[i].time;
      // bearishReversal = adxTrendReversal and plus > smoothMinus; bullishReversal = ... and smoothMinus > plus
      if (gt(plus[i], smoothMinus[i])) {
        markers.push({ time: t, position: 'top', shape: 'triangleDown', color: gt(adx[i], 33) ? color.red : '#561f1f', size: 'tiny' });
      }
      if (gt(smoothMinus[i], plus[i])) {
        markers.push({ time: t, position: 'bottom', shape: 'triangleUp', color: gt(adx[i], 33) ? color.green : '#0d2f0e', size: 'tiny' });
      }
    }
  }

  // Alert conditions: bearishReversal / bullishReversal, ta.crossover(adx, plus) / (adx, smoothMinus) /
  // (adx, smoothADX), bullishDI = ta.crossover(plus, smoothMinus), bearishDI = ta.crossunder(plus, smoothMinus)
  const bearishReversal = bars.map((_b, i) => reversal[i] === 1 && gt(plus[i], smoothMinus[i]));
  const bullishReversal = bars.map((_b, i) => reversal[i] === 1 && gt(smoothMinus[i], plus[i]));
  const alertFlags = [
    bearishReversal, bullishReversal, crossedOver(adx, plus), crossedOver(adx, smoothMinus), crossedOver(adx, smoothADX),
    crossedOver(plus, smoothMinus), crossedUnder(plus, smoothMinus),
  ];

  const levelColor = String(color.new(color.gray, 70));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fin(diDifference[i]), color: histColors[i] })),
      plot1: line(plus.map((v) => v - 20), blue),
      plot2: line(minus, orange),
      plot3: line(adx, String(color.new(color.purple, 0))),
      plot4: line(smoothADX, String(color.new(color.white, 0))),
      plot5: line(smoothMinus.map((v) => v - 22), orange),
      plot6: line(plusMinusGap, String(color.new(color.silver, 0))),
    },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: String(color.new(color.white, 100)), linestyle: 'solid' } },
      { value: 10, options: { title: '10 Level', color: levelColor, linestyle: 'dashed' } },
      { value: -10, options: { title: '-10 Level', color: levelColor, linestyle: 'dashed' } },
      { value: 20, options: { title: '20 Level', color: levelColor, linestyle: 'dashed' } },
      { value: -20, options: { title: '-20 Level', color: levelColor, linestyle: 'dashed' } },
    ],
    markers,
    plotCandles: { dmiColoredCandles: candles },
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'ADX Bear Trend Reversal? ', message: 'Possible Bearish Reversal - ADX pivot downward while +DI > -DI' },
  { id: 'alert1', title: 'ADX Bull Trend Reversal?', message: 'Possible Bullish Reversal - ADX pivot downward while -DI > +DI' },
  { id: 'alert2', title: 'ADX Cross Above +DI', message: 'ADX crossed above +DI' },
  { id: 'alert3', title: 'ADX Cross Above -DI', message: 'ADX crossed above -DI' },
  { id: 'alert4', title: "ADX Cross Above it's MA", message: 'Possible Trend Strengthening - ADX pivot upward' },
  { id: 'alert5', title: 'Bullish DI Cross', message: '+DI crossed above -DI (Possibly Bullish)' },
  { id: 'alert6', title: 'Bearish DI Cross', message: '+DI crossed below -DI (Possibly Bearish)' },
];

export const DmiHistogramIndicator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
