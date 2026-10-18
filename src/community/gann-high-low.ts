/**
 * Gann High Low
 *
 * SMA-based trend direction indicator. Uses SMA of highs and SMA of lows
 * to determine trend direction, then plots the appropriate SMA level.
 * Alerts (alertcondition, `alerts` of the result): the close crossing the HiLo line (either way, over, under), on the
 * original's HiLo series.
 *
 * Reference: "Gann High Low" by KivancOzbilgic
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface GannHighLowInputs {
  highLength: number;
  lowLength: number;
}

export const defaultInputs: GannHighLowInputs = {
  highLength: 13,
  lowLength: 21,
};

export const inputConfig: InputConfig[] = [
  { id: 'highLength', type: 'int', title: 'High Length', defval: 13, min: 1 },
  { id: 'lowLength', type: 'int', title: 'Low Length', defval: 21, min: 1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'GannHL', color: '#2962FF', lineWidth: 2 },
];

export const metadata = {
  title: 'Gann High Low',
  shortTitle: 'GannHL',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<GannHighLowInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const { highLength, lowLength } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const highSeries = new Series(bars, (b) => b.high);
  const lowSeries = new Series(bars, (b) => b.low);

  const smaHighArr = ta.sma(highSeries, highLength).toArray();
  const smaLowArr = ta.sma(lowSeries, lowLength).toArray();

  const warmup = Math.max(highLength, lowLength);

  // Direction: true = up, false = down
  const direction: boolean[] = new Array(n);
  const gannHL: number[] = new Array(n);

  for (let i = 0; i < n; i++) {
    if (i < warmup) {
      direction[i] = true;
      gannHL[i] = NaN;
      continue;
    }

    const prevSmaHigh = i > 0 ? (smaHighArr[i - 1] ?? 0) : 0;
    const prevSmaLow = i > 0 ? (smaLowArr[i - 1] ?? 0) : 0;
    const close = bars[i].close;
    const prevDir = i > 0 ? direction[i - 1] : true;

    if (close > prevSmaHigh) {
      direction[i] = true;
    } else if (close < prevSmaLow) {
      direction[i] = false;
    } else {
      direction[i] = prevDir;
    }

    gannHL[i] = direction[i] ? (smaLowArr[i] ?? NaN) : (smaHighArr[i] ?? NaN);
  }

  const plot = gannHL.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const color = direction[i] ? '#26A69A' : '#EF5350';
    return { time: bars[i].time, value: v, color };
  });

  // Alerts on the original's HiLo: HLd = close > nz(sma(high))[1] ? 1 : close < nz(sma(low))[1] ? -1 : 0,
  // HLv = ta.valuewhen(HLd != 0, HLd, 0), HiLo = HLv == -1 ? sma(high) : sma(low)
  const close = bars.map((b) => b.close);
  const nz = (v: number | null | undefined) => (v == null || isNaN(v) ? 0 : v);
  const hiLo: number[] = new Array(n);
  let hlv = NaN;
  for (let i = 0; i < n; i++) {
    const pH = i > 0 ? nz(smaHighArr[i - 1]) : NaN;
    const pL = i > 0 ? nz(smaLowArr[i - 1]) : NaN;
    const hld = gt(close[i], pH) ? 1 : lt(close[i], pL) ? -1 : 0;
    if (hld !== 0) hlv = hld;
    hiLo[i] = (hlv === -1 ? smaHighArr[i] : smaLowArr[i]) ?? NaN;
  }
  const up = crossedOver(close, hiLo);
  const down = crossedUnder(close, hiLo);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot },
    // alertcondition(ta.cross(close, HiLo)) / ta.crossover(close, HiLo) / ta.crossunder(close, HiLo)
    alerts: alertStates(alertConditions, bars, [up.map((f, i) => f || down[i]), up, down]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Price Cross Alert', message: 'Price - HiLo Crossing!' },
  { id: 'alert1', title: 'PRICE CrossOver Alarm', message: 'LAST PRICE is ABOVE HiLo' },
  { id: 'alert2', title: 'PRICE CrossUnder Alarm', message: 'LAST PRICE is BELOW HiLo!' },
];

export const GannHighLow = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
