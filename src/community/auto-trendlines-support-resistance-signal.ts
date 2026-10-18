/**
 * Auto TrendLines Support Resistance Signal Alerts
 *
 * A zig zag of pivot highs and lows (Pivot Period bars on each side) labels its points H / L, HH / LH, HL / LL.
 * A second list keeps the points as major ('M') or minor ('m') swings: a minor swing becomes major when the close
 * breaks the last major high / low or when a new point passes it. For each of 8 point types (major / minor, external
 * HH / LL or internal LH / HL) the last two points of that type make a candidate trend line (up lines from two rising
 * lows, down lines from two falling highs). The line is kept when every close since its first point stays on the
 * right side of it (above an up line, below a down line); it is then drawn and extended one bar at a time while the
 * close stays on that side. A close on the other side stops it (Break signal, triangle); a bar that crosses the line
 * and closes back on the right side is a React signal. 'Delete Previous' removes the line before when a new one of
 * the same type is drawn.
 *
 * Alerts: the original sends its 16 alerts through an alert library (alert() calls, no drawing); the alert inputs are
 * kept and have no output in the port.
 *
 * Chart values read: the state of the last bar (`barstate.isconfirmed`: the signals of an open last bar are not
 * shown), from the chart context; without it the last bar is closed.
 *
 * Reference: "Auto TrendLines [TradingFinder] Support Resistance Signal Alerts" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, line, Series, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type MarkerData,
} from 'oakscriptjs';
import type { LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

type LineStyle = 'solid' | 'dashed' | 'dotted';
type LineExtend = 'none' | 'both' | 'right' | 'left';
type OnOff = 'On' | 'Off';

/** The 8 trend lines: input key, Pine group, line side, point type of Pointer() */
const KINDS = [
  { key: 'MjExUp', label: 'Major External Up', group: 'Major External Up   TrendLine', up: true, point: 'MLL',
    show: 'Show Major External Up   TrendLine', del: 'Delete Previous Major External Up   TrendLine',
    color: '#016b05', style: 'solid', width: 2 },
  { key: 'MjExDown', label: 'Major External Down', group: 'Major External Down TrendLine', up: false, point: 'MHH',
    show: 'Show Major External Down TrendLine', del: 'Delete Previous Major External Down   TrendLine',
    color: '#aa0202', style: 'solid', width: 2 },
  { key: 'MjInUp', label: 'Major Internal Up', group: 'Major Internal Up   TrendLine', up: true, point: 'MHL',
    show: 'Show Major Internal Up   TrendLine', del: 'Delete Previous Major Internal Up   TrendLine',
    color: '#016b05', style: 'solid', width: 1 },
  { key: 'MjInDown', label: 'Major Internal Down', group: 'Major Internal Down TrendLine', up: false, point: 'MLH',
    show: 'Show Major Internal Down TrendLine', del: 'Delete Previous Major Internal Down TrendLine',
    color: '#aa0202', style: 'solid', width: 1 },
  { key: 'MnExUp', label: 'Minor External Up', group: 'Minor External Up   TrendLine', up: true, point: 'mLL',
    show: 'Show Minor External Up   TrendLine', del: 'Delete Previous Minor External Up   TrendLine',
    color: '#016b05a6', style: 'dashed', width: 1 },
  { key: 'MnExDown', label: 'Minor External Down', group: 'Minor External Down TrendLine', up: false, point: 'mHH',
    show: 'Show Minor External Down TrendLine', del: 'Delete Previous Minor External Down   TrendLine',
    color: '#aa0202a6', style: 'dashed', width: 1 },
  { key: 'MnInUp', label: 'Minor Internal Up', group: 'Minor Internal Up   TrendLine', up: true, point: 'mHL',
    show: 'Show Minor Internal Up   TrendLine', del: 'Delete Previous Minor Internal Up   TrendLine',
    color: '#016b05a6', style: 'dotted', width: 1 },
  { key: 'MnInDown', label: 'Minor Internal Down', group: 'Minor Internal Down TrendLine', up: false, point: 'mLH',
    show: 'Show Minor Internal Down TrendLine', del: 'Delete Previous Minor Internal Down TrendLine',
    color: '#aa0202a6', style: 'dotted', width: 1 },
] as const;

