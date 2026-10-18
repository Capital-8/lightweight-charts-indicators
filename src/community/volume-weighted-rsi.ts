/**
 * Volume Weighted RSI (VW RSI)
 *
 * An RSI of volume: the volume of an up close (close > close[1]) and of a down close are averaged with an RMA of
 * `length` bars; VW RSI = 100 - 100 / (1 + avgUp / avgDown). The line is green above 50, red below 50, gray at 50.
 * Horizontal lines at 50 and at the overbought / oversold levels; a red background above the overbought level and a
 * green background below the oversold level.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): VW RSI crossing over / under 50, over the
 * overbought level and under the oversold level.
 *
 * Reference: "Volume Weighted RSI (VW RSI)" by CsokosGeza
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BgColorData } from '../types';
import { crossedOver, crossedUnder } from '../alert-states';

/** The original makes alert() calls */
export const hasAlertFunction = true;

export interface VolumeWeightedRsiInputs {
  /** Period of the Volume Weighted RSI */
  length: number;
  overbought: number;
  oversold: number;
  showCenterline: boolean;
  showOverboughtOversold: boolean;
}

export const defaultInputs: VolumeWeightedRsiInputs = {
  length: 14,
  overbought: 70,
  oversold: 30,
  showCenterline: true,
  showOverboughtOversold: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'VW RSI Length', defval: 14, min: 1, step: 1 },
  { id: 'overbought', type: 'float', title: 'Overbought Level', defval: 70, min: 50, max: 100, step: 1 },
  { id: 'oversold', type: 'float', title: 'Oversold Level', defval: 30, min: 0, max: 50, step: 1 },
  { id: 'showCenterline', type: 'bool', title: 'Show Centerline', defval: true },
  { id: 'showOverboughtOversold', type: 'bool', title: 'Show Overbought/Oversold Lines', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VW RSI', color: color.green, lineWidth: 2 },
];

export const metadata = {
  title: 'Volume Weighted RSI (VW RSI)',
  shortTitle: 'Volume Weighted RSI (VW RSI)',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumeWeightedRsiInputs> = {},
): IndicatorResult & { bgColors: BgColorData[]; alertCalls: AlertCall[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // up_volume = close > close[1] ? volume : 0 (close[1] na on the first bar: 0)
  const vol = bars.map((b) => b.volume ?? NaN);
  const upVolume = bars.map((b, i) => (i > 0 && gt(b.close, bars[i - 1].close) ? vol[i] : 0));
  const downVolume = bars.map((b, i) => (i > 0 && lt(b.close, bars[i - 1].close) ? vol[i] : 0));
  const avgUp = A(ta.rma(S(upVolume), cfg.length));
  const avgDown = A(ta.rma(S(downVolume), cfg.length));

  const obBg = String(color.new(color.red, 90));
  const osBg = String(color.new(color.green, 90));
  const plot0 = [];
  const bgColors: BgColorData[] = [];
  const rsi: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    // A plain division: x / 0 is +-infinity (VW RSI 100), 0 / 0 is na
    const vwRs = avgUp[i] / avgDown[i];
    const vwRsi = 100 - 100 / (1 + vwRs);
    rsi[i] = vwRsi;
    const c = gt(vwRsi, 50) ? color.green : lt(vwRsi, 50) ? color.red : color.gray;
    plot0.push({ time: bars[i].time, value: Number.isFinite(vwRsi) ? vwRsi : NaN, color: c });
    if (gt(vwRsi, cfg.overbought)) bgColors.push({ time: bars[i].time, color: obBg });
    else if (lt(vwRsi, cfg.oversold)) bgColors.push({ time: bars[i].time, color: osBg });
  }

  // if ta.crossover(vw_rsi, 50) alert(...) ... (alert.freq_once_per_bar), in the order of the original
  const calls: [boolean[], string][] = [
    [crossedOver(rsi, 50), 'VW RSI Bullish: Crossed above 50'],
    [crossedUnder(rsi, 50), 'VW RSI Bearish: Crossed below 50'],
    [crossedOver(rsi, cfg.overbought), 'VW RSI Overbought: Crossed above ' + str.tostring(cfg.overbought)],
    [crossedUnder(rsi, cfg.oversold), 'VW RSI Oversold: Crossed below ' + str.tostring(cfg.oversold)],
  ];
  const alertCalls: AlertCall[] = [];
  for (let i = 0; i < n; i++) {
    for (const [flags, message] of calls) {
      if (flags[i]) alertCalls.push({ time: bars[i].time, message, freq: 'once_per_bar' });
    }
  }

  // hline(show ? level : na): an na level draws no line
  const hlines = [];
  if (cfg.showCenterline) {
    hlines.push({ value: 50, options: { title: 'Centerline', color: color.gray, linestyle: 'dashed' as const } });
  }
  if (cfg.showOverboughtOversold) {
    hlines.push({ value: cfg.overbought, options: { title: 'Overbought', color: color.red, linestyle: 'dashed' as const } });
    hlines.push({ value: cfg.oversold, options: { title: 'Oversold', color: color.green, linestyle: 'dashed' as const } });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    hlines,
    bgColors,
    alertCalls,
  };
}

export const VolumeWeightedRsi = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
