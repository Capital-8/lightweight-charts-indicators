/**
 * CM Ultimate MA MTF V4
 *
 * A fast and an optional slow moving average (SMA, EMA, WMA, Hull MA, VWMA, RMA, TEMA or Tilson T3), each on the
 * chart timeframe or on a higher timeframe of the same symbol, with an offset. The fast average can take a bull /
 * bear colour from its slope over `fast_ma_smooth` bars or from its place above / below the slow average. With
 * "Show Fill?" two hidden copies of the averages carry a fill between them, in the colour of the fast average.
 *
 * Higher timeframe: the bars of that timeframe are built from the chart bars, so its averages start at the first
 * chart bar. Without lookahead, a chart bar shows the value of the latest completed bar of the timeframe (the chart
 * bar that completes a period shows the value of that period). A timeframe below the chart timeframe needs data
 * that the bars do not carry: the port throws an Error.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar, see src/anchor-period.ts;
 * without them the port uses the UTC calendar and the bars.
 *
 * The line widths are inputs in the original; the plots here have the default width of 3. The four alert() calls
 * of the original have no output.
 *
 * Reference: "_CM_Ultimate_MA_MTF_V4" by ChrisMoody
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChrisMoody
 */

import {
  ta, Series, color, timeframe, mapToChart, getSourceSeries, barTime, barInterval,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type MaType = 'SMA' | 'EMA' | 'WMA' | 'Hull MA' | 'VWMA' | 'RMA' | 'TEMA' | 'TIL T3';
type MaSource = SourceType | 'volume';

export interface CmUltimateMaMtfV4Inputs {
  /** Fast MA timeframe ("" = the chart timeframe) */
  res1: string;
  fast_ma_len: number;
  src1: MaSource;
  fast_ma_off: number;
  fast_ma_source: MaType;
  fast_factorT3: number;
  show_slow_ma: boolean;
  /** Slow MA timeframe ("" = the chart timeframe) */
  res2: string;
  slow_ma_len: number;
  src2: MaSource;
  slow_ma_off: number;
  slow_ma_source: MaType;
  slow_factorT3: number;
  fast_ma_col: string;
  slow_ma_col: string;
  /** Line width (not applied: the plot width is static) */
  fast_ma_wid: number;
  /** Line width (not applied: the plot width is static) */
  slow_ma_wid: number;
  show_fast_ma_cc: boolean;
  fast_ma_smooth: number;
  bullish_col: string;
  bearish_col: string;
  show_fast_ma_tr: boolean;
  show_fill: boolean;
  fill_transp: number;
  /** Alert switches of the original (no output) */
  alert_Slope_Bull: boolean;
  alert_Slope_Bear: boolean;
  alert_Cross_Bull: boolean;
  alert_Cross_Bear: boolean;
}

export const defaultInputs: CmUltimateMaMtfV4Inputs = {
  res1: '',
  fast_ma_len: 20,
  src1: 'close',
  fast_ma_off: 0,
  fast_ma_source: 'SMA',
  fast_factorT3: 0.7,
  show_slow_ma: false,
  res2: '',
  slow_ma_len: 50,
  src2: 'close',
  slow_ma_off: 0,
  slow_ma_source: 'SMA',
  slow_factorT3: 0.7,
  fast_ma_col: '#2962FF',
  slow_ma_col: '#FF6D00',
  fast_ma_wid: 3,
  slow_ma_wid: 3,
  show_fast_ma_cc: false,
  fast_ma_smooth: 2,
  bullish_col: '#4CAF50',
  bearish_col: '#FF5252',
  show_fast_ma_tr: false,
  show_fill: true,
  fill_transp: 50,
  alert_Slope_Bull: false,
  alert_Slope_Bear: false,
  alert_Cross_Bull: false,
  alert_Cross_Bear: false,
};

const MA_TYPES: MaType[] = ['SMA', 'EMA', 'WMA', 'Hull MA', 'VWMA', 'RMA', 'TEMA', 'TIL T3'];
const G_FAST = 'Fast MA';
const G_SLOW = 'Slow MA';
const G_PLOT = 'Plot Settings';
const G_ALERT = 'Alerts';
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'res1', type: 'timeframe', title: 'Fast MA TimeFrame', defval: d.res1, group: G_FAST },
  { id: 'fast_ma_len', type: 'int', title: 'Fast MA Length', defval: d.fast_ma_len, min: 1, max: 999, group: G_FAST },
  { id: 'src1', type: 'source', title: 'Fast MA Source', defval: d.src1, group: G_FAST },
  { id: 'fast_ma_off', type: 'int', title: 'Fast MA Offset', defval: d.fast_ma_off, min: -200, max: 200, group: G_FAST },
  { id: 'fast_ma_source', type: 'string', title: 'Fast MA Type', defval: d.fast_ma_source, options: MA_TYPES, group: G_FAST },
  {
    id: 'fast_factorT3', type: 'float', title: 'Fast MA Tilson T3 Factor', defval: d.fast_factorT3, min: 0, max: 99,
    step: 0.1, tooltip: 'Default = .7', group: G_FAST,
  },
  { id: 'show_slow_ma', type: 'bool', title: 'Show Slow MA?', defval: d.show_slow_ma, group: G_SLOW },
  { id: 'res2', type: 'timeframe', title: 'Slow MA TimeFrame', defval: d.res2, group: G_SLOW },
  { id: 'slow_ma_len', type: 'int', title: 'Slow MA Length', defval: d.slow_ma_len, min: 1, max: 999, group: G_SLOW },
  { id: 'src2', type: 'source', title: 'Slow MA Source', defval: d.src2, group: G_SLOW },
  { id: 'slow_ma_off', type: 'int', title: 'Slow MA Offset', defval: d.slow_ma_off, min: -200, max: 200, group: G_SLOW },
  { id: 'slow_ma_source', type: 'string', title: 'Slow MA Type', defval: d.slow_ma_source, options: MA_TYPES, group: G_SLOW },
  {
    id: 'slow_factorT3', type: 'float', title: 'Slow MA Tilson T3 Factor', defval: d.slow_factorT3, min: 0, max: 99,
    step: 0.1, tooltip: 'Default = .7', group: G_SLOW,
  },
  { id: 'fast_ma_col', type: 'color', title: 'Fast MA  ', defval: d.fast_ma_col, group: G_PLOT, inline: 'P10' },
  { id: 'slow_ma_col', type: 'color', title: 'Slow MA  ', defval: d.slow_ma_col, group: G_PLOT, inline: 'P10' },
  { id: 'fast_ma_wid', type: 'int', title: 'Fast MA Width', defval: d.fast_ma_wid, min: 0, max: 5, group: G_PLOT },
  { id: 'slow_ma_wid', type: 'int', title: 'Slow MA Width', defval: d.slow_ma_wid, min: 0, max: 5, group: G_PLOT },
  { id: 'show_fast_ma_cc', type: 'bool', title: 'Change Fast MA Color Based On Slope?', defval: d.show_fast_ma_cc, group: G_PLOT },
  {
    id: 'fast_ma_smooth', type: 'int', title: 'Color Smoothing', defval: d.fast_ma_smooth, min: 1, max: 20,
    tooltip: 'Setting 1 = No Smoothing', group: G_PLOT,
  },
  { id: 'bullish_col', type: 'color', title: 'Bull Col  ', defval: d.bullish_col, group: G_PLOT, inline: 'P40' },
  { id: 'bearish_col', type: 'color', title: 'Bear Col  ', defval: d.bearish_col, group: G_PLOT, inline: 'P40' },
  { id: 'show_fast_ma_tr', type: 'bool', title: 'Change Fast MA Color Above/Below Slow MA?', defval: d.show_fast_ma_tr, group: G_PLOT },
  { id: 'show_fill', type: 'bool', title: 'Show Fill?', defval: d.show_fill, group: G_PLOT, inline: 'P50' },
  { id: 'fill_transp', type: 'int', title: 'Transparency', defval: d.fill_transp, min: 0, max: 100, group: G_PLOT, inline: 'P60' },
  { id: 'alert_Slope_Bull', type: 'bool', title: 'Fast MA Slope Bull', defval: d.alert_Slope_Bull, group: G_ALERT, inline: 'Alert10' },
  { id: 'alert_Slope_Bear', type: 'bool', title: 'Fast MA Slope Bear', defval: d.alert_Slope_Bear, group: G_ALERT, inline: 'Alert10' },
  { id: 'alert_Cross_Bull', type: 'bool', title: 'Fast MA Cross Bull', defval: d.alert_Cross_Bull, group: G_ALERT, inline: 'Alert20' },
  { id: 'alert_Cross_Bear', type: 'bool', title: 'Fast MA Cross Bear', defval: d.alert_Cross_Bear, group: G_ALERT, inline: 'Alert20' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Fast MA', color: '#2962FF', lineWidth: 3 },
  { id: 'plot1', title: 'Slow MA', color: '#FF6D00', lineWidth: 3 },
  // editable = false copies that carry the fill
  { id: 'plot2', title: 'Fast MA', color: '#2962FF', lineWidth: 3 },
  { id: 'plot3', title: 'Slow MA', color: '#FF6D00', lineWidth: 3 },
];

