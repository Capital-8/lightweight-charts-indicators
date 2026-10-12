/**
 * Strong Demands & Supplies + Liquidity | Zonas de Compra e Venda
 *
 * A market structure tool built on the swing logic of a smart money concepts script:
 * - Engulfing candles: a triangle below a bullish engulfing bar (open <= previous close, open < previous open,
 *   close > previous open) and above a bearish one.
 * - Swings: a swing high / low of 50 bars on each side ("HH" / "LH" / "HL" / "LL" labels); a close crossing the
 *   latest swing high / low draws a structure line and a label ("Break of Structure" or "CHoCH" when the trend turns).
 *   Optional internal structure (swings of 5 bars, "BOS" / "CHoCH", dashed). On the last bar the trailing extremes
 *   since the latest swings get a line and a "Strong / Weak High / Low" label.
 * - Liquidity zones: a zigzag of pivots (7 bars left, 1 bar right); when more than two pivot highs (lows) of the
 *   zigzag are within ATR(10) / 1.449 of a new pivot, a "Liquidity zone" (invisible boxes, a text box, a solid level
 *   line and a dotted line that runs until the level is taken) is drawn, on the last 500 bars only; 3 zones per side.
 * - Imbalances: fair value gaps of 3 bars with a body move above twice the mean move, drawn as two boxes (5 bars to
 *   the right), deleted when the price fills them.
 * - Previous day high / low: dotted lines from the bar of the high / low of the day before, to 20 bars after the
 *   last bar, with labels.
 * - Optional demand / supply zones: the order blocks of the swing breaks (5 latest, extended right) and the premium
 *   / discount areas (top and bottom 5 % of the trailing range) with labels.
 * - Optional EHPDA levels: the averages between the new day opening gaps (the gaps themselves are invisible dotted
 *   lines, as in the original).
 * Labels in English or Portuguese. At most 500 lines, 500 boxes and 50 labels are kept.
 *
 * The previous day high / low come from the daily bars built from the chart bars (`request.security` "D" with
 * lookahead); on a chart above one day they need the bars of a lower timeframe, which the chart bars do not have: the
 * port throws an Error when that option is on. Chart context: the exchange calendar of the days.
 * The alerts of the original (2 alertconditions, 2 alert() calls) have no output.
 *
 * Reference: "Strong Demands & Supplies + Liquidity | Zonas de Compra e Venda" by Luis_TudoSobreTrading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, color, array, callsite, Series, timeframe, line, box, label, resetDrawings, setDrawingBar, varDrawing,
  drawingOutputs,
  type Box, type Label, type Line, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { chartTimeframe, higherTimeframeBars, periodChanges, timeAfterLastBar } from '../anchor-period';
import type { ChartContext } from '../chart-context';

export interface StrongDemandsSuppliesLiquidityInputs {
  showPreviousDayHighLow: boolean;
  colorTextPrevHighLow: string;
  englishLanguageSelected: boolean;
  showInternalStruc: boolean;
  showDemandSupplyZones: boolean;
  colorImbalance: string;
  colorLiquidityLines: string;
  colorDemandZone: string;
  colorSupplyZone: string;
  showEngulfing: boolean;
  showEh: boolean;
  /** Number of opening gaps kept for the EHPDA levels */
  showLast: number;
  ehpdaCss: string;
}

export const defaultInputs: StrongDemandsSuppliesLiquidityInputs = {
  showPreviousDayHighLow: true,
  colorTextPrevHighLow: 'rgba(19, 133, 133, 0.87)',
  englishLanguageSelected: true,
  showInternalStruc: false,
  showDemandSupplyZones: false,
  colorImbalance: 'rgba(247, 186, 233, 0.56)',
  colorLiquidityLines: 'rgba(241, 103, 103, 0.82)',
  colorDemandZone: 'rgba(132, 234, 154, 0.56)',
  colorSupplyZone: 'rgba(232, 82, 82, 0.43)',
  showEngulfing: true,
  showEh: false,
  showLast: 10,
  ehpdaCss: '#25bcc7',
};

