/**
 * Swing Breakouts Tests & Retests [LuxAlgo]
 *
 * Each side works on one swing at a time. Bullish side: a swing low (pivot with "Left" / "Right" bars) opens a box
 * from the pivot price up by one ATR (200, times "Width"). While the price stays there the box grows to the right
 * and a bar that opens below the box top and closes above it is a test ("▲" at the pivot price). A close below the
 * box is the breakout: a second box with the same prices starts and a bar that opens above the box bottom and
 * closes below it is a retest ("▽" at the box top); a close above the box ends it. The bearish side is the mirror
 * on swing highs ("▼" tests, "△" retests). A box that gets longer than "Maximum Bars" is deleted when it has no
 * label, else it ends (with "Set Back To Last Retest": at its last label). With "Bullish OR Bearish" only one side
 * is followed at a time. At most 500 boxes and 500 labels are kept.
 *
 * Reference: "Swing Breakouts Tests & Retests [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface BreakoutsWithTestsRetestsInputs {
  display: 'Bullish OR Bearish' | 'Bullish AND Bearish' | 'Bearish' | 'Bullish';
  /** Box height as a multiple of the ATR (200) */
  mult: number;
  /** Maximum bars without signal */
  maxBars: number;
  showReTest: 'All' | 'Last';
  /** Minimum required amount of bars between each labels */
  minBars: number;
  setBack: boolean;
  left: number;
  right: number;
  bull1Color: string;
  bull2Color: string;
  bear1Color: string;
  bear2Color: string;
  labSize: 'tiny' | 'small' | 'normal' | 'large';
}

export const defaultInputs: BreakoutsWithTestsRetestsInputs = {
  display: 'Bullish AND Bearish',
  mult: 1,
  maxBars: 500,
  showReTest: 'All',
  minBars: 0,
  setBack: true,
  left: 10,
  right: 1,
  bull1Color: '#08998145',
  bull2Color: '#F2364545',
  bear1Color: '#F2364545',
  bear2Color: '#08998145',
  labSize: 'small',
};

export const inputConfig: InputConfig[] = [
  { id: 'display', type: 'string', title: 'Display', defval: 'Bullish AND Bearish', options: ['Bullish OR Bearish', 'Bullish AND Bearish', 'Bearish', 'Bullish'] },
  { id: 'mult', type: 'float', title: 'Width', defval: 1, step: 0.1 },
  { id: 'maxBars', type: 'int', title: 'Maximum Bars', defval: 500 },
  { id: 'showReTest', type: 'string', title: 'Display Test/Retest Labels', defval: 'All', options: ['All', 'Last'] },
  { id: 'minBars', type: 'int', title: 'Minimum Bars', defval: 0, min: 0 },
  { id: 'setBack', type: 'bool', title: 'Set Back To Last Retest', defval: true },
  { id: 'left', type: 'int', title: 'Left', defval: 10, min: 1, group: 'Swings' },
  { id: 'right', type: 'int', title: 'Right', defval: 1, min: 1, group: 'Swings' },
  { id: 'bull1Color', type: 'color', title: 'Bullish ', defval: '#08998145', inline: 'bull', group: 'Style' },
  { id: 'bull2Color', type: 'color', title: '', defval: '#F2364545', inline: 'bull', group: 'Style' },
  { id: 'bear1Color', type: 'color', title: 'Bearish', defval: '#F2364545', inline: 'bear', group: 'Style' },
  { id: 'bear2Color', type: 'color', title: '', defval: '#08998145', inline: 'bear', group: 'Style' },
  { id: 'labSize', type: 'string', title: 'Label Size', defval: 'small', options: ['tiny', 'small', 'normal', 'large'] },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Swing Breakouts Tests & Retests [LuxAlgo]',
  shortTitle: 'LuxAlgo - Swing Breakouts Tests & Retests',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  style: 'label_up' | 'label_down';
  deleted: boolean;
}
/** type bin */
interface Bin {
  bx: Bx | null;
  state: number;
  price: number;
  lab1: Lb[];
  lab2: Lb[];
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BreakoutsWithTestsRetestsInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels'> & { boxes: BoxData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { display, maxBars, minBars, setBack, right } = cfg;
  const last = cfg.showReTest === 'Last';

  // atr = nz(ta.atr(200), ta.cum(high - low) / (n + 1)) * mult
  const atr200 = ta.atr(bars, 200).toArray();
  const ph = ta.pivothigh(new Series(bars, (b) => b.high), cfg.left, right).toArray();
  const pl = ta.pivotlow(new Series(bars, (b) => b.low), cfg.left, right).toArray();
  const isNa = (v: number | null | undefined): v is null | undefined => v === null || v === undefined || Number.isNaN(v);

