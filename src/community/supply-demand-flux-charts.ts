/**
 * Supply & Demand (MTF) | Flux Charts
 *
 * Finds supply and demand zones on the last bars ("Max Distance To Last Bar": Low 150, Normal 500, High 1,250 bars)
 * of up to three timeframes. A candle is a momentum candle when its body is at least half of the average body of 20
 * bars. When the last 4 candles are 4 rising momentum candles (and the last demand zone is more than 5 bars old),
 * the high / low range of the bar before them is a demand zone; 4 falling momentum candles give a supply zone. A
 * zone higher than 1.5 x ATR(20) is cut to that size around its centre. A demand zone is invalidated when the candle
 * body (or the low, "Zone Invalidation" Wick) goes below its bottom, a supply zone when it goes above its top. The
 * 30 most recent zones of each side are kept per timeframe.
 *
 * Zones of the same side that overlap, in time and in price, are merged into one zone (lighter fill; its text names
 * the timeframes when they differ). A zone is shown when it is at least 10 bars of its timeframe long and starts
 * inside the last bars. Drawings per zone: the zone box (from its bar to the bar that invalidated it, or to the
 * last bar), a dashed line at its centre and a box with the timeframe text in the lower right quarter. The
 * original places them by time: each edge is on the first bar that starts at or after its time.
 *
 * Labels: "R" on a bar that enters a valid zone (high above the bottom of a supply zone, low below the top of a
 * demand zone; at most one per side every 6 bars), "B" on the bar that invalidates a zone ("Breaks"). The labels of
 * a zone are deleted when the zone is no longer in the list (e.g. after a merge, which changes its start).
 *
 * Timeframes: "" is the chart timeframe. A higher timeframe is computed on bars built from the chart bars (UTC
 * calendar, see anchor-period); its zones are those of its last completed bar (the last chart bar completes a
 * period when it is the last bar of its trading day and the next weekday is in another period). A timeframe below the chart
 * timeframe throws an error (the bars do not carry that data).
 *
 * The original redraws on closed bars only. The port reads the state of the last bar from the chart context (third
 * argument): while the last bar is open, the drawings are those of the bar before. Without the value every bar is
 * a closed bar.
 *
 * Periods and the chart context (optional third argument of calculate): with the exchange time zone and the session
 * of the symbol (`timezone`, `session`) the periods are those of the exchange calendar (its trading days, holidays
 * and session hours), and a bar of a higher timeframe is complete on the chart bar whose close reaches the end of
 * its period, see src/anchor-period.ts.
 * Without them the port uses the UTC calendar and the bars, as described in this header. `timeframe`, when given,
 * is the chart timeframe; without it the chart timeframe is read from the bar spacing.
 *
 * Reference: "Supply & Demand (MTF) | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import { ta, color, timeframe, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { chartTimeframe, periodStarts, securityBars } from '../anchor-period';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface SupplyDemandFluxChartsInputs {
  /** Max Distance To Last Bar */
  maxDistanceString: 'High' | 'Normal' | 'Low';
  /** Zone Invalidation */
  sdEndMethod: 'Wick' | 'Close';
  retestsEnabled: boolean;
  breaksEnabled: boolean;
  /** Show Historic Zones */
  showInvalidated: boolean;
  bullSDZoneColor: string;
  bearSDZoneColor: string;
  timeframe1Enabled: boolean;
  timeframe1: string;
  timeframe2Enabled: boolean;
  timeframe2: string;
  timeframe3Enabled: boolean;
  timeframe3: string;
  textColor: string;
}

export const defaultInputs: SupplyDemandFluxChartsInputs = {
  maxDistanceString: 'Normal',
  sdEndMethod: 'Close',
  retestsEnabled: true,
  breaksEnabled: false,
  showInvalidated: true,
  bullSDZoneColor: 'rgba(8, 153, 129, 0.5)',
  bearSDZoneColor: 'rgba(242, 54, 70, 0.5)',
  timeframe1Enabled: true,
  timeframe1: '',
  timeframe2Enabled: false,
  timeframe2: '15',
  timeframe3Enabled: false,
  timeframe3: '30',
  textColor: 'rgba(255, 255, 255, 0.8)',
};

