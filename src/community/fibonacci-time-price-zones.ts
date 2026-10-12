/**
 * Fibonacci Time-Price Zones
 *
 * Two user points A and B (time and price; the earlier time is A) give a trend. Fibonacci levels of the move A-B are
 * drawn from B onward in one of four shapes:
 * - Circular: arcs around B whose radius is the A-B distance (time scaled to price by the A-B slope) times the level
 *   times ln 2; a level shows while the bar is inside its arc.
 * - Orthogonal: the level price, held from B for as many bars as the radius covers, then a vertical line back to the
 *   B price.
 * - Slope: the level price moving with the A-B slope (mirrored for the lower side) while inside the radius.
 * - Horizontal: the level price from B onward.
 * Between A and B every level shows its starting price. "Zone Type" picks the side: the retracement side (towards A),
 * the extension side (beyond B) or both. Neighbouring levels are filled with the level colours. Optional dotted
 * trend line A-B, circles every 10 bars along the extension (A-B slope) and the retracement (mirrored slope) until C,
 * level texts at the ends of the levels, and A / B / C / D point texts (C and D are one A-B time span after B, at B
 * plus and minus the A-B price move).
 *
 * The level line width comes from an input in the original: the plots keep the default width (2).
 *
 * Reference: "Fibonacci Time-Price Zones" by xxattaxx
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  color, math, str, line, box, resetDrawings, setDrawingBar, varDrawing, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Box, type DrawingVariable,
} from 'oakscriptjs';

type Thickness = '────' | '▬▬▬' | '▄▄▄▄';
type ZoneType = 'Retracement' | 'Extension' | 'Both';
type Shape = 'Circular' | 'Orthogonal ' | 'Slope' | 'Horizontal';

export interface FibonacciTimePriceZonesInputs {
  isEnabled0: boolean; levelValue0: number; levelColor0: string; levelThick0: Thickness;
  isEnabled1: boolean; levelValue1: number; levelColor1: string; levelThick1: Thickness;
  isEnabled2: boolean; levelValue2: number; levelColor2: string; levelThick2: Thickness;
  isEnabled3: boolean; levelValue3: number; levelColor3: string; levelThick3: Thickness;
  isEnabled4: boolean; levelValue4: number; levelColor4: string; levelThick4: Thickness;
  isEnabled5: boolean; levelValue5: number; levelColor5: string; levelThick5: Thickness;
  isEnabled6: boolean; levelValue6: number; levelColor6: string; levelThick6: Thickness;
  zoneType: ZoneType;
  /** 'Orthogonal ' has a trailing space, as in the original */
  shape: Shape;
  /** Fill % (opacity of the fills) */
  fillT: number;
  showTrend: boolean;
  colTrend: string;
  showExtend: boolean;
  colExtend: string;
  showRetrace: boolean;
  colRetrace: string;
  showA: boolean;
  showB: boolean;
  showC: boolean;
  showD: boolean;
  showLabels: boolean;
  /** Point A time (UNIX ms) */
  aTime: number;
  aPrice: number;
  /** Point B time (UNIX ms) */
  bTime: number;
  bPrice: number;
}

const LEVEL_DEFAULTS: Array<[boolean, number, string]> = [
  [true, 0.236, 'rgba(135, 206, 235, 0.7)'],
  [true, 0.382, 'rgba(70, 130, 180, 0.7)'],
  [true, 0.5, 'rgba(50, 205, 50, 0.7)'],
  [true, 0.618, 'rgba(255, 235, 59, 0.7)'],
  [true, 0.786, 'rgba(255, 140, 0, 0.7)'],
  [true, 1, 'rgba(139, 0, 0, 0.7)'],
  [false, 1.236, 'rgba(106, 90, 205, 0.7)'],
];

/** timestamp('2024-08-12') */
const DEFAULT_TIME = 1723420800000;

