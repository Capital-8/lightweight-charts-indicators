/**
 * SCOTTGO Advanced MACD (MACD: Clean Visuals)
 *
 * MACD = MA(src, fast) - MA(src, slow) (EMA or SMA), signal = MA(MACD, signal length) (EMA or SMA), histogram =
 * MACD - signal, coloured by sign and by its rise / fall. A fill between the MACD and the signal line is green when
 * the MACD is above the signal, red otherwise. Crosses of the MACD and the signal give a dot on the signal line and
 * a triangle 0.005 below (up cross) / above (down cross) it; crosses of the MACD and zero give a circle at -0.01
 * (MACD rising) or a diamond at +0.01 (MACD falling).
 * Alerts (alertcondition, `alerts` of the result): 'Rising to falling' (histogram from >= 0 to < 0) and 'Falling to
 * rising' (histogram from <= 0 to > 0).
 *
 * Reference: "SCOTTGO Advanced MACD" by SCOTTGO (indicator title "MACD: Clean Visuals (Fixed Arrows)")
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ScottgoAdvancedMacdInputs {
  src: SourceType;
  fastLength: number;
  slowLength: number;
  signalLength: number;
  /** MA type of the fast / slow averages */
  oscType: 'EMA' | 'SMA';
  /** MA type of the signal line */
  sigType: 'EMA' | 'SMA';
  /** Fill between the MACD and the signal line */
  showShadow: boolean;
  shadowColorUp: string;
  shadowColorDown: string;
  /** Cross arrows (MACD / signal) and zero-cross markers */
  showCrossoverMarkers: boolean;
  /** Dot on the signal line at MACD / signal crosses */
  showCrossoverCircles: boolean;
  circleColor: string;
}

export const defaultInputs: ScottgoAdvancedMacdInputs = {
  src: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscType: 'EMA',
  sigType: 'EMA',
  showShadow: true,
  shadowColorUp: 'rgba(76, 175, 80, 0.15)',
  shadowColorDown: 'rgba(242, 54, 69, 0.15)',
  showCrossoverMarkers: true,
  showCrossoverCircles: true,
  circleColor: 'rgba(255, 255, 255, 0.8)',
};

export const inputConfig: InputConfig[] = [
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'fastLength', type: 'int', title: 'Fast length', defval: 12, min: 1 },
  { id: 'slowLength', type: 'int', title: 'Slow length', defval: 26, min: 1 },
  { id: 'signalLength', type: 'int', title: 'Signal length', defval: 9, min: 1 },
  { id: 'oscType', type: 'string', title: 'Oscillator MA type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'sigType', type: 'string', title: 'Signal MA type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'showShadow', type: 'bool', title: 'Show Crossover Shadow', defval: true },
  { id: 'shadowColorUp', type: 'color', title: 'Up Shadow Color', defval: 'rgba(76, 175, 80, 0.15)' },
  { id: 'shadowColorDown', type: 'color', title: 'Down Shadow Color', defval: 'rgba(242, 54, 69, 0.15)' },
  { id: 'showCrossoverMarkers', type: 'bool', title: 'Show MACD/Signal Crossover Markers (Arrows & Dot)', defval: true },
  { id: 'showCrossoverCircles', type: 'bool', title: 'Show Crossover Dot', defval: true },
  { id: 'circleColor', type: 'color', title: 'Dot Color & Opacity (0=Solid)', defval: 'rgba(255, 255, 255, 0.8)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Histogram', color: '#2962FF', lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'MACD', color: '#2962FF', lineWidth: 1 },
  { id: 'plot2', title: 'Signal line', color: '#ff6d00', lineWidth: 1 },
  { id: 'plot3', title: 'ShadowFill', color: String(color.new(color.gray, 100)), lineWidth: 1 },
];

