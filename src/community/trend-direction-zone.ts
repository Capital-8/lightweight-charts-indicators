/**
 * Trend Direction Zone
 *
 * Trend line: a lag-reduced EMA, ema + (ema - ema(ema)) * lagReduction. Zone: trend line +- ATR * (0.5 + level) *
 * zoneWidth, where level is the place of the ATR in its highest / lowest range over the ATR length (0.5 on a flat
 * range). Direction: bullish after `confirmBars` bars in a row with a rising trend line (vs 3 bars ago) and the
 * source above the trend line + switchFilter * ATR; bearish the same way down. A direction change needs at least
 * `minBarsBetweenSignals` bars since the last change. The line and the zone take the direction colour (gray before
 * the first direction); triangles at signalOffsetAtr * ATR from the trend line mark each change.
 *
 * Last bar: the direction state is updated on a closed bar only, and a signal needs a closed bar. The port reads the
 * state of the last bar from the optional third argument (see src/chart-context.ts); without it every bar is taken as
 * closed.
 *
 * Reference: "Trend Direction Zone" by MarketStructureLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © MarketStructureLab
 */

import {
  ta, Series, getSourceSeries, color,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface TrendDirectionZoneInputs {
  /** Price source of the trend line */
  source: SourceType;
  /** EMA length of the trend line */
  trendLength: number;
  /** Lag reduction factor */
  lagReduction: number;
  /** ATR length of the zone */
  atrLength: number;
  /** Zone width multiplier */
  zoneWidth: number;
  /** Closed bars in a row needed before the direction can change */
  confirmBars: number;
  /** Minimum distance from the trend line (ATR) to confirm a direction */
  switchFilter: number;
  /** Minimum number of bars between direction changes */
  minBarsBetweenSignals: number;
  /** Distance of the triangles from the trend line (ATR) */
  signalOffsetAtr: number;
  showTrendLine: boolean;
  showZone: boolean;
  showSignals: boolean;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: TrendDirectionZoneInputs = {
  source: 'close',
  trendLength: 20,
  lagReduction: 1.2,
  atrLength: 14,
  zoneWidth: 2.0,
  confirmBars: 2,
  switchFilter: 0.2,
  minBarsBetweenSignals: 5,
  signalOffsetAtr: 0.45,
  showTrendLine: true,
  showZone: true,
  showSignals: true,
  bullColor: 'rgb(0, 230, 118)',
  bearColor: 'rgb(255, 82, 82)',
};

const TREND = 'Trend';
const ZONE = 'Trend Zone';
const SIGNALS = 'Direction Signals';
const VISUALS = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'source', type: 'source', title: 'Source', defval: 'close', group: TREND },
  { id: 'trendLength', type: 'int', title: 'Trend Length', defval: 20, min: 5, max: 100, group: TREND },
  { id: 'lagReduction', type: 'float', title: 'Lag Reduction', defval: 1.2, min: 0.0, max: 2.5, step: 0.1, group: TREND },
  { id: 'atrLength', type: 'int', title: 'ATR Length', defval: 14, min: 1, group: ZONE },
  { id: 'zoneWidth', type: 'float', title: 'Zone Width', defval: 2.0, min: 0.5, max: 5.0, step: 0.1, group: ZONE },
  { id: 'confirmBars', type: 'int', title: 'Direction Confirmation', defval: 2, min: 1, max: 5, group: SIGNALS },
  { id: 'switchFilter', type: 'float', title: 'Switch Filter (ATR)', defval: 0.2, min: 0.0, max: 1.5, step: 0.05, group: SIGNALS },
  { id: 'minBarsBetweenSignals', type: 'int', title: 'Minimum Bars Between Signals', defval: 5, min: 0, max: 50, group: SIGNALS },
  { id: 'signalOffsetAtr', type: 'float', title: 'Signal Distance From Line (ATR)', defval: 0.45, min: 0.05, max: 2.0, step: 0.05, group: SIGNALS },
  { id: 'showTrendLine', type: 'bool', title: 'Show Trend Line', defval: true, group: VISUALS },
  { id: 'showZone', type: 'bool', title: 'Show Trend Zone', defval: true, group: VISUALS },
  { id: 'showSignals', type: 'bool', title: 'Show Direction Signals', defval: true, group: VISUALS },
  { id: 'bullColor', type: 'color', title: 'Bullish', defval: 'rgb(0, 230, 118)', group: VISUALS },
  { id: 'bearColor', type: 'color', title: 'Bearish', defval: 'rgb(255, 82, 82)', group: VISUALS },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Trend Zone', color: String(color.new(color.gray, 50)), lineWidth: 1 },
  { id: 'plot1', title: 'Lower Trend Zone', color: String(color.new(color.gray, 50)), lineWidth: 1 },
  { id: 'plot2', title: 'Trend Line', color: color.gray, lineWidth: 3 },
];

export const metadata = {
  title: 'Trend Direction Zone [MarketStructureLab]',
  shortTitle: 'TD Zone',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false); == within 1e-10 */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** safeDivide(num, den, fallback): na(num) or na(den) or den == 0.0 ? fallback : num / den */
