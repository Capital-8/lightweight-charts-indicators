/**
 * MTF Order Block Finder
 *
 * An order block is the last candle against a run: a down candle followed by 'Order Block Required Length' up
 * candles is a bullish order block, an up candle followed by as many down candles a bearish one. The first candle
 * must move more than '1st Candle Filter' percent (open to close), the whole pattern more than 'Order Block
 * Required Move %' (close of the first candle to close of the last), and a following candle that moves less than
 * '2nd+ Candle Filter' percent counts for both directions. The pattern is read one bar after its last candle.
 * The zone of an order block is taken from the candle 'Order Block Candle Shift' after the first one ("OHLC": from
 * its low to the top of its body for a bullish block, from its high to the bottom of its body for a bearish one;
 * "High/Low": its high and low; "Context": the candle with the lowest low / highest high among the first candles
 * of the pattern). Each order block is marked on its candle with a label and three short lines (top, bottom and
 * middle of the zone), and the newest 'Bullish / Bearish Zones to Show' zones are drawn to the right from the bar
 * where the pattern is found, as boxes, as three lines or both. On the last bar, with 'Order Block Draw Distance %'
 * above 0, the zones farther than that from the open are removed.
 *
 * 'Order Block Timeframe': the candles of a higher timeframe of the chart symbol ("60", "240", "1D", "1W", "1M" ...,
 * only the values that the script knows; another value, or a timeframe below the chart's, is the chart timeframe).
 * The pattern is then read on the chart bar that closes a candle of that timeframe, when the last
 * (length + 1) x (timeframe / chart timeframe) chart bars hold at least length + 2 such closes, and the marks are
 * placed by time. The script also waits until the timeframe has that many candles in its own history: the port counts
 * them from the first bar on a daily or higher chart, and takes that history as long enough on an intraday chart
 * (intraday bars start later than the bars of higher timeframes).
 *
 * Chart values read (optional third argument of calculate): the chart timeframe (else taken from the bar spacing)
 * and, for the close time of a bar and the candles of the higher timeframe, the exchange time zone and session.
 * Without them the close time of a bar is its time plus the timeframe, and the periods follow the UTC calendar.
 * The 3 alert conditions of the script have no output.
 *
 * Reference: "MTF Order Block Finder" by DasanC
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { color, math, timeframe, barTime, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import { executeScript, time_close as scriptTimeClose } from 'oakscriptjs/script';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { chartTimeframe, hasCalendar, periodStarts, securityBars } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface MtfOrderBlockFinderInputs {
  /** Hover over ( ! ) for Intro (no effect) */
  doc: boolean;
  /** Order Block Timeframe ("" = the chart timeframe) */
  resolution: string;
  /** Order Block Required Length */
  obPeriod: number;
  /** Order Block Required Move % */
  threshold: number;
  /** Bullish Zones to Show */
  bullChannels: number;
  /** Bearish Zones to Show */
  bearChannels: number;
  /** 1st Candle Filter (percent) */
  doji: number;
  /** 2nd+ Candle Filter (percent) */
  fuzzy: number;
  /** Order Block Draw Distance % (0 = off) */
  nearPrice: number;
  /** Zone Drawing Style */
  style: 'BOTH' | 'BOX' | 'LINE';
  bullColor: string;
  bearColor: string;
  /** Line Width for Zone's High/Low */
  linewidthHl: number;
  /** Line Width for Zone's Avg */
  linewidthAvg: number;
  /** Order Block Candle Shift */
  obShift: number;
  /** Order Block Source Selector */
  obSelector: 'High/Low' | 'OHLC' | 'Context';
  /** Order Block Context Search Length */
  obSearch: number;
  /** "MTF Order Block Finder" Version # (no effect) */
  version: string;
}

