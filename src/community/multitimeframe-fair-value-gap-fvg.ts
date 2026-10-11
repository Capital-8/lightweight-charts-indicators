/**
 * Multitimeframe Fair Value Gap - FVG (Zeiierman)
 *
 * Fair value gaps of the chart timeframe or of a higher timeframe: a bullish gap when the low is above the high of
 * two bars before (and the close too), a bearish gap when the high is below the low of two bars before, kept only
 * when the candle body is at least the average body * sensitivity. Each gap is a box from the bar two bars before
 * to `Extend Boxes` bars after, with a dashed mid line and two inner boxes whose lengths are the buying and the
 * selling share of the bar volume ((close - low) / range and (high - close) / range). A gap is removed when price
 * reaches its midpoint (or its far side with "Mitigated on mid" off). An optional table lists the open gaps on the
 * right of the last bar, with the date of each gap.
 *
 * The FVG trend is a running mean (each new gap averages ohlc4 with the value before), smoothed with a Chebyshev
 * low-pass filter of (high + low + trend) / 3, coloured by the direction of the mean and filled towards its EMA.
 *
 * Chart values (third argument): the chart timeframe and the exchange calendar for a higher timeframe (without
 * them: the bar spacing and the UTC calendar), the exchange time zone for the dates of the table (without it: UTC)
 * and the chart foreground colour for their text (without it: #DBDBDB).
 *
 * Port notes:
 * - The higher timeframe is read with lookahead: every chart bar of a period shows the final values of the
 *   period, as in the original. A timeframe below the chart timeframe is not available from the chart bars: Error.
 * - The bars of the higher timeframe are built from the chart bars. The original also reads the bars of that
 *   timeframe that are older than the first chart bar: they count in the average body and give the bar two periods
 *   before on the first two periods. When the chart history is shorter than the history of the timeframe (intraday
 *   charts), the average body, and so the set of gaps, differs from the original.
 * - Drawing limits as in the original: 500 boxes and 50 lines. A box deleted by the limit stays in the list of the
 *   script with na prices, as in the original.
 * - A box end given as a time between two bars is the time of the next bar, where it is drawn. Objects with an na
 *   coordinate are not drawn and are left out.
 *
 * Reference: "Multitimeframe Fair Value Gap – FVG (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Zeiierman
 */

