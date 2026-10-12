/**
 * Ghost Tangent Crossings [ChartPrime]
 *
 * A zigzag drawn with quarter ellipses, with a tangent line and a break label per leg.
 * - Pivots: a pivot high (low) needs `Pivot Lookforward` lower (higher) bars after it; the number of bars before it
 *   follows the distance to the end of the latest leg (0 to 500, 5 before the first leg).
 * - A new pivot high after the latest pivot low starts an up leg (and the mirror for a down leg); legs alternate.
 *   The leg is a quarter ellipse from the pivot at its start to the new pivot (one point per bar where the curve
 *   changes bar).
 * - Equipoint: the point of the curve that splits its vertical travel in two equal parts. "Directional" draws the
 *   tangent of the ellipse at that point, "Horizontal" a level at that point.
 * - Break ("B"): the first bar after the leg whose high (up leg) is below the tangent, or whose low (down leg) is
 *   above it.
 * - Ghost: while the next leg is not confirmed, the leg that the highest high (lowest low) since the latest pivot
 *   would give is drawn in a lighter colour and redrawn on every bar.
 * The last `Max Zig-Zags` legs are kept.
 *
 * A leg is only added on a closed bar: the chart context says whether the last bar is closed (closed without it).
 * As in the original, a line that would end more than 500 bars after the last bar stops the script with an Error.
 *
 * Reference: "Ghost Tangent Crossings [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import { math, array, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { LabelData, LineDrawingData, PolylineData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface GhostTangentCrossingsInputs {
  pivotType: 'Wick' | 'Body';
  pivotForward: number;
  showEllipticalZig: boolean;
  showGhosts: boolean;
  showBreak: boolean;
  maxZig: number;
  equipointStyle: 'Directional' | 'Horizontal' | 'None';
  extendLine: boolean;
  upColor: string;
  downColor: string;
  ghostUpColor: string;
  ghostDownColor: string;
  textColor: string;
}

export const defaultInputs: GhostTangentCrossingsInputs = {
  pivotType: 'Wick',
  pivotForward: 25,
  showEllipticalZig: true,
  showGhosts: true,
  showBreak: true,
  maxZig: 10,
  equipointStyle: 'Directional',
  extendLine: false,
  upColor: '#1bcf66',
  downColor: '#ee2d2d',
  ghostUpColor: 'rgba(27, 207, 102, 0.23)',
  ghostDownColor: 'rgba(238, 45, 45, 0.23)',
  textColor: '#EEEEEE',
};

const settings = 'Settings';
const visual = 'Visuals';

export const inputConfig: InputConfig[] = [
  { id: 'pivotType', type: 'string', title: 'Pivot Style', defval: 'Wick', options: ['Wick', 'Body'], group: settings },
  { id: 'pivotForward', type: 'int', title: 'Pivot Lookforward', defval: 25, min: 1, group: settings },
  { id: 'showEllipticalZig', type: 'bool', title: 'Show Elliptical Zig-Zag', defval: true, group: visual },
  { id: 'showGhosts', type: 'bool', title: 'Show Ghost Elliptical Zig-Zag', defval: true, group: visual },
  { id: 'showBreak', type: 'bool', title: 'Show Break', defval: true, group: visual },
  { id: 'maxZig', type: 'int', title: 'Max Zig-Zags', defval: 10, min: 0, max: 100, group: visual },
  { id: 'equipointStyle', type: 'string', title: 'Equipoint Style', defval: 'Directional', options: ['Directional', 'Horizontal', 'None'], group: visual },
  { id: 'extendLine', type: 'bool', title: 'Extend Lines', defval: false, group: visual },
  { id: 'upColor', type: 'color', title: 'Up Color', defval: '#1bcf66', group: visual },
  { id: 'downColor', type: 'color', title: 'Down Color', defval: '#ee2d2d', group: visual },
  { id: 'ghostUpColor', type: 'color', title: 'Ghost Up Color', defval: 'rgba(27, 207, 102, 0.23)', group: visual },
  { id: 'ghostDownColor', type: 'color', title: 'Ghost Down Color', defval: 'rgba(238, 45, 45, 0.23)', group: visual },
  { id: 'textColor', type: 'color', title: 'Text Color', defval: '#EEEEEE', group: visual },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Ghost Tangent Crossings [ChartPrime]',
  shortTitle: 'Ghost Tangent Crossings [ChartPrime]',
  overlay: true,
};

/** A drawing cannot be placed more than this number of bars after the last bar */
const MAX_FUTURE_BARS = 500;
/** Default text colour of a label in Pine version 5 */
const LABEL_TEXT = '#363A45';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
/** nz(x, y) */
const nz = (v: number, replacement: number) => (Number.isFinite(v) ? v : replacement);

