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
 * Timeframe: the swings of a higher timeframe come from bars built from the chart bars with the UTC calendar rule
 * of the period helper (see anchor-period.ts for its limits); a swing appears on the chart bar that completes its
 * bar of that timeframe (every bar is a closed bar). A timeframe below the chart timeframe needs data that the
 * chart bars do not have: the port throws an Error.
 *
 * The HH / LL labels use the chart foreground colour. A port has no chart theme: it uses the colour of the
 * reference run (#DBDBDB).
 *
 * Reference: "Trendline Breakout Navigator [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData, LabelData, LineDrawingData } from '../types';
import { barInterval } from '../bar-time';
import { periodStarts, chartTimeframe } from '../anchor-period';

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
/** Chart foreground colour of the reference run (chart.fg_color) */
const CHART_FG = '#DBDBDB';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;

/** A trendline (line.new with bar indices) */
interface Trendline {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  width: number;
  deleted: boolean;
}
/** type bin */
interface Bin {
  lin: Trendline | null;
  slope: number;
  active: boolean;
  cp: { index: number; price: number } | null;
}
interface Mark {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style?: 'label_up' | 'label_center';
  size?: 'tiny';
}

// Line getters: na for no line and for a deleted line
const x1Of = (l: Trendline | null) => (l && !l.deleted ? l.x1 : NaN);
const y1Of = (l: Trendline | null) => (l && !l.deleted ? l.y1 : NaN);
const x2Of = (l: Trendline | null) => (l && !l.deleted ? l.x2 : NaN);
const y2Of = (l: Trendline | null) => (l && !l.deleted ? l.y2 : NaN);
/** line.get_price(x): the price of the line, extended on both sides, at bar x */
const priceAt = (l: Trendline | null, x: number) => (l && !l.deleted ? l.y1 + ((l.y2 - l.y1) / (l.x2 - l.x1)) * (x - l.x1) : NaN);
const setXY1 = (l: Trendline | null, x: number, y: number) => {
  if (l && !l.deleted) {
    l.x1 = x;
    l.y1 = y;
  }
};
const setXY2 = (l: Trendline | null, x: number, y: number) => {
  if (l && !l.deleted) {
    l.x2 = x;
    l.y2 = y;
  }
};

/**
 * request.security(syminfo.tickerid, tf, ...) without lookahead: the bars of timeframe `tf` built from the chart
 * bars (their time is the start of the period), and for each chart bar the index of the latest completed bar of
 * that timeframe (-1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string): { htf: Bar[]; latest: number[] } {
  const chart = chartTimeframe(bars);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, latest: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  const n = bars.length;
  const starts = periodStarts(bars, tf);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });

  // A bar completes its period when its close reaches the end of the period. Symbols that trade every day follow
  // the UTC calendar: the period of the close time is another period. Other symbols: the last bar of a period.
  const ms = n > 0 && bars[0].time >= 1e12;
  const weekend = (t: number) => {
    const wd = new Date(ms ? t : t * 1000).getUTCDay();
    return wd === 0 || wd === 6;
  };
  const interval = barInterval(bars);
  const closes = bars.map((b) => ({ time: b.time + interval }));
  const calendar = bars.some((b) => weekend(b.time)) && closes.some((b) => weekend(b.time));
  const closeStarts = calendar ? periodStarts(closes, tf) : [];
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 || starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, latest };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TrendlineBreakoutNavigatorInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; labels: LabelData[]; barColors: BarColorData[]; bgColors: BgColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { cBull, cBear } = cfg;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const ps = cfg.term === 'Long' ? 1 : cfg.term === 'Medium' ? 2 : 3;

  // Drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until max
  // remain
  let lines: Trendline[] = [];
  let labels: Mark[] = [];
  const newLine = (x1: number, y1: number, x2: number, y2: number, css: string, pos: number): Trendline => {
    const l: Trendline = {
      x1, y1, x2, y2, color: css, style: pos === 1 ? 'solid' : pos === 2 ? 'dashed' : 'dotted', width: pos === 1 ? 2 : 1, deleted: false,
    };
    lines.push(l);
    if (lines.length > MAX_OBJECTS + 5) {
      for (const old of lines.splice(0, lines.length - MAX_OBJECTS)) old.deleted = true;
    }
    return l;
  };
  const deleteLine = (l: Trendline | null) => {
    if (!l || l.deleted) return;
    l.deleted = true;
    lines = lines.filter((o) => o !== l);
  };
  const newLabel = (m: Mark) => {
    labels.push(m);
    if (labels.length > MAX_OBJECTS + 5) labels = labels.slice(labels.length - MAX_OBJECTS);
  };

  // The swings of the three lengths: [time[2], pivot] of the timeframe on the chart bars, then
  // ta.change(fixnan(pivot)) of the highs and of the lows
  const { htf, latest } = timeframeBars(bars, cfg.res);
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
      const priceLin = priceAt(bn.lin, i - idx);
      if (bullish ? gt(c, priceLin) : lt(c, priceLin)) {
        // where the wick breaks the last line price
        if (ne(bn.slope, 0)) {
          newLabel({ x: i - idx, y: priceLin, text: '●', textColor: bullish ? cfg.cWickBull : cfg.cWickBear, style: 'label_center' });
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
              const lineY = priceAt(bn.lin, i - k);
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
          deleteLine(bn.lin);
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
              newLabel({ x, y: v, text: 'HH\n', textColor: CHART_FG, size: 'tiny' });
              if (cfg.hhll === 'HH/LL & previous H/L') {
                newLabel({ x: prevPh.index, y: prevPh.price, text: '●', textColor: CHART_FG, size: 'tiny' });
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
              newLabel({ x, y: v, text: '\nLL', textColor: CHART_FG, size: 'tiny', style: 'label_up' });
              if (cfg.hhll === 'HH/LL & previous H/L') {
                newLabel({ x: prevPl.index, y: prevPl.price, text: '●', textColor: CHART_FG, size: 'tiny', style: 'label_up' });
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

  // An object with an na coordinate is not drawn
  const drawn = (...values: number[]) => values.every((v) => !isNaN(v));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3 },
    lines: lines.filter((l) => drawn(l.x1, l.y1, l.x2, l.y2)).map((l) => ({
      time1: bars[l.x1].time, price1: l.y1, time2: bars[l.x2].time, price2: l.y2, color: l.color, width: l.width,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: labels.filter((m) => drawn(m.x, m.y)).map((m) => ({
      time: bars[m.x].time, price: m.y, text: m.text, color: 'transparent', textColor: m.textColor,
      ...(m.style !== undefined ? { style: m.style } : {}),
      ...(m.size !== undefined ? { size: m.size } : {}),
    })),
    barColors,
    bgColors,
  };
}

export const TrendlineBreakoutNavigator = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
