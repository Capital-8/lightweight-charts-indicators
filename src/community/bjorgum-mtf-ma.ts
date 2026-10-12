/**
 * Bjorgum MTF MA
 *
 * Up to three moving averages (EMA, EMA of the Heikin-Ashi open, SMA, HMA, WMA, DEMA, VWMA, VWAP, T3 or the Ehlers
 * instantaneous trendline), each on the chart timeframe or on a higher timeframe of the same symbol. A line has the
 * bull colour while the average rises (or, with the colour type "RSI", a gradient of the RSI between 30 and 70).
 * Bars are coloured from the close against one of the averages, or from one of the RSI gradients. A length of 0
 * hides the second or the third average.
 *
 * Higher timeframe: the bars of that timeframe are built from the chart bars, so its averages start at the first
 * chart bar. A chart bar shows the value of the latest completed bar of the timeframe as it was known one chart bar
 * before (no repainting). With "Smooth" the value is only given on the chart bar after the one that completes a bar
 * of the timeframe, and the line joins these points; without it the value is repeated on every bar (steps). A
 * timeframe below the chart timeframe needs data that the bars do not carry: the port throws an Error. Every bar is
 * taken as a historical bar.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar, see src/anchor-period.ts;
 * without them the port uses the UTC calendar and the bars. The type "VWAP" restarts on each trading day: on
 * intraday bars it needs the time zone and the session of the context and throws an Error without them; on daily
 * and higher bars it is the typical price of the bar.
 *
 * The line widths are inputs in the original; the plots here have the default width of 1.
 *
 * Reference: "Bjorgum MTF MA" by Bjorgum
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, getSourceSeries, color, timeframe, mapToChart, heikinAshi,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType,
} from 'oakscriptjs';
import type { BarColorData } from '../types';
import { periodStarts, chartTimeframe, higherTimeframeBars, hasCalendar } from '../anchor-period';
import type { ChartContext } from '../chart-context';

type MaType = 'EMA' | 'HEMA' | 'SMA' | 'HMA' | 'WMA' | 'DEMA' | 'VWMA' | 'VWAP' | 'T3' | 'IT';
type ColType = 'RSI' | 'MA';

export interface BjorgumMtfMaInputs {
  /** Higher timeframe values as points joined by the line (true) or as steps (false) */
  smooth: boolean;
  /** Colour the bars */
  bar: boolean;
  /** What the bar colour is based on */
  bartype: 'MA 1' | 'MA 2' | 'MA 3' | 'RSI 1' | 'RSI 2' | 'RSI 3';
  maType1: MaType;
  maType2: MaType;
  maType3: MaType;
  maLength1: number;
  /** 0 disables the second average */
  maLength2: number;
  /** 0 disables the third average */
  maLength3: number;
  /** Source of the instantaneous trendline (type "IT") */
  inp: SourceType;
  /** Alpha of the instantaneous trendline */
  alpha: number;
  /** Timeframe of each average ("" = the chart timeframe) */
  tf1: string;
  tf2: string;
  tf3: string;
  rsiLen: number;
  colType1: ColType;
  colType2: ColType;
  colType3: ColType;
  maBull1: string;
  maBear1: string;
  maBull2: string;
  maBear2: string;
  maBull3: string;
  maBear3: string;
  /** Line transparency (0 to 100) */
  transp1: number;
  transp2: number;
  transp3: number;
  /** Line widths (not applied: the plot width is static) */
  lineW1: number;
  lineW2: number;
  lineW3: number;
  rsiBull1: string;
  rsiBear1: string;
  rsiBull2: string;
  rsiBear2: string;
  rsiBull3: string;
  rsiBear3: string;
}

export const defaultInputs: BjorgumMtfMaInputs = {
  smooth: true,
  bar: true,
  bartype: 'MA 1',
  maType1: 'EMA',
  maType2: 'EMA',
  maType3: 'EMA',
  maLength1: 50,
  maLength2: 0,
  maLength3: 0,
  inp: 'hl2',
  alpha: 0.07,
  tf1: '',
  tf2: '',
  tf3: '',
  rsiLen: 14,
  colType1: 'MA',
  colType2: 'MA',
  colType3: 'MA',
  maBull1: '#64b5f6',
  maBear1: '#ef5350',
  maBull2: '#64b5f6',
  maBear2: '#ef5350',
  maBull3: '#64b5f6',
  maBear3: '#ef5350',
  transp1: 0,
  transp2: 0,
  transp3: 0,
  lineW1: 1,
  lineW2: 1,
  lineW3: 1,
  rsiBull1: '#0000ff',
  rsiBear1: '#ff0000',
  rsiBull2: '#0000ff',
  rsiBear2: '#ff0000',
  rsiBull3: '#0000ff',
  rsiBear3: '#ff0000',
};