const safeDivide = (num: number, den: number, fallback: number) =>
  isNaN(num) || isNaN(den) || eq(den, 0) ? fallback : num / den;

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendDirectionZoneInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } {
  // barstate.isconfirmed: every bar is closed, except the last one when the chart context says that it is still open
  const lastBarOpen = !lastBarConfirmedOf(chart);
  const barIsConfirmed = (index: number) => !(lastBarOpen && index === bars.length - 1);
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // Trend line
  const source = A(getSourceSeries(bars, cfg.source));
  const emaBase = A(ta.ema(S(source), cfg.trendLength));
  const emaSmoothed = A(ta.ema(S(emaBase), cfg.trendLength));
  const trendLine = emaBase.map((e, i) => e + (e - emaSmoothed[i]) * cfg.lagReduction);

  // Adaptive trend zone
  const atrValue = A(ta.atr(bars, cfg.atrLength));
  const atrHigh = A(ta.highest(S(atrValue), cfg.atrLength));
  const atrLow = A(ta.lowest(S(atrValue), cfg.atrLength));
  const upperZone: number[] = new Array(n);
  const lowerZone: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const atrLevel = safeDivide(atrValue[i] - atrLow[i], atrHigh[i] - atrLow[i], 0.5);
    const adaptiveWidth = atrValue[i] * (0.5 + atrLevel) * cfg.zoneWidth;
    upperZone[i] = trendLine[i] + adaptiveWidth;
    lowerZone[i] = trendLine[i] - adaptiveWidth;
  }

  // Direction state (if barstate.isconfirmed: the counts and the state keep their values on an open bar)
  const marketState: number[] = new Array(n);
  let bullCount = 0;
  let bearCount = 0;
  let state = 0;
  let lastSwitchBar = NaN;
  for (let i = 0; i < n; i++) {
    const trendSlope = i < 3 || isNaN(trendLine[i - 3]) ? 0.0 : trendLine[i] - trendLine[i - 3];
    const normalizedSlope = safeDivide(trendSlope, atrValue[i], 0.0);
    const minimumDistance = atrValue[i] * cfg.switchFilter;
    const bullCondition = gt(normalizedSlope, 0.0) && gt(source[i], trendLine[i] + minimumDistance);
    const bearCondition = lt(normalizedSlope, 0.0) && lt(source[i], trendLine[i] - minimumDistance);
    if (barIsConfirmed(i)) {
      bullCount = bullCondition ? bullCount + 1 : 0;
      bearCount = bearCondition ? bearCount + 1 : 0;
      // bar_index - lastSwitchBar: a difference of bar indexes, the same from any first bar
      const cooldownPassed = isNaN(lastSwitchBar) || ge(i - lastSwitchBar, cfg.minBarsBetweenSignals);
      if (cooldownPassed) {
        if (state !== 1 && bullCount >= cfg.confirmBars) {
          state = 1;
          lastSwitchBar = i;
          bullCount = 0;
          bearCount = 0;
        } else if (state !== -1 && bearCount >= cfg.confirmBars) {
          state = -1;
          lastSwitchBar = i;
          bullCount = 0;
          bearCount = 0;
        }
      }
    }
    marketState[i] = state;
  }

  const markers: MarkerData[] = [];
  const upper: { time: number; value: number; color: string }[] = [];
  const lower: { time: number; value: number; color: string }[] = [];
  const line: { time: number; value: number; color: string }[] = [];
  const fillColors: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const bullishState = marketState[i] === 1;
    const bearishState = marketState[i] === -1;
    const previousState = i > 0 ? marketState[i - 1] : 0; // nz(marketState[1], 0)
    const bullishSignal = barIsConfirmed(i) && bullishState && previousState !== 1;
    const bearishSignal = barIsConfirmed(i) && bearishState && previousState !== -1;
    const stateColor = bullishState ? cfg.bullColor : bearishState ? cfg.bearColor : color.gray;
    const zoneBorderColor = String(color.new(stateColor, 50));
    fillColors.push(cfg.showZone ? String(color.new(stateColor, 88)) : 'transparent');
    const up = upperZone[i];
    const lo = lowerZone[i];
    const tl = trendLine[i];
    upper.push({ time: t, value: cfg.showZone && Number.isFinite(up) ? up : NaN, color: zoneBorderColor });
    lower.push({ time: t, value: cfg.showZone && Number.isFinite(lo) ? lo : NaN, color: zoneBorderColor });
    line.push({ time: t, value: cfg.showTrendLine && Number.isFinite(tl) ? tl : NaN, color: stateColor });

    // plotshape(longSignalY / shortSignalY, location.absolute, size.small): na draws nothing
    if (cfg.showSignals && bullishSignal) {
      const y = tl - atrValue[i] * cfg.signalOffsetAtr;
      if (!isNaN(y)) {
        markers.push({ time: t, position: 'atPriceMiddle', price: y, shape: 'triangleUp', color: cfg.bullColor, size: 'small' });
      }
    }
    if (cfg.showSignals && bearishSignal) {
      const y = tl + atrValue[i] * cfg.signalOffsetAtr;
      if (!isNaN(y)) {
        markers.push({ time: t, position: 'atPriceMiddle', price: y, shape: 'triangleDown', color: cfg.bearColor, size: 'small' });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: upper, plot1: lower, plot2: line },
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Trend Zone Fill' }, colors: fillColors }],
    markers,
  };
}

export const TrendDirectionZone = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