type Kind = (typeof KINDS)[number]['key'];

export type AutoTrendlinesSupportResistanceSignalInputs = {
  /** Pivot Period */
  PP: number;
  /** Alert Name (alerts only) */
  alertName: string;
  /** Message Frequency (alerts only) */
  frequency: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (alerts only) */
  alertTimeZone: string;
} & { [K in `alert${Kind}${'B' | 'R'}`]: OnOff }
  & { [K in `show${Kind}`]: boolean }
  & { [K in `deletePre${Kind}`]: boolean }
  & { [K in `color${Kind}`]: string }
  & { [K in `style${Kind}`]: LineStyle }
  & { [K in `extend${Kind}`]: LineExtend }
  & { [K in `width${Kind}`]: number };

const defaults: Record<string, unknown> = {
  PP: 5,
  alertName: 'Auto TrendLines Alerts [TradingFinder]',
  frequency: 'Once Per Bar',
  alertTimeZone: 'UTC',
};
for (const k of KINDS) {
  defaults[`alert${k.key}B`] = 'On';
  defaults[`alert${k.key}R`] = 'On';
}
for (const k of KINDS) {
  defaults[`show${k.key}`] = true;
  defaults[`deletePre${k.key}`] = true;
  defaults[`color${k.key}`] = k.color;
  defaults[`style${k.key}`] = k.style;
  defaults[`extend${k.key}`] = 'none';
  defaults[`width${k.key}`] = k.width;
}
export const defaultInputs = defaults as AutoTrendlinesSupportResistanceSignalInputs;

const ALERT_TIP = 'If you turn on the Alert, you can receive alerts and notifications after setting the "Alert".';