const MA_TYPES: MaType[] = ['EMA', 'HEMA', 'SMA', 'HMA', 'WMA', 'DEMA', 'VWMA', 'VWAP', 'T3', 'IT'];
const G_GENERAL = 'General Settings';
const G_TYPE = 'MA Type';
const G_MA = 'MA Settings';
const G_IT = 'IT Trendline';
const G_RES = 'Resolution';
const G_MOM = 'Momentum';
const G_COLTYPE = 'MA Color Type';
const G_COL = 'MA Color/ Transp/ Linewidth';
const G_RSI = 'RSI Based Colors - Bull/ Bear';
const TIP_ZERO = "Setting to zero disables the MA. Use 1,2 or 3 MA's";
const TIP_TF = 'Go multi-time frame with each MA individually! This effects which time frame the RSI color is based from aswell';
const TIP_COLTYPE = 'Choose color scheme. One is based on RSI value, the other a rising or falling MA';
const TIP_MACOL = "These select MA color if you've chosen rising/ falling scheme";
const TIP_RSICOL = "These select MA color if you've chosen momentum based scheme";
const d = defaultInputs;

export const inputConfig: InputConfig[] = [
  { id: 'smooth', type: 'bool', title: 'Smooth', defval: d.smooth, group: G_GENERAL },
  { id: 'bar', type: 'bool', title: 'Bar Color', defval: d.bar, group: G_GENERAL },
  {
    id: 'bartype', type: 'string', title: 'Bar Color Type', defval: d.bartype, group: G_GENERAL,
    options: ['MA 1', 'MA 2', 'MA 3', 'RSI 1', 'RSI 2', 'RSI 3'], tooltip: 'This selects what your bar color is based on',
  },
  { id: 'maType1', type: 'string', title: 'MA Type #1', defval: d.maType1, group: G_TYPE, options: MA_TYPES },
  { id: 'maType2', type: 'string', title: 'MA Type #2', defval: d.maType2, group: G_TYPE, options: MA_TYPES },
  { id: 'maType3', type: 'string', title: 'MA Type #3', defval: d.maType3, group: G_TYPE, options: MA_TYPES },
  { id: 'maLength1', type: 'int', title: 'MA Length #1', defval: d.maLength1, group: G_MA, min: 1 },
  { id: 'maLength2', type: 'int', title: 'MA Length #2', defval: d.maLength2, group: G_MA, tooltip: TIP_ZERO },
  { id: 'maLength3', type: 'int', title: 'MA Length #3', defval: d.maLength3, group: G_MA, tooltip: TIP_ZERO },
  {
    id: 'inp', type: 'source', title: 'Source', defval: d.inp, group: G_IT,
    tooltip: 'These two are inputs strcity pertaining to Ehlers Instantaneous Trendline (IT)',
  },
  { id: 'alpha', type: 'float', title: 'Alpha', defval: d.alpha, group: G_IT, min: 0.01 },
  { id: 'tf1', type: 'timeframe', title: 'Timeframe 1', defval: d.tf1, group: G_RES, tooltip: TIP_TF },
  { id: 'tf2', type: 'timeframe', title: 'Timeframe 2', defval: d.tf2, group: G_RES, tooltip: TIP_TF },
  { id: 'tf3', type: 'timeframe', title: 'Timeframe 3', defval: d.tf3, group: G_RES, tooltip: TIP_TF },
  {
    id: 'rsiLen', type: 'int', title: 'RSI Length', defval: d.rsiLen, group: G_MOM,
    tooltip: 'RSI input is used for momrntum color schemes. Gievs a visual of momentum along with your trend',
  },
  { id: 'colType1', type: 'string', title: 'Color Type 1', defval: d.colType1, group: G_COLTYPE, options: ['RSI', 'MA'], tooltip: TIP_COLTYPE },
  { id: 'colType2', type: 'string', title: 'Color Type 2', defval: d.colType2, group: G_COLTYPE, options: ['RSI', 'MA'], tooltip: TIP_COLTYPE },
  { id: 'colType3', type: 'string', title: 'Color Type 3', defval: d.colType3, group: G_COLTYPE, options: ['RSI', 'MA'], tooltip: TIP_COLTYPE },
  { id: 'maBull1', type: 'color', title: '', defval: d.maBull1, group: G_COL, inline: '1', tooltip: TIP_MACOL },
  { id: 'maBear1', type: 'color', title: '', defval: d.maBear1, group: G_COL, inline: '1', tooltip: TIP_MACOL },
  { id: 'maBull2', type: 'color', title: '', defval: d.maBull2, group: G_COL, inline: '2', tooltip: TIP_MACOL },
  { id: 'maBear2', type: 'color', title: '', defval: d.maBear2, group: G_COL, inline: '2', tooltip: TIP_MACOL },
  { id: 'maBull3', type: 'color', title: '', defval: d.maBull3, group: G_COL, inline: '3', tooltip: TIP_MACOL },
  { id: 'maBear3', type: 'color', title: '', defval: d.maBear3, group: G_COL, inline: '3', tooltip: TIP_MACOL },
  { id: 'transp1', type: 'int', title: '', defval: d.transp1, group: G_COL, inline: '1' },
  { id: 'transp2', type: 'int', title: '', defval: d.transp2, group: G_COL, inline: '2' },
  { id: 'transp3', type: 'int', title: '', defval: d.transp3, group: G_COL, inline: '3' },
  { id: 'lineW1', type: 'int', title: '', defval: d.lineW1, group: G_COL, inline: '1' },
  { id: 'lineW2', type: 'int', title: '', defval: d.lineW2, group: G_COL, inline: '2' },
  { id: 'lineW3', type: 'int', title: '', defval: d.lineW3, group: G_COL, inline: '3' },
  { id: 'rsiBull1', type: 'color', title: '', defval: d.rsiBull1, group: G_RSI, inline: 'a', tooltip: TIP_RSICOL },
  { id: 'rsiBear1', type: 'color', title: '', defval: d.rsiBear1, group: G_RSI, inline: 'a', tooltip: TIP_RSICOL },
  { id: 'rsiBull2', type: 'color', title: '', defval: d.rsiBull2, group: G_RSI, inline: 'b', tooltip: TIP_RSICOL },
  { id: 'rsiBear2', type: 'color', title: '', defval: d.rsiBear2, group: G_RSI, inline: 'b', tooltip: TIP_RSICOL },
  { id: 'rsiBull3', type: 'color', title: '', defval: d.rsiBull3, group: G_RSI, inline: 'c', tooltip: TIP_RSICOL },
  { id: 'rsiBear3', type: 'color', title: '', defval: d.rsiBear3, group: G_RSI, inline: 'c', tooltip: TIP_RSICOL },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Moving Average #1', color: '#2196F3', lineWidth: 1 },
  { id: 'plot1', title: 'Moving Average #2', color: '#2196F3', lineWidth: 1 },
  { id: 'plot2', title: 'Moving Average #3', color: '#2196F3', lineWidth: 1 },
];

