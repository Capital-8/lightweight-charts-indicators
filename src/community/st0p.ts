/**
 * ST0P
 *
 * Percent trailing stop. SHORT = src + Unit + src * Percent / 100 and LONG = src - Unit - src * Percent / 100; the
 * short stop SUB takes SHORT when SHORT is below the previous SUB or the previous source closed above it, else it
 * keeps its value; the long stop SLB takes LONG when LONG is above the previous SLB or the previous source closed
 * below it. ST0P is SLB with "LONG=1 SHORT=2" = 1, else SUB; it is drawn green when rising, red when falling, blue
 * when flat. Two fills between an OHLC4 circle plot and the ST0P line highlight the selected side ("LONG
 * Highligter" green in long mode, "SHORT Highligter" red in short mode, white otherwise). A "ST0P" label marks the
 * source crossing over the short stop (short mode, at SHORT) or under the long stop (long mode, at LONG).
 * Alerts (alertcondition, `alerts` of the result): 'LONG POSITION ST0P!' (long mode, source crosses under ST0P) and
 * 'SHORT POSITION ST0P!' (short mode, source crosses over ST0P).
 *
 * Reference: "ST0P" by KivancOzbilgic
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface ST0PInputs {
  /** Percent */
  percent: number;
  /** Source */
  src: SourceType;
  /** LONG=1 SHORT=2 */
  changeLongShort: number;
  /** Unit (Pine KADEME) */
  unit: number;
  /** Show ST0P Signals ? */
  showSignals: boolean;
  /** Highlighter On/Off ? */
  highlighting: boolean;
}

export const defaultInputs: ST0PInputs = {
  percent: 3,
  src: 'close',
  changeLongShort: 1,
  unit: 0.0,
  showSignals: true,
  highlighting: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'percent', type: 'float', title: 'Percent', defval: 3 },
  { id: 'src', type: 'source', title: 'Source', defval: 'close' },
  { id: 'changeLongShort', type: 'int', title: 'LONG=1 SHORT=2', defval: 1, min: 1, max: 2 },
  { id: 'unit', type: 'float', title: 'Unit', defval: 0.0, step: 0.1 },
  { id: 'showSignals', type: 'bool', title: 'Show ST0P Signals ?', defval: true },
  { id: 'highlighting', type: 'bool', title: 'Highlighter On/Off ?', defval: true },
];

// Pine v4 colours
const GREEN = '#4CAF50';
const RED = '#FF5252';
const WHITE = '#FFFFFF';
const BLUE = '#2196F3';
const FLAT = '#001AE1';

/** Each fill() has its own pair of plots: plot(ohlc4, title = "", circles, linewidth 0) and plot(ST0P, linewidth 3) */
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: '', color: BLUE, lineWidth: 0, style: 'circles' },
  { id: 'plot1', title: 'Plot', color: BLUE, lineWidth: 3 },
  { id: 'plot2', title: '', color: BLUE, lineWidth: 0, style: 'circles' },
  { id: 'plot3', title: 'Plot', color: BLUE, lineWidth: 3 },
];

export const metadata = {
  title: 'ST0P',
  shortTitle: 'ST0P',
  overlay: true,
};

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'LONG POSITION ST0P!', message: 'SELL!' },
  { id: 'alert1', title: 'SHORT POSITION ST0P!', message: 'BUY!' },
];

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const nz = (v: number, d = 0) => (isNaN(v) ? d : v);

/** fill() default transparency 90 */
const fillColor = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.1)`;
};

export function calculate(
  bars: Bar[],
  inputs: Partial<ST0PInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);
  const isLong = cfg.changeLongShort === 1;
  const isShort = cfg.changeLongShort === 2;

  const SHORT = new Array<number>(n);
  const LONG = new Array<number>(n);
  const st0p = new Array<number>(n);
  let sub = 0.0; // SUB[1] (na before bar 0: nz -> 0)
  let slb = 0.0;
  for (let i = 0; i < n; i++) {
    const s = src[i];
    const s1 = i > 0 ? src[i - 1] : NaN;
    SHORT[i] = s + cfg.unit + (s * cfg.percent) / 100;
    LONG[i] = s - cfg.unit - (s * cfg.percent) / 100;
    // SUB := SHORT < nz(SUB[1]) or src[1] > nz(SUB[1]) ? SHORT : nz(SUB[1])
    const sub1 = nz(sub);
    sub = lt(SHORT[i], sub1) || gt(s1, sub1) ? SHORT[i] : sub1;
    // SLB := LONG > nz(SLB[1]) or src[1] < nz(SLB[1]) ? LONG : nz(SLB[1])
    const slb1 = nz(slb);
    slb = gt(LONG[i], slb1) || lt(s1, slb1) ? LONG[i] : slb1;
    st0p[i] = isLong ? slb : sub;
  }

  // color2 = ST0P > ST0P[1] ? green : ST0P < ST0P[1] ? red : #001AE1
  const stPlot = bars.map((b, i) => {
    const p = i > 0 ? st0p[i - 1] : NaN;
    const c = gt(st0p[i], p) ? GREEN : lt(st0p[i], p) ? RED : FLAT;
    return { time: b.time, value: st0p[i], color: c };
  });
  const ohlc4Plot = bars.map((b) => ({ time: b.time, value: (b.open + b.high + b.low + b.close) / 4 }));

  const longFill = cfg.highlighting ? (isLong ? GREEN : WHITE) : WHITE;
  const shortFill = cfg.highlighting ? (isShort ? RED : WHITE) : WHITE;

  const crossUp = crossedOver(src, st0p);
  const crossDn = crossedUnder(src, st0p);
  const longStop = crossDn.map((c) => isLong && c);
  const shortStop = crossUp.map((c) => isShort && c);

  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    // plotshape(changeLONGSHORT==2 and crossover(src,ST0P) and showsignals ? SHORT : na, "Buy", labelup, absolute, tiny)
    if (shortStop[i] && cfg.showSignals && !isNaN(SHORT[i])) {
      markers.push({ time: t, id: 'shape0', position: 'atPriceBottom', price: SHORT[i], shape: 'labelUp', color: GREEN,
        text: 'ST0P', textColor: WHITE, size: 'tiny' });
    }
    // plotshape(changeLONGSHORT==1 and crossunder(src,ST0P) and showsignals ? LONG : na, "Sell", labeldown, absolute, tiny)
    if (longStop[i] && cfg.showSignals && !isNaN(LONG[i])) {
      markers.push({ time: t, id: 'shape1', position: 'atPriceTop', price: LONG[i], shape: 'labelDown', color: RED,
        text: 'ST0P', textColor: WHITE, size: 'tiny' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: ohlc4Plot, plot1: stPlot, plot2: ohlc4Plot.map((p) => ({ ...p })), plot3: stPlot.map((p) => ({ ...p })) },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'LONG Highligter', color: fillColor(longFill) } },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'SHORT Highligter', color: fillColor(shortFill) } },
    ],
    markers,
    // alertcondition(changeLONGSHORT==1 and crossunder(src,ST0P)) / alertcondition(changeLONGSHORT==2 and crossover(src,ST0P))
    alerts: alertStates(alertConditions, bars, [longStop, shortStop]),
  };
}

export const ST0P = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
