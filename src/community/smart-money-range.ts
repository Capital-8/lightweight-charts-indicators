/**
 * Smart Money Range [ChartPrime]
 *
 * On the last bar, the range from the last pivot high ("period" bars on each side) to the current bar: its lowest
 * low and highest high (the oldest bar on ties). Drawn 170 bars into the future:
 * - a green box at the range low and a red box at the range high (height: twice the band, half of
 *   min(ATR(30) * 0.3, 10 % of the close) 20 bars back)
 * - three counts as labels: the bars whose low before was below the last pivot low and whose close is above it, and
 *   the bars whose high before was above the range high and whose close is below it, over the last 2,001 bars (the
 *   second label is the first count + 1)
 * - a dashed zigzag (eight lines) between the range high and the range low
 * - a profile of "Volume Levels" rows between the range low and high (shifted up by twice the band): for each bar of
 *   the range, the first row with the low of the bar before below its top and the close above its bottom gets one
 *   tick. The rows left of the profile line show the tick counts; the rows right of it show a running count of the
 *   original (the count of the first label, kept growing by one count per tick, of the close "row index" bars back),
 *   with the volume format. Row colours: a gradient by ticks between the two input colours at transparency 70 and 35.
 * With "Random Coloring" the colours are random (as in the original, they change on each calculation).
 *
 * Reference: "Smart Money Range [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  ta, str, color, math, box, label, line, resetDrawings, setDrawingBar, Series,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface SmartMoneyRangeInputs {
  /** Pivot bars on each side */
  prd: number;
  /** Number of volume levels */
  levs: number;
  ShowVolume: boolean;
  randomcolor: boolean;
  Bull: string;
  Bear: string;
  Showlines: boolean;
  randomcolor1: boolean;
  LineZ: string;
}

export const defaultInputs: SmartMoneyRangeInputs = {
  prd: 30,
  levs: 24,
  ShowVolume: true,
  randomcolor: false,
  Bull: 'rgba(66, 240, 127, 0.65)',
  Bear: 'rgba(243, 116, 81, 0.3)',
  Showlines: true,
  randomcolor1: false,
  LineZ: '#FFEB3B',
};

const VISUAL = '➞ Visuals Settings🔸';
const CORE = '➞ Main Core Settings 🔸';

export const inputConfig: InputConfig[] = [
  { id: 'prd', type: 'int', title: 'period', defval: 30, group: CORE },
  { id: 'levs', type: 'int', title: 'Volume Levels', defval: 24, tooltip: 'Number of the Volume levels to check', group: CORE },
  { id: 'ShowVolume', type: 'bool', title: 'Show Volume ❓  ', defval: true, inline: '01', group: VISUAL },
  { id: 'randomcolor', type: 'bool', title: 'Random Coloring ❓  ', defval: false, inline: '01', group: VISUAL },
  { id: 'Bull', type: 'color', title: '1st', defval: 'rgba(66, 240, 127, 0.65)', inline: '01', group: VISUAL },
  { id: 'Bear', type: 'color', title: '2nd', defval: 'rgba(243, 116, 81, 0.3)', inline: '01', group: VISUAL },
  { id: 'Showlines', type: 'bool', title: 'Show Zigzag ❓    ', defval: true, inline: '02', group: VISUAL },
  { id: 'randomcolor1', type: 'bool', title: 'Random Coloring ❓  ', defval: false, inline: '02', group: VISUAL },
  { id: 'LineZ', type: 'color', title: '', defval: '#FFEB3B', inline: '02', group: VISUAL },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Smart Money Range [ChartPrime]',
  shortTitle: 'SMR [ChartPrime]',
  overlay: true,
};

/** indicator(max_boxes_count = 500); lines and labels keep the default 50 */
const MAX_BOXES = 500;
/** Counter(): the bars it reads (for i = 0 to 2000) */
const COUNTER_BARS = 2000;
/** Box text colour of a Pine v5 box without text_color */
const BOX_TEXT = '#363A45';