export const metadata = {
  title: 'Bjorgum MTF MA',
  shortTitle: 'Bj Multi-MA',
  overlay: true,
};

/** Pine float comparison: a >= b when a - b >= -1e-10 (na compares false) */
const EPS = 1e-10;
const ge = (a: number, b: number) => a - b >= -EPS;
const nz = (v: number) => (Number.isNaN(v) ? 0 : v);

/** The bars of a timeframe, with their place on the chart bars */
interface TimeframeBars {
  /** Bars of the timeframe built from the chart bars (the chart bars themselves for the chart timeframe) */
  htf: Bar[];
  /** Index of the bar of the timeframe of each chart bar */
  group: number[];
  /** Index of the first chart bar of each bar of the timeframe */
  first: number[];
  /** For each chart bar, the index of the latest completed bar of the timeframe (-1: none yet) */
  latest: number[];
}

/**
 * security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart bars, and
 * for each chart bar the index of the latest completed bar of that timeframe.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): TimeframeBars {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    const own = bars.map((_b, i) => i);
    return { htf: bars, group: own, first: own, latest: own };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`Bjorgum MTF MA: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  return higherTimeframeBars(bars, tf, context);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BjorgumMtfMaInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const alpha = cfg.alpha;
  const chartTf = chartTimeframe(bars, chart);
  // start of the trading day of each chart bar (only read by the type "VWAP")
  let dayStarts: number[] | null = null;

  /** The series of the script on the bars of one timeframe */
  const seriesOf = (ctx: TimeframeBars, tf: string) => {
    const b = ctx.htf;
    const m = b.length;
    const S = (a: number[]) => Series.fromArray(b, a);
    const close = S(b.map((x) => x.close));
    const volume = b.map((x) => x.volume ?? NaN);

    // _haOpen(): haOpen := na(haOpen[1]) ? (open + close) / 2 : (nz(haOpen[1]) + nz(haClose[1])) / 2, the open of
    // the Heikin Ashi bars
    const haOpen = heikinAshi(b).map((x) => x.open);

    // _itrend(): Ehlers instantaneous trendline of the source input
    const inp = A(getSourceSeries(b, cfg.inp as Parameters<typeof getSourceSeries>[1]));
    const itrend: number[] = new Array(m);
    for (let i = 0; i < m; i++) {
      const s0 = inp[i];
      const s1 = i > 0 ? nz(inp[i - 1]) : 0;
      const s2 = i > 1 ? nz(inp[i - 2]) : 0;
      const t1 = i > 0 ? nz(itrend[i - 1]) : 0;
      const t2 = i > 1 ? nz(itrend[i - 2]) : 0;
      itrend[i] = i < 7
        ? (s0 + 2 * s1 + s2) / 4
        : (alpha - (alpha ** 2) / 4) * s0 + 0.5 * (alpha ** 2) * s1 - (alpha - 0.75 * (alpha ** 2)) * s2
          + 2 * (1 - alpha) * t1 - ((1 - alpha) ** 2) * t2;
    }

    const vwap = (): number[] => {
      const hlc3 = b.map((x) => (x.high + x.low + x.close) / 3);
      const own = tf.trim() === '' ? chartTf : tf;
      // Daily and higher bars: a new anchor on every bar, so the typical price of the bar (0 / 0 = na without volume)
      if (own !== '' && timeframe.in_seconds(own) >= 86400) return hlc3.map((v, i) => (v * volume[i]) / volume[i]);
      // Intraday bars: the sums restart on each trading day of the exchange (time zone and session of the context)
      if (!hasCalendar(chart)) {
        throw new Error(
          'Bjorgum MTF MA: the type "VWAP" on an intraday timeframe restarts on each trading day, which needs the '
          + 'exchange time zone and session (chart context)',
        );
      }
      dayStarts ??= periodStarts(bars, 'D', chart);
      const days = dayStarts;
      const newDay = b.map((_x, i) => (i === 0 || days[ctx.first[i]] !== days[ctx.first[i - 1]] ? 1 : 0));
      return A(ta.vwap(S(hlc3), S(volume), S(newDay)));
    };

    // getMA(type, length)
    const getMA = (type: MaType, length: number): number[] => {
      const e = (src: Series) => ta.ema(src, length);
      switch (type) {
        case 'HEMA': return A(e(S(haOpen)));
        case 'SMA': return A(ta.sma(close, length));
        case 'HMA': return A(ta.hma(close, length));
        case 'WMA': return A(ta.wma(close, length));
        case 'VWMA': return A(ta.vwma(close, length, S(volume)));
        case 'VWAP': return vwap();
        case 'DEMA': {
          const e1 = e(close);
          const e2 = A(e(e1));
          return A(e1).map((v, i) => 2 * v - e2[i]);
        }
        case 'T3': {
          const axe1 = e(close);
          const axe2 = e(axe1);
          const axe3 = e(axe2);
          const axe4 = e(axe3);
          const axe5 = e(axe4);
          const axe6 = A(e(axe5));
          const a3 = A(axe3);
          const a4 = A(axe4);
          const a5 = A(axe5);
          const ab = 0.7;
          const ac1 = -ab * ab * ab;
          const ac2 = 3 * ab * ab + 3 * ab * ab * ab;
          const ac3 = -6 * ab * ab - 3 * ab - 3 * ab * ab * ab;
          const ac4 = 1 + 3 * ab + ab * ab * ab + 3 * ab * ab;
          return axe6.map((v, i) => ac1 * v + ac2 * a5[i] + ac3 * a4[i] + ac4 * a3[i]);
        }
        case 'IT': return itrend;
        default: return A(e(close));
      }
    };
    return { getMA, rsi: A(ta.rsi(close, cfg.rsiLen)) };
  };

  const contexts = new Map<string, { ctx: TimeframeBars; series: ReturnType<typeof seriesOf> }>();
  const contextOf = (tf: string) => {
    let c = contexts.get(tf);
    if (!c) {
      const ctx = timeframeBars(bars, tf, chart);
      c = { ctx, series: seriesOf(ctx, tf) };
      contexts.set(tf, c);
    }
    return c;
  };

  /** One average: the plotted value, its direction, its RSI and the bar condition, on the chart bars */
  const slot = (type: MaType, lengthInput: number, tf: string) => {
    const { ctx, series } = contextOf(tf);
    const ma = series.getMA(type, lengthInput === 0 ? 1 : lengthInput);
    // maDirec = ma >= ma[1], a bool that can be na (1 / 0 / NaN)
    const direc = ma.map((v, i) => (i > 0 && ge(v, ma[i - 1]) ? 1 : 0));
    const closeOf = (i: number) => bars[i].close;
    if (tf === '') {
      return {
        plot: ma, con: direc.map((v) => v === 1), rsi: series.rsi, sig: ma,
        bar: ma.map((v, i) => ge(closeOf(i), v)),
      };
    }
    const { group, latest } = ctx;
    // _NRPrt: security(tf, src, gaps_off)[1]; _NRP: security(tf, src, gaps_on)[1]
    const security = (values: number[], gapsOn: boolean) => {
      const onChart = mapToChart(values, group, latest, false, gapsOn);
      return onChart.map((_v, i) => (i > 0 ? onChart[i - 1] : NaN));
    };
    const step = (values: number[]) => security(values, false);
    const gaps = (values: number[]) => security(values, true);
    const maStep = step(ma);
    return {
      plot: cfg.smooth ? gaps(ma) : maStep,
      con: step(direc).map((v) => v === 1),
      rsi: step(series.rsi),
      sig: maStep,
      bar: maStep.map((v, i) => ge(closeOf(i), v)),
    };
  };

  const s1 = slot(cfg.maType1, cfg.maLength1, cfg.tf1);
  const s2 = slot(cfg.maType2, cfg.maLength2, cfg.tf2);
  const s3 = slot(cfg.maType3, cfg.maLength3, cfg.tf3);

  const grad = (rsi: number, bear: string, bull: string) => color.from_gradient(rsi, 30, 70, bear, bull);
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    const rsi1col = grad(s1.rsi[i], cfg.rsiBear1, cfg.rsiBull1);
    const rsi2col = grad(s2.rsi[i], cfg.rsiBear2, cfg.rsiBull2);
    const rsi3col = grad(s3.rsi[i], cfg.rsiBear3, cfg.rsiBull3);
    const ma1Col = cfg.colType1 === 'MA' ? (s1.con[i] ? cfg.maBull1 : cfg.maBear1) : rsi1col;
    const ma2Col = cfg.colType2 === 'MA' ? (s2.con[i] ? cfg.maBull2 : cfg.maBear2) : rsi2col;
    const ma3Col = cfg.colType3 === 'MA' ? (s3.con[i] ? cfg.maBull3 : cfg.maBear3) : rsi3col;

    // plotMA2 = maType2 == "IT" ? plotMa2 : maLength2 == 0 ? na : plotMa2
    const v2 = cfg.maType2 === 'IT' || cfg.maLength2 !== 0 ? s2.plot[i] : NaN;
    const v3 = cfg.maType3 === 'IT' || cfg.maLength3 !== 0 ? s3.plot[i] : NaN;
    plot0.push({ time, value: s1.plot[i], color: String(color.new(ma1Col, cfg.transp1)) });
    plot1.push({ time, value: v2, color: String(color.new(ma2Col, cfg.transp2)) });
    plot2.push({ time, value: v3, color: String(color.new(ma3Col, cfg.transp3)) });

    if (cfg.bar) {
      // the gradient of an na RSI is na: the bar keeps its colour
      let barColor: string | null = null;
      switch (cfg.bartype) {
        case 'MA 1': barColor = s1.bar[i] ? cfg.maBull1 : cfg.maBear1; break;
        case 'MA 2': barColor = s2.bar[i] ? cfg.maBull2 : cfg.maBear2; break;
        case 'MA 3': barColor = s3.bar[i] ? cfg.maBull3 : cfg.maBear3; break;
        case 'RSI 1': barColor = Number.isNaN(s1.rsi[i]) ? null : rsi1col; break;
        case 'RSI 2': barColor = Number.isNaN(s2.rsi[i]) ? null : rsi2col; break;
        case 'RSI 3': barColor = Number.isNaN(s3.rsi[i]) ? null : rsi3col; break;
        default: barColor = null;
      }
      if (barColor !== null) barColors.push({ time, color: barColor });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    barColors,
  };
}

export const BjorgumMtfMa = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
