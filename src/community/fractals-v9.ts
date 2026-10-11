/**
 * [RS]Fractals V9
 *
 * Five-bar fractals: a top is a bar whose high is above the highs of the two bars before and the two bars after it
 * (ties allowed with the nearest bars), a bottom is the same on the lows. The "Filter Bill Williams Fractals?" option
 * keeps only the regular shape (two rising highs, then two falling highs). A fractal is known two bars later, so
 * every output that marks it is drawn two bars back.
 *
 * From the fractals: higher high / lower high / higher low / lower low labels (a top above, or below, the two tops
 * before it), optional fractals confirmed on another timeframe of the same symbol (a higher high at or above the high
 * of that timeframe, a lower low at or below its low), three optional channels, a zigzag through alternating tops and
 * bottoms, bar colours on the zigzag points, and harmonic patterns from the ratios of the last five zigzag points
 * (AB=CD, Bat, Alt Bat, Butterfly, Gartley, Crab, Shark, 5-O, Wolf Wave, Head and Shoulders, Contracting and
 * Expanding Triangle; bearish ones at the top of the pane, bullish ones at the bottom).
 *
 * Other timeframe: its bars are built from the chart bars. With the exchange time zone and the session of the symbol
 * in the chart context (optional third argument of calculate) the periods are those of the exchange calendar;
 * without them they come from the UTC calendar and the bars (see src/anchor-period.ts). With "Repaint?" on, every
 * chart bar reads the final high / low of its period; with it off, the high / low of the latest completed period. A timeframe below the chart timeframe needs data that the bars do
 * not carry: the port throws an Error when an output that uses it is switched on ("Show Higher Timeframe
 * Fractals?" or channel 3).
 *
 * Reference: "[RS]Fractals V9" by RicardoSantos
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © RicardoSantos
 */

import { timeframe, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, MarkerData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { periodStarts, chartTimeframe, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface FractalsV9Inputs {
  showPatterns: boolean;
  showBarColors: boolean;
  /** Keep only the regular fractal shape */
  filterBw: boolean;
  showHHLL: boolean;
  /** Timeframe of the confirmed fractals ("240", "D", "W", ...) */
  timeframe1: string;
  showTimeFractals1: boolean;
  /** Read the final high / low of the period of the other timeframe (lookahead) */
  repaint: boolean;
  showChannel1: boolean;
  showChannel2: boolean;
  showChannel3: boolean;
  showZigZag: boolean;
}

export const defaultInputs: FractalsV9Inputs = {
  showPatterns: true,
  showBarColors: false,
  filterBw: false,
  showHHLL: false,
  timeframe1: '240',
  showTimeFractals1: false,
  repaint: true,
  showChannel1: false,
  showChannel2: false,
  showChannel3: false,
  showZigZag: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'showPatterns', type: 'bool', title: 'Show Patterns?', defval: true },
  { id: 'showBarColors', type: 'bool', title: 'Show Bar Colors?', defval: false },
  { id: 'filterBw', type: 'bool', title: 'Filter Bill Williams Fractals?', defval: false },
  { id: 'showHHLL', type: 'bool', title: 'Show HH/LL Pivot labels?', defval: false },
  { id: 'timeframe1', type: 'string', title: 'Timeframe:', defval: '240', inline: 'tf' },
  { id: 'showTimeFractals1', type: 'bool', title: 'Show Higher Timeframe Fractals?', defval: false, inline: 'tf' },
  { id: 'repaint', type: 'bool', title: 'Repaint?', defval: true, inline: 'tf' },
  { id: 'showChannel1', type: 'bool', title: '1, ', defval: false, inline: 'ch' },
  { id: 'showChannel2', type: 'bool', title: '2, ', defval: false, inline: 'ch' },
  { id: 'showChannel3', type: 'bool', title: '3, Show Channels?', defval: false, inline: 'ch' },
  { id: 'showZigZag', type: 'bool', title: 'Show ZigZag?', defval: true },
];

// Colour constants of Pine version 5
const RED = '#FF5252';
const LIME = '#00E676';
const MAROON = '#880E4F';
const GREEN = '#4CAF50';
const BLACK = '#363A45';
const GRAY = '#787B86';
const SILVER = '#B2B5BE';
const WHITE = '#FFFFFF';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Top Channel 1', color: BLACK, lineWidth: 1 },
  { id: 'plot1', title: 'Bottom Channel 1', color: BLACK, lineWidth: 1 },
  { id: 'plot2', title: 'Top Channel 2', color: GRAY, lineWidth: 1 },
  { id: 'plot3', title: 'Bottom Channel 2', color: GRAY, lineWidth: 1 },
  { id: 'plot4', title: 'Top Channel 3', color: SILVER, lineWidth: 1 },
  { id: 'plot5', title: 'Bottom Channel 3', color: SILVER, lineWidth: 1 },
  { id: 'plot6', title: 'ZigZag', color: BLACK, lineWidth: 1 },
];

