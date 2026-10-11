/**
 * Supply and Demand Zones [BigBeluga]
 *
 * Zones drawn as boxes after three candles in a row of the same colour with a high volume.
 * - Supply zone: the bar and the two bars before close below their open, the volume of the bar before is above the
 *   average volume (last 1,000 bars) and no supply zone was made in the last 14 bars. The script goes back up to 5
 *   bars to the latest rising candle: the zone runs from its low to its low + 2 x ATR(200). The volume of the bars
 *   passed on the way is summed (falling candles count as negative): the "delta" of the zone.
 * - Demand zone: the mirror case, from the high of the latest falling candle down to its high - 2 x ATR(200).
 * - Each zone extends to the right, with its delta and its share of the sum of all deltas as text. A supply zone is
 *   removed when the close is above its top, a demand zone when the close is below its bottom, or when a level of
 *   another zone of the same side is inside it. The border becomes dashed when a bar crosses the near edge of the
 *   zone. At most 5 zones per side are kept.
 * - A table on the last bar gives the sum of the supply deltas and of the demand deltas.
 * The script removes a delta by the position of a box that it has just removed from its list, which is the last
 * delta of the list: the deltas shown can belong to another zone, and a box can leave the list without being deleted
 * (it then stays on the chart as it is). The port does the same. At most 50 boxes are kept.
 *
 * Chart context (optional third argument):
 * - `chart.backgroundColor`: the background of the table. Without it #0F0F0F.
 *
 * Reference: "Supply and Demand Zones [BigBeluga]" by BigBeluga
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © BigBeluga
 */

import { ta, str, color, array, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, TableData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, type ChartContext } from '../chart-context';

export interface SupplyAndDemandZonesInputs {
  colSupply: string;
  colDemand: string;
}

export const defaultInputs: SupplyAndDemandZonesInputs = {
  colSupply: '#FF9800',
  colDemand: '#009fd4',
};

