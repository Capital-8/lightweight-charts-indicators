/**
 * Trendline Breakout Navigator [LuxAlgo]
 *
 * Trendlines of three swing lengths (long, medium, short). A swing high / low is a pivot with "length" bars on its
 * left and one bar on its right; its price is the highest high / lowest low of the last bars. A higher high after a
 * bearish or neutral state starts a bullish trendline at the previous swing low; a lower low starts a bearish
 * trendline at the previous swing high. The line starts flat. A later swing on the side of the line (a higher low
 * for a bullish line) gives it its slope: the line goes through that swing, and its start moves to the bar whose
 * close is the farthest through the line until no close is through it. Later swings between the line and its
 * previous slope tilt the line again; a dot marks where the wick of such a swing crosses the line. The line is
 * extended by its slope on every bar and stops when a close crosses it (it stays on the chart), or when it is 5000
 * bars long (it is removed). Options: HH / LL labels of one term, a background colour (close above / below the line
 * of the term) and bar colours (close against the three lines). At most 500 lines and 500 labels are kept.
 *
 * Timeframe: the swings of a higher timeframe come from bars built from the chart bars with the calendar rule
 * of the period helper (see anchor-period.ts for its limits); a swing appears on the chart bar that completes its
 * bar of that timeframe (every bar is a closed bar). A timeframe below the chart timeframe needs data that the
 * chart bars do not have: the port throws an Error.
 *
 * Chart values (third argument): the port reads the chart foreground colour for the HH / LL labels (without it:
 * #DBDBDB, a dark chart).
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Trendline Breakout Navigator [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, color, timeframe, line, label, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line,
} from 'oakscriptjs';
import type { BarColorData, BgColorData, LabelData, LineDrawingData } from '../types';
import { foregroundColorOf, type ChartContext } from '../chart-context';
import { chartTimeframe, higherTimeframeBars } from '../anchor-period';

export interface TrendlineBreakoutNavigatorInputs {
  /** Timeframe of the swings ('' = chart timeframe) */
  res: string;
  i1: boolean;
  i2: boolean;
  i3: boolean;
  l1: number;
  l2: number;
  l3: number;
  cBull: string;
  cBear: string;
  cWickBull: string;
  cWickBear: string;
  term: 'Long' | 'Medium' | 'Short';
  hhll: 'None' | 'Only HH/LL' | 'HH/LL & previous H/L';
  bg: boolean;
  cc: boolean;
}

export const defaultInputs: TrendlineBreakoutNavigatorInputs = {
  res: '',
  i1: true,
  i2: true,
  i3: true,
  l1: 60,
  l2: 30,
  l3: 10,
  cBull: '#089981',
  cBear: '#F23645',
  cWickBull: '#085DEF',
  cWickBear: '#FF5D00',
  term: 'Long',
  hhll: 'None',
  bg: false,
  cc: false,
};

const SP = ' '.repeat(9);

export const inputConfig: InputConfig[] = [
  { id: 'res', type: 'timeframe', title: `Period${' '.repeat(8)}`, defval: '' },
  { id: 'i1', type: 'bool', title: '', defval: true, inline: '1', group: 'Swing Length' },
  { id: 'i2', type: 'bool', title: '', defval: true, inline: '2', group: 'Swing Length' },
  { id: 'i3', type: 'bool', title: '', defval: true, inline: '3', group: 'Swing Length' },
  { id: 'l1', type: 'int', title: `Long${' '.repeat(5)}`, defval: 60, min: 1, inline: '1', group: 'Swing Length' },
  { id: 'l2', type: 'int', title: 'Medium', defval: 30, min: 1, inline: '2', group: 'Swing Length' },
  { id: 'l3', type: 'int', title: `Short${' '.repeat(4)}`, defval: 10, min: 1, inline: '3', group: 'Swing Length' },
  { id: 'cBull', type: 'color', title: `Trendline${SP}`, defval: '#089981', inline: 'd', group: 'Style' },
  { id: 'cBear', type: 'color', title: '', defval: '#F23645', inline: 'd', group: 'Style', tooltip: 'Bullish/Bearish Trendline' },
  { id: 'cWickBull', type: 'color', title: `Wick Dot${SP}`, defval: '#085DEF', inline: 'w', group: 'Style' },
  { id: 'cWickBear', type: 'color', title: '', defval: '#FF5D00', inline: 'w', group: 'Style', tooltip: 'Bullish/Bearish Wick' },
  { id: 'term', type: 'string', title: 'Term', defval: 'Long', options: ['Long', 'Medium', 'Short'] },
  { id: 'hhll', type: 'string', title: 'HH/LL', defval: 'None', options: ['None', 'Only HH/LL', 'HH/LL & previous H/L'] },
  { id: 'bg', type: 'bool', title: 'Background Color', defval: false },
  { id: 'cc', type: 'bool', title: 'Bar Color', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Long Trendline', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot1', title: 'Medium Trendline', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot2', title: 'Short Trendline', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot3', title: 'Long Trend', color: '#2962FF', lineWidth: 1, display: 'none' },
];

