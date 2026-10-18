/**
 * Moving Average Crossover with Shading Signals
 *
 * Three moving averages (EMA or SMA): fast, slow and trend. With "Use Dynamic Source" an average takes the low when
 * the close is above the trend average (for the trend average itself: above its plain average of the source) and
 * the high otherwise. The area between the fast and slow averages is lime when fast >= slow > trend, maroon when
 * fast < slow < trend, yellow otherwise. Buy / Sell labels when the averages are stacked up / down and the fast
 * crossed the slow or the slow crossed the trend on this bar; exit crosses when the stack ends.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Long Entry', 'Short Entry', 'Exit Long', 'Exit Short', true on
 * the bars of the Buy / Sell / exit marks.
 *
 * Reference: "Moving Average Crossover with Shading Signals" by Decam9
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Decam9
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type MovingAverageCrossoverWithShadingSignalsMaType = 'EMA' | 'SMA';

export interface MovingAverageCrossoverWithShadingSignalsInputs {
  len1: number;
  src1: SourceType;
  ma1Type: MovingAverageCrossoverWithShadingSignalsMaType;
  /** Fast MA: low above the trend average, high below it */
  dynamic1: boolean;
  len2: number;
  src2: SourceType;
  ma2Type: MovingAverageCrossoverWithShadingSignalsMaType;
  /** Slow MA: low above the trend average, high below it */
  dynamic2: boolean;
  len3: number;
  src3: SourceType;
  ma3Type: MovingAverageCrossoverWithShadingSignalsMaType;
  /** Trend MA: low above the plain trend average of the source, high below it */
  dynamic3: boolean;
}

export const defaultInputs: MovingAverageCrossoverWithShadingSignalsInputs = {
  len1: 5,
  src1: 'close',
  ma1Type: 'EMA',
  dynamic1: true,
  len2: 20,
  src2: 'close',
  ma2Type: 'SMA',
  dynamic2: false,
  len3: 50,
  src3: 'close',
  ma3Type: 'SMA',
  dynamic3: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'len1', type: 'int', title: 'Fast MA Length', defval: 5 },
  { id: 'src1', type: 'source', title: 'Source', defval: 'close' },
  { id: 'ma1Type', type: 'string', title: 'Type', defval: 'EMA', options: ['EMA', 'SMA'] },
  { id: 'dynamic1', type: 'bool', title: 'Use Dynamic Source?', defval: true },
  { id: 'len2', type: 'int', title: 'Slow MA Length', defval: 20 },
  { id: 'src2', type: 'source', title: 'Source', defval: 'close' },
  { id: 'ma2Type', type: 'string', title: 'Type', defval: 'SMA', options: ['EMA', 'SMA'] },
  { id: 'dynamic2', type: 'bool', title: 'Use Dynamic Source?', defval: false },
  { id: 'len3', type: 'int', title: 'Trend MA Length', defval: 50 },
  { id: 'src3', type: 'source', title: 'Source', defval: 'close' },
  { id: 'ma3Type', type: 'string', title: 'Type', defval: 'SMA', options: ['EMA', 'SMA'] },
  { id: 'dynamic3', type: 'bool', title: 'Use Dynamic Source?', defval: false },
];

const FAST_COL = String(color.new(color.black, 60));
const SLOW_COL = String(color.new(color.blue, 60));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: FAST_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Slow MA', color: SLOW_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Trend MA', color: color.green, lineWidth: 1 },
];

export const metadata = {
  title: 'MA Crossover',
  shortTitle: 'MA Crossover',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10); na operands give false */
