/**
 * Weis Wave Candle
 *
 * Weis waves of candle size instead of volume. The candle size is |close - open|, plus half of the high - low range
 * when shadows are included. A wave adds the candle sizes while its direction stays the same.
 * - LazyBear Style: the trend is the direction of the last close move that differs from the previous one; the wave
 *   takes the trend when close is rising or falling over `trendPeriod` bars.
 * - Impulse Trend: the wave is the sign of the sum of the close directions (+1 / -1 / 0) over `trendPeriod` bars
 *   (kept when the sum is 0).
 * Up and down waves are columns coloured with a gradient between a base and an intense colour, from the wave total
 * normalized to 0..100 between the lowest and highest wave totals of `lookback` bars; the background takes the
 * wave colour with a transparency of 90.
 * Alerts (alertcondition, `alerts` of the result): 'Upward Trend Change' / 'Downward Trend Change' on the bars where
 * the wave turns from down to up / from up to down.
 *
 * Reference: "Weis Wave Candle" by Uncle_the_shooter
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Uncle_the_shooter
 */

import { ta, taCore, callsite, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface WeisWaveCandleInputs {
  /** Trend detection method */
  method: 'LazyBear Style' | 'Impulse Trend';
  trendPeriod: number;
  /** Include half of the candle shadows (high - low) in the candle size */
  useShadows: boolean;
  /** Lookback period of the lowest / highest wave totals of the gradient */
  lookback: number;
  gradientMin: number;
  gradientMax: number;
  upWaveBaseColor: string;
  upWaveIntenseColor: string;
  downWaveBaseColor: string;
  downWaveIntenseColor: string;
}

// Input colour defaults: color.new(color.rgb(...), 35) is the alpha 0.65 (byte 166), transparency 20 the byte 204
export const defaultInputs: WeisWaveCandleInputs = {
  method: 'LazyBear Style',
  trendPeriod: 4,
  useShadows: true,
  lookback: 70,
  gradientMin: 0,
  gradientMax: 100,
  upWaveBaseColor: 'rgba(144, 238, 144, 0.65)',
  upWaveIntenseColor: 'rgba(0, 100, 0, 0.8)',
  downWaveBaseColor: 'rgba(255, 99, 71, 0.65)',
  downWaveIntenseColor: 'rgba(139, 0, 0, 0.8)',
};

export const inputConfig: InputConfig[] = [
  { id: 'method', type: 'string', title: 'Trend detection method', defval: 'LazyBear Style', options: ['LazyBear Style', 'Impulse Trend'] },
  { id: 'trendPeriod', type: 'int', title: 'Trend analysis period', defval: 4, min: 1 },
  { id: 'useShadows', type: 'bool', title: 'Include candle shadows', defval: true },
  { id: 'lookback', type: 'int', title: 'Lookback period for dynamic thresholds', defval: 70, min: 10 },
  { id: 'gradientMin', type: 'float', title: 'Gradient minimum value', defval: 0, min: 0, max: 100 },
  { id: 'gradientMax', type: 'float', title: 'Gradient maximum value', defval: 100, min: 0, max: 100 },
  { id: 'upWaveBaseColor', type: 'color', title: 'Upward wave base color', defval: 'rgba(144, 238, 144, 0.65)' },
  { id: 'upWaveIntenseColor', type: 'color', title: 'Upward wave intense color', defval: 'rgba(0, 100, 0, 0.8)' },
  { id: 'downWaveBaseColor', type: 'color', title: 'Downward wave base color', defval: 'rgba(255, 99, 71, 0.65)' },
  { id: 'downWaveIntenseColor', type: 'color', title: 'Downward wave intense color', defval: 'rgba(139, 0, 0, 0.8)' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upward wave', color: 'rgba(0, 100, 0, 0.8)', lineWidth: 3, style: 'columns' },
  { id: 'plot1', title: 'Downward wave', color: 'rgba(139, 0, 0, 0.8)', lineWidth: 3, style: 'columns' },
];

export const metadata = {
  title: 'Weis Wave Candle',
  shortTitle: 'WWC',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<WeisWaveCandleInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const len = cfg.trendPeriod;

  const candleSize = bars.map((b) => (cfg.useShadows
    ? Math.abs(b.close - b.open) + (b.high - b.low) * 0.5
    : Math.abs(b.close - b.open)));
  // close > close[1] ? 1 : close < close[1] ? -1 : 0 (0 on the first bar: close[1] is na)
  const mov = bars.map((b, i) => (i > 0 && gt(b.close, close[i - 1]) ? 1 : i > 0 && lt(b.close, close[i - 1]) ? -1 : 0));

  // wave: an int, 0 until the first trend (nz(wave[1]) on the first bar)
  const wave: number[] = new Array(n);
  if (cfg.method === 'LazyBear Style') {
    // isTrending = ta.rising(close, p) or ta.falling(close, p): the lazy `or` runs ta.falling only on the bars where
    // ta.rising is false, so its history holds the closes of those bars only
    const rising = taCore.rising(close, len);
    const falling = callsite.whenCalled(rising.map((r) => !r), (x) => taCore.falling(x, len), close);
    let trend = NaN; // var int trend = na
    for (let i = 0; i < n; i++) {
      const prevTrend = isNaN(trend) ? 0 : trend; // nz(trend[1])
      // mov != mov[1]: mov[1] is na on the first bar (false)
      trend = mov[i] !== 0 && i > 0 && mov[i] !== mov[i - 1] ? mov[i] : prevTrend;
      const isTrending = rising[i] || falling[i] === true;
      const prevWave = i > 0 ? wave[i - 1] : 0; // nz(wave[1])
      wave[i] = trend !== prevWave && isTrending ? trend : prevWave;
    }
  } else {
    const dirStrength = A(math.sum(S(mov), len));
    let trend = NaN; // var int trend = na
    for (let i = 0; i < n; i++) {
      const prevTrend = isNaN(trend) ? 0 : trend; // nz(trend[1])
      trend = gt(dirStrength[i], 0) ? 1 : lt(dirStrength[i], 0) ? -1 : prevTrend;
      const prevWave = i > 0 ? wave[i - 1] : 0; // nz(wave[1])
      wave[i] = trend !== prevWave ? trend : prevWave;
    }
  }

  // waveTotal := wave == wave[1] ? nz(waveTotal[1]) + candleSize : candleSize
  const waveTotal: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = i > 0 && !isNaN(waveTotal[i - 1]) ? waveTotal[i - 1] : 0;
    waveTotal[i] = i > 0 && wave[i] === wave[i - 1] ? prev + candleSize[i] : candleSize[i];
  }
  const waveUp = wave.map((w, i) => (w === 1 ? waveTotal[i] : 0.0));
  const waveDown = wave.map((w, i) => (w === -1 ? waveTotal[i] : 0.0));

  const maxWave = A(ta.highest(S(waveTotal), cfg.lookback));
  const minWave = A(ta.lowest(S(waveTotal), cfg.lookback));

  const plot0 = [];
  const plot1 = [];
  const bgColors: BgColorData[] = [];
  let waveColorUp: string | null = null; // var color waveColorUp = na
  let waveColorDown: string | null = null;
  for (let i = 0; i < n; i++) {
    const rangeWave = maxWave[i] - minWave[i];
    const normWaveUp = gt(rangeWave, 0) ? ((waveUp[i] - minWave[i]) / rangeWave) * 100 : 0;
    const normWaveDown = gt(rangeWave, 0) ? ((waveDown[i] - minWave[i]) / rangeWave) * 100 : 0;
    if (gt(waveUp[i], 0)) {
      waveColorUp = color.from_gradient(normWaveUp, cfg.gradientMin, cfg.gradientMax, cfg.upWaveBaseColor, cfg.upWaveIntenseColor);
    }
    if (gt(waveDown[i], 0)) {
      waveColorDown = color.from_gradient(normWaveDown, cfg.gradientMin, cfg.gradientMax, cfg.downWaveBaseColor, cfg.downWaveIntenseColor);
    }
    const t = bars[i].time;
    plot0.push({ time: t, value: waveUp[i], color: waveColorUp ?? 'transparent' });
    plot1.push({ time: t, value: waveDown[i], color: waveColorDown ?? 'transparent' });
    // bgcolor(waveUp > 0.01 ? color.new(waveColorUp, 90) : na), then the same for the down wave (drawn on top)
    if (gt(waveUp[i], 0.01) && waveColorUp !== null) {
      bgColors.push({ time: t, color: String(color.new(waveColorUp, 90)), id: 'bgcolor0' });
    }
    if (gt(waveDown[i], 0.01) && waveColorDown !== null) {
      bgColors.push({ time: t, color: String(color.new(waveColorDown, 90)), id: 'bgcolor1' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    bgColors,
    // alertcondition(wave == 1 and wave[1] == -1, ...) / alertcondition(wave == -1 and wave[1] == 1, ...)
    alerts: alertStates(alertConditions, bars, [
      wave.map((w, i) => i > 0 && w === 1 && wave[i - 1] === -1),
      wave.map((w, i) => i > 0 && w === -1 && wave[i - 1] === 1),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Upward Trend Change', message: 'Weis Wave: Trend changed to Upward' },
  { id: 'alert1', title: 'Downward Trend Change', message: 'Weis Wave: Trend changed to Downward' },
];

export const WeisWaveCandle = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
