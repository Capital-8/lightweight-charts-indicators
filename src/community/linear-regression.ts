/**
 * Linear Regression ++
 *
 * Regression line: the linear regression of the source over `length` bars (with an offset), taken from the chosen
 * timeframe and smoothed with an SMA. It is green while it rises and red otherwise. The slope is the difference with
 * the regression of offset + 1, and the channel is the line from bar_index - length to the current bar with a half
 * width of `Deviation` times the standard deviation of the source around that line. Three lines (middle, upper,
 * lower) are drawn on each bar, extended to the right; the lines of the bar before are deleted unless "Show
 * Displacement" is on (then the lines of every bar stay, at most 50 as the original keeps). A BUY label marks a close
 * that crosses below the lower line, a SELL label a close that crosses above the upper line; with "Hide Old Signals"
 * only the labels of the last `length` bars are shown.
 * Alerts (alertcondition, `alerts` of the result): 'Buy Lin Reg' and 'Sell Lin Reg', true on every bar of a BUY /
 * SELL cross (also the bars before the last `length` ones).
 *
 * Other timeframe ("Resolution" not empty): the bars of that timeframe are built from the chart bars and a chart bar
 * shows the value of the latest completed bar of the timeframe. A timeframe below the chart timeframe needs data that
 * the bars do not carry: the port throws an Error. Periods and the chart context (optional third argument): with the
 * exchange time zone and the session of the symbol the periods follow the exchange calendar (src/anchor-period.ts),
 * else the UTC calendar and the bars.
 *
 * Reference: "Linear Regression ++ [Dev Lucem]" by DevLucem
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © DevLucem
 */

