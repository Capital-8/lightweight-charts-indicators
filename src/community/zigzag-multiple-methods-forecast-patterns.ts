/**
 * ZigZag Multiple Methods - Forecast - patterns - labels
 *
 * A zigzag with five ways to find the turns (library FunctionZigZagMultipleMethods version 1, ported here):
 * - "(MANUAL) Percent price move over X * Y", "Percent price move over atr(X) * Y" (SMA of the true range over X
 *   bars / open * Y), "Percent price move over max(tr) * Y" (largest true range / open so far, times Y): the zigzag
 *   turns when the close moves past the extreme since the last turn by the last zigzag price times that rate;
 * - "high or low pivot(X, Y)": it turns on a pivot high / low with X bars left and Y bars right;
 * - "Price Action": it turns on a lower high with a lower low or a weak close (a higher low with a strong close).
 * The reverse line (the price that would turn the zigzag) is plotted one bar ahead.
 *
 * Drawings: the last 20 zigzag legs, a label per turn with its price, the volume of the leg and the harmonic
 * patterns found on the last 7 turns (library HarmonicPattern version 3, ported here: harmonic triangles, double /
 * triple / quadruple taps, AB=CD, Bat, Butterfly, Gartley, Crab, Shark, 5o, Wolf, contracting / expanding
 * triangles, head and shoulders, within an error margin), dashed rate lines between turns with their price / time
 * ratios, and a forecast of the next turn: averages (EMA of the changes, weight 2 / (n + 1)) of the swing size and
 * duration with their positive / negative deviations give a target line, two range arrows and a target box.
 * Colours are HSL colours (library ColorExtension version 4, ported here).
 *
 * The drawings use bar times (xloc.bar_time); a time between two bars is drawn on the next bar, as the original. A
 * forecast time after the last bar is drawn on the future bar that contains it: with the exchange calendar of the
 * chart context (trading days only on a stock), else the UTC rule of the bars.
 *
 * Reference: "[RS]ZigZag Multiple Methods - Forecast - patterns - labels" by RicardoSantos
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, str, color, math, line, label, box, resetDrawings, setDrawingBar, Series,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { barsAfterLastBar } from '../anchor-period';
import type { ChartContext } from '../chart-context';

const M000 = '(MANUAL) Percent price move over X * Y';
const M001 = 'Percent price move over atr(X) * Y';
const M002 = 'Percent price move over max(tr) * Y';
const M003 = 'high or low pivot(X, Y)';
const M004 = 'Price Action';
type ZigzagMethod = typeof M000 | typeof M001 | typeof M002 | typeof M003 | typeof M004;
type TextSize = 'tiny' | 'small' | 'normal' | 'large' | 'huge' | 'auto';

export interface ZigzagMultipleMethodsForecastPatternsInputs {
  showRealPivots: boolean;
  showZigzagLines: boolean;
  zigzagMethod: ZigzagMethod;
  paramX: number;
  paramY: number;
  showPivotPrice: boolean;
  showTriangleRates: boolean;
  showAngles: boolean;
  showPatterns: boolean;
  /** Pattern error margin, % */
  errorMargin: number;
  showProjections: boolean;
  showProjectionsSquare: boolean;
  showProjectionsSquareRates: boolean;
  averagingWeight: number;
  hueZig: number;
  hueZag: number;
  hueRate: number;
  hueTarget: number;
  hueZigBox: number;
  hueZagBox: number;
  reverseColor: string;
  saturation: number;
  lightness: number;
  textSize: TextSize;
}

export const defaultInputs: ZigzagMultipleMethodsForecastPatternsInputs = {
  showRealPivots: true,
  showZigzagLines: true,
  zigzagMethod: M000,
  paramX: 1.0,
  paramY: 1.0,
  showPivotPrice: true,
  showTriangleRates: true,
  showAngles: false,
  showPatterns: true,
  errorMargin: 5.0,
  showProjections: true,
  showProjectionsSquare: true,
  showProjectionsSquareRates: false,
  averagingWeight: 10,
  hueZig: 175,
  hueZag: 20,
  hueRate: 200,
  hueTarget: 200,
  hueZigBox: 175,
  hueZagBox: 20,
  reverseColor: '#787B86',
  saturation: 80,
  lightness: 70,
  textSize: 'small',
};