export const metadata = {
  title: '_CM_Ultimate_MA_MTF_V4',
  shortTitle: '_CM_Ult_MA_MTF_V4',
  overlay: true,
};

/** Pine float comparisons: a >= b when a - b >= -1e-10, a < b when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !Number.isNaN(v) && v !== 0;

/**
 * request.security(syminfo.tickerid, tf, expr) without lookahead: computes `expr` on the bars of timeframe `tf`
 * built from the chart bars and gives each chart bar the value of the latest completed bar of the timeframe.
 */
function security(bars: Bar[], tf: string, context: ChartContext | undefined, expr: (b: Bar[]) => number[]): number[] {
  const chartTf = chartTimeframe(bars, context);
  if (tf.trim() === '' || chartTf === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chartTf)) return expr(bars);
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chartTf)) {
    throw new Error(`_CM_Ultimate_MA_MTF_V4: the timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the chart bars do not have that data`);
  }
  const { htf, group, latest } = higherTimeframeBars(bars, tf, context);
  return mapToChart(expr(htf), group, latest, false, false);
}

/** The moving average of the original on one set of bars */
function movingAverage(b: Bar[], source: MaSource, type: MaType, len: number, factor: number): number[] {
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(b, a);
  const volume = b.map((x) => x.volume ?? NaN);
  const src = source === 'volume' ? S(volume) : getSourceSeries(b, source);
  const ema = (x: Series) => ta.ema(x, len);
  // gd(src, len, factor) = ema(src, len) * (1 + factor) - ema(ema(src, len), len) * factor; t3 = gd(gd(gd(src)))
  const gd = (x: Series): Series => {
    const e = ema(x);
    const a = A(e);
    const c = A(ema(e));
    return S(a.map((v, i) => v * (1 + factor) - c[i] * factor));
  };
  switch (type) {
    case 'SMA': return A(ta.sma(src, len));
    case 'EMA': return A(ema(src));
    case 'WMA': return A(ta.wma(src, len));
    case 'Hull MA': {
      // hullma = wma(2 * wma(src, len / 2) - wma(src, len), round(sqrt(len)))
      const half = A(ta.wma(src, len / 2));
      const full = A(ta.wma(src, len));
      return A(ta.wma(S(half.map((v, i) => 2 * v - full[i])), Math.round(Math.sqrt(len))));
    }
    case 'VWMA': return A(ta.vwma(src, len, S(volume)));
    case 'RMA': return A(ta.rma(src, len));
    case 'TEMA': {
      const ema1 = ema(src);
      const ema2 = ema(ema1);
      const e1 = A(ema1);
      const e2 = A(ema2);
      const e3 = A(ema(ema2));
      return e1.map((v, i) => 3 * (v - e2[i]) + e3[i]);
    }
    default: return A(gd(gd(gd(src))));
  }
}