export const metadata = {
  title: '[RS]Fractals V9',
  shortTitle: '[RS]Fractals V9',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ge = (a: number, b: number) => gt(a, b) || eq(a, b) || (a === Infinity && b === Infinity);
const le = (a: number, b: number) => lt(a, b) || eq(a, b);
/** A number used as a condition: na and 0 are false */
const truthy = (v: number) => !isNaN(v) && v !== 0;

/**
 * request.security(syminfo.tickerid, tf, ...): the bars of timeframe `tf` built from the chart bars, and for each
 * chart bar the index of its bar of that timeframe (`group`, lookahead on) and of the latest completed bar of that
 * timeframe (`latest`, lookahead off; -1: none yet).
 */
function timeframeBars(bars: Bar[], tf: string, context?: ChartContext): { htf: Bar[]; group: number[]; latest: number[] } {
  const chart = chartTimeframe(bars, context);
  if (tf.trim() === '' || chart === '' || timeframe.in_seconds(tf) === timeframe.in_seconds(chart)) {
    const same = bars.map((_b, i) => i);
    return { htf: bars, group: same, latest: same };
  }
  if (timeframe.in_seconds(tf) < timeframe.in_seconds(chart)) {
    throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chart}": the chart bars do not have that data`);
  }
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  if (exchange) return { htf: exchange.htf, group: exchange.group, latest: exchange.latest };
  const n = bars.length;
  const starts = periodStarts(bars, tf);
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
  // The last bar of a symbol that does not trade every day: its period is complete when the next possible bar is in
  // another period. The next bar is on the same day while the bar is earlier in the day than the last bar of the
  // trading day before; else it is on the next weekday.
  let lastEnds = true;
  if (!calendar && n > 1) {
    const DAY = 86400000;
    const toMs = (t: number) => (ms ? t : t * 1000);
    const lastMs = toMs(bars[n - 1].time);
    const day = Math.floor(lastMs / DAY) * DAY;
    let next = lastMs + toMs(interval);
    let sessionOver = true;
    if (toMs(interval) < DAY) {
      let j = n - 2;
      while (j >= 0 && toMs(bars[j].time) >= day) j--;
      sessionOver = j < 0 || lastMs - day >= toMs(bars[j].time) % DAY;
    }
    if (sessionOver) {
      next = day + DAY;
      while (weekend(ms ? next : next / 1000)) next += DAY;
    }
    const withNext = periodStarts([...bars, { time: ms ? next : next / 1000 }], tf);
    lastEnds = withNext[n] !== withNext[n - 1];
  }
  const latest: number[] = [];
  for (let i = 0; i < n; i++) {
    let done = i === 0 ? -1 : latest[i - 1];
    if (i > 0 && group[i] !== group[i - 1]) done = Math.max(done, group[i] - 1);
    const ends = i === n - 1 ? lastEnds : starts[i + 1] !== starts[i];
    const reaches = !calendar || closeStarts[i] !== starts[i];
    if (ends && reaches) done = Math.max(done, group[i]);
    latest.push(done);
  }
  return { htf, group, latest };
}