const ZZ = 'ZigZag Options:';
const LB = 'Label Options:';
const PT = 'Pattern Options:';
const PR = 'Projection Options:';
const CP = 'Color Profile';
export const inputConfig: InputConfig[] = [
  { id: 'showRealPivots', type: 'bool', title: 'Show real zigzag pivots:', defval: true, group: ZZ },
  { id: 'showZigzagLines', type: 'bool', title: 'Show zigzag lines:', defval: true, group: ZZ },
  { id: 'zigzagMethod', type: 'string', title: 'Method to use for the zigzag:', defval: M000, options: [M000, M001, M002, M003, M004], group: ZZ },
  { id: 'paramX', type: 'float', title: 'parameter X', defval: 1.0, group: ZZ },
  { id: 'paramY', type: 'float', title: 'parameter Y', defval: 1.0, group: ZZ },
  { id: 'showPivotPrice', type: 'bool', title: 'Show price labels on zigzag:', defval: true, group: LB },
  { id: 'showTriangleRates', type: 'bool', title: 'Show rate labels on triangles:', defval: true, group: LB },
  { id: 'showAngles', type: 'bool', title: 'Show Angle Degree information(EXPERIMENTAL):', defval: false, group: LB },
  { id: 'showPatterns', type: 'bool', title: 'Show Patterns:', defval: true, group: PT },
  { id: 'errorMargin', type: 'float', title: 'Pattern Error Margin:', defval: 5.0, group: PT },
  { id: 'showProjections', type: 'bool', title: 'Show projections forecast of zigzag:', defval: true, group: PR },
  { id: 'showProjectionsSquare', type: 'bool', title: 'Show projections forecast Bounds:', defval: true, group: PR },
  { id: 'showProjectionsSquareRates', type: 'bool', title: 'Show projections target rates:', defval: false, group: PR },
  { id: 'averagingWeight', type: 'float', title: 'Averaging Weight:', defval: 10, group: PR },
  { id: 'hueZig', type: 'int', title: 'Zig Color Hue:', defval: 175, min: 0, max: 360, group: CP },
  { id: 'hueZag', type: 'int', title: 'Zag Color Hue:', defval: 20, min: 0, max: 360, group: CP },
  { id: 'hueRate', type: 'int', title: 'Rate Color Hue:', defval: 200, min: 0, max: 360, group: CP },
  { id: 'hueTarget', type: 'int', title: 'Proj. target Color Hue:', defval: 200, min: 0, max: 360, group: CP },
  { id: 'hueZigBox', type: 'int', title: 'Zig Proj. box Color Hue:', defval: 175, min: 0, max: 360, group: CP },
  { id: 'hueZagBox', type: 'int', title: 'Zag Proj. box Color Hue:', defval: 20, min: 0, max: 360, group: CP },
  { id: 'reverseColor', type: 'color', title: 'Reverse Line:', defval: '#787B86', group: CP },
  { id: 'saturation', type: 'int', title: 'Color Saturation:', defval: 80, min: 0, max: 100, group: CP },
  { id: 'lightness', type: 'int', title: 'Color Lightness:', defval: 70, min: 0, max: 100, group: CP },
  { id: 'textSize', type: 'string', title: 'Text Size:', defval: 'small', options: ['tiny', 'small', 'normal', 'large', 'huge', 'auto'], group: CP },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'R', color: '#787B86', lineWidth: 1, style: 'stepline' },
  { id: 'plot1', title: 'R', color: '#787B86', lineWidth: 4, style: 'circles' },
];

export const metadata = {
  title: '[RS]ZigZag Multiple Methods - Forecast - patterns - labels',
  shortTitle: 'ZZ',
  overlay: true,
};

