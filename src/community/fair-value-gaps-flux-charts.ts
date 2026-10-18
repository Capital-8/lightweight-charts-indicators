/**
 * Volumized Fair Value Gaps
 *
 * Three-bar fair value gaps (the low above the high of two bars back, or the high below the low of two bars back,
 * with the middle bar closing beyond it) on bars of the same type, filtered by the size of the bars against the ATR
 * (or by a short / long volume average), with the volume of the three bars split between the two halves of the
 * zone. A zone ends when a close (or a wick) crosses it; a zone untouched for 200 bars is removed, at most 125 are
 * kept. On the last bar overlapping zones of the same side are merged, and each zone is drawn: a box (from its
 * start to its end, the three oldest open zones up to the last bar), the two volume bars from the left edge, a
 * dashed middle line, a separator and the volume text "<total> (<smaller / larger half> %)".
 *
 * As in the original, zone sizes mix units: an open zone is 15 ms wide (it stays on its start bar) and the start of
 * a zone counts as its last touch until a bar touches it (then a bar index).
 * The zones are only computed on the last 10,000 bars and on closed bars: a last bar that is still open (chart
 * context `lastBarConfirmed` false) is not analysed.
 *
 * Alert (alertcondition, `alerts` of the result): 'New FVG @ {{ticker}}', true on the last bar when a zone was found
 * on the bar before it (the original's count of found zones is above its value of two bars back when the last bar
 * starts).
 *
 * Reference: "Volumized Fair Value Gaps | Flux Charts" by fluxchart
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © fluxchart
 */

import {
  ta, math, Series, color, str, line, box, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box, type Line,
} from 'oakscriptjs';
import type { ChartContext } from '../chart-context';
import { lastBarConfirmedOf } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface FairValueGapsFluxChartsInputs {
  /** Zone Invalidation */
  fvgEndMethod: 'Wick' | 'Close';
  /** Zone Filtering */
  fvgFilterMethod: 'Average Range' | 'Volume Threshold';
  volumeThresholdPercent: number;
  /** FVG Detection */
  fvgBars: 'Same Type' | 'All';
  fvgSensEnabled: boolean;
  fvgSensitivityText: 'Extreme' | 'High' | 'Normal' | 'Low';
  allowGaps: boolean;
  showInvalidated: boolean;
  bullColor: string;
  bearColor: string;
  textColor: string;
  startZoneFrom: 'First Bar' | 'Last Bar';
}

export const defaultInputs: FairValueGapsFluxChartsInputs = {
  fvgEndMethod: 'Close',
  fvgFilterMethod: 'Average Range',
  volumeThresholdPercent: 50,
  fvgBars: 'Same Type',
  fvgSensEnabled: true,
  fvgSensitivityText: 'Extreme',
  allowGaps: false,
  showInvalidated: true,
  // #08998180, #f2364580, #ffffff80: an input colour keeps an alpha of 2 decimals (0.5)
  bullColor: 'rgba(8, 153, 129, 0.5)',
  bearColor: 'rgba(242, 54, 69, 0.5)',
  textColor: 'rgba(255, 255, 255, 0.5)',
  startZoneFrom: 'Last Bar',
};

const G_GEN = 'General Configuration';
const G_STYLE = 'Style';