export const metadata = {
  title: 'Trendline Breakout Navigator [LuxAlgo]',
  shortTitle: 'LuxAlgo - Trendline Breakout Navigator',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** Longest look-back of the script (max_bars_back = 5000) */
const MAX_BACK = 5000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

/** type bin */
interface Bin {
  lin: Line | null;
  slope: number;
  active: boolean;
  cp: { index: number; price: number } | null;
}
// Line getters (library lines): na for no line and for a deleted line
const x1Of = (l: Line | null) => (l ? line.get_x1(l) : NaN);
const y1Of = (l: Line | null) => (l ? line.get_y1(l) : NaN);
const x2Of = (l: Line | null) => (l ? line.get_x2(l) : NaN);
const y2Of = (l: Line | null) => (l ? line.get_y2(l) : NaN);
const setXY1 = (l: Line | null, x: number, y: number) => {
  if (l) line.set_xy1(l, x, y);
};
const setXY2 = (l: Line | null, x: number, y: number) => {
  if (l) line.set_xy2(l, x, y);
};

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars (their time is the start of the period), and for each chart bar the index of the latest completed bar of
 * that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // The periods and the bars that complete them: the exchange calendar of the chart context (time zone and
  // session), else the UTC calendar rule; grouped and completed by the library (see anchor-period.ts)
  return higherTimeframeBars(bars, tf, context);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendlineBreakoutNavigatorInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; barColors: BarColorData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  // chart.fg_color
  const CHART_FG = foregroundColorOf(chart);
  const n = bars.length;
  const { cBull, cBear } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ps = cfg.term === 'Long' ? 1 : cfg.term === 'Medium' ? 2 : 3;

  // The lines and labels go through the drawing registry of the library (max_lines_count, max_labels_count)
  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS });
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, pos: number): Line =>
    line.new(x1, y1, x2, y2, 'bar_index', undefined, css, pos === 1 ? 'solid' : pos === 2 ? 'dashed' : 'dotted', pos === 1 ? 2 : 1);
  /** label.new(x, y, text, color = color(na), textcolor, size, style) */
  const newLabel = (x: number, y: number, text: string, textColor: string, size?: 'tiny', style?: 'label_up' | 'label_center') => {
    label.new(x, y, text, 'bar_index', undefined, NaN, style, textColor, size);
  };

  // The swings of the three lengths: [time[2], pivot] of the timeframe on the chart bars, then
  // ta.change(fixnan(pivot)) of the highs and of the lows
  const { htf, latest } = timeframeBars(bars, cfg.res, chart);
  const highs = Series.fromArray(htf, htf.map((b) => b.high));
  const lows = Series.fromArray(htf, htf.map((b) => b.low));
  const swings = (left: number) => {
    const phH = A(ta.pivothigh(highs, left, 1));
    const plH = A(ta.pivotlow(lows, left, 1));
    const time2 = latest.map((k) => (k >= 2 ? htf[k - 2].time : NaN));
    const change = (pivots: number[]) => {
      let last = NaN;
      return latest.map((k) => {
        const before = last;
        const v = k >= 0 ? pivots[k] : NaN;
        if (!isNaN(v)) last = v;
        return last - before;
      });
    };
    const cH = change(phH);
    const cL = change(plH);
    return {
      time2,
      chH: cH.map((v, i) => ne(v, 0) && eq(cL[i], 0)),
      chL: cL.map((v, i) => ne(v, 0) && eq(cH[i], 0)),
    };
  };

  const makeDraw = (toggle: boolean, left: number, pos: number) => {
    const { time2, chH, chL } = swings(left);
    let trend = 0;
    let prevPh = { index: NaN, price: NaN };
    let prevPl = { index: NaN, price: NaN };
    let bn: Bin = { lin: null, slope: 0, active: false, cp: null };

    // The line is tilted through the swing (x, v): bullish = true for a higher low on a bullish line
    const tilt = (i: number, v: number, idx: number, x: number, c: number, bullish: boolean) => {
      const cp = bn.cp!;
      let slope = (v - cp.price) / (x - cp.index);
      const inside = bullish
        ? gt(v, y1Of(bn.lin) + slope) && (lt(v, y2Of(bn.lin) + slope) || eq(bn.slope, 0))
        : lt(v, y1Of(bn.lin) + slope) && (gt(v, y2Of(bn.lin) + slope) || eq(bn.slope, 0));
      if (!inside) return;
      const priceLin = line.get_price(bn.lin!, i - idx);
      if (bullish ? gt(c, priceLin) : lt(c, priceLin)) {
        // where the wick breaks the last line price
        if (ne(bn.slope, 0)) {
          newLabel(i - idx, priceLin, '●', bullish ? cfg.cWickBull : cfg.cWickBear, undefined, 'label_center');
        }
        setXY2(bn.lin, i, v + slope * idx);
        if (eq(bn.slope, 0)) {
          // First swing after the line conception: repeat until no close is through the line
          let stop = false;
          let guard = 0;
          while (!stop) {
            if (++guard > 100000) throw new Error('Loop takes too long to execute');
            const arr: number[] = [];
            const span = i - x1Of(bn.lin);
            for (let k = 0; k <= span; k++) {
              const lineY = line.get_price(bn.lin!, i - k);
              arr.push(bullish ? lineY - bars[i - k].close : bars[i - k].close - lineY);
            }
            // array.max skips na and infinite values
            let farthest = NaN;
            for (const d of arr) if (Number.isFinite(d) && !(d <= farthest)) farthest = d;
            if (gt(farthest, 0)) {
              const ix = arr.findIndex((d) => Math.abs(d - farthest) <= EPS);
              const nx1 = i - ix;
              const ny1 = bullish ? bars[i - ix].low : bars[i - ix].high;
              cp.index = nx1;
              cp.price = ny1;
              slope = (v - ny1) / (x - nx1);
              setXY2(bn.lin, i, v + slope * idx);
              setXY1(bn.lin, nx1, ny1);
              bn.slope = slope;
            } else {
              setXY2(bn.lin, i, v + slope * idx);
              bn.slope = slope;
              stop = true;
            }
          }
        } else {
          bn.slope = slope;
        }
      } else {
        // the close at the swing breaks the line
        bn.active = false;
      }
    };

    return (i: number): [number, number] => {
      if (!toggle) return [trend, NaN];
      const close = bars[i].close;

      if (bn.active) {
        if (x2Of(bn.lin) - x1Of(bn.lin) > MAX_BACK) {
          bn.active = false;
          if (bn.lin) line.delete(bn.lin);
        } else {
          setXY2(bn.lin, i, y2Of(bn.lin) + bn.slope);
        }
      }

      if (chH[i]) {
        // The highest high back to the first bar before time[2] of the swing
        let v = 0;
        let idx = 0;
        for (let k = 0; k <= MAX_BACK && k <= i; k++) {
          if (gt(bars[i - k].high, v)) {
            v = bars[i - k].high;
            idx = k;
          }
          if (lt(bars[i - k].time, time2[i])) break;
        }
        const x = i - idx;
        const c = bars[i - idx].close;
        if (trend < 1) {
          if (gt(v, prevPh.price) && x - prevPh.index > 5 && i - prevPl.index < MAX_BACK) {
            if (pos === ps && cfg.hhll !== 'None') {
              newLabel(x, v, 'HH\n', CHART_FG, 'tiny');
              if (cfg.hhll === 'HH/LL & previous H/L') {
                newLabel(prevPh.index, prevPh.price, '●', CHART_FG, 'tiny');
              }
            }
            trend = 1;
            bn = {
              lin: newLine(prevPl.index, prevPl.price, i, prevPl.price, cBull, pos), slope: 0, active: true,
              cp: { index: prevPl.index, price: prevPl.price },
            };
          } else if (bn.active) {
            tilt(i, v, idx, x, c, false);
          }
        }
        prevPh = { index: x, price: v };
      } else if (trend < 1) {
        if (gt(close, y2Of(bn.lin))) bn.active = false;
      }

      if (chL[i]) {
        let v = 10e6;
        let idx = 0;
        for (let k = 0; k <= MAX_BACK && k <= i; k++) {
          if (lt(bars[i - k].low, v)) {
            v = bars[i - k].low;
            idx = k;
          }
          if (lt(bars[i - k].time, time2[i])) break;
        }
        const x = i - idx;
        const c = bars[i - idx].close;
        if (trend > -1) {
          if (lt(v, prevPl.price) && x - prevPl.index > 5 && i - prevPh.index < MAX_BACK) {
            if (pos === ps && cfg.hhll !== 'None') {
              newLabel(x, v, '\nLL', CHART_FG, 'tiny', 'label_up');
              if (cfg.hhll === 'HH/LL & previous H/L') {
                newLabel(prevPl.index, prevPl.price, '●', CHART_FG, 'tiny', 'label_up');
              }
            }
            trend = -1;
            bn = {
              lin: newLine(prevPh.index, prevPh.price, i, prevPh.price, cBear, pos), slope: 0, active: true,
              cp: { index: prevPh.index, price: prevPh.price },
            };
          } else if (bn.active) {
            tilt(i, v, idx, x, c, true);
          }
        }
        prevPl = { index: x, price: v };
      } else if (trend > -1) {
        if (lt(close, y2Of(bn.lin))) bn.active = false;
      }

      return [trend, y2Of(bn.lin)];
    };
  };

  const draw1 = makeDraw(cfg.i1, cfg.l1, 1);
  const draw2 = makeDraw(cfg.i2, cfg.l2, 2);
  const draw3 = makeDraw(cfg.i3, cfg.l3, 3);

  const shade = (css: string, transp: number) => String(color.new(css, transp));
  const termOn = cfg.term === 'Long' ? cfg.i1 : cfg.term === 'Medium' ? cfg.i2 : cfg.i3;
  const plot0: Array<{ time: number; value: number }> = [];
  const plot1: typeof plot0 = [];
  const plot2: typeof plot0 = [];
  const plot3: typeof plot0 = [];
  const barColors: BarColorData[] = [];
  const bgColors: BgColorData[] = [];
  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const time = bars[i].time;
    const close = bars[i].close;
    const [trend1, value1] = draw1(i);
    const [, value2] = draw2(i);
    const [, value3] = draw3(i);
    plot0.push({ time, value: value1 });
    plot1.push({ time, value: value2 });
    plot2.push({ time, value: value3 });
    plot3.push({ time, value: trend1 });

    if (cfg.cc) {
      const col = gt(close, value1)
        ? (gt(close, value2) ? shade(cBull, gt(close, value3) ? 20 : 43) : shade(cBull, gt(close, value3) ? 66 : 89))
        : (lt(close, value2) ? shade(cBear, lt(close, value3) ? 20 : 43) : shade(cBear, lt(close, value3) ? 66 : 89));
      barColors.push({ time, color: col });
    }
    if (cfg.bg && termOn) {
      const value = cfg.term === 'Long' ? value1 : cfg.term === 'Medium' ? value2 : value3;
      bgColors.push({ time, color: shade(gt(close, value) ? cBull : cBear, 97) });
    }
  }

  setDrawingBar(null);

  // An object with an na coordinate is not drawn
  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    lines: out.lines ?? [],
    labels: out.labels ?? [],
    barColors,
    bgColors,
  };
}

export const TrendlineBreakoutNavigator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