/** Pine comparisons: a > b only when a - b > 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => ge(b, a);
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
const nz = (x: number, y = 0) => (Number.isFinite(x) ? x : y);
const GRAY = '#787B86';

// ---------------------------------------------------------------------------------------------------------------
// ColorExtension (version 4): hsl()
// ---------------------------------------------------------------------------------------------------------------
function hsl(hue: number, saturation: number, lightness: number, transparency: number): string {
  if (hue < 0 || hue > 360) throw new Error(`ColorExtension -> hsl(): "hue" parameter is out of range, expecting 0-360, received: ${hue}`);
  if (saturation < 0 || saturation > 100) throw new Error(`ColorExtension -> hsl(): "saturation" parameter is out of range, expecting 0-100, received: ${saturation}`);
  if (lightness < 0 || lightness > 100) throw new Error(`ColorExtension -> hsl(): "lightness" parameter is out of range, expecting 0-100, received: ${lightness}`);
  const h30 = hue / 30.0;
  const l1 = lightness * 0.01;
  const a = saturation * Math.min(l1, 1.0 - l1) * 0.01;
  const ch = (k: number) => 255.0 * (l1 - a * Math.max(Math.min(k - 3.0, 9.0 - k, 1.0), -1.0));
  return String(color.rgb(ch(h30 % 12.0), ch((8.0 + h30) % 12.0), ch((4.0 + h30) % 12.0), transparency));
}

// ---------------------------------------------------------------------------------------------------------------
// HarmonicPattern (version 3)
// ---------------------------------------------------------------------------------------------------------------
const linePriceRate = (c: number, b: number, a: number) => (a - b) / (b - c);
const lineTimeRate = (c: number, b: number, a: number) => (0 - (a - b)) / (b - c);
const inRange = (value: number, min: number, max: number, m: number) => le(value, max + m) && ge(value, min - m);
function isHarmonicTriangle(rate: number, m: number): boolean {
  for (let k = 1; k <= 12; k++) {
    const phid = 0 - Math.pow(math.phi, -5.0 + k);
    if (inRange(rate, phid, phid, m)) return true;
  }
  return false;
}
const is2Tap = (cba: number, m: number) => inRange(cba, -1, -1, m);
const is3Tap = (edc: number, cba: number, m: number) => inRange(edc, -1, -1, m) && inRange(cba, -1, -1, m);
const is4Tap = (gfe: number, edc: number, cba: number, m: number) =>
  inRange(gfe, -1, -1, m) && inRange(edc, -1, -1, m) && inRange(cba, -1, -1, m);
const isABCD = (cba: number, dcb: number, m: number) => inRange(cba, -1.618, -1.270, m) && inRange(dcb, -0.786, -0.618, m);
/** Four-rate patterns: [edc range, dcb range, cba range, eda range] */
type Ranges = [number, number, number, number, number, number, number, number];
const four = (r: Ranges) => (edc: number, dcb: number, cba: number, eda: number, m: number) =>
  inRange(edc, r[0], r[1], m) && inRange(dcb, r[2], r[3], m) && inRange(cba, r[4], r[5], m) && inRange(eda, r[6], r[7], m);
const isBat = four([-0.500, -0.382, -0.886, -0.382, -2.618, -1.618, -0.886, -0.886]);
const isButterfly = four([-0.786, -0.786, -0.886, -0.382, -2.618, -1.618, -1.618, -1.270]);
const isGartley = four([-0.618, -0.618, -0.886, -0.382, -2.618, -1.130, -0.786, -0.786]);
const isCrab = four([-0.886, -0.886, -0.886, -0.382, -3.618, -2.000, -1.618, -1.618]);
const isShark = four([-0.886, -0.886, -1.618, -1.130, -2.240, -1.270, -1.130, -0.886]);
const is5o = four([-1.618, -1.130, -2.240, -1.618, -0.500, -0.500, -0.236, +0.236]);
const isWolfe = four([-1.618, -1.270, -5.000, -0.000, -1.618, -1.270, -5.000, -0.000]);
const isConTria = four([-0.886, -0.236, -0.886, -0.236, -0.886, -0.236, -0.886, -0.236]);
const isExpTria = four([-2.618, -1.125, -2.618, -1.125, -2.618, -1.125, -2.618, -1.125]);
function isHnS(fed: number, feb: number, edc: number, dcb: number, cba: number, eda: number, m: number): boolean {
  return inRange(fed, -0.618, -0.090, m) && inRange(feb, -0.886, -0.090, m) && inRange(edc, -9.999, -1.000, m)
    && inRange(eda, -1.618, -0.090, m) && inRange(dcb, -1.250, -0.750, m) && inRange(cba, -0.886, -0.090, m);
}

