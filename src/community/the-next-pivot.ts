/**
 * The Next Pivot [Kioseff Trading]
 *
 * Looks for the past sequence of "Correlation Length" bars (in the last "Bars Back To Search" bars) that is the most
 * similar to the latest one (cosine similarity by default; also Spearman, Pearson, Euclidean, mean squared error or
 * Kendall, on prices or on log changes), then projects the bars that followed it from the current bar: a dotted
 * price path of "Forecast Length" segments, each one the bar-to-bar change of the matched past sequence. A projected
 * zig zag follows the path from the last pivot of a zig zag (pivot legs 5, deviation 0.00001 %, transparent lines),
 * and three boxes mark the matched sequence, what followed it and the latest sequence. An optional linear
 * regression channel (off by default) fits the projected path. Everything is drawn once, on the last confirmed bar
 * (the bar before the last one while the last bar is still open: chart context).
 *
 * The zig zag is the "ZigZag" library (version 6) by the same platform, ported here for the settings the script uses
 * (no labels, no extension to the last bar); "MathOperator" by RicardoSantos (plain comparisons) and "arraymethods"
 * by HeWhoMustNotBeNamed (`flush`: delete all boxes) are written inline.
 *
 * Reference: "The Next Pivot [Kioseff Trading]" by KioseffTrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Kioseff Trading
 */