interface Point {
  index: number;
  price: number;
}
interface Pivot {
  current: number;
  currentIdx: number;
}
interface Poly {
  points: Point[];
  color: string;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  color: string;
  textColor: string;
  style: 'circle' | 'label_down' | 'label_up';
  size: 'auto' | 'normal';
  yloc: 'price' | 'abovebar' | 'belowbar';
}
interface Ln {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  extend: 'none' | 'right' | 'both';
}

/** generate_ellipse(): the points of a quarter ellipse from (end_x, start_y) to (start_x, end_y), one per bar change */
function generateEllipse(startX: number, endX: number, startY: number, endY: number): Point[] {
  const points: Point[] = [];
  const a = endX - startX;
  const b = endY - startY;
  let x = NaN;
  if (gt(a, 1)) {
    for (let i = 0; i <= 90; i++) {
      const rad = math.toradians(i) as number;
      const newX = Math.trunc(a * (math.cos(rad) as number));
      const y = b * (math.sin(rad) as number);
      // x != new_x is false while x is na (the first step)
      if (!isNaN(x) && x !== newX) points.push({ index: startX + x, price: startY + y });
      x = newX;
    }
    points.push({ index: startX, price: endY });
  } else {
    points.unshift({ index: endX, price: startY });
    points.push({ index: startX, price: endY });
  }
  return points;
}

