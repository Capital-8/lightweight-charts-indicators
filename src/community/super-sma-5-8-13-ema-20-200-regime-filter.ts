/**
 * Super SMA 5 8 13 + EMA 20/200 Regime Filter
 *
 * SMAs 5, 8 and 13 and EMAs 20 and 200 of the close. A buy signal is a cross of SMA 5 and SMA 13 with SMA 5 above
 * SMA 13; a sell signal is a cross of SMA 5 and SMA 13 with SMA 5 below SMA 8 and SMA 13. The regime filter keeps
 * all signals, only the signals when EMA 20 > EMA 200 (bullish) or only when EMA 20 < EMA 200 (bearish).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Condition' and 'Sell Condition', true on the signal bars.
 *
 * Reference: "Super SMA 5 8 13 + EMA 20/200 Regime Filter (ALIZET)" by afdzjr69
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: Owner: ALIZET
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface SuperSma5813Ema20200RegimeFilterInputs {
  /** Regime filter */
  regimeMode: 'Both' | 'Bullish only (EMA20 > EMA200)' | 'Bearish only (EMA20 < EMA200)';
}

export const defaultInputs: SuperSma5813Ema20200RegimeFilterInputs = {
  regimeMode: 'Both',
};

export const inputConfig: InputConfig[] = [
  { id: 'regimeMode', type: 'string', title: 'Regime Filter', defval: 'Both',
    options: ['Both', 'Bullish only (EMA20 > EMA200)', 'Bearish only (EMA20 < EMA200)'] },
];

const SMA5_COL = String(color.rgb(0, 255, 8));
const SMA8_COL = '#ff7300';
const SMA13_COL = String(color.rgb(191, 0, 255));
const EMA20_COL = '#2148f3';
const EMA200_COL = '#ff0000';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'SMA 5', color: SMA5_COL, lineWidth: 2 },
  { id: 'plot1', title: 'SMA 8', color: SMA8_COL, lineWidth: 2 },
  { id: 'plot2', title: 'SMA 13', color: SMA13_COL, lineWidth: 2 },
  { id: 'plot3', title: 'EMA 20', color: EMA20_COL, lineWidth: 5 },
  { id: 'plot4', title: 'EMA 200', color: EMA200_COL, lineWidth: 5 },
];

export const metadata = {
  title: 'Super SMA 5 8 13 + EMA 20/200 Regime Filter (ALIZET)',
  shortTitle: 'Super SMA 5 8 13 + EMA 20/200 Regime Filter (ALIZET)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<SuperSma5813Ema20200RegimeFilterInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const src = Series.fromArray(bars, bars.map((b) => b.close));

  const ma5 = A(ta.sma(src, 5));
  const ma8 = A(ta.sma(src, 8));
  const ma13 = A(ta.sma(src, 13));
  const ema20 = A(ta.ema(src, 20));
  const ema200 = A(ta.ema(src, 200));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = [];
  const sellFlags: boolean[] = [];
  // ta.cross(ma5, ma13): compares exactly, with the last bar where both values were not na
  let prev5 = NaN;
  let prev13 = NaN;
  for (let i = 0; i < n; i++) {
    const a = ma5[i];
    const b = ma13[i];
    let cross = false;
    if (!isNaN(a) && !isNaN(b)) {
      cross = !isNaN(prev5) && ((a > b && prev5 <= prev13) || (a < b && prev5 >= prev13));
      prev5 = a;
      prev13 = b;
    }
    const bullRegime = gt(ema20[i], ema200[i]);
    const bearRegime = lt(ema20[i], ema200[i]);
    const regimeFilter = cfg.regimeMode === 'Bullish only (EMA20 > EMA200)' ? bullRegime
      : cfg.regimeMode === 'Bearish only (EMA20 < EMA200)' ? bearRegime : true;
    const buyCond = cross && gt(a, b) && regimeFilter;
    const sellCond = cross && lt(a, ma8[i]) && lt(a, b) && regimeFilter;
    buyFlags.push(buyCond);
    sellFlags.push(sellCond);
    // plotshape(buy_cond, "BUY SIGNAL", shape.triangleup, location.belowbar, color.lime, size = size.large,
    //   text = "BUY NOW"): default text colour
    if (buyCond) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'large',
        text: 'BUY NOW', textColor: color.blue });
    }
    if (sellCond) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'large',
        text: 'SELL NOW', textColor: color.blue });
    }
  }

  const line = (v: number[], c: string) => bars.map((bar, i) => ({ time: bar.time, value: v[i], color: c }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(ma5, SMA5_COL),
      plot1: line(ma8, SMA8_COL),
      plot2: line(ma13, SMA13_COL),
      plot3: line(ema20, EMA20_COL),
      plot4: line(ema200, EMA200_COL),
    },
    markers,
    // alertcondition(buy_cond, "Buy Condition") / alertcondition(sell_cond, "Sell Condition")
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Condition', message: 'Buy Alert!' },
  { id: 'alert1', title: 'Sell Condition', message: 'Sell Alert!' },
];

export const SuperSma5813Ema20200RegimeFilter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
