/**
 * 1m Trend Continuation Signals - SSL + BB Filter
 *
 * Trend EMA of the close, an SSL channel (SMA of the high and SMA of the low; the state flips to up when the close is
 * above the high SMA and to down when it is below the low SMA) and Bollinger Bands (SMA +- stdev * multiplier).
 * Buy: close above the trend EMA, SSL up line crossing over the SSL down line and close above the upper band.
 * Sell: close below the trend EMA, SSL up line crossing under the SSL down line and close below the lower band.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal' and 'Sell Signal', true on the bars of each signal.
 *
 * Reference: "1m Trend Continuation Signals - SSL + BB Filter" by rhariganesh
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TrendContinuationSslBbInputs {
  /** Trend EMA length */
  emaLength: number;
  /** SSL channel length */
  sslLength: number;
  /** Bollinger Band length */
  bbLength: number;
  /** Bollinger Band standard deviation multiplier */
  bbStdDev: number;
}

export const defaultInputs: TrendContinuationSslBbInputs = {
  emaLength: 200,
  sslLength: 10,
  bbLength: 150,
  bbStdDev: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLength', type: 'int', title: 'Trend EMA Length', defval: 200 },
  { id: 'sslLength', type: 'int', title: 'SSL Channel Length', defval: 10 },
  { id: 'bbLength', type: 'int', title: 'BB Length', defval: 150, min: 1 },
  { id: 'bbStdDev', type: 'float', title: 'BB Std Dev', defval: 2.0, step: 0.1 },
];

const EMA_COL = String(color.new('#5b9cf6', 0));
const UP_COL = String(color.new('#089981', 0));
const DOWN_COL = String(color.new('#f23645', 0));
const SSL_FILL_UP = String(color.new('#089981', 85));
const SSL_FILL_DOWN = String(color.new('#f23645', 85));
const BB_FILL = String(color.new(color.gray, 92));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trend EMA', color: EMA_COL, lineWidth: 2 },
  { id: 'plot1', title: 'SSL Up', color: UP_COL, lineWidth: 1 },
  { id: 'plot2', title: 'SSL Down', color: DOWN_COL, lineWidth: 1 },
  { id: 'plot3', title: 'BB Basis', color: color.orange, lineWidth: 2 },
  { id: 'plot4', title: 'BB Upper', color: color.green, lineWidth: 1 },
  { id: 'plot5', title: 'BB Lower', color: color.red, lineWidth: 1 },
];

export const metadata = {
  title: '1m Trend Continuation Signals - SSL + BB Filter',
  shortTitle: '1m Trend Continuation Signals - SSL + BB Filter',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendContinuationSslBbInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);

  const trendEma = A(ta.ema(S(close), cfg.emaLength));
  const smaHigh = A(ta.sma(S(bars.map((b) => b.high)), cfg.sslLength));
  const smaLow = A(ta.sma(S(bars.map((b) => b.low)), cfg.sslLength));
  const bbBasis = A(ta.sma(S(close), cfg.bbLength));
  const bbStd = A(ta.stdev(S(close), cfg.bbLength));

  const hlvArr: number[] = new Array(n);
  const sslUp: number[] = new Array(n);
  const sslDown: number[] = new Array(n);
  const bbUpper: number[] = new Array(n);
  const bbLower: number[] = new Array(n);
  // var int hlv = 0; hlv := close > smaHigh ? 1 : close < smaLow ? -1 : hlv[1] (hlv[1] is na on bar 0)
  let hlv = NaN;
  for (let i = 0; i < n; i++) {
    const c = close[i];
    hlv = gt(c, smaHigh[i]) ? 1 : lt(c, smaLow[i]) ? -1 : i > 0 ? hlv : NaN;
    hlvArr[i] = hlv;
    sslUp[i] = lt(hlv, 0) ? smaLow[i] : smaHigh[i];
    sslDown[i] = lt(hlv, 0) ? smaHigh[i] : smaLow[i];
    const dev = bbStd[i] * cfg.bbStdDev;
    bbUpper[i] = bbBasis[i] + dev;
    bbLower[i] = bbBasis[i] - dev;
  }

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  for (let i = 1; i < n; i++) {
    const c = close[i];
    // ta.crossover / ta.crossunder compare exactly (na compares false)
    const sslBullish = sslUp[i] > sslDown[i] && sslUp[i - 1] <= sslDown[i - 1];
    const sslBearish = sslUp[i] < sslDown[i] && sslUp[i - 1] >= sslDown[i - 1];
    const buySignal = gt(c, trendEma[i]) && sslBullish && gt(c, bbUpper[i]);
    const sellSignal = lt(c, trendEma[i]) && sslBearish && lt(c, bbLower[i]);
    buyFlags[i] = buySignal;
    sellFlags[i] = sellSignal;
    if (buySignal) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'labelUp', color: '#089981', text: 'BUY',
        textColor: color.white, size: 'small' });
    }
    if (sellSignal) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'labelDown', color: '#f23645', text: 'SELL',
        textColor: color.white, size: 'small' });
    }
  }

  const t = (i: number) => bars[i].time;
  const line = (v: number[], col: string) => bars.map((_b, i) => ({ time: t(i), value: v[i], color: col }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(trendEma, EMA_COL),
      plot1: line(sslUp, UP_COL),
      plot2: line(sslDown, DOWN_COL),
      plot3: line(bbBasis, color.orange),
      plot4: line(bbUpper, color.green),
      plot5: line(bbLower, color.red),
    },
    fills: [
      // fill(p_up, p_down, color = hlv == 1 ? color.new(#089981, 85) : color.new(#f23645, 85), title = "SSL Fill")
      { plot1: 'plot1', plot2: 'plot2', options: { title: 'SSL Fill' },
        colors: hlvArr.map((h) => (h === 1 ? SSL_FILL_UP : SSL_FILL_DOWN)) },
      { plot1: 'plot4', plot2: 'plot5', options: { title: 'BB Fill', color: BB_FILL } },
    ],
    markers,
    // alertcondition(buySignal, "Buy Signal", ...) / alertcondition(sellSignal, "Sell Signal", ...)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'SSL Bullish Signal + Close Above Upper Bollinger Band' },
  { id: 'alert1', title: 'Sell Signal', message: 'SSL Bearish Signal + Close Below Lower Bollinger Band' },
];

export const TrendContinuationSslBb = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