export const inputConfig: InputConfig[] = [
  { id: 'maxDistanceString', type: 'string', title: 'Max Distance To Last Bar', defval: 'Normal', options: ['High', 'Normal', 'Low'], group: 'General Configuration' },
  { id: 'sdEndMethod', type: 'string', title: 'Zone Invalidation', defval: 'Close', options: ['Wick', 'Close'], group: 'General Configuration' },
  { id: 'retestsEnabled', type: 'bool', title: 'Retests', defval: true, inline: 'rb', group: 'General Configuration' },
  { id: 'breaksEnabled', type: 'bool', title: 'Breaks', defval: false, inline: 'rb', group: 'General Configuration' },
  { id: 'showInvalidated', type: 'bool', title: 'Show Historic Zones', defval: true, group: 'General Configuration' },
  { id: 'bullSDZoneColor', type: 'color', title: 'Demand', defval: 'rgba(8, 153, 129, 0.5)', inline: 'sdColor', group: 'General Configuration' },
  { id: 'bearSDZoneColor', type: 'color', title: 'Supply', defval: 'rgba(242, 54, 70, 0.5)', inline: 'sdColor', group: 'General Configuration' },
  { id: 'timeframe1Enabled', type: 'bool', title: '', defval: true, group: 'Timeframes', inline: 'timeframe1' },
  { id: 'timeframe1', type: 'timeframe', title: '', defval: '', group: 'Timeframes', inline: 'timeframe1' },
  { id: 'timeframe2Enabled', type: 'bool', title: '', defval: false, group: 'Timeframes', inline: 'timeframe2' },
  { id: 'timeframe2', type: 'timeframe', title: '', defval: '15', group: 'Timeframes', inline: 'timeframe2' },
  { id: 'timeframe3Enabled', type: 'bool', title: '', defval: false, group: 'Timeframes', inline: 'timeframe3' },
  { id: 'timeframe3', type: 'timeframe', title: '', defval: '30', group: 'Timeframes', inline: 'timeframe3' },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: 'rgba(255, 255, 255, 0.8)', group: 'Style' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Supply & Demand (MTF) | Flux Charts',
  shortTitle: 'Supply and Demand (MTF) | Flux Charts',
  overlay: true,
};

/** Constants of the script */
const MAX_LABELS = 500;
const OVERLAP_THRESHOLD_PERCENTAGE = 0.0;
const MAX_SD_ZONES = 30;
const MIN_ZONE_SIZE = 10;
const RETEST_COOLDOWN = 5;
const MIN_DISTANCE_BETWEEN_ZONES = 5;
const MAX_ZONE_SIZE_ATR = 1.5;
const MOMENTUM_BODY_MULT = 0.5;
const MOMENTUM_COUNT = 4;
const MOMENTUM_SPAN = 4;
const ZONES_PER_SIDE = 30;
/** Colour constants of the original Pine version */
const BLUE = '#2962FF';
const WHITE = '#FFFFFF';

/** Pine float comparisons: a > b only when a - b > 1e-10 (a == b within 1e-10; na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const nz = (v: number) => (isNaN(v) ? 0 : v);

/** type sdZoneInfo: times in ms; breakTime is na (NaN) while the zone is valid */
interface ZoneInfo {
  top: number;
  bottom: number;
  sdType: 'Demand' | 'Supply';
  startTime: number;
  breakTime: number;
  guid: number;
  timeframeStr: string;
  disabled: boolean;
  combinedTimeframesStr: string | null;
  combined: boolean;
}

interface ZoneLists {
  demand: ZoneInfo[];
  supply: ZoneInfo[];
}

/** A label of the script: `alive` is false after label.delete() */
interface ScriptLabel {
  data: LabelData;
  alive: boolean;
}