export const defaultInputs: FibonacciTimePriceZonesInputs = {
  isEnabled0: true, levelValue0: 0.236, levelColor0: 'rgba(135, 206, 235, 0.7)', levelThick0: '▬▬▬',
  isEnabled1: true, levelValue1: 0.382, levelColor1: 'rgba(70, 130, 180, 0.7)', levelThick1: '▬▬▬',
  isEnabled2: true, levelValue2: 0.5, levelColor2: 'rgba(50, 205, 50, 0.7)', levelThick2: '▬▬▬',
  isEnabled3: true, levelValue3: 0.618, levelColor3: 'rgba(255, 235, 59, 0.7)', levelThick3: '▬▬▬',
  isEnabled4: true, levelValue4: 0.786, levelColor4: 'rgba(255, 140, 0, 0.7)', levelThick4: '▬▬▬',
  isEnabled5: true, levelValue5: 1, levelColor5: 'rgba(139, 0, 0, 0.7)', levelThick5: '▬▬▬',
  isEnabled6: false, levelValue6: 1.236, levelColor6: 'rgba(106, 90, 205, 0.7)', levelThick6: '▬▬▬',
  zoneType: 'Retracement',
  shape: 'Circular',
  fillT: 15,
  showTrend: true,
  colTrend: 'rgba(0, 188, 212, 0.25)',
  showExtend: false,
  colExtend: 'rgba(41, 98, 255, 0.25)',
  showRetrace: false,
  colRetrace: 'rgba(41, 98, 255, 0.25)',
  showA: true,
  showB: true,
  showC: false,
  showD: false,
  showLabels: true,
  aTime: DEFAULT_TIME,
  aPrice: 0,
  bTime: DEFAULT_TIME,
  bPrice: 0,
};

const NB = ' ';
const GL = `Show${NB.repeat(12)}Level${NB.repeat(18)}Color${NB.repeat(12)}Linewidth`;
const TT_LEV = 'Fibonacci Levels: Configures this Fibonacci level. \n'
  + ' ■ Toggle visibility, set the level value, customize the color, and adjust line thickness.';
const TT_POINT = 'A-B-C-D Points: Toggles the visibility of the labels for A, B, and C points on the chart. \n'
  + ' ■ A and B are user-defined time and price points. \n' + ' ■ C is the calculated end point of the Trend Extension. \n'
  + ' ■ D is the calculated end point of the Trend Retracement.';
const TT_FILL = 'Fill %: Adjusts the transparency of the fill area. \n' + ' ■ 0% is fully transparent \n ■ 100% is fully opaque.\n';
const TT_TREND = 'Trendline: Toggles the visibility of the trend line connecting points A and B. \n'
  + ' ■ Extension: Toggles the visibility of the trend extension line connecting B-C. \n'
  + ' ■ Retracement: Toggles the visibility of the trend retracement line connecting B-D.';
const TT_LABEL = 'Labels: Toggles the visibility of the Fibonacci level labels.';
const TT_ZONE = 'ZoneType: Toggles the visibility of the Upper, Lower, or Both Fibonacci segments. \n';
const TT_SHAPE = 'Shape: Selects the structure of Fibonacci plots. \n'
  + ' ■ Circular: Represents Fibonacci levels as arcs that incorporate both time and price dimensions. \n'
  + ' ■ Orthogonal: Displays L-shaped patterns combining horizontal and vertical components to reflect time and price relationships. \n'
  + ' ■ Slope: Aligns Fibonacci levels along the trend line, emphasizing trend direction and momentum. \n'
  + ' ■ Horizontal: Traditional horizontal lines for Fibonacci levels, focusing solely on price-based relationships. \n\n';
const THICK_OPTIONS = ['────', '▬▬▬', '▄▄▄▄'];