/** extract(): the patterns found on the last 7 zigzag prices */
function extractPatterns(g: number, f: number, e: number, d: number, c: number, b: number, a: number, m: number): string[] {
  const gfa = linePriceRate(g, f, a);
  const gda = linePriceRate(g, d, a);
  const gfe = linePriceRate(g, f, e);
  const gba = linePriceRate(g, b, a);
  const fed = linePriceRate(f, e, d);
  const feb = linePriceRate(f, e, b);
  const fcb = linePriceRate(f, c, b);
  const edc = linePriceRate(e, d, c);
  const eda = linePriceRate(e, d, a);
  const eba = linePriceRate(e, b, a);
  const dcb = linePriceRate(d, c, b);
  const cba = linePriceRate(c, b, a);

  const validGfa = ge(fed, -1) && ge(feb, -1) && le(cba, -1) && le(eda, -1);
  const validGda = le(fed, -1) && ge(gfe, -1) && le(cba, -1) && ge(dcb, -1);
  const validGba = le(feb, -1) && ge(gfe, -1) && le(cba, -1) && le(dcb, -1);
  const validEba = le(cba, -1) && le(dcb, -1);
  const validEda = le(cba, -1) && ge(dcb, -1);
  const validFcb = ge(fed, -1) && le(edc, -1);
  const validFeb = ge(edc, -1) && le(dcb, -1);

  const out: string[] = [];
  const push = (on: boolean, text: string) => {
    if (on) out.push(`• ${text} •`);
  };
  push(isHarmonicTriangle(gfa, m) && validGfa, 'Harmonic Triangle(GFA)');
  push(isHarmonicTriangle(gda, m) && validGda, 'Harmonic Triangle(GDA)');
  push(isHarmonicTriangle(gba, m) && validGba, 'Harmonic Triangle(GBA)');
  push(isHarmonicTriangle(eba, m) && validEba, 'Harmonic Triangle(EBA)');
  push(isHarmonicTriangle(eda, m) && validEda, 'Harmonic Triangle(EDA)');
  push(isHarmonicTriangle(cba, m), 'Harmonic Triangle(CBA)');
  push(is2Tap(cba, m), 'Double Tap(CBA)');
  push(is2Tap(eba, m) && validEba, 'Double Tap(EBA)');
  push(is2Tap(eda, m) && validEda, 'Double Tap(EDA)');
  push(is3Tap(edc, cba, m), 'Triple Tap(EDC, CBA)');
  push(is4Tap(gfe, edc, cba, m), 'Quadruple Tap(GFE, EDC, CBA)');
  push(isABCD(cba, dcb, m), 'AB=CD(CBA, DCB)');
  push(isABCD(cba, fcb, m) && validFcb, 'AB=CD(CBA, FCB)');
  push(isABCD(eba, feb, m) && validFeb, 'AB=CD(EBA, FEB)');
  push(isABCD(eda, fed, m) && validEda, 'AB=CD(EDA, FED)');
  const fourPatterns: Array<[ReturnType<typeof four>, string, string]> = [
    [isBat, 'Bat', 'Bat'], [isButterfly, 'Butterfly', 'Butterfly'], [isGartley, 'Gartley', 'Gartley'],
    [isCrab, 'Crab', 'Crab'], [isShark, 'Shark', 'Shark'], [is5o, '5o', '5o'], [isWolfe, 'Wolf', 'Wolf'],
    [isConTria, 'Contracting Triangle', ''], [isExpTria, 'Expanding Triangle', ''],
  ];
  for (const [fn, name] of fourPatterns) {
    push(fn(edc, dcb, cba, eda, m), `${name}(EDC, DCB, CBA, EDA)`);
    push(fn(gfe, feb, eba, gfa, m) && validEba, `${name}(GFE, FEB, EBA, GFA)`);
    push(fn(gfe, fed, eda, gfa, m) && validEda, `${name}(GFE, FED, EDA, GFA)`);
  }
  // the library passes (fed, feb, dcb, edc, eda, cba) to isHnS(fed, feb, edc, dcb, cba, eda)
  push(isHnS(fed, feb, dcb, edc, eda, cba, m), 'Head and Shoulders(FED, FEB, DCB, EDC, EDA, CBA)');
  return out;
}