export const inputConfig: InputConfig[] = [
  { id: 'fvgEndMethod', type: 'string', title: 'Zone Invalidation', defval: 'Close', options: ['Wick', 'Close'], group: G_GEN },
  { id: 'fvgFilterMethod', type: 'string', title: 'Zone Filtering', defval: 'Average Range', options: ['Average Range', 'Volume Threshold'], group: G_GEN },
  {
    id: 'volumeThresholdPercent', type: 'int', title: 'Volume Threshold %', defval: 50, min: 1, max: 200, group: G_GEN,
    tooltip: 'Only taken into calculation when filter method is Volume Threshold.',
  },
  {
    id: 'fvgBars', type: 'string', title: 'FVG Detection', defval: 'Same Type', options: ['Same Type', 'All'], group: G_GEN,
    tooltip: 'Same Type -> All 3 bars that formed the FVG should be the same type. (Bullish / Bearish) \n\nAll -> Bar types may vary between bullish / bearish.',
  },
  { id: 'fvgSensEnabled', type: 'bool', title: '', defval: true, inline: 'sens', group: G_GEN },
  {
    id: 'fvgSensitivityText', type: 'string', title: 'Detection Sensitivity', defval: 'Extreme',
    options: ['Extreme', 'High', 'Normal', 'Low'], inline: 'sens', group: G_GEN,
  },
  {
    id: 'allowGaps', type: 'bool', title: 'Allow Gaps Between Bars', defval: false, group: G_GEN,
    tooltip: "On tickers that can have a different opening price than the previous bar's closing price, the indicator will not analyze those bars for FVGs if disabled.\n\nFor Example, if the today's opening price is different from the yesterday's closing price in a stock ticker.",
  },
  { id: 'showInvalidated', type: 'bool', title: 'Show Historic Zones', defval: true, group: G_GEN },
  { id: 'bullColor', type: 'color', title: 'Bull Color', defval: defaultInputs.bullColor, inline: 'BBcolors', group: G_STYLE },
  { id: 'bearColor', type: 'color', title: 'Bear Color', defval: defaultInputs.bearColor, inline: 'BBcolors', group: G_STYLE },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: defaultInputs.textColor, inline: 'BBcolors', group: G_STYLE },
  { id: 'startZoneFrom', type: 'string', title: 'Start Zones From', defval: 'Last Bar', options: ['First Bar', 'Last Bar'], group: G_STYLE },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Volumized Fair Value Gaps | Flux Charts',
  shortTitle: 'Volumized FVGs | Flux Charts',
  overlay: true,
};

// Constants of the original (DEBUG = false)
const MAX_BOXES = 500;
const SHOW_LAST_X_FVGS = 125;
const EXTEND_LAST_X_FVGS = 3;
const MINIMUM_FVG_SIZE = 3;
const OVERLAP_THRESHOLD = 0;
const MAX_DISTANCE_TO_LAST_BAR = 10000;
const ATR_LEN = 10;
const DELETE_UNTOUCHED_AFTER = 200;
const EXTEND_ZONES_BY = 15;