/** ellipse_slope(): the point that splits the vertical travel of the curve in two, and the slope of the ellipse there */
function ellipseSlope(startX: number, endX: number, startY: number, endY: number, points: Point[]): { tangent: Point; slope: number } {
  if (points.length > 2) {
    const dy: number[] = [];
    const centers: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= points.length - 2; i++) dy.push(Math.abs(points[i + 1].price - points[i].price));
    for (let i = 1; i <= dy.length - 1; i++) {
      idx.push(i);
      const left = array.sum(dy.slice(0, i + 1));
      const right = array.sum(dy.slice(i - 1, dy.length));
      centers.push(Math.abs(left - right));
    }
    const at = array.indexof(centers, array.min(centers));
    if (at < 0) throw new Error(`Index ${at} is out of bounds, array size is ${idx.length}`);
    const tangent = points[idx[at]];
    const a = endX - startX;
    const b = endY - startY;
    const x = tangent.index - startX;
    const y = tangent.price - startY;
    const slope = -((math.pow(b, 2) as number) * x) / ((math.pow(a, 2) as number) * y);
    return { tangent, slope };
  }
  const first = points[0];
  const last = points[points.length - 1];
  return { tangent: first, slope: -(last.price - first.price) };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<GhostTangentCrossingsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'labels' | 'lines' | 'polylines'> & { labels: LabelData[]; lines: LineDrawingData[]; polylines: PolylineData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const pivotForward = Math.trunc(cfg.pivotForward);
  const maxZig = Math.trunc(cfg.maxZig);
  const wick = cfg.pivotType === 'Wick';
  const highSource = bars.map((b) => (wick ? b.high : Math.max(b.open, b.close)));
  const lowSource = bars.map((b) => (wick ? b.low : Math.min(b.open, b.close)));
  const lastConfirmed = lastBarConfirmedOf(chart);

  // ta.pivothigh(source, back, forward) with a number of bars before the pivot that changes on every bar: one call
  // site each, called on every bar with the lengths of that bar
  const pivotHighSite = callsite.pivothigh();
  const pivotLowSite = callsite.pivotlow();

  const zigZags: Poly[] = [];
  const zigZagPoints: Lb[] = [];
  const equipoints: Ln[] = [];
  const breakLabels: Array<Lb | null> = [];
  let ghostZigZags: Poly[] = [];
  let ghostZigZagPoints: Lb[] = [];
  let ghostEquipoints: Ln[] = [];

  const newLine = (i: number, l: Ln): Ln => {
    if (l.x1 > n - 1 + MAX_FUTURE_BARS || l.x2 > n - 1 + MAX_FUTURE_BARS) {
      throw new Error(
        `Error on bar ${i}: Objects positioned using xloc.bar_index cannot be drawn further than ${MAX_FUTURE_BARS} bars into the future.`,
      );
    }
    return l;
  };

  /** check_b(): the first bar after the leg that is on the other side of the tangent */
  const checkB = (i: number, startX: number, startY: number, forwardLength: number, slope: number, polarity: boolean) => {
    let k = forwardLength - 1;
    const startIdx = i - startX;
    let currentIdx = startIdx;
    while (currentIdx >= 0) {
      k += 1;
      const checkPrice = startY + slope * k;
      currentIdx = startIdx - k;
      if (currentIdx < 0) break;
      const bar = bars[i - currentIdx];
      const endPrice = polarity ? bar.high : bar.low;
      if (polarity ? lt(endPrice, checkPrice) : gt(endPrice, checkPrice)) return { price: endPrice, index: i - currentIdx };
    }
    return null;
  };

  const generateZigZag = (
    i: number, startX: number, endX: number, startY: number, endY: number, upColor: string, downColor: string,
    points: Lb[], polys: Poly[], lines: Ln[], polarity: boolean, ghost: boolean,
  ) => {
    const bullishColor = polarity ? upColor : downColor;
    const ellipsePoints = generateEllipse(startX, endX, startY, endY);
    const { tangent, slope } = ellipseSlope(startX, endX, startY, endY, ellipsePoints);
    const length = endX - startX;
    const backLength = tangent.index - startX;
    const forwardLength = length - backLength;

    if (cfg.showEllipticalZig) {
      const last = ellipsePoints[ellipsePoints.length - 1];
      points.push({ x: last.index, y: last.price, text: '', color: bullishColor, textColor: LABEL_TEXT, style: 'circle', size: 'auto', yloc: 'price' });
      polys.push({ points: ellipsePoints, color: bullishColor });
    }
    if (cfg.equipointStyle === 'Directional') {
      lines.push(newLine(i, cfg.extendLine
        ? { x1: tangent.index, y1: tangent.price, x2: tangent.index + 1, y2: tangent.price + slope, color: bullishColor, extend: 'both' }
        : {
          x1: tangent.index - backLength, y1: tangent.price - slope * backLength,
          x2: tangent.index + backLength, y2: tangent.price + slope * backLength, color: bullishColor, extend: 'none',
        }));
    }
    if (cfg.equipointStyle === 'Horizontal') {
      lines.push(newLine(i, cfg.extendLine
        ? { x1: tangent.index, y1: tangent.price, x2: tangent.index + 1, y2: tangent.price, color: bullishColor, extend: 'right' }
        : { x1: tangent.index, y1: tangent.price, x2: tangent.index + length * 2, y2: tangent.price, color: bullishColor, extend: 'none' }));
    }
    if (cfg.showBreak && !ghost) {
      const found = checkB(i, tangent.index, tangent.price, forwardLength, slope, polarity);
      // not found: a label without coordinates, which takes a place in the list and is not drawn
      breakLabels.push(found && {
        x: found.index, y: found.price, text: 'B', color: polarity ? cfg.downColor : cfg.upColor, textColor: cfg.textColor,
        style: polarity ? 'label_down' : 'label_up', size: 'normal', yloc: polarity ? 'abovebar' : 'belowbar',
      });
    }
  };

  const dumpGhost = () => {
    ghostZigZags = [];
    ghostZigZagPoints = [];
    ghostEquipoints = [];
  };

  const pivotHigh: Pivot = { current: NaN, currentIdx: NaN };
  const pivotLow: Pivot = { current: NaN, currentIdx: NaN };
  let phBack = pivotForward;
  let plBack = pivotForward;
  let lastUpStart = NaN;
  let lastUpEnd = NaN;
  let lastDownStart = NaN;
  let lastDownEnd = NaN;
  let lastHigh = NaN;
  let lastLow = NaN;
  let polarity: boolean | null = null;
  const sincePlSite = callsite.barssince();
  const sincePhSite = callsite.barssince();

  for (let i = 0; i < n; i++) {
    const newPh = !isNaN(pivotHighSite(i, highSource[i], phBack, pivotForward));
    if (newPh) {
      pivotHigh.current = highSource[i - pivotForward];
      pivotHigh.currentIdx = i - pivotForward;
    }
    const newPl = !isNaN(pivotLowSite(i, lowSource[i], plBack, pivotForward));
    if (newPl) {
      pivotLow.current = lowSource[i - pivotForward];
      pivotLow.currentIdx = i - pivotForward;
    }
    const ph = pivotHigh;
    const pl = pivotLow;
    const polarityUp = ph.currentIdx > pl.currentIdx;
    const polarityDown = ph.currentIdx < pl.currentIdx;
    // not polarity: an na bool is false
    const upWait = polarity !== true;
    const downWait = polarity === true;
    const confirmed = i < n - 1 || lastConfirmed;

    if (newPh && polarityUp && (lastUpStart < pl.currentIdx || isNaN(lastUpStart)) && upWait && confirmed) {
      dumpGhost();
      const connect = !isNaN(lastDownEnd) ? pl.currentIdx === lastDownEnd : true;
      const startX = connect ? pl.currentIdx : lastDownEnd;
      const endX = ph.currentIdx;
      const startY = ph.current;
      const endY = connect ? pl.current : lastLow;
      lastUpStart = startX;
      lastUpEnd = endX;
      lastHigh = startY;
      polarity = true;
      generateZigZag(i, startX, endX, startY, endY, cfg.upColor, cfg.downColor, zigZagPoints, zigZags, equipoints, true, false);
    }
    if (newPl && polarityDown && (lastDownStart < ph.currentIdx || isNaN(lastDownStart)) && downWait && confirmed) {
      dumpGhost();
      const connect = !isNaN(lastUpEnd) ? ph.currentIdx === lastUpEnd : true;
      const startX = connect ? ph.currentIdx : lastUpEnd;
      const endX = pl.currentIdx;
      const startY = pl.current;
      const endY = connect ? ph.current : lastHigh;
      lastDownStart = startX;
      lastDownEnd = endX;
      lastLow = startY;
      polarity = false;
      generateZigZag(i, startX, endX, startY, endY, cfg.upColor, cfg.downColor, zigZagPoints, zigZags, equipoints, false, false);
    }

    // Ghost up leg: from the latest pivot low (or the end of the latest down leg) to the highest bar since
    const ghostUpConnect = !isNaN(lastDownEnd) ? pl.currentIdx === lastDownEnd : true;
    const ghostUpStartX = ghostUpConnect ? pl.currentIdx : lastDownEnd;
    const sincePl = sincePlSite(newPl);
    const ghostUpRange = i - ghostUpStartX;
    const ghostMax: number[] = [];
    if (ghostUpRange >= 0) {
      const to = ghostUpRange - sincePl;
      for (let k = 0; to >= 0 ? k <= to : k >= to; k += to >= 0 ? 1 : -1) ghostMax.push(i - k >= 0 && k >= 0 ? highSource[i - k] : NaN);
    }
    const ghostUpStartY = array.max(ghostMax);
    const ghostUpEndY = ghostUpConnect ? pl.current : lastLow;
    const ghostUpSince = ghostMax.length > 0 ? array.indexof(ghostMax, ghostUpStartY) : 0;
    const ghostUpEndX = i - ghostUpSince;
    if (upWait && !newPh && cfg.showGhosts) {
      dumpGhost();
      generateZigZag(
        i, ghostUpStartX, ghostUpEndX, ghostUpStartY, ghostUpEndY, cfg.ghostUpColor, cfg.ghostDownColor,
        ghostZigZagPoints, ghostZigZags, ghostEquipoints, true, true,
      );
    }

    // Ghost down leg
    const ghostDownConnect = !isNaN(lastUpEnd) ? ph.currentIdx === lastUpEnd : true;
    const ghostDownStartX = ghostDownConnect ? ph.currentIdx : lastUpEnd;
    const sincePh = sincePhSite(newPh);
    const ghostDownRange = i - ghostDownStartX;
    const ghostMin: number[] = [];
    if (ghostDownRange >= 0) {
      const to = ghostDownRange - sincePh;
      for (let k = 0; to >= 0 ? k <= to : k >= to; k += to >= 0 ? 1 : -1) ghostMin.push(i - k >= 0 && k >= 0 ? lowSource[i - k] : NaN);
    }
    const ghostDownStartY = array.min(ghostMin);
    const ghostDownEndY = ghostDownConnect ? ph.current : lastHigh;
    const ghostDownSince = ghostMin.length > 0 ? array.indexof(ghostMin, ghostDownStartY) : 0;
    const ghostDownEndX = i - ghostDownSince;
    if (downWait && !newPl && cfg.showGhosts) {
      dumpGhost();
      generateZigZag(
        i, ghostDownStartX, ghostDownEndX, ghostDownStartY, ghostDownEndY, cfg.ghostUpColor, cfg.ghostDownColor,
        ghostZigZagPoints, ghostZigZags, ghostEquipoints, false, true,
      );
    }

    if (zigZags.length > maxZig) {
      zigZags.shift();
      zigZagPoints.shift();
    }
    if (equipoints.length > maxZig) equipoints.shift();
    if (breakLabels.length > maxZig) breakLabels.shift();

    phBack = Math.min(Math.max(nz(i - lastDownEnd - plBack + 1, 5), 0), 500);
    plBack = Math.min(Math.max(nz(i - lastUpEnd - phBack + 1, 5), 0), 500);
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const drawn = (v: number) => Number.isFinite(v);
  const labels: LabelData[] = [...zigZagPoints, ...ghostZigZagPoints, ...breakLabels]
    .filter((l): l is Lb => l !== null && drawn(l.x) && drawn(l.y))
    .map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: l.color, textColor: l.textColor, style: l.style, size: l.size,
      ...(l.yloc !== 'price' ? { yloc: l.yloc } : {}),
    }));
  const lines: LineDrawingData[] = [...equipoints, ...ghostEquipoints]
    .filter((l) => drawn(l.x1) && drawn(l.x2) && drawn(l.y1) && drawn(l.y2))
    .map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: l.color, style: 'dashed' as const,
      ...(l.extend !== 'none' ? { extend: l.extend } : {}),
    }));
  const polylines: PolylineData[] = [...zigZags, ...ghostZigZags]
    .filter((p) => p.points.every((q) => drawn(q.index) && drawn(q.price)))
    .map((p) => ({ points: p.points.map((q) => ({ time: T(q.index), price: q.price })), lineColor: p.color, lineWidth: 2 }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines,
    labels,
    polylines,
  };
}

export const GhostTangentCrossings = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