const levelInputs: InputConfig[] = LEVEL_DEFAULTS.flatMap(([on, value, col], k) => [
  { id: `isEnabled${k}`, type: 'bool', title: '', defval: on, group: GL, inline: `Level${k}` },
  { id: `levelValue${k}`, type: 'float', title: '', defval: value, group: GL, inline: `Level${k}` },
  { id: `levelColor${k}`, type: 'color', title: '', defval: col, group: GL, inline: `Level${k}` },
  { id: `levelThick${k}`, type: 'string', title: '', defval: '▬▬▬', options: THICK_OPTIONS, group: GL, inline: `Level${k}`, tooltip: TT_LEV },
] as InputConfig[]);

export const inputConfig: InputConfig[] = [
  ...levelInputs,
  { id: 'zoneType', type: 'string', title: 'Zone Type', defval: 'Retracement', options: ['Retracement', 'Extension', 'Both'], group: 'Setup', inline: 's1', tooltip: TT_ZONE },
  { id: 'shape', type: 'string', title: `Shape${NB.repeat(6)}`, defval: 'Circular', options: ['Circular', 'Orthogonal ', 'Slope', 'Horizontal'], group: 'Setup', inline: 's3', tooltip: TT_SHAPE },
  { id: 'fillT', type: 'float', title: `Fill %${NB.repeat(2)}`, defval: 15, min: 0, max: 100, group: 'Visual Settings', inline: 'v1', tooltip: TT_FILL },
  { id: 'showTrend', type: 'bool', title: `Trendline${NB.repeat(5)}`, defval: true, group: 'Visual Settings', inline: 't1', tooltip: TT_TREND },
  { id: 'colTrend', type: 'color', title: '', defval: 'rgba(0, 188, 212, 0.25)', group: 'Visual Settings', inline: 't1', tooltip: TT_TREND },
  { id: 'showExtend', type: 'bool', title: `Extension${NB.repeat(5)}`, defval: false, group: 'Visual Settings', inline: 't2', tooltip: TT_TREND },
  { id: 'colExtend', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.25)', group: 'Visual Settings', inline: 't2', tooltip: TT_TREND },
  { id: 'showRetrace', type: 'bool', title: 'Retracement', defval: false, group: 'Visual Settings', inline: 't3', tooltip: TT_TREND },
  { id: 'colRetrace', type: 'color', title: '', defval: 'rgba(41, 98, 255, 0.25)', group: 'Visual Settings', inline: 't3', tooltip: TT_TREND },
  { id: 'showA', type: 'bool', title: `A${NB}`, defval: true, group: 'Labels', inline: 'p1', tooltip: TT_POINT },
  { id: 'showB', type: 'bool', title: `B${NB}`, defval: true, group: 'Labels', inline: 'p1', tooltip: TT_POINT },
  { id: 'showC', type: 'bool', title: `C${NB}`, defval: false, group: 'Labels', inline: 'p1', tooltip: TT_POINT },
  { id: 'showD', type: 'bool', title: `D${NB}`, defval: false, group: 'Labels', inline: 'p1', tooltip: TT_POINT },
  { id: 'showLabels', type: 'bool', title: 'Fib Levels', defval: true, group: 'Labels', inline: 'l1', tooltip: TT_LABEL },
  { id: 'aTime', type: 'time', title: '', defval: DEFAULT_TIME, confirm: true, group: 'Time/Price', inline: 'B' },
  { id: 'aPrice', type: 'float', title: '', defval: 0, confirm: true, group: 'Time/Price', inline: 'B', tooltip: 'Exact Start Time/Price Point' },
  { id: 'bTime', type: 'time', title: '', defval: DEFAULT_TIME, confirm: true, group: 'Time/Price', inline: 'C' },
  { id: 'bPrice', type: 'float', title: '', defval: 0, confirm: true, group: 'Time/Price', inline: 'C', tooltip: 'Exact End Time/Price Point' },
];