/** Pine float comparisons within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && b - a <= EPS;
const le = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && a - b <= EPS;
const nz = (v: number) => (Number.isFinite(v) ? v : 0);
/** math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b));

interface FVG {
  max: number;
  min: number;
  isBull: boolean;
  totalVolume: number;
  startTime: number;
  endTime: number;
  extendInfinite: boolean;
  combined: boolean;
  disabled: boolean;
  lowVolume: number;
  highVolume: number;
  lastTouched: number;
}

const createFVG = (h: number, l: number, bull: boolean, volume: number): FVG => ({
  max: h, min: l, isBull: bull, totalVolume: volume, startTime: NaN, endTime: NaN, extendInfinite: false, combined: false,
  disabled: false, lowVolume: NaN, highVolume: NaN, lastTouched: NaN,
});

export function calculate(
  bars: Bar[],
  inputs: Partial<FairValueGapsFluxChartsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  resetDrawings({ box: MAX_BOXES, label: MAX_BOXES, line: MAX_BOXES });
  const result: IndicatorResult = {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
  };
  if (n === 0) return { ...result, alerts: alertStates(alertConditions, bars, [[]]) };

  const ms = bars[0].time >= 1e12;
  const time = bars.map((b) => (ms ? b.time : b.time * 1000));
  const last = n - 1;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const vol = bars.map((b) => b.volume ?? NaN);
  const atr = A(ta.atr(bars, ATR_LEN));
  const cumVol = A(ta.cum(Series.fromArray(bars, vol)));
  const sens = cfg.fvgSensitivityText === 'Extreme' ? 6 : cfg.fvgSensitivityText === 'High' ? 2
    : cfg.fvgSensitivityText === 'Normal' ? 1.5 : 1;

  // The block runs on the last 10,000 bars and on closed bars (its ta.sma / math.sum calls see those bars only)
  const first = Math.max(0, last - MAX_DISTANCE_TO_LAST_BAR + 1);
  const end = lastBarConfirmedOf(chart) ? last : last - 1;
  const runs = Math.max(0, end - first + 1);
  const sub = bars.slice(first, first + runs);
  const subVol = Series.fromArray(sub, vol.slice(first, first + runs));
  const shortVol = A(ta.sma(subVol, 5));
  const longVol = A(ta.sma(subVol, 15));
  const volSum3 = A(math.sum(subVol, 3));

  const fvgList: FVG[] = [];
  let barIndex = 0;
  // totalFVGIndex += 1 on the bars where a zone is added
  const added = new Array<boolean>(n).fill(false);
  const isValid = (f: FVG): boolean => {
    if (!cfg.showInvalidated && !Number.isNaN(f.endTime)) return false;
    if (f.disabled) return false;
    if (!Number.isNaN(f.endTime) && lt(f.endTime - f.startTime, MINIMUM_FVG_SIZE)) return false;
    if (Number.isNaN(f.endTime) && gt(barIndex - f.lastTouched, DELETE_UNTOUCHED_AFTER)) return false;
    return true;
  };

  for (let i = first; i <= end; i++) {
    barIndex = i;
    const k = i - first;
    const o = (j: number) => (i - j >= 0 ? bars[i - j].open : NaN);
    const c = (j: number) => (i - j >= 0 ? bars[i - j].close : NaN);
    const h = (j: number) => (i - j >= 0 ? bars[i - j].high : NaN);
    const l = (j: number) => (i - j >= 0 ? bars[i - j].low : NaN);
    const v = (j: number) => (i - j >= 0 ? vol[i - j] : NaN);
    const volCheck = gt(cumVol[i], 0);
    const shortTerm = volCheck ? shortVol[k] : 1;
    const longTerm = volCheck ? longVol[k] : 0;

    const size = (j: number) => max(o(j), c(j)) - min(o(j), c(j));
    const barSizeSum = size(0) + size(1) + size(2);
    let fvgBarsCheck = false;
    if (cfg.fvgBars === 'Same Type') {
      if ((gt(o(0), c(0)) && gt(o(1), c(1)) && gt(o(2), c(2))) || (le(o(0), c(0)) && le(o(1), c(1)) && le(o(2), c(2)))) {
        fvgBarsCheck = true;
      }
    } else {
      fvgBarsCheck = true;
    }
    let bearCondition = false;
    let bullCondition = false;
    if (fvgBarsCheck) {
      const maxCODiff = max(Math.abs(c(2) - o(1)), Math.abs(c(1) - o(0)));
      const gapOk = cfg.allowGaps || le(maxCODiff, atr[i]);
      if (cfg.fvgFilterMethod === 'Average Range') {
        bearCondition = (gt(barSizeSum * sens, atr[i] / 1.5) || !cfg.fvgSensEnabled) && gapOk;
        bullCondition = bearCondition;
      } else {
        const thresholdMultiplier = cfg.volumeThresholdPercent / 100.0;
        bearCondition = gt(shortTerm, longTerm * thresholdMultiplier) && gapOk;
        bullCondition = bearCondition;
      }
    }
    const bearFVG = lt(h(0), l(2)) && lt(c(1), l(2)) && bearCondition;
    const bullFVG = gt(l(0), h(2)) && gt(c(1), h(2)) && bullCondition;
    const totalVolume = volCheck ? volSum3[k] : 0;
    const newFVG = bearFVG ? createFVG(l(2), h(0), false, totalVolume) : bullFVG ? createFVG(l(0), h(2), true, totalVolume) : null;
    const fvgSize = bearFVG ? Math.abs(l(2) - h(0)) : bullFVG ? Math.abs(l(0) - h(2)) : 0;
    if (gt(fvgSize * sens, atr[i]) || !cfg.fvgSensEnabled) {
      if (newFVG) {
        newFVG.startTime = cfg.startZoneFrom === 'First Bar' ? (i - 2 >= 0 ? time[i - 2] : NaN) : time[i];
        newFVG.lastTouched = time[i];
        if (bearFVG) {
          newFVG.lowVolume = volCheck ? v(0) + v(1) : 0;
          newFVG.highVolume = volCheck ? v(2) : 0;
        } else {
          newFVG.lowVolume = volCheck ? v(2) : 0;
          newFVG.highVolume = volCheck ? v(0) + v(1) : 0;
        }
        added[i] = true;
        fvgList.unshift(newFVG);
        while (fvgList.length > SHOW_LAST_X_FVGS) fvgList.pop();
      }
    }

    // Find closed FVGs
    const { low, high, close } = bars[i];
    for (const f of fvgList) {
      if (!Number.isNaN(f.endTime)) continue;
      if ((f.isBull && le(low, f.max)) || (!f.isBull && ge(high, f.min))) f.lastTouched = i;
      if (f.isBull && (cfg.fvgEndMethod === 'Wick' ? lt(low, f.min) : lt(close, f.min))) f.endTime = time[i];
      if (!f.isBull && (cfg.fvgEndMethod === 'Wick' ? gt(high, f.max) : gt(close, f.max))) f.endTime = time[i];
    }

    // Remove old FVGs (from the end of the list)
    const toRemove: number[] = [];
    for (let j = 0; j < fvgList.length; j++) {
      const idx = fvgList.length - 1 - j;
      if (!isValid(fvgList[idx])) toRemove.push(idx);
    }
    for (const idx of toRemove) fvgList.splice(idx, 1);
  }

  // barstate.islast
  barIndex = last;
  setDrawingBar(last, true);
  const nowTime = time[last];

  const areaOf = (f: FVG) => {
    const xa1 = f.startTime;
    const xa2 = Number.isNaN(f.endTime) ? f.startTime + EXTEND_ZONES_BY : f.endTime;
    const ya1 = f.max;
    const ya2 = f.min;
    const edge1 = Math.sqrt((xa2 - xa1) * (xa2 - xa1) + (ya2 - ya2) * (ya2 - ya2));
    const edge2 = Math.sqrt((xa2 - xa2) * (xa2 - xa2) + (ya2 - ya1) * (ya2 - ya1));
    return edge1 * edge2;
  };
  const touch = (f1: FVG, f2: FVG) => {
    const xa1 = f1.startTime;
    const xa2 = Number.isNaN(f1.endTime) ? f1.startTime + EXTEND_ZONES_BY : f1.endTime;
    const ya1 = f1.max;
    const ya2 = f1.min;
    const xb1 = f2.startTime;
    const xb2 = Number.isNaN(f2.endTime) ? f2.startTime + EXTEND_ZONES_BY : f2.endTime;
    const yb1 = f2.max;
    const yb2 = f2.min;
    const inter = max(0, min(xa2, xb2) - max(xa1, xb1)) * max(0, min(ya1, yb1) - max(ya2, yb2));
    const union = areaOf(f1) + areaOf(f2) - inter;
    const overlapPercentage = (inter / union) * 100.0;
    return gt(overlapPercentage, OVERLAP_THRESHOLD);
  };

  // combineFVGsFunc(): the loop bounds are evaluated when each loop starts (Pine version 5)
  if (fvgList.length > 0) {
    let lastCombinations = 999;
    while (lastCombinations > 0) {
      lastCombinations = 0;
      const iEnd = fvgList.length - 1;
      for (let i = 0; i <= iEnd; i++) {
        const f1 = fvgList[i];
        const jEnd = fvgList.length - 1;
        for (let j = 0; j <= jEnd; j++) {
          const f2 = fvgList[j];
          if (i === j) continue;
          if (!isValid(f1) || !isValid(f2)) continue;
          if (f1.isBull !== f2.isBull) continue;
          if (touch(f1, f2)) {
            f1.disabled = true;
            f2.disabled = true;
            const f = createFVG(max(f1.max, f2.max), min(f1.min, f2.min), f1.isBull, 0);
            f.startTime = min(f1.startTime, f2.startTime);
            const e = Math.max(nz(f1.endTime), nz(f2.endTime));
            f.endTime = e === 0 ? NaN : e;
            f.totalVolume = f1.totalVolume + f2.totalVolume;
            f.lowVolume = f1.lowVolume + f2.lowVolume;
            f.highVolume = f1.highVolume + f2.highVolume;
            f.lastTouched = max(f1.lastTouched, f2.lastTouched);
            f.combined = true;
            fvgList.unshift(f);
            lastCombinations += 1;
          }
        }
      }
    }
  }

  // colorWithTransparency(c, x) = color.new(c, color.t(c) * x)
  const withT = (c: string, x: number) => String(color.new(c, color.t(c) * x));
  // A float x given to the int parameter of a box / line setter is truncated
  const X = (x: number) => Math.trunc(x);
  const newBox = (c: string, x = 1.0): Box => box.new(NaN, NaN, NaN, NaN, '#00000000', undefined, undefined, 'none',
    'bar_time', withT(c, x), undefined, 'normal', cfg.textColor, 'center');
  const moveBox = (b: Box, x1: number, y1: number, x2: number, y2: number) => {
    box.set_lefttop(b, X(x1), y1);
    box.set_rightbottom(b, X(x2), y2);
  };
  const render = (f: FVG) => {
    const fvgBox = newBox(f.isBull ? cfg.bullColor : cfg.bearColor, 1.5);
    const boxPositive = newBox(cfg.bullColor);
    const boxNegative = newBox(cfg.bearColor);
    const boxText = newBox(String(color.new('#FFFFFF', 100)));
    const separator: Line = line.new(NaN, NaN, NaN, NaN, 'bar_time', 'none', cfg.textColor, 'dashed', 1);
    const textSeparator: Line = line.new(NaN, NaN, NaN, NaN, 'bar_time', 'none', cfg.textColor, 'solid', 1);

    let zoneSize = Number.isNaN(f.endTime) ? EXTEND_ZONES_BY : f.endTime - f.startTime;
    if (Number.isNaN(f.endTime) && f.extendInfinite) zoneSize = nowTime - f.startTime;
    // volume bars on the left side
    const startX = f.startTime;
    const maxEndX = f.startTime + zoneSize / 3;
    moveBox(fvgBox, f.startTime, f.max, f.startTime + zoneSize, f.min);
    moveBox(boxText, maxEndX, f.max, f.startTime + zoneSize, f.min);

    const percentage = nz(Math.trunc((min(f.highVolume, f.lowVolume) / max(f.highVolume, f.lowVolume)) * 100.0));
    const text = f.totalVolume === 0 ? 'FVG'
      : str.tostring(f.totalVolume, 'volume') + ' (' + str.tostring(percentage) + '%)' + (f.combined ? '\n[Combined]' : '');
    box.set_text(boxText, text);
    if (f.combined) box.set_bgcolor(fvgBox, withT(f.isBull ? cfg.bullColor : cfg.bearColor, 1.1));

    if (f.totalVolume !== 0) {
      const mid = (f.min + f.max) / 2;
      const curEndXHigh = Math.trunc(Math.ceil((f.highVolume / f.totalVolume) * (maxEndX - startX) + startX));
      const curEndXLow = Math.trunc(Math.ceil((f.lowVolume / f.totalVolume) * (maxEndX - startX) + startX));
      // mirrored volume bars
      moveBox(boxPositive, startX, f.max, curEndXHigh, mid);
      box.set_text(boxPositive, '');
      moveBox(boxNegative, startX, f.min, curEndXLow, mid);
      box.set_text(boxNegative, '');
      line.set_xy1(separator, X(startX), mid);
      line.set_xy2(separator, X(maxEndX), mid);
      line.set_xy1(textSeparator, X(maxEndX), f.max);
      line.set_xy2(textSeparator, X(maxEndX), f.min);
    }
  };

  let extended = 0;
  for (let i = fvgList.length - 1; i >= 0; i--) {
    const f = fvgList[i];
    if (!isValid(f)) continue;
    if (Number.isNaN(f.endTime) && extended < EXTEND_LAST_X_FVGS) {
      extended += 1;
      f.extendInfinite = true;
    }
    render(f);
  }
  setDrawingBar(null);

  const out = drawingOutputs(bars, ms ? 'ms' : 's');
  // alertcondition(barstate.islast and barstate.isnew and totalFVGIndex > totalFVGIndex[2]), read before the block
  // of the last bar runs: totalFVGIndex is then its value of the bar before, which is above the value of two bars
  // back when a zone was added on the bar before
  const newFvg = bars.map((_b, i) => i === last && i >= 2 && added[i - 1]);
  return { ...result, boxes: out.boxes ?? [], lines: out.lines ?? [], alerts: alertStates(alertConditions, bars, [newFvg]) };
}

/** The original's alertcondition */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'New FVG @ {{ticker}}', message: '' },
];

export const FairValueGapsFluxCharts = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