import {
  array, str, math, color, line, box, linefill, table, resetDrawings, setDrawingBar, drawingOutputs,
  type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData, LinefillData, TableData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

type Similarity = 'Spearmen' | 'Pearson' | 'Euclidean (Absolute Difference)' | 'Cosine Similarity' | 'Mean Squared Error' | 'Kendall';

export interface TheNextPivotInputs {
  /** Correlation Length (bars of the compared sequences) */
  historical: number;
  /** Forecast Length */
  forecastLen: number;
  /** Similarity Calculation */
  typec: Similarity;
  /** Looks For Similarities In */
  simtype: '%Change' | 'Price';
  /** Bars Back To Search */
  tim: number;
  /** Show Projected Zig Zag */
  zonly: boolean;
  /** Show Projected Price Path */
  ponly: boolean;
  /** Linear regression channel on the projected path */
  on: boolean;
  /** Lin Reg σ */
  stdev: number;
  /** Projected Zig Zag Color */
  projcol: string;
  /** Forecast Color */
  forecastCol: string;
}

export const defaultInputs: TheNextPivotInputs = {
  historical: 20,
  forecastLen: 50,
  typec: 'Cosine Similarity',
  simtype: 'Price',
  tim: 5000,
  zonly: true,
  ponly: true,
  on: false,
  stdev: 1,
  projcol: '#14D990',
  forecastCol: '#FFFFFF',
};

export const inputConfig: InputConfig[] = [
  {
    id: 'historical', type: 'int', title: 'Correlation Length', defval: 20, min: 5, max: 100,
    group: 'How Long Should The Correlating Sequences Be? (Bars Back)',
  },
  { id: 'forecastLen', type: 'int', title: 'Forecast Length', defval: 50, min: 15, max: 250, group: 'How Long Should The Forecast Be?' },
  {
    id: 'typec', type: 'string', title: 'Similarity Calculation', defval: 'Cosine Similarity',
    options: ['Spearmen', 'Pearson', 'Euclidean (Absolute Difference)', 'Cosine Similarity', 'Mean Squared Error', 'Kendall'],
    group: 'Similarity Method',
  },
  { id: 'simtype', type: 'string', title: 'Looks For Similarities In', defval: 'Price', options: ['%Change', 'Price'], group: 'Similarity Method' },
  {
    id: 'tim', type: 'int', title: 'Bars Back To Search', defval: 5000, min: 500, step: 1000,
    group: 'How Many Bars Back Should We Look To Find The Most Similar Sequence?',
  },
  { id: 'zonly', type: 'bool', title: 'Show Projected Zig Zag', defval: true, inline: 'Projected', group: 'Aesthetics' },
  { id: 'ponly', type: 'bool', title: 'Show Projected Price Path', defval: true, inline: 'Projected', group: 'Aesthetics' },
  { id: 'on', type: 'bool', title: '', defval: false, inline: 'Lin', group: 'Aesthetics' },
  { id: 'stdev', type: 'float', title: 'Lin Reg σ', defval: 1, min: 0, step: 0.1, inline: 'Lin', group: 'Aesthetics' },
  { id: 'projcol', type: 'color', title: 'Projected Zig Zag Color', defval: '#14D990', inline: '1', group: 'Aesthetics' },
  { id: 'forecastCol', type: 'color', title: 'Forecast Color  ', defval: '#FFFFFF', inline: '1', group: 'Aesthetics' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'The Next Pivot [Kioseff Trading]',
  shortTitle: 'The Next Pivot [Kioseff Trading]',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500, max_labels_count = 500) */
const MAX_OBJECTS = 500;
/** color.blue of Pine v5 */
const BLUE = '#2962FF';
const TRANSPARENT = '#00000000';

/** Pine float comparisons (MathOperator methods): a > b only when a - b > 1e-10, == within 1e-10; na compares false */
const EPS = 1e-10;
const over = (a: number, b: number) => a - b > EPS;
const under = (a: number, b: number) => b - a > EPS;
const overEqual = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && !(b - a > EPS);
const equal = (a: number, b: number) => Math.abs(a - b) <= EPS;
const notEqual = (a: number, b: number) => !Number.isNaN(a) && !Number.isNaN(b) && Math.abs(a - b) > EPS;

/** Pine `for i = from to to`: counts down when from > to */
function* range(from: number, to: number): Generator<number> {
  if (from <= to) for (let i = from; i <= to; i++) yield i;
  else for (let i = from; i >= to; i--) yield i;
}

/** Maximum / minimum of the keys of a map (na for an empty map) */
const keyMax = (m: Map<number, number>) => (m.size ? array.max([...m.keys()]) : NaN);
const keyMin = (m: Map<number, number>) => (m.size ? array.min([...m.keys()]) : NaN);

/** One pivot of the zig zag library: its line goes from the previous pivot to this one */
interface Pivot {
  isHigh: boolean;
  endTime: number;
  endPrice: number;
  ln: Line;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<TheNextPivotInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'boxes' | 'lines' | 'linefills' | 'tables'> & {
  boxes: BoxData[]; lines: LineDrawingData[]; linefills: LinefillData[]; tables: TableData[];
} {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const kendall = cfg.typec === 'Kendall';
  // if typec == "Kendall": tim := math.min(tim, 1500), historical := math.min(20, historical)
  const tim = kendall ? Math.min(cfg.tim, 1500) : cfg.tim;
  const historical = kendall ? Math.min(20, cfg.historical) : cfg.historical;
  const forecastLen = cfg.forecastLen;
  const projcol = cfg.projcol;
  const forecastCol = cfg.forecastCol;
  const lastIndex = n - 1;
  // barstate.islastconfirmedhistory: the last bar when it is closed, else the bar before it
  const blockBar = lastBarConfirmedOf(chart) ? lastIndex : lastIndex - 1;

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  // ZigZag library: Settings(0.00001, 5, #00000000, false, false, false, false, "Absolute", true)
  const devThreshold = 0.00001;
  const depth = Math.max(2, Math.floor(5 / 2));
  const pivots: Pivot[] = [];
  const timeMs = bars.map((b) => b.time * 1000);
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);

  /** findPivotPoint(source, depth, isHigh): [time, price] of the bar `depth` bars back, or null */
  const findPivotPoint = (src: number[], i: number, isHigh: boolean): [number, number] | null => {
    const p = i - depth >= 0 && !Number.isNaN(src[i - depth]) ? src[i - depth] : 0;
    if (depth * 2 > i) return null;
    for (let k = 0; k <= depth - 1; k++) {
      if ((isHigh && over(src[i - k], p)) || (!isHigh && under(src[i - k], p))) return null;
    }
    for (let k = depth + 1; k <= 2 * depth; k++) {
      if ((isHigh && overEqual(src[i - k], p)) || (!isHigh && overEqual(p, src[i - k]))) return null;
    }
    return [timeMs[i - depth], p];
  };

  /** newPivotPointFound(isHigh, point) */
  const pivotPointFound = (isHigh: boolean, t: number, price: number) => {
    const last = pivots.length ? pivots[pivots.length - 1] : null;
    if (last) {
      if (last.isHigh === isHigh) {
        const m = last.isHigh ? 1 : -1;
        if (over(price * m, last.endPrice * m)) {
          // updateLastPivot(point)
          if (pivots.length === 1) line.set_xy1(last.ln, t, price);
          last.endTime = t;
          last.endPrice = price;
          line.set_xy2(last.ln, t, price);
        }
      } else {
        const dev = 100 * (price - last.endPrice) / Math.abs(last.endPrice);
        if ((!last.isHigh && overEqual(dev, devThreshold)) || (last.isHigh && overEqual(-1 * devThreshold, dev))) {
          const ln = line.new(last.endTime, last.endPrice, t, price, 'bar_time', 'none', TRANSPARENT, 'solid', 2);
          pivots.push({ isHigh, endTime: t, endPrice: price, ln });
        }
      }
    } else {
      const ln = line.new(t, price, t, price, 'bar_time', 'none', TRANSPARENT, 'solid', 2);
      pivots.push({ isHigh, endTime: t, endPrice: price, ln });
    }
  };

  const zigZagUpdate = (i: number) => {
    const ph = findPivotPoint(highs, i, true);
    if (ph) pivotPointFound(true, ph[0], ph[1]);
    const pl = findPivotPoint(lows, i, false);
    if (pl) pivotPointFound(false, pl[0], pl[1]);
  };

  const firstTime = n ? timeMs[0] : NaN; // var t = time
  const mastertime: number[] = [];
  const ret: number[] = [];
  const timeArr: number[] = [];
  const closeArr: number[] = [];
  const loArr: number[] = [];
  const hiArr: number[] = [];

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === lastIndex);
    const b = bars[i];
    zigZagUpdate(i);
    mastertime.push(timeMs[i]);
    if (lastIndex - i <= tim) {
      const val = cfg.simtype === '%Change' ? Math.log(b.close / (i > 0 ? bars[i - 1].close : NaN)) : b.close;
      timeArr.push(timeMs[i]);
      closeArr.push(b.close);
      ret.push(val);
      loArr.push(b.low);
      hiArr.push(b.high);
    }
    if (i === blockBar) lastConfirmedBar(i);
  }
  setDrawingBar(null);

  /** The `if barstate.islastconfirmedhistory` block */
  function lastConfirmedBar(barIndex: number) {
    const b = bars[barIndex];
    const lineAll = line.all();
    for (const bx of box.all()) box.delete(bx); // box.all.flush()

    let xcor = lastIndex; // var xcor = last_bar_index
    const timeIndex = new Map(mastertime.map((t, k) => [t, k]));
    for (const l of lineAll) {
      const x2 = line.get_x2(l);
      if (x2 > firstTime) {
        const x = timeIndex.get(x2);
        if (x !== undefined) xcor = x;
      }
    }
    // lines with an x2 under 1e8 are deleted: the zig zag lines use bar times, none is

    const recRet = ret.slice(ret.length - historical, ret.length);
    // result = matrix.new<float>(2, 1, -1e8): best score and its index
    let best = -1e8;
    let bestIndex = -1e8;
    const update = (score: number, idx: number) => {
      if (overEqual(score, best)) {
        best = score;
        bestIndex = idx;
      }
    };
    const end = ret.length - historical * 2 - forecastLen;
    const slices = function* () {
      for (const k of range(0, end)) {
        if (k < 0) throw new Error('The Next Pivot: not enough bars for the search (array.slice index out of bounds)');
        yield [k, ret.slice(k, k + historical)] as const;
      }
    };
    switch (cfg.typec) {
      case 'Spearmen': {
        const rank = (arr: number[], k: number) => (math.round((array.percentrank(arr, k) / 100) * (historical - 1) + 1) as number);
        const denominator = historical * (Math.pow(historical, 2) - 1);
        const estimate = recRet.map((_, k) => rank(recRet, k));
        for (const [k, slice] of slices()) {
          const d2 = array.new_float(historical);
          for (let x = 0; x <= historical - 1; x++) d2[x] = Math.pow(estimate[x] - rank(slice, x), 2);
          const r = 1 - (6 * array.sum(d2)) / denominator;
          update(k, r); // id.update(i, r): arguments as in the original
        }
        break;
      }
      case 'Pearson': {
        const stdevA = array.stdev(recRet);
        for (const [k, slice] of slices()) update(array.covariance(slice, recRet) / (stdevA * array.stdev(slice)), k);
        break;
      }
      case 'Euclidean (Absolute Difference)': {
        for (const [k, slice] of slices()) {
          const euc = array.new_float(historical);
          for (let x = 0; x <= historical - 1; x++) euc[x] = Math.pow(recRet[x] - slice[x], 2);
          update(1 / (1 + Math.sqrt(array.sum(euc))), k);
        }
        break;
      }
      case 'Cosine Similarity': {
        let nA = 0;
        for (const v of recRet) nA += Math.pow(v, 2);
        nA = Math.sqrt(nA);
        for (const [k, slice] of slices()) {
          let prod = 0;
          let nB = 0;
          for (let x = 0; x <= historical - 1; x++) {
            prod += recRet[x] * slice[x];
            nB += Math.pow(slice[x], 2);
          }
          update(prod / (nA * Math.sqrt(nB)), k);
        }
        break;
      }
      case 'Mean Squared Error': {
        for (const [k, slice] of slices()) {
          const mse = array.new_float(historical);
          for (let x = 0; x <= historical - 1; x++) mse[x] = Math.pow(slice[x] - recRet[x], 2);
          update(1 / (1 + array.sum(mse) / historical), k);
        }
        break;
      }
      case 'Kendall': {
        for (const [k, slice] of slices()) {
          let con = 0;
          let dis = 0;
          let aT = 0;
          let bT = 0;
          for (let x = 0; x <= slice.length - 1; x++) {
            for (const y of range(x + 1, historical - 1)) {
              if (y > historical - 1) break;
              const diff1 = recRet[y] - recRet[x];
              const diff2 = slice[y] - slice[x];
              const s = math.sign(diff1 * diff2);
              if (s === 1) con++;
              else if (s === -1) dis++;
              if (equal(diff1, 0)) aT++;
              if (equal(diff2, 0)) bT++;
            }
          }
          update((con - dis) / Math.sqrt((con + dis + aT) * (con + dis + bT)), k);
        }
        break;
      }
    }

    const startarr = Math.trunc(bestIndex);
    const midarr = startarr + historical;
    const endarr = midarr + forecastLen;
    let lineData: number[];
    if (cfg.simtype === '%Change') {
      lineData = array.slice(ret, startarr + historical + 1, endarr + 1);
    } else {
      lineData = [];
      for (const k of range(startarr + historical + 1, endarr)) lineData.push(array.get(closeArr, k) / array.get(closeArr, k - 1) - 1);
    }

    const projectZig: Line[] = [];
    const lines: Line[] = [];
    const diffArr: number[] = [];
    const updateZig = (x1: number, y1: number, x2: number, y2: number) => {
      projectZig.push(line.new(x1, y1, x2, y2, 'bar_index', 'none', projcol, 'solid', 2));
    };
    const zlast = () => projectZig[projectZig.length - 1];
    const llast = () => lines[lines.length - 1];

    if (lineAll.length > 0) {
      for (const k of range(1, lineAll.length - 1)) {
        const a = line.get_y2(array.get(lineAll, k));
        const p = line.get_y2(array.get(lineAll, k - 1));
        diffArr.push(Math.abs((a - p) / p));
      }
    }
    const lastLine = array.get(lineAll, lineAll.length - 1);
    const prevLine = array.get(lineAll, lineAll.length - 2);
    const lasty2 = line.get_y2(lastLine);
    const lasty22 = line.get_y2(prevLine);
    const threshold = array.percentile_nearest_rank(diffArr, 25);
    const pathColor = cfg.ponly ? forecastCol : TRANSPARENT;

    lines.push(line.new(barIndex, b.close, barIndex + 1, b.close * (1 + lineData[0]), 'bar_index', 'none', pathColor, 'dotted'));
    if (cfg.zonly) updateZig(xcor, line.get_y2(lastLine), barIndex, under(lasty22, lasty2) ? b.low : b.high);

    // `var` variables inside the loop: one pair per place, kept across the iterations
    let minA = 1e8; let maxA = 0;
    let minB = 1e8; let maxB = 0;
    let maxC = 0; let minC = 1e8;
    let minD = 1e8; let maxD = 0;
    /** map of high (low) prices -> bar index for the bars after (from) the end of the last zig zag line */
    const priceMap = (prices: number[], from: (t: number) => boolean) => {
      const m = new Map<number, number>();
      let count = prices.length - 1;
      for (let x = mastertime.length - 1; x >= 0; x--) {
        if (from(mastertime[x])) m.set(array.get(prices, count), x);
        else break;
        count -= 1;
      }
      return m;
    };

    for (const i of range(1, lineData.length - 1)) {
      const prev = lines[i - 1];
      lines.push(line.new(line.get_x2(prev), line.get_y2(prev), line.get_x2(prev) + 1,
        line.get_y2(prev) * (1 + lineData[i]), 'bar_index', 'none', pathColor, 'dotted'));
      if (!cfg.zonly) continue;
      const ly2 = () => line.get_y2(llast());
      const lx2 = () => line.get_x2(llast());

      if (equal(projectZig.length, 1)) {
        if (under(lasty22, lasty2)) {
          minA = (math.min(ly2(), minA, line.get_y2(zlast())) as number);
          if (equal(minA, ly2())) maxA = 0;
          else maxA = (math.max(maxA, ly2()) as number);
          line.set_y2(zlast(), minA);
          line.set_x2(zlast(), equal(minA, ly2()) ? lx2() : line.get_x2(zlast()));
          if (overEqual(Math.abs((maxA - minA) / minA), threshold) && notEqual(maxA, 0)) {
            const lastX2 = line.get_x2(lastLine);
            const maxmap = priceMap(hiArr, (t) => t > lastX2);
            const top = keyMax(maxmap);
            if (top > line.get_y1(zlast())) line.set_xy1(zlast(), maxmap.get(top)!, top);
            updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), maxA);
          }
        } else {
          if (equal(i, 1)) {
            const lastX2 = line.get_x2(lastLine);
            const minMap = priceMap(loArr, (t) => overEqual(t, lastX2));
            const bottom = keyMin(minMap);
            if (under(bottom, line.get_y2(zlast()))) {
              line.set_y2(zlast(), (math.min(bottom, ly2()) as number));
              const x2 = under(ly2(), bottom) ? lx2() : minMap.get(bottom)!;
              line.set_x2(zlast(), x2);
              line.set_x1(zlast(), mastertime.indexOf(line.get_x2(prevLine)));
              line.set_y1(zlast(), line.get_y2(prevLine));
              updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), ly2());
            }
          }
          maxB = (math.max(ly2(), maxB) as number);
          if (equal(maxB, ly2())) minB = 1e8;
          else minB = (math.min(minB, ly2()) as number);
          line.set_y2(zlast(), maxB);
          line.set_x2(zlast(), equal(maxB, ly2()) ? lx2() : line.get_x2(zlast()));
          if (overEqual(Math.abs((maxB - minB) / minB), threshold) && notEqual(minB, 1e8)) {
            updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), minB);
          }
        }
      } else if (over(projectZig.length, 1)) {
        const before = () => projectZig[projectZig.length - 2];
        if (overEqual(line.get_y2(zlast()), line.get_y2(before()))) {
          maxC = (math.max(maxC, ly2(), line.get_y2(zlast())) as number);
          if (equal(maxC, ly2())) minC = 1e8;
          else minC = (math.min(minC, ly2()) as number);
          line.set_y2(zlast(), (math.max(maxC, line.get_y2(zlast())) as number));
          line.set_x2(zlast(), equal(maxC, ly2()) ? lx2() : line.get_x2(zlast()));
          if (overEqual(Math.abs((maxC - minC) / minC), threshold) && notEqual(minC, 1e8)) {
            if (over(projectZig.length, 2)
              || (equal(projectZig.length, 2) && equal(line.get_y1(projectZig[0]), line.get_y2(lastLine)))) {
              updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), minC);
            } else if (equal(projectZig.length, 2)) {
              const lastX2 = line.get_x2(lastLine);
              const maxx = priceMap(hiArr, (t) => over(t, lastX2));
              const top = keyMax(maxx);
              if (over(top, maxC)) {
                line.set_y2(zlast(), top);
                line.set_x2(zlast(), maxx.get(top)!);
                if (notEqual(line.get_x1(zlast()), lastIndex)) {
                  if (over(line.get_x1(lastLine), line.get_x2(lastLine))) {
                    line.set_xy1(zlast(), mastertime.indexOf(line.get_x1(lastLine)), line.get_y1(lastLine));
                  } else {
                    line.set_xy1(zlast(), mastertime.indexOf(line.get_x2(lastLine)), line.get_y2(lastLine));
                  }
                }
              }
              line.delete(projectZig.splice(projectZig.length - 2, 1)[0]);
              updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), minC);
            }
            maxC = 0;
            minC = 1e8;
          }
        } else if (under(line.get_y2(zlast()), line.get_y2(before()))) {
          minD = (math.min(ly2(), minD, line.get_y2(zlast())) as number);
          if (equal(minD, ly2())) maxD = 0;
          else maxD = (math.max(maxD, ly2()) as number);
          line.set_y2(zlast(), minD);
          line.set_x2(zlast(), equal(minD, ly2()) ? lx2() : line.get_x2(zlast()));
          if (overEqual(Math.abs((maxD - minD) / minD), threshold) && notEqual(maxD, 0)) {
            if (over(projectZig.length, 1)) {
              maxD = 0;
              minD = 1e8;
              updateZig(line.get_x2(zlast()), line.get_y2(zlast()), lx2(), ly2());
            }
          }
        }
      }

      if (equal(i, lineData.length - 1) && equal(projectZig.length, 1)) {
        const valMap = new Map<number, number>();
        const zx2 = line.get_x2(zlast());
        for (let x = lines.length - 1; x >= 0; x--) {
          if (over(line.get_x2(lines[x]), zx2)) valMap.set(line.get_y2(lines[x]), x);
          else break;
        }
        const cond = under(line.get_y2(zlast()), line.get_y1(zlast()));
        const key = cond ? keyMax(valMap) : keyMin(valMap);
        const finx = valMap.get(key) ?? NaN;
        updateZig(line.get_x2(zlast()), line.get_y2(zlast()), barIndex + finx + 1, key);
      }
    }

    if (cfg.on) {
      // matrix linReg (4 x forecastLen): bar numbers, path prices, squared deviations, cross products
      const row0 = Array.from({ length: forecastLen }, (_, k) => k + 1);
      const row1 = Array.from({ length: forecastLen }, (_, k) => line.get_y2(array.get(lines, k)));
      const row2 = new Array<number>(forecastLen).fill(NaN);
      const row3 = new Array<number>(forecastLen).fill(NaN);
      for (let k = 0; k <= lineData.length - 1; k++) {
        row2[k] = Math.pow(row0[k] - array.avg(row0), 2);
        row3[k] = (row0[k] - array.avg(row0)) * (row1[k] - array.avg(row1));
      }
      const bx = array.sum(row3) / array.sum(row2);
      const mx = array.avg(row1) - bx * array.avg(row0);
      const sd = array.stdev(row1) * cfg.stdev;
      const len = row1.length;
      const upper = line.new(barIndex, bx + mx + sd, barIndex + len, bx * len + mx + sd, 'bar_index', 'none', '#6929F2');
      const lower = line.new(barIndex, bx + mx - sd, barIndex + len, bx * len + mx - sd, 'bar_index', 'none', '#6929F2');
      linefill.new(upper, lower, String(color.new('#6929F2', 75)));
    }

    const slicex = array.slice(closeArr, startarr, endarr + 1);
    const sliceHi = array.slice(hiArr, closeArr.length - historical, closeArr.length);
    const sliceLo = array.slice(loArr, closeArr.length - historical, closeArr.length);
    box.new(array.get(timeArr, startarr), array.min(slicex), array.get(timeArr, midarr), array.max(slicex), TRANSPARENT, 1,
      'solid', 'none', 'bar_time', String(color.new(BLUE, 70)));
    box.new(array.get(timeArr, midarr), array.min(slicex), array.get(timeArr, endarr), array.max(slicex), TRANSPARENT, 1,
      'solid', 'none', 'bar_time', String(color.new(forecastCol, 70)));
    box.new(barIndex - historical + 1, array.max(sliceHi), barIndex, array.min(sliceLo), TRANSPARENT, 1, 'solid', 'none',
      'bar_index', String(color.new(BLUE, 80)));

    const tab = table.new('bottom_right', 5, 5, undefined, '#FFFFFF', 1, '#FFFFFF', 1);
    table.cell(tab, 0, 0, 'Searching ' + str.tostring(Math.min(lastIndex, tim), '##') + ' Bars Back', 0, 0, '#FFFFFF',
      'center', 'center', 'small', '#00000050');
  }

  const drawn = drawingOutputs(bars);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: drawn.lines ?? [],
    boxes: drawn.boxes ?? [],
    linefills: drawn.linefills ?? [],
    tables: drawn.tables ?? [],
  };
}

export const TheNextPivot = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