export const inputConfig: InputConfig[] = [
  { id: 'showPreviousDayHighLow', type: 'bool', title: 'Show Previous day High and Low', defval: true,
    inline: 'Show prev day levels', group: 'Configuration' },
  { id: 'colorTextPrevHighLow', type: 'color', title: 'Color of previous day high and low',
    defval: 'rgba(19, 133, 133, 0.87)', group: 'Configuration' },
  { id: 'englishLanguageSelected', type: 'bool', title: 'Show Labels in English', defval: true, group: 'Configuration' },
  { id: 'showInternalStruc', type: 'bool', title: 'Show Internal Structure', defval: false, group: 'Configuration' },
  { id: 'showDemandSupplyZones', type: 'bool', title: 'Show Demand and Supply Zones', defval: false, group: 'Configuration' },
  { id: 'colorImbalance', type: 'color', title: 'Color of imbalances', defval: 'rgba(247, 186, 233, 0.56)', group: 'Configuration' },
  { id: 'colorLiquidityLines', type: 'color', title: 'Color of liquidity lines', defval: 'rgba(241, 103, 103, 0.82)',
    group: 'Configuration' },
  { id: 'colorDemandZone', type: 'color', title: 'Color of demand_zone and choch lines', defval: 'rgba(132, 234, 154, 0.56)',
    group: 'Configuration' },
  { id: 'colorSupplyZone', type: 'color', title: 'Color of supply_zone and choch lines', defval: 'rgba(232, 82, 82, 0.43)',
    group: 'Configuration' },
  { id: 'showEngulfing', type: 'bool', title: 'Mark Engulfing candles with arrows', defval: true },
  { id: 'showEh', type: 'bool', title: 'Show EHPDA: averages between New Week and New Day opening gaps', defval: false },
  { id: 'showLast', type: 'int', title: 'Amount', defval: 10, min: 1 },
  { id: 'ehpdaCss', type: 'color', title: 'Color of EHPDA', defval: '#25bcc7' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Strong Demands & Supplies + Liquidity | Zonas de Compra e Venda',
  shortTitle: 'Strong Demands & Supplies + Liquidity',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_boxes_count = 500); labels: the default 50 */
const MAX_LINES = 500;
const MAX_BOXES = 500;
const MAX_LABELS = 50;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) > EPS;

const TRANSP_COLOR = '#ffffff00';
/** ogCssBull / ogCssBear of the original: fully transparent */
const OG_CSS_BULL = '#5b9cf600';
const OG_CSS_BEAR = '#ba68c800';
/** pdhl_css */
const PDHL_CSS = '#ffffff';

/** Liquidity settings fixed in the original */
const DETECTION_LENGTH = 7;
const MARGIN = 10 / 6.9;
const BUY_SIDE_MARGIN = 2.3;
const SELL_SIDE_MARGIN = 2.3;
const VISIBLE_LEVELS = 3;
const ZZ_SIZE = 50;
/** Swing lengths, order block count and fair value gap extension fixed in the original */
const LENGTH = 50;
const INTERNAL_LENGTH = 5;
const OB_SHOWLAST = 5;
const FVG_EXTEND = 5;
/** Farthest drawing after the last bar: the trailing high / low labels at bar_index + 20 */
const FUTURE_BARS = 20;

interface LiquidityObject {
  levelBox: Box | null;
  zoneBox: Box | null;
  labelBox: Box | null;
  isZoneBroken: boolean;
  isLevelBroken: boolean;
  levelLine: Line | null;
  extendedLine: Line | null;
}

/** swings_calc(len): the swing high / low confirmed on each bar (0 when none) */
function swings(bars: Bar[], len: number): { top: number[]; btm: number[] } {
  const n = bars.length;
  const upper = ta.highest(new Series(bars, (b) => b.high), len).toArray();
  const lower = ta.lowest(new Series(bars, (b) => b.low), len).toArray();
  const top: number[] = [];
  const btm: number[] = [];
  // var os = 0, then os := ... : os[1]; os[1] is na on the first bar, so os stays na until the first swing
  let os = NaN;
  for (let i = 0; i < n; i++) {
    const before = os;
    const h = i >= len ? bars[i - len].high : NaN;
    const l = i >= len ? bars[i - len].low : NaN;
    os = gt(h, upper[i] ?? NaN) ? 0 : lt(l, lower[i] ?? NaN) ? 1 : before;
    // os[1] != 0 is false while os[1] is na
    top.push(os === 0 && !isNaN(before) && before !== 0 ? h : 0);
    btm.push(os === 1 && !isNaN(before) && before !== 1 ? l : 0);
  }
  return { top, btm };
}

/**
 * The local `ob_threshold` of one ob_coord() call site: the function runs only on some bars and keeps one value per
 * bar of its calls; `ob_threshold[k]` reads the value of the latest call on bar i - k or before (measured).
 */
