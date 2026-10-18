/**
 * Higher order Orderblocks + Breakerblocks + Range + Alerts
 *
 * First order pivots are three-bar pivots: a bar whose high is above the highs of the bars before and after it (pivot
 * high), or whose low is below both lows (pivot low). A second order pivot is a first order pivot that is above (or
 * below) the first order pivots before and after it.
 *
 * - Market structure break (MSB): when a second order high is above the one before, the latest second order low
 *   before it becomes the level to break. A first order pivot high below that level gives a bearish MSB line at the
 *   level and a supply zone (orderblock) from the latest second order high down to the higher low of its bar and the
 *   bar before. The mirror rule gives the bullish MSB line and the demand zone.
 * - A zone changes colour when a first order pivot comes back into it (tested). When price leaves it on the other
 *   side (a first order pivot low above a supply zone, a pivot high below a demand zone) the zone becomes a
 *   breakerblock and its MSB line is removed; a breakerblock is removed when it is crossed again.
 * - Range: two second order highs and lows, each inside the ones before, give a range with its high and low lines,
 *   the 0.5 line and the 0.25 / 0.75 lines (geometric means with "Use Log Scale"). A range is removed when a first
 *   order pivot high is below it or a pivot low above it.
 * - Second order pivots are marked with a small label.
 *
 * At most 50 lines, 50 boxes and 50 labels are kept.
 *
 * Alerts (alert() calls, `alertCalls` of the result, once per bar close): on a bar with an MSB, a zone or breakerblock
 * test (once per first order pivot), a new range or a range test, one call whose message lists these events (each
 * selected by its alert input) and ends with the current price.
 *
 * Chart context: `chart.lastBarConfirmed`: a last bar that is still open is not processed.
 *
 * Reference: "Order Blocks" (published as "Higher order Orderblocks + Breakerblocks + Range + Alerts") by pmk07
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © pmk07. Acknowledgements of the original: Higher Order Pivots by rumpypumpydumpy, Order Blocks
 * by MarkMiddleton2020.
 */