import {
  ta, Series, timeframe, line, resetDrawings, setDrawingBar, varDrawing,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { LineDrawingData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type SourceName = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'hlc3' | 'hlcc4' | 'ohlc4' | 'volume';

export interface LinearRegressionInputs {
  /** Timeframe of the regression ('' = chart timeframe) */
  resolution: string;
  source: SourceName;
  length: number;
  /** Channel half width in standard deviations */
  deviation: number;
  /** Offset of the regression */
  offset: number;
  /** SMA length applied to the regression values */
  smoothing: number;
  /** Width of the channel lines */
  lineThick: number;
  /** Show the signals of the last `length` bars only */
  hideOldSignals: boolean;
  upColor: string;
  downColor: string;
  /** Keep the lines of every bar */
  displacement: boolean;
  /** No new lines after this time (ms) */
  endTime: number;
}

export const defaultInputs: LinearRegressionInputs = {
  resolution: '',
  source: 'close',
  length: 100,
  deviation: 2.0,
  offset: 0,
  smoothing: 1,
  lineThick: 4,
  hideOldSignals: true,
  upColor: '#00E676',
  downColor: '#FF5252',
  displacement: false,
  // timestamp("20 Jul 2050 00:00 +0300")
  endTime: 2541877200000,
};

const G_ALGO = 'Algorithm Config';
const G_DISPLAY = 'Display Config';

export const inputConfig: InputConfig[] = [
  { id: 'resolution', type: 'timeframe', title: 'Resolution', defval: '', inline: 'config', group: G_ALGO },
  { id: 'source', type: 'source', title: 'source', defval: 'close', inline: 'config', group: G_ALGO },
  { id: 'length', type: 'int', title: 'length', defval: 100, min: 1, inline: 'config1', group: G_ALGO },
  { id: 'deviation', type: 'float', title: 'Deviation', defval: 2.0, inline: 'config1', group: G_ALGO },
  { id: 'offset', type: 'int', title: 'offset', defval: 0, min: 0, inline: 'config2', group: G_ALGO },
  { id: 'smoothing', type: 'int', title: 'smoothing', defval: 1, min: 1, inline: 'config2', group: G_ALGO },
  { id: 'lineThick', type: 'int', title: 'S&R Size', defval: 4, min: 1, max: 4, inline: 'levels', group: G_DISPLAY },
  { id: 'hideOldSignals', type: 'bool', title: 'Hide Old Signals', defval: true, group: G_DISPLAY },
  { id: 'upColor', type: 'color', title: 'Up', defval: '#00E676', inline: 'colors', group: G_DISPLAY },
  { id: 'downColor', type: 'color', title: 'Down', defval: '#FF5252', inline: 'colors', group: G_DISPLAY },
  { id: 'displacement', type: 'bool', title: 'Show Displacement', defval: false },
  { id: 'endTime', type: 'time', title: 'End Of Calculating', defval: 2541877200000 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Regression Line', color: '#2962FF', lineWidth: 1 },
];

export const metadata = {
  title: 'Linear Regression ++ [Dev Lucem]',
  shortTitle: 'Lin Reg ++ [DL]',
  overlay: true,
};

/** color.aqua, color.lime, color.red, color.black, color.white of this version of the language */
const AQUA = '#00BCD4';
const LIME = '#00E676';
const RED = '#FF5252';
const BLACK = '#363A45';
const WHITE = '#FFFFFF';

/** Pine float comparison: a > b only when a - b > 1e-10 (na compares false) */
const gt = (a: number, b: number) => a - b > 1e-10;

function sourceOf(b: Bar, s: SourceName): number {
  switch (s) {
    case 'open': return b.open;
    case 'high': return b.high;
    case 'low': return b.low;
    case 'hl2': return (b.high + b.low) / 2;
    case 'hlc3': return (b.high + b.low + b.close) / 3;
    case 'hlcc4': return (b.high + b.low + b.close + b.close) / 4;
    case 'ohlc4': return (b.open + b.high + b.low + b.close) / 4;
    case 'volume': return b.volume ?? NaN;
    default: return b.close;
  }
}

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart bars
 * and, for each chart bar, the index of the latest completed bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chartTf = chartTimeframe(bars, context);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`Linear Regression ++: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  return higherTimeframeBars(bars, tf, context);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<LinearRegressionInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'lines'> & { markers: MarkerData[]; lines: LineDrawingData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const length = cfg.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  // data(x) = ta.sma(request.security(syminfo.tickerid, mtf_val, x), smoothing)
  const { htf, latest } = timeframeBars(bars, cfg.resolution, chart);
  const htfSrc = Series.fromArray(htf, htf.map((b) => sourceOf(b, cfg.source)));
  const lr0 = A(ta.linreg(htfSrc, length, cfg.offset));
  const lr1 = A(ta.linreg(htfSrc, length, cfg.offset + 1));
  const onChart = (v: number[]) => Series.fromArray(bars, latest.map((g) => (g >= 0 ? v[g] : NaN)));
  const linreg = A(ta.sma(onChart(lr0), cfg.smoothing));
  const linregP = A(ta.sma(onChart(lr1), cfg.smoothing));

  const src = bars.map((b) => sourceOf(b, cfg.source));
  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);

  // indicator() without max_lines_count: 50 lines; `var line b / dp / dm`
  resetDrawings({ line: 50 });
  const b = varDrawing<Line>();
  const dp = varDrawing<Line>();
  const dm = varDrawing<Line>();
  const width = cfg.lineThick;
  // bar times in seconds or in ms; the time input is in ms
  const toMs = (t: number) => (t >= 1e12 ? t : t * 1000);

  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const dmCurrent: number[] = new Array(n);
  const dpCurrent: number[] = new Array(n);
  for (let x = 0; x < n; x++) {
    setDrawingBar(x, x === n - 1);
    const lr = linreg[x];
    // plot(linreg, color = linreg > linreg[1] ? p : q)
    const prev = x > 0 ? linreg[x - 1] : NaN;
    plot0.push({ time: bars[x].time, value: lr, color: gt(lr, prev) ? cfg.upColor : cfg.downColor });

    const slope = lr - linregP[x];
    const intercept = lr - x * slope;
    let deviationSum = 0.0;
    for (let i = 0; i <= length - 1; i++) {
      const s = x - i >= 0 ? src[x - i] : NaN;
      deviationSum += Math.pow(s - (slope * (x - i) + intercept), 2);
    }
    const deviation = Math.sqrt(deviationSum / length);
    const x1 = x - length;
    const x2 = x;
    const y1 = slope * (x - length) + intercept;
    const y2 = lr;

    // updating = goto >= time: the lines of the bar before are deleted after the new ones are made
    if (cfg.endTime >= toMs(bars[x].time)) {
      // b[1]: the line of the variable on the bar before
      const prevB = b.value;
      b.value = line.new(x1, y1, x2, y2, 'bar_index', 'right', AQUA, 'solid', width);
      if (!cfg.displacement && prevB) line.delete(prevB);
      const prevDp = dp.value;
      dp.value = line.new(x1, deviation * cfg.deviation + y1, x2, deviation * cfg.deviation + y2, 'bar_index', 'right', cfg.downColor, 'solid', width);
      if (!cfg.displacement && prevDp) line.delete(prevDp);
      const prevDm = dm.value;
      dm.value = line.new(x1, -deviation * cfg.deviation + y1, x2, -deviation * cfg.deviation + y2, 'bar_index', 'right', cfg.upColor, 'solid', width);
      if (!cfg.displacement && prevDm) line.delete(prevDm);
    }
    dmCurrent[x] = -deviation * cfg.deviation + y2;
    dpCurrent[x] = deviation * cfg.deviation + y2;
  }
  setDrawingBar(null);

  // buy = ta.crossunder(close, dm_current), sell = ta.crossover(close, dp_current)
  const close = new Series(bars, (bar) => bar.close);
  const buy = ta.crossunder(close, Series.fromArray(bars, dmCurrent)).toArray().map((v) => !!v);
  const sell = ta.crossover(close, Series.fromArray(bars, dpCurrent)).toArray().map((v) => !!v);

  // plotshape(..., show_last = Hide Old Signals ? length : 99999999)
  const showFrom = cfg.hideOldSignals ? n - length : n - 99999999;
  const markers: MarkerData[] = [];
  for (let x = Math.max(0, showFrom); x < n; x++) {
    if (buy[x]) {
      markers.push({ time: bars[x].time, position: 'belowBar', shape: 'labelUp', color: LIME, text: 'BUY', textColor: BLACK });
    }
    if (sell[x]) {
      markers.push({ time: bars[x].time, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'SELL', textColor: WHITE });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0 },
    markers,
    lines: line.all().map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
      width: l.width, extend: 'right' as const,
    })),
    alerts: alertStates(alertConditions, bars, [buy, sell]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Lin Reg', message: 'Crossing On the Lower Regression Channel' },
  { id: 'alert1', title: 'Sell Lin Reg', message: 'Crossing On the Higher Regression Channel' },
];

export const LinearRegression = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
