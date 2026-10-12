/**
 * Market Structures + ZigZag (CHoCH/BOS - MSS/MSB)
 *
 * A zigzag of pivot highs and lows (`Pivot Period` bars on each side): each new pivot either starts a new leg or
 * replaces the last point when it extends it, and the points are named H / L, then HH / LH / HL / LL against the
 * point two places before. A second list keeps the structure points: a point starts as a minor point ("m") and
 * becomes a major point ("M") when the close breaks the major high or low, or when the point itself goes beyond it.
 * The major high and low are the external structure, the latest pair of minor points inside it the internal one.
 *
 * A close crossing over the major high gives a bullish break of structure (BoS) while the external trend is up or not
 * set, and a change of character (ChoCh) while it is down; a close crossing under the major low gives the bearish
 * signals. Each signal draws a line from the broken point to the bar and a label in the middle ("Major BoS",
 * "Major ChoCh"). The internal (minor) signals use a close beyond the minor levels and are hidden by default. The
 * zigzag is drawn with lines (and optional labels with the point names). The original computes more pivot
 * bookkeeping that it does not draw; the port leaves it out.
 *
 * Reference: "Market Structures + ZigZag [TradingFinder] CHoCH/BOS - MSS/MSB" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, Series, callsite, line, label, resetDrawings, setDrawingBar, varDrawing,
  type Line, type Label, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

type LineStyle = 'solid' | 'dotted' | 'dashed';
type OnOff = 'On' | 'Off';

export interface MarketStructuresZigzagChochBosMssMsbInputs {
  PP: number;
  ShZ: boolean;
  ZLS: LineStyle;
  ZLC: string;
  ZLW: number;
  ShL: boolean;
  LC: string;
  MajorBuBoSLine_Show: OnOff;
  MajorBuBoSLine_Style: LineStyle;
  MajorBuBoSLine_Color: string;
  MajorBeBoSLine_Show: OnOff;
  MajorBeBoSLine_Style: LineStyle;
  MajorBeBoSLine_Color: string;
  MinorBuBoSLine_Show: OnOff;
  MinorBuBoSLine_Style: LineStyle;
  MinorBuBoSLine_Color: string;
  MinorBeBoSLine_Show: OnOff;
  MinorBeBoSLine_Style: LineStyle;
  MinorBeBoSLine_Color: string;
  MajorBuChoChLine_Show: OnOff;
  MajorBuChoChLine_Style: LineStyle;
  MajorBuChoChLine_Color: string;
  MajorBeChoChLine_Show: OnOff;
  MajorBeChoChLine_Style: LineStyle;
  MajorBeChoChLine_Color: string;
  MinorBuChoChLine_Show: OnOff;
  MinorBuChoChLine_Style: LineStyle;
  MinorBuChoChLine_Color: string;
  MinorBeChoChLine_Show: OnOff;
  MinorBeChoChLine_Style: LineStyle;
  MinorBeChoChLine_Color: string;
}

export const defaultInputs: MarketStructuresZigzagChochBosMssMsbInputs = {
  PP: 5,
  ShZ: true,
  ZLS: 'solid',
  ZLC: '#2484BB',
  ZLW: 1,
  ShL: false,
  LC: '#0A378A',
  MajorBuBoSLine_Show: 'On',
  MajorBuBoSLine_Style: 'solid',
  MajorBuBoSLine_Color: '#0B5FCC',
  MajorBeBoSLine_Show: 'On',
  MajorBeBoSLine_Style: 'solid',
  MajorBeBoSLine_Color: '#C07B05',
  MinorBuBoSLine_Show: 'Off',
  MinorBuBoSLine_Style: 'dashed',
  MinorBuBoSLine_Color: '#363A45',
  MinorBeBoSLine_Show: 'Off',
  MinorBeBoSLine_Style: 'dashed',
  MinorBeBoSLine_Color: '#363A45',
  MajorBuChoChLine_Show: 'On',
  MajorBuChoChLine_Style: 'solid',
  MajorBuChoChLine_Color: '#057718',
  MajorBeChoChLine_Show: 'On',
  MajorBeChoChLine_Style: 'solid',
  MajorBeChoChLine_Color: '#86173A',
  MinorBuChoChLine_Show: 'Off',
  MinorBuChoChLine_Style: 'dashed',
  MinorBuChoChLine_Color: '#363A45',
  MinorBeChoChLine_Show: 'Off',
  MinorBeChoChLine_Style: 'dashed',
  MinorBeChoChLine_Color: '#363A45',
};

const ON_OFF = ['On', 'Off'];
const STYLES = ['solid', 'dashed', 'dotted'];
/** Show / style / colour inputs of one signal line group */
const lineGroup = (key: string, name: string, group: string, d: MarketStructuresZigzagChochBosMssMsbInputs): InputConfig[] => {
  const rec = d as unknown as Record<string, string>;
  const [show, style, col] = name.split('|');
  return [
    { id: `${key}_Show`, type: 'string', title: show, defval: rec[`${key}_Show`], options: ON_OFF, group },
    { id: `${key}_Style`, type: 'string', title: style, defval: rec[`${key}_Style`], options: STYLES, group },
    { id: `${key}_Color`, type: 'color', title: col, defval: rec[`${key}_Color`], group },
  ];
};