export function calculate(
  bars: Bar[],
  inputs: Partial<CmUltimateMaMtfV4Inputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const interval = barInterval(bars);

  const fastMa = security(bars, cfg.res1, chart, (b) => movingAverage(b, cfg.src1, cfg.fast_ma_source, cfg.fast_ma_len, cfg.fast_factorT3 * 1));
  const slowMa = security(bars, cfg.res2, chart, (b) => movingAverage(b, cfg.src2, cfg.slow_ma_source, cfg.slow_ma_len, cfg.slow_factorT3 * 1));

  const fastCol = String(color.new(cfg.fast_ma_col, 0));
  const slowCol = String(color.new(cfg.slow_ma_col, 0));
  const k = cfg.fast_ma_smooth;
  const colFinal: string[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const f = fastMa[i];
    const fk = i - k >= 0 ? fastMa[i - k] : NaN;
    const up = ge(f, fk);
    const dn = lt(f, fk);
    const ccCol = cfg.show_fast_ma_cc && up ? cfg.bullish_col : cfg.show_fast_ma_cc && dn ? cfg.bearish_col : fastCol;
    const above = ge(f, slowMa[i]);
    const below = lt(f, slowMa[i]);
    const trCol = cfg.show_fast_ma_tr && above ? cfg.bullish_col : cfg.show_fast_ma_tr && below ? cfg.bearish_col : fastCol;
    colFinal[i] = cfg.show_fast_ma_tr ? trCol : ccCol;
  }

  // plot(..., offset = off): the value of bar i is drawn on bar i + off
  type Point = { time: number; value: number; color: string };
  const series = (off: number, value: (i: number) => number, col: (i: number) => string): Point[] => {
    const out: Point[] = [];
    for (let i = 0; i < n; i++) {
      if (i + off < 0) continue;
      out.push({ time: barTime(bars, i + off, interval), value: value(i), color: col(i) });
    }
    return out;
  };
  const fastColor = (i: number) => String(color.new(colFinal[i], 0));
  const slowColor = () => slowCol;
  const plot0 = series(cfg.fast_ma_off, (i) => fastMa[i], fastColor);
  // plot(show_slow_ma and slow_ma ? slow_ma : na): a value of 0 or na is not drawn
  const plot1 = series(cfg.slow_ma_off, (i) => (cfg.show_slow_ma && truthy(slowMa[i]) ? slowMa[i] : NaN), slowColor);
  const plot2 = series(cfg.fast_ma_off, (i) => (cfg.show_fill && truthy(fastMa[i]) ? fastMa[i] : NaN), fastColor);
  const plot3 = series(
    cfg.slow_ma_off,
    (i) => (cfg.show_fill && cfg.show_slow_ma && truthy(slowMa[i]) ? slowMa[i] : NaN),
    slowColor,
  );

  // fill(p1, p2, color.new(col_Final, fill_transp))
  const fills = [{
    plot1: 'plot2', plot2: 'plot3', options: { title: '1' },
    colors: colFinal.map((c) => String(color.new(c, cfg.fill_transp))),
  }];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    fills,
  };
}

export const CmUltimateMaMtfV4 = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
