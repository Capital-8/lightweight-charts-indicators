/**
 * Early Pivot Alert (price-quantum reversal) v1a
 *
 * A trend state (+1 up, -1 down, set on the first bar from its candle direction) keeps the extreme of the current
 * trend (highest high in an uptrend, lowest low in a downtrend). A reversal threshold (percent of the extreme, ATR
 * multiple, fixed points or standard deviation multiple) gives the trigger levels: an UP signal when the close
 * reaches the last low + threshold in a downtrend, a DOWN signal when it falls to the last high - threshold in an
 * uptrend, with a minimum bar gap between two signals. The trigger level of the current trend is drawn as a line;
 * the signals are triangles.
 *
 * Last bar: with 'Alleen signalen op bar close' a signal needs a closed bar. The port reads the state of the last bar
 * from the optional third argument (see src/chart-context.ts); without it every bar is taken as closed.
 *
 * Reference: "Early Pivot Alert (price-quantum reversal) • v1a (arrows only)" by dirkbiebaut
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export type EarlyPivotMethod = 'Percent' | 'ATR' | 'Points' | 'StdDev';

export interface EarlyPivotAlertV1aInputs {
  /** Threshold method */
  method: EarlyPivotMethod;
  /** Percent (%) of the trend extreme */
  pct: number;
  /** ATR length */
  atrLen: number;
  /** ATR multiplier */
  atrK: number;
  /** Fixed points */
  pts: number;
  /** Standard deviation length */
  sdLen: number;
  /** Standard deviation multiplier */
  sdK: number;
  /** Signals only on bar close */
  confirmClose: boolean;
  /** Minimum bars between two signals */
  minBarsGap: number;
  /** Repaint-safe update (same values on closed bars) */
  repaintSafe: boolean;
  /** Show the trigger levels */
  showLevels: boolean;
  /** Show the arrows */
  showArrows: boolean;
}

export const defaultInputs: EarlyPivotAlertV1aInputs = {
  method: 'Percent',
  pct: 0.5,
  atrLen: 14,
  atrK: 1.0,
  pts: 1.0,
  sdLen: 20,
  sdK: 1.0,
  confirmClose: true,
  minBarsGap: 3,
  repaintSafe: true,
  showLevels: true,
  showArrows: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'method', type: 'string', title: 'Methode', defval: 'Percent', options: ['Percent', 'ATR', 'Points', 'StdDev'] },
  { id: 'pct', type: 'float', title: 'Percent (%)', defval: 0.5, step: 0.1 },
  { id: 'atrLen', type: 'int', title: 'ATR lengte', defval: 14, min: 1 },
  { id: 'atrK', type: 'float', title: 'ATR multiplier', defval: 1.0, step: 0.1 },
  { id: 'pts', type: 'float', title: 'Punten/Pips', defval: 1.0, step: 0.01 },
  { id: 'sdLen', type: 'int', title: 'StdDev lengte', defval: 20, min: 2 },
  { id: 'sdK', type: 'float', title: 'StdDev multiplier', defval: 1.0, step: 0.1 },
  { id: 'confirmClose', type: 'bool', title: 'Alleen signalen op bar close', defval: true },
  { id: 'minBarsGap', type: 'int', title: 'Minimum bars tussen 2 signalen', defval: 3, min: 0 },
  { id: 'repaintSafe', type: 'bool', title: 'Uiterst bij barclose bijwerken (repaint-arm)', defval: true },
  { id: 'showLevels', type: 'bool', title: 'Toon trigger-levels', defval: true },
  { id: 'showArrows', type: 'bool', title: 'Toon pijlen i.p.v. labels', defval: true },
];

const COL_UP = String(color.new(color.teal, 0));
const COL_DOWN = String(color.new(color.orange, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Trigger Up', color: COL_UP, lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'Trigger Down', color: COL_DOWN, lineWidth: 1, style: 'linebr' },
];

export const metadata = {
  title: 'Early Pivot Alert (price-quantum reversal) • v1a (arrows only)',
  shortTitle: 'Early Pivot Alert (price-quantum reversal) • v1a (arrows only)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** nz(x, y): y when x is na (+-infinity counts as na) */
const nz = (x: number, y: number) => (Number.isFinite(x) ? x : y);

export function calculate(
  bars: Bar[],
  inputs: Partial<EarlyPivotAlertV1aInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const atr = A(ta.atr(bars, cfg.atrLen));
  const stdev = A(ta.stdev(Series.fromBars(bars, 'close'), cfg.sdLen));
  const getThreshold = (ref: number, i: number) => {
    switch (cfg.method) {
      case 'Percent': return ref * (cfg.pct / 100.0);
      case 'ATR': return atr[i] * cfg.atrK;
      case 'Points': return cfg.pts;
      case 'StdDev': return stdev[i] * cfg.sdK;
      default: return NaN;
    }
  };

  let dir = 0;
  let lastHigh = NaN;
  let lastLow = NaN;
  let lastSigBar = NaN;

  const plot0 = [];
  const plot1 = [];
  const markers: MarkerData[] = [];
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    // h = repaintSafe ? ta.highest(high, 1) : high (the same value), l likewise, c = close
    const h = b.high;
    const l = b.low;
    const c = b.close;

    if (i === 0) {
      dir = ge(b.close, b.open) ? +1 : -1;
      lastHigh = h;
      lastLow = l;
      lastSigBar = NaN;
    }

    if (dir >= 0) {
      if (gt(h, nz(lastHigh, h))) lastHigh = h;
    } else if (lt(l, nz(lastLow, l))) {
      lastLow = l;
    }

    const thUp = getThreshold(nz(lastLow, l), i);
    const thDown = getThreshold(nz(lastHigh, h), i);
    const triggerUp = dir <= 0 && ge(c, nz(lastLow, l) + thUp);
    const triggerDown = dir >= 0 && le(c, nz(lastHigh, h) - thDown);
    const gapOk = isNaN(lastSigBar) || i - lastSigBar >= cfg.minBarsGap;
    // barConfirmed = confirmClose ? barstate.isconfirmed : true
    const barConfirmed = cfg.confirmClose ? barIsConfirmed(i) : true;
    const longSignal = barConfirmed && gapOk && triggerUp;
    const shortSignal = barConfirmed && gapOk && triggerDown;

    if (longSignal) {
      dir = +1;
      lastHigh = h;
      lastSigBar = i;
    }
    if (shortSignal) {
      dir = -1;
      lastLow = l;
      lastSigBar = i;
    }

    const lvlUp = nz(lastLow, l) + thUp;
    const lvlDown = nz(lastHigh, h) - thDown;
    const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
    plot0.push({ time: b.time, value: cfg.showLevels && dir <= 0 ? fin(lvlUp) : NaN, color: COL_UP });
    plot1.push({ time: b.time, value: cfg.showLevels && dir >= 0 ? fin(lvlDown) : NaN, color: COL_DOWN });

    if (cfg.showArrows && longSignal) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: color.lime, size: 'small' });
    }
    if (cfg.showArrows && shortSignal) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: color.red, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    markers,
  };
}

export const EarlyPivotAlertV1a = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
