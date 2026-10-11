/**
 * Support & Resistance (MTF) | Flux Charts
 *
 * Support and resistance levels from pivots, on up to three timeframes. On the last 500 bars of a timeframe, a
 * pivot low ("Pivot Length" bars on each side) is a support and a pivot high a resistance, unless a level that is
 * not broken is closer than ATR(20) / 8 (the original compares both kinds of pivot with the pivot low). The 10 most
 * recent levels are kept per timeframe. A resistance is broken when the close (or the high, "Invalidation" Wick)
 * goes above it, a support when it goes below ("Avoid False Breaks": only with a volume above the 20-bar average x
 * the threshold). A bar that touches a level and closes on its side is a retest and adds 1 to its strength. With
 * "Inverse Color After Broken" a broken level continues as a level of the other kind.
 *
 * On the last 4,000 chart bars the levels of the enabled timeframes are collected. Start and break of a level are
 * moved to the chart bar that made them (the bar with the nearest high / low, the first bar beyond the level). A
 * level is shown when its strength is at least "Strength", when it lasted at least 5 chart bars if broken, and when
 * no shown level of the same kind is closer than ATR / 8 (the text of that level then names both timeframes).
 * Drawings: a line (or a zone box, "Style") from the start to the break, or extended ("Expand Lines & Zones"); a
 * text label "timeframe | price" (in the middle of a line that is not extended, else 20 bars after the last bar),
 * a "B" label on the break bar and "R" labels on the retest bars of the chart (at least 3 bars apart).
 *
 * Timeframes: "" is the chart timeframe. A higher timeframe is computed on bars built from the chart bars (UTC
 * calendar, see anchor-period); its levels are those of its last completed bar (the last chart bar completes a
 * period when it is the last bar of its trading day and the next weekday is in another period). A timeframe below
 * the chart timeframe throws an error (the bars do not carry that data). Each timeframe is computed on its own, as the
 * request function is documented; in the original, with two requested timeframes, the higher one can move the start
 * or the break of a level of the lower one to one of its own bars before the chart reads it (the level objects are
 * shared between the requests): such a level starts or ends on another bar. The original places its drawings by time:
 * a time between two bars is on the next bar; a time after the last bar is on the bar slot that holds it (slots of
 * the weekdays, with the bar times of the trading day before, on symbols without weekend bars).
 *
 * Chart context (optional third argument): the prices in the texts use the price tick of the symbol (`mintick`;
 * 0.01 without it). The original redraws on closed bars only: when the context says that the last bar is still open
 * (`lastBarConfirmed` false), the drawings are those of the bar before it; without it every bar is a closed bar.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Support & Resistance (MTF) | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, str, color, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe, periodStarts, securityBars } from '../anchor-period';
import { mintickOf, lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SupportAndResistanceFluxChartsInputs {
  srPivotLength: number;
  srStrength: number;
  srInvalidation: 'Wick' | 'Close';
  /** Expand Lines & Zones */
  expandZones: 'All' | 'Only Valid' | 'None';
  showInvalidated: boolean;
  timeframe1Enabled: boolean;
  timeframe1: string;
  timeframe2Enabled: boolean;
  timeframe2: string;
  timeframe3Enabled: boolean;
  timeframe3: string;
  showBreaks: boolean;
  showRetests: boolean;
  avoidFalseBreaks: boolean;
  breakVolumeThreshold: number;
  inverseBrokenLineColor: boolean;
  styleMode: 'Lines' | 'Zones';
  lineStyle: '____' | '----' | '....';
  lineWidth: number;
  /** Zone Width */
  zoneSize: number;
  supportColor: string;
  resistanceColor: string;
  breakColor: string;
  textColor: string;
  enableRetestAlerts: boolean;
  enableBreakAlerts: boolean;
}