/** Pine float comparisons: a < b only when b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

/** for i = from to to: counts down when from > to; no step with an na bound */
function* range(from: number, to: number): Generator<number> {
  if (isNaN(from) || isNaN(to)) return;
  if (from <= to) for (let i = from; i <= to; i++) yield i;
  else for (let i = from; i >= to; i--) yield i;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<SmartMoneyRangeInputs> = {},
): IndicatorResult & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const prd = cfg.prd;
  const levs = cfg.levs;
  const A = (s: { toArray(): Array<number | null | undefined> }) => s.toArray().map((v) => v ?? NaN);

  resetDrawings({ box: MAX_BOXES, line: 50, label: 50 });
  const result = () => {
    const interval = barInterval(bars);
    const T = (index: number) => barTime(bars, index, interval);
    return {
      metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
      plots: {},
      boxes: box.all().filter((b) => !isNaN(b.left) && !isNaN(b.right) && !isNaN(b.top) && !isNaN(b.bottom)).map((b): BoxData => ({
        time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
        bgColor: String(b.bgcolor ?? 'transparent'), borderColor: String(b.border_color ?? 'transparent'),
        ...(b.text ? { text: b.text } : {}), textColor: String(b.text_color ?? BOX_TEXT),
      })),
      labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l): LabelData => ({
        time: T(l.x), price: l.y, text: l.text ?? '', color: 'transparent', textColor: String(l.textcolor),
        style: 'none', size: 'large',
      })),
      lines: line.all().filter((l) => !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1) && !isNaN(l.y2)).map((l): LineDrawingData => ({
        time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: 1, style: 'dashed',
      })),
    };
  };
  if (n === 0) return result();

  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const last = n - 1;
  /** series[k] on the last bar (na before the first bar) */
  const at = (s: number[], k: number) => (last - k >= 0 && last - k < n ? s[last - k] : NaN);

  // band = math.min(ta.atr(30) * 0.3, close * 10 / 100)[20] / 2
  const atr = A(ta.atr(bars, 30));
  const minBand = bars.map((b, i) => Math.min(atr[i] * 0.3, b.close * (10.0 / 100)));
  const band = at(minBand, 20) / 2;

  // Last pivot high bar and last pivot low price (var ph, phL, pl)
  const pvtHi = A(ta.pivothigh(new Series(bars, (b) => b.high), prd, prd));
  const pvtLo = A(ta.pivotlow(new Series(bars, (b) => b.low), prd, prd));
  let phL = NaN;
  let pl = NaN;
  for (let i = 0; i < n; i++) {
    if (!isNaN(pvtHi[i]) && pvtHi[i] !== 0) phL = i - prd;
    if (!isNaN(pvtLo[i]) && pvtLo[i] !== 0) pl = low[i - prd];
  }

  setDrawingBar(last, true);

  // if barstate.islast
  const Count = last - phL;
  let lowestValue = low[last];
  let lowestIndex = last;
  let HighValue = high[last];
  let HighIndex = last;
  const SCR: number[] = [];
  for (const i of range(0, Count)) SCR.push(at(close, i));
  for (const i of range(1, Count)) {
    if (le(at(low, i), lowestValue)) {
      lowestValue = at(low, i);
      lowestIndex = last - i;
    }
    if (ge(at(high, i), HighValue)) {
      HighValue = at(high, i);
      HighIndex = last - i;
    }
  }

  // Counter(lev, sup): adds to the global Points array, which keeps its counts over every call of the bar
  const Points = [0, 0];
  const Counter = (lev: number, sup = true): number => {
    for (let i = 0; i <= COUNTER_BARS; i++) {
      if (sup ? lt(at(low, i + 1), lev) && lt(lev, at(close, i)) : lt(lev, at(high, i + 1)) && lt(at(close, i), lev)) {
        Points[sup ? 0 : 1] += 1;
      }
    }
    return Points[sup ? 0 : 1];
  };
  const Value = Counter(pl);
  const Value2 = Counter(HighValue, false);

  const step = (HighValue - lowestValue) / levs;
  const VPlevels = Array.from({ length: levs + 1 }, (_v, i) => lowestValue + step * i);
  const ticks = new Array<number>(levs).fill(0);
  const Volumes = new Array<number>(levs).fill(0);

  // Random colours (used only with the random colouring options)
  const rnd = () => {
    const c = String(color.rgb(math.random(10, 200), math.random(10, 160), math.random(10, 180)));
    const g = String(color.rgb(math.random(25, 32), math.random(40, 200), math.random(15, 100)));
    return { Col: c, Gcolo: g };
  };
  const { Col, Gcolo } = cfg.randomcolor || cfg.randomcolor1 ? rnd() : { Col: '', Gcolo: '' };

  const LA = last - HighIndex;
  const labelplace = Math.trunc((170 + LA) / 2);
  const lowTop = lowestValue + band * 2;
  box.new(lowestIndex, lowTop, last + 170, lowestValue, String(color.rgb(9, 155, 99, 50)), undefined, undefined, undefined,
    undefined, String(color.rgb(9, 155, 99, 90)), undefined, undefined, BOX_TEXT);
  box.new(HighIndex, HighValue + band * 2, last + 170, HighValue, String(color.rgb(255, 4, 4, 50)), undefined, undefined,
    undefined, undefined, String(color.rgb(255, 4, 4, 90)), undefined, undefined, BOX_TEXT);
  const newLabel = (x: number, y: number, text: string) => label.new(x, y, text, 'bar_index', 'price',
    String(color.new(color.black, 100)), 'none', '#FFFFFF', 'large');
  newLabel(lowestIndex, lowestValue - band * 13, str.tostring(Value));
  newLabel(last + 135, lowestValue - band * 13, str.tostring(Value + 1));
  newLabel(HighIndex + labelplace, HighValue + band * 10, str.tostring(Value2));

  if (cfg.Showlines) {
    const lc = cfg.randomcolor1 ? Col : cfg.LineZ;
    const zig = (x1: number, y1: number, x2: number, y2: number) => line.new(x1, y1, x2, y2, 'bar_index', 'none', lc, 'dashed', 1);
    zig(HighIndex, HighValue, lowestIndex + 50, lowTop);
    zig(HighIndex + 2, HighValue, lowestIndex + 52, lowTop);
    zig(lowestIndex + 50, lowTop, HighIndex + (labelplace - 2), HighValue);
    zig(lowestIndex + 52, lowTop, HighIndex + labelplace, HighValue);
    zig(HighIndex + (labelplace - 2), HighValue, last + 133, lowTop);
    zig(HighIndex + labelplace, HighValue, last + 135, lowTop);
    zig(last + 135, lowTop, last + 170, HighValue);
    zig(last + 133, lowTop, last + 168, HighValue);
  }

  // The profile: one tick for the first row crossed by each bar of the range
  for (let i = 0; i < SCR.length; i++) {
    for (let x = 0; x <= VPlevels.length - 2; x++) {
      if (lt(at(low, i + 1), VPlevels[x + 1]) && lt(VPlevels[x], at(close, i))) {
        ticks[x] += 1;
        Volumes[x] += Counter(at(close, x));
        break;
      }
    }
  }

  if (cfg.ShowVolume) {
    const maxTicks = Math.max(...ticks);
    const grad = (c: string, v: number) => String(color.from_gradient(v, 0, maxTicks, color.new(c, 70), color.new(c, 35)));
    // the var box arrays VPboxes / VPboxes2 are empty on the only run of the block: their box.delete calls do nothing
    const rows = ticks.length - 2;
    for (const i of range(0, rows)) {
      const c = grad(cfg.randomcolor ? Col : cfg.Bull, ticks[i]);
      box.new(last + 170 + ticks[i], VPlevels[i + 1] + band * 2, last + 170, VPlevels[i] + band * 2, c,
        undefined, undefined, undefined, undefined, c, Volumes[i] > 0 ? str.tostring(Volumes[i], 'volume') : '',
        undefined, '#FFFFFF');
    }
    for (const i of range(0, rows)) {
      const c = grad(cfg.randomcolor ? Gcolo : cfg.Bear, ticks[i]);
      box.new(last + 170 - ticks[i], VPlevels[i + 1] + band * 2, last + 170, VPlevels[i] + band * 2, c,
        undefined, undefined, undefined, undefined, c, str.tostring(ticks[i]), undefined, '#FFFFFF');
    }
  }
  setDrawingBar(null);

  return result();
}

export const SmartMoneyRange = { calculate, metadata, defaultInputs, inputConfig, plotConfig };