const EPS = 1e-10;
const gt = (a: number, b: number): boolean => a - b > EPS;
const lt = (a: number, b: number): boolean => b - a > EPS;
const ge = (a: number, b: number): boolean => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number): boolean => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<MovingAverageCrossoverWithShadingSignalsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  // getMA(_src, _len, _type) => _type == "EMA" ? ta.ema(_src, _len) : ta.sma(_src, _len)
  const getMA = (src: number[], len: number, type: MovingAverageCrossoverWithShadingSignalsMaType) =>
    A(type === 'EMA' ? ta.ema(S(src), len) : ta.sma(S(src), len));
  const close = bars.map((b) => b.close);
  // close > ma ? low : high
  const dynamicSrc = (ma: number[]) => bars.map((b, i) => (gt(b.close, ma[i]) ? b.low : b.high));

  // TrendSrc = dynamic3 ? (close > getMA(src3, len3, ma3_type) ? low : high) : src3
  const src3 = A(getSourceSeries(bars, cfg.src3));
  const trendSrc = cfg.dynamic3 ? dynamicSrc(getMA(src3, cfg.len3, cfg.ma3Type)) : src3;
  const trend = getMA(trendSrc, cfg.len3, cfg.ma3Type);
  const fastSrc = cfg.dynamic1 ? dynamicSrc(trend) : A(getSourceSeries(bars, cfg.src1));
  const fast = getMA(fastSrc, cfg.len1, cfg.ma1Type);
  const slowSrc = cfg.dynamic2 ? dynamicSrc(trend) : A(getSourceSeries(bars, cfg.src2));
  const slow = getMA(slowSrc, cfg.len2, cfg.ma2Type);

  // ta.cross(a, b): compared with the last bar where it ran with both values not na (a tie there counts); exact
  // comparisons. justCrossed = ta.cross(Fast, Slow) or ta.cross(Slow, Trend): the `or` is lazy, so the second cross
  // only runs (and keeps history) on the bars where the first one is false.
  class Cross {
    private p1 = NaN;
    private p2 = NaN;
    call(a: number, b: number): boolean {
      const r = (a > b && this.p1 <= this.p2) || (a < b && this.p1 >= this.p2);
      if (!isNaN(a) && !isNaN(b)) {
        this.p1 = a;
        this.p2 = b;
      }
      return r;
    }
  }
  const crossFastSlow = new Cross();
  const crossSlowTrend = new Cross();

  const lime = String(color.new(color.lime, 75));
  const yellow = String(color.new(color.yellow, 75));
  const maroon = String(color.new(color.maroon, 75));
  const shading: string[] = new Array(n);
  const markers: MarkerData[] = [];
  let prevUp = false;
  let prevDown = false;
  const flags: boolean[][] = [0, 1, 2, 3].map(() => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    shading[i] = ge(fast[i], slow[i])
      ? (gt(slow[i], trend[i]) ? lime : yellow)
      : (lt(slow[i], trend[i]) ? maroon : yellow);
    const uptrend = ge(fast[i], slow[i]) && ge(slow[i], trend[i]);
    const downtrend = le(fast[i], slow[i]) && le(slow[i], trend[i]);
    const justCrossed = crossFastSlow.call(fast[i], slow[i]) || crossSlowTrend.call(slow[i], trend[i]);
    // plotshape(long, location.belowbar, shape.labelup, color.green, size.tiny, 'Buy')
    if (uptrend && justCrossed) markers.push({ time: t, position: 'belowBar', shape: 'labelUp', color: color.green, size: 'tiny', id: 'shape0' });
    // plotshape(short, location.abovebar, shape.labeldown, color.red, size.tiny, 'Sell')
    if (downtrend && justCrossed) markers.push({ time: t, position: 'aboveBar', shape: 'labelDown', color: color.red, size: 'tiny', id: 'shape1' });
    // exitLong = uptrend[1] and not uptrend: xcross above the bar, green; exitShort likewise, red
    if (prevUp && !uptrend) markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: color.green, size: 'tiny', id: 'shape2' });
    if (prevDown && !downtrend) markers.push({ time: t, position: 'aboveBar', shape: 'xcross', color: color.red, size: 'tiny', id: 'shape3' });
    // long / short / exitLong / exitShort
    flags[0][i] = uptrend && justCrossed;
    flags[1][i] = downtrend && justCrossed;
    flags[2][i] = prevUp && !uptrend;
    flags[3][i] = prevDown && !downtrend;
    prevUp = uptrend;
    prevDown = downtrend;
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: bars.map((b, i) => ({ time: b.time, value: fast[i], color: FAST_COL })),
      plot1: bars.map((b, i) => ({ time: b.time, value: slow[i], color: SLOW_COL })),
      // color = close >= Trend ? color.green : color.red
      plot2: bars.map((b, i) => ({ time: b.time, value: trend[i], color: ge(close[i], trend[i]) ? color.green : color.red })),
    },
    // fill(ma1, ma2, color = Shading)
    fills: [{ plot1: 'plot0', plot2: 'plot1', options: { title: 'Plots Background' }, colors: shading }],
    markers,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Long Entry', message: 'Buy' },
  { id: 'alert1', title: 'Short Entry', message: 'Sell' },
  { id: 'alert2', title: 'Exit Long', message: 'Exit Long' },
  { id: 'alert3', title: 'Exit Short', message: 'Exit Short' },
];

export const MovingAverageCrossoverWithShadingSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