type Range = [number, number];
/** Ratio ranges of one pattern (a missing ratio is not tested) */
interface Pattern {
  text: string;
  bearTitle: string;
  xab?: Range;
  abc?: Range;
  bcd?: Range;
  xad?: Range;
}
const NONE = -Infinity;
// In the order of the plotshape calls
const PATTERNS: Pattern[] = [
  { text: 'AB=CD', bearTitle: 'ABCD', abc: [0.382, 0.886], bcd: [1.13, 2.618] },
  { text: 'Bat', bearTitle: 'Bat', xab: [0.382, 0.5], abc: [0.382, 0.886], bcd: [1.618, 2.618], xad: [NONE, 0.886] },
  { text: 'Alt Bat', bearTitle: 'Alt Bat', xab: [NONE, 0.382], abc: [0.382, 0.886], bcd: [2.0, 3.618], xad: [NONE, 1.13] },
  { text: 'Butterfly', bearTitle: 'Butterfly', xab: [NONE, 0.786], abc: [0.382, 0.886], bcd: [1.618, 2.618], xad: [1.27, 1.618] },
  { text: 'Gartley', bearTitle: 'Gartley', xab: [0.5, 0.618], abc: [0.382, 0.886], bcd: [1.13, 2.618], xad: [0.75, 0.875] },
  { text: 'Crab', bearTitle: 'Crab', xab: [0.75, 0.875], abc: [0.382, 0.886], bcd: [2.0, 3.618], xad: [1.5, 1.625] },
  { text: 'Shark', bearTitle: 'Shark', xab: [0.5, 0.875], abc: [1.13, 1.618], bcd: [1.27, 2.24], xad: [0.88, 1.13] },
  { text: '5-O', bearTitle: '5-O', xab: [1.13, 1.618], abc: [1.618, 2.24], bcd: [0.5, 0.625], xad: [0.0, 0.236] },
  { text: 'Wolf Wave', bearTitle: 'Wolf Wave', xab: [1.27, 1.618], abc: [0, 5], bcd: [1.27, 1.618], xad: [0.0, 5] },
  { text: 'Head and Shoulders', bearTitle: 'Head and Shoulders', xab: [2.0, 10], abc: [0.9, 1.1], bcd: [0.236, 0.88], xad: [0.9, 1.1] },
  { text: 'Contracting Triangle', bearTitle: 'Contracting triangle', xab: [0.382, 0.618], abc: [0.382, 0.618], bcd: [0.382, 0.618], xad: [0.236, 0.764] },
  { text: 'Expanding Triangle', bearTitle: 'Expanding Triangle', xab: [1.236, 1.618], abc: [1.0, 1.618], bcd: [1.236, 2.0], xad: [2.0, 2.236] },
];
const inRange = (v: number, r: Range | undefined) => r === undefined || ((r[0] === NONE || ge(v, r[0])) && le(v, r[1]));

type Point = { time: number; value: number };