export const defaultInputs: MtfOrderBlockFinderInputs = {
  doc: true,
  resolution: '',
  obPeriod: 5,
  threshold: 0.3,
  bullChannels: 4,
  bearChannels: 4,
  doji: 0.05,
  fuzzy: 0.01,
  nearPrice: 0,
  style: 'BOX',
  bullColor: 'rgba(76, 175, 80, 0.35)',
  bearColor: 'rgba(255, 82, 82, 0.35)',
  linewidthHl: 1,
  linewidthAvg: 1,
  obShift: 1,
  obSelector: 'OHLC',
  obSearch: 2,
  version: '1.504',
};

const GROUP_BASIC = 'Basic Configuration';
const GROUP_ADVANCED = 'Advanced Configuration';
const GROUP_STYLE = 'Style and Colors';
const GROUP_EXPERIMENTAL = 'Experimental Settings';
const TIP_ZONES = 'Number of Zones to draw on chart. Higher numbers can lead to messy charts, especially if "Order Block Draw Distance %" is not configured!';
const TIP_WIDTH = 'Line width when using the LINE drawing style';

export const inputConfig: InputConfig[] = [
  {
    id: 'doc', type: 'bool', title: 'Hover over ( ! ) for Intro', defval: true, group: 'Introduction',
    tooltip: 'Instituational Order Blocks (OB) often signal the beginning of a strong move. There is a high probability that OB price levels will be revisited in the future. Bullish Order Block pattern is the last down candle before a sequence of up candles. Bearish Order Block pattern is the last up candle before a sequence of down candles.'
      + 'Order Block sources are indicated by an upper, lower, and average line that preceeds the colored zone.\n\nConfused by a setting?\nHover over the ( i ) icon for a description.',
  },
  {
    id: 'resolution', type: 'timeframe', title: 'Order Block Timeframe', defval: '', group: GROUP_BASIC,
    tooltip: 'Find Order Blocks from higher timeframes. Timeframes lower than the chart are ignored.',
  },
  {
    id: 'obPeriod', type: 'int', title: 'Order Block Required Length', defval: 5, min: 1, max: 20, group: GROUP_BASIC,
    tooltip: 'Required number of subsequent candles in the same direction to identify Order Block',
  },
  {
    id: 'threshold', type: 'float', title: 'Order Block Required Move %', defval: 0.3, min: 0, step: 0.05, group: GROUP_BASIC,
    tooltip: 'Reject Order Block patterns with a total % move less than this value. Measured from Close of the 1st candle to Close of the last candle in sequence. 0.30 = 0.30%',
  },
  { id: 'bullChannels', type: 'int', title: 'Bullish Zones to Show', defval: 4, min: 0, group: GROUP_BASIC, tooltip: TIP_ZONES },
  { id: 'bearChannels', type: 'int', title: 'Bearish Zones to Show', defval: 4, min: 0, group: GROUP_BASIC, tooltip: TIP_ZONES },
  {
    id: 'doji', type: 'float', title: '1st Candle Filter', defval: 0.05, min: 0, step: 0.005, group: GROUP_ADVANCED,
    tooltip: 'Reject Order Block patterns that start with a "Doji" which has a % move less than this value. Setting to zero requires the candle has moved at least one tick.\n0.05 = 0.05%',
  },
  {
    id: 'fuzzy', type: 'float', title: '2nd+ Candle Filter', defval: 0.01, min: 0, step: 0.005, group: GROUP_ADVANCED,
    tooltip: 'Accept Order Blocks with an imperfect sequence. Any candle (after the first) with a % move less than this value will be accepted, regardless of its direction. Useful for accepting "Doji" candles that appear in the middle of a sequence. Setting to zero requires the candle has moved at least one tick.\n0.01 = 0.01%',
  },
  {
    id: 'nearPrice', type: 'float', title: 'Order Block Draw Distance %', defval: 0, min: 0, step: 0.5, group: GROUP_ADVANCED,
    tooltip: 'Reject Order blocks that are too far from current Open price. A value of 0 will disable this feature.\n2.5 = 2.5%',
  },
  {
    id: 'style', type: 'string', title: 'Zone Drawing Style', defval: 'BOX', options: ['BOTH', 'BOX', 'LINE'], group: GROUP_STYLE,
    tooltip: 'BOX = a solid, borderless rectangle colored to match the direction of the OB\n\nLINE = 3 lines representing the High, Low, and Average price of the OB source\n\nBOTH = draw both previous styles',
  },
  { id: 'bullColor', type: 'color', title: 'Bullish Zone Color', defval: 'rgba(76, 175, 80, 0.35)', group: GROUP_STYLE },
  { id: 'bearColor', type: 'color', title: 'Bearish Zone Color', defval: 'rgba(255, 82, 82, 0.35)', group: GROUP_STYLE },
  { id: 'linewidthHl', type: 'int', title: "Line Width for Zone's High/Low", defval: 1, min: 0, group: GROUP_STYLE, tooltip: TIP_WIDTH },
  { id: 'linewidthAvg', type: 'int', title: "Line Width for Zone's Avg", defval: 1, min: 0, group: GROUP_STYLE, tooltip: TIP_WIDTH },
  {
    id: 'obShift', type: 'int', title: 'Order Block Candle Shift', defval: 1, min: 0, group: GROUP_EXPERIMENTAL,
    tooltip: 'Shift the source candle that is used for drawing Zones. Example: For a Bullish OB, a shift of zero selects the first candle of the pattern - the Bearish candle before a sequence of Bulls. Values higher than "Order Block Required Length" are ignored.\nDefault = 1 (selects 2nd candle)',
  },
  {
    id: 'obSelector', type: 'string', title: 'Order Block Source Selector', defval: 'OHLC', options: ['High/Low', 'OHLC', 'Context'], group: GROUP_EXPERIMENTAL,
    tooltip: 'Choose the price values to extract from the Order Block candle. These prices are used to set the top and bottom of the Zone.\n\n"High/Low" = High and Low of OB Candle.\n\n"OHLC" = From the High/Low of the OB Candle to the Open/Close, whichever is in the direction of the OB.\n\n"Context" = Context sensitive algorithm. Picks the largest wick near the OB candle with a given search length',
  },
  {
    id: 'obSearch', type: 'int', title: 'Order Block Context Search Length', defval: 2, min: 0, max: 20, group: GROUP_EXPERIMENTAL,
    tooltip: 'When using "Context" for Order Block Source Selector, you can adjust the search length. Example: A search length of 2 will start with the 1st candle in the pattern and then check the following 2 candles. Values higher than "Order Block Required Length" are ignored.',
  },
  { id: 'version', type: 'string', title: '"MTF Order Block Finder" Version #', defval: '1.504', options: ['1.504'], group: 'About' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'MTF Order Block Finder',
  shortTitle: 'MTF Order Block Finder',
  overlay: true,
};

/** study(max_lines_count = 500, max_labels_count = 500); boxes keep the default of 50 */
const MAX_LINES = 500;
const MAX_LABELS = 500;
const MAX_BOXES = 50;
/** Default box border colour of the script's language version (the border has no width) */
const BOX_BORDER = '#2196F3';

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

/** ResolutionToSec(res): the seconds of the timeframes that the script knows, 0 for any other value */
function resolutionToSec(res: string): number {
  const minutes: Record<string, number> = {
    1: 1, 3: 3, 5: 5, 10: 10, 15: 15, 30: 30, 45: 45, 60: 60, 120: 120, 180: 180, 240: 240, '1D': 1440, '1W': 10080, '1M': 43200,
  };
  return (minutes[res] ?? 0) * 60;
}

/** TimeframeToSec(): the seconds of the chart timeframe as the script counts them (a month is 30 days) */
function timeframeToSec(chartTf: string): number {
  const info = timeframe.info(chartTf);
  let mins = 0.0;
  if (info.isdwm) mins = info.isdaily ? 1440 : info.isweekly ? 10080 : info.ismonthly ? 43200 : mins;
  if (info.isintraday) mins = info.isminutes ? 1 : info.isseconds ? 1 / 60 : mins;
  return math.round(mins * 60 * info.multiplier) as number;
}

/** End (ms) of the period of timeframe `tf` that starts at `start` (ms), on the UTC calendar */
function periodEnd(start: number, tf: string): number {
  const info = timeframe.info(tf);
  if (info.ismonthly) {
    const d = new Date(start);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + info.multiplier, 1) + (start - Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  }
  return start + timeframe.in_seconds(tf) * 1000;
}

/** A drawing of the script: bar indexes, or times in ms when `byTime` */
interface LineObj {
  dead: boolean;
  byTime: boolean;
  x1: number;
  x2: number;
  y: number;
  color: string;
  width: number;
  style?: 'dashed';
  extend?: 'right';
}
interface BoxObj {
  dead: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  bg: string;
}
interface LabelObj {
  dead: boolean;
  byTime: boolean;
  x: number;
  y: number;
  yloc: 'price' | 'abovebar' | 'belowbar';
  text: string;
  color: string;
}

/**
 * The drawing count limit of Pine: when a creation brings the count of one kind above max + 5, the oldest objects
 * are deleted until max remain.
 */
function register<T extends { dead: boolean }>(list: T[], obj: T, max: number): T {
  list.push(obj);
  if (list.length > max + 5) {
    for (const old of list.splice(0, list.length - max)) old.dead = true;
  }
  return obj;
}

/** line.delete / box.delete */
function remove<T extends { dead: boolean }>(list: T[], obj: T): void {
  if (obj.dead) return;
  obj.dead = true;
  list.splice(list.indexOf(obj), 1);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<MtfOrderBlockFinderInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { threshold, doji, fuzzy, style } = cfg;
  const n = bars.length;
  const result = (lines: LineDrawingData[], boxes: BoxData[], labels: LabelData[]) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay }, plots: {}, lines, boxes, labels,
  });
  const chartTf = chartTimeframe(bars, chart);
  if (n === 0 || chartTf === '') return result([], [], []);

  // Input sanitization
  const obSearch = cfg.obSearch >= cfg.obPeriod ? cfg.obPeriod : cfg.obSearch;
  const obShift = cfg.obShift >= cfg.obPeriod ? cfg.obPeriod : cfg.obShift;
  const obPeriod = cfg.obPeriod + 1;

  const isMs = bars[0].time >= 1e12;
  const tMs = (i: number) => (isMs ? bars[i].time : bars[i].time * 1000);
  const chartSec = timeframeToSec(chartTf);
  const res = chartSec > resolutionToSec(cfg.resolution) ? '' : cfg.resolution;
  const resSec = resolutionToSec(res);
  const warmup = obPeriod;
  const mtfWarmup = res === '' ? warmup : (warmup * resSec) / chartSec;

  // Candles of the timeframe: `latest[i]` is the last closed one at chart bar i (security without lookahead), and a
  // chart bar where it changes carries the values of the request with gaps
  let candles: Bar[] = bars;
  let candleMs: number[] = bars.map((_, i) => tMs(i));
  let latest: number[] = bars.map((_, i) => i);
  if (res !== '') {
    const sb = securityBars(bars, res, chart);
    if (sb) {
      candles = sb.htf;
      latest = sb.latest;
      candleMs = sb.htf.map((b) => (isMs ? b.time : b.time * 1000));
    } else {
      const starts = periodStarts(bars, res, chart);
      candles = [];
      latest = [];
      bars.forEach((b, i) => {
        if (i === 0 || starts[i] !== starts[i - 1]) {
          candles.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
        } else {
          const c = candles[candles.length - 1];
          c.high = Math.max(c.high, b.high);
          c.low = Math.min(c.low, b.low);
          c.close = b.close;
          c.volume = (c.volume ?? NaN) + (b.volume ?? NaN);
        }
        const g = candles.length - 1;
        // the candle is closed by the last chart bar of its period (the last bar: when its close reaches the period end)
        const startMs = isMs ? starts[i] : starts[i] * 1000;
        const closes = i < n - 1 ? starts[i + 1] !== starts[i] : tMs(i) + timeframe.in_seconds(chartTf) * 1000 >= periodEnd(startMs, res);
        latest.push(closes ? g : g - 1);
      });
      candleMs = candles.map((b) => (isMs ? b.time : b.time * 1000));
    }
  }
  // The script skips the bars where the bar index of the candle (counted in the history of its own timeframe) is
  // below mtf_warmup. The bars do not say how long that history is. On a daily or higher chart the candles are
  // counted from the first bar (the bars are taken as the full history of the symbol). On an intraday chart the
  // history of the higher timeframe is taken as longer than mtf_warmup candles, as it is on the platform, where
  // intraday bars start much later than the bars of higher timeframes.
  const countsFromFirstBar = res === '' || timeframe.info(chartTf).isdwm;
  /** Chart bars that close a candle, with the candle */
  const closings: Array<{ bar: number; candle: number }> = [];
  for (let i = 0; i < n; i++) {
    if (latest[i] >= 0 && (i === 0 || latest[i] !== latest[i - 1])) closings.push({ bar: i, candle: latest[i] });
  }

  // time_close(res): the close time (ms) of the period of the timeframe that holds the bar
  let closeMs: number[] = [];
  if (chart && hasCalendar(chart)) {
    try {
      executeScript(() => {
        closeMs = Array.from((res === '' ? scriptTimeClose : scriptTimeClose(res)).toArray(), (v) => v ?? NaN);
      }, bars.map((b) => ({ time: b.time, open: 1, high: 1, low: 1, close: 1, volume: 1 })), {}, {
        timeframe: chartTf, timezone: chart.timezone, session: chart.session, regularSession: chart.regularSession,
        sessionType: chart.sessionType, timeUnit: isMs ? 'ms' : 's',
      });
    } catch {
      closeMs = [];
    }
  }
  if (closeMs.length !== n) {
    if (res === '') {
      closeMs = bars.map((_, i) => tMs(i) + timeframe.in_seconds(chartTf) * 1000);
    } else {
      const starts = periodStarts(bars, res, chart);
      closeMs = starts.map((s) => periodEnd(isMs ? s : s * 1000, res));
    }
  }

  const bull = cfg.bullColor;
  const bear = cfg.bearColor;
  const allLines: LineObj[] = [];
  const allBoxes: BoxObj[] = [];
  const allLabels: LabelObj[] = [];
  // var arrays of the zones: [average, high, low] lines and the boxes, oldest first
  const zoneLines: Record<'bull' | 'bear', LineObj[][]> = { bull: [], bear: [] };
  const zoneBoxes: Record<'bull' | 'bear', BoxObj[]> = { bull: [], bear: [] };
  let selectorShift = obShift;
  const syncMult = Math.trunc(resSec / chartSec);
  const withLines = style === 'LINE' || style === 'BOTH';
  const withBoxes = style === 'BOX' || style === 'BOTH';

  let pointer = -1;
  for (let i = 0; i < n; i++) {
    while (pointer + 1 < closings.length && closings[pointer + 1].bar <= i) pointer++;

    // Despawn distant objects
    if (cfg.nearPrice > 0 && i === n - 1) {
      const source = bars[i].open;
      const limit = (source * cfg.nearPrice) / 100;
      const far = (top: number, bottom: number) => gt(Math.abs(top - source), limit) && gt(Math.abs(bottom - source), limit);
      for (const side of ['bull', 'bear'] as const) {
        if (withLines) {
          const list = zoneLines[side];
          for (let k = list.length - 1; k >= 0; k--) {
            const [, h, l] = list[k];
            // a line deleted by the count limit has no price
            if (far(h.dead ? NaN : h.y, l.dead ? NaN : l.y)) {
              for (const ln of list[k]) remove(allLines, ln);
              list.splice(k, 1);
            }
          }
        }
        if (withBoxes) {
          const list = zoneBoxes[side];
          for (let k = list.length - 1; k >= 0; k--) {
            if (far(list[k].dead ? NaN : list[k].top, list[k].dead ? NaN : list[k].bottom)) {
              remove(allBoxes, list[k]);
              list.splice(k, 1);
            }
          }
        }
      }
    }

    // Rem_Gaps_Security: the values of the candles closed in the last mtf_warmup + 1 chart bars, newest first. They
    // are used when there are more than `warmup` of them.
    if (latest[i] < 0 || (countsFromFirstBar && latest[i] < mtfWarmup)) continue;
    const window: number[] = [];
    for (let k = pointer; k >= 0 && window.length <= warmup && i - closings[k].bar <= mtfWarmup; k--) window.push(closings[k].candle);
    if (window.length <= warmup) continue;
    // the current bar closes a candle (the request with gaps is not na)
    const nastate = pointer >= 0 && closings[pointer].bar === i;
    const c = (k: number) => candles[window[k]];

    const first = c(obPeriod);
    const relmove = gt(100 * (Math.abs(first.close - c(1).close) / first.close), threshold);
    const dojiCandle = gt((100 * Math.abs(first.close - first.open)) / first.open, doji);
    const bullishOB = gt(first.open, first.close);
    const bearishOB = gt(first.close, first.open);
    let upcandles = 0;
    let downcandles = 0;
    for (let k = 1; k <= obPeriod - 1; k++) {
      const b = c(k);
      // Is_Zero_Candle
      if (eq(b.open, b.close) && eq(b.open, b.high) && eq(b.open, b.low)) continue;
      if (gt(fuzzy, Math.abs((100 * (b.close - b.open)) / b.open))) {
        upcandles += 1;
        downcandles += 1;
        continue;
      }
      if (gt(b.close, b.open)) upcandles += 1;
      else if (gt(b.open, b.close)) downcandles += 1;
    }

    let obBull = false;
    let obBear = false;
    let bullHigh = NaN;
    let bullLow = NaN;
    let bearHigh = NaN;
    let bearLow = NaN;
    /**
     * Low_Wick_Search / High_Wick_Search: from candle `start`, the candle with the lowest low (highest high) among
     * the next `len` ones (a later one wins a tie): [zone top, zone bottom, its place]
     */
    const wickSearch = (start: number, len: number, lowSide: boolean): [number, number, number] => {
      let wickH = NaN;
      let wickL = NaN;
      let index = NaN;
      for (let k = 0; k <= len; k++) {
        const b = c(start - k);
        if (k > 0 && (lowSide ? gt(b.low, wickL) : gt(wickH, b.high))) continue;
        const up = Math.sign(b.close - b.open) === 1;
        if (lowSide) {
          wickH = up ? b.close : b.open;
          wickL = b.low;
        } else {
          wickL = up ? b.open : b.close;
          wickH = b.high;
        }
        index = k;
      }
      return [wickH, wickL, index];
    };
    if (dojiCandle && relmove && nastate) {
      obBull = bullishOB && upcandles === obPeriod - 1;
      obBear = bearishOB && downcandles === obPeriod - 1;
      for (const lowSide of [true, false]) {
        if (lowSide ? !obBull : !obBear) continue;
        let high = NaN;
        let low = NaN;
        if (cfg.obSelector === 'Context') {
          [high, low, selectorShift] = wickSearch(obPeriod, obSearch, lowSide);
        } else if (cfg.obSelector === 'High/Low') {
          high = c(obPeriod - selectorShift).high;
          low = c(obPeriod - selectorShift).low;
        } else if (cfg.obSelector === 'OHLC') {
          [high, low] = wickSearch(obPeriod - selectorShift, 0, lowSide);
        }
        if (lowSide) [bullHigh, bullLow] = [high, low];
        else [bearHigh, bearLow] = [high, low];
      }
    }
    const bullAvg = (bullHigh + bullLow) / 2;
    const bearAvg = (bearLow + bearHigh) / 2;

    // Zones, from the bar where the pattern is found
    const sync = closeMs[i] - (res === '' ? chartSec * 1000 : resSec * 1000);
    const zones: Array<['bull' | 'bear', boolean, number, number, number, string, number]> = [
      ['bull', obBull, bullAvg, bullHigh, bullLow, bull, cfg.bullChannels],
      ['bear', obBear, bearAvg, bearHigh, bearLow, bear, cfg.bearChannels],
    ];
    if (withLines) {
      for (const [side, found, avg, high, low, col, count] of zones) {
        if (!found || count <= 0) continue;
        const list = zoneLines[side];
        if (list.length === count) for (const ln of list.shift() ?? []) remove(allLines, ln);
        const zoneLine = (y: number, width: number, dashed: boolean) => register<LineObj>(allLines, {
          dead: false, byTime: true, x1: sync, x2: sync + 12, y, color: width > 0 ? col : 'transparent', width, extend: 'right',
          ...(dashed ? { style: 'dashed' as const } : {}),
        }, MAX_LINES);
        list.push([zoneLine(avg, cfg.linewidthAvg, true), zoneLine(high, cfg.linewidthHl, false), zoneLine(low, cfg.linewidthHl, false)]);
      }
    }
    if (withBoxes) {
      for (const [side, found, , high, low, col, count] of zones) {
        if (!found || count <= 0) continue;
        const list = zoneBoxes[side];
        if (list.length === count) {
          const old = list.shift();
          if (old) remove(allBoxes, old);
        }
        list.push(register<BoxObj>(allBoxes, { dead: false, left: sync, right: sync + 12, top: high, bottom: low, bg: col }, MAX_BOXES));
      }
    }

    // Marks on the order block candle
    const startTime = Math.round(candleMs[window[obPeriod - selectorShift]]);
    const endTime = Math.round(candleMs[window[obPeriod - selectorShift - 1]]);
    const avgTime = Math.round((startTime + endTime) / 2);
    const os = -(obPeriod - selectorShift) * (res === '' ? 1 : syncMult);
    for (const [side, found, avg, high, low, col] of zones) {
      if (!found) continue;
      const solid = String(color.new(col, 0));
      const isBull = side === 'bull';
      const text = isBull ? 'Bull OB' : 'Bear OB';
      if (res === '') {
        register<LabelObj>(allLabels, { dead: false, byTime: false, x: i + os, y: 0, yloc: isBull ? 'belowbar' : 'abovebar', text, color: solid }, MAX_LABELS);
        // Horizontal_Line(price, colour, width, os, os - sync_mult)
        for (const [y, width] of [[high, 2], [low, 2], [avg, 1]]) {
          register<LineObj>(allLines, { dead: false, byTime: false, x1: i + os + 1, x2: i + os - syncMult - 1, y, color: solid, width }, MAX_LINES);
        }
      } else {
        register<LabelObj>(allLabels, { dead: false, byTime: true, x: avgTime, y: isBull ? low : high, yloc: 'price', text, color: solid }, MAX_LABELS);
        const marks: Array<[number, number, number]> = [[high, startTime - 1, 2], [low, startTime, 2], [avg, startTime, 1]];
        for (const [y, x1, width] of marks) {
          register<LineObj>(allLines, { dead: false, byTime: true, x1, x2: endTime, y, color: solid, width }, MAX_LINES);
        }
      }
    }
  }

  /** A bar index or a time in ms as a time of the bars */
  const timeOf = (x: number, byTime: boolean) => (byTime ? (isMs ? x : x / 1000) : barTime(bars, x));
  return result(
    allLines.map((ln) => ({
      time1: timeOf(ln.x1, ln.byTime), price1: ln.y, time2: timeOf(ln.x2, ln.byTime), price2: ln.y, color: ln.color, width: ln.width,
      ...(ln.style ? { style: ln.style } : {}), ...(ln.extend ? { extend: ln.extend } : {}),
    })),
    allBoxes.map((b) => ({
      time1: timeOf(b.left, true), price1: b.top, time2: timeOf(b.right, true), price2: b.bottom, bgColor: b.bg,
      borderColor: BOX_BORDER, borderWidth: 0, extend: 'right' as const,
    })),
    allLabels.map((l) => ({
      time: timeOf(l.x, l.byTime), price: l.y, text: l.text, color: l.color, textColor: l.color, style: 'none' as const,
      size: 'small' as const, ...(l.yloc !== 'price' ? { yloc: l.yloc } : {}),
    })),
  );
}

export const MtfOrderBlockFinder = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
