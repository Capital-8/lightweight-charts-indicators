/**
 * Inside Bar (Body-based)
 *
 * An inside bar here compares candle bodies: the body high (max of open and close) is below the previous body high
 * and the body low (min of open and close) is above the previous body low. A green inside bar (close >= open) is
 * coloured green with a green triangle above the bar; a red inside bar is coloured red with a red triangle below the
 * bar. An orange circle above the bar marks two bars in a row (the current and the previous bar) inside the body of
 * the bar two bars back (the mother bar).
 *
 * Alerts: the two alertcondition() calls of the original, "Inside Bar (Body)" (an inside bar of either colour) and
 * "Next Candle Also Inside Bar (Body)" (the orange circle).
 *
 * Reference: "Inside Bar (Body-based) Ind/Alert" by s_b_j
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type InsideBarIndAlertInputs = Record<string, never>;

export const defaultInputs: InsideBarIndAlertInputs = {};

export const inputConfig: InputConfig[] = [];

// Only bar colours (barcolor) and markers (plotshape): no line plots
export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Inside Bar (Body-based) Ind/Alert',
  shortTitle: 'Inside Bar (Body-based) Ind/Alert',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  _inputs: Partial<InsideBarIndAlertInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const n = bars.length;
  // getBodyHighLow(open[k], close[k]): math.max / math.min (na before bar 0)
  const bodyHigh = (i: number) => (i >= 0 ? Math.max(bars[i].open, bars[i].close) : NaN);
  const bodyLow = (i: number) => (i >= 0 ? Math.min(bars[i].open, bars[i].close) : NaN);

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const insideFlags: boolean[] = new Array(n).fill(false);
  const doubleFlags: boolean[] = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const curBodyHigh = bodyHigh(i);
    const curBodyLow = bodyLow(i);
    const prevBodyHigh = bodyHigh(i - 1);
    const prevBodyLow = bodyLow(i - 1);
    const isInsideBody = lt(curBodyHigh, prevBodyHigh) && gt(curBodyLow, prevBodyLow);
    const bodyStatus = ge(bars[i].close, bars[i].open) ? 1 : -1;
    const insideSignal = isInsideBody ? bodyStatus : 0;

    // barcolor(insideSignal == 1 ? color.green : na); barcolor(insideSignal == -1 ? color.red : na)
    if (insideSignal === 1) barColors.push({ time: t, color: color.green });
    if (insideSignal === -1) barColors.push({ time: t, color: color.red });

    // plotshape(insideSignal == 1, triangleup, abovebar, color.green)
    if (insideSignal === 1) markers.push({ time: t, position: 'aboveBar', shape: 'triangleUp', color: color.green });
    // plotshape(insideSignal == -1, triangledown, belowbar, color.red)
    if (insideSignal === -1) markers.push({ time: t, position: 'belowBar', shape: 'triangleDown', color: color.red });

    // Mother bar two bars back: current and previous body inside its body
    const motherBodyHigh = bodyHigh(i - 2);
    const motherBodyLow = bodyLow(i - 2);
    const curInMother = lt(curBodyHigh, motherBodyHigh) && gt(curBodyLow, motherBodyLow);
    const prevInMother = lt(prevBodyHigh, motherBodyHigh) && gt(prevBodyLow, motherBodyLow);
    const doubleInside = curInMother && prevInMother;
    // plotshape(doubleInside, circle, abovebar, color.orange, size.tiny, 'Two-in-a-row (body)')
    if (doubleInside) {
      markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: color.orange, size: 'tiny' });
    }
    // isInsideBarMade = insideSignal != 0
    insideFlags[i] = insideSignal !== 0;
    doubleFlags[i] = doubleInside;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    barColors,
    // alertcondition(isInsideBarMade) / alertcondition(doubleInside)
    alerts: alertStates(alertConditions, bars, [insideFlags, doubleFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Inside Bar (Body)', message: 'Inside Bar (body) came up!' },
  { id: 'alert1', title: 'Next Candle Also Inside Bar (Body)', message: 'Two-in-a-row: current and previous bar inside mother body' },
];

export const InsideBarIndAlert = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