// Plots in the Pine order: Level 0..6 Upper, B Price, Level 0..6 Lower, Slope Line, Retrace Line
export const plotConfig: PlotConfig[] = [
  ...LEVEL_DEFAULTS.map(([, , col], k) => ({ id: `plot${k}`, title: `Level ${k} Upper`, color: col, lineWidth: 2 })),
  { id: 'plot7', title: 'B Price', color: 'rgba(0, 188, 212, 0)', lineWidth: 1 },
  ...LEVEL_DEFAULTS.map(([, , col], k) => ({ id: `plot${8 + k}`, title: `Level ${k} Lower`, color: col, lineWidth: 2 })),
  { id: 'plot15', title: 'Slope Line', color: 'rgba(41, 98, 255, 0.25)', lineWidth: 2, style: 'circles' },
  { id: 'plot16', title: 'Retrace Line', color: 'rgba(41, 98, 255, 0.25)', lineWidth: 2, style: 'circles' },
];

export const metadata = {
  title: 'Fibonacci Time-Price Zones',
  shortTitle: 'Fib Time-Price [xxattaxx]',
  overlay: true,
};

/** Version 6 colour constants */
const AQUA = '#00BCD4';

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const gt = (a: number, b: number) => a - b > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** math.max / math.min: na when an argument is na */
const pmax = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const pmin = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
/** array.max / array.min (largest / smallest): na and infinite elements are skipped */
const arrMax = (a: number[]) => a.filter(Number.isFinite).reduce((m, v) => (isNaN(m) || v > m ? v : m), NaN);
const arrMin = (a: number[]) => a.filter(Number.isFinite).reduce((m, v) => (isNaN(m) || v < m ? v : m), NaN);
/** A plot value: na for na and infinite values */
const pv = (v: number) => (Number.isFinite(v) ? v : NaN);

/** f_lw(weight) */
const lineWidthOf = (w: string) => (w === '────' ? 1 : w === '▬▬▬' ? 2 : w === '▄▄▄▄' ? 3 : 1);

/** `var` state of one f_text_box() call site */
interface TextBoxState {
  textUpper: DrawingVariable<Box>;
  textLower: DrawingVariable<Box>;
  created: boolean;
  endBox: DrawingVariable<Box>;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<FibonacciTimePriceZonesInputs> = {},
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const msUnit = n > 0 && bars[0].time >= 1e12 ? 1 : 1000;

  const levels = [0, 1, 2, 3, 4, 5, 6].map((k) => {
    const c = cfg as unknown as Record<string, unknown>;
    return {
      enabled: c[`isEnabled${k}`] as boolean,
      value: c[`levelValue${k}`] as number,
      color: c[`levelColor${k}`] as string,
      thick: c[`levelThick${k}`] as string,
    };
  });

  // Ensure A_Time is less than B_Time, otherwise swap values
  const swap = cfg.aTime > cfg.bTime;
  const aPrice = swap ? cfg.bPrice : cfg.aPrice;
  const aTime = swap ? cfg.bTime : cfg.aTime;
  const bPrice = swap ? cfg.aPrice : cfg.bPrice;
  const bTime = swap ? cfg.aTime : cfg.bTime;

  const trend = lt(aPrice, bPrice) ? 1 : -1;
  const zone = cfg.zoneType;
  const U = zone === 'Both' || (trend === 1 && zone === 'Extension') || (trend === -1 && zone === 'Retracement');
  const L = zone === 'Both' || (trend === 1 && zone === 'Retracement') || (trend === -1 && zone === 'Extension');
  const T = 100 - cfg.fillT;
  const shape = cfg.shape;
  const scaleFactor = shape === 'Circular' ? Math.log(2) : Math.sqrt(2) / 2;

  let aIndex = NaN;
  let bIndex = NaN;
  let cIndex = NaN;
  let dIndex = NaN;
  let cPrice = NaN;
  let dPrice = NaN;
  let radius = NaN;
  let aspectRatio = NaN;
  const upperArray: number[] = new Array(7).fill(NaN);
  const lowerArray: number[] = new Array(7).fill(NaN);
  const upperInitial: number[] = new Array(7).fill(NaN);
  const lowerInitial: number[] = new Array(7).fill(NaN);

