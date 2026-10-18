/**
 * TFO + ADX with Histogram & Signal
 *
 * The TFO is the MFI of the source scaled to -1..+1 ((mfi - 50) / 50) plus the Chaikin Money Flow (sum of the close
 * location value times the volume over the sum of the volume), smoothed by an SMA. A signal line (WMA, HMA or EMA)
 * follows the TFO; the histogram is TFO - signal (green at or above 0, red below). The ADX (Wilder DI with a
 * fixnan, ADX smoothing by RMA) is scaled as (adx - 25) / 25 and clipped to -1.5..1.5. The background is gray where
 * |TFO| > 1.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Hist Cross' / 'Bearish Hist Cross' when the histogram
 * crosses over / under 0; 'Extreme High Alert' (TFO crosses under 1 and is above 1) and 'Extreme Low Alert' (TFO
 * crosses over -1 and is below -1) as the original writes them, so they are never true.
 *
 * Reference: "TFO + ADX with Histogram & Signal" by WalrusQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © VP_Futures
 */

import { taCore, math, color, fixnan, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type TfoSignalType = 'EMA' | 'WMA' | 'HMA';

export interface TfoAdxWithHistogramSignalInputs {
  mfiLen: number;
  cmfLen: number;
  /** Price source of the MFI */
  src: SourceType;
  /** TFO SMA smoothing length (1 = no smoothing) */
  smoothLen: number;
  signalType: TfoSignalType;
  signalLen: number;
  /** ADX smoothing length */
  adxLen: number;
  /** DI length */
  diLen: number;
}

export const defaultInputs: TfoAdxWithHistogramSignalInputs = {
  mfiLen: 14,
  cmfLen: 20,
  src: 'hlc3',
  smoothLen: 2,
  signalType: 'WMA',
  signalLen: 3,
  adxLen: 10,
  diLen: 12,
};

export const inputConfig: InputConfig[] = [
  { id: 'mfiLen', type: 'int', title: 'MFI Length', defval: 14, min: 1 },
  { id: 'cmfLen', type: 'int', title: 'CMF Length', defval: 20, min: 1 },
  { id: 'src', type: 'source', title: 'Price Source', defval: 'hlc3' },
  { id: 'smoothLen', type: 'int', title: 'TFO Smoothing', defval: 2, min: 1, max: 10 },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'WMA', options: ['EMA', 'WMA', 'HMA'] },
  { id: 'signalLen', type: 'int', title: 'Signal Line Length', defval: 3, min: 1 },
  { id: 'adxLen', type: 'int', title: 'ADX Smoothing (Shorter for Resp)', defval: 10, min: 1 },
  { id: 'diLen', type: 'int', title: 'DI Length (Shorter for Resp)', defval: 12, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'TFO Histogram', color: String(color.new(color.green, 0)), lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'TFO Signal', color: '#5b9cf6', lineWidth: 2 },
  { id: 'plot2', title: 'TFO', color: String(color.new(color.white, 80)), lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'ADX (scaled)', color: '#fdd835', lineWidth: 1 },
];

// Pine hline default style: dashed
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero', color: color.gray, linestyle: 'dashed' },
  { id: 'hline_upper', price: 0.7, title: 'Upper', color: String(color.new(color.gray, 70)), linestyle: 'dashed' },
  { id: 'hline_lower', price: -0.7, title: 'Lower', color: String(color.new(color.gray, 70)), linestyle: 'dashed' },
];

