/**
 * ICT Anchored Market Structures with Validation
 *
 * Three nested swing levels. Short term (ST): a swing low is a bar whose low is below the low before it and not
 * above the low after it (a swing high likewise), confirmed one bar later. Intermediate term (IT): an ST swing low
 * lower than the ST swing lows on each side (and IT highs likewise); long term (LT): the same test on the IT swings.
 * Each new swing gets a label (invisible unless the "Swings" option of its term shows it; an IT or LT swing re-uses
 * the label of the ST swing and changes its text, size and colour).
 *
 * Market structure: the first close beyond the latest swing of a term draws a line from the swing to the bar, a
 * label box ("ST-BoS" for a break in the direction of the last break of that term, "ST-CHoCH" for a change of
 * direction) and a sweep box. Validation: the first later close more than ATR(17) away from the level ends the sweep
 * box; when that close is back on the other side of the level, the label becomes "STL-SWEEP" / "STH-SWEEP" (a
 * failed break). While the closes stay within the ATR band, the sweep box grows with the bars (to the high / low,
 * capped at the band).
 *
 * At most 500 lines, 500 boxes and 500 labels are kept (the oldest are deleted).
 *
 * Reference: "ICT Anchored Market Structures with Validation [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, color, line, box, label, resetDrawings, setDrawingBar,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData } from '../types';
import { barInterval, barTime } from '../bar-time';

type Size = 'Tiny' | 'Small' | 'Normal' | 'Large';
type Style = 'Solid' | 'Dashed' | 'Dotted';
type Toggle = 'Enabled' | 'Disabled';

export interface IctAnchoredMarketStructuresWithValidationInputs {
  stSwings: '⦁' | 'ST(H/L)' | 'Disabled';
  stSwingsSize: Size;
  stMarketStructures: boolean;
  stValidation: Toggle;
  stLabels: Toggle;
  stLineStyle: Style;
  stLineWidth: number;
  stBullColor: string;
  stBearColor: string;
  itSwings: '◈' | '△▽' | 'IT(H/L)' | 'Disabled';
  itSwingsSize: Size;
  itMarketStructures: boolean;
  itValidation: Toggle;
  itLabels: Toggle;
  itLineStyle: Style;
  itLineWidth: number;
  itBullColor: string;
  itBearColor: string;
  ltSwings: '◉' | '▲▼' | 'LT(H/L)' | 'Disabled';
  ltSwingsSize: Size;
  ltMarketStructures: boolean;
  ltValidation: Toggle;
  ltLabels: Toggle;
  ltLineStyle: Style;
  ltLineWidth: number;
  ltBullColor: string;
  ltBearColor: string;
}

export const defaultInputs: IctAnchoredMarketStructuresWithValidationInputs = {
  stSwings: 'Disabled',
  stSwingsSize: 'Tiny',
  stMarketStructures: true,
  stValidation: 'Enabled',
  stLabels: 'Enabled',
  stLineStyle: 'Dotted',
  stLineWidth: 1,
  stBullColor: '#089981',
  stBearColor: '#f23645',
  itSwings: 'Disabled',
  itSwingsSize: 'Small',
  itMarketStructures: true,
  itValidation: 'Enabled',
  itLabels: 'Enabled',
  itLineStyle: 'Dashed',
  itLineWidth: 1,
  itBullColor: '#089981',
  itBearColor: '#f23645',
  ltSwings: '◉',
  ltSwingsSize: 'Small',
  ltMarketStructures: true,
  ltValidation: 'Enabled',
  ltLabels: 'Enabled',
  ltLineStyle: 'Solid',
  ltLineWidth: 1,
  ltBullColor: '#089981',
  ltBearColor: '#f23645',
};

const SIZES: Size[] = ['Tiny', 'Small', 'Normal', 'Large'];
const STYLES: Style[] = ['Solid', 'Dashed', 'Dotted'];
const TOGGLE: Toggle[] = ['Enabled', 'Disabled'];
const term = (k: 'st' | 'it' | 'lt', group: string, swings: string[]): InputConfig[] => {
  const d = defaultInputs as unknown as Record<string, unknown>;
  return [
    { id: `${k}Swings`, type: 'string', title: 'Swings', defval: d[`${k}Swings`] as string, options: swings, inline: 'NA', group },
    { id: `${k}SwingsSize`, type: 'string', title: 'Size', defval: d[`${k}SwingsSize`] as string, options: SIZES, inline: 'NA', group },
    { id: `${k}MarketStructures`, type: 'bool', title: 'Market Structures', defval: true, group },
    { id: `${k}Validation`, type: 'string', title: '  Market Structure Validation', defval: 'Enabled', options: TOGGLE, group },
    { id: `${k}Labels`, type: 'string', title: '  Market Structure Labels', defval: 'Enabled', options: TOGGLE, group },
    { id: `${k}LineStyle`, type: 'string', title: '  Line Style', defval: d[`${k}LineStyle`] as string, options: STYLES, inline: 'LN', group },
    { id: `${k}LineWidth`, type: 'int', title: 'Width', defval: 1, min: 1, inline: 'LN', group },
    { id: `${k}BullColor`, type: 'color', title: 'Swing and Line Colors, Bullish', defval: '#089981', inline: 'MS', group },
    { id: `${k}BearColor`, type: 'color', title: 'Bearish', defval: '#f23645', inline: 'MS', group },
  ];
};

export const inputConfig: InputConfig[] = [
  ...term('st', 'Short Term Structures', ['⦁', 'ST(H/L)', 'Disabled']),
  ...term('it', 'Intermediate Term Structures', ['◈', '△▽', 'IT(H/L)', 'Disabled']),
  ...term('lt', 'Long Term Structures', ['◉', '▲▼', 'LT(H/L)', 'Disabled']),
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'ICT Anchored Market Structures with Validation [LuxAlgo]',
  shortTitle: 'LuxAlgo - ICT AMS',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;

/** Pine comparisons: a > b only when a - b > 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

const textSize = (s: Size) => (s === 'Tiny' ? 'tiny' : s === 'Small' ? 'small' : s === 'Normal' ? 'normal' : 'large');
const lineStyle = (s: Style) => (s === 'Dotted' ? 'dotted' as const : s === 'Dashed' ? 'dashed' as const : 'solid' as const);

/** ICTMS: the last three swings of one side of a term and its market structure objects (fields start as na) */
interface Ictms {
  lastPrice: number;
  midPrice: number;
  prevPrice: number;
  lastIndex: number;
  midIndex: number;
  prevIndex: number;
  lastLabel?: Label;
  midLabel?: Label;
  prevLabel?: Label;
  /** bool fields: null is na (false in a condition, and `not na` is false too) */
  isCrossed: boolean | null;
  isConfirmed: boolean | null;
  msLine?: Line;
  msLabel?: Box;
  swpBox?: Box;
}