export const inputConfig: InputConfig[] = [
  { id: 'colSupply', type: 'color', title: 'Supply', defval: '#FF9800' },
  { id: 'colDemand', type: 'color', title: 'Demand', defval: '#009fd4' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Supply and Demand Zones [BigBeluga]',
  shortTitle: 'Supply and Demand Zones [BigBeluga]',
  overlay: true,
};

/** Default box limit of the script */
const MAX_BOXES = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

interface Bx {
  left: number;
  top: number;
  right: number;
  bottom: number;
  bg: string | null;
  border: string;
  width: number;
  dashed: boolean;
  text: string;
  extendRight: boolean;
  deleted: boolean;
}

/** array.remove(): a negative index counts from the end; an index outside the array is a runtime error */
function removeAt<T>(arr: T[], index: number): void {
  const k = index < 0 ? arr.length + index : index;
  if (k < 0 || k >= arr.length) throw new Error(`Index ${index} is out of bounds, array size is ${arr.length}`);
  arr.splice(k, 1);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SupplyAndDemandZonesInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { boxes: BoxData[]; tables: TableData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const atrArr = ta.atr(bars, 200).toArray();
  const volume = bars.map((b) => b.volume ?? NaN);
  const bear = bars.map((b) => lt(b.close, b.open));
  const bull = bars.map((b) => gt(b.close, b.open));

  // Live boxes in creation order: a creation that brings the count above max + 5 deletes the oldest until max remain
  const alive: Bx[] = [];
  const newBox = (b: Omit<Bx, 'deleted'>): Bx => {
    const o = { ...b, deleted: false };
    alive.push(o);
    if (alive.length > MAX_BOXES + 5) {
      for (const old of alive.splice(0, alive.length - MAX_BOXES)) old.deleted = true;
    }
    return o;
  };
  const deleteBox = (b: Bx) => {
    if (b.deleted) return;
    b.deleted = true;
    alive.splice(alive.indexOf(b), 1);
  };
  // the getters of a deleted box give na
  const topOf = (b: Bx) => (b.deleted ? NaN : b.top);
  const bottomOf = (b: Bx) => (b.deleted ? NaN : b.bottom);

  const vol: number[] = [];
  const bearBoxes: Bx[] = [];
  const bullBoxes: Bx[] = [];
  const bullDelta: number[] = [];
  const bearDelta: number[] = [];
  let countBear = 0;
  let countBull = 0;
  let extraVolPrev = false;

  /** One side: the zone found on this bar */
  const create = (i: number, supply: boolean, atr: number): boolean => {
    const same = supply ? bear : bull;
    const other = supply ? bull : bear;
    let delta = 0.0;
    for (let k = 0; k <= 5; k++) {
      const j = i - k;
      if (j >= 0 && other[j]) {
        const bar = bars[j];
        const text = (supply ? 'Supply: ' : 'Demand: ') + str.tostring(delta, 'volume');
        const box = supply
          ? newBox({ left: j, top: bar.low + atr, right: i, bottom: bar.low, bg: null, border: cfg.colSupply, width: 2, dashed: false, text, extendRight: false })
          : newBox({ left: j, top: bar.high, right: i, bottom: bar.high - atr, bg: null, border: cfg.colDemand, width: 2, dashed: false, text, extendRight: false });
        (supply ? bearBoxes : bullBoxes).push(box);
        (supply ? bearDelta : bullDelta).push(delta);
        return true;
      }
      const v = j >= 0 ? volume[j] : NaN;
      delta += j >= 0 && same[j] ? (supply ? -v : v) : (supply ? v : -v);
    }
    return false;
  };

  /** One side: the zones are updated, removed and limited to 5 */
  const update = (i: number, supply: boolean) => {
    const bar = bars[i];
    const boxes = supply ? bearBoxes : bullBoxes;
    const deltas = supply ? bearDelta : bullDelta;
    const bg = String(color.new(supply ? cfg.colSupply : cfg.colDemand, 90));
    // for b in boxes: the list is read by position, so the box after a removed one is skipped
    for (let p = 0; p < boxes.length; p++) {
      const b = boxes[p];
      const k = boxes.indexOf(b);
      let buy = 0.0;
      let sell = 0.0;
      for (const v of bullDelta) buy += Math.abs(v);
      for (const v of bearDelta) sell += Math.abs(v);
      const tot = buy + sell;
      const d = deltas[k];
      const share = d / tot * 100;
      if (!b.deleted) {
        b.text = (supply ? 'Supply: ' : 'Demand: ') + str.tostring(d, 'volume') + ' | '
          + str.tostring(supply ? Math.abs(share) : share, 'percent');
        b.right = i + 100;
        b.extendRight = true;
        b.bg = bg;
      }
      const top = topOf(b);
      const bot = bottomOf(b);
      if (supply ? gt(bar.close, top) : lt(bar.close, bot)) {
        deleteBox(b);
        removeAt(boxes, boxes.indexOf(b));
        // the box is no longer in the list: its position is -1, the last delta
        removeAt(deltas, boxes.indexOf(b));
      }
      // (right - left - 15) > 20 is true for every live box (right = bar + 100)
      if (!b.deleted && gt(b.right - b.left - 15, 20)) {
        const edge = supply ? bot : top;
        if (gt(bar.high, edge) && lt(bar.low, edge)) {
          b.dashed = true;
          b.width = 1;
        }
      }
    }

    // A zone with a level of another zone inside it is removed (the loop ends are read again on every pass)
    for (let a = 0; a <= boxes.length - 1; a++) {
      const lvl = boxes[a];
      const top = topOf(lvl);
      const bot = bottomOf(lvl);
      for (let j = 0; j <= boxes.length - 1; j++) {
        if (a === j) continue;
        const level = supply ? topOf(boxes[j]) : bottomOf(boxes[j]);
        if (lt(level, top) && gt(level, bot)) {
          deleteBox(lvl);
          removeAt(boxes, boxes.indexOf(lvl));
          removeAt(deltas, boxes.indexOf(lvl));
        }
      }
    }

    if (boxes.length > 5) {
      deleteBox(boxes.shift()!);
      deltas.shift();
    }
  };

  for (let i = 0; i < n; i++) {
    vol.push(volume[i]);
    if (vol.length > 1000) vol.shift();
    const extraVol = gt(volume[i], array.avg(vol));
    const atr = (atrArr[i] ?? NaN) * 2;
    const three = (side: boolean[]) => i >= 2 && side[i] && side[i - 1] && side[i - 2];

    if (three(bear) && extraVolPrev && countBear === 0 && create(i, true, atr)) countBear = 1;
    if (countBear >= 1) countBear += 1;
    if (countBear >= 15) countBear = 0;

    if (three(bull) && extraVolPrev && countBull === 0 && create(i, false, atr)) countBull = 1;
    if (countBull >= 1) countBull += 1;
    if (countBull >= 15) countBull = 0;

    update(i, true);
    update(i, false);
    extraVolPrev = extraVol;
  }

  // var dash = table.new(position.bottom_right, 10, 10, chart.bg_color); the cells are set on the last bar
  const tables: TableData[] = [];
  if (n > 0) {
    tables.push({
      position: 'bottom_right', columns: 10, rows: 10, bgColor: backgroundColorOf(chart),
      cells: [
        { column: 0, row: 0, text: 'Total Supply:', textHAlign: 'left', textColor: cfg.colSupply, textSize: 'auto' },
        { column: 0, row: 1, text: 'Total Demand:', textHAlign: 'left', textColor: cfg.colDemand, textSize: 'auto' },
        { column: 1, row: 0, text: str.tostring(array.sum(bearDelta)), textColor: cfg.colSupply, textSize: 'auto' },
        { column: 1, row: 1, text: str.tostring(array.sum(bullDelta)), textColor: cfg.colDemand, textSize: 'auto' },
      ],
    });
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    // a box with an na coordinate is not drawn
    boxes: alive.filter((b) => !Number.isNaN(b.top) && !Number.isNaN(b.bottom)).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: b.bg ?? 'transparent', borderColor: b.border, borderWidth: b.width,
      ...(b.dashed ? { borderStyle: 'dashed' as const } : {}),
      text: b.text, textColor: '#FFFFFF', textSize: 'normal' as const, textHAlign: 'right' as const,
      ...(b.extendRight ? { extend: 'right' as const } : {}),
    })),
    tables,
  };
}

export const SupplyAndDemandZones = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