export const metadata = {
  title: 'TFO + ADX with Histogram & Signal',
  shortTitle: 'TFO+ADX+Hist',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TfoAdxWithHistogramSignalInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // MFI scaled to -1..+1
  const mfi = taCore.mfi(src, cfg.mfiLen, volume).map((v) => (v - 50) / 50);

  // CMF: ad = high == low ? 0 : ((2 * close - high - low) / (high - low)) * volume; plain division of the sums
  const ad = bars.map((_b, i) => (eq(high[i], low[i]) ? 0 : ((2 * close[i] - high[i] - low[i]) / (high[i] - low[i])) * volume[i]));
  const adSum = math.sum(ad, cfg.cmfLen) as number[];
  const volSum = math.sum(volume, cfg.cmfLen) as number[];
  const cmf = adSum.map((v, i) => v / volSum[i]);

  const tfoRaw = cmf.map((c, i) => c + mfi[i]);
  const tfo = cfg.smoothLen > 1 ? taCore.sma(tfoRaw, cfg.smoothLen) : tfoRaw;

  let signal: number[];
  if (cfg.signalType === 'WMA') {
    signal = taCore.wma(tfo, cfg.signalLen);
  } else if (cfg.signalType === 'HMA') {
    // ta.hma(x, 1) is a Pine runtime error (wma of length 0)
    if (Math.floor(cfg.signalLen / 2) < 1) {
      throw new Error("Error on bar 0: Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
    }
    signal = taCore.hma(tfo, cfg.signalLen);
  } else {
    signal = taCore.ema(tfo, cfg.signalLen);
  }
  const hist = tfo.map((v, i) => v - signal[i]);

  // dirmov(diLen): up = ta.change(high), down = -ta.change(low)
  const up = taCore.change(high, 1);
  const down = taCore.change(low, 1).map((v) => -v);
  const plusDM = up.map((u, i) => (isNaN(u) ? NaN : gt(u, down[i]) && gt(u, 0) ? u : 0));
  const minusDM = down.map((d, i) => (isNaN(d) ? NaN : gt(d, up[i]) && gt(d, 0) ? d : 0));
  const trRma = taCore.rma(taCore.tr(false, high, low, close), cfg.diLen);
  const plusRma = taCore.rma(plusDM, cfg.diLen);
  const minusRma = taCore.rma(minusDM, cfg.diLen);
  // fixnan keeps +-infinity (x / 0); only na is replaced
  const plus = fixnan(plusRma.map((v, i) => (100 * v) / trRma[i]));
  const minus = fixnan(minusRma.map((v, i) => (100 * v) / trRma[i]));
  // adx_calc: 100 * ta.rma(math.abs(p - m) / (sumDM == 0 ? 1 : sumDM), adxS)
  const dx = plus.map((p, i) => {
    const sumDM = p + minus[i];
    return Math.abs(p - minus[i]) / (eq(sumDM, 0) ? 1 : sumDM);
  });
  const adxRaw = taCore.rma(dx, cfg.adxLen).map((v) => 100 * v);
  const adxClipped = adxRaw.map((v) => Math.max(-1.5, Math.min(1.5, (v - 25) / 25)));

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const green = String(color.new(color.green, 0));
  const red = String(color.new(color.red, 0));
  const tfoColor = String(color.new(color.white, 80));
  const extremeColor = String(color.new(color.gray, 95));
  const plots: Record<string, { time: number; value: number; color?: string }[]> = { plot0: [], plot1: [], plot2: [], plot3: [] };
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    plots.plot0.push({ time: t, value: fin(hist[i]), color: ge(hist[i], 0) ? green : red });
    plots.plot1.push({ time: t, value: fin(signal[i]), color: '#5b9cf6' });
    plots.plot2.push({ time: t, value: fin(tfo[i]), color: tfoColor });
    plots.plot3.push({ time: t, value: fin(adxClipped[i]), color: '#fdd835' });
    // bgcolor(math.abs(tfo) > 1.0 ? color.new(color.gray, 95) : na, title = "Extreme Zones")
    if (gt(Math.abs(tfo[i]), 1.0)) bgColors.push({ time: t, color: extremeColor });
  }

  // bullCross = ta.crossover(hist, 0), bearCross = ta.crossunder(hist, 0)
  // extremeHigh = ta.crossunder(tfo, 1.0) and tfo > 1.0, extremeLow = ta.crossover(tfo, -1.0) and tfo < -1.0
  const lt = (a: number, b: number) => b - a > EPS;
  const xHigh = crossedUnder(tfo, 1.0);
  const xLow = crossedOver(tfo, -1.0);
  const flags = [
    crossedOver(hist, 0),
    crossedUnder(hist, 0),
    tfo.map((v, i) => xHigh[i] && gt(v, 1.0)),
    tfo.map((v, i) => xLow[i] && lt(v, -1.0)),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    alerts: alertStates(alertConditions, bars, flags),
    hlines: hlineConfig.map((h) => ({ value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle } })),
    bgColors,
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Hist Cross', message: 'TFO Hist Bullish Cross!' },
  { id: 'alert1', title: 'Bearish Hist Cross', message: 'TFO Hist Bearish Cross!' },
  { id: 'alert2', title: 'Extreme High Alert', message: 'TFO Extreme High - Potential Reversal!' },
  { id: 'alert3', title: 'Extreme Low Alert', message: 'TFO Extreme Low - Potential Reversal!' },
];

export const TfoAdxWithHistogramSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