export const metadata = {
  title: 'MACD: Clean Visuals (Fixed Arrows)',
  shortTitle: 'MACD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<ScottgoAdvancedMacdInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const ma = (s: Series, len: number, type: string) => (type === 'EMA' ? ta.ema(s, len) : ta.sma(s, len));

  const src = getSourceSeries(bars, cfg.src);
  const maFast = A(ma(src, cfg.fastLength, cfg.oscType));
  const maSlow = A(ma(src, cfg.slowLength, cfg.oscType));
  const macd = maFast.map((f, i) => f - maSlow[i]);
  const signal = A(ma(S(macd), cfg.signalLength, cfg.sigType));
  const hist = macd.map((m, i) => m - signal[i]);

  // ta.crossover / ta.crossunder / ta.cross compare exactly, with the last bar where both values were not na
  const crossUp = A(ta.crossover(S(macd), S(signal)));
  const crossDown = A(ta.crossunder(S(macd), S(signal)));
  const crossZero = A(ta.cross(S(macd), 0));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const fillColors: string[] = [];
  const noFill = String(color.new(color.white, 100));
  const markers: MarkerData[] = [];
  const fallFlags: boolean[] = [], riseFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const h = hist[i];
    const h1 = i > 0 ? hist[i - 1] : NaN;
    // hist >= 0 ? hist > hist[1] ? #26a69a : #b2dfdb : hist > hist[1] ? #ffcdd2 : #ff5252
    const hColor = ge(h, 0) ? (gt(h, h1) ? '#26a69a' : '#b2dfdb') : (gt(h, h1) ? '#ffcdd2' : '#ff5252');
    plot0.push({ time: t, value: fin(h), color: hColor });
    // alertcondition(hist[1] >= 0 and hist < 0, ...) / alertcondition(hist[1] <= 0 and hist > 0, ...)
    fallFlags.push(ge(h1, 0) && lt(h, 0));
    riseFlags.push(le(h1, 0) && gt(h, 0));
    plot1.push({ time: t, value: fin(macd[i]) });
    plot2.push({ time: t, value: fin(signal[i]) });
    plot3.push({ time: t, value: cfg.showShadow ? fin(macd[i]) : NaN });
    fillColors.push(cfg.showShadow ? (gt(macd[i], signal[i]) ? cfg.shadowColorUp : cfg.shadowColorDown) : noFill);

    const up = crossUp[i] === 1;
    const down = crossDown[i] === 1;
    // plotshape(showCrossoverCircles and crossoverEvent ? signal : na, shape.circle, location.absolute, size.small)
    if (cfg.showCrossoverCircles && (up || down) && Number.isFinite(signal[i])) {
      markers.push({ time: t, position: 'atPriceMiddle', price: signal[i], shape: 'circle', color: cfg.circleColor, size: 'small', id: 'shape0' });
    }
    // signal -/+ arrowGap (0.005), triangles, location.absolute, size.small
    if (cfg.showCrossoverMarkers && up && Number.isFinite(signal[i] - 0.005)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: signal[i] - 0.005, shape: 'triangleUp', color: color.lime, size: 'small', id: 'shape1' });
    }
    if (cfg.showCrossoverMarkers && down && Number.isFinite(signal[i] + 0.005)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: signal[i] + 0.005, shape: 'triangleDown', color: color.red, size: 'small', id: 'shape2' });
    }
    // zeroCrossUp = ta.cross(macd, 0) and macd > macd[1]; zeroCrossDown = ta.cross(macd, 0) and macd < macd[1]
    const m1 = i > 0 ? macd[i - 1] : NaN;
    const cz = crossZero[i] === 1;
    if (cfg.showCrossoverMarkers && cz && gt(macd[i], m1)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: -0.01, shape: 'circle', color: color.green, size: 'tiny', id: 'shape3' });
    }
    if (cfg.showCrossoverMarkers && cz && lt(macd[i], m1)) {
      markers.push({ time: t, position: 'atPriceMiddle', price: 0.01, shape: 'diamond', color: color.red, size: 'tiny', id: 'shape4' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    hlines: [{ value: 0, options: { title: 'Zero', color: '#787b8680', linestyle: 'dashed' } }],
    // fill(plotShadow, plotSignal, color = fillColor, title = "Crossover Shadow")
    fills: [{ plot1: 'plot3', plot2: 'plot2', options: { title: 'Crossover Shadow' }, colors: fillColors }],
    markers,
    alerts: alertStates(alertConditions, bars, [fallFlags, riseFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Rising to falling', message: 'MACD histogram switched from a rising to falling state' },
  { id: 'alert1', title: 'Falling to rising', message: 'MACD histogram switched from a falling to rising state' },
];

export const ScottgoAdvancedMacd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