export function calculate(
  bars: Bar[],
  inputs: Partial<FractalsV9Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers' | 'barColors'> & { markers: MarkerData[]; barColors: BarColorData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);

  // The other timeframe is only read by the timed fractals; a timeframe that the bars cannot give stops the port
  // only when one of their outputs is switched on
  const needsTimeframe = cfg.showTimeFractals1 || cfg.showChannel3;
  let tfh: number[] = new Array(n).fill(NaN);
  let tfl: number[] = new Array(n).fill(NaN);
  try {
    const { htf, group, latest } = timeframeBars(bars, cfg.timeframe1, chart);
    const at = cfg.repaint ? group : latest;
    tfh = at.map((g) => (g >= 0 ? htf[g].high : NaN));
    tfl = at.map((g) => (g >= 0 ? htf[g].low : NaN));
  } catch (e) {
    if (needsTimeframe) throw e;
  }

  const top: boolean[] = new Array(n);
  const bot: boolean[] = new Array(n);
  const higherHigh: boolean[] = new Array(n);
  const lowerHigh: boolean[] = new Array(n);
  const higherLow: boolean[] = new Array(n);
  const lowerLow: boolean[] = new Array(n);
  const higherHHigh: boolean[] = new Array(n);
  const lowerLLow: boolean[] = new Array(n);
  const zigzag: number[] = new Array(n);
  /** One flag per pattern and bar: [bear, bull] */
  const bear: boolean[][] = PATTERNS.map(() => new Array(n).fill(false));
  const bull: boolean[][] = PATTERNS.map(() => new Array(n).fill(false));

  // ta.valuewhen histories (latest value last)
  const tops: number[] = [];
  const bots: number[] = [];
  const zz: number[] = [];
  const back = (list: number[], k: number) => (list.length > k ? list[list.length - 1 - k] : NaN);
  let lastHigherHigh = NaN; // ta.valuewhen(higherhigh == true, high[2], 0)
  let lastLowerLow = NaN; // ta.valuewhen(lowerlow == true, low[2], 0)
  let topCount = NaN; // ta.barssince(istop)
  let botCount = NaN; // ta.barssince(isbot)
  const prevIs: Array<[boolean, boolean]> = PATTERNS.map(() => [false, false]);

  for (let i = 0; i < n; i++) {
    const h0 = H(i), h1 = H(i - 1), h2 = H(i - 2), h3 = H(i - 3), h4 = H(i - 4);
    const l0 = L(i), l1 = L(i - 1), l2 = L(i - 2), l3 = L(i - 3), l4 = L(i - 4);
    top[i] = cfg.filterBw
      ? lt(h4, h3) && lt(h3, h2) && gt(h2, h1) && gt(h1, h0)
      : lt(h4, h2) && le(h3, h2) && ge(h2, h1) && gt(h2, h0);
    bot[i] = cfg.filterBw
      ? gt(l4, l3) && gt(l3, l2) && lt(l2, l1) && lt(l1, l0)
      : gt(l4, l2) && ge(l3, l2) && le(l2, l1) && lt(l2, l0);

    if (top[i]) tops.push(h2);
    if (bot[i]) bots.push(l2);
    const t0 = back(tops, 0), t1 = back(tops, 1), t2 = back(tops, 2);
    const b0 = back(bots, 0), b1 = back(bots, 1), b2 = back(bots, 2);
    higherHigh[i] = top[i] && lt(t1, t0) && lt(t2, t0);
    lowerHigh[i] = top[i] && gt(t1, t0) && gt(t2, t0);
    higherLow[i] = bot[i] && lt(b1, b0) && lt(b2, b0);
    lowerLow[i] = bot[i] && gt(b1, b0) && gt(b2, b0);

    // isTFFractal(mode, tf)
    if (higherHigh[i]) lastHigherHigh = h2;
    if (lowerLow[i]) lastLowerLow = l2;
    higherHHigh[i] = higherHigh[i] && ge(lastHigherHigh, tfh[i]);
    lowerLLow[i] = lowerLow[i] && le(lastLowerLow, tfl[i]);

    // ZigZag: a top when the last bottom is more recent than the last top, and the other way round
    const isTop = cfg.showTimeFractals1 ? higherHHigh[i] : top[i];
    const isBot = cfg.showTimeFractals1 ? lowerLLow[i] : bot[i];
    const prevTopCount = topCount;
    const prevBotCount = botCount;
    topCount = isTop ? 0 : topCount + 1;
    botCount = isBot ? 0 : botCount + 1;
    zigzag[i] = isTop && prevTopCount > prevBotCount ? h2 : isBot && prevTopCount < prevBotCount ? l2 : NaN;

    // Pattern ratios from the last five zigzag points
    if (truthy(zigzag[i])) zz.push(zigzag[i]);
    const x = back(zz, 4), a = back(zz, 3), b = back(zz, 2), c = back(zz, 1), d = back(zz, 0);
    const xab = Math.abs(b - a) / Math.abs(x - a);
    const xad = Math.abs(a - d) / Math.abs(x - a);
    const abc = Math.abs(b - c) / Math.abs(a - b);
    const bcd = Math.abs(c - d) / Math.abs(b - c);
    PATTERNS.forEach((p, k) => {
      const ratios = inRange(xab, p.xab) && inRange(abc, p.abc) && inRange(bcd, p.bcd) && inRange(xad, p.xad);
      const isBear = ratios && gt(d, c);
      const isBull = ratios && lt(d, c);
      bear[k][i] = isBear && !prevIs[k][0];
      bull[k][i] = isBull && !prevIs[k][1];
      prevIs[k] = [isBear, isBull];
    });
  }

  const interval = barInterval(bars);
  const T = (i: number) => barTime(bars, i, interval);
  // plot(..., offset = -2): the value of bar i is drawn on bar i - 2
  const shifted = (f: (i: number) => number): Point[] => {
    const out: Point[] = [];
    for (let i = 2; i < n; i++) out.push({ time: T(i - 2), value: f(i) });
    return out;
  };
  const plots: Record<string, Point[]> = {
    plot0: shifted((i) => (cfg.showChannel1 && top[i] ? H(i - 2) : NaN)),
    plot1: shifted((i) => (cfg.showChannel1 && bot[i] ? L(i - 2) : NaN)),
    plot2: shifted((i) => (cfg.showChannel2 && higherHigh[i] ? H(i - 2) : NaN)),
    plot3: shifted((i) => (cfg.showChannel2 && lowerLow[i] ? L(i - 2) : NaN)),
    plot4: shifted((i) => (cfg.showChannel3 && higherHHigh[i] ? H(i - 2) : NaN)),
    plot5: shifted((i) => (cfg.showChannel3 && lowerLLow[i] ? L(i - 2) : NaN)),
    plot6: shifted((i) => (cfg.showZigZag ? zigzag[i] : NaN)),
  };

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  for (let i = 0; i < n; i++) {
    const at2 = i - 2 >= 0 ? T(i - 2) : null;
    const add = (on: boolean, time: number | null, m: Omit<MarkerData, 'time'>) => {
      if (on && time !== null) markers.push({ time, ...m });
    };
    add(top[i], at2, { position: 'aboveBar', shape: 'triangleDown', color: RED });
    add(bot[i], at2, { position: 'belowBar', shape: 'triangleUp', color: LIME });
    add(cfg.showHHLL && higherHigh[i], at2, { position: 'aboveBar', shape: 'square', color: MAROON, text: '[HH]' });
    add(cfg.showHHLL && lowerHigh[i], at2, { position: 'aboveBar', shape: 'square', color: MAROON, text: '[LH]' });
    add(cfg.showHHLL && higherLow[i], at2, { position: 'belowBar', shape: 'square', color: GREEN, text: '[HL]' });
    add(cfg.showHHLL && lowerLow[i], at2, { position: 'belowBar', shape: 'square', color: GREEN, text: '[LL]' });
    add(cfg.showTimeFractals1 && higherHHigh[i], at2, { position: 'aboveBar', shape: 'square', color: MAROON, text: '[TH]' });
    add(cfg.showTimeFractals1 && lowerLLow[i], at2, { position: 'belowBar', shape: 'square', color: GREEN, text: '[TL]' });
    if (cfg.showPatterns) {
      // The first two bearish patterns are drawn two bars back, the others on the current bar
      PATTERNS.forEach((p, k) => add(bear[k][i], k < 2 ? at2 : T(i), {
        position: 'top', shape: 'labelDown', color: MAROON, text: k === 0 ? '\nAB=CD' : p.text, textColor: WHITE,
      }));
      PATTERNS.forEach((p, k) => add(bull[k][i], T(i), {
        position: 'bottom', shape: 'labelUp', color: GREEN, text: k === 0 ? 'AB=CD\n' : p.text, textColor: WHITE,
      }));
    }
    // barcolor(showBarColors ? bc : na, offset = -2)
    if (cfg.showBarColors && at2 !== null) {
      const z = zigzag[i];
      const bc = truthy(z) && eq(H(i - 2), z) ? RED : truthy(z) && eq(L(i - 2), z) ? LIME : SILVER;
      barColors.push({ time: at2, color: bc });
    }
  }
  markers.sort((p, q) => p.time - q.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    markers,
    barColors,
  };
}

export const FractalsV9 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