export const inputConfig: InputConfig[] = [
  { id: 'PP', type: 'int', title: 'Pivot Period of Order Blocks Detector', defval: 5, min: 1, group: 'Logic Parameter' },
  { id: 'ShZ', type: 'bool', title: 'Show Zig Zag Line', defval: true, group: 'Zig Zag Line' },
  { id: 'ZLS', type: 'string', title: 'Zig Zag Line Style', defval: 'solid', options: ['solid', 'dotted', 'dashed'], group: 'Zig Zag Line' },
  { id: 'ZLC', type: 'color', title: 'Zig Zag Line Color', defval: '#2484BB', group: 'Zig Zag Line' },
  { id: 'ZLW', type: 'int', title: 'Zig Zag Line Width', defval: 1, group: 'Zig Zag Line' },
  { id: 'ShL', type: 'bool', title: 'Show Label', defval: false, group: 'Zig Zag Label' },
  { id: 'LC', type: 'color', title: 'Label Color', defval: '#0A378A', group: 'Zig Zag Label' },
  ...lineGroup('MajorBuBoSLine', 'Show Major Bullish BoS Lines|Style Major Bullish BoS Lines|Color Major Bullish BoS Lines',
    'Major Bullish "BoS" Lines', defaultInputs),
  ...lineGroup('MajorBeBoSLine', 'Show Major Bearish BoS Lines|Style Major Bearish BoS Lines|Color Major Bearish BoS Lines',
    'Major Bearish "BoS" Lines', defaultInputs),
  ...lineGroup('MinorBuBoSLine', 'Show Minor Bullish BoS  Lines|Style Minor Bullish BoS  Lines|Color Minor Bullish BoS  Lines',
    'Minor Bullish "BoS"  Lines', defaultInputs),
  ...lineGroup('MinorBeBoSLine', 'Show Minor Bearish BoS Lines|Style inor Bearish BoS Lines|Color inor Bearish BoS Lines',
    'Minor Bearish "BoS" Lines', defaultInputs),
  ...lineGroup('MajorBuChoChLine', 'Show Major Bullish ChoCh Lines|Style Major Bullish ChoCh Lines|Color Major Bullish ChoCh Lines',
    'Major Bullish "ChoCh" Lines', defaultInputs),
  ...lineGroup('MajorBeChoChLine', 'Show Major Bearish ChoCh Lines|Style Major Bearish ChoCh Lines|Color Major Bearish ChoCh Lines',
    'Major Bearish "ChoCh" Lines', defaultInputs),
  ...lineGroup('MinorBuChoChLine', 'Show Minor Bullish ChoCh Lines|Style Minor Bullish ChoCh Lines|Color Minor Bullish ChoCh Lines',
    'Minor Bullish "ChoCh" Lines', defaultInputs),
  ...lineGroup('MinorBeChoChLine', 'Show Minor Bearish ChoCh Lines|Style Minor Bearish ChoCh Lines|Color Minor Bearish ChoCh Lines',
    'Minor Bearish "ChoCh" Lines', defaultInputs),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Market Structures + ZigZag [TradingFinder] CHoCH/BOS - MSS/MSB',
  shortTitle: 'Market Structure | Zig Zag TFlab',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;
/** Pine `if x` with a float x: na and 0 are false */
const truthy = (x: number) => !isNaN(x) && x !== 0;
/** Pine int `a != b`: false when one side is na */
const intNe = (a: number, b: number) => !isNaN(a) && !isNaN(b) && a !== b;

const LOW_TYPES = new Set(['L', 'LL', 'HL', 'mL', 'mLL', 'mHL', 'ML', 'MLL', 'MHL']);

export function calculate(
  bars: Bar[],
  inputs: Partial<MarketStructuresZigzagChochBosMssMsbInputs> = {},
): Omit<IndicatorResult, 'lines' | 'labels'> & { lines: LineDrawingData[]; labels: LabelData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const count = bars.length;
  const PP = Math.trunc(cfg.PP);

  const pivH = ta.pivothigh(new Series(bars, (b) => b.high), PP, PP).toArray();
  const pivL = ta.pivotlow(new Series(bars, (b) => b.low), PP, PP).toArray();

  resetDrawings({ line: 500, label: 500, box: 500 });

  // ZigZag data
  const T: string[] = [];
  const V: number[] = [];
  const X: number[] = [];
  const TA: string[] = [];
  const VA: number[] = [];
  const XA: number[] = [];
  let HighValue = NaN;
  let LowValue = NaN;
  let HighIndex = NaN;
  let LowIndex = NaN;

  // Major / minor levels
  let MajorHigh = NaN;
  let MajorLow = NaN;
  let MajorHighIdx = NaN;
  let MajorLowIdx = NaN;
  let MinorHigh = NaN;
  let MinorLow = NaN;
  let MinorHighIdx = NaN;
  let MinorLowIdx = NaN;
  let lock0 = true;
  let lock1 = true;
  let LockBreak_M = 0;
  let LockBreak_m = 0;
  let ExternalTrend = 'No Trend';
  let InternalTrend = 'No Trend';

  // History of `ArrayValue.get(size - 1)` (evaluated on every bar once the list has 2 points) and of the last point
  // name read inside the change block (`ArrayType.get(size - 1)[1]`)
  let prevLastValue = NaN;
  let prevLastType: string | null = null;

  // `var` drawing variables
  const ZZLine = varDrawing<Line>();
  const ZZLabel = varDrawing<Label>();
  const MajorLine_BoSBull = varDrawing<Line>();
  const MajorLabel_BoSBull = varDrawing<Label>();
  const MajorLine_ChoChBull = varDrawing<Line>();
  const MajorLabel_ChoChBull = varDrawing<Label>();
  const MajorLine_BoSBear = varDrawing<Line>();
  const MajorLabel_BoSBear = varDrawing<Label>();
  const MajorLine_ChoChBear = varDrawing<Line>();
  const MajorLabel_ChoChBear = varDrawing<Label>();
  const MinorLine_BoSBull = varDrawing<Line>();
  const MinorLabel_BoSBull = varDrawing<Label>();
  const MinorLine_ChoChBull = varDrawing<Line>();
  const MinorLabel_ChoChBull = varDrawing<Label>();
  const MinorLine_BoSBear = varDrawing<Line>();
  const MinorLabel_BoSBear = varDrawing<Label>();
  const MinorLine_ChoChBear = varDrawing<Line>();
  const MinorLabel_ChoChBear = varDrawing<Label>();

  const crossUp = callsite.crossover();
  const crossDown = callsite.crossunder();

  const lastT = () => T[T.length - 1];
  const lastV = () => V[V.length - 1];
  const pop = () => {
    T.pop();
    V.pop();
    X.pop();
  };
  const pushH = () => {
    const t = T.length > 2 ? (lt(V[T.length - 2], HighValue) ? 'HH' : 'LH') : 'H';
    T.push(t);
    V.push(HighValue);
    X.push(HighIndex);
  };
  const pushL = () => {
    const t = T.length > 2 ? (lt(V[T.length - 2], LowValue) ? 'HL' : 'LL') : 'L';
    T.push(t);
    V.push(LowValue);
    X.push(LowIndex);
  };
  /** str.substring(s, begin): the part from `begin`; na stays na */
  const substr = (s: string | null, begin: number) => (s === null ? null : s.substring(begin));

  for (let i = 0; i < count; i++) {
    setDrawingBar(i, i === count - 1);
    const b = bars[i];
    const close = b.close;
    const HighPivot = pivH[i];
    const LowPivot = pivL[i];
    // ta.valuewhen(HighPivot, High[PP], 0), ta.valuewhen(HighPivot, Bar_Index[PP], 0)
    if (truthy(HighPivot)) {
      HighValue = bars[i - PP].high;
      HighIndex = i - PP;
    }
    if (truthy(LowPivot)) {
      LowValue = bars[i - PP].low;
      LowIndex = i - PP;
    }

    // {Zig Zag}
    if (truthy(HighPivot) && truthy(LowPivot)) {
      if (T.length >= 1) {
        const t = lastT();
        if (t === 'L' || t === 'LL') {
          if (lt(LowPivot, lastV())) {
            pop();
            pushL();
          } else {
            pushH();
          }
        } else if (t === 'H' || t === 'HH') {
          if (gt(HighPivot, lastV())) {
            pop();
            pushH();
          } else {
            pushL();
          }
        } else if (t === 'LH') {
          if (lt(HighPivot, lastV())) {
            pushL();
          } else if (gt(HighPivot, lastV())) {
            if (lt(close, lastV())) {
              pop();
              pushH();
            } else if (gt(close, lastV())) {
              pushL();
            }
          }
        } else if (t === 'HL') {
          if (gt(LowPivot, lastV())) {
            pushH();
          } else if (lt(LowPivot, lastV())) {
            if (gt(close, lastV())) {
              pop();
              pushL();
            } else if (lt(close, lastV())) {
              pushH();
            }
          }
        }
      }
    } else if (truthy(HighPivot)) {
      if (T.length === 0) {
        T.unshift('H');
        V.unshift(HighValue);
        X.unshift(HighIndex);
      } else {
        const t = lastT();
        if (t === 'L' || t === 'HL' || t === 'LL') {
          if (gt(HighPivot, lastV())) {
            pushH();
          } else if (lt(HighPivot, lastV())) {
            pop();
            pushL();
          }
        } else if (t === 'H' || t === 'HH' || t === 'LH') {
          if (lt(lastV(), HighValue)) {
            pop();
            pushH();
          }
        }
      }
    } else if (truthy(LowPivot)) {
      if (T.length === 0) {
        T.unshift('L');
        V.unshift(LowValue);
        X.unshift(LowIndex);
      } else {
        const t = lastT();
        if (t === 'H' || t === 'HH' || t === 'LH') {
          if (lt(LowPivot, lastV())) {
            pushL();
          } else if (gt(LowPivot, lastV())) {
            pop();
            pushH();
          }
        } else if (t === 'L' || t === 'HL' || t === 'LL') {
          if (gt(lastV(), LowValue)) {
            pop();
            pushL();
          }
        }
      }
    }

    // {Zig Zag Advance}: first major high and low
    if (T.length === 2) {
      if (T[0] === 'H') {
        MajorHigh = V[0];
        MajorLow = V[1];
        MajorHighIdx = X[0];
        MajorLowIdx = X[1];
      } else if (T[0] === 'L') {
        MajorHigh = V[1];
        MajorLow = V[0];
        MajorHighIdx = X[1];
        MajorLowIdx = X[0];
      }
    }

    // Copies of the first two points
    if (V.length === 1 && lock0) {
      TA.splice(0, 0, 'M' + T[0]);
      VA.splice(0, 0, V[0]);
      XA.splice(0, 0, X[0]);
      lock0 = false;
    }
    if (V.length === 2 && lock1) {
      TA.splice(1, 0, 'M' + T[1]);
      VA.splice(1, 0, V[1]);
      XA.splice(1, 0, X[1]);
      lock1 = false;
    }

    // A new or moved last point: a new minor point, or the last structure point moves with it
    if (V.length > 1) {
      const cur = lastV();
      if (ne(prevLastValue, cur)) {
        const curType = lastT();
        const a = substr(prevLastType, curType.length - 1);
        const c = curType.substring(curType.length - 1);
        if (a !== c) {
          TA.push('m' + curType);
          VA.push(cur);
          XA.push(X[X.length - 1]);
        } else {
          VA.pop();
          XA.pop();
          VA.push(cur);
          XA.push(X[X.length - 1]);
        }
        prevLastType = curType;
      }
      prevLastValue = cur;
    }

    // All major and minor pivot detector
    if (VA.length > 1) {
      const n = VA.length;
      // High major detector
      if (gt(close, MajorHigh)) {
        const t = TA[n - 1];
        if (t === 'mL') {
          TA[n - 1] = 'ML';
          MajorLow = VA[n - 1];
          MajorLowIdx = XA[n - 1];
        } else if (t === 'mHL' || t === 'mLL') {
          TA[n - 1] = 'M' + T[T.length - 1];
          MajorLow = VA[n - 1];
          MajorLowIdx = XA[n - 1];
        } else if (t === 'mLH' || t === 'mHH' || t === 'MLH' || t === 'MHH') {
          const t2 = TA[n - 2];
          if (t2 === 'mHL' || t2 === 'mLL') {
            TA[n - 2] = 'M' + T[T.length - 2];
            MajorLow = VA[n - 2];
            MajorLowIdx = XA[n - 2];
          }
        }
      }
      if (gt(VA[n - 1], MajorHigh)) {
        const t = TA[n - 1];
        if (t === 'mH') {
          TA[n - 1] = 'MH';
          MajorHigh = VA[n - 1];
          MajorHighIdx = XA[n - 1];
        } else if (t === 'mLH' || t === 'mHH' || t === 'MHH') {
          TA[n - 1] = 'M' + T[T.length - 1];
          MajorHigh = VA[n - 1];
          MajorHighIdx = XA[n - 1];
        }
      }
      // Low major detector
      if (lt(close, MajorLow)) {
        const t = TA[n - 1];
        if (t === 'mH') {
          TA[n - 1] = 'MH';
          MajorHigh = VA[n - 1];
          MajorHighIdx = XA[n - 1];
        } else if (t === 'mLH' || t === 'mHH') {
          TA[n - 1] = 'M' + T[T.length - 1];
          MajorHigh = VA[n - 1];
          MajorHighIdx = XA[n - 1];
        } else if (t === 'mHL' || t === 'mLL' || t === 'MHL' || t === 'MLL') {
          const t2 = TA[n - 2];
          if (t2 === 'mLH' || t2 === 'mHH') {
            TA[n - 2] = 'M' + T[T.length - 2];
            MajorHigh = VA[n - 2];
            MajorHighIdx = XA[n - 2];
          }
        }
      }
      if (lt(VA[n - 1], MajorLow)) {
        const t = TA[n - 1];
        if (t === 'mL') {
          TA[n - 1] = 'ML';
          MajorLow = VA[n - 1];
          MajorLowIdx = XA[n - 1];
        } else if (t === 'mHL' || t === 'mLL' || t === 'MLL') {
          TA[n - 1] = 'M' + T[T.length - 1];
          MajorLow = VA[n - 1];
          MajorLowIdx = XA[n - 1];
        }
      }
    }

    // Zigzag line (a new line on every bar; the line of the bar before is deleted when it starts at the same point)
    if (TA.length >= 2) {
      const n = XA.length;
      const X1 = XA[n - 2];
      const Y1 = VA[n - 2];
      const X2 = XA[n - 1];
      const Y2 = VA[n - 1];
      const T1 = TA[n - 1];
      const prevLine = ZZLine.value;
      const prevLabel = ZZLabel.value;
      ZZLine.value = line.new(X1, Y1, X2, Y2, 'bar_index', 'none', cfg.ShZ ? cfg.ZLC : '#FFFFFF00', cfg.ZLS, cfg.ZLW);
      if (cfg.ShL) {
        ZZLabel.value = label.new(X2, Y2, T1, 'bar_index', 'price', '#FFFFFF00',
          LOW_TYPES.has(T1) ? 'label_up' : 'label_down', cfg.LC, 'small');
      }
      if (prevLine && line.get_x1(ZZLine.value) === line.get_x1(prevLine)) {
        if (prevLabel) label.delete(prevLabel);
        line.delete(prevLine);
      }
    }

    // Detect the minor levels
    if (TA.length > 2) {
      const n = TA.length;
      const t0 = TA[n - 1];
      if (t0.indexOf('m') === 0 && TA[n - 2].indexOf('m') === 0 && TA[n - 3].indexOf('M') === 0) {
        if (t0.indexOf('H') === 2) {
          MinorHigh = VA[n - 1];
          MinorLow = VA[n - 2];
          MinorHighIdx = XA[n - 1];
          MinorLowIdx = XA[n - 2];
        } else if (t0.indexOf('L') === 2) {
          MinorHigh = VA[n - 2];
          MinorLow = VA[n - 1];
          MinorHighIdx = XA[n - 2];
          MinorLowIdx = XA[n - 1];
        }
      }
      // High minor detector
      if (gt(close, MinorHigh)) {
        if (t0 === 'mHL' || t0 === 'mLL') {
          MinorLow = VA[n - 1];
          MinorLowIdx = XA[n - 1];
        } else if (t0 === 'mLH' || t0 === 'mHH') {
          const t2 = TA[n - 2];
          if (t2 === 'mHL' || t2 === 'mLL') {
            MinorLow = VA[n - 2];
            MinorLowIdx = XA[n - 2];
          }
        }
      }
      if (gt(VA[n - 1], MinorHigh)) {
        if (t0 === 'mLH' || t0 === 'mHH') {
          MinorHigh = VA[n - 1];
          MinorHighIdx = XA[n - 1];
          MinorLow = VA[n - 2];
          MinorLowIdx = XA[n - 2];
        }
      }
      // Low minor detector
      if (lt(close, MinorLow)) {
        if (t0 === 'mLH' || t0 === 'mHH') {
          MinorHigh = VA[n - 1];
          MinorHighIdx = XA[n - 1];
        } else if (t0 === 'mHL' || t0 === 'mLL') {
          const t2 = TA[n - 2];
          if (t2 === 'mLH' || t2 === 'mHH') {
            MinorHigh = VA[n - 2];
            MinorHighIdx = XA[n - 2];
          }
        }
      }
      if (lt(VA[n - 1], MinorLow)) {
        if (t0 === 'mHL' || t0 === 'mLL') {
          MinorLow = VA[n - 1];
          MinorLowIdx = XA[n - 1];
          MinorHigh = VA[n - 2];
          MinorHighIdx = XA[n - 2];
        }
      }
      // Reset the minor levels on a major point
      if (t0.indexOf('M') === 0) {
        MinorHigh = NaN;
        MinorLow = NaN;
        MinorHighIdx = NaN;
        MinorLowIdx = NaN;
        InternalTrend = 'No Trend';
      }
    }

    // ChoCh and BoS: major
    const mid = (x: number) => Math.trunc((x + i) / 2);
    const majorUp = crossUp(close, MajorHigh);
    if (majorUp && intNe(LockBreak_M, MajorHighIdx)) {
      if (ExternalTrend === 'No Trend' || ExternalTrend === 'Up Trend') {
        LockBreak_M = MajorHighIdx;
        ExternalTrend = 'Up Trend';
        if (cfg.MajorBuBoSLine_Show === 'On') {
          MajorLine_BoSBull.value = line.new(MajorHighIdx, MajorHigh, i, MajorHigh, 'bar_index', 'none',
            cfg.MajorBuBoSLine_Color, cfg.MajorBuBoSLine_Style);
          MajorLabel_BoSBull.value = label.new(mid(MajorHighIdx), MajorHigh, 'Major BoS', 'bar_index', 'price', '#00000000',
            'label_down', cfg.MajorBuBoSLine_Color, 'normal');
        }
      } else if (ExternalTrend === 'Down Trend') {
        LockBreak_M = MajorHighIdx;
        ExternalTrend = 'Up Trend';
        if (cfg.MajorBuChoChLine_Show === 'On') {
          MajorLine_ChoChBull.value = line.new(MajorHighIdx, MajorHigh, i, MajorHigh, 'bar_index', 'none',
            cfg.MajorBuChoChLine_Color, cfg.MajorBuChoChLine_Style);
          MajorLabel_ChoChBull.value = label.new(mid(MajorHighIdx), MajorHigh, 'Major ChoCh', 'bar_index', 'price', '#00000000',
            'label_down', cfg.MajorBuChoChLine_Color, 'normal');
        }
      }
    }
    const majorDown = crossDown(close, MajorLow);
    if (majorDown && intNe(LockBreak_M, MajorLowIdx)) {
      if (ExternalTrend === 'No Trend' || ExternalTrend === 'Down Trend') {
        LockBreak_M = MajorLowIdx;
        ExternalTrend = 'Down Trend';
        if (cfg.MajorBeBoSLine_Show === 'On') {
          MajorLine_BoSBear.value = line.new(MajorLowIdx, MajorLow, i, MajorLow, 'bar_index', 'none',
            cfg.MajorBeBoSLine_Color, cfg.MajorBeBoSLine_Style);
          MajorLabel_BoSBear.value = label.new(mid(MajorLowIdx), MajorLow, 'Major BoS', 'bar_index', 'price', '#00000000',
            'label_up', cfg.MajorBeBoSLine_Color, 'normal');
        }
      } else if (ExternalTrend === 'Up Trend') {
        LockBreak_M = MajorLowIdx;
        ExternalTrend = 'Down Trend';
        if (cfg.MajorBeChoChLine_Show === 'On') {
          MajorLine_ChoChBear.value = line.new(MajorLowIdx, MajorLow, i, MajorLow, 'bar_index', 'none',
            cfg.MajorBeChoChLine_Color, cfg.MajorBeChoChLine_Style);
          MajorLabel_ChoChBear.value = label.new(mid(MajorLowIdx), MajorLow, 'Major ChoCh', 'bar_index', 'price', '#00000000',
            'label_up', cfg.MajorBeChoChLine_Color, 'normal');
        }
      }
    }

    // ChoCh and BoS: minor (a close beyond the level)
    if (lt(MinorHigh, close) && intNe(LockBreak_m, MinorHighIdx)) {
      if (InternalTrend === 'No Trend' || InternalTrend === 'Up Trend') {
        LockBreak_m = MinorHighIdx;
        InternalTrend = 'Up Trend';
        if (cfg.MinorBuBoSLine_Show === 'On') {
          MinorLine_BoSBull.value = line.new(MinorHighIdx, MinorHigh, i, MinorHigh, 'bar_index', 'none',
            cfg.MinorBuBoSLine_Color, cfg.MinorBuBoSLine_Style);
          MinorLabel_BoSBull.value = label.new(mid(MinorHighIdx), MinorHigh, 'Minor BoS', 'bar_index', 'price', '#00000000',
            'label_down', cfg.MinorBuBoSLine_Color, 'small');
        }
      } else if (InternalTrend === 'Down Trend') {
        LockBreak_m = MinorHighIdx;
        InternalTrend = 'Up Trend';
        if (cfg.MinorBuChoChLine_Show === 'On') {
          MinorLine_ChoChBull.value = line.new(MinorHighIdx, MinorHigh, i, MinorHigh, 'bar_index', 'none',
            cfg.MinorBuChoChLine_Color, cfg.MinorBuChoChLine_Style);
          MinorLabel_ChoChBull.value = label.new(mid(MinorHighIdx), MinorHigh, 'Minor ChoCh', 'bar_index', 'price', '#00000000',
            'label_down', cfg.MinorBuChoChLine_Color, 'small');
        }
      }
    }
    if (gt(MinorLow, close) && intNe(LockBreak_m, MinorLowIdx)) {
      if (InternalTrend === 'No Trend' || InternalTrend === 'Down Trend') {
        LockBreak_m = MinorLowIdx;
        InternalTrend = 'Down Trend';
        if (cfg.MinorBeBoSLine_Show === 'On') {
          MinorLine_BoSBear.value = line.new(MinorLowIdx, MinorLow, i, MinorLow, 'bar_index', 'none',
            cfg.MinorBeBoSLine_Color, cfg.MinorBeBoSLine_Style);
          MinorLabel_BoSBear.value = label.new(mid(MinorLowIdx), MinorLow, 'Minor BoS', 'bar_index', 'price', '#00000000',
            'label_up', cfg.MinorBeBoSLine_Color, 'small');
        }
      } else if (InternalTrend === 'Up Trend') {
        LockBreak_m = MinorLowIdx;
        InternalTrend = 'Down Trend';
        if (cfg.MinorBeChoChLine_Show === 'On') {
          MinorLine_ChoChBear.value = line.new(MinorLowIdx, MinorLow, i, MinorLow, 'bar_index', 'none',
            cfg.MinorBeChoChLine_Color, cfg.MinorBeChoChLine_Style);
          MinorLabel_ChoChBear.value = label.new(mid(MinorLowIdx), MinorLow, 'Minor ChoCh', 'bar_index', 'price', '#00000000',
            'label_up', cfg.MinorBeChoChLine_Color, 'small');
        }
      }
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T_ = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().map((l) => ({
      time1: T_(l.x1), price1: l.y1, time2: T_(l.x2), price2: l.y2, color: String(l.color ?? '#2962FF'),
      width: l.width ?? 1, ...(l.style && l.style !== 'solid' ? { style: l.style } : {}),
    })),
    labels: label.all().map((l) => ({
      time: T_(l.x), price: l.y, text: l.text ?? '', color: String(l.color), style: l.style as LabelData['style'],
      textColor: String(l.textcolor), size: (l.size ?? 'normal') as LabelData['size'],
    })),
  };
}

export const MarketStructuresZigzagChochBosMssMsb = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