export const inputConfig: InputConfig[] = [
  { id: 'PP', type: 'int', title: 'Pivot Period', defval: 5, group: 'Zig Zag Logic' },
  { id: 'alertName', type: 'string', title: 'Alert Name', defval: 'Auto TrendLines Alerts [TradingFinder]', group: 'Alert' },
  {
    id: 'frequency', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar',
    options: ['All', 'Once Per Bar', 'Per Bar Close'], group: 'Alert',
    tooltip: 'The triggering frequency. Possible values are: All (all function calls trigger the alert), Once Per Bar (the first function call during the bar triggers the alert),  Per Bar Close (the function call triggers the alert only when it occurs during the last script iteration of the real-time bar, when it closes). The default is alert.freq_once_per_bar.)',
  },
  { id: 'alertTimeZone', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: 'Alert' },
  ...KINDS.flatMap((k): InputConfig[] => [
    { id: `alert${k.key}B`, type: 'string', title: `Break ${k.label} TrendLine Alert`, defval: 'On', options: ['On', 'Off'], tooltip: ALERT_TIP, group: 'Alert' },
    { id: `alert${k.key}R`, type: 'string', title: `React ${k.label} TrendLine Alert`, defval: 'On', options: ['On', 'Off'], tooltip: ALERT_TIP, group: 'Alert' },
  ]),
  ...KINDS.flatMap((k): InputConfig[] => [
    { id: `show${k.key}`, type: 'bool', title: k.show, defval: true, group: k.group, ...(k.key === 'MjExUp' ? { inline: 'MjExUp' } : {}) },
    { id: `deletePre${k.key}`, type: 'bool', title: k.del, defval: true, group: k.group },
    { id: `color${k.key}`, type: 'color', title: 'Color', defval: k.color, group: k.group },
    { id: `style${k.key}`, type: 'string', title: 'Style', defval: k.style, options: ['solid', 'dashed', 'dotted'], group: k.group },
    { id: `extend${k.key}`, type: 'string', title: 'Extend', defval: 'none', options: ['none', 'both', 'right', 'left'], group: k.group },
    { id: `width${k.key}`, type: 'int', title: 'Width', defval: k.width, group: k.group },
  ]),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Auto TrendLines [TradingFinder] Support Resistance Signal Alerts',
  shortTitle: 'Auto TrendLines TFlab',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const neq = (a: number, b: number) => Math.abs(a - b) > EPS; // na compares false

const RED = '#F23645';
const GREEN = '#4CAF50';

/** `line.get_price(l, x)`; na for an na line (a `var line` not set yet) */
const getPrice = (l: Line | undefined, x: number): number => (l ? line.get_price(l, x) : NaN);

/** `str.substring(s, begin)` (na string: na) */
const substr = (s: string | undefined, begin: number) => (s === undefined ? undefined : s.substring(begin));

export function calculate(
  bars: Bar[],
  inputs: Partial<AutoTrendlinesSupportResistanceSignalInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; markers: MarkerData[] } {
  const cfg = { ...defaultInputs, ...inputs } as AutoTrendlinesSupportResistanceSignalInputs;
  const PP = Math.trunc(cfg.PP);
  const nBars = bars.length;
  const lastConfirmed = lastBarConfirmedOf(chart);

  const highPivot = ta.pivothigh(new Series(bars, (b) => b.high), PP, PP).toArray().map((v) => v ?? NaN);
  const lowPivot = ta.pivotlow(new Series(bars, (b) => b.low), PP, PP).toArray().map((v) => v ?? NaN);

  resetDrawings({ line: 500, label: 500, box: 500 });

  // ZZ() state
  const ArrayType: string[] = [];
  const ArrayValue: number[] = [];
  const ArrayIndex: number[] = [];
  const ArrayTypeAdv: string[] = [];
  const ArrayValueAdv: number[] = [];
  const ArrayIndexAdv: number[] = [];
  let HighValue = NaN;
  let LowValue = NaN;
  let HighIndex = NaN;
  let LowIndex = NaN;
  let Major_HighLevel = NaN;
  let Major_LowLevel = NaN;
  let Lock0 = true;
  let Lock1 = true;
  // history of `ArrayValue.get(last)` (block `ArrayValue.size() > 1`: runs on every bar once the zig zag has 2 points)
  let prevLastValue = NaN;
  // History of `ArrayType.get(ArrayType.size() - 1)`, read with [1] in the block that runs when the last zig zag value
  // changes. Measured on the reference runs (probe plots of x_0, t_0 and the list sizes, equal on every bar): the two
  // identical expressions of that block share one history, which keeps the value of the last bar where the block ran
  // (not na on the bars where it did not run); before the first run it is na, and `na != "x"` is true.
  let prevLastType: string | undefined;

  // global var x_0 / y_0 / t_0
  let x_0 = 0;
  let y_0 = 0;
  let t_0 = '';
  let prevT0: string | undefined; // t_0[1] (na on the first bar)

  // Pointer() state per call
  const pointers = KINDS.map(() => ({ X_0: 0, Y_0: 0, X_1: 0, Y_1: 0 }));

  // Correction_Checker() state per call
  const checkers = KINDS.map(() => ({
    Line_Origin: undefined as Line | undefined,
    Line_Sub: undefined as Line | undefined,
    Permit: true,
    Permit_set: true,
    prevX0: NaN, // X_0[1]
    prevLineOrigin: undefined as Line | undefined, // Line_Origin[1]
    prevPermitSet: undefined as boolean | undefined, // Permit_set[1] (na on the first bar)
  }));

  const markers: MarkerData[] = [];
  const last = <T>(a: T[]) => a[a.length - 1];

  for (let i = 0; i < nBars; i++) {
    setDrawingBar(i, i === nBars - 1);
    const bar = bars[i];
    const close = bar.close;
    const confirmed = i < nBars - 1 || lastConfirmed;

    // ---------------- ZZ(PP)
    const HP = highPivot[i];
    const LP = lowPivot[i];
    const isHP = !Number.isNaN(HP) && HP !== 0;
    const isLP = !Number.isNaN(LP) && LP !== 0;
    if (isHP) {
      HighValue = bars[i - PP].high;
      HighIndex = i - PP;
    }
    if (isLP) {
      LowValue = bars[i - PP].low;
      LowIndex = i - PP;
    }
    const size = () => ArrayType.length;
    const removeLast = () => {
      ArrayType.pop();
      ArrayValue.pop();
      ArrayIndex.pop();
    };
    // array.push(ArrayType, size > 2 ? ArrayValue.get(size - 2) < V ? 'HH' / 'HL' : 'LH' / 'LL' : 'H' / 'L')
    const pushHigh = () => {
      ArrayType.push(size() > 2 ? (lt(ArrayValue[size() - 2], HighValue) ? 'HH' : 'LH') : 'H');
      ArrayValue.push(HighValue);
      ArrayIndex.push(HighIndex);
    };
    const pushLow = () => {
      ArrayType.push(size() > 2 ? (lt(ArrayValue[size() - 2], LowValue) ? 'HL' : 'LL') : 'L');
      ArrayValue.push(LowValue);
      ArrayIndex.push(LowIndex);
    };

    if (isHP && isLP) {
      if (size() >= 1) {
        const t = last(ArrayType);
        const v = ArrayValue[size() - 1];
        if (t === 'L' || t === 'LL') {
          if (lt(LP, v)) {
            removeLast();
            pushLow();
          } else {
            pushHigh();
          }
        } else if (t === 'H' || t === 'HH') {
          if (gt(HP, v)) {
            removeLast();
            pushHigh();
          } else {
            pushLow();
          }
        } else if (t === 'LH') {
          if (lt(HP, v)) {
            pushLow();
          } else if (gt(HP, v)) {
            if (lt(close, v)) {
              removeLast();
              pushHigh();
            } else if (gt(close, v)) {
              pushLow();
            }
          }
        } else if (t === 'HL') {
          if (gt(LP, v)) {
            pushHigh();
          } else if (lt(LP, v)) {
            if (gt(close, v)) {
              removeLast();
              pushLow();
            } else if (lt(close, v)) {
              pushHigh();
            }
          }
        }
      }
    } else if (isHP) {
      if (size() === 0) {
        ArrayType.unshift('H');
        ArrayValue.unshift(HighValue);
        ArrayIndex.unshift(HighIndex);
      } else {
        const t = last(ArrayType);
        if (t === 'L' || t === 'HL' || t === 'LL') {
          const v = ArrayValue[size() - 1];
          if (gt(HP, v)) {
            pushHigh();
          } else if (lt(HP, v)) {
            removeLast();
            pushLow();
          }
        } else if (t === 'H' || t === 'HH' || t === 'LH') {
          if (lt(last(ArrayValue), HighValue)) {
            removeLast();
            pushHigh();
          }
        }
      }
    } else if (isLP) {
      if (size() === 0) {
        ArrayType.unshift('L');
        ArrayValue.unshift(LowValue);
        ArrayIndex.unshift(LowIndex);
      } else {
        const t = last(ArrayType);
        if (t === 'H' || t === 'HH' || t === 'LH') {
          const v = ArrayValue[size() - 1];
          if (lt(LP, v)) {
            pushLow();
          } else if (gt(LP, v)) {
            removeLast();
            pushHigh();
          }
        } else if (t === 'L' || t === 'HL' || t === 'LL') {
          if (gt(last(ArrayValue), LowValue)) {
            removeLast();
            pushLow();
          }
        }
      }
    }

    // first Major detector
    if (size() === 2) {
      if (ArrayType[0] === 'H') {
        Major_HighLevel = ArrayValue[0];
        Major_LowLevel = ArrayValue[1];
      } else if (ArrayType[0] === 'L') {
        Major_HighLevel = ArrayValue[1];
        Major_LowLevel = ArrayValue[0];
      }
    }

    // copies of the arrays
    if (ArrayValue.length === 1 && Lock0) {
      ArrayTypeAdv.splice(0, 0, 'M' + ArrayType[0]);
      ArrayValueAdv.splice(0, 0, ArrayValue[0]);
      ArrayIndexAdv.splice(0, 0, ArrayIndex[0]);
      Lock0 = false;
    }
    if (ArrayValue.length === 2 && Lock1) {
      ArrayTypeAdv.splice(1, 0, 'M' + ArrayType[1]);
      ArrayValueAdv.splice(1, 0, ArrayValue[1]);
      ArrayIndexAdv.splice(1, 0, ArrayIndex[1]);
      Lock1 = false;
    }

    if (ArrayValue.length > 1) {
      const lastValue = last(ArrayValue);
      const prev = prevLastValue;
      prevLastValue = lastValue;
      if (neq(prev, lastValue)) {
        const lastType = last(ArrayType);
        // str.substring(type[1], str.length(type) - 1) against str.substring(type, str.length(type) - 1)
        const begin = lastType.length - 1;
        const cur = substr(lastType, begin);
        const prevPart = substr(prevLastType, begin);
        prevLastType = lastType;
        if (prevPart !== cur) {
          // a new point (or no history yet): a minor point
          ArrayTypeAdv.push('m' + lastType);
          ArrayValueAdv.push(lastValue);
          ArrayIndexAdv.push(last(ArrayIndex));
        } else {
          // the last point moved: its value and bar
          ArrayValueAdv.pop();
          ArrayIndexAdv.pop();
          ArrayValueAdv.push(lastValue);
          ArrayIndexAdv.push(last(ArrayIndex));
        }
      }
    } else {
      prevLastValue = NaN;
    }

    // all Major & Minor pivots
    if (ArrayValueAdv.length > 1) {
      const nA = () => ArrayTypeAdv.length;
      const setLast = (t: string) => {
        ArrayTypeAdv.pop();
        ArrayTypeAdv.push(t);
      };
      const setBeforeLast = (t: string) => {
        ArrayTypeAdv.splice(nA() - 2, 1);
        ArrayTypeAdv.splice(ArrayValueAdv.length - 2, 0, t);
      };
      const lastT = () => ArrayTypeAdv[nA() - 1];
      const lastV = () => ArrayValueAdv[ArrayValueAdv.length - 1];
      const zzLast = () => 'M' + ArrayType[ArrayType.length - 1];
      const zzBeforeLast = () => 'M' + ArrayType[ArrayType.length - 2];

      // High Major detector
      if (gt(close, Major_HighLevel)) {
        const t = lastT();
        if (t === 'mL') {
          setLast('ML');
          Major_LowLevel = lastV();
        } else if (t === 'mHL' || t === 'mLL') {
          setLast(zzLast());
          Major_LowLevel = lastV();
        } else if (t === 'mLH' || t === 'mHH' || t === 'MLH' || t === 'MHH') {
          const t2 = ArrayTypeAdv[nA() - 2];
          if (t2 === 'mHL' || t2 === 'mLL') {
            setBeforeLast(zzBeforeLast());
            Major_LowLevel = ArrayValueAdv[ArrayValueAdv.length - 2];
          }
        }
      }
      if (gt(lastV(), Major_HighLevel)) {
        const t = lastT();
        if (t === 'mH') {
          setLast('MH');
          Major_HighLevel = lastV();
        } else if (t === 'mLH' || t === 'mHH' || t === 'MHH') {
          setLast(zzLast());
          Major_HighLevel = lastV();
        }
      }
      // Low Major detector
      if (lt(close, Major_LowLevel)) {
        const t = lastT();
        if (t === 'mH') {
          setLast('MH');
          Major_HighLevel = lastV();
        } else if (t === 'mLH' || t === 'mHH') {
          setLast(zzLast());
          Major_HighLevel = lastV();
        } else if (t === 'mHL' || t === 'mLL' || t === 'MHL' || t === 'MLL') {
          const t2 = ArrayTypeAdv[nA() - 2];
          if (t2 === 'mLH' || t2 === 'mHH') {
            setBeforeLast(zzBeforeLast());
            Major_HighLevel = ArrayValueAdv[ArrayValueAdv.length - 2];
          }
        }
      }
      if (lt(lastV(), Major_LowLevel)) {
        const t = lastT();
        if (t === 'mL') {
          setLast('ML');
          Major_LowLevel = lastV();
        } else if (t === 'mHL' || t === 'mLL' || t === 'MLL') {
          setLast(zzLast());
          Major_LowLevel = lastV();
        }
      }
    }

    // ---------------- global x_0 / y_0 / t_0
    if (ArrayTypeAdv.length > 2) {
      x_0 = ArrayIndexAdv[ArrayTypeAdv.length - 1];
      y_0 = ArrayValueAdv[ArrayTypeAdv.length - 1];
      t_0 = ArrayTypeAdv[ArrayTypeAdv.length - 1];
    }
    const t0Changed = prevT0 === undefined || t_0 !== prevT0;
    prevT0 = t_0;

    // ---------------- Pointer() and Correction_Checker() of each type
    KINDS.forEach((k, idx) => {
      const p = pointers[idx];
      if (t0Changed && t_0 === k.point) {
        if (p.X_0 === 0) {
          p.X_0 = x_0;
          p.Y_0 = y_0;
        } else if (p.X_1 === 0) {
          p.X_1 = x_0;
          p.Y_1 = y_0;
        } else {
          p.X_0 = p.X_1;
          p.Y_0 = p.Y_1;
          p.X_1 = x_0;
          p.Y_1 = y_0;
        }
      }
      const { X_0, Y_0, X_1, Y_1 } = p;
      const c = checkers[idx];
      const up = k.up;
      const show = cfg[`show${k.key}`];
      const deletePre = cfg[`deletePre${k.key}`];

      if (X_0 !== 0 && X_1 !== 0 && neq(X_0, c.prevX0)) {
        if (up ? gt(Y_1, Y_0) : lt(Y_1, Y_0)) {
          c.Line_Sub = line.new(X_0, Y_0, X_1, Y_1, 'bar_index', 'none', 'transparent');
        }
        for (let j = 1; j <= i - X_0; j++) {
          const cl = bars[i - (i - X_0 - j)].close;
          const price = getPrice(c.Line_Sub, X_0 + j);
          c.Permit = (up ? gt(cl, price) : lt(cl, price)) && c.Permit;
        }
        if (c.Permit) {
          if (show) {
            c.Line_Origin = line.new(X_0, Y_0, X_1, Y_1, 'bar_index', cfg[`extend${k.key}`], cfg[`color${k.key}`],
              cfg[`style${k.key}`], cfg[`width${k.key}`]);
          }
          if (c.Line_Sub) line.delete(c.Line_Sub);
          if (deletePre && c.prevLineOrigin) line.delete(c.prevLineOrigin);
          c.Permit_set = true;
        } else if (c.Line_Sub) {
          line.delete(c.Line_Sub);
        }
        c.Permit = true; // X_0 != X_0[1] is true here
      }
      const priceNow = getPrice(c.Line_Origin, i);
      if ((up ? gt(close, priceNow) : lt(close, priceNow)) && c.Permit_set) {
        line.set_xy2(c.Line_Origin!, i + 1, getPrice(c.Line_Origin, i + 1));
      } else {
        c.Permit_set = false;
      }

      const alertBreak = confirmed && c.prevPermitSet === true && !c.Permit_set;
      const p2 = getPrice(c.Line_Origin, i);
      const alertReact = (up && gt(close, p2) && lt(bar.low, p2) && confirmed && c.Permit_set)
        || (!up && lt(close, p2) && gt(bar.high, p2) && confirmed && c.Permit_set);

      // plotshape: an up line breaks downwards (red triangle above the bar), a down line upwards (green below).
      // Output ids: Break / React of each kind in the original's declaration order (shape<2 idx> / shape<2 idx + 1>)
      if (alertBreak) {
        const id = `shape${2 * idx}`;
        markers.push(up
          ? { id, time: bar.time, position: 'aboveBar', shape: 'triangleDown', color: RED, size: 'tiny' }
          : { id, time: bar.time, position: 'belowBar', shape: 'triangleUp', color: GREEN, size: 'tiny' });
      }
      if (alertReact) {
        const id = `shape${2 * idx + 1}`;
        markers.push(up
          ? { id, time: bar.time, position: 'belowBar', shape: 'triangleUp', color: GREEN, size: 'tiny' }
          : { id, time: bar.time, position: 'aboveBar', shape: 'triangleDown', color: RED, size: 'tiny' });
      }

      c.prevX0 = X_0;
      c.prevLineOrigin = c.Line_Origin;
      c.prevPermitSet = c.Permit_set;
    });
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    lines: line.all().filter((l) => ![l.x1, l.y1, l.x2, l.y2].some((v) => Number.isNaN(v))).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
      width: l.width ?? 1, style: (l.style ?? 'solid') as LineStyle, extend: l.extend,
    })),
  };
}

export const AutoTrendlinesSupportResistanceSignal = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
