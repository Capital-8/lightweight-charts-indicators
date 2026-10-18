/**
 * VPSA-VTD (Volume Price Spread Analysis with a Volume Trend Detector)
 *
 * The spread (high - low) and the volume are normalised to 0..1 between their lowest and highest values of the
 * last `VPSA period` bars (0 when the range is 0 or not yet known). Their z-scores (value - EMA) / stdev colour the
 * normalised volume columns and the normalised spread candles (drawn from 0 to the value): blue below 1, green from
 * 1 to 2, red above 2, fuchsia above 3. The Volume Trend Detector compares the SMA of the volume with the same SMA
 * `period - 1` bars before ('SMA' mode, the SMA is drawn scaled by its highest value so far), or checks that the
 * volume rose / fell on each of the last `period` steps ('Step By Step' mode); all bars of the period can be
 * required to be bullish or bearish. A label at the top of the pane marks the bars of the chosen trend.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar): with the combined alert off, 'Conditions met:
 * Spread & Volume.' when the four spread / volume conditions (normalised value and z-score against their thresholds)
 * hold and 'Condition met: Volume Trend Detector' on a trend bar; with it on, 'Conditions met: Spread, Volume & Volume
 * Trend Detector.' when the normalised spread condition holds on a trend bar.
 *
 * Reference: "VPSA-VTD" by CatTheTrader
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © CatTheTrader
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, MarkerData, PlotCandleData } from '../types';

/** The original makes alert() calls */
export const hasAlertFunction = true;

const CONDITIONS = ['greater than or equal to', 'less than or equal to'];

export interface VpsaVtdInputs {
  /** Period of the normalisation and of the z-scores */
  nvsaPeriod: number;
  /** Period of the Volume Trend Detector */
  voldecPeriod: number;
  /** Alert thresholds and conditions (alert() calls only: no drawn output) */
  alertSpreadNormalized: number;
  alertVolumeNormalized: number;
  alertSpreadSigma: number;
  alertVolumeSigma: number;
  spreadCondition: string;
  volumeCondition: string;
  spreadSigmaCondition: string;
  volumeSigmaCondition: string;
  /** 'SMA' or 'Step By Step' */
  trendType: string;
  /** 'Upward' or 'Downward' */
  trendDirection: string;
  /** 'Any', 'Bullish only' or 'Bearish only' */
  barType: string;
  enableCombinedAlert: boolean;
}

export const defaultInputs: VpsaVtdInputs = {
  nvsaPeriod: 14,
  voldecPeriod: 14,
  alertSpreadNormalized: 0.2,
  alertVolumeNormalized: 0.2,
  alertSpreadSigma: 1,
  alertVolumeSigma: 1,
  spreadCondition: 'greater than or equal to',
  volumeCondition: 'greater than or equal to',
  spreadSigmaCondition: 'greater than or equal to',
  volumeSigmaCondition: 'greater than or equal to',
  trendType: 'SMA',
  trendDirection: 'Upward',
  barType: 'Any',
  enableCombinedAlert: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'nvsaPeriod', type: 'int', title: 'VPSA period for analysis', defval: 14, min: 1, group: 'VPSA Analysis' },
  { id: 'voldecPeriod', type: 'int', title: 'Volume Trend Detector period for analysis', defval: 14, min: 2, group: 'Volume Trend Detector' },
  { id: 'alertSpreadNormalized', type: 'float', title: 'Normalized Spread alert threshold', defval: 0.2, min: 0.01, max: 1, group: 'VPSA Analysis' },
  { id: 'alertVolumeNormalized', type: 'float', title: 'Normalized Volume alert threshold', defval: 0.2, min: 0.01, max: 1, group: 'VPSA Analysis' },
  { id: 'alertSpreadSigma', type: 'float', title: 'Spread Z-SCORE alert threshold', defval: 1, min: 0, group: 'VPSA Analysis' },
  { id: 'alertVolumeSigma', type: 'float', title: 'Volume Z-SCORE alert threshold', defval: 1, min: 0, group: 'VPSA Analysis' },
  { id: 'spreadCondition', type: 'string', title: 'Spread condition', defval: CONDITIONS[0], options: CONDITIONS, group: 'VPSA Analysis' },
  { id: 'volumeCondition', type: 'string', title: 'Volume condition', defval: CONDITIONS[0], options: CONDITIONS, group: 'VPSA Analysis' },
  { id: 'spreadSigmaCondition', type: 'string', title: 'Spread Z-SCORE condition', defval: CONDITIONS[0], options: CONDITIONS, group: 'VPSA Analysis' },
  { id: 'volumeSigmaCondition', type: 'string', title: 'Volume Z-SCORE condition', defval: CONDITIONS[0], options: CONDITIONS, group: 'VPSA Analysis' },
  { id: 'trendType', type: 'string', title: 'Method of trend determination', defval: 'SMA', options: ['SMA', 'Step By Step'], group: 'Volume Trend Detector' },
  { id: 'trendDirection', type: 'string', title: 'Trend direction', defval: 'Upward', options: ['Upward', 'Downward'], group: 'Volume Trend Detector' },
  { id: 'barType', type: 'string', title: 'Candle type', defval: 'Any', options: ['Any', 'Bullish only', 'Bearish only'], group: 'Volume Trend Detector' },
  { id: 'enableCombinedAlert', type: 'bool', title: 'Enable combined alert for VPSA and Volume Trend Detector', defval: true, group: 'Alerts' },
];