import { ta, str, math, color, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import { foregroundColorOf, timezoneOf, type ChartContext } from '../chart-context';

export interface MultitimeframeFairValueGapInputs {
  /** Timeframe of the gaps ('' = the chart timeframe) */
  tf: string;
  /** Minimum candle body, as a multiple of the average body */
  bodySens: number;
  /** A gap is mitigated at its midpoint (else at its far side) */
  mit: boolean;
  showActive: boolean;
  /** Start of the table, in tens of bars after the last bar */
  tableLeft: number;
  /** End of the table, in tens of bars after the last bar */
  tableRight: number;
  /** Bars after the gap bar where its box ends */
  extendLength: number;
  upCol: string;
  dnCol: string;
  col: string;
  showTrend: boolean;
  /** Passband ripple (dB) of the trend filter */
  rp: number;
  /** Cutoff frequency (0 to 0.5) of the trend filter */
  fc: number;
  trendUpCol: string;
  trendDnCol: string;
}

export const defaultInputs: MultitimeframeFairValueGapInputs = {
  tf: '',
  bodySens: 1.0,
  mit: true,
  showActive: false,
  tableLeft: 5,
  tableRight: 10,
  extendLength: 10,
  upCol: '#00ffbb80',
  dnCol: '#ff110080',
  col: '#787B8626',
  showTrend: true,
  rp: 10.0,
  fc: 0.1,
  trendUpCol: '#00E676',
  trendDnCol: '#F23645',
};

export const inputConfig: InputConfig[] = [
  { id: 'tf', type: 'timeframe', title: 'Timeframe', defval: '', group: 'FVG Timeframe' },
  { id: 'bodySens', type: 'float', title: 'Sensativity', defval: 1.0, min: 0, step: 0.1, group: 'FVG Timeframe' },
  { id: 'mit', type: 'bool', title: 'Mitigated on mid', defval: true, group: 'FVG Mitigation' },
  { id: 'showActive', type: 'bool', title: 'Show FVG table', defval: false, group: 'FVG Table' },
  { id: 'tableLeft', type: 'int', title: 'Table Left', defval: 5, min: 0, max: 30, group: 'FVG Table' },
  { id: 'tableRight', type: 'int', title: 'Right', defval: 10, min: 10, max: 50, group: 'FVG Table' },
  { id: 'extendLength', type: 'int', title: 'Extend Boxes', defval: 10, group: 'FVG Style' },
  { id: 'upCol', type: 'color', title: '', defval: '#00ffbb80', group: 'FVG Style' },
  { id: 'dnCol', type: 'color', title: '', defval: '#ff110080', group: 'FVG Style' },
  { id: 'col', type: 'color', title: '', defval: '#787B8626', group: 'FVG Style' },
  { id: 'showTrend', type: 'bool', title: 'Show FVG Trend', defval: true, group: 'Trend' },
  { id: 'rp', type: 'float', title: 'Passband Ripple (dB)', defval: 10.0, min: 0.1, step: 0.1, group: 'Trend' },
  { id: 'fc', type: 'float', title: 'Cutoff Frequency (0 to 0.5)', defval: 0.1, min: 0.001, max: 0.5, step: 0.01, group: 'Trend' },
  { id: 'trendUpCol', type: 'color', title: '', defval: '#00E676', group: 'Trend' },
  { id: 'trendDnCol', type: 'color', title: '', defval: '#F23645', group: 'Trend' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'FVG Trend Filter', color: '#2962FF', lineWidth: 1 },
  { id: 'plot1', title: 'visualtrend', color: String(color.new(color.blue, 100)), lineWidth: 1 },
];

export const metadata = {
  title: 'Multitimeframe Fair Value Gap – FVG (Zeiierman)',
  shortTitle: 'MTF FVG (Zeiierman)',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);

const MAX_BOXES = 500; // indicator(max_boxes_count = 500)
const MAX_LINES = 50; // default max_lines_count
const MAX_BARS_BACK = 5000;

/** A box of the script: `left` / `right` are times in ms, or bar indexes for the boxes of the table */
interface Bx {
  left: number; top: number; right: number; bottom: number;
  bg: string; border: string; byIndex?: boolean; text?: string; dead: boolean;
}
interface Ln { x1: number; x2: number; y: number; dead: boolean }

/** Live drawings of one kind: above max + 5 objects the oldest are deleted until max remain */
class Live<T extends { dead: boolean }> {
  readonly list: T[] = [];

  constructor(private readonly max: number) {}

  add(o: T): T {
    this.list.push(o);
    if (this.list.length > this.max + 5) for (const old of this.list.splice(0, this.list.length - this.max)) old.dead = true;
    return o;
  }

  delete(o: T | undefined): void {
    if (!o || o.dead) return;
    o.dead = true;
    const k = this.list.indexOf(o);
    if (k >= 0) this.list.splice(k, 1);
  }
}

/** Pine type Data: the gap boxes, their buy and sell volume boxes and their mid lines (newest first) */
interface Data { fvg: Bx[]; bv: Bx[]; sv: Bx[]; mid: Ln[] }

/**
 * request.security(syminfo.tickerid, tf, ..., lookahead = barmerge.lookahead_on): the bars of timeframe `tf` built
 * from the chart bars, and for each chart bar the index of the bar of its period.
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; group: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    return { htf: bars, group: bars.map((_b, i) => i) };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`MTF FVG: the timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods come from the library rule
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group };
  const starts = periodStarts(bars, tf, context);
  const htf: Bar[] = [];
  const group: number[] = [];
  bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const last = htf[htf.length - 1];
      last.high = Math.max(last.high, b.high);
      last.low = Math.min(last.low, b.low);
      last.close = b.close;
      last.volume = (last.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });
  return { htf, group };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MultitimeframeFairValueGapInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const tableLeft = cfg.tableLeft * 10;
  const tableRight = cfg.tableRight * 10;
  const tMs = (i: number) => (bars[i].time as number) * 1000;

  // The bars of the timeframe (the calendar functions come first: they clear the drawing registry of the library)
  const { htf, group } = timeframeBars(bars, cfg.tf, chart);
  // getCandle(): wick = body of the bar; avgFVG = array.avg of the bodies up to the bar
  const body: number[] = new Array(htf.length);
  const avgBody: number[] = new Array(htf.length);
  let bodySum = 0;
  htf.forEach((b, k) => {
    body[k] = Math.max(b.close, b.open) - Math.min(b.close, b.open);
    bodySum += body[k];
    avgBody[k] = bodySum / (k + 1);
  });
  // timeframe.in_seconds(timeframe.period) * 1000
  const chartTf = chartTimeframe(bars, chart);
  const barMs = chartTf === '' ? NaN : timeframe.in_seconds(chartTf) * 1000;

  const boxes = new Live<Bx>(MAX_BOXES);
  const lines = new Live<Ln>(MAX_LINES);
  const bv: Data = { fvg: [], bv: [], sv: [], mid: [] };
  const sv: Data = { fvg: [], bv: [], sv: [], mid: [] };
  let tableBoxes: Bx[] = []; // var FVGs
  let frame: Bx | undefined; // b[1] of the table frame
  let tLine = 0.0; // array.get(TLine, 0)

  // BarsBack(val, hl): the time of the latest bar, among the last 5000, whose high / low equals val; else `time`
  const barsBack = (val: number, low: boolean, i: number): number => {
    if (isNaN(val)) return tMs(i);
    const stop = Math.max(0, i - (MAX_BARS_BACK - 1));
    for (let j = i; j >= stop; j--) if (eq(val, low ? bars[j].low : bars[j].high)) return tMs(j);
    return tMs(i);
  };
  // VolumePower(v, c, l, h, ca)
  const volumePower = (v: number, c: number, l: number, h: number, buy: boolean): number => (
    math.round((math.round((v * (buy ? c - l : h - c)) / (h - l)) / v) * 100)
  );
  // box getters: na on a deleted box
  const top = (e: Bx) => (e.dead ? NaN : e.top);
  const bottom = (e: Bx) => (e.dead ? NaN : e.bottom);
  const left = (e: Bx) => (e.dead ? NaN : e.left);

  // method Cleaner(Data d, cond): `for [i, e] in d.fvg` with a removal inside skips the element after the removed one
  const cleaner = (d: Data, cond: boolean, low: number, high: number) => {
    for (let i = 0; i < d.fvg.length; i++) {
      const e = d.fvg[i];
      const t = top(e);
      const b = bottom(e);
      const mid = (t + b) / 2;
      const hit = cfg.mit ? (cond ? le(low, mid) : ge(high, mid)) : (cond ? le(low, b) : ge(high, t));
      if (hit) {
        boxes.delete(e);
        lines.delete(d.mid[i]);
        boxes.delete(d.bv[i]);
        boxes.delete(d.sv[i]);
        d.fvg.splice(i, 1);
        d.mid.splice(i, 1);
        d.bv.splice(i, 1);
        d.sv.splice(i, 1);
      }
    }
  };

  const trendMean: number[] = new Array(n);
  const hSec: number[] = new Array(n);
  const lSec: number[] = new Array(n);
  let prevBull = false;
  let prevBear = false;
  let cumHigh = NaN; // ta.max(high)
  let cumLow = NaN; // ta.min(low)
  const zone = timezoneOf(chart);
  const textColor = foregroundColorOf(chart);

  for (let i = 0; i < n; i++) {
    const bar = bars[i];
    const g = group[i];
    // [close, high, low, high[2], low[2], volume] of the timeframe
    const c1 = htf[g].close;
    const h = htf[g].high;
    const l = htf[g].low;
    const h2 = g >= 2 ? htf[g - 2].high : NaN;
    const l2 = g >= 2 ? htf[g - 2].low : NaN;
    const v = htf[g].volume ?? NaN;
    const wick = body[g];
    const avgFVG = avgBody[g];
    hSec[i] = h;
    lSec[i] = l;

    const hBack = barsBack(h, false, i);
    const lBack = barsBack(l, true, i);
    const h2Back = barsBack(h2, false, i);
    const l2Back = barsBack(l2, true, i);
    const buyVol = volumePower(v, c1, l, h, true);
    const sellVol = volumePower(v, c1, l, h, false);

    // FVG(...)
    const bullFVG = gt(l, h2) && gt(c1, h2);
    const bearFVG = lt(h, l2) && lt(c1, l2);
    const strong = ge(wick, avgFVG * cfg.bodySens);
    const ohlc4 = (bar.open + bar.high + bar.low + bar.close) / 4;
    const gap = (d: Data, start: number, end: number, boxTop: number, boxBottom: number) => {
      tLine = (ohlc4 + tLine) / 2;
      // getBarTime(t, extendLength)
      const future = end + cfg.extendLength * barMs;
      d.fvg.unshift(boxes.add({ left: start, top: boxTop, right: future, bottom: boxBottom, bg: cfg.col, border: cfg.col, dead: false }));
      const mid = (boxTop + boxBottom) / 2;
      d.mid.unshift(lines.add({ x1: start, x2: future, y: mid, dead: false }));
      const dist = future - start;
      d.bv.unshift(boxes.add({
        left: start, top: mid, right: Math.trunc(start + dist * (buyVol / 100)), bottom: boxTop, bg: cfg.upCol, border: cfg.upCol, dead: false,
      }));
      d.sv.unshift(boxes.add({
        left: start, top: boxBottom, right: Math.trunc(start + dist * (sellVol / 100)), bottom: mid, bg: cfg.dnCol, border: cfg.dnCol, dead: false,
      }));
    };
    if (bullFVG && !prevBull && strong) gap(bv, h2Back, hBack, l, h2);
    // the `else` of the source belongs to the bearish test only
    if (bearFVG && !prevBear && strong) gap(sv, l2Back, lBack, l2, h);
    prevBull = bullFVG;
    prevBear = bearFVG;

    cleaner(bv, true, bar.low, bar.high);
    cleaner(sv, false, bar.low, bar.high);

    cumHigh = isNaN(cumHigh) ? bar.high : Math.max(cumHigh, bar.high);
    cumLow = isNaN(cumLow) ? bar.low : Math.min(cumLow, bar.low);
    if (cfg.showActive) {
      const b = boxes.add({
        left: i + tableLeft, top: cumHigh, right: i + tableRight, bottom: cumLow,
        bg: String(color.new(color.gray, 100)), border: String(color.gray), byIndex: true, dead: false,
      });
      boxes.delete(frame);
      frame = b;
      for (const e of tableBoxes) boxes.delete(e);
      tableBoxes = [];
      // UpdateFVG(Box)
      for (const d of [bv, sv]) {
        for (const e of d.fvg) {
          const date = str.format_time(left(e), 'yyyy-MM-dd HH:mm', zone);
          tableBoxes.push(boxes.add({
            left: i + tableLeft, top: top(e), right: i + tableRight, bottom: bottom(e),
            bg: lt(bar.close, bottom(e)) ? cfg.dnCol : cfg.upCol, border: 'transparent', byIndex: true, text: date, dead: false,
          }));
        }
      }
    }
    trendMean[i] = tLine;
  }

  // Trend: Chebyshev low-pass filter of math.avg(h, l, Trend)
  const epsilon = Math.sqrt(Math.pow(10, cfg.rp / 10) - 1);
  const d = Math.sqrt(1 + epsilon * epsilon);
  const c = 1 / Math.tan(Math.PI * cfg.fc);
  const norm = 1 / (1 + d * c + c * c);
  const b0 = norm;
  const b1 = 2 * norm;
  const b2 = norm;
  const a1 = 2 * norm * (1 - c * c);
  const a2 = norm * (1 - d * c + c * c);
  const nz = (x: number) => (isNaN(x) ? 0 : x);
  const src = trendMean.map((t, i) => (hSec[i] + lSec[i] + t) / 3);
  const trend: number[] = new Array(n);
  const visual = ta.ema(Series.fromArray(bars, trendMean), 10).toArray().map((x) => x ?? NaN);
  const plot0: { time: number; value: number; color: string }[] = [];
  const topColor: string[] = [];
  let tCol: string | null = String(color.gray); // var TCol = color.gray
  for (let i = 0; i < n; i++) {
    // TCol := Trend > Trend[1] ? TUpCol : Trend < Trend[1] ? TDnCol : TCol[1] (TCol[1] is na on the first bar)
    const prev = i > 0 ? trendMean[i - 1] : NaN;
    tCol = gt(trendMean[i], prev) ? cfg.trendUpCol : lt(trendMean[i], prev) ? cfg.trendDnCol : (i > 0 ? tCol : null);
    trend[i] = i < 2 ? src[i] : b0 * src[i] + b1 * src[i - 1] + b2 * src[i - 2] - a1 * nz(trend[i - 1]) - a2 * nz(trend[i - 2]);
    plot0.push({ time: bars[i].time as number, value: cfg.showTrend ? trend[i] : NaN, color: tCol ?? 'transparent' });
    // color.new(TCol, 70): an na colour gives black with transparency 70, as in the original
    topColor.push(String(color.new(tCol as string, 70)));
  }

  // The drawings alive after the last bar. A time between two bars is drawn on the next bar.
  const step = barInterval(bars);
  const drawnTime = (tm: number): number => {
    if (n === 0 || tm > tMs(n - 1)) return tm / 1000;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (tMs(m) >= tm) hi = m;
      else lo = m + 1;
    }
    return bars[lo].time as number;
  };
  const x = (e: Bx, value: number) => (e.byIndex ? barTime(bars, value, step) : drawnTime(value));
  const outBoxes: BoxData[] = [];
  for (const e of boxes.list) {
    if ([e.left, e.right, e.top, e.bottom].some((value) => isNaN(value))) continue;
    outBoxes.push({
      time1: x(e, e.left), price1: e.top, time2: x(e, e.right), price2: e.bottom, bgColor: e.bg, borderColor: e.border,
      ...(e.text !== undefined ? { text: e.text, textColor } : {}),
    });
  }
  const outLines: LineDrawingData[] = [];
  for (const e of lines.list) {
    if ([e.x1, e.x2, e.y].some((value) => isNaN(value))) continue;
    outLines.push({ time1: drawnTime(e.x1), price1: e.y, time2: drawnTime(e.x2), price2: e.y, color: String(color.white), style: 'dashed' });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0,
      plot1: bars.map((b, i) => ({ time: b.time as number, value: visual[i] })),
    },
    fills: [
      // fill(Trend_, visualclose_, trend, visualclose, color.new(TCol, 70), na, title = "Fill")
      {
        plot1: 'plot0', plot2: 'plot1',
        gradient: {
          topValue: trend.map((value) => (Number.isFinite(value) ? value : NaN)), bottomValue: visual,
          topColor, bottomColor: bars.map(() => null),
        },
      },
    ],
    boxes: outBoxes,
    lines: outLines,
  };
}

export const MultitimeframeFairValueGap = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