function thresholdHistory() {
  const callBars: number[] = [];
  const values: number[] = [];
  return {
    push(bar: number, value: number) {
      callBars.push(bar);
      values.push(value);
    },
    at(bar: number): number {
      let lo = 0;
      let hi = callBars.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (callBars[mid] <= bar) {
          found = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      return found < 0 ? NaN : values[found];
    },
  };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<StrongDemandsSuppliesLiquidityInputs> = {},
  chart?: ChartContext,
): IndicatorResult {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const last = n - 1;
  const ms = n > 0 && bars[0].time >= 1e12;
  /** Pine `time` (UNIX ms) of bar i */
  const T = (i: number) => (i >= 0 && i < n ? (ms ? bars[i].time : bars[i].time * 1000) : NaN);
  const showLast = Math.trunc(cfg.showLast);
  const english = cfg.englishLanguageSelected;
  const showPdhl = cfg.showPreviousDayHighLow;
  const showSd = cfg.showDemandSupplyZones;

  // Label texts
  const demandLblTxt = english ? 'Demand/Buy Zone' : 'Zona de Compra';
  const supplyLblTxt = english ? 'Supply/Sell Zone' : 'Zona de Venda';
  const strongHighLbl = english ? 'Strong High' : 'Alto Forte';
  const strongLowLbl = english ? 'Strong Low' : 'Baixo Forte';
  const weakLowLbl = english ? 'Weak Low' : 'Baixo Fraco';
  const weakHighLbl = english ? 'Weak High' : 'Alto Fraco';
  const previousDayHighLbl = english ? 'Previous Day Highest Price' : 'Preço Máximo do dia Anterior';
  const previousDayLowLbl = english ? 'Previous Day Lowest Price' : 'Preço Minimo do dia Anterior';

  // Colours (style 'Colored')
  const bullCss = cfg.colorDemandZone;
  const bearCss = cfg.colorSupplyZone;
  const liqCss = cfg.colorLiquidityLines;
  const liqText = String(color.new(liqCss, 25));
  const liqLine = String(color.new(liqCss, 0));

  // request.security(syminfo.tickerid, 'D', [high, low], lookahead = barmerge.lookahead_on): the high / low of the
  // day of each bar
  let pdh: number[] = [];
  let pdl: number[] = [];
  if (showPdhl && n > 0) {
    const chartTf = chartTimeframe(bars, chart);
    const daySeconds = timeframe.in_seconds('D');
    const chartSeconds = chartTf === '' ? daySeconds : timeframe.in_seconds(chartTf);
    if (chartSeconds > daySeconds) {
      throw new Error(`Strong Demands & Supplies + Liquidity: "Show Previous day High and Low" needs the daily bars, `
        + `which are below the chart timeframe ${chartTf} and not available (switch that option off)`);
    }
    if (chartSeconds === daySeconds) {
      pdh = bars.map((b) => b.high);
      pdl = bars.map((b) => b.low);
    } else {
      const s = higherTimeframeBars(bars, 'D', chart);
      pdh = s.group.map((g) => s.htf[g].high);
      pdl = s.group.map((g) => s.htf[g].low);
    }
  }
  // timeframe.change('D')
  const dtf = n > 0 ? periodChanges(bars, 'D', chart) : [];

  const atr10 = ta.atr(bars, 10).toArray();
  const atr200 = ta.atr(bars, 200).toArray();
  const pivotHighs = ta.pivothigh(new Series(bars, (b) => b.high), DETECTION_LENGTH, 1).toArray();
  const pivotLows = ta.pivotlow(new Series(bars, (b) => b.low), DETECTION_LENGTH, 1).toArray();
  const swing = swings(bars, LENGTH);
  const internal = swings(bars, INTERNAL_LENGTH);

  resetDrawings({ line: MAX_LINES, box: MAX_BOXES, label: MAX_LABELS });
  const markers: MarkerData[] = [];

  // EHPDA
  const ogTop: number[] = [];
  const ogBtm: number[] = [];
  const ogAvg: number[] = [];
  const ogLoc: number[] = [];
  let ogSorted: number[] = [];
  const ogAvgLines: Line[] = [];
  const ehpda: Array<{ lvl: Line; lbl: Label }> = [];

  // Liquidity
  const zzDirections = new Array<number>(ZZ_SIZE).fill(0);
  const zzIndices = new Array<number>(ZZ_SIZE).fill(0);
  const zzPrices = new Array<number>(ZZ_SIZE).fill(NaN);
  const emptyLiquidity = (): LiquidityObject => ({
    levelBox: null, zoneBox: null, labelBox: null, isZoneBroken: false, isLevelBroken: false, levelLine: null,
    extendedLine: null,
  });
  const buySideLiquidity: LiquidityObject[] = [emptyLiquidity()];
  const sellSideLiquidity: LiquidityObject[] = [emptyLiquidity()];
  const updateZigZag = (direction: number, index: number, price: number) => {
    zzDirections.unshift(direction);
    zzIndices.unshift(index);
    zzPrices.unshift(price);
    zzDirections.pop();
    zzIndices.pop();
    zzPrices.pop();
  };
  const deleteLiquidity = (o: LiquidityObject) => {
    if (o.levelBox) box.delete(o.levelBox);
    if (o.zoneBox) box.delete(o.zoneBox);
    if (o.labelBox) box.delete(o.labelBox);
    if (o.levelLine) line.delete(o.levelLine);
    if (o.extendedLine) line.delete(o.extendedLine);
  };
  const lineY1 = (l: Line | null) => (l ? line.get_y1(l) : NaN);

  // Structure
  let trend = 0;
  let itrend = 0;
  let topY = 0;
  let topX = 0;
  let btmY = 0;
  let btmX = 0;
  let itopY = 0;
  let itopX = 0;
  let ibtmY = 0;
  let ibtmX = 0;
  let trailUp = n > 0 ? bars[0].high : NaN;
  let trailDn = n > 0 ? bars[0].low : NaN;
  let trailUpX = 0;
  let trailDnX = 0;
  let topCross = true;
  let btmCross = true;
  let itopCross = true;
  let ibtmCross = true;
  const extendTop = varDrawing<Line>();
  const extendBtm = varDrawing<Line>();
  const extendTopLbl = varDrawing<Label>();
  const extendBtmLbl = varDrawing<Label>();
  const crossIntBull = callsite.crossover();
  const crossBull = callsite.crossover();
  const crossIntBear = callsite.crossunder();
  const crossBear = callsite.crossunder();

  // Order blocks
  const obTop: number[] = [];
  const obBtm: number[] = [];
  const obLeft: number[] = [];
  const obType: number[] = [];
  const obBoxes: Box[] = [];
  const obThresholdBull = thresholdHistory();
  const obThresholdBear = thresholdHistory();

  // Imbalances: [min box, max box] of the bullish gaps, [max box, min box] of the bearish gaps; a pair leaves the
  // list once its first box is deleted (its getters are na from then on: the original never deletes it again)
  const bullishFvg: Array<[Box, Box]> = [];
  const bearishFvg: Array<[Box, Box]> = [];
  let fvgCum = 0;

  // Previous day high / low
  const highLine = varDrawing<Line>();
  const highLbl = varDrawing<Label>();
  const lowLine = varDrawing<Line>();
  const lowLbl = varDrawing<Label>();
  // ta.valuewhen(..., 1): the two latest values
  let hyLast = NaN;
  let hyPrev = NaN;
  let hxLast = NaN;
  let hxPrev = NaN;
  let lyLast = NaN;
  let lyPrev = NaN;
  let lxLast = NaN;
  let lxPrev = NaN;

  // Premium / discount
  const premium = varDrawing<Box>();
  const premiumLbl = varDrawing<Label>();
  const discount = varDrawing<Box>();
  const discountLbl = varDrawing<Label>();

  /** display_Structure(x, y, txt, css, dashed, down, lbl_size) */
  const displayStructure = (i: number, x: number, y: number, txt: string, css: string, dashed: boolean, down: boolean,
    size: string) => {
    line.new(x, y, i, y, 'bar_index', 'none', css, dashed ? 'dashed' : 'solid');
    label.new(Math.trunc((x + i) / 2), y, txt, 'bar_index', 'price', TRANSP_COLOR, down ? 'label_down' : 'label_up', css, size);
  };

  /** ob_coord(use_max, loc, ob_top, ob_btm, ob_left, ob_type) */
  const obCoord = (i: number, useMax: boolean, loc: number) => {
    const history = useMax ? obThresholdBear : obThresholdBull;
    history.push(i, atr200[i] ?? NaN);
    let min = 99999999;
    let max = 0;
    let idx = 1;
    const end = i - loc - 1;
    const step = end >= 1 ? 1 : -1;
    for (let k = 1; step > 0 ? k <= end : k >= end; k += step) {
      const b = bars[i - k];
      const th = history.at(i - k);
      if (lt(b.high - b.low, th * 2)) {
        if (useMax) {
          max = Math.max(b.high, max);
          min = eq(max, b.high) ? b.low : min;
          idx = eq(max, b.high) ? k : idx;
        } else {
          min = Math.min(b.low, min);
          max = eq(min, b.low) ? b.high : max;
          idx = eq(min, b.low) ? k : idx;
        }
      }
    }
    obTop.unshift(max);
    obBtm.unshift(min);
    obLeft.unshift(T(i - idx));
    obType.unshift(useMax ? -1 : 1);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === last);
    const b = bars[i];
    const p1 = i > 0 ? bars[i - 1] : null;
    const p2 = i > 1 ? bars[i - 2] : null;
    const close1 = p1 ? p1.close : NaN;
    const t = T(i);

    // Engulfing candles
    const open1 = p1 ? p1.open : NaN;
    const bullishEngulfing = !gt(b.open, close1) && !isNaN(close1) && lt(b.open, open1) && gt(b.close, open1);
    const bearishEngulfing = !lt(b.open, close1) && !isNaN(close1) && gt(b.open, open1) && lt(b.close, open1);
    if (bullishEngulfing && cfg.showEngulfing) {
      markers.push({ time: b.time, position: 'belowBar', shape: 'triangleUp', color: '#4caf50', size: 'tiny' });
    }
    if (bearishEngulfing && cfg.showEngulfing) {
      markers.push({ time: b.time, position: 'aboveBar', shape: 'triangleDown', color: '#f23645', size: 'tiny' });
    }

    // EHPDA
    if (i === 0) {
      for (let k = 0; k <= showLast - 1; k++) {
        const lvl = line.new(NaN, NaN, NaN, NaN, 'bar_time', 'none', cfg.ehpdaCss, 'dashed');
        const lbl = label.new(NaN, NaN, 'EHPDA', 'bar_time', 'price', 'transparent', 'label_left', cfg.ehpdaCss, 'small');
        ehpda.push({ lvl, lbl });
      }
    }
    if (dtf[i]) {
      const max = Math.max(close1, b.open);
      const min = Math.min(close1, b.open);
      const avg = (max + min) / 2;
      ogTop.unshift(max);
      ogBtm.unshift(min);
      ogAvg.unshift(avg);
      ogLoc.unshift(t);
      const css = gt(b.open, close1) ? OG_CSS_BULL : OG_CSS_BEAR;
      ogAvgLines.unshift(line.new(t, avg, t + 1, avg, 'bar_time', 'right', css, 'dotted'));
      if (ogAvgLines.length > showLast) {
        ogTop.pop();
        ogBtm.pop();
        ogLoc.pop();
        ogAvg.pop();
        line.delete(ogAvgLines.pop()!);
      }
      ogSorted = array.sort_indices(ogAvg);
    }
    if (cfg.showEh) {
      if (dtf[i] && ogAvgLines.length > 2) {
        for (let k = 0; k <= ogAvgLines.length - 2; k++) {
          const getbtm = ogTop[ogSorted[k]];
          const gettop = ogBtm[ogSorted[k + 1]];
          const avg = (getbtm + gettop) / 2;
          const eh = ehpda[k];
          if (eh === undefined) throw new Error(`Index ${k} is out of bounds, array size is ${ehpda.length}`);
          line.set_xy1(eh.lvl, ogLoc[ogSorted[k]], avg);
          line.set_xy2(eh.lvl, t, avg);
          label.set_xy(eh.lbl, t, avg);
        }
      } else {
        for (const eh of ehpda) {
          line.set_x2(eh.lvl, t);
          label.set_x(eh.lbl, t);
        }
      }
    }

    // Liquidity
    const atr = atr10[i] ?? NaN;
    const isPresent = last - i <= 500;
    const pivotIndex2 = i - 1;
    const pivotHigh = pivotHighs[i] ?? NaN;
    const pivotLow = pivotLows[i] ?? NaN;
    const band = atr / MARGIN;
    if (!isNaN(pivotHigh)) {
      const direction = zzDirections[0];
      const pivotPrice1 = zzPrices[0];
      const pivotPrice2 = p1 && !isNaN(p1.high) ? p1.high : 0;
      if (direction < 1) updateZigZag(1, pivotIndex2, pivotPrice2);
      else if (direction === 1 && gt(pivotHigh, pivotPrice1)) {
        zzIndices[0] = pivotIndex2;
        zzPrices[0] = pivotPrice2;
      }
      if (isPresent) {
        let count = 0;
        let startPrice = 0;
        let startIndex = 0;
        let minPrice = 0;
        let maxPrice = 10e6;
        for (let k = 0; k < ZZ_SIZE; k++) {
          if (zzDirections[k] === 1) {
            const p = zzPrices[k];
            if (gt(p, pivotHigh + band)) break;
            else if (gt(p, pivotHigh - band) && lt(p, pivotHigh + band)) {
              count += 1;
              startIndex = zzIndices[k];
              startPrice = p;
              if (gt(p, minPrice)) minPrice = p;
              if (lt(p, maxPrice)) maxPrice = p;
            }
          }
        }
        if (count > 2) {
          const getBuySide = buySideLiquidity[0];
          const mid = (minPrice + maxPrice) / 2;
          if (getBuySide.levelBox && startIndex === box.get_left(getBuySide.levelBox)) {
            box.set_top(getBuySide.levelBox, mid + band);
            box.set_rightbottom(getBuySide.levelBox, i + 10, mid - band);
          } else {
            const levelBox = box.new(startIndex, mid + band, i + 10, mid - band, 'transparent', undefined, undefined,
              undefined, undefined, 'transparent');
            const zoneBox = box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, undefined, undefined, 'transparent');
            const labelBox = box.new(startIndex, startPrice, i + 10, startPrice, 'transparent', undefined, undefined,
              undefined, undefined, 'transparent', 'Liquidity zone', 'tiny', liqText, 'left', 'bottom');
            const levelLine = line.new(startIndex, startPrice, i - 1, startPrice, 'bar_index', 'none', liqLine);
            const extendedLine = line.new(i - 1, startPrice, NaN, startPrice, 'bar_index', 'none', liqLine, 'dotted');
            buySideLiquidity.unshift({
              levelBox, zoneBox, labelBox, isZoneBroken: false, isLevelBroken: false, levelLine, extendedLine,
            });
          }
          if (buySideLiquidity.length > VISIBLE_LEVELS) deleteLiquidity(buySideLiquidity.pop()!);
        }
      }
    }
    if (!isNaN(pivotLow)) {
      const direction = zzDirections[0];
      const pivotPrice1 = zzPrices[0];
      const pivotPrice2 = p1 && !isNaN(p1.low) ? p1.low : 0;
      if (direction > -1) updateZigZag(-1, pivotIndex2, pivotPrice2);
      else if (direction === -1 && lt(pivotLow, pivotPrice1)) {
        zzIndices[0] = pivotIndex2;
        zzPrices[0] = pivotPrice2;
      }
      if (isPresent) {
        let count = 0;
        let startPrice = 0;
        let startIndex = 0;
        let minPrice = 0;
        let maxPrice = 10e6;
        for (let k = 0; k < ZZ_SIZE; k++) {
          if (zzDirections[k] === -1) {
            const p = zzPrices[k];
            if (lt(p, pivotLow - band)) break;
            else if (gt(p, pivotLow - band) && lt(p, pivotLow + band)) {
              count += 1;
              startIndex = zzIndices[k];
              startPrice = p;
              if (gt(p, minPrice)) minPrice = p;
              if (lt(p, maxPrice)) maxPrice = p;
            }
          }
        }
        if (count > 2) {
          const getSellSide = sellSideLiquidity[0];
          const mid = (minPrice + maxPrice) / 2;
          if (getSellSide.levelBox && startIndex === box.get_left(getSellSide.levelBox)) {
            box.set_top(getSellSide.levelBox, mid + band);
            box.set_rightbottom(getSellSide.levelBox, i + 10, mid - band);
          } else {
            const levelBox = box.new(startIndex, mid + band, i + 10, mid - band, 'transparent', undefined, undefined,
              undefined, undefined, 'transparent');
            const zoneBox = box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, undefined, undefined, 'transparent');
            const labelBox = box.new(startIndex, startPrice, i + 10, startPrice, 'transparent', undefined, undefined,
              undefined, undefined, 'transparent', 'Liquidity zone', 'tiny', liqText, 'left', 'top');
            const levelLine = line.new(startIndex, startPrice, i - 1, startPrice, 'bar_index', 'none', liqLine);
            const extendedLine = line.new(i - 1, startPrice, NaN, startPrice, 'bar_index', 'none', liqLine, 'dotted');
            sellSideLiquidity.unshift({
              levelBox, zoneBox, labelBox, isZoneBroken: false, isLevelBroken: false, levelLine, extendedLine,
            });
          }
          if (sellSideLiquidity.length > VISIBLE_LEVELS) deleteLiquidity(sellSideLiquidity.pop()!);
        }
      }
    }
    for (const liqItem of buySideLiquidity) {
      if (!liqItem.isLevelBroken) {
        if (liqItem.extendedLine) line.set_x2(liqItem.extendedLine, i);
        if (gt(b.high, lineY1(liqItem.levelLine))) {
          liqItem.isLevelBroken = true;
          liqItem.isZoneBroken = true;
        }
      } else if (liqItem.isZoneBroken) {
        const y = lineY1(liqItem.levelLine);
        if (gt(b.low, y - BUY_SIDE_MARGIN * atr) && lt(b.high, y + BUY_SIDE_MARGIN * atr)) {
          if (liqItem.extendedLine) line.set_x2(liqItem.extendedLine, i + 1);
        } else {
          liqItem.isZoneBroken = false;
        }
      }
    }
    for (const liqItem of sellSideLiquidity) {
      if (!liqItem.isLevelBroken) {
        if (liqItem.extendedLine) line.set_x2(liqItem.extendedLine, i);
        if (lt(b.low, lineY1(liqItem.levelLine))) {
          liqItem.isLevelBroken = true;
          liqItem.isZoneBroken = true;
        }
      } else if (liqItem.isZoneBroken) {
        const y = lineY1(liqItem.levelLine);
        if (gt(b.low, y - SELL_SIDE_MARGIN * atr) && lt(b.high, y + SELL_SIDE_MARGIN * atr)) {
          if (liqItem.extendedLine) line.set_x2(liqItem.extendedLine, i + 1);
        } else {
          liqItem.isZoneBroken = false;
        }
      }
    }

    // Swings: pivot high
    if (i === 0) {
      extendTopLbl.value = label.new(NaN, NaN, '', 'bar_index', 'price', TRANSP_COLOR, 'label_down', bearCss, 'small');
    }
    const top = swing.top[i];
    if (top !== 0 && !isNaN(top)) {
      topCross = true;
      const txtTop = gt(top, topY) ? 'HH' : 'LH';
      label.new(i - LENGTH, top, txtTop, 'bar_index', 'price', TRANSP_COLOR, 'label_down', bearCss, 'small');
      if (extendTop.value) line.delete(extendTop.value);
      extendTop.value = line.new(i - LENGTH, top, i, top, 'bar_index', 'none', bearCss);
      topY = top;
      topX = i - LENGTH;
      trailUp = top;
      trailUpX = i - LENGTH;
    }
    const itop = internal.top[i];
    if (itop !== 0 && !isNaN(itop)) {
      itopCross = true;
      itopY = itop;
      itopX = i - INTERNAL_LENGTH;
    }
    trailUp = Math.max(b.high, trailUp);
    trailUpX = eq(trailUp, b.high) ? i : trailUpX;
    if (i === last) {
      if (extendTop.value) {
        line.set_xy1(extendTop.value, trailUpX, trailUp);
        line.set_xy2(extendTop.value, i + 20, trailUp);
      }
      label.set_x(extendTopLbl.value!, i + 20);
      label.set_y(extendTopLbl.value!, trailUp);
      label.set_text(extendTopLbl.value!, trend < 0 ? strongHighLbl : weakHighLbl);
    }

    // Swings: pivot low
    if (i === 0) {
      extendBtmLbl.value = label.new(NaN, NaN, '', 'bar_index', 'price', TRANSP_COLOR, 'label_up', bullCss, 'small');
    }
    const btm = swing.btm[i];
    if (btm !== 0 && !isNaN(btm)) {
      btmCross = true;
      const txtBtm = lt(btm, btmY) ? 'LL' : 'HL';
      label.new(i - LENGTH, btm, txtBtm, 'bar_index', 'price', TRANSP_COLOR, 'label_up', bullCss, 'small');
      if (extendBtm.value) line.delete(extendBtm.value);
      extendBtm.value = line.new(i - LENGTH, btm, i, btm, 'bar_index', 'none', bullCss);
      btmY = btm;
      btmX = i - LENGTH;
      trailDn = btm;
      trailDnX = i - LENGTH;
    }
    const ibtm = internal.btm[i];
    if (ibtm !== 0 && !isNaN(ibtm)) {
      ibtmCross = true;
      ibtmY = ibtm;
      ibtmX = i - INTERNAL_LENGTH;
    }
    trailDn = Math.min(b.low, trailDn);
    trailDnX = eq(trailDn, b.low) ? i : trailDnX;
    if (i === last) {
      if (extendBtm.value) {
        line.set_xy1(extendBtm.value, trailDnX, trailDn);
        line.set_xy2(extendBtm.value, i + 20, trailDn);
      }
      label.set_x(extendBtmLbl.value!, i + 20);
      label.set_y(extendBtmLbl.value!, trailDn);
      label.set_text(extendBtmLbl.value!, trend > 0 ? strongLowLbl : weakLowLbl);
    }

    // Bullish structure (internal, then swing); the crossings run on every bar
    if (crossIntBull(b.close, itopY) && itopCross && ne(topY, itopY)) {
      const choch = itrend < 0;
      const txt = english ? (choch ? 'CHoCH' : 'BOS') : (choch ? 'Alteração de Caráter' : 'Quebra Estrutura');
      if (cfg.showInternalStruc) displayStructure(i, itopX, itopY, txt, bullCss, true, true, 'tiny');
      itopCross = false;
      itrend = 1;
    }
    if (crossBull(b.close, topY) && topCross) {
      const choch = trend < 0;
      const txt = english ? (choch ? 'CHoCH' : 'Break of Structure') : (choch ? 'Alteração Caráter' : 'Quebra Estrutura');
      displayStructure(i, topX, topY, txt, cfg.colorDemandZone, false, true, 'small');
      if (showSd) obCoord(i, false, topX);
      topCross = false;
      trend = 1;
    }
    // Bearish structure
    if (crossIntBear(b.close, ibtmY) && ibtmCross && ne(btmY, ibtmY)) {
      const choch = itrend > 0;
      const txt = english ? (choch ? 'CHoCH' : 'Break of Structure') : (choch ? 'Alteração Caráter' : 'Quebra Estrutura');
      if (cfg.showInternalStruc) displayStructure(i, ibtmX, ibtmY, txt, bearCss, true, false, 'small');
      ibtmCross = false;
      itrend = -1;
    }
    if (crossBear(b.close, btmY) && btmCross) {
      const choch = trend > 0;
      const txt = english ? (choch ? 'CHoch' : 'Break of Structure') : (choch ? 'Alteração Caráter' : 'Quebra Estrutura');
      displayStructure(i, btmX, btmY, txt, cfg.colorSupplyZone, true, false, 'small');
      if (showSd) obCoord(i, true, btmX);
      btmCross = false;
      trend = -1;
    }

    // Order blocks: `for element in ob_type` with removals (the element after a removed one is skipped); the
    // index is the first element of the same type
    for (let k = 0; k < obType.length; k++) {
      const element = obType[k];
      const index = obType.indexOf(element);
      if (lt(b.close, obBtm[index]) && element === 1) {
        obTop.splice(index, 1);
        obBtm.splice(index, 1);
        obLeft.splice(index, 1);
        obType.splice(index, 1);
      } else if (gt(b.close, obTop[index]) && element === -1) {
        obTop.splice(index, 1);
        obBtm.splice(index, 1);
        obLeft.splice(index, 1);
        obType.splice(index, 1);
      }
    }
    if (i === 0) {
      for (let k = 0; k < OB_SHOWLAST; k++) obBoxes.push(box.new(NaN, NaN, NaN, NaN, undefined, undefined, undefined, undefined, 'bar_time'));
    }
    const obSize = obType.length;
    if (obSize > 0 && i === last) {
      for (let k = 0; k <= Math.min(OB_SHOWLAST - 1, obSize - 1); k++) {
        const getBox = obBoxes[k];
        box.set_lefttop(getBox, obLeft[k], obTop[k]);
        box.set_rightbottom(getBox, obLeft[k], obBtm[k]);
        box.set_extend(getBox, 'right');
        const css = obType[k] === 1 ? bullCss : bearCss;
        box.set_border_color(getBox, css);
        box.set_bgcolor(getBox, css);
      }
    }

    // Imbalances (request.security on the chart timeframe: the chart series)
    {
      const srcC1 = close1;
      const srcO1 = open1;
      const srcH2 = p2 ? p2.high : NaN;
      const srcL2 = p2 ? p2.low : NaN;
      const deltaPer = ((srcC1 - srcO1) / srcO1) * 100;
      // timeframe.change('') is true on every bar; ta.cum: an na value adds nothing and gives na
      const add = Math.abs(deltaPer);
      if (!isNaN(add)) fvgCum += add;
      const threshold = ((isNaN(add) ? NaN : fvgCum) / i) * 2;
      const bullishFvgCnd = gt(b.low, srcH2) && gt(srcC1, srcH2) && gt(deltaPer, threshold);
      const bearishFvgCnd = lt(b.high, srcL2) && lt(srcC1, srcL2) && gt(-deltaPer, threshold);
      const css = cfg.colorImbalance;
      if (bullishFvgCnd) {
        const mid = (b.low + srcH2) / 2;
        const maxBox = box.new(i - 1, b.low, i + FVG_EXTEND, mid, css, undefined, undefined, undefined, undefined, css);
        const minBox = box.new(i - 1, mid, i + FVG_EXTEND, srcH2, css, undefined, undefined, undefined, undefined, css);
        bullishFvg.unshift([minBox, maxBox]);
      }
      if (bearishFvgCnd) {
        const mid = (b.high + srcL2) / 2;
        const maxBox = box.new(i - 1, b.high, i + FVG_EXTEND, mid, css, undefined, undefined, undefined, undefined, css);
        const minBox = box.new(i - 1, mid, i + FVG_EXTEND, srcL2, css, undefined, undefined, undefined, undefined, css);
        bearishFvg.unshift([maxBox, minBox]);
      }
      for (let k = 0; k < bullishFvg.length; k++) {
        const [bx, other] = bullishFvg[k];
        const bottom = box.get_bottom(bx);
        if (isNaN(bottom)) {
          bullishFvg.splice(k--, 1);
        } else if (lt(b.low, bottom)) {
          box.delete(bx);
          box.delete(other);
          bullishFvg.splice(k--, 1);
        }
      }
      for (let k = 0; k < bearishFvg.length; k++) {
        const [bx, other] = bearishFvg[k];
        const topPrice = box.get_top(bx);
        if (isNaN(topPrice)) {
          bearishFvg.splice(k--, 1);
        } else if (gt(b.high, topPrice)) {
          box.delete(bx);
          box.delete(other);
          bearishFvg.splice(k--, 1);
        }
      }
    }

    // Previous day high / low
    if (showPdhl) {
      if (i === 0) {
        highLine.value = line.new(NaN, NaN, NaN, NaN, 'bar_time', 'none', PDHL_CSS, 'dotted');
        highLbl.value = label.new(NaN, NaN, previousDayHighLbl, 'bar_time', 'price', TRANSP_COLOR, 'label_left',
          cfg.colorTextPrevHighLow, 'small');
        lowLine.value = line.new(NaN, NaN, NaN, NaN, 'bar_time', 'none', PDHL_CSS, 'dotted');
        lowLbl.value = label.new(NaN, NaN, previousDayLowLbl, 'bar_time', 'price', TRANSP_COLOR, 'label_left',
          cfg.colorTextPrevHighLow, 'small');
      }
      const h = pdh[i];
      const l = pdl[i];
      if (i > 0 && ne(h, pdh[i - 1])) {
        hyPrev = hyLast;
        hyLast = h;
      }
      if (eq(h, b.high)) {
        hxPrev = hxLast;
        hxLast = t;
      }
      if (i > 0 && ne(l, pdl[i - 1])) {
        lyPrev = lyLast;
        lyLast = l;
      }
      if (eq(l, b.low)) {
        lxPrev = lxLast;
        lxLast = t;
      }
      if (i === last) {
        const ext = t + (t - T(i - 1)) * 20;
        line.set_xy1(highLine.value!, hxPrev, hyPrev);
        line.set_xy2(highLine.value!, ext, hyPrev);
        label.set_xy(highLbl.value!, ext, hyPrev);
        line.set_xy1(lowLine.value!, lxPrev, lyPrev);
        line.set_xy2(lowLine.value!, ext, lyPrev);
        label.set_xy(lowLbl.value!, ext, lyPrev);
      }
    }

    // Premium and discount zones
    if (i === 0) {
      premium.value = box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, undefined, undefined,
        String(color.new(cfg.colorSupplyZone, 80)));
      premiumLbl.value = label.new(NaN, NaN, supplyLblTxt, 'bar_index', 'price', TRANSP_COLOR, 'label_down',
        cfg.colorSupplyZone, 'normal');
      discount.value = box.new(NaN, NaN, NaN, NaN, 'transparent', undefined, undefined, undefined, undefined,
        String(color.new(cfg.colorDemandZone, 80)));
      discountLbl.value = label.new(NaN, NaN, demandLblTxt, 'bar_index', 'price', TRANSP_COLOR, 'label_up',
        cfg.colorDemandZone, 'normal');
    }
    if (i === last && showSd) {
      const left = Math.max(topX, btmX);
      box.set_lefttop(premium.value!, left, trailUp);
      box.set_rightbottom(premium.value!, i, 0.95 * trailUp + 0.05 * trailDn);
      label.set_xy(premiumLbl.value!, Math.trunc((left + i) / 2), trailUp);
      box.set_lefttop(discount.value!, left, 0.95 * trailDn + 0.05 * trailUp);
      box.set_rightbottom(discount.value!, i, trailDn);
      label.set_xy(discountLbl.value!, Math.trunc((left + i) / 2), trailDn);
    }
  }
  setDrawingBar(null);

  // drawings at bar_index + k after the last bar (up to 20 bars): on the bars of the symbol calendar
  const times: Array<{ time: number }> = bars.map((b) => ({ time: b.time }));
  for (let k = 1; k <= FUTURE_BARS && n > 1; k++) times.push({ time: timeAfterLastBar(bars, k, chart) });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    ...drawingOutputs(times, ms ? 'ms' : 's'),
  };
}

export const StrongDemandsSuppliesLiquidity = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