export const defaultInputs: SupportAndResistanceFluxChartsInputs = {
  srPivotLength: 15,
  srStrength: 1,
  srInvalidation: 'Close',
  expandZones: 'Only Valid',
  showInvalidated: true,
  timeframe1Enabled: true,
  timeframe1: '',
  timeframe2Enabled: false,
  timeframe2: 'D',
  timeframe3Enabled: false,
  timeframe3: 'W',
  showBreaks: true,
  showRetests: true,
  avoidFalseBreaks: false,
  breakVolumeThreshold: 0.3,
  inverseBrokenLineColor: false,
  styleMode: 'Lines',
  lineStyle: '____',
  lineWidth: 2,
  zoneSize: 1.0,
  supportColor: 'rgba(8, 153, 129, 0.5)',
  resistanceColor: 'rgba(242, 54, 69, 0.5)',
  breakColor: '#2962FF',
  textColor: 'rgba(255, 255, 255, 0.5)',
  enableRetestAlerts: true,
  enableBreakAlerts: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'srPivotLength', type: 'int', title: 'Pivot Length', defval: 15, min: 3, max: 50, group: 'General Configuration' },
  { id: 'srStrength', type: 'int', title: 'Strength', defval: 1, min: 1, max: 3, group: 'General Configuration' }, // Pine options = [1, 2, 3]
  { id: 'srInvalidation', type: 'string', title: 'Invalidation', defval: 'Close', options: ['Wick', 'Close'], group: 'General Configuration' },
  { id: 'expandZones', type: 'string', title: 'Expand Lines & Zones', defval: 'Only Valid', options: ['All', 'Only Valid', 'None'], group: 'General Configuration' },
  { id: 'showInvalidated', type: 'bool', title: 'Show Invalidated', defval: true, group: 'General Configuration' },
  { id: 'timeframe1Enabled', type: 'bool', title: '', defval: true, group: 'Timeframes', inline: 'timeframe1' },
  { id: 'timeframe1', type: 'timeframe', title: '', defval: '', group: 'Timeframes', inline: 'timeframe1' },
  { id: 'timeframe2Enabled', type: 'bool', title: '', defval: false, group: 'Timeframes', inline: 'timeframe2' },
  { id: 'timeframe2', type: 'timeframe', title: '', defval: 'D', group: 'Timeframes', inline: 'timeframe2' },
  { id: 'timeframe3Enabled', type: 'bool', title: '', defval: false, group: 'Timeframes', inline: 'timeframe3' },
  { id: 'timeframe3', type: 'timeframe', title: '', defval: 'W', group: 'Timeframes', inline: 'timeframe3' },
  { id: 'showBreaks', type: 'bool', title: 'Show Breaks', defval: true, group: 'Breaks & Retests', inline: 'ShowBR' },
  { id: 'showRetests', type: 'bool', title: 'Show Retests', defval: true, group: 'Breaks & Retests', inline: 'ShowBR' },
  { id: 'avoidFalseBreaks', type: 'bool', title: 'Avoid False Breaks', defval: false, group: 'Breaks & Retests' },
  {
    id: 'breakVolumeThreshold', type: 'float', title: 'Break Volume Threshold', defval: 0.3, min: 0.1, max: 2.0, step: 0.1, group: 'Breaks & Retests',
    tooltip: "Only taken into account if Avoid False Breakouts is enabled.\nHigher values mean it's less likely to be a break.",
  },
  { id: 'inverseBrokenLineColor', type: 'bool', title: 'Inverse Color After Broken', defval: false, group: 'Breaks & Retests' },
  { id: 'styleMode', type: 'string', title: 'Style', defval: 'Lines', options: ['Lines', 'Zones'], group: 'Style' },
  { id: 'lineStyle', type: 'string', title: 'Line Style', defval: '____', options: ['____', '----', '....'], group: 'Style' },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, group: 'Style' },
  { id: 'zoneSize', type: 'float', title: 'Zone Width', defval: 1.0, min: 0.1, max: 10, step: 0.1, group: 'Style' },
  { id: 'supportColor', type: 'color', title: 'Support Color', defval: 'rgba(8, 153, 129, 0.5)', group: 'Style', inline: 'RScolors' },
  { id: 'resistanceColor', type: 'color', title: 'Resistance Color', defval: 'rgba(242, 54, 69, 0.5)', group: 'Style', inline: 'RScolors' },
  { id: 'breakColor', type: 'color', title: 'Break Color', defval: '#2962FF', group: 'Style', inline: 'RScolors2' },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: 'rgba(255, 255, 255, 0.5)', group: 'Style', inline: 'RScolors2' },
  { id: 'enableRetestAlerts', type: 'bool', title: 'Enable Retest Alerts', defval: true, tooltip: 'Needs Show Retests option enabled.', group: 'Alerts' },
  { id: 'enableBreakAlerts', type: 'bool', title: 'Enable Break Alerts', defval: true, tooltip: 'Needs Show Breaks option enabled.', group: 'Alerts' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Support & Resistance (MTF) | Flux Charts',
  shortTitle: 'Support & Resistance (MTF) | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const MAX_SR_INFO_LIST_SIZE = 10;
const MAX_BAR_INFO_LIST_SIZE = 3000;
const MAX_DISTANCE_TO_LAST_BAR = 500;
const MIN_SR_SIZE = 5;
const RETEST_LABEL_COOLDOWN = 3;
const TOO_CLOSE_ATR = 1.0 / 8.0;
const LABEL_OFFSET_BARS = 20;
const ATR_LEN = 20;
/** max_lines_count / max_labels_count / max_boxes_count */
const MAX_DRAWINGS = 500;
const DAY = 86400000;

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10; na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

type SrType = 'Support' | 'Resistance';

/** type srInfo: times in ms; breakTime is na (NaN) while the level is not broken */
interface SrInfo {
  startTime: number;
  price: number;
  srType: SrType;
  strength: number;
  timeframeStr: string;
  ephemeral: boolean;
  breakTime: number;
  retestTimes: number[];
}

/** A drawing of the script: `alive` is false after a delete; `x` is the time of a retest label */
interface Drawing<T> {
  alive: boolean;
  x: number;
  data: T | null;
}

/** type srObj */
interface SrObj {
  info: SrInfo;
  startFixed: boolean;
  breakFixed: boolean;
  rendered: boolean;
  combinedTimeframeStr: string | null;
  /** Deletes of the drawings of the level */
  drawings: Array<() => void>;
  retestLabels: Array<Drawing<LabelData>>;
}

/**
 * Drawings of one kind with the count limit of the original: a creation that brings the count above max + 5 deletes
 * the oldest ones until max remain.
 */
function drawingList<T>(max: number) {
  let items: Array<Drawing<T>> = [];
  let head = 0;
  let count = 0;
  return {
    create(x: number, data: T | null): Drawing<T> {
      const d: Drawing<T> = { alive: true, x, data };
      items.push(d);
      count += 1;
      if (count > max + 5) {
        while (count > max) {
          if (items[head].alive) {
            items[head].alive = false;
            count -= 1;
          }
          head += 1;
        }
      }
      if (head > 4096) {
        items = items.slice(head);
        head = 0;
      }
      return d;
    },
    remove(d: Drawing<T>) {
      if (d.alive) {
        d.alive = false;
        count -= 1;
      }
    },
    alive: (): T[] => items.filter((d) => d.alive && d.data !== null).map((d) => d.data as T),
  };
}

const timeMsOf = (bars: Bar[]) => {
  const ms = bars.length > 0 && bars[0].time >= 1e12;
  return (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
};

/**
 * The level list (allSRInfoList) of the script on the bars of one timeframe. `each` is called after every bar with
 * the list as it is on that bar (the objects are changed by the later bars).
 */
function levelLists(bars: Bar[], period: string, cfg: SupportAndResistanceFluxChartsInputs, each: (i: number, list: SrInfo[]) => void): void {
  const n = bars.length;
  const last = n - 1;
  const timeMs = timeMsOf(bars);
  const len = Math.trunc(cfg.srPivotLength);
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const atr = arr(ta.atr(bars, ATR_LEN));
  const avgVolume = arr(ta.sma(new Series(bars, (b) => b.volume ?? NaN), ATR_LEN));
  const pivotHighs = arr(ta.pivothigh(new Series(bars, (b) => b.high), len, len));
  const pivotLows = arr(ta.pivotlow(new Series(bars, (b) => b.low), len, len));
  const closeInvalidation = cfg.srInvalidation === 'Close';
  const list: SrInfo[] = [];

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const time = timeMs(i);
    if (i > last - MAX_DISTANCE_TO_LAST_BAR) {
      const pivotLow = pivotLows[i];
      const pivotHigh = pivotHighs[i];
      // Both tests compare with the pivot low, as the original
      const tooClose = () => list.some((s) => lt(Math.abs(s.price - pivotLow), atr[i] * TOO_CLOSE_ATR) && isNaN(s.breakTime));
      const newLevel = (price: number, srType: SrType): SrInfo => ({
        startTime: timeMs(i - len), price, srType, strength: 1, timeframeStr: period, ephemeral: false, breakTime: NaN, retestTimes: [],
      });
      if (!isNaN(pivotLow) && !tooClose()) {
        list.unshift(newLevel(pivotLow, 'Support'));
        while (list.length > MAX_SR_INFO_LIST_SIZE) list.pop();
      }
      if (!isNaN(pivotHigh) && !tooClose()) {
        list.unshift(newLevel(pivotHigh, 'Resistance'));
        if (list.length > MAX_SR_INFO_LIST_SIZE) list.pop();
      }

      // Breaks, strength and retests (the end of the loop is read on every pass: a level added in front moves the others)
      const volumeOk = !cfg.avoidFalseBreaks || gt(b.volume ?? NaN, avgVolume[i] * cfg.breakVolumeThreshold);
      for (let k = 0; k <= list.length - 1; k++) {
        const s = list[k];
        if (isNaN(s.breakTime)) {
          const resistance = s.srType === 'Resistance';
          const broken = resistance ? gt(closeInvalidation ? b.close : b.high, s.price) : lt(closeInvalidation ? b.close : b.low, s.price);
          if (broken && volumeOk) {
            s.breakTime = time;
            if (cfg.inverseBrokenLineColor && !s.ephemeral && s.strength >= cfg.srStrength) {
              list.unshift({
                startTime: time, price: s.price, srType: resistance ? 'Support' : 'Resistance', strength: s.strength,
                timeframeStr: s.timeframeStr, ephemeral: true, breakTime: NaN, retestTimes: [],
              });
            }
          }
        }
        if (isNaN(s.breakTime) && time > s.startTime) {
          const retest = s.srType === 'Resistance' ? ge(b.high, s.price) && le(b.close, s.price) : le(b.low, s.price) && ge(b.close, s.price);
          if (retest && (s.retestTimes.length > 0 ? s.retestTimes[0] : 0) !== time) {
            if (!s.ephemeral) s.strength += 1;
            s.retestTimes.unshift(time);
          }
        }
      }
    }
    each(i, list);
  }
}

/**
 * Time of the bar that would follow the last bar. On symbols without weekend bars the next bar of the last bar of a
 * trading day (a bar at the time of day of the last bar of the day before, or any daily bar) is the first bar of the
 * next weekday.
 */
function nextBarTime(bars: Bar[]): number {
  return futureBarTimes(bars)(1);
}

/**
 * Times (ms) of the bar slots after the last bar: slot 1 is the next bar. Symbols with weekend bars, weekly and
 * monthly bars: one slot per bar interval. Other symbols: daily bars on the weekdays; intraday bars on the weekdays
 * at the bar times of the trading day before the last one.
 */
function futureBarTimes(bars: Bar[]): (slot: number) => number {
  const n = bars.length;
  const unit = bars[0].time >= 1e12 ? 1 : 1000;
  const t = (i: number) => bars[i].time * unit;
  const interval = barInterval(bars) * unit;
  const tLast = t(n - 1);
  const uniform = (slot: number) => tLast + slot * interval;
  const dayOf = (x: number) => Math.floor(x / DAY) * DAY;
  const weekend = (x: number) => [0, 6].includes(new Date(x).getUTCDay());
  if (interval >= 7 * DAY || bars.some((b) => weekend(b.time * unit))) return uniform;
  const nextWeekday = (day: number) => {
    let d = day + DAY;
    while (weekend(d)) d += DAY;
    return d;
  };
  let offsets = [tLast - dayOf(tLast)];
  let rest: number[] = [];
  if (interval < DAY) {
    // first and last bar of the trading day before the last one
    let d0 = n - 1;
    while (d0 > 0 && dayOf(t(d0 - 1)) === dayOf(tLast)) d0--;
    if (d0 === 0) return uniform;
    let p0 = d0 - 1;
    while (p0 > 0 && dayOf(t(p0 - 1)) === dayOf(t(d0 - 1))) p0--;
    offsets = [];
    for (let i = p0; i < d0; i++) offsets.push(t(i) - dayOf(t(i)));
    rest = offsets.filter((o) => o > tLast - dayOf(tLast));
  }
  return (slot: number) => {
    if (slot <= rest.length) return slot <= 0 ? tLast + slot * interval : dayOf(tLast) + rest[slot - 1];
    let k = slot - rest.length - 1;
    let day = nextWeekday(dayOf(tLast));
    for (; k >= offsets.length; k -= offsets.length) day = nextWeekday(day);
    return day + offsets[k];
  };
}

/**
 * request.security(syminfo.tickerid, tf, allSRInfoList) for a higher timeframe: the list of the last completed bar of
 * the timeframe at each chart bar (null before the first one). A chart bar completes its period when the next bar is
 * in another period (for the last chart bar: the bar that would follow it, see nextBarTime).
 */
function higherTimeframeLevels(bars: Bar[], tf: string, cfg: SupportAndResistanceFluxChartsInputs, context?: ChartContext): Array<SrInfo[] | null> {
  const n = bars.length;
  const unit = bars[0].time >= 1e12 ? 1 : 1000;
  // With the exchange calendar of the chart context (time zone and session): the periods and the bars that
  // complete them come from the library rule (see anchor-period.ts)
  const exchange = securityBars(bars, tf, context);
  const starts = exchange ? exchange.starts : periodStarts(bars, tf);
  const htf: Bar[] = exchange ? exchange.htf : [];
  const group: number[] = exchange ? exchange.group : [];
  if (!exchange) bars.forEach((b, i) => {
    if (i === 0 || starts[i] !== starts[i - 1]) {
      htf.push({ time: starts[i], open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? NaN });
    } else {
      const cur = htf[htf.length - 1];
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume = (cur.volume ?? NaN) + (b.volume ?? NaN);
    }
    group.push(htf.length - 1);
  });
  // timeframe.period of the requested timeframe
  const period = tf.replace(/^1([DWM])$/, '$1');
  const snapshots: SrInfo[][] = [];
  levelLists(htf, period, cfg, (_, list) => snapshots.push(list.map((s) => ({ ...s, retestTimes: [] }))));
  if (exchange) return exchange.latest.map((k) => (k >= 0 ? snapshots[k] : null));
  const lastCompletes = periodStarts([...bars.slice(Math.max(0, n - 3000)), { time: nextBarTime(bars) / unit }], tf).pop() !== starts[n - 1];
  return group.map((g, i) => {
    const complete = i < n - 1 ? group[i + 1] !== g : lastCompletes;
    const k = complete ? g : g - 1;
    return k >= 0 ? snapshots[k] : null;
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupportAndResistanceFluxChartsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'labels'> & { boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const lineList = drawingList<LineDrawingData>(MAX_DRAWINGS);
  const boxList = drawingList<BoxData>(MAX_DRAWINGS);
  const labelList = drawingList<LabelData>(MAX_DRAWINGS);
  const result = () => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: boxList.alive(),
    lines: lineList.alive(),
    labels: labelList.alive(),
  });
  if (n === 0) return result();

  const timeMs = timeMsOf(bars);
  const chartTf = chartTimeframe(bars, chart);
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const curTFMS = chartSeconds * 1000;
  // timeframe.period
  const chartPeriod = chartTf.replace(/^1([DWM])$/, '$1');
  const zoneSizeATR = cfg.zoneSize * 0.075;
  const atr = ta.atr(bars, ATR_LEN).toArray().map((v) => v ?? NaN);

  // formatTimeframeString()
  const formatTimeframe = (tf: string): string => {
    if (/[DWSM]/.test(tf)) return timeframe.from_seconds(timeframe.in_seconds(tf));
    const seconds = timeframe.in_seconds(tf);
    if (seconds >= 3600) {
      const hourCount = Math.trunc(seconds / 3600);
      return `${hourCount} Hour${hourCount > 1 ? 's' : ''}`;
    }
    return `${tf} Min`;
  };

  // The level list of each enabled timeframe at each chart bar
  const tfs = [
    { tf: cfg.timeframe1, enabled: cfg.timeframe1Enabled },
    { tf: cfg.timeframe2, enabled: cfg.timeframe2Enabled },
    { tf: cfg.timeframe3, enabled: cfg.timeframe3Enabled },
  ];
  const higher = tfs.map(({ tf, enabled }) => {
    if (!enabled || tf.trim() === '' || timeframe.in_seconds(tf) === chartSeconds) return null;
    if (timeframe.in_seconds(tf) < chartSeconds) {
      throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the bars do not carry that data.`);
    }
    return higherTimeframeLevels(bars, tf, cfg, chart);
  });

  // Placement of a time (xloc.bar_time): the first bar that starts at or after it; a time after the start of the last
  // bar is on the bar slot that holds it
  const slotTime = futureBarTimes(bars);
  const interval = barInterval(bars);
  const place = (t: number): number => {
    if (isNaN(t)) return NaN;
    if (t > timeMs(last)) {
      let slot = 0;
      while (slotTime(slot + 1) <= t) slot++;
      return barTime(bars, last + slot, interval);
    }
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timeMs(mid) >= t) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };

  // findValRtnTime() on barInfoList (the last 3,000 chart bars up to bar i): the bars from minTime to maxTime
  // (excluded), oldest first
  const findValRtnTime = (i: number, value: number, toSearch: 'Low' | 'High' | 'Close', mode: 'Nearest' | 'Higher' | 'Lower',
    minTime: number, maxTime: number, defVal: number): number => {
    let lo = Math.max(0, i - MAX_BAR_INFO_LIST_SIZE + 1);
    let hi = i + 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timeMs(mid) >= minTime) hi = mid;
      else lo = mid + 1;
    }
    let rtnTime = defVal;
    let minDiff = NaN;
    for (let k = lo; k <= i && timeMs(k) < maxTime; k++) {
      const toLook = toSearch === 'Low' ? bars[k].low : toSearch === 'High' ? bars[k].high : bars[k].close;
      if (mode === 'Nearest') {
        const curDiff = Math.abs(value - toLook);
        if (isNaN(minDiff) || le(curDiff, minDiff)) {
          minDiff = curDiff;
          rtnTime = timeMs(k);
        }
      } else if (mode === 'Higher' ? ge(toLook, value) : le(toLook, value)) {
        return timeMs(k);
      }
    }
    return rtnTime;
  };

  const allSRList: SrObj[] = [];
  const addLine = (sr: SrObj, data: LineDrawingData | null) => {
    const d = lineList.create(NaN, data);
    sr.drawings.push(() => lineList.remove(d));
  };
  const addBox = (sr: SrObj, data: BoxData | null) => {
    const d = boxList.create(NaN, data);
    sr.drawings.push(() => boxList.remove(d));
  };
  const addLabel = (sr: SrObj, x: number, data: LabelData | null) => {
    const d = labelList.create(x, data);
    sr.drawings.push(() => labelList.remove(d));
    return d;
  };
  const wickInvalidation = cfg.srInvalidation === 'Wick';

  // fixSRToTimeframe(): start and break on the chart bar that made them
  const fixSRToTimeframe = (sr: SrObj, i: number) => {
    const info = sr.info;
    const srMS = Math.max(timeframe.in_seconds(info.timeframeStr), chartSeconds) * 1000;
    const resistance = info.srType === 'Resistance';
    if (!sr.startFixed) {
      if (!info.ephemeral) {
        info.startTime = findValRtnTime(i, info.price, resistance ? 'High' : 'Low', 'Nearest', info.startTime - srMS, info.startTime + srMS, info.startTime);
        sr.startFixed = true;
      } else {
        // the broken level that this level continues
        const parent = allSRList.find((o) => !o.info.ephemeral && !isNaN(o.info.breakTime) && eq(o.info.price, info.price) && o.info.srType !== info.srType);
        if (parent !== undefined && parent.breakFixed) {
          info.startTime = parent.info.breakTime;
          sr.startFixed = true;
        }
      }
    }
    if (!isNaN(info.breakTime) && !sr.breakFixed) {
      const toSearch = wickInvalidation ? (resistance ? 'High' : 'Low') : 'Close';
      info.breakTime = findValRtnTime(i, info.price, toSearch, resistance ? 'Higher' : 'Lower', info.breakTime - srMS, info.breakTime + srMS, info.breakTime);
      sr.breakFixed = true;
    }
  };

  const lineStyle = cfg.lineStyle === '----' ? 'dashed' : cfg.lineStyle === '....' ? 'dotted' : 'solid';
  const opaqueText = String(color.new(cfg.textColor, 0));
  // The original redraws on closed bars only (barstate.isconfirmed): an open last bar draws nothing, the drawings
  // are those of the bar before it. Without a chart context every bar is closed.
  const lastClosed = lastBarConfirmedOf(chart) ? last : last - 1;
  // syminfo.mintick (format.mintick)
  const mintick = mintickOf(chart);

  levelLists(bars, chartPeriod, cfg, (i, own) => {
    if (i > lastClosed) return;
    const b = bars[i];
    const time = timeMs(i);

    if (i > last - MAX_DISTANCE_TO_LAST_BAR * 8) {
      // handleTF(): the levels of each timeframe (copies, as a request gives them)
      tfs.forEach(({ enabled }, k) => {
        if (!enabled) return;
        const htfLevels = higher[k];
        const source = htfLevels === null ? own : htfLevels[i];
        if (source === null) return;
        for (const s of source) {
          const cur: SrInfo = { ...s, retestTimes: [...s.retestTimes] };
          const same = allSRList.find((o) => eq(o.info.price, cur.price) && o.info.ephemeral === cur.ephemeral
            && o.info.srType === cur.srType && o.info.timeframeStr === cur.timeframeStr);
          if (same !== undefined) {
            // everything is replaced except the fixed start, the fixed break and the retests
            if (same.startFixed) cur.startTime = same.info.startTime;
            if (same.breakFixed) cur.breakTime = same.info.breakTime;
            cur.retestTimes = same.info.retestTimes;
            same.info = cur;
            if (!same.breakFixed) fixSRToTimeframe(same, i);
          } else {
            cur.retestTimes = [];
            const obj: SrObj = { info: cur, startFixed: false, breakFixed: false, rendered: false, combinedTimeframeStr: null, drawings: [], retestLabels: [] };
            fixSRToTimeframe(obj, i);
            allSRList.unshift(obj);
          }
        }
      });

      // Every closed bar deletes the drawings of each level and draws it again
      const final = i === lastClosed;
      const tooCloseDistance = TOO_CLOSE_ATR * atr[i];
      for (const sr of allSRList) {
        const info = sr.info;
        // safeDeleteSRObj()
        if (sr.rendered) {
          sr.drawings.forEach((remove) => remove());
          sr.drawings = [];
          sr.rendered = false;
        }
        let tooClose = false;
        for (const other of allSRList) {
          if (other.rendered && le(Math.abs(other.info.price - info.price), tooCloseDistance) && other.info.srType === info.srType
            && other.info.ephemeral === info.ephemeral) {
            tooClose = true;
            const name = formatTimeframe(info.timeframeStr);
            if (!(other.combinedTimeframeStr ?? formatTimeframe(other.info.timeframeStr)).includes(name)) {
              other.combinedTimeframeStr = `${other.combinedTimeframeStr ?? formatTimeframe(other.info.timeframeStr)} & ${name}`;
            }
            break;
          }
        }
        const broken = !isNaN(info.breakTime);
        if (!(info.strength >= cfg.srStrength && (!broken || info.breakTime - info.startTime >= MIN_SR_SIZE * curTFMS) && !tooClose)) continue;

        // renderSRObj()
        if (broken && !cfg.showInvalidated) continue;
        sr.rendered = true;
        let endTime = broken ? info.breakTime : time + curTFMS * LABEL_OFFSET_BARS;
        let extend: 'none' | 'right' | 'both' = broken ? 'none' : 'right';
        if (cfg.expandZones === 'Only Valid' && !broken) {
          extend = 'both';
        } else if (cfg.expandZones === 'All') {
          extend = 'both';
          endTime = time + curTFMS * LABEL_OFFSET_BARS;
        }
        const resistance = info.srType === 'Resistance';
        const levelColor = resistance ? cfg.resistanceColor : cfg.supportColor;
        const title = () => `${sr.combinedTimeframeStr ?? formatTimeframe(info.timeframeStr)} | ${str.tostring(info.price, 'mintick', mintick)}`;
        if (cfg.styleMode === 'Lines') {
          addLine(sr, final ? {
            time1: place(info.startTime), price1: info.price, time2: place(endTime), price2: info.price, color: levelColor,
            width: cfg.lineWidth, style: lineStyle, extend,
          } : null);
          addLabel(sr, NaN, final ? {
            time: place(extend === 'none' ? (info.startTime + endTime) / 2 : endTime), price: info.price, text: title(),
            textColor: cfg.textColor, style: 'none',
          } : null);
        } else {
          addBox(sr, final ? {
            time1: place(info.startTime), price1: info.price + atr[i] * zoneSizeATR, time2: place(endTime), price2: info.price - atr[i] * zoneSizeATR,
            bgColor: levelColor, borderColor: 'transparent', text: title(), textColor: cfg.textColor, extend, textSize: 'normal',
            textHAlign: extend !== 'none' ? 'right' : 'center',
          } : null);
        }
        if (cfg.showBreaks && broken) {
          addLabel(sr, NaN, final ? {
            time: place(info.breakTime), price: info.price, text: 'B', yloc: resistance ? 'belowbar' : 'abovebar',
            style: resistance ? 'label_up' : 'label_down', color: cfg.breakColor, textColor: opaqueText, size: 'small',
          } : null);
        }
        // Retest labels, oldest first, at least 3 bars after the label before (a deleted label has no time)
        if (cfg.showRetests) {
          for (let r = info.retestTimes.length - 1; r >= 0; r--) {
            const retestTime = info.retestTimes[r];
            const lastLabel = sr.retestLabels.length > 0 ? sr.retestLabels[0] : null;
            const cooldownOK = !(lastLabel !== null && lastLabel.alive && Math.abs(lastLabel.x - retestTime) < curTFMS * RETEST_LABEL_COOLDOWN);
            if (cooldownOK && retestTime >= info.startTime && (!broken || retestTime < info.breakTime)) {
              sr.retestLabels = [addLabel(sr, retestTime, final ? {
                time: place(retestTime), price: info.price, text: 'R', yloc: resistance ? 'abovebar' : 'belowbar',
                style: resistance ? 'label_down' : 'label_up', color: levelColor, textColor: opaqueText, size: 'small',
              } : null)];
            }
          }
        }
      }
    }

    // Retests on the chart bars
    for (const sr of allSRList) {
      const info = sr.info;
      if (!isNaN(info.breakTime) || !(time > info.startTime)) continue;
      const retest = info.srType === 'Resistance' ? ge(b.high, info.price) && le(b.close, info.price) : le(b.low, info.price) && ge(b.close, info.price);
      if (retest && (info.retestTimes.length > 0 ? info.retestTimes[0] : 0) !== time) info.retestTimes.unshift(time);
    }
  });

  return result();
}

export const SupportAndResistanceFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