const newIctms = (): Ictms => ({
  lastPrice: NaN, midPrice: NaN, prevPrice: NaN, lastIndex: NaN, midIndex: NaN, prevIndex: NaN,
  isCrossed: null, isConfirmed: null,
});

/** queryPatterns(): prev < mid and mid >= last (swing high), prev > mid and mid <= last (swing low) */
const queryPatterns = (last: number, mid: number, prev: number, isSwingHigh: boolean) =>
  (isSwingHigh ? lt(prev, mid) && le(last, mid) : gt(prev, mid) && le(mid, last));

function updatePattern(t: Ictms, price: number, index: number) {
  t.isCrossed = false;
  t.prevPrice = t.midPrice;
  t.midPrice = t.lastPrice;
  t.lastPrice = price;
  t.prevIndex = t.midIndex;
  t.midIndex = t.lastIndex;
  t.lastIndex = index;
  t.prevLabel = t.midLabel;
  t.midLabel = t.lastLabel;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<IctAnchoredMarketStructuresWithValidationInputs> = {},
): Omit<IndicatorResult, 'boxes' | 'labels' | 'lines'> & { boxes: BoxData[]; labels: LabelData[]; lines: LineDrawingData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const atr = ta.atr(bars, 17).toArray().map((v) => (v === null || v === undefined ? NaN : v));

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS, label: MAX_OBJECTS });

  let i = 0;
  const bar = () => bars[i];

  // MS: the direction of the last break of a term (0, 1 bullish, -1 bearish)
  const ms = { st: 0, it: 0, lt: 0 };

  function renderStructures(t: Ictms, isBullish: boolean, msKey: 'st' | 'it' | 'lt', termText: string, css: string,
    style: Style, width: number, labelEnabled: boolean) {
    const close = bar().close;
    const condition = isBullish ? gt(close, t.lastPrice) : lt(close, t.lastPrice);
    if (condition && t.isCrossed === false) {
      t.isCrossed = true;
      t.isConfirmed = false;
      t.msLine = line.new(t.lastIndex, t.lastPrice, i, t.lastPrice, 'bar_index', 'none', css, lineStyle(style), width);
      const c73 = String(color.new(css, 73));
      t.swpBox = box.new(i, t.lastPrice, i, t.lastPrice, c73, undefined, undefined, undefined, undefined, c73);
      if (labelEnabled) {
        t.msLabel = box.new(t.lastIndex, t.lastPrice, i, t.lastPrice, 'transparent', undefined, undefined, undefined,
          undefined, 'transparent', ms[msKey] === (isBullish ? -1 : 1) ? `${termText}-CHoCH` : `${termText}-BoS`,
          'tiny', String(color.new(css, 17)), 'left', isBullish ? 'bottom' : 'top');
      }
      ms[msKey] = isBullish ? 1 : -1;
    }
  }

  function validateStructures(t: Ictms, isBullish: boolean, deviation: number, termText: string, labelEnabled: boolean) {
    const b = bar();
    const up = t.lastPrice + deviation;
    const dn = t.lastPrice - deviation;
    if ((gt(b.close, up) || lt(b.close, dn)) && t.isConfirmed === false) {
      t.isConfirmed = true;
      if (t.swpBox) box.set_right(t.swpBox, i);
      if (isBullish) {
        if (lt(b.close, dn) && labelEnabled && t.msLabel) box.set_text(t.msLabel, `${termText}-SWEEP`);
      } else if (gt(b.close, up) && labelEnabled && t.msLabel) {
        box.set_text(t.msLabel, `${termText}-SWEEP`);
      }
    } else if (gt(b.close, dn) && lt(b.close, up) && t.isCrossed === true && t.isConfirmed === false && t.swpBox) {
      if (isBullish) {
        box.set_right(t.swpBox, i);
        box.set_top(t.swpBox, Math.max(Math.min(b.high, up), box.get_top(t.swpBox)));
      } else {
        box.set_rightbottom(t.swpBox, i, Math.min(Math.max(b.low, dn), box.get_bottom(t.swpBox)));
      }
    }
  }

  const stLow = newIctms();
  const stHigh = newIctms();
  const itLow = newIctms();
  const itHigh = newIctms();
  const ltLow = newIctms();
  const ltHigh = newIctms();
  let prevCITL = false;
  let prevCITH = false;
  let prevCLTL = false;
  let prevCLTH = false;
  const stShow = cfg.stSwings !== 'Disabled';

  for (i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const b1 = i >= 1 ? bars[i - 1] : undefined;
    const b2 = i >= 2 ? bars[i - 2] : undefined;
    const sweep = atr[i];

    // Short term swings
    if (queryPatterns(b.low, b1?.low ?? NaN, b2?.low ?? NaN, false)) {
      updatePattern(stLow, b1!.low, i - 1);
      const tx = cfg.stSwings === '⦁' ? '⦁' : gt(stLow.midPrice, stLow.lastPrice) ? 'ST-LL' : 'ST-LH';
      stLow.lastLabel = label.new(stLow.lastIndex, stLow.lastPrice, tx, 'bar_index', 'price', 'transparent',
        'label_up', stShow ? cfg.stBearColor : 'transparent', textSize(cfg.stSwingsSize));
    }
    if (queryPatterns(b.high, b1?.high ?? NaN, b2?.high ?? NaN, true)) {
      updatePattern(stHigh, b1!.high, i - 1);
      const tx = cfg.stSwings === '⦁' ? '⦁' : gt(stHigh.midPrice, stHigh.lastPrice) ? 'ST-HL' : 'ST-HH';
      stHigh.lastLabel = label.new(i - 1, b1!.high, tx, 'bar_index', 'price', 'transparent', 'label_down',
        stShow ? cfg.stBullColor : 'transparent', textSize(cfg.stSwingsSize));
    }
    if (cfg.stMarketStructures) {
      renderStructures(stLow, false, 'st', 'ST', cfg.stBearColor, cfg.stLineStyle, cfg.stLineWidth, cfg.stLabels === 'Enabled');
      renderStructures(stHigh, true, 'st', 'ST', cfg.stBullColor, cfg.stLineStyle, cfg.stLineWidth, cfg.stLabels === 'Enabled');
    }
    if (cfg.stValidation === 'Enabled') {
      validateStructures(stLow, false, sweep, 'STL', cfg.stLabels === 'Enabled');
      validateStructures(stHigh, true, sweep, 'STH', cfg.stLabels === 'Enabled');
    }

    // Intermediate term swings: an ST swing between two higher (lower) ST swings
    const cITL = queryPatterns(stLow.lastPrice, stLow.midPrice, stLow.prevPrice, false);
    if (cITL && cITL !== prevCITL) {
      updatePattern(itLow, stLow.midPrice, stLow.midIndex);
      itLow.lastLabel = stLow.midLabel;
      if (cfg.itSwings !== 'Disabled' && stLow.midLabel) {
        const tx = cfg.itSwings === '△▽' ? '△' : cfg.itSwings === '◈' ? '◈' : gt(itLow.lastPrice, itLow.midPrice) ? 'IT-LH' : 'IT-LL';
        label.set_text(stLow.midLabel, tx);
        label.set_size(stLow.midLabel, textSize(cfg.itSwingsSize));
        label.set_textcolor(stLow.midLabel, cfg.itBearColor);
      }
    }
    prevCITL = cITL;
    const cITH = queryPatterns(stHigh.lastPrice, stHigh.midPrice, stHigh.prevPrice, true);
    if (cITH && cITH !== prevCITH) {
      updatePattern(itHigh, stHigh.midPrice, stHigh.midIndex);
      itHigh.lastLabel = stHigh.midLabel;
      if (cfg.itSwings !== 'Disabled' && stHigh.midLabel) {
        const tx = cfg.itSwings === '△▽' ? '▽' : cfg.itSwings === '◈' ? '◈' : gt(itHigh.lastPrice, itHigh.midPrice) ? 'IT-HH' : 'IT-HL';
        label.set_text(stHigh.midLabel, tx);
        label.set_size(stHigh.midLabel, textSize(cfg.itSwingsSize));
        label.set_textcolor(stHigh.midLabel, cfg.itBullColor);
      }
    }
    prevCITH = cITH;
    if (cfg.itMarketStructures) {
      renderStructures(itLow, false, 'it', 'IT', cfg.itBearColor, cfg.itLineStyle, cfg.itLineWidth, cfg.itLabels === 'Enabled');
      renderStructures(itHigh, true, 'it', 'IT', cfg.itBullColor, cfg.itLineStyle, cfg.itLineWidth, cfg.itLabels === 'Enabled');
    }
    if (cfg.itValidation === 'Enabled') {
      validateStructures(itLow, false, sweep, 'ITL', cfg.itLabels === 'Enabled');
      validateStructures(itHigh, true, sweep, 'ITH', cfg.itLabels === 'Enabled');
    }

    // Long term swings: the same test on the IT swings
    const cLTL = queryPatterns(itLow.lastPrice, itLow.midPrice, itLow.prevPrice, false);
    if (cLTL && cLTL !== prevCLTL) {
      ltLow.isCrossed = false;
      const tx = cfg.ltSwings === '▲▼' ? '▲' : cfg.ltSwings === '◉' ? '◉' : gt(ltLow.lastPrice, itLow.midPrice) ? 'LT-LL' : 'LT-LH';
      ltLow.lastPrice = itLow.midPrice;
      ltLow.lastIndex = itLow.midIndex;
      if (cfg.ltSwings !== 'Disabled' && itLow.midLabel) {
        label.set_text(itLow.midLabel, tx);
        label.set_size(itLow.midLabel, textSize(cfg.ltSwingsSize));
        label.set_textcolor(itLow.midLabel, cfg.ltBearColor);
      }
    }
    prevCLTL = cLTL;
    const cLTH = queryPatterns(itHigh.lastPrice, itHigh.midPrice, itHigh.prevPrice, true);
    if (cLTH && cLTH !== prevCLTH) {
      ltHigh.isCrossed = false;
      const tx = cfg.ltSwings === '▲▼' ? '▼' : cfg.ltSwings === '◉' ? '◉' : gt(ltHigh.lastPrice, itHigh.midPrice) ? 'LT-HL' : 'LT-HH';
      ltHigh.lastPrice = itHigh.midPrice;
      ltHigh.lastIndex = itHigh.midIndex;
      if (cfg.ltSwings !== 'Disabled' && itHigh.midLabel) {
        label.set_text(itHigh.midLabel, tx);
        label.set_size(itHigh.midLabel, textSize(cfg.ltSwingsSize));
        label.set_textcolor(itHigh.midLabel, cfg.ltBullColor);
      }
    }
    prevCLTH = cLTH;
    if (cfg.ltMarketStructures) {
      renderStructures(ltLow, false, 'lt', 'LT', cfg.ltBearColor, cfg.ltLineStyle, cfg.ltLineWidth, cfg.ltLabels === 'Enabled');
      renderStructures(ltHigh, true, 'lt', 'LT', cfg.ltBullColor, cfg.ltLineStyle, cfg.ltLineWidth, cfg.ltLabels === 'Enabled');
    }
    if (cfg.ltValidation === 'Enabled') {
      validateStructures(ltLow, false, sweep, 'LTL', cfg.ltLabels === 'Enabled');
      validateStructures(ltHigh, true, sweep, 'LTH', cfg.ltLabels === 'Enabled');
    }
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const col = (c: unknown) => (c === null || c === undefined || c === '' ? 'transparent' : String(c));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().filter((l) => !isNaN(l.x1) && !isNaN(l.y1) && !isNaN(l.x2) && !isNaN(l.y2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: col(l.color), width: l.width ?? 1,
      ...(l.style && l.style !== 'solid' ? { style: l.style } : {}),
    })),
    boxes: box.all().filter((b) => ![b.left, b.right, b.top, b.bottom].some((v) => isNaN(v))).map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      bgColor: col(b.bgcolor), borderColor: col(b.border_color),
      ...(b.text ? {
        text: b.text, textSize: b.text_size as BoxData['textSize'], textColor: col(b.text_color),
        textHAlign: b.text_halign, textVAlign: b.text_valign,
      } : {}),
    })),
    labels: label.all().filter((l) => !isNaN(l.x) && !isNaN(l.y)).map((l) => ({
      time: T(l.x), price: l.y, text: l.text ?? '', color: col(l.color), textColor: col(l.textcolor),
      style: l.style as LabelData['style'], size: l.size as LabelData['size'],
    })),
  };
}

export const IctAnchoredMarketStructuresWithValidation = {
  calculate, metadata, defaultInputs, inputConfig, plotConfig,
};