  resetDrawings();
  const textBoxes: TextBoxState[] = levels.map(() => ({
    textUpper: varDrawing<Box>(), textLower: varDrawing<Box>(), created: false, endBox: varDrawing<Box>(),
  }));
  /** f_text_box(boxtext, col, y_upper, y_lower) */
  const textBox = (st: TextBoxState, i: number, text: string, col: string, yU: number, yL: number) => {
    const at = (y: number, t: string, halign: 'left' | 'right', valign?: 'top' | 'bottom' | 'center') =>
      box.new(i, y, i, y, undefined, 0, undefined, undefined, 'bar_index', undefined, t, 'normal', col, halign, valign);
    if (!st.created && (!isNaN(yL) || !isNaN(yU))) {
      at(yU, text, 'right');
      at(yL, text, 'right');
      st.created = true;
    }
    if (!st.textLower.value) st.textLower.value = at(yL, NB + text, 'left', 'top');
    if (!st.textUpper.value) st.textUpper.value = at(yU, NB + text, 'left', 'bottom');
    const move = (b: Box, y: number) => {
      box.set_right(b, i);
      box.set_left(b, i);
      box.set_top(b, y);
      box.set_bottom(b, y);
    };
    if (!isNaN(yL)) move(st.textLower.value, yL);
    if (!isNaN(yU)) move(st.textUpper.value, yU);
    if (isNaN(yU) && isNaN(yL)) {
      if (!st.endBox.value) st.endBox.value = at(bPrice, text, 'left', 'center');
      box.delete(st.textUpper.value);
      box.delete(st.textLower.value);
    }
  };

  const plotVals: number[][] = Array.from({ length: 17 }, () => new Array(n).fill(NaN));
  const plotCols: Array<Array<string>> = Array.from({ length: 17 }, () => new Array(n).fill('transparent'));
  const fillCols: string[][] = Array.from({ length: 19 }, () => new Array(n).fill('transparent'));

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time * msUnit;
    if (isNaN(aIndex) && t === aTime) aIndex = i;
    if (isNaN(bIndex) && t === bTime) {
      bIndex = i;
      const diff = bIndex - aIndex;
      const priceDiff = bPrice - aPrice;
      cIndex = bIndex + diff;
      dIndex = bIndex + diff;
      cPrice = bPrice + priceDiff;
      dPrice = bPrice - priceDiff;
    }
    const afterA = t >= aTime;
    const afterB = t >= bTime;
    const setup = afterA && !afterB;
    const inRange = afterA && le(i, cIndex);
    const fill = gt(cfg.fillT, 0) && afterA;

    const slope = isNaN(aIndex) || isNaN(bIndex) ? NaN : (bPrice - aPrice) / (bIndex - aIndex);
    const sLine = aPrice + slope * (i - aIndex);
    const rLine = bPrice + -slope * (i - bIndex);

    if (t === bTime) {
      const deltaPrice = bPrice - aPrice;
      const deltaIndex = bIndex - aIndex;
      // nz(delta_index != 0 ? delta_price / delta_index : 0) (na != 0 is false)
      const ratio = !isNaN(deltaIndex) && deltaIndex !== 0 ? deltaPrice / deltaIndex : 0;
      aspectRatio = Number.isFinite(ratio) ? ratio : 0;
      const adjDelta = deltaIndex * aspectRatio;
      radius = Math.sqrt(adjDelta * adjDelta + deltaPrice * deltaPrice);
    }
    const adjX = (i - aIndex) * aspectRatio;