const SMA_COL = String(color.new(color.red, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume SMA', color: SMA_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Normalized Volume', color: color.blue, lineWidth: 1, style: 'columns' },
];

export const metadata = {
  title: 'VPSA-VTD',
  shortTitle: 'VPSA-VTD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** Pine plotshape default text colour */
const PINE_TEXT = '#2962FF';
/** plotcandle without wickcolor / bordercolor: the style defaults of the plot (no colorer) */
const CANDLE_WICK = '#737375';
const CANDLE_BORDER = '#000000';

export function calculate(
  bars: Bar[],
  inputs: Partial<VpsaVtdInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; plotCandles: Record<string, PlotCandleData[]>; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const len = cfg.nvsaPeriod;
  const vlen = cfg.voldecPeriod;

  const spread = bars.map((b) => b.high - b.low);
  const volume = bars.map((b) => b.volume ?? NaN);

  // f_zscore_ema(src, length) = (src - ta.ema(src, length)) / ta.stdev(src, length); plain division
  const zscore = (src: number[]) => {
    const mean = A(ta.ema(S(src), len));
    const sd = A(ta.stdev(S(src), len));
    return src.map((v, i) => (v - mean[i]) / sd[i]);
  };
  const spreadZ = zscore(spread);
  const volumeZ = zscore(volume);

  // f_normalize: diff != 0.0 ? (src - min) / diff : 0.0 (0.0 while diff is na)
  const normalize = (src: number[]) => {
    const lo = A(ta.lowest(S(src), len));
    const hi = A(ta.highest(S(src), len));
    return src.map((v, i) => {
      const diff = hi[i] - lo[i];
      return ne(diff, 0) ? (v - lo[i]) / diff : 0.0;
    });
  };
  const spreadNorm = normalize(spread);
  const volumeNorm = normalize(volume);

  // f_checkAllBarsType(length, bar_type): false while bar_index < length, else every bar of the last length bars
  // is of the type
  const isBarType = (j: number) => {
    if (cfg.barType === 'Bullish only') return gt(bars[j].close, bars[j].open);
    if (cfg.barType === 'Bearish only') return lt(bars[j].close, bars[j].open);
    return cfg.barType === 'Any';
  };
  const checkAllBarsType = (i: number, length: number) => {
    if (i < length) return false;
    for (let k = 0; k <= length - 1; k++) if (!isBarType(i - k)) return false;
    return true;
  };

  // SMA of the volume, scaled by its highest value so far
  const smaVolume = A(ta.sma(S(volume), vlen));
  const smaScaled: number[] = new Array(n);
  let smaMaxGlobal = 0.0; // var float sma_max_global = 0.0
  for (let i = 0; i < n; i++) {
    smaMaxGlobal = Math.max(smaMaxGlobal, isNaN(smaVolume[i]) ? 0.0 : smaVolume[i]);
    smaScaled[i] = gt(smaMaxGlobal, 0) ? smaVolume[i] / smaMaxGlobal : 0.0;
  }

  const allType: boolean[] = bars.map((_b, i) => checkAllBarsType(i, vlen));
  const conditionVtd: boolean[] = new Array(n).fill(false);
  if (cfg.trendType === 'SMA') {
    for (let i = 0; i < n; i++) {
      const smaFirst = i - (vlen - 1) >= 0 ? smaVolume[i - (vlen - 1)] : NaN;
      conditionVtd[i] = cfg.trendDirection === 'Upward'
        ? gt(smaVolume[i], smaFirst) && allType[i]
        : lt(smaVolume[i], smaFirst) && allType[i];
    }
  } else {
    // f_checkStepTrend: ta.rising / ta.falling(volume, length) run only on the bars where all bars are of the type,
    // so their history holds the volumes of those bars only (na on the other bars: not called)
    const called = volume.map((v, i) => (allType[i] ? v : NaN));
    const step = A(cfg.trendDirection === 'Upward' ? ta.rising(S(called), vlen) : ta.falling(S(called), vlen));
    for (let i = 0; i < n; i++) conditionVtd[i] = allType[i] && step[i] === 1;
  }

  const zColor = (z: number) => (gt(z, 3) ? color.fuchsia : gt(z, 2) ? color.red : lt(z, 1) ? color.blue : color.green);
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

  const plot0 = bars.map((b, i) => ({ time: b.time, value: cfg.trendType === 'SMA' ? fin(smaScaled[i]) : NaN, color: SMA_COL }));
  const plot1 = bars.map((b, i) => ({ time: b.time, value: fin(volumeNorm[i]), color: zColor(volumeZ[i]) }));

  // plotcandle(0, 0, 0, spread_normalized, 'Normalized Spread', color = spread_color)
  const candles: PlotCandleData[] = [];
  for (let i = 0; i < n; i++) {
    const c = spreadNorm[i];
    if (!Number.isFinite(c)) continue;
    candles.push({ time: bars[i].time, open: 0, high: 0, low: 0, close: c, color: zColor(spreadZ[i]),
      wickColor: CANDLE_WICK, borderColor: CANDLE_BORDER });
  }

  const markers: MarkerData[] = [];
  const step = cfg.trendType === 'Step By Step';
  const up = cfg.trendDirection === 'Upward';
  for (let i = 0; i < n; i++) {
    if (!conditionVtd[i]) continue;
    const time = bars[i].time;
    if (step && up) markers.push({ id: 'shape0', time, position: 'top', shape: 'labelUp', color: color.green, text: 'Step Up', textColor: PINE_TEXT, size: 'auto' });
    if (step && !up) markers.push({ id: 'shape1', time, position: 'top', shape: 'labelDown', color: color.red, text: 'Step Down', textColor: PINE_TEXT, size: 'auto' });
    if (!step && up) markers.push({ id: 'shape2', time, position: 'top', shape: 'labelUp', color: color.lime, text: 'SMA Up', textColor: PINE_TEXT, size: 'auto' });
    if (!step && !up) markers.push({ id: 'shape3', time, position: 'top', shape: 'labelDown', color: color.maroon, text: 'SMA Down', textColor: PINE_TEXT, size: 'auto' });
  }

  // Alert conditions: value >= threshold or value <= threshold, as the condition input says
  const check = (cond: string, v: number, thr: number) =>
    (cond === 'greater than or equal to' && ge(v, thr)) || (cond === 'less than or equal to' && le(v, thr));
  const alertCalls: AlertCall[] = [];
  const call = (time: number, message: string) => alertCalls.push({ time, message, freq: 'once_per_bar' });
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const spreadAlert = check(cfg.spreadCondition, spreadNorm[i], cfg.alertSpreadNormalized);
    const spreadSigmaAlert = check(cfg.spreadSigmaCondition, spreadZ[i], cfg.alertSpreadSigma);
    const volumeAlert = check(cfg.volumeCondition, volumeNorm[i], cfg.alertVolumeNormalized);
    const volumeSigmaAlert = check(cfg.volumeSigmaCondition, volumeZ[i], cfg.alertVolumeSigma);
    if (!cfg.enableCombinedAlert && spreadAlert && spreadSigmaAlert && volumeAlert && volumeSigmaAlert) {
      call(time, 'Conditions met: Spread & Volume.');
    }
    if (!cfg.enableCombinedAlert && conditionVtd[i]) call(time, 'Condition met: Volume Trend Detector');
    // combined_alert_condition = spread_alert_condition and condition_vtd
    if (cfg.enableCombinedAlert && spreadAlert && conditionVtd[i]) {
      call(time, 'Conditions met: Spread, Volume & Volume Trend Detector.');
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
    plotCandles: { normalizedSpread: candles },
    alertCalls,
  };
}

export const VpsaVtd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