import { str, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { AlertCall, BoxData, LabelData, LineDrawingData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface HigherOrderOrderblocksBreakerblocksRangeInputs {
  pv2Sv: boolean;
  msbSv: boolean;
  boxSv: boolean;
  mSv: boolean;
  rangeSv: boolean;
  rangeEqSv: boolean;
  rangeQSv: boolean;
  logSv: boolean;
  msbASv: boolean;
  obASv: boolean;
  bbASv: boolean;
  rASv: boolean;
  rtASv: boolean;
  uS: string;
  tS: string;
  uD: string;
  tD: string;
  uB: string;
  tB: string;
}

export const defaultInputs: HigherOrderOrderblocksBreakerblocksRangeInputs = {
  pv2Sv: true,
  msbSv: true,
  boxSv: true,
  mSv: true,
  rangeSv: true,
  rangeEqSv: true,
  rangeQSv: true,
  logSv: true,
  msbASv: true,
  obASv: true,
  bbASv: true,
  rASv: true,
  rtASv: true,
  uS: 'rgba(192, 192, 192, 0.2)',
  tS: 'rgba(255, 0, 0, 0.2)',
  uD: 'rgba(192, 192, 192, 0.2)',
  tD: 'rgba(0, 255, 0, 0.2)',
  uB: 'rgba(192, 192, 192, 0.2)',
  tB: 'rgba(41, 98, 255, 0.2)',
};

export const inputConfig: InputConfig[] = [
  { id: 'pv2Sv', type: 'bool', title: 'Plot 2nd order pivots', defval: true },
  { id: 'msbSv', type: 'bool', title: 'Plot MSB lines', defval: true },
  { id: 'boxSv', type: 'bool', title: 'Plot Orderblocks', defval: true },
  { id: 'mSv', type: 'bool', title: 'Plot Breakerblocks', defval: true },
  { id: 'rangeSv', type: 'bool', title: 'Plot Range', defval: true },
  { id: 'rangeEqSv', type: 'bool', title: 'Plot Range 0.5 Line', defval: true },
  { id: 'rangeQSv', type: 'bool', title: 'Plot Range 0.25 and 0.75 Lines', defval: true },
  { id: 'logSv', type: 'bool', title: 'Use Log Scale', defval: true },
  { id: 'msbASv', type: 'bool', title: 'Alert MSB', defval: true },
  { id: 'obASv', type: 'bool', title: 'Alert Orderblock test', defval: true },
  { id: 'bbASv', type: 'bool', title: 'Alert Breakerblock test', defval: true },
  { id: 'rASv', type: 'bool', title: 'Alert New Range', defval: true },
  { id: 'rtASv', type: 'bool', title: 'Alert Range test', defval: true },
  { id: 'uS', type: 'color', title: 'Untested Supply Color', defval: 'rgba(192, 192, 192, 0.2)' },
  { id: 'tS', type: 'color', title: 'Tested Supply Color', defval: 'rgba(255, 0, 0, 0.2)' },
  { id: 'uD', type: 'color', title: 'Untested Demand Color', defval: 'rgba(192, 192, 192, 0.2)' },
  { id: 'tD', type: 'color', title: 'Tested Demand Color', defval: 'rgba(0, 255, 0, 0.2)' },
  { id: 'uB', type: 'color', title: 'Untested Breaker Color', defval: 'rgba(192, 192, 192, 0.2)' },
  { id: 'tB', type: 'color', title: 'Tested Breaker Color', defval: 'rgba(41, 98, 255, 0.2)' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Order Blocks',
  shortTitle: 'Order Blocks',
  overlay: true,
};

/** Default number of lines, boxes and labels kept */
const MAX_OBJECTS = 50;
const GREEN = '#4CAF50';
const RED = '#FF5252';
const GRAY = '#787B86';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  width: number;
  dashed: boolean;
  extend: 'none' | 'right';
  deleted: boolean;
}
interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string | null;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  color: string;
  style: 'label_down' | 'label_up';
  deleted: boolean;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HigherOrderOrderblocksBreakerblocksRangeInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & {
  boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[]; alertCalls: AlertCall[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const lastConfirmed = lastBarConfirmedOf(chart);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain. A line held by a `var line` variable of the script (the latest 0.5 / 0.25 / 0.75 range lines read)
  // is never deleted by this limit, but it counts. A deleted object ignores later changes and reads as na.
  const held = new Set<object>();
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length <= MAX_OBJECTS + 5) return;
    for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
      if (held.has(list[k])) k++;
      else list.splice(k, 1)[0].deleted = true;
    }
  };
  const lines: Ln[] = [];
  const boxes: Bx[] = [];
  const labels: Lb[] = [];
  const newLine = (x1: number, y: number, x2: number, css: string, width: number, dashed = false, extend: 'none' | 'right' = 'none'): Ln => {
    const o: Ln = { x1, x2, y, color: css, width, dashed, extend, deleted: false };
    lines.push(o);
    limit(lines);
    return o;
  };
  const newBox = (left: number, top: number, right: number, bottom: number, bg: string | null): Bx => {
    const o: Bx = { left, top, right, bottom, bg, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };
  const drop = <T extends { deleted: boolean }>(list: T[], o: T | null) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  const setBg = (b: Bx, css: string) => {
    if (!b.deleted) b.bg = css;
  };
  const topOf = (b: Bx) => (b.deleted ? NaN : b.top);
  const bottomOf = (b: Bx) => (b.deleted ? NaN : b.bottom);
  const yOf = (l: Ln) => (l.deleted ? NaN : l.y);

  // Pivot lists, newest first (fixed sizes, filled with na at the start)
  const pvh1Price: number[] = new Array(30).fill(NaN);
  const pvh1Time: number[] = new Array(30).fill(NaN);
  const pvl1Price: number[] = new Array(30).fill(NaN);
  const pvl1Time: number[] = new Array(30).fill(NaN);
  const pvh2Price: number[] = new Array(10).fill(NaN);
  const pvh2Time: number[] = new Array(10).fill(NaN);
  const pvl2Price: number[] = new Array(10).fill(NaN);
  const pvl2Time: number[] = new Array(10).fill(NaN);
  const add = (list: number[], v: number) => {
    list.pop();
    list.unshift(v);
  };
  let htcmrllPrice = NaN; // high that created the most recent lower low
  let htcmrllTime = NaN;
  let ltcmrhhPrice = NaN; // low that created the most recent higher high
  let ltcmrhhTime = NaN;
  const longBoxes: Bx[] = [];
  const shortBoxes: Bx[] = [];
  const mLongBoxes: Bx[] = [];
  const mShortBoxes: Bx[] = [];
  const bullBosLines: Ln[] = [];
  const bearBosLines: Ln[] = [];
  const rangeHLines: Ln[] = [];
  const range25Lines: Ln[] = [];
  const rangeMLines: Ln[] = [];
  const range75Lines: Ln[] = [];
  const rangeLLines: Ln[] = [];
  let lastRangeH = NaN;
  let lastRangeL = NaN;
  let rangeM: Ln | null = null;
  let range25: Ln | null = null;
  let range75: Ln | null = null;
  const hold = (before: Ln | null, now: Ln): Ln => {
    if (before) held.delete(before);
    held.add(now);
    return now;
  };
  const lowAt = (index: number) => (index >= 0 && index < n ? bars[index].low : NaN);
  const highAt = (index: number) => (index >= 0 && index < n ? bars[index].high : NaN);
  /** math.max / math.min: na when an argument is na */
  const max2 = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
  const min2 = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
  const mean = (a: number, b: number) => (cfg.logSv ? Math.exp((Math.log(a) + Math.log(b)) / 2) : (a + b) / 2);
  // Alert messages: string alert = na, extended by each event (na + text = text); the pivot of the last test alert of
  // each kind (var int h_a_time = 0 ...)
  const alertCalls: AlertCall[] = [];
  const fmt = (v: number) => str.tostring(v);
  let hATime = 0;
  let lATime = 0;
  let mhATime = 0;
  let mlATime = 0;
  let rhATime = 0;
  let rlATime = 0;
  const leftOf = (b: Bx) => (b.deleted ? NaN : b.left);

  for (let i = 0; i < n; i++) {
    if (i === n - 1 && !lastConfirmed) break;
    const pvh = i >= 2 && lt(bars[i].high, bars[i - 1].high) && gt(bars[i - 1].high, bars[i - 2].high);
    const pvl = i >= 2 && gt(bars[i].low, bars[i - 1].low) && lt(bars[i - 1].low, bars[i - 2].low);
    let newPh2 = false;
    let newPl2 = false;
    let alert = '';
    const close = bars[i].close;

    if (pvh) {
      add(pvh1Price, bars[i - 1].high);
      add(pvh1Time, i - 1);
      const [p0, p1, p2] = pvh1Price;
      if (lt(p0, p1) && gt(p1, p2)) {
        add(pvh2Price, p1);
        add(pvh2Time, pvh1Time[1]);
        newPh2 = true;
        if (gt(p1, pvh2Price[1])) {
          for (let k = 0; k < pvl2Time.length; k++) {
            if (pvl2Time[k] < pvh2Time[0]) {
              ltcmrhhPrice = pvl2Price[k];
              ltcmrhhTime = pvl2Time[k];
              break;
            }
          }
        }
      }
      if (lt(p0, ltcmrhhPrice)) {
        if (cfg.msbSv) bearBosLines.push(newLine(ltcmrhhTime, ltcmrhhPrice, i, GREEN, 2));
        const top = pvh2Price[0];
        const bottom = max2(lowAt(pvh2Time[0]), lowAt(pvh2Time[0] - 1));
        shortBoxes.push(newBox(pvh2Time[0], top, i, bottom, cfg.boxSv ? cfg.uS : null));
        if (cfg.msbASv) {
          alert += 'Bearish MSB @ ' + fmt(ltcmrhhPrice) + '\n' + 'New Supply Zone : ' + fmt(top) + ' - ' + fmt(bottom) + '\n';
        }
        ltcmrhhPrice = NaN;
      }
    }
    if (pvl) {
      add(pvl1Price, bars[i - 1].low);
      add(pvl1Time, i - 1);
      const [p0, p1, p2] = pvl1Price;
      if (gt(p0, p1) && lt(p1, p2)) {
        add(pvl2Price, p1);
        add(pvl2Time, pvl1Time[1]);
        newPl2 = true;
        if (lt(p1, pvl2Price[1])) {
          for (let k = 0; k < pvh2Time.length; k++) {
            if (pvh2Time[k] < pvl2Time[0]) {
              htcmrllPrice = pvh2Price[k];
              htcmrllTime = pvh2Time[k];
              break;
            }
          }
        }
      }
      if (gt(p0, htcmrllPrice)) {
        if (cfg.msbSv) bullBosLines.push(newLine(htcmrllTime, htcmrllPrice, i, RED, 2));
        const top = min2(highAt(pvl2Time[0]), highAt(pvl2Time[0] - 1));
        const bottom = pvl2Price[0];
        longBoxes.push(newBox(pvl2Time[0], top, i, bottom, cfg.boxSv ? cfg.uD : null));
        if (cfg.msbASv) {
          alert += 'Bullish MSB @ ' + fmt(htcmrllPrice) + '\n' + 'New Demand Zone : ' + fmt(bottom) + ' - ' + fmt(top) + '\n';
        }
        htcmrllPrice = NaN;
      }
    }

    const lastHigh = pvh1Price[0];
    const lastLow = pvl1Price[0];
    // Supply zones
    for (let k = shortBoxes.length - 1; k >= 0; k--) {
      const b = shortBoxes[k];
      if (gt(lastHigh, bottomOf(b))) {
        if (cfg.boxSv) setBg(b, cfg.tS);
        if (cfg.obASv && lt(close, bottomOf(b)) && pvh1Time[0] !== hATime) {
          hATime = pvh1Time[0];
          alert += 'Supply Zone Test @ ' + fmt(lastHigh) + ' (age = ' + fmt(i - leftOf(b)) + ' bars) \n';
        }
      }
      if (gt(lastLow, topOf(b))) {
        if (cfg.mSv) {
          setBg(b, cfg.uB);
          mLongBoxes.push(b);
        } else {
          drop(boxes, b);
        }
        shortBoxes.splice(k, 1);
        if (cfg.msbSv) drop(lines, bearBosLines.splice(k, 1)[0]);
      }
    }
    // Demand zones
    for (let k = longBoxes.length - 1; k >= 0; k--) {
      const b = longBoxes[k];
      if (lt(lastLow, topOf(b))) {
        if (cfg.boxSv) setBg(b, cfg.tD);
        if (cfg.obASv && gt(close, topOf(b)) && pvl1Time[0] !== lATime) {
          lATime = pvl1Time[0];
          alert += 'Demand Zone Test @ ' + fmt(lastLow) + ' (age = ' + fmt(i - leftOf(b)) + ' bars) \n';
        }
      }
      if (lt(lastHigh, bottomOf(b))) {
        if (cfg.mSv) {
          setBg(b, cfg.uB);
          mShortBoxes.push(b);
        } else {
          drop(boxes, b);
        }
        longBoxes.splice(k, 1);
        if (cfg.msbSv) drop(lines, bullBosLines.splice(k, 1)[0]);
      }
    }
    // Breakerblocks
    for (let k = mShortBoxes.length - 1; k >= 0; k--) {
      const b = mShortBoxes[k];
      if (gt(lastHigh, bottomOf(b))) {
        setBg(b, cfg.tB);
        if (cfg.bbASv && lt(close, bottomOf(b)) && pvh1Time[0] !== mhATime) {
          mhATime = pvh1Time[0];
          alert += 'Breakerblock Test Up @ ' + fmt(lastHigh) + ' (age = ' + fmt(i - leftOf(b)) + ' bars) \n';
        }
      }
      if (gt(lastLow, topOf(b))) {
        drop(boxes, b);
        mShortBoxes.splice(k, 1);
      }
    }
    for (let k = mLongBoxes.length - 1; k >= 0; k--) {
      const b = mLongBoxes[k];
      if (lt(lastLow, topOf(b))) {
        setBg(b, cfg.tB);
        if (cfg.bbASv && gt(close, topOf(b)) && pvl1Time[0] !== mlATime) {
          mlATime = pvl1Time[0];
          alert += 'Breakerblock Test Down @ ' + fmt(lastLow) + ' (age = ' + fmt(i - leftOf(b)) + ' bars) \n';
        }
      }
      if (lt(lastHigh, bottomOf(b))) {
        drop(boxes, b);
        mLongBoxes.splice(k, 1);
      }
    }

    // New range
    if (
      cfg.rangeSv && (newPh2 || newPl2) &&
      lt(pvh2Price[0], pvh2Price[1]) && gt(pvl2Price[0], pvl2Price[1]) &&
      gt(pvh2Price[0], pvl2Price[1]) && lt(pvl2Price[0], pvh2Price[1]) &&
      (gt(pvl2Price[1], isNaN(lastRangeH) ? 0 : lastRangeH) || isNaN(lastRangeL) ? true : lt(pvh2Price[1], lastRangeL))
    ) {
      const start = min2(pvh2Time[1], pvl2Time[1]);
      lastRangeH = pvh2Price[1];
      lastRangeL = pvl2Price[1];
      const mid = mean(lastRangeH, lastRangeL);
      const upperQuarter = mean(lastRangeH, mid);
      const lowerQuarter = mean(lastRangeL, mid);
      rangeHLines.push(newLine(start, lastRangeH, i, GRAY, 1, false, 'right'));
      rangeLLines.push(newLine(start, lastRangeL, i, GRAY, 1, false, 'right'));
      if (cfg.rangeEqSv) rangeMLines.push(newLine(start, mid, i, GRAY, 1, false, 'right'));
      if (cfg.rangeQSv) {
        range25Lines.push(newLine(start, upperQuarter, i, GRAY, 1, true, 'right'));
        range75Lines.push(newLine(start, lowerQuarter, i, GRAY, 1, true, 'right'));
      }
      if (cfg.rASv) alert += 'New Range : ' + fmt(lastRangeH) + ' - ' + fmt(lastRangeL) + '. Mean = ' + fmt(mid) + '\n';
    }
    // Ranges that price has left
    for (let k = rangeHLines.length - 1; k >= 0; k--) {
      const top = yOf(rangeHLines[k]);
      const bottom = yOf(rangeLLines[k]);
      if (gt(pvh1Price[0], top) && cfg.rtASv && lt(close, top) && pvh1Time[0] !== rhATime) {
        rhATime = pvh1Time[0];
        alert += 'Range High Test @ ' + fmt(pvh1Price[0]) + ' \n';
      }
      if (lt(pvl1Price[0], bottom) && cfg.rtASv && gt(close, bottom) && pvl1Time[0] !== rlATime) {
        rlATime = pvl1Time[0];
        alert += 'Range Low Test @ ' + fmt(pvl1Price[0]) + ' \n';
      }
      if (cfg.rangeEqSv) rangeM = hold(rangeM, rangeMLines[k]);
      if (cfg.rangeQSv) {
        range25 = hold(range25, range25Lines[k]);
        range75 = hold(range75, range75Lines[k]);
      }
      if (lt(pvh1Price[0], bottom) || gt(pvl1Price[0], top)) {
        drop(lines, rangeHLines.splice(k, 1)[0]);
        drop(lines, rangeLLines.splice(k, 1)[0]);
        if (cfg.rangeEqSv) {
          drop(lines, rangeM);
          rangeMLines.splice(k, 1);
        }
        if (cfg.rangeQSv) {
          drop(lines, range25);
          range25Lines.splice(k, 1);
          drop(lines, range75);
          range75Lines.splice(k, 1);
        }
        lastRangeH = NaN;
        lastRangeL = NaN;
      }
    }

    // Second order pivot labels
    if (cfg.pv2Sv) {
      if (newPh2) {
        labels.push({ x: pvh2Time[0], y: pvh2Price[0], color: '#770000', style: 'label_down', deleted: false });
        limit(labels);
      }
      if (newPl2) {
        labels.push({ x: pvl2Time[0], y: pvl2Price[0], color: '#007700', style: 'label_up', deleted: false });
        limit(labels);
      }
    }

    // alert := not na(alert) ? alert + 'Current price = ' + str.tostring(close) + '\n' : na; alert(alert, once per bar close)
    if (alert !== '') {
      alertCalls.push({ time: bars[i].time as number, message: alert + 'Current price = ' + fmt(close) + '\n', freq: 'once_per_bar_close' });
    }
  }

  const T = (index: number) => bars[index].time;
  const drawn = (...v: number[]) => v.every((x) => !isNaN(x));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // an object with an na coordinate is not drawn
    lines: lines.filter((l) => drawn(l.x1, l.x2, l.y)).map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color, width: l.width,
      ...(l.dashed ? { style: 'dashed' as const } : {}),
      ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
    })),
    boxes: boxes.filter((b) => drawn(b.left, b.right, b.top, b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg ?? 'transparent',
      borderColor: 'transparent', extend: 'right' as const,
    })),
    labels: labels.filter((l) => drawn(l.x, l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: '', color: l.color, textColor: '#363A45', style: l.style, size: 'tiny' as const,
    })),
    alertCalls,
  };
}

export const hasAlertFunction = true;

export const HigherOrderOrderblocksBreakerblocksRange = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hasAlertFunction,
};