    // Initial levels, on the bar of A
    if (t === aTime) {
      levels.forEach((lv, k) => {
        if (lv.enabled) {
          // f_calc_fib(A_Price, B_Price, level, Trend, scale_factor)
          const offset = (bPrice - aPrice) * Math.sqrt(2) * scaleFactor * lv.value;
          upperInitial[k] = trend === 1 ? bPrice + offset : bPrice - offset;
          lowerInitial[k] = trend === 1 ? bPrice - offset : bPrice + offset;
        } else {
          upperInitial[k] = NaN;
          lowerInitial[k] = NaN;
        }
      });
    }

    if (afterA) {
      levels.forEach((lv, k) => {
        if (!lv.enabled) {
          upperArray[k] = NaN;
          lowerArray[k] = NaN;
          return;
        }
        const levelRadius = radius * lv.value * scaleFactor;
        const aspectRadius = Math.abs(math.round(levelRadius / aspectRatio));
        const initialUpper = upperInitial[k];
        const initialLower = lowerInitial[k];
        const end = aspectRadius + bIndex;
        const inRadius = le(i, end);
        if (setup) {
          upperArray[k] = initialUpper;
          lowerArray[k] = initialLower;
          return;
        }
        // f_calc_y_values(level_radius, adj_x, A_Price, B_Price, aspect_ratio)
        const xCenter = (bIndex - aIndex) * aspectRatio;
        const ySq = levelRadius * levelRadius - Math.pow(adjX - xCenter, 2);
        const yOffset = ge(ySq, 0) ? Math.sqrt(ySq) : NaN;
        const upperCir = !isNaN(yOffset) ? bPrice + yOffset : NaN;
        const lowerCir = !isNaN(yOffset) ? bPrice - yOffset : NaN;
        const lin = shape === 'Horizontal' || (shape === 'Orthogonal ' && inRadius);
        const upperLin = lin ? initialUpper : NaN;
        const lowerLin = lin ? initialLower : NaN;
        const upperSlope = inRadius ? initialUpper + trend * -slope * (i - bIndex) : NaN;
        const lowerSlope = inRadius ? initialLower + trend * slope * (i - bIndex) : NaN;
        const upperValue = shape === 'Circular' ? upperCir : shape !== 'Slope' ? upperLin : upperSlope;
        const lowerValue = shape === 'Circular' ? lowerCir : shape !== 'Slope' ? lowerLin : lowerSlope;
        upperArray[k] = upperValue;
        lowerArray[k] = lowerValue;
        // Vertical connecting line of the 'Orthogonal ' shape, on the first bar at the end of the radius
        if (ge(i, end) && lt(i - 1, end) && shape !== 'Circular') {
          const width = lineWidthOf(lv.thick);
          const drawUpper = (trend === 1 && zone !== 'Retracement') || (trend === -1 && zone !== 'Extension');
          const drawLower = (trend === 1 && zone !== 'Extension') || (trend === -1 && zone !== 'Retracement');
          if (drawUpper && shape === 'Orthogonal ') line.new(i, upperValue, i, bPrice, 'bar_index', 'none', lv.color, 'solid', width);
          if (drawLower && shape === 'Orthogonal ') line.new(i, lowerValue, i, bPrice, 'bar_index', 'none', lv.color, 'solid', width);
        }
      });
      levels.forEach((lv, k) => {
        textBox(textBoxes[k], i, cfg.showLabels && lv.enabled ? str.tostring(lv.value) : '', lv.color,
          U ? upperArray[k] : NaN, L ? lowerArray[k] : NaN);
      });
    }

    // Plots
    const midU = U ? NaN : bPrice;
    const midL = L ? NaN : bPrice;
    levels.forEach((lv, k) => {
      plotVals[k][i] = pv(lv.enabled && U && afterA ? upperArray[k] : midU);
      plotCols[k][i] = U ? lv.color : 'transparent';
      plotVals[8 + k][i] = pv(lv.enabled && L && afterA ? lowerArray[k] : midL);
      plotCols[8 + k][i] = L ? lv.color : 'transparent';
    });
    plotVals[7][i] = afterA ? pv(bPrice) : NaN;
    plotCols[7][i] = String(color.new(AQUA, 100));

