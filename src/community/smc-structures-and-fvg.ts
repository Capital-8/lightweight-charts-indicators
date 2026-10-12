/**
 * SMC Structures and FVG
 *
 * Market structure: the script follows a structure high and a structure low. A break of the structure low (by the
 * close, or by the low when "Break with candle's body" is off) draws a line from the bar of the low to the break
 * bar: "BOS" when the structure was already bearish, "CHoCH" when it changes direction. The new structure high is
 * then the oldest local high inside the range of the highest bar of the last 10 bars. A break of the structure high
 * is the mirror case. Between two breaks the structure high (in a bullish or new structure) or the structure low
 * moves with the price while the level is less than 4 bars old. Only the last "Number of break to show" breaks are
 * kept.
 *
 * Current structure: one line for the structure high, one for the structure low, and up to 5 retracement levels of
 * the range between them (line and a text label 20 bars after the last bar).
 *
 * Fair value gaps: a gap between the high of 3 bars back and the low of the bar before (bullish), or between the low
 * of 3 bars back and the high of the bar before (bearish), gives a box with the text "FVG". The box grows to the
 * current bar, takes the mitigated colour once the price enters it and is removed once the price has filled it.
 *
 * At most 50 lines and 50 labels are kept: with high "Number of break to show" / "Number of FVG to show" values the
 * oldest ones are removed first.
 *
 * The functions of the imported library "Drawings_public" by LudoGH68 (delete_line) are written in this file.
 *
 * Reference: "SMC Structures and FVG" by LudoGH68
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LudoGH68
 */

