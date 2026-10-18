/**
 * CVD (Cumulative Volume Delta)
 *
 * The volume delta of a bar is its volume when the close is above the open, minus its volume when the close is below
 * the open (0 for a doji). The CVD is its cumulative sum, green when >= 0 and red otherwise, with three moving
 * averages of the CVD (SMA / EMA / WMA / VWMA / HMA, default HMA 34, WMA 89, SMA 816). The background is green when
 * the CVD is above 0, red otherwise.
 *
 * Alerts (alertcondition, `alerts` of the result): the CVD crossing above / below MA A (long / short signal) and MA B,
 * and the absolute volume delta at or above "Alert Threshold".
 *
 * Reference: "CVD (Cumulative Volume Delta)" by RUpward
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import {
  alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState,
} from '../alert-states';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'VWMA' | 'HMA';

export interface CvdRupwardInputs {
  showMovingAvg: boolean;
  maLengthA: number;
  maTypeA: MaType;
  maLengthB: number;
  maTypeB: MaType;
  maLengthC: number;
  maTypeC: MaType;
  colorPositive: string;
  colorNegative: string;
  colorA: string;
  colorB: string;
  colorC: string;
  /** Threshold of the volume delta alert (the 'Volume Delta Alert' condition only) */
  alertThreshold: number;
}

export const defaultInputs: CvdRupwardInputs = {
  showMovingAvg: true,
  maLengthA: 34,
  maTypeA: 'HMA',
  maLengthB: 89,
  maTypeB: 'WMA',
  maLengthC: 816,
  maTypeC: 'SMA',
  colorPositive: color.green,
  colorNegative: color.red,
  colorA: '#09c1ff',
  colorB: color.yellow,
  colorC: '#b667ff',
  alertThreshold: 100000,
};

const MA_TYPES: MaType[] = ['SMA', 'EMA', 'WMA', 'VWMA', 'HMA'];

export const inputConfig: InputConfig[] = [
  { id: 'showMovingAvg', type: 'bool', title: 'Show Moving Average', defval: true },
  { id: 'maLengthA', type: 'int', title: 'Moving Average Length_A', defval: 34, min: 1 },
  { id: 'maTypeA', type: 'string', title: 'Moving Average Type A', defval: 'HMA', options: MA_TYPES },
  { id: 'maLengthB', type: 'int', title: 'Moving Average Length_B', defval: 89, min: 1 },
  { id: 'maTypeB', type: 'string', title: 'Moving Average Type B', defval: 'WMA', options: MA_TYPES },
  { id: 'maLengthC', type: 'int', title: 'Moving Average Length_C', defval: 816, min: 1 },
  { id: 'maTypeC', type: 'string', title: 'Moving Average Type C', defval: 'SMA', options: MA_TYPES },
  { id: 'colorPositive', type: 'color', title: 'Positive CVD Color', defval: color.green },
  { id: 'colorNegative', type: 'color', title: 'Negative CVD Color', defval: color.red },
  { id: 'colorA', type: 'color', title: 'Line A Col', defval: '#09c1ff' },
  { id: 'colorB', type: 'color', title: 'Line B Col', defval: color.yellow },
  { id: 'colorC', type: 'color', title: 'Line C Col', defval: '#b667ff' },
  { id: 'alertThreshold', type: 'int', title: 'Alert Threshold', defval: 100000 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'CVD', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'MA A', color: '#09c1ff', lineWidth: 2 },
  { id: 'plot2', title: 'MA B', color: color.yellow, lineWidth: 1 },
  { id: 'plot3', title: 'MA C', color: '#b667ff', lineWidth: 2 },
];

export const metadata = {
  title: 'CVD (Cumulative Volume Delta)',
  shortTitle: 'CVD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<CvdRupwardInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const volume = bars.map((b) => b.volume ?? NaN);

  // volume_delta = volume * (close > open ? 1 : 0) - volume * (close < open ? 1 : 0)
  const volumeDelta = bars.map((b, i) => volume[i] * (gt(b.close, b.open) ? 1 : 0) - volume[i] * (gt(b.open, b.close) ? 1 : 0));
  const cvd = A(ta.cum(S(volumeDelta)));
  const cvdSeries = S(cvd);

  // get_ma(src, ma_type, len): only the selected ta.* call runs (ma_type is an input)
  const getMa = (type: MaType, len: number): number[] => {
    switch (type) {
      case 'SMA': return A(ta.sma(cvdSeries, len));
      case 'EMA': return A(ta.ema(cvdSeries, len));
      case 'WMA': return A(ta.wma(cvdSeries, len));
      case 'VWMA': return A(ta.vwma(cvdSeries, len, S(volume)));
      case 'HMA':
        // ta.hma(x, 1) calls ta.wma(x, 0): a Pine runtime error
        if (Math.floor(len / 2) < 1) throw new Error("Error on bar 0: Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
        return A(ta.hma(cvdSeries, len));
      default: return new Array(bars.length).fill(NaN);
    }
  };
  const maA = getMa(cfg.maTypeA, cfg.maLengthA);
  const maB = getMa(cfg.maTypeB, cfg.maLengthB);
  const maC = getMa(cfg.maTypeC, cfg.maLengthC);

  const bgPositive = String(color.new(cfg.colorPositive, 90));
  const bgNegative = String(color.new(cfg.colorNegative, 90));
  const line = (v: number[], c: string) => bars.map((bar, i) => ({
    time: bar.time, value: cfg.showMovingAvg ? v[i] : NaN, color: c,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(cvd, color = cvd >= 0 ? input_color_positive : input_color_negative, linewidth = 2)
      plot0: bars.map((bar, i) => ({
        time: bar.time, value: cvd[i], color: ge(cvd[i], 0) ? cfg.colorPositive : cfg.colorNegative,
      })),
      plot1: line(maA, cfg.colorA),
      plot2: line(maB, cfg.colorB),
      plot3: line(maC, cfg.colorC),
    },
    // bgcolor(cvd > 0 ? color.new(input_color_positive, 90) : color.new(input_color_negative, 90))
    bgColors: bars.map((bar, i) => ({ time: bar.time, color: gt(cvd[i], 0) ? bgPositive : bgNegative })),
    // long_signal / short_signal = ta.crossover / ta.crossunder(cvd, ma_A); ma_cross_up / ma_cross_down with ma_B;
    // math.abs(volume_delta) >= input_alert_threshold
    alerts: alertStates(alertConditions, bars, [
      crossedOver(cvd, maA), crossedUnder(cvd, maA), crossedOver(cvd, maB), crossedUnder(cvd, maB),
      volumeDelta.map((d) => ge(Math.abs(d), cfg.alertThreshold)),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'CVD Long Signal Alert', message: 'CVD Long Signal' },
  { id: 'alert1', title: 'CVD Short Signal Alert', message: 'CVD Short Signal' },
  { id: 'alert2', title: 'CVD Cross Up MA B Alert', message: 'MA Cross Up MA' },
  { id: 'alert3', title: 'CVD Cross Down MA B Alert', message: 'CVD Cross Down MA' },
  { id: 'alert4', title: 'Volume Delta Alert', message: 'Volume Delta exceeds threshold!' },
];

export const CvdRupward = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