    // Fills: a level and the opposite side while the level below it is na, then neighbouring levels
    const fc = (on: boolean, k: number) => (on ? String(color.new(levels[k].color, T)) : 'transparent');
    for (let k = 6; k >= 0; k--) {
      // fill(P{k}_Upper, P{k}_Lower, Fill and na(upperArray[max(k - 1, 0)]))
      fillCols[6 - k][i] = fc(fill && isNaN(upperArray[Math.max(k - 1, 0)]), k);
    }
    for (let k = 1; k <= 6; k++) {
      fillCols[6 + k][i] = fc(fill && !isNaN(upperArray[k]), k);
      fillCols[12 + k][i] = fc(fill && !isNaN(lowerArray[k]), k);
    }

    // Extension and retracement circles
    let extenLine = NaN;
    let retraceLine = NaN;
    if (afterB && trend === 1) {
      const upperValue = pmin(arrMax(upperArray), pmax(sLine, rLine));
      const lowerValue = pmax(arrMin(lowerArray), pmin(sLine, rLine));
      extenLine = isNaN(upperValue) || !cfg.showExtend ? NaN : sLine;
      retraceLine = isNaN(lowerValue) || !cfg.showRetrace ? NaN : rLine;
    }
    if (afterB && trend === -1) {
      const upperValue = pmax(arrMax(upperArray), pmax(sLine, rLine));
      const lowerValue = pmin(arrMin(lowerArray), pmin(sLine, rLine));
      extenLine = isNaN(lowerValue) || !cfg.showExtend ? NaN : sLine;
      retraceLine = isNaN(upperValue) || !cfg.showRetrace ? NaN : rLine;
    }
    const tenth = i % 10 === 0 && inRange;
    plotVals[15][i] = cfg.showExtend && tenth ? pv(extenLine) : NaN;
    plotCols[15][i] = cfg.colExtend;
    plotVals[16][i] = cfg.showRetrace && tenth ? pv(retraceLine) : NaN;
    plotCols[16][i] = cfg.colRetrace;

    // Trend line A-B and the point texts
    if (t === bTime && cfg.showTrend) {
      line.new(aTime, aPrice, bTime, bPrice, 'bar_time', 'none', String(color.new(AQUA, 60)), 'dotted', 4);
    }
    const point = (x: number, y: number, text: string, xloc: 'bar_index' | 'bar_time') =>
      box.new(x, y, x, y, 'transparent', 0, undefined, undefined, xloc, undefined, text, 'large', AQUA, 'center', 'center');
    if (t === aTime && cfg.showA) point(aTime, aPrice, 'A', 'bar_time');
    if (t === bTime && cfg.showB) point(bTime, bPrice, 'B', 'bar_time');
    if (i === cIndex && cfg.showC) point(cIndex, cPrice, 'C', 'bar_index');
    if (i === dIndex && cfg.showD) point(dIndex, dPrice, 'D', 'bar_index');
  }
  setDrawingBar(null);

  const plots: Record<string, Array<{ time: number; value: number; color: string }>> = {};
  for (let p = 0; p < 17; p++) {
    plots[`plot${p}`] = bars.map((b, i) => ({ time: b.time, value: plotVals[p][i], color: plotCols[p][i] }));
  }
  // fill pairs in the Pine order
  const pairs: Array<[number, number]> = [];
  for (let k = 6; k >= 0; k--) pairs.push([k, 8 + k]);
  for (let k = 0; k < 6; k++) pairs.push([k, k + 1]);
  for (let k = 0; k < 6; k++) pairs.push([8 + k, 9 + k]);
  const fills = pairs.map(([a, b], j) => ({ plot1: `plot${a}`, plot2: `plot${b}`, colors: fillCols[j] }));

  const out = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    lines: out.lines ?? [],
    boxes: out.boxes ?? [],
  };
}

export const FibonacciTimePriceZones = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
