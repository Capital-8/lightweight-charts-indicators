/**
 * Moneyball EMA-MACD indicator
 *
 * MACD = fast MA - slow MA of the source (SMA, EMA, DEMA or TEMA; default EMA 9 / 50), signal = MA of the MACD
 * (SMA, EMA, DEMA or TEMA; default SMA 16). The price bars are coloured: fuchsia when EMA 3 > EMA 9 while the close
 * is below EMA 20 and EMA 50 and the MACD is below 0; orange when MACD < 0 and MACD > signal; green when MACD > 0 and
 * MACD > signal; red when MACD < 0 and MACD < signal (optional); white when MACD < signal. Zero line at 0.
 *
 * Alerts (alertcondition, `alerts` of the result): MACD / signal crossing the zero line, MACD new high above zero /
 * new low below zero, and one per bar colour condition (orange, green, white, red, fuchsia), as the original.
 *
 * Reference: "Moneyball EMA-MACD indicator [VinnieTheFish]" by VinnieTheFish
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type MaType = 'SMA' | 'EMA' | 'DEMA' | 'TEMA';

export interface MoneyballEmaMacdInputs {
  fastLength: number;
  slowLength: number;
  src: SourceType;
  /** Signal smoothing length */
  signalLength: number;
  /** MA type of the fast and slow lines */
  smaSource: MaType;
  /** MA type of the signal line */
  smaSignal: MaType;
  barGreenColor: string;
  barOrangeColor: string;
  barWhiteColor: string;
  barFuchsiaColor: string;
  barRedColor: string;
  /** Show red bars (MACD < signal when MACD < 0) */
  showRedColor: boolean;
}

export const defaultInputs: MoneyballEmaMacdInputs = {
  fastLength: 9,
  slowLength: 50,
  src: 'close',
  signalLength: 16,
  smaSource: 'EMA',
  smaSignal: 'SMA',
  barGreenColor: color.green,
  barOrangeColor: color.orange,
  barWhiteColor: color.white,
  barFuchsiaColor: color.fuchsia,
  barRedColor: color.red,
  showRedColor: true,
};

const MA_TYPES = ['SMA', 'EMA', 'DEMA', 'TEMA'];

export const inputConfig: InputConfig[] = [
  { id: 'fastLength', type: 'int', title: 'Fast Length', defval: 9 },
  { id: 'slowLength', type: 'int', title: 'Slow Length', defval: 50 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'signalLength', type: 'int', title: 'Signal Smoothing', defval: 16, min: 1, max: 50 },
  { id: 'smaSource', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: MA_TYPES },
  { id: 'smaSignal', type: 'string', title: 'Signal Line MA Type', defval: 'SMA', options: MA_TYPES },
  { id: 'barGreenColor', type: 'color', title: 'Green', defval: color.green },
  { id: 'barOrangeColor', type: 'color', title: 'Orange', defval: color.orange },
  { id: 'barWhiteColor', type: 'color', title: 'White', defval: color.white },
  { id: 'barFuchsiaColor', type: 'color', title: 'Fuchsia', defval: color.fuchsia },
  { id: 'barRedColor', type: 'color', title: 'Red', defval: color.red },
  { id: 'showRedColor', type: 'bool', title: 'Show Red Bars MACD < Signal when MACD < 0', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'MACD', color: color.red, lineWidth: 1 },
  { id: 'plot1', title: 'Signal', color: color.yellow, lineWidth: 1 },
];