  // Live drawings in creation order: when a creation brings the count above max + 5, the oldest are deleted until
  // max remain
  const boxes: Bx[] = [];
  const labels: Lb[] = [];
  const limit = <T extends { deleted: boolean }>(list: T[]) => {
    if (list.length > MAX_OBJECTS + 5) for (const old of list.splice(0, list.length - MAX_OBJECTS)) old.deleted = true;
  };
  const newBox = (left: number, top: number, rightBar: number, bottom: number, bg: string): Bx => {
    const o = { left, top, right: rightBar, bottom, bg, deleted: false };
    boxes.push(o);
    limit(boxes);
    return o;
  };
  const remove = <T extends { deleted: boolean }>(list: T[], o: T | null | undefined) => {
    if (!o || o.deleted) return;
    o.deleted = true;
    list.splice(list.indexOf(o), 1);
  };
  /** colorRGB(): the colour without its transparency */
  const solid = (c: string) => String(color.rgb(color.r(c), color.g(c), color.b(c)));
  /** label(dir, state, y) */
  const newLabel = (i: number, bullSide: boolean, state: number, y: number): Lb => {
    const o: Lb = bullSide
      ? state === 1
        ? { x: i, y, text: '▲', textColor: solid(cfg.bull1Color), style: 'label_up', deleted: false }
        : { x: i, y, text: '▽', textColor: solid(cfg.bull2Color), style: 'label_down', deleted: false }
      : state === 1
        ? { x: i, y, text: '▼', textColor: solid(cfg.bear1Color), style: 'label_down', deleted: false }
        : { x: i, y, text: '△', textColor: solid(cfg.bear2Color), style: 'label_up', deleted: false };
    labels.push(o);
    limit(labels);
    return o;
  };
  /** mayAdd() */
  const mayAdd = (aLab: Lb[], i: number) => (aLab.length === 0 || last ? true : cfg.showReTest === 'All' && i - aLab[0].x > minBars);
  /** addLabel(...).delete(): with 'Last' the label before is taken out of the array and deleted */
  const addLabel = (aLab: Lb[], lab: Lb) => {
    aLab.unshift(lab);
    if (last && aLab.length > 1) remove(labels, aLab.pop());
  };

  const bull: Bin = { bx: null, state: 0, price: NaN, lab1: [], lab2: [] };
  const bear: Bin = { bx: null, state: 0, price: NaN, lab1: [], lab2: [] };
  let cum = 0;

  /** One side: `up` is the bullish side (boxes on swing lows) */
  const step = (i: number, side: Bin, up: boolean, atr: number, boxNow: { left: number; right: number; top: number; bottom: number }) => {
    const { open, close } = bars[i];
    const { left, right: boxRight, top, bottom } = boxNow;
    if (side.state === 0) {
      const pivot = up ? pl[i] : ph[i];
      if (!isNa(pivot)) {
        side.bx = up ? newBox(i - right, pivot + atr, i, pivot, cfg.bull1Color) : newBox(i - right, pivot, i, pivot - atr, cfg.bear1Color);
        side.state = 1; // swing found
        side.lab1 = []; // the labels leave the arrays, they are not deleted
        side.lab2 = [];
        side.price = pivot;
      }
    } else if (side.state === 1) {
      if (boxRight - left >= maxBars) {
        // the right side is too far from the start
        if (side.lab1.length === 0) remove(boxes, side.bx);
        else if (setBack && side.bx) side.bx.right = side.lab1[0].x;
        side.state = 0;
      } else {
        if (side.bx) side.bx.right = i;
        // breakout: the first box stays, a second box starts
        if (up ? lt(close, bottom) : gt(close, top)) {
          side.bx = newBox(i, top, i, bottom, up ? cfg.bull2Color : cfg.bear2Color);
          side.state = 2;
          side.price = up ? top : bottom;
        }
        const test = up ? gt(close, top) && lt(open, top) : lt(close, bottom) && gt(open, bottom);
        if (test && mayAdd(side.lab1, i)) addLabel(side.lab1, newLabel(i, up, 1, side.price));
      }
    } else if (side.state === 2) {
      if (boxRight - left >= maxBars) {
        if (side.lab2.length === 0) remove(boxes, side.bx);
        else if (setBack && side.bx) side.bx.right = side.lab2[0].x;
        side.state = 0;
      } else {
        if (side.bx) side.bx.right = i;
        if (up ? gt(close, top) : lt(close, bottom)) side.state = 0;
        const retest = up ? lt(close, bottom) && gt(open, bottom) : gt(close, top) && lt(open, top);
        if (retest && mayAdd(side.lab2, i)) addLabel(side.lab2, newLabel(i, up, 2, side.price));
      }
    }
  };

  /** The box of a side as it is before the bar changes it (na when there is no box or it was deleted) */
  const snapshot = (b: Bx | null) =>
    b && !b.deleted ? { left: b.left, right: b.right, top: b.top, bottom: b.bottom } : { left: NaN, right: NaN, top: NaN, bottom: NaN };

  for (let i = 0; i < n; i++) {
    cum += bars[i].high - bars[i].low;
    const a = atr200[i];
    const atr = (isNa(a) ? cum / (i + 1) : a) * cfg.mult;
    const bullBox = snapshot(bull.bx);
    const bearBox = snapshot(bear.bx);

    if (display === 'Bullish' || display === 'Bullish AND Bearish' || (display === 'Bullish OR Bearish' && bear.state === 0)) {
      step(i, bull, true, atr, bullBox);
    }
    if (display === 'Bearish' || display === 'Bullish AND Bearish' || (display === 'Bullish OR Bearish' && bull.state === 0)) {
      step(i, bear, false, atr, bearBox);
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    boxes: boxes.map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom, bgColor: b.bg, borderColor: 'transparent',
    })),
    labels: labels.map((l) => ({
      time: T(l.x), price: l.y, text: l.text, color: 'transparent', textColor: l.textColor, style: l.style, size: cfg.labSize,
    })),
  };
}

export const BreakoutsWithTestsRetests = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