/** f_mode_process_stats(): EMA-like average of the changes of _data and its positive / negative deviations */
function processStats(weight: number) {
  let prevData = NaN;
  let prevAvg = NaN;
  let prevPos = NaN;
  let prevNeg = NaN;
  let posDev = 0;
  let negDev = 0;
  let first = true;
  return (data: number) => {
    let avg: number;
    if (first) {
      avg = data;
    } else if (!isNaN(data) && !isNaN(prevData) && ne(data, prevData)) {
      avg = weight * data + (1 - weight) * nz(prevAvg, prevData);
    } else {
      avg = prevAvg;
    }
    const pos = Math.max(0.0, data - avg);
    const neg = Math.min(0.0, data - avg);
    if (!first) {
      posDev = !isNaN(pos) && !isNaN(prevPos) && ne(pos, prevPos) ? weight * pos + (1 - weight) * posDev : posDev;
      negDev = !isNaN(neg) && !isNaN(prevNeg) && ne(neg, prevNeg) ? weight * neg + (1 - weight) * negDev : negDev;
    }
    first = false;
    prevData = data;
    prevAvg = avg;
    prevPos = pos;
    prevNeg = neg;
    return { avg, posDev, negDev };
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<ZigzagMultipleMethodsForecastPatternsInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const ms = n > 0 && bars[0].time >= 1e12;
  const tMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const weight = 2 / (cfg.averagingWeight + 1);
  const sat = cfg.saturation;
  const lig = cfg.lightness;
  const cZig = hsl(cfg.hueZig, sat, lig, 0);
  const cZag = hsl(cfg.hueZag, sat, lig, 0);
  const cRate = hsl(cfg.hueRate, 10, lig, 0);
  const cTarget = hsl(cfg.hueTarget, sat, lig, 0);
  const cZigBox = hsl(cfg.hueZigBox, sat, lig, 75);
  const cZagBox = hsl(cfg.hueZigBox, sat, lig, 75);
  const cText = hsl(200, 10, 100 - lig, 0);
  const textSize = cfg.textSize;
  const method = cfg.zigzagMethod;
  const x = cfg.paramX;
  const y = cfg.paramY;

  // library inputs of the zigzag function
  const trTrue = ta.tr(bars, true).toArray().map((v) => v ?? NaN);
  const trFalse = ta.tr(bars, false).toArray().map((v) => v ?? NaN);
  const atrSma = method === M001 ? ta.sma(Series.fromArray(bars, trTrue), Math.trunc(x)).toArray().map((v) => v ?? NaN) : [];
  const pivotH = ta.pivothigh(new Series(bars, (b) => b.high), x, y).toArray().map((v) => v ?? NaN);
  const pivotL = ta.pivotlow(new Series(bars, (b) => b.low), x, y).toArray().map((v) => v ?? NaN);
  const truthy = (v: number) => !isNaN(v) && v !== 0;

  resetDrawings();

  // zigzag function state
  let percent = NaN;
  let direction: boolean | null = null;
  let hprice = NaN;
  let lprice = NaN;
  let zz = NaN;
  let tz = NaN;
  let htime = NaN;
  let ltime = NaN;
  let reverseLine = 0.0;

  // script state
  let timeA = NaN, timeB = NaN, timeC = NaN, timeD = NaN, timeE = NaN, timeF = NaN, timeG = NaN;
  let priceB = NaN, priceC = NaN, priceD = NaN, priceE = NaN, priceF = NaN, priceG = NaN;
  let volA = NaN, volB = NaN;
  let cum = 0;
  let prevZz = NaN;
  const priceStats = processStats(weight);
  const timeStats = processStats(weight);
  const zigzagLines: Array<Line | undefined> = new Array(20).fill(undefined);
  const zigzagLabels: Array<Label | undefined> = new Array(20).fill(undefined);
  const forecastBoxes: Array<Box | undefined> = [undefined];
  let midline: Line | undefined;
  let priceDevLine: Line | undefined;
  let timeDevLine: Line | undefined;
  let la0618: Label | undefined;
  let la1618: Label | undefined;
  const rateLines: Array<Line | undefined> = new Array(8).fill(undefined);
  const rateLabels: Array<Label | undefined> = new Array(8).fill(undefined);
  const reverse = new Array<number>(n).fill(NaN);

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    const time = tMs(i);
    const time1 = i > 0 ? tMs(i - 1) : NaN;
    const high1 = p ? p.high : NaN;
    const low1 = p ? p.low : NaN;

    // ---- FunctionZigZagMultipleMethods.function(method, x, y)
    if (method === M001) {
      percent = atrSma[i] / b.open * y;
    } else if (method === M002) {
      const tr = (trFalse[i] / b.open) * y;
      if (isNaN(percent)) percent = tr;
      if (gt(tr, percent)) percent = tr;
    } else {
      percent = x * y;
    }
    const zzPrev = zz;
    if (i >= 1) {
      if (direction === null) direction = true;
      const reverseRange = nz(zzPrev) * percent;
      if (direction) {
        lprice = NaN;
        ltime = time;
        if (isNaN(hprice)) {
          if (lt(b.high, high1)) {
            hprice = high1;
            htime = time1;
          } else {
            hprice = b.high;
            htime = time;
          }
        } else if (ge(b.high, hprice)) {
          hprice = b.high;
          htime = time;
        }
        if (method === M003) {
          reverseLine = hprice;
          if (truthy(pivotH[i])) {
            zz = hprice; tz = htime; direction = false;
          }
        } else if (method === M004) {
          reverseLine = hprice;
          if (lt(b.high, high1) && (lt(b.low, low1) || lt(b.close - b.low, (b.high - b.low) * 0.5))) {
            if (lt(b.low, low1)) {
              lprice = b.low; ltime = time;
            } else {
              lprice = low1; ltime = time1;
            }
            zz = hprice; tz = htime; direction = false;
          }
        } else {
          reverseLine = hprice - reverseRange;
          if (lt(b.close, reverseLine)) {
            zz = hprice; tz = htime; direction = false;
          }
        }
      } else {
        hprice = NaN;
        htime = NaN;
        if (isNaN(lprice)) {
          if (gt(b.low, low1)) {
            lprice = low1; ltime = time1;
          } else {
            lprice = b.low; ltime = time;
          }
        } else if (le(b.low, lprice)) {
          lprice = b.low;
          ltime = time;
        }
        if (method === M003) {
          reverseLine = lprice;
          if (truthy(pivotL[i])) {
            zz = lprice; tz = ltime; direction = true;
          }
        } else if (method === M004) {
          reverseLine = lprice;
          if (gt(b.high, high1) && (gt(b.low, low1) || gt(b.close - b.low, (b.high - b.low) * 0.5))) {
            if (gt(b.high, high1)) {
              hprice = b.high; htime = time;
            } else {
              hprice = high1; htime = time1;
            }
            zz = lprice; tz = ltime; direction = true;
          }
        } else {
          reverseLine = lprice + reverseRange;
          if (gt(b.close, reverseLine)) {
            zz = lprice; tz = ltime; direction = true;
          }
        }
      }
    }
    reverse[i] = reverseLine;
    const priceA = zz;
    const isUp = direction === true;

    // ---- script
    const altTime = cfg.showRealPivots ? tz : time;
    // is_new_zig = ta.change(price_a) != 0 ? price_a : na (na change: no new zig)
    const isNewZig = !isNaN(priceA - prevZz) && ne(priceA - prevZz, 0) && truthy(priceA);
    cum += b.volume ?? NaN;
    const cumvol = Math.trunc(cum);
    if (isNewZig) {
      timeG = timeF; priceG = priceF;
      timeF = timeE; priceF = priceE;
      timeE = timeD; priceE = priceD;
      timeD = timeC; priceD = priceC;
      timeC = timeB; priceC = priceB;
      timeB = timeA; priceB = prevZz;
      timeA = altTime;
      volB = volA;
      volA = cumvol;
    }
    prevZz = priceA;
    const abPriceDiff = Math.abs(priceA - priceB);
    const abTimeDiff = timeA - timeB;
    const abVolume = volA - volB;

    // f_draw_zigzag_lines()
    if (cfg.showZigzagLines && isNewZig) {
      if (zigzagLines.length >= 20) {
        const old = zigzagLines.pop();
        if (old) line.delete(old);
      }
      zigzagLines.unshift(line.new(timeA, priceA, timeB, priceB, 'bar_time', 'none', gt(priceA, priceB) ? cZig : cZag,
        'solid', 2));
    }

    const ps = priceStats(abPriceDiff);
    const ts = timeStats(abTimeDiff);
    const up = gt(priceA, priceB);
    const targetAvgPrice = up ? priceA - ps.avg : priceA + ps.avg;
    const targetUpper = up ? priceA - ps.avg - ps.negDev : priceA + ps.avg + ps.negDev;
    const targetLower = up ? priceA - ps.avg - ps.posDev : priceA + ps.avg + ps.posDev;
    const target0618 = up ? priceA - (ps.avg + ps.negDev) * 0.618 : priceA + (ps.avg + ps.negDev) * 0.618;
    const target1618 = up ? priceA - (ps.avg + ps.posDev) * 1.618 : priceA + (ps.avg + ps.posDev) * 1.618;
    const targetAvgTime = Math.trunc(timeA + ts.avg);
    const timeUpper = Math.trunc(targetAvgTime + ts.posDev);
    const timeLower = Math.trunc(targetAvgTime + ts.negDev);
    const time0618 = Math.trunc(timeA + (ts.avg + ts.negDev) * 0.618);
    const time1618 = Math.trunc(timeA + (ts.avg + ts.posDev) * 1.618);

    // f_cast_projections(): on a new zig and on the last bar
    if (cfg.showProjections && (isNewZig || i === n - 1)) {
      if (midline) line.delete(midline);
      if (priceDevLine) line.delete(priceDevLine);
      if (timeDevLine) line.delete(timeDevLine);
      if (la0618) label.delete(la0618);
      if (la1618) label.delete(la1618);
      midline = line.new(timeA, priceA, targetAvgTime, targetAvgPrice, 'bar_time', 'right', cTarget, 'dashed', 1);
      priceDevLine = line.new(targetAvgTime, targetLower, targetAvgTime, targetUpper, 'bar_time', 'none', cTarget,
        'arrow_both', 1);
      timeDevLine = line.new(timeLower, targetAvgPrice, timeUpper, targetAvgPrice, 'bar_time', 'none', cTarget,
        'arrow_both', 1);
      if (cfg.showProjectionsSquare) {
        if (forecastBoxes.length >= 1) {
          const old = forecastBoxes.pop();
          if (old) box.delete(old);
        }
        forecastBoxes.unshift(box.new(time0618, target0618, time1618, target1618, GRAY, 1, 'dashed', 'none', 'bar_time',
          isUp ? cZigBox : cZagBox));
        if (cfg.showProjectionsSquareRates) {
          const tip = 'Likelyhood taken from the zigzag swing distribution.';
          la0618 = label.new(time1618, target1618, `Max. Target 1.618 @ ${str.tostring(target1618, '#.#####')}`,
            'bar_time', 'price', cRate, isUp ? 'label_down' : 'label_up', cText, textSize, undefined, tip);
          la1618 = label.new(time0618, target0618, `Min. Target 0.618 @ ${str.tostring(target0618, '#.#####')}`,
            'bar_time', 'price', cRate, isUp ? 'label_up' : 'label_down', cText, textSize, undefined, tip);
        }
      }
    }

    // f_Detect_Patterns(err)
    if ((cfg.showPivotPrice || cfg.showPatterns) && isNewZig) {
      const drawZigzagLabel = (extra: string) => {
        const priceText = `${str.tostring(priceA, '#.#####')}, V: ${str.tostring(abVolume, '#')}`;
        const text = !cfg.showPivotPrice ? extra : up ? priceText + extra : extra + priceText;
        if (zigzagLabels.length >= 20) {
          const old = zigzagLabels.pop();
          if (old) label.delete(old);
        }
        zigzagLabels.unshift(label.new(timeA, priceA, text, 'bar_time', 'price', up ? cZag : cZig,
          up ? 'label_down' : 'label_up', cText, textSize));
      };
      if (cfg.showPatterns) {
        const list = extractPatterns(priceG, priceF, priceE, priceD, priceC, priceB, priceA, cfg.errorMargin / 100);
        drawZigzagLabel(list.length > 0 ? str.format(isUp ? '{0}\n' : '\n{0}', list.join('\n')) : '');
      } else if (cfg.showPivotPrice) {
        drawZigzagLabel('');
      }

      if (cfg.showTriangleRates) {
        const deg = (v: number, fmt: string) => str.tostring(nz(v * (180 / 3.1416), 0), fmt);
        const rate = (site: number, priceRate: number, timeRate: number, x1: number, y1: number, x2: number, y2: number,
          isUpLabel: boolean) => {
          let text = `Price: ${str.tostring(priceRate, '#.###')}` + (!cfg.showAngles ? ''
            : `, (sin:${deg(Math.asin(priceRate), '#')}º, cos:${deg(Math.acos(priceRate), '#')}º, tan:${deg(Math.atan(priceRate), '#')}º)`);
          text += `\nTime: ${str.tostring(timeRate, '#.###')}` + (!cfg.showAngles ? ''
            : `, (sin:${deg(Math.asin(timeRate), '#.###')}º, cos:${deg(Math.acos(timeRate), '#.###')}º, tan:${deg(Math.atan(timeRate), '#.###')}º)`);
          const oldLine = rateLines[site];
          const oldLabel = rateLabels[site];
          if (oldLine) line.delete(oldLine);
          if (oldLabel) label.delete(oldLabel);
          rateLines[site] = line.new(x1, y1, x2, y2, 'bar_time', 'none', GRAY, 'dashed', 1);
          rateLabels[site] = label.new(math.round((x1 + x2) / 2), (y1 + y2) / 2, text, 'bar_time', 'price', cRate,
            isUpLabel ? 'label_up' : 'label_down', cText, textSize);
        };
        const cba = linePriceRate(priceC, priceB, priceA);
        const edc = linePriceRate(priceE, priceD, priceC);
        const gfe = linePriceRate(priceG, priceF, priceE);
        const dcb = linePriceRate(priceD, priceC, priceB);
        if (lt(cba, edc) && lt(edc, gfe)) {
          rate(0, linePriceRate(priceG, priceF, priceA), lineTimeRate(timeG, timeF, timeA), timeA, priceA, timeG, priceG, lt(priceA, priceF));
          rate(1, linePriceRate(priceG, priceD, priceA), lineTimeRate(timeG, timeD, timeA), timeA, priceA, timeG, priceG, lt(priceA, priceD));
          rate(2, linePriceRate(priceG, priceB, priceA), lineTimeRate(timeG, timeB, timeA), timeA, priceA, timeG, priceG, lt(priceA, priceB));
        }
        if (lt(cba, edc)) {
          rate(3, linePriceRate(priceE, priceD, priceA), lineTimeRate(timeE, timeD, timeA), timeA, priceA, timeE, priceE, lt(priceA, priceD));
          rate(4, linePriceRate(priceE, priceB, priceA), lineTimeRate(timeE, timeB, timeA), timeA, priceA, timeE, priceE, lt(priceA, priceB));
        }
        rate(5, cba, lineTimeRate(timeC, timeB, timeA), timeA, priceA, timeC, priceC, lt(priceA, priceB));
        rate(6, dcb, lineTimeRate(timeD, timeC, timeB), timeB, priceB, timeD, priceD, lt(priceB, priceC));
        if (lt(dcb, linePriceRate(priceF, priceE, priceD))) {
          rate(7, linePriceRate(priceF, priceE, priceB), lineTimeRate(timeF, timeE, timeB), timeB, priceB, timeF, priceF, lt(priceB, priceE));
        }
      }
    }
  }
  setDrawingBar(null);

  // xloc.bar_time: a time between two bars is drawn on the next bar; after the last bar, on the bar that contains
  // that time (bars of the exchange calendar of the context: trading days only on a stock)
  const interval = barInterval(bars);
  const times = bars.map((_b, i) => tMs(i));
  const snap = (t: number): number => {
    if (isNaN(t) || n === 0) return NaN;
    if (t > times[n - 1]) return barTime(bars, n - 1 + barsAfterLastBar(bars, ms ? t : t / 1000, chart), interval);
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] >= t) hi = mid;
      else lo = mid + 1;
    }
    return bars[lo].time;
  };
  const col = (c: unknown) => (c === null || c === undefined || c === '' ? 'transparent' : String(c));

  // plot(reverse, offset = 1): the value of bar i on bar i + 1; the second plot has show_last = 1
  const rc = cfg.reverseColor;
  const plot0 = bars.map((_b, i) => ({ time: barTime(bars, i + 1, interval), value: reverse[i], color: rc }));
  const plot1 = bars.map((_b, i) => ({
    time: barTime(bars, i + 1, interval), value: i === n - 1 ? reverse[i] : NaN, color: rc,
  }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    // an object with an na coordinate is not drawn
    lines: line.all().filter((l) => ![l.x1, l.y1, l.x2, l.y2].some((v) => isNaN(v))).map((l) => ({
      time1: snap(l.x1), price1: l.y1, time2: snap(l.x2), price2: l.y2, color: col(l.color), width: l.width ?? 1,
      ...(l.style && l.style !== 'solid' ? { style: l.style } : {}),
      ...(l.extend && l.extend !== 'none' ? { extend: l.extend } : {}),
    })),
    boxes: box.all().filter((b) => ![b.left, b.right, b.top, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: snap(b.left), price1: b.top, time2: snap(b.right), price2: b.bottom, bgColor: col(b.bgcolor),
      borderColor: col(b.border_color), borderStyle: 'dashed' as const,
    })),
    labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: snap(l.x), price: l.y, text: l.text ?? '', color: col(l.color), textColor: col(l.textcolor),
      style: l.style as LabelData['style'], size: l.size as LabelData['size'],
      ...(l.tooltip ? { tooltip: l.tooltip } : {}),
    })),
  };
}

export const ZigzagMultipleMethodsForecastPatterns = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