const timeMsOf = (bars: Bar[]) => {
  const ms = bars.length > 0 && bars[0].time >= 1e12;
  return (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
};

/**
 * The zone lists of the script on the bars of one timeframe. `each` is called after every bar with the lists as they
 * are on that bar (the objects are changed by the later bars).
 */
function findZones(bars: Bar[], maxDistance: number, wick: boolean, each: (i: number, lists: ZoneLists, atr: number) => void): void {
  const n = bars.length;
  const last = n - 1;
  const timeMs = timeMsOf(bars);
  const arr = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const atr = arr(ta.atr(bars, 20));
  const bodySize = bars.map((b) => Math.abs(b.close - b.open));
  const averageBodySize = arr(ta.sma(Series.fromArray(bars, bodySize), 20));
  const lists: ZoneLists = { demand: [], supply: [] };
  let lastDemandZone = 0;
  let lastSupplyZone = 0;

  // clampSDZone()
  const clamp = (z: ZoneInfo, i: number) => {
    const size = z.top - z.bottom;
    if (gt(size, atr[i] * MAX_ZONE_SIZE_ATR)) {
      const diff = size - atr[i] * MAX_ZONE_SIZE_ATR;
      z.top -= diff / 2;
      z.bottom += diff / 2;
    }
  };

  for (let i = 0; i < n; i++) {
    const b = bars[i];
    if (i > last - maxDistance) {
      // getMomentumCandleCount()
      let bullish = 0;
      let bearish = 0;
      for (let k = 0; k < MOMENTUM_SPAN; k++) {
        if (i - k < 0) continue;
        if (ge(bodySize[i - k], averageBodySize[i] * MOMENTUM_BODY_MULT)) {
          if (gt(bars[i - k].close, bars[i - k].open)) bullish += 1;
          else bearish += 1;
        }
      }
      const back = i - (MOMENTUM_SPAN + 1);
      const newZone = (sdType: 'Demand' | 'Supply'): ZoneInfo => {
        const z: ZoneInfo = {
          top: back >= 0 ? bars[back].high : NaN, bottom: back >= 0 ? bars[back].low : NaN, sdType,
          startTime: back >= 0 ? timeMs(back) : NaN, breakTime: NaN, guid: back >= 0 ? timeMs(back) : NaN, timeframeStr: '',
          disabled: false, combinedTimeframesStr: null, combined: false,
        };
        clamp(z, i);
        return z;
      };
      if (bullish >= MOMENTUM_COUNT && i - lastDemandZone > MIN_DISTANCE_BETWEEN_ZONES) {
        lastDemandZone = i;
        lists.demand.unshift(newZone('Demand'));
        if (lists.demand.length > MAX_SD_ZONES) lists.demand.pop();
      }
      if (bearish >= MOMENTUM_COUNT && i - lastSupplyZone > MIN_DISTANCE_BETWEEN_ZONES) {
        lastSupplyZone = i;
        lists.supply.unshift(newZone('Supply'));
        if (lists.supply.length > MAX_SD_ZONES) lists.supply.pop();
      }
      // Invalidation
      for (const z of lists.demand) {
        if (isNaN(z.breakTime) && lt(wick ? b.low : Math.min(b.open, b.close), z.bottom)) z.breakTime = timeMs(i);
      }
      for (const z of lists.supply) {
        if (isNaN(z.breakTime) && gt(wick ? b.high : Math.max(b.open, b.close), z.top)) z.breakTime = timeMs(i);
      }
    }
    each(i, lists, atr[i]);
  }
}

/**
 * Time of the bar that would follow the last bar. On symbols without weekend bars the next bar of the last bar of a
 * trading day (a bar at the time of day of the last bar of the day before, or any daily bar) is the first bar of the
 * next weekday.
 */
function nextBarTime(bars: Bar[]): number {
  const n = bars.length;
  const ms = bars[0].time >= 1e12;
  const unit = ms ? 1 : 1000;
  const DAY = 86400000;
  const t = (i: number) => bars[i].time * unit;
  const dayOf = (x: number) => Math.floor(x / DAY) * DAY;
  const weekend = (x: number) => [0, 6].includes(new Date(x).getUTCDay());
  const plain = barTime(bars, n) * unit;
  if (bars.some((b) => weekend(b.time * unit))) return plain / unit;
  const nextWeekday = (day: number) => {
    let d = day + DAY;
    while (weekend(d)) d += DAY;
    return d;
  };
  const tLast = t(n - 1);
  if (barInterval(bars) * unit >= DAY) return nextWeekday(dayOf(tLast)) / unit;
  // intraday: first and last bar of the trading day before the last one
  let d0 = n - 1;
  while (d0 > 0 && dayOf(t(d0 - 1)) === dayOf(tLast)) d0--;
  if (d0 === 0) return plain / unit;
  let p0 = d0 - 1;
  while (p0 > 0 && dayOf(t(p0 - 1)) === dayOf(t(d0 - 1))) p0--;
  if (tLast - dayOf(tLast) < t(d0 - 1) - dayOf(t(d0 - 1))) return plain / unit;
  return (nextWeekday(dayOf(tLast)) + (t(p0) - dayOf(t(p0)))) / unit;
}

/**
 * request.security(syminfo.tickerid, tf, [lists]) for a higher timeframe: the lists of the last completed bar of the
 * timeframe at each chart bar (null before the first one). A chart bar completes its period when the next bar is in
 * another period (for the last chart bar: the bar that would follow it, see nextBarTime).
 */
function higherTimeframeLists(bars: Bar[], tf: string, maxDistance: number, wick: boolean, context?: ChartContext): Array<ZoneLists | null> {
  const n = bars.length;
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
  // Lists of each bar of the timeframe: copies, as the chart sees the values of that bar
  const snapshots: ZoneLists[] = [];
  const copy = (z: ZoneInfo): ZoneInfo => ({ ...z });
  findZones(htf, maxDistance, wick, (_, lists) => snapshots.push({ demand: lists.demand.map(copy), supply: lists.supply.map(copy) }));
  if (exchange) return exchange.latest.map((k) => (k >= 0 ? snapshots[k] : null));
  const lastCompletes = n > 0 && periodStarts([...bars.slice(Math.max(0, n - 3000)), { time: nextBarTime(bars) }], tf).pop() !== starts[n - 1];
  return group.map((g, i) => {
    const complete = i < n - 1 ? group[i + 1] !== g : lastCompletes;
    const k = complete ? g : g - 1;
    return k >= 0 ? snapshots[k] : null;
  });
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupplyDemandFluxChartsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'labels'> & { boxes: BoxData[]; lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const boxes: BoxData[] = [];
  const lines: LineDrawingData[] = [];
  const result = (labels: LabelData[]) => ({
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes,
    lines,
    labels,
  });
  if (n === 0) return result([]);

  const timeMs = timeMsOf(bars);
  const maxDistance = cfg.maxDistanceString === 'Low' ? 150 : cfg.maxDistanceString === 'Normal' ? 500 : 1250;
  const wick = cfg.sdEndMethod === 'Wick';
  const chartTf = chartTimeframe(bars, chart);
  const chartSeconds = chartTf === '' ? NaN : timeframe.in_seconds(chartTf);
  const secondsOf = (tf: string) => (tf.trim() === '' ? chartSeconds : timeframe.in_seconds(tf));
  // timeframe.period
  const chartPeriod = chartTf.replace(/^1([DWM])$/, '$1');

  // formatTimeframeString()
  const formatTimeframe = (tf: string): string => {
    const t = tf === '' ? chartPeriod : tf;
    if (/[DWSM]/.test(t)) return t;
    const seconds = timeframe.in_seconds(t);
    if (seconds >= 3600) {
      const hourCount = Math.trunc(seconds / 3600);
      return `${hourCount} Hour${hourCount > 1 ? 's' : ''}`;
    }
    return `${t} Min`;
  };

  // The three timeframes; of two enabled timeframes of the same length the first one is disabled
  const tfs = [
    { tf: cfg.timeframe1, enabled: cfg.timeframe1Enabled },
    { tf: cfg.timeframe2, enabled: cfg.timeframe2Enabled },
    { tf: cfg.timeframe3, enabled: cfg.timeframe3Enabled },
  ];
  for (let a = 0; a < tfs.length; a++) {
    for (let c = 0; c < tfs.length; c++) {
      if (a !== c && tfs[a].enabled && tfs[c].enabled && secondsOf(tfs[a].tf) === secondsOf(tfs[c].tf)) tfs[a].enabled = false;
    }
  }
  const higher = tfs.map(({ tf, enabled }) => {
    if (!enabled || secondsOf(tf) === chartSeconds) return null;
    if (secondsOf(tf) < chartSeconds) {
      throw new Error(`The timeframe "${tf}" is lower than the chart timeframe "${chartTf}": the bars do not carry that data.`);
    }
    return higherTimeframeLists(bars, tf, maxDistance, wick, chart);
  });

  // Labels of the script (500 at most: a creation that brings the count above 505 deletes the oldest ones)
  const scriptLabels: ScriptLabel[] = [];
  const newLabel = (i: number, price: number, style: 'label_up' | 'label_down', col: string, text: string): ScriptLabel => {
    const l: ScriptLabel = { data: { time: bars[i].time, price, text, style, color: col, textColor: WHITE, size: 'small' }, alive: true };
    scriptLabels.push(l);
    const alive = scriptLabels.filter((x) => x.alive);
    if (alive.length > MAX_LABELS + 5) alive.slice(0, alive.length - MAX_LABELS).forEach((x) => { x.alive = false; });
    return l;
  };
  const retestLabels = new Map<number, ScriptLabel[]>();
  const breakLabels = new Map<number, ScriptLabel>();

  // Placement of a time (xloc.bar_time): the first bar that starts at or after it; a time after the start of the
  // last bar is on the bar slot that holds it (an open zone ends 1 ms after the start of the last bar: on that bar)
  const interval = barInterval(bars);
  const intervalMs = bars[0].time >= 1e12 ? interval : interval * 1000;
  const barOf = (t: number) => {
    if (t > timeMs(last)) return barTime(bars, last + Math.floor((t - timeMs(last)) / intervalMs), interval);
    let lo = 0;
    let hi = last;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timeMs(mid) >= t) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };
  // colorWithTransparency(): color.new(c, color.t(c) * x)
  const withTransparency = (c: string, x: number) => String(color.new(c, color.t(c) * x));

  const oldestBarTime = last - maxDistance >= 0 ? timeMs(last - maxDistance) : NaN;
  let lastRetestIndexSupply = 0;
  let lastRetestIndexDemand = 0;
  let allZones: ZoneInfo[] = [];
  // The original redraws on closed bars only (barstate.isconfirmed): the last bar is left out while it is open
  // (chart context; without it every bar is closed)
  const lastClosed = lastBarConfirmedOf(chart) ? last : last - 1;

  findZones(bars, maxDistance, wick, (i, own, atr) => {
    if (!(i > last - maxDistance) || i > lastClosed) return;
    const time = timeMs(i);
    const endOf = (z: ZoneInfo) => (isNaN(z.breakTime) ? time + 1 : z.breakTime);
    const oldest = isNaN(oldestBarTime) ? time : oldestBarTime;

    // handleSDZonesFinal(): the most recent zones of every enabled timeframe (copies)
    allZones = [];
    tfs.forEach(({ tf, enabled }, k) => {
      if (!enabled) return;
      const htfLists = higher[k];
      const lists = htfLists === null ? own : htfLists[i];
      if (lists === null) return;
      for (const list of [lists.demand, lists.supply]) {
        for (let j = 0; j <= Math.min(list.length - 1, ZONES_PER_SIDE - 1); j++) allZones.unshift({ ...list[j], timeframeStr: tf });
      }
    });

    // areaOfSD(), doSDsTouch()
    const areaOf = (z: ZoneInfo) => Math.sqrt((endOf(z) - z.startTime) * (endOf(z) - z.startTime)) * Math.sqrt((z.bottom - z.top) * (z.bottom - z.top));
    const touch = (a: ZoneInfo, b: ZoneInfo) => {
      const margin = atr / 100;
      const intersection = Math.max(0, Math.min(endOf(a), endOf(b)) - Math.max(a.startTime, b.startTime))
        * Math.max(0, Math.min(a.top + margin, b.top + margin) - Math.max(a.bottom - margin, b.bottom - margin));
      const union = areaOf(a) + areaOf(b) - intersection;
      return gt((intersection / union) * 100.0, OVERLAP_THRESHOLD_PERCENTAGE);
    };
    // combineSDsFunc(): the end of a `for` loop is read once, when the loop starts; a merged zone goes to the front
    if (allZones.length > 0) {
      let lastCombinations = 999;
      while (lastCombinations > 0) {
        lastCombinations = 0;
        const endA = allZones.length - 1;
        for (let a = 0; a <= endA; a++) {
          const z1 = allZones[a];
          const endB = allZones.length - 1;
          for (let c = 0; c <= endB; c++) {
            const z2 = allZones[c];
            if (a === c) continue;
            if (z1.disabled || z2.disabled) continue;
            if (z1.sdType !== z2.sdType) continue;
            if (!touch(z1, z2)) continue;
            z1.disabled = true;
            z2.disabled = true;
            const breakTime = Math.max(nz(z1.breakTime), nz(z2.breakTime));
            const startTime = Math.min(z1.startTime, z2.startTime);
            const merged: ZoneInfo = {
              top: Math.max(z1.top, z2.top), bottom: Math.min(z1.bottom, z2.bottom), sdType: z1.sdType, startTime,
              breakTime: breakTime === 0 ? NaN : breakTime, guid: startTime, timeframeStr: z1.timeframeStr, disabled: false,
              combinedTimeframesStr: null, combined: true,
            };
            const size = merged.top - merged.bottom;
            if (gt(size, atr * MAX_ZONE_SIZE_ATR)) {
              const diff = size - atr * MAX_ZONE_SIZE_ATR;
              merged.top -= diff / 2;
              merged.bottom += diff / 2;
            }
            if (secondsOf(z1.timeframeStr) !== secondsOf(z2.timeframeStr)) {
              merged.combinedTimeframesStr = `${z1.combinedTimeframesStr ?? formatTimeframe(z1.timeframeStr)} & ${z2.combinedTimeframesStr ?? formatTimeframe(z2.timeframeStr)}`;
            }
            allZones.unshift(merged);
            lastCombinations += 1;
          }
        }
      }
    }

    // renderSDZone(): every closed bar deletes the zone drawings and draws them again
    if (i === lastClosed) {
      for (const z of allZones) {
        if (z.disabled) continue;
        const zoneSize = endOf(z) - z.startTime;
        if (zoneSize < secondsOf(z.timeframeStr) * MIN_ZONE_SIZE * 1000 || z.startTime < oldest) continue;
        if (!(cfg.showInvalidated || isNaN(z.breakTime))) continue;
        const sdColor = z.sdType === 'Demand' ? cfg.bullSDZoneColor : cfg.bearSDZoneColor;
        const x1 = barOf(z.startTime);
        const x2 = barOf(z.startTime + zoneSize);
        const mid = (z.top + z.bottom) / 2;
        const sdBox = (left: number, top: number, bg: string, border: string, text: string): BoxData => ({
          time1: left, price1: top, time2: x2, price2: z.bottom, bgColor: bg, borderColor: border, text,
          textColor: cfg.textColor, textSize: 'small', textHAlign: 'right', textVAlign: 'bottom',
        });
        boxes.push(sdBox(x1, z.top, withTransparency(sdColor, z.combined ? 1.1 : 1.5), sdColor, ''));
        lines.push({ time1: x1, price1: mid, time2: x2, price2: mid, color: cfg.textColor, style: 'dashed' });
        boxes.push(sdBox(barOf(z.startTime + zoneSize / 2), mid, '#FFFFFF00', '#FFFFFF00', z.combinedTimeframesStr ?? formatTimeframe(z.timeframeStr)));
      }
    }

    // Breaks and retests of the shown zones
    let breakBuyside = NaN;
    let breakBuysideGuid = NaN;
    let breakSellside = NaN;
    let breakSellsideGuid = NaN;
    let retestBuyside = NaN;
    let retestBuysideGuid = NaN;
    let retestSellside = NaN;
    let retestSellsideGuid = NaN;
    const shown = (z: ZoneInfo) => !z.disabled && !(time - z.startTime < MIN_ZONE_SIZE * secondsOf(z.timeframeStr) * 1000) && !(z.startTime < oldest);
    for (const z of allZones) {
      if (!shown(z) || isNaN(z.breakTime) || !cfg.showInvalidated || time !== z.breakTime) continue;
      if (!(z.breakTime - z.startTime > MIN_ZONE_SIZE * chartSeconds * 1000)) continue;
      if (z.sdType === 'Supply') {
        breakBuyside = z.bottom;
        breakBuysideGuid = z.guid;
      } else {
        breakSellside = z.top;
        breakSellsideGuid = z.guid;
      }
    }
    for (const z of allZones) {
      if (!shown(z) || !isNaN(z.breakTime)) continue;
      if (z.sdType === 'Supply' && i - lastRetestIndexSupply > RETEST_COOLDOWN) {
        if (gt(bars[i].high, z.bottom)) {
          retestBuyside = z.top;
          retestBuysideGuid = z.guid;
          lastRetestIndexSupply = i;
        }
      } else if (z.sdType === 'Demand' && i - lastRetestIndexDemand > RETEST_COOLDOWN) {
        if (lt(bars[i].low, z.top)) {
          retestSellside = z.bottom;
          retestSellsideGuid = z.guid;
          lastRetestIndexDemand = i;
        }
      }
    }

    // Retest labels, kept by zone (its guid)
    const addRetest = (guid: number, l: ScriptLabel) => {
      const list = retestLabels.get(guid);
      if (list === undefined) retestLabels.set(guid, [l]);
      else list.push(l);
    };
    if (!isNaN(retestBuyside) && cfg.retestsEnabled) addRetest(retestBuysideGuid, newLabel(i, retestBuyside, 'label_down', cfg.bearSDZoneColor, 'R'));
    if (!isNaN(retestSellside) && cfg.retestsEnabled) addRetest(retestSellsideGuid, newLabel(i, retestSellside, 'label_up', cfg.bullSDZoneColor, 'R'));
    for (const [key, list] of retestLabels) {
      const found = allZones.some((z) => z.guid === key && shown(z) && (cfg.showInvalidated || isNaN(z.breakTime)));
      if (!found) list.forEach((l) => { l.alive = false; });
    }

    // Break labels: one per zone (a new label of the same zone does not delete the label before)
    if (!isNaN(breakBuyside) && cfg.breaksEnabled) breakLabels.set(breakBuysideGuid, newLabel(i, breakBuyside, 'label_up', BLUE, 'B'));
    if (!isNaN(breakSellside) && cfg.breaksEnabled) breakLabels.set(breakSellsideGuid, newLabel(i, breakSellside, 'label_down', BLUE, 'B'));
    for (const [key, l] of breakLabels) {
      if (!allZones.some((z) => z.guid === key && !z.disabled)) l.alive = false;
    }
  });

  return result(scriptLabels.filter((l) => l.alive).map((l) => l.data));
}

export const SupplyDemandFluxCharts = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