export const metadata = {
  title: 'Moneyball EMA-MACD indicator [VinnieTheFish]',
  shortTitle: 'Moneyball EMA-MACD',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<MoneyballEmaMacdInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const ema = (x: number[], len: number) => A(ta.ema(S(x), len));
  // dema = 2 * ema1 - ema(ema1); tema = 3 * ema1 - 3 * ema2 + ema(ema2)
  const ma = (type: MaType, x: number[], len: number): number[] => {
    if (type === 'SMA') return A(ta.sma(S(x), len));
    const e1 = ema(x, len);
    if (type === 'EMA') return e1;
    const e2 = ema(e1, len);
    if (type === 'DEMA') return e1.map((v, i) => 2 * v - e2[i]);
    const e3 = ema(e2, len);
    return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
  };

  const src = A(getSourceSeries(bars, cfg.src));
  const fastMa = ma(cfg.smaSource, src, cfg.fastLength);
  const slowMa = ma(cfg.smaSource, src, cfg.slowLength);
  const macd = fastMa.map((v, i) => v - slowMa[i]);
  const signal = ma(cfg.smaSignal, macd, cfg.signalLength);

  const close = bars.map((b) => b.close);
  const ema3 = ema(src, 3);
  const ema9 = ema(src, 9);
  const ema20 = ema(src, 20);
  const ema50 = ema(src, 50);

  const barColors: BarColorData[] = [];
  const flags: boolean[][] = Array.from({ length: 11 }, () => new Array<boolean>(n).fill(false));
  const macdXUp = crossedOver(macd, 0);
  const macdXDown = crossedUnder(macd, 0);
  const sigXUp = crossedOver(signal, 0);
  const sigXDown = crossedUnder(signal, 0);
  for (let i = 0; i < n; i++) {
    const aboveZero = gt(macd[i], 0);
    const belowZero = lt(macd[i], 0);
    const macdAboveSignal = gt(macd[i], signal[i]);
    const macdBelowSignal = lt(macd[i], signal[i]);
    const green = aboveZero && macdAboveSignal;
    const white = macdBelowSignal;
    const orange = belowZero && macdAboveSignal;
    const red = belowZero && macdBelowSignal;
    const fuchsia = gt(ema3[i], ema9[i]) && lt(close[i], ema20[i]) && lt(close[i], ema50[i]) && lt(macd[i], 0);
    // switch: the first true case; no case: na (the bar keeps its colour)
    const c = fuchsia ? cfg.barFuchsiaColor
      : orange ? cfg.barOrangeColor
        : green ? cfg.barGreenColor
          : red && cfg.showRedColor ? cfg.barRedColor
            : white ? cfg.barWhiteColor
              : null;
    if (c) barColors.push({ time: bars[i].time, color: c });
    // new_high_macd = ta.change(macd) > 0 / new_low_macd = ta.change(macd) < 0
    const change = i > 0 ? macd[i] - macd[i - 1] : NaN;
    const newHigh = gt(change, 0);
    const newLow = lt(change, 0);
    const f = [macdXUp[i], macdXDown[i], sigXUp[i], sigXDown[i], aboveZero && macdAboveSignal && newHigh,
      belowZero && macdBelowSignal && newLow, orange, green, white, red, fuchsia];
    for (let k = 0; k < f.length; k++) flags[k][i] = f[k];
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: macd[i], color: color.red })),
      plot1: bars.map((b, i) => ({ time: b.time, value: signal[i], color: color.yellow })),
    },
    // hline(0, 'Zero Line', color = color.white): default style dashed, width 1
    hlines: [{ value: 0, options: { title: 'Zero Line', color: color.white, linestyle: 'dashed', linewidth: 1 } }],
    barColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MACD Crossed Above Zero', message: 'MACD has crossed above the zero line' },
  { id: 'alert1', title: 'MACD Crossed Below Zero', message: 'MACD has crossed below the zero line' },
  { id: 'alert2', title: 'Signal Line Crossed Above Zero', message: 'Signal line has crossed above the zero line' },
  { id: 'alert3', title: 'Signal Line Crossed Below Zero', message: 'Signal line has crossed below the zero line' },
  { id: 'alert4', title: 'MACD New High Above Zero Line', message: 'MACD has made a new high above the zero line' },
  { id: 'alert5', title: 'MACD New Low Below Zero Line', message: 'MACD has made a new low below the zero line' },
  { id: 'alert6', title: 'MACD Orange bar', message: 'MACD Orange bar condition' },
  { id: 'alert7', title: 'MACD Green bar', message: 'MACD Green bar condition' },
  { id: 'alert8', title: 'MACD White bar', message: 'MACD White bar condition' },
  { id: 'alert9', title: 'MACD Red bar', message: 'MACD Red bar condition' },
  { id: 'alert10', title: 'MACD Fuchsia bar', message: 'MACD Fuchsia bar condition' },
];

export const MoneyballEmaMacd = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