import { str, color, callsite, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

type LineOption = '─' | '┈' | '╌';

export interface SmcStructuresAndFvgInputs {
  isFvgToShow: boolean;
  bullishFvgColor: string;
  bearishFvgColor: string;
  mitigatedFvgColor: string;
  /** Number of fair value gaps kept (one more is kept before the oldest is removed) */
  fvgHistoryNbr: number;
  /** Move the edge of a mitigated gap to the price */
  isMitigatedFvgToReduce: boolean;
  /** A break needs a close beyond the level (else the high / low) */
  isStructBodyCandleBreak: boolean;
  isCurrentStructToShow: boolean;
  bullishBosColor: string;
  bearishBosColor: string;
  bosLineStyleOption: LineOption;
  bosLineWidth: number;
  bullishChochColor: string;
  bearishChochColor: string;
  chochLineStyleOption: LineOption;
  chochLineWidth: number;
  currentStructColor: string;
  currentStructLineStyleOption: LineOption;
  currentStructLineWidth: number;
  /** Number of breaks kept */
  structHistoryNbr: number;
  isFibo1ToShow: boolean;
  fibo1Value: number;
  fibo1Color: string;
  fibo1StyleOption: LineOption;
  fibo1LineWidth: number;
  isFibo2ToShow: boolean;
  fibo2Value: number;
  fibo2Color: string;
  fibo2StyleOption: LineOption;
  fibo2LineWidth: number;
  isFibo3ToShow: boolean;
  fibo3Value: number;
  fibo3Color: string;
  fibo3StyleOption: LineOption;
  fibo3LineWidth: number;
  isFibo4ToShow: boolean;
  fibo4Value: number;
  fibo4Color: string;
  fibo4StyleOption: LineOption;
  fibo4LineWidth: number;
  isFibo5ToShow: boolean;
  fibo5Value: number;
  fibo5Color: string;
  fibo5StyleOption: LineOption;
  fibo5LineWidth: number;
}

export const defaultInputs: SmcStructuresAndFvgInputs = {
  isFvgToShow: true,
  bullishFvgColor: 'rgba(76, 175, 80, 0.5)',
  bearishFvgColor: 'rgba(255, 82, 82, 0.5)',
  mitigatedFvgColor: 'rgba(120, 123, 134, 0.5)',
  fvgHistoryNbr: 5,
  isMitigatedFvgToReduce: false,
  isStructBodyCandleBreak: true,
  isCurrentStructToShow: true,
  bullishBosColor: '#B2B5BE',
  bearishBosColor: '#B2B5BE',
  bosLineStyleOption: '─',
  bosLineWidth: 1,
  bullishChochColor: '#FFEB3B',
  bearishChochColor: '#FFEB3B',
  chochLineStyleOption: '─',
  chochLineWidth: 1,
  currentStructColor: '#2962FF',
  currentStructLineStyleOption: '─',
  currentStructLineWidth: 1,
  structHistoryNbr: 10,
  isFibo1ToShow: true,
  fibo1Value: 0.786,
  fibo1Color: '#64B5F6',
  fibo1StyleOption: '─',
  fibo1LineWidth: 1,
  isFibo2ToShow: true,
  fibo2Value: 0.705,
  fibo2Color: '#F23645',
  fibo2StyleOption: '─',
  fibo2LineWidth: 1,
  isFibo3ToShow: true,
  fibo3Value: 0.618,
  fibo3Color: '#089981',
  fibo3StyleOption: '─',
  fibo3LineWidth: 1,
  isFibo4ToShow: true,
  fibo4Value: 0.5,
  fibo4Color: '#4CAF50',
  fibo4StyleOption: '─',
  fibo4LineWidth: 1,
  isFibo5ToShow: true,
  fibo5Value: 0.382,
  fibo5Color: '#81C784',
  fibo5StyleOption: '─',
  fibo5LineWidth: 1,
};

const LINE_OPTIONS = ['─', '┈', '╌'];
const FVG_GROUP = 'Fear Value Gap';
const STRUCT_GROUP = 'Structures';
const FIBO_GROUP = 'Structure Fibonacci';

const fiboInputs = (k: 1 | 2 | 3 | 4 | 5): InputConfig[] => [
  { id: `isFibo${k}ToShow`, type: 'bool', title: '', defval: defaultInputs[`isFibo${k}ToShow`], group: FIBO_GROUP, inline: `Fibo${k}` },
  { id: `fibo${k}Value`, type: 'float', title: '', defval: defaultInputs[`fibo${k}Value`], group: FIBO_GROUP, inline: `Fibo${k}` },
  { id: `fibo${k}Color`, type: 'color', title: '', defval: defaultInputs[`fibo${k}Color`], group: FIBO_GROUP, inline: `Fibo${k}` },
  {
    id: `fibo${k}StyleOption`, type: 'string', title: '', defval: defaultInputs[`fibo${k}StyleOption`], options: LINE_OPTIONS,
    group: FIBO_GROUP, inline: `Fibo${k}`,
  },
  {
    id: `fibo${k}LineWidth`, type: 'int', title: '', defval: defaultInputs[`fibo${k}LineWidth`], min: 1, max: 5,
    group: FIBO_GROUP, inline: `Fibo${k}`,
  },
];

export const inputConfig: InputConfig[] = [
  { id: 'isFvgToShow', type: 'bool', title: 'Display FVG', defval: true, group: FVG_GROUP },
  { id: 'bullishFvgColor', type: 'color', title: 'Bullish FVG Color', defval: 'rgba(76, 175, 80, 0.5)', group: FVG_GROUP },
  { id: 'bearishFvgColor', type: 'color', title: 'Bearish FVG Color', defval: 'rgba(255, 82, 82, 0.5)', group: FVG_GROUP },
  { id: 'mitigatedFvgColor', type: 'color', title: 'Mitigated FVG Color', defval: 'rgba(120, 123, 134, 0.5)', group: FVG_GROUP },
  { id: 'fvgHistoryNbr', type: 'int', title: 'Number of FVG to show', defval: 5, min: 1, max: 50 },
  { id: 'isMitigatedFvgToReduce', type: 'bool', title: 'Reduce mitigated FVG', defval: false, group: FVG_GROUP },
  { id: 'isStructBodyCandleBreak', type: 'bool', title: "Break with candle's body", defval: true, group: STRUCT_GROUP },
  { id: 'isCurrentStructToShow', type: 'bool', title: 'Display current structure', defval: true, group: STRUCT_GROUP },
  { id: 'bullishBosColor', type: 'color', title: 'Bullish BOS Color', defval: '#B2B5BE', group: STRUCT_GROUP },
  { id: 'bearishBosColor', type: 'color', title: 'Bearish BOS Color', defval: '#B2B5BE', group: STRUCT_GROUP },
  { id: 'bosLineStyleOption', type: 'string', title: 'BOS Style', defval: '─', options: LINE_OPTIONS, group: STRUCT_GROUP },
  { id: 'bosLineWidth', type: 'int', title: 'BOS Width', defval: 1, min: 1, max: 5, group: STRUCT_GROUP },
  { id: 'bullishChochColor', type: 'color', title: 'Bullish CHoCH Color', defval: '#FFEB3B', group: STRUCT_GROUP },
  { id: 'bearishChochColor', type: 'color', title: 'Bearish CHoCH Color', defval: '#FFEB3B', group: STRUCT_GROUP },
  { id: 'chochLineStyleOption', type: 'string', title: 'CHoCH Style', defval: '─', options: LINE_OPTIONS, group: STRUCT_GROUP },
  { id: 'chochLineWidth', type: 'int', title: 'MSB Width', defval: 1, min: 1, max: 5, group: STRUCT_GROUP },
  { id: 'currentStructColor', type: 'color', title: 'Current structure Color', defval: '#2962FF', group: STRUCT_GROUP },
  {
    id: 'currentStructLineStyleOption', type: 'string', title: 'Current structure Style', defval: '─', options: LINE_OPTIONS,
    group: STRUCT_GROUP,
  },
  { id: 'currentStructLineWidth', type: 'int', title: 'Current structure Width', defval: 1, min: 1, max: 5, group: STRUCT_GROUP },
  { id: 'structHistoryNbr', type: 'int', title: 'Number of break to show', defval: 10, min: 1, max: 50 },
  ...fiboInputs(1),
  ...fiboInputs(2),
  ...fiboInputs(3),
  ...fiboInputs(4),
  ...fiboInputs(5),
];

// plot(na)
export const plotConfig: PlotConfig[] = [{ id: 'plot0', title: 'Plot', color: '#2962FF', lineWidth: 1 }];

export const metadata = {
  title: 'SMC Structures and FVG',
  shortTitle: 'SMC Structures and FVG',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;

/** Bars looked at by get_structure_highest_bar(10) / get_structure_lowest_bar(10) */
const LOOKBACK = 10;

type Style = 'solid' | 'dashed' | 'dotted';

/** getLineStyle() */
const lineStyle = (option: LineOption): Style => (option === '┈' ? 'dotted' : option === '╌' ? 'dashed' : 'solid');

interface Ln {
  x1: number;
  x2: number;
  y: number;
  color: string;
  style: Style;
  width: number;
  deleted: boolean;
}
interface Lb {
  x: number;
  y: number;
  text: string;
  textColor: string;
  deleted: boolean;
}
interface Fvg {
  bullish: boolean;
  left: number;
  right: number;
  top: number;
  bottom: number;
  bg: string;
  border: string;
  label: Lb;
}

/** indicator() without max_lines_count / max_labels_count: 50 lines and 50 labels */
const MAX_OBJECTS = 50;

export function calculate(
  bars: Bar[],
  inputs: Partial<SmcStructuresAndFvgInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const fvgHistoryNbr = Math.trunc(cfg.fvgHistoryNbr);
  const structHistoryNbr = Math.trunc(cfg.structHistoryNbr);
  const body = cfg.isStructBodyCandleBreak;

  const H = (i: number) => (i >= 0 ? bars[i].high : NaN);
  const L = (i: number) => (i >= 0 ? bars[i].low : NaN);
  const breakHigh = (i: number) => (i >= 0 ? (body ? bars[i].close : bars[i].high) : NaN);
  const breakLow = (i: number) => (i >= 0 ? (body ? bars[i].close : bars[i].low) : NaN);

  // bar_index > lookback ? ta.highestbars(high, lookback) : ta.highestbars(high, bar_index + 1)
  // Each branch is its own call site: the first one only runs from bar 11, so its window starts there
  const extremeBars = (source: number[], site: typeof callsite.highestbars): number[] => {
    const fixed = site();
    const growing = site();
    return source.map((v, i) => (i > LOOKBACK ? fixed(i, v, LOOKBACK) : growing(i, v, i + 1)));
  };
  const maxBarArr = extremeBars(bars.map((b) => b.high), callsite.highestbars);
  const minBarArr = extremeBars(bars.map((b) => b.low), callsite.lowestbars);

  // Live lines and labels in creation order. When a creation brings the count above max + 5, the oldest are deleted
  // until max remain. An object held by a `var` variable of the script (the lines and labels of the current
  // structure) is never deleted by this limit, but it counts. A deleted object ignores later changes.
  // (Boxes: at most "Number of FVG to show" + 2 = 52 exist at a time, so their limit is never reached.)
  const held = new Set<object>();
  const registry = <T extends { deleted: boolean }>() => {
    const list: T[] = [];
    /** line.new / label.new */
    const add = (o: T): T => {
      list.push(o);
      if (list.length > MAX_OBJECTS + 5) {
        for (let k = 0; k < list.length && list.length > MAX_OBJECTS; ) {
          if (held.has(list[k])) k++;
          else list.splice(k, 1)[0].deleted = true;
        }
      }
      return o;
    };
    /** `variable := line.new(...)` of a `var` variable */
    const addHeld = (o: T): T => {
      add(o);
      held.add(o);
      return o;
    };
    /** line.delete / label.delete */
    const remove = (o: T | null) => {
      if (!o) return;
      held.delete(o);
      if (o.deleted) return;
      o.deleted = true;
      list.splice(list.indexOf(o), 1);
    };
    return { list, add, addHeld, remove };
  };
  const lines = registry<Ln>();
  const labels = registry<Lb>();

  // Fair value gaps (fvgBoxes, fvgTypes, isFvgMitigated, fvgLabels)
  const fvgs: Fvg[] = [];
  const newFvg = (i: number, bullish: boolean, top: number, bottom: number) => {
    const left = i - 2;
    const right = i - 1;
    fvgs.push({
      bullish, left, right, top, bottom,
      bg: bullish ? cfg.bullishFvgColor : cfg.bearishFvgColor,
      border: String(color.new(bullish ? '#4CAF50' : '#FF5252', 100)),
      label: labels.add({
        x: Math.ceil((left + right) / 2), y: top - (top - bottom) / 2, text: 'FVG', textColor: '#FFFFFF', deleted: false,
      }),
    });
    if (fvgs.length > fvgHistoryNbr + 1) labels.remove(fvgs.shift()!.label);
  };

  // Breaks (structureLines, structureLabels)
  const structLines: Ln[] = [];
  const structLabels: Lb[] = [];
  let structureHigh = 0;
  let structureLow = 0;
  let structureHighStartIndex = 0;
  let structureLowStartIndex = 0;
  let structureDirection = 0;
  // `var int idx` of get_structure_highest_bar() and get_structure_lowest_bar()
  let idxHigh = 0;
  let idxLow = 0;

  const addBreak = (i: number, start: number, level: number, isBos: boolean, bullish: boolean) => {
    if (structLines.length >= structHistoryNbr) {
      lines.remove(structLines.shift()!);
      labels.remove(structLabels.shift()!);
    }
    const css = isBos ? (bullish ? cfg.bullishBosColor : cfg.bearishBosColor) : bullish ? cfg.bullishChochColor : cfg.bearishChochColor;
    structLines.push(lines.add({
      x1: start, x2: i, y: level, color: css,
      style: lineStyle(isBos ? cfg.bosLineStyleOption : cfg.chochLineStyleOption),
      width: isBos ? cfg.bosLineWidth : cfg.chochLineWidth,
      deleted: false,
    }));
    structLabels.push(labels.add({ x: (i + start) / 2, y: level, text: isBos ? 'BOS' : 'CHoCH', textColor: css, deleted: false }));
  };

  // Current structure (structureHighLine, structureLowLine, fibo1Line ... fibo5Line, fibo1Label ... fibo5Label)
  const structStyle = lineStyle(cfg.currentStructLineStyleOption);
  let structureHighLine: Ln | null = null;
  let structureLowLine: Ln | null = null;
  const fibos = [
    { show: cfg.isFibo1ToShow, value: cfg.fibo1Value, css: cfg.fibo1Color, style: lineStyle(cfg.fibo1StyleOption), width: cfg.fibo1LineWidth },
    { show: cfg.isFibo2ToShow, value: cfg.fibo2Value, css: cfg.fibo2Color, style: lineStyle(cfg.fibo2StyleOption), width: cfg.fibo2LineWidth },
    { show: cfg.isFibo3ToShow, value: cfg.fibo3Value, css: cfg.fibo3Color, style: lineStyle(cfg.fibo3StyleOption), width: cfg.fibo3LineWidth },
    { show: cfg.isFibo4ToShow, value: cfg.fibo4Value, css: cfg.fibo4Color, style: lineStyle(cfg.fibo4StyleOption), width: cfg.fibo4LineWidth },
    { show: cfg.isFibo5ToShow, value: cfg.fibo5Value, css: cfg.fibo5Color, style: lineStyle(cfg.fibo5StyleOption), width: cfg.fibo5LineWidth },
  ].map((f) => ({ ...f, line: null as Ln | null, label: null as Lb | null }));

  for (let i = 0; i < n; i++) {
    const b = bars[i];

    // Fair value gaps
    if (cfg.isFvgToShow) {
      if (lt(H(i - 3), L(i - 1))) newFvg(i, true, L(i - 1), H(i - 3));
      if (gt(L(i - 3), H(i - 1))) newFvg(i, false, L(i - 3), H(i - 1));
    }
    // FVGDraw(): `for [index, value] in _boxes`; a removal inside the loop skips the element after the removed one
    for (let index = 0; index < fvgs.length; index++) {
      const f = fvgs[index];
      if (f.bullish ? le(b.low, f.bottom) : ge(b.high, f.top)) {
        labels.remove(f.label);
        fvgs.splice(index, 1);
        continue;
      }
      if (f.bullish ? lt(b.low, f.top) : gt(b.high, f.bottom)) {
        f.bg = cfg.mitigatedFvgColor;
        if (cfg.isMitigatedFvgToReduce) {
          if (f.bullish) f.top = b.low;
          else f.bottom = b.high;
        }
      }
      f.right = i;
      if (!f.label.deleted) {
        f.label.x = (f.left + f.right) / 2;
        f.label.y = f.top - (f.top - f.bottom) / 2;
      }
    }

    // Structures
    if (i === 0) {
      structureHighStartIndex = 0;
      structureLowStartIndex = 0;
      structureHigh = b.high;
      structureLow = b.low;
    }

    // get_structure_highest_bar(10): the oldest local high that is not older than the highest bar
    const maxBar = maxBarArr[i];
    for (let k = 0; k < LOOKBACK; k++) {
      if (gt(H(i - k - 1), H(i - k - 2)) && le(H(i - k), H(i - k - 1)) && -(k + 1) >= maxBar) idxHigh = -(k + 1);
    }
    idxHigh = idxHigh === 0 ? maxBar : idxHigh;
    const structureMaxBar = i + idxHigh;
    // get_structure_lowest_bar(10)
    const minBar = minBarArr[i];
    for (let k = 0; k < LOOKBACK; k++) {
      if (lt(L(i - k - 1), L(i - k - 2)) && ge(L(i - k), L(i - k - 1)) && -(k + 1) >= minBar) idxLow = -(k + 1);
    }
    idxLow = idxLow === 0 ? minBar : idxLow;
    const structureMinBar = i + idxLow;

    // bar_index[3] is na on the first 3 bars: the comparison is false
    const oldLow = i >= 3 && i - 3 > structureLowStartIndex;
    const oldHigh = i >= 3 && i - 3 > structureHighStartIndex;
    const lowBroken =
      (lt(breakLow(i), structureLow) && ge(breakLow(i - 1), structureLow) && ge(breakLow(i - 2), structureLow) &&
        ge(breakLow(i - 3), structureLow) && oldLow) ||
      (structureDirection === 2 && lt(breakLow(i), structureLow));
    const highBroken =
      (gt(breakHigh(i), structureHigh) && le(breakHigh(i - 1), structureHigh) && le(breakHigh(i - 2), structureHigh) &&
        le(breakHigh(i - 3), structureHigh) && oldHigh) ||
      (structureDirection === 1 && gt(breakHigh(i), structureHigh));

    if (lowBroken) {
      addBreak(i, structureLowStartIndex, structureLow, structureDirection === 1, false);
      structureDirection = 1;
      structureHighStartIndex = structureMaxBar;
      structureLowStartIndex = i;
      structureHigh = H(structureHighStartIndex);
      structureLow = b.low;
    } else if (highBroken) {
      addBreak(i, structureHighStartIndex, structureHigh, structureDirection === 2, true);
      structureDirection = 2;
      structureHighStartIndex = i;
      structureLowStartIndex = structureMinBar;
      structureHigh = b.high;
      structureLow = L(structureLowStartIndex);
    } else if (gt(b.high, structureHigh) && (structureDirection === 0 || structureDirection === 2)) {
      if (!body || !oldHigh) {
        structureHigh = b.high;
        structureHighStartIndex = i;
      }
    } else if (lt(b.low, structureLow) && (structureDirection === 0 || structureDirection === 1)) {
      if (!body || !oldLow) {
        structureLow = b.low;
        structureLowStartIndex = i;
      }
    }

    // Current structure: deleted and drawn again on every bar
    if (cfg.isCurrentStructToShow) {
      const structureRange = Math.abs(structureHigh - structureLow);
      lines.remove(structureHighLine);
      lines.remove(structureLowLine);
      structureHighLine = lines.addHeld({
        x1: structureHighStartIndex, x2: i, y: structureHigh, color: cfg.currentStructColor, style: structStyle,
        width: cfg.currentStructLineWidth, deleted: false,
      });
      structureLowLine = lines.addHeld({
        x1: structureLowStartIndex, x2: i, y: structureLow, color: cfg.currentStructColor, style: structStyle,
        width: cfg.currentStructLineWidth, deleted: false,
      });
      for (const f of fibos) {
        if (!f.show) continue;
        lines.remove(f.line);
        labels.remove(f.label);
        const price = structureDirection === 1
          ? structureHigh - (structureRange - structureRange * f.value)
          : structureLow + (structureRange - structureRange * f.value);
        const start = structureDirection === 1 ? structureHighStartIndex : structureLowStartIndex;
        f.line = lines.addHeld({ x1: start, x2: i, y: price, color: f.css, style: f.style, width: f.width, deleted: false });
        f.label = labels.addHeld({
          x: i + 20, y: price, text: `${str.tostring(f.value)}(${str.tostring(price)})`, textColor: f.css, deleted: false,
        });
      }
    }
  }

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0: bars.map((b) => ({ time: b.time, value: NaN })) },
    lines: lines.list.filter((l) => !isNaN(l.y)).map((l) => ({
      time1: T(l.x1), price1: l.y, time2: T(l.x2), price2: l.y, color: l.color,
      ...(l.style !== 'solid' ? { style: l.style } : {}),
      ...(l.width !== 1 ? { width: l.width } : {}),
    })),
    boxes: fvgs.map((f) => ({
      time1: T(f.left), price1: f.top, time2: T(f.right), price2: f.bottom, bgColor: f.bg, borderColor: f.border,
    })),
    // a label x between two bars is drawn on the bar before
    labels: labels.list.map((l) => ({
      time: T(Math.trunc(l.x)), price: l.y, text: l.text, textColor: l.textColor, style: 'none' as const,
    })),
  };
}

export const SmcStructuresAndFvg = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
