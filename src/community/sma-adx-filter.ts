/**
 * MA+ADX+LongPeriodFilter [yusufk]
 *
 * A main moving average (SMA or EMA of the close), green when the close is above it and red otherwise, and a long
 * period moving average (SMA or EMA) as a trend filter. A buy label marks a close crossing above the main MA, a sell
 * label a close crossing below it; with the long filter on, a buy needs the close above the long MA and a sell the
 * close below it. The optional ADX filter (Wilder smoothing: s = s[1] - s[1] / len + x, ADX = SMA of DX) keeps only
 * the signals with ADX >= the threshold.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' / 'Sell Signal' on the bars of a buy / sell label
 * that are closed (barstate.isconfirmed). The state of the last bar comes from the optional third argument (see
 * src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "MA+ADX+LongPeriodFilter[yusufk]" by iping99
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © iping99
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SmaAdxFilterInputs {
  /** Main MA type */
  maType: 'SMA' | 'EMA';
  /** Main MA length */
  maLength: number;
  /** Use the ADX filter (sideways detection) */
  useAdxFilter: boolean;
  /** ADX length */
  adxLen: number;
  /** Minimum ADX of a signal */
  adxThreshold: number;
  /** Use the long period MA filter */
  useLongFilter: boolean;
  /** Long period MA type */
  longMaType: 'SMA' | 'EMA';
  /** Long period MA length */
  longMaLength: number;
}

export const defaultInputs: SmaAdxFilterInputs = {
  maType: 'SMA',
  maLength: 25,
  useAdxFilter: false,
  adxLen: 14,
  adxThreshold: 22.0,
  useLongFilter: true,
  longMaType: 'EMA',
  longMaLength: 100,
};

export const inputConfig: InputConfig[] = [
  { id: 'maType', type: 'string', title: 'Tipe MA Utama', defval: 'SMA', options: ['SMA', 'EMA'] },
  { id: 'maLength', type: 'int', title: 'Panjang MA', defval: 25 },
  { id: 'useAdxFilter', type: 'bool', title: 'Gunakan Filter ADX (Deteksi Sideways)?', defval: false },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 14 },
  { id: 'adxThreshold', type: 'float', title: 'Batas Minimum ADX', defval: 22.0 },
  { id: 'useLongFilter', type: 'bool', title: 'Gunakan Filter Long Period?', defval: true },
  { id: 'longMaType', type: 'string', title: 'Tipe Long Period MA', defval: 'EMA', options: ['SMA', 'EMA'] },
  { id: 'longMaLength', type: 'int', title: 'Panjang Long Period', defval: 100, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Garis MA Utama', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'Long Period MA', color: color.orange, lineWidth: 2 },
];

export const metadata = {
  title: 'MA+ADX+LongPeriodFilter[yusufk]',
  shortTitle: 'MA+ADX+LongPeriodFilter[yusufk]',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const nz = (x: number) => (Number.isFinite(x) ? x : 0);

export function calculate(
  bars: Bar[],
  inputs: Partial<SmaAdxFilterInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const closeArr = bars.map((b) => b.close);
  const closeS = S(closeArr);

  // ADX (Wilder smoothing written out in the script)
  const dx: number[] = new Array(n);
  let sTr = 0.0;
  let sPlus = 0.0;
  let sMinus = 0.0;
  for (let i = 0; i < n; i++) {
    const { high, low } = bars[i];
    const pc = i > 0 ? bars[i - 1].close : NaN;
    const ph = i > 0 ? bars[i - 1].high : NaN;
    const pl = i > 0 ? bars[i - 1].low : NaN;
    const trueRange = Math.max(Math.max(high - low, Math.abs(high - nz(pc))), Math.abs(low - nz(pc)));
    const dmPlus = gt(high - nz(ph), nz(pl) - low) ? Math.max(high - nz(ph), 0) : 0;
    const dmMinus = gt(nz(pl) - low, high - nz(ph)) ? Math.max(nz(pl) - low, 0) : 0;
    // var float s = 0.0; s := nz(s[1]) - nz(s[1]) / adxLen + x
    sTr = nz(sTr) - nz(sTr) / cfg.adxLen + trueRange;
    sPlus = nz(sPlus) - nz(sPlus) / cfg.adxLen + dmPlus;
    sMinus = nz(sMinus) - nz(sMinus) / cfg.adxLen + dmMinus;
    const diPlus = (sPlus / sTr) * 100;
    const diMinus = (sMinus / sTr) * 100;
    dx[i] = (Math.abs(diPlus - diMinus) / (diPlus + diMinus)) * 100;
  }
  const adx = A(ta.sma(S(dx), cfg.adxLen));

  const ma = (type: 'SMA' | 'EMA', len: number) => A(type === 'SMA' ? ta.sma(closeS, len) : ta.ema(closeS, len));
  const maValue = ma(cfg.maType, cfg.maLength);
  const longMaValue = ma(cfg.longMaType, cfg.longMaLength);

  const markers: MarkerData[] = [];
  // ta.crossover / ta.crossunder: exact comparisons, with the last bar where both values were not na
  const buyLogic = A(ta.crossover(closeS, S(maValue)));
  const sellLogic = A(ta.crossunder(closeS, S(maValue)));
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const close = closeArr[i];
    const adxFilter = cfg.useAdxFilter ? ge(adx[i], cfg.adxThreshold) : true;
    const longBuyFilter = cfg.useLongFilter ? gt(close, longMaValue[i]) : true;
    const longSellFilter = cfg.useLongFilter ? gt(longMaValue[i], close) : true;
    const buyCondition = Boolean(buyLogic[i]) && adxFilter && longBuyFilter;
    const sellCondition = Boolean(sellLogic[i]) && adxFilter && longSellFilter;
    // buyAlertCondition = buyCondition and barstate.isconfirmed; sell alike
    buyFlags.push(buyCondition && barIsConfirmed(i));
    sellFlags.push(sellCondition && barIsConfirmed(i));
    if (buyCondition) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: color.green, text: 'B',
        textColor: color.white, size: 'small' });
    }
    if (sellCondition) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: color.red, text: 'S',
        textColor: color.white, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // maColor = close > maValue ? color.green : color.red
      plot0: bars.map((b, i) => ({ time: b.time, value: maValue[i],
        color: gt(b.close, maValue[i]) ? color.green : color.red })),
      plot1: bars.map((b, i) => ({ time: b.time, value: cfg.useLongFilter ? longMaValue[i] : NaN, color: color.orange })),
    },
    markers,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy Signal' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell Signal' },
];

export const SmaAdxFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
