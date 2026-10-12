/**
 * Order Blocks Finder Major OB + Supply and Demand Zones
 *
 * Major highs and lows, breaks of structure and order block zones.
 * - A candle break is a close above the high (bull) or below the low (bear) of the bar before. A bear break right
 *   after a bull break marks a high: the highest high since the last bear break (5 bars more, or 3 bars more when
 *   the high before is the same value); a bull break right after a bear break marks a low the same way.
 * - The major high ("Major High Levels") moves to a higher high, and to a lower high only after a bearish break of
 *   structure that came after the start of that high; the major low works the other way round.
 * - A close crossing above the major high is a bullish break of structure (BoS), below the major low a bearish one.
 * - A bullish BoS draws a demand zone on the candle before the last change of the low; a bearish BoS draws a supply
 *   zone on the candle before the last change of the high. With "Order Block Refine" the zone is narrowed from the
 *   candles around it and the ATR (55): "Defensive" keeps the far part of a wide zone, "Aggressive" the whole zone.
 * - A zone is two dashed lines (distal and proximal price), a dotted line in the middle and a fill. It grows one bar
 *   at a time while the price stays away from its proximal price, and stops for good when the price crosses its
 *   distal price.
 * - Options: the major levels as plots ("Show High Level" / "Show Low Level"; the plots have values but no colour
 *   when off) and the last support / resistance as a dotted line extended to the right.
 * At most 500 lines (and 500 fills) are kept.
 *
 * Limit of the port: the alerts (AlertSenderLibrary_TradingFinder and the seven alert inputs) give no output.
 *
 * Reference: "Order Blocks Finder [TradingFinder] Major OB + Supply and Demand Zones" by TradingFinder
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © TFlab
 */

import {
  ta, Series, color, line, linefill, resetDrawings, setDrawingBar, varDrawing,
  type Line, type Linefill, type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';

export interface OrderBlocksFinderMajorObSupplyAndDemandInputs {
  /** Order Block Refine */
  obRefine: 'On' | 'Off';
  /** Refine Type */
  refineType: 'Defensive' | 'Aggressive';
  /** Show High Level */
  showHigh: 'No' | 'Yes';
  /** Show Low Level */
  showLow: 'No' | 'Yes';
  /** Show Last Support */
  showSupport: 'No' | 'Yes';
  /** Show Last Resistance */
  showResistance: 'No' | 'Yes';
  /** Demand Zone Color */
  demandColor: string;
  /** Supply Zone Color */
  supplyColor: string;
  /** Alert (no output in the port) */
  alert: 'On' | 'Off';
  /** Alert Name (no output in the port) */
  alertName: string;
  /** Message Frequency (no output in the port) */
  frequency: 'All' | 'Once Per Bar' | 'Per Bar Close';
  /** Show Alert time by Time Zone (no output in the port) */
  alertTimezone: string;
  /** Display More Info (no output in the port) */
  moreInfo: 'On' | 'Off';
  /** Long Signal Message (no output in the port) */
  messageBull: string;
  /** Short Signal Message (no output in the port) */
  messageBear: string;
}

export const defaultInputs: OrderBlocksFinderMajorObSupplyAndDemandInputs = {
  obRefine: 'On',
  refineType: 'Defensive',
  showHigh: 'No',
  showLow: 'No',
  showSupport: 'No',
  showResistance: 'No',
  demandColor: 'rgba(105, 191, 111, 0.5)',
  supplyColor: 'rgba(242, 34, 51, 0.4)',
  alert: 'On',
  alertName: 'Order Blocks Finder [TradingFinder]',
  frequency: 'Once Per Bar',
  alertTimezone: 'UTC',
  moreInfo: 'On',
  messageBull: 'Long Position',
  messageBear: 'Short Position',
};

export const inputConfig: InputConfig[] = [
  { id: 'obRefine', type: 'string', title: 'Order Block Refine', defval: 'On', options: ['On', 'Off'], group: 'Order Block Setting' },
  { id: 'refineType', type: 'string', title: 'Refine Type', defval: 'Defensive', options: ['Defensive', 'Aggressive'], group: 'Order Block Setting' },
  { id: 'showHigh', type: 'string', title: 'Show High Level', defval: 'No', options: ['No', 'Yes'], group: 'Major Levels' },
  { id: 'showLow', type: 'string', title: 'Show Low Level', defval: 'No', options: ['No', 'Yes'], group: 'Major Levels' },
  { id: 'showSupport', type: 'string', title: 'Show Last Support', defval: 'No', options: ['No', 'Yes'], group: 'Support and Resistance' },
  { id: 'showResistance', type: 'string', title: 'Show Last Resistance', defval: 'No', options: ['No', 'Yes'], group: 'Support and Resistance' },
  { id: 'demandColor', type: 'color', title: 'Demand Zone Color', defval: 'rgba(105, 191, 111, 0.5)', group: ' Color Setting' },
  { id: 'supplyColor', type: 'color', title: 'Supply Zone Color', defval: 'rgba(242, 34, 51, 0.4)', group: ' Color Setting' },
  { id: 'alert', type: 'string', title: 'Alert', defval: 'On', options: ['On', 'Off'], group: 'Alert' },
  { id: 'alertName', type: 'string', title: 'Alert Name', defval: 'Order Blocks Finder [TradingFinder]', group: 'Alert' },
  { id: 'frequency', type: 'string', title: 'Message Frequency', defval: 'Once Per Bar', options: ['All', 'Once Per Bar', 'Per Bar Close'], group: 'Alert' },
  { id: 'alertTimezone', type: 'string', title: 'Show Alert time by Time Zone', defval: 'UTC', group: 'Alert' },
  { id: 'moreInfo', type: 'string', title: 'Display More Info', defval: 'On', options: ['On', 'Off'], group: 'Alert' },
  { id: 'messageBull', type: 'string', title: 'Long Signal Message', defval: 'Long Position', group: 'Alert' },
  { id: 'messageBear', type: 'string', title: 'Short Signal Message', defval: 'Short Position', group: 'Alert' },
];

const HIGH_CSS = 'rgb(5, 148, 10)';
const LOW_CSS = 'rgb(184, 0, 0)';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Major High Levels', color: HIGH_CSS, lineWidth: 1 },
  { id: 'plot1', title: 'Major Low Levels', color: LOW_CSS, lineWidth: 1 },
];

export const metadata = {
  title: 'Order Blocks Finder [TradingFinder] Major OB + Supply and Demand Zones',
  shortTitle: ' OB Finder/ Major OB / Supply & Demand',
  overlay: true,
};

/** indicator(max_lines_count = 500, max_labels_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons within 1e-10; na compares false */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => a - b >= -EPS;
const le = (a: number, b: number) => b - a >= -EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;
const ne = (a: number, b: number) => Math.abs(a - b) > EPS;
/** math.min / math.max: na with an na argument */
const minOf = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.min(...v));
const maxOf = (...v: number[]) => (v.some((x) => isNaN(x)) ? NaN : Math.max(...v));

export function calculate(
  bars: Bar[],
  inputs: Partial<OrderBlocksFinderMajorObSupplyAndDemandInputs> = {},
): IndicatorResult & { lines: LineDrawingData[]; linefills: LinefillData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const refineOn = cfg.obRefine === 'On';
  const defensive = cfg.refineType === 'Defensive';
  const aggressive = cfg.refineType === 'Aggressive';
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const O = bars.map((b) => b.open);
  const H = bars.map((b) => b.high);
  const L = bars.map((b) => b.low);
  const C = bars.map((b) => b.close);
  const range = bars.map((b) => b.high - b.low);
  const body = bars.map((b) => b.close - b.open);
  /** x[k] on bar i: an na offset reads the current bar, a bar before the first one is na */
  const at = (x: number[], i: number, k: number) => {
    if (isNaN(k)) return x[i];
    const j = i - Math.trunc(k);
    return j >= 0 && j <= i ? x[j] : NaN;
  };

  // Candle_Break, ta.valuewhen(close > high[1] / close < low[1], bar_index, 0)
  const breakOf: Array<'bull' | 'bear' | null> = [];
  const lenH: number[] = [];
  const lenL: number[] = [];
  const lenH1: number[] = [];
  const lenL1: number[] = [];
  let idxBull = NaN;
  let idxBear = NaN;
  for (let i = 0; i < n; i++) {
    const up = i > 0 && gt(C[i], H[i - 1]);
    const down = i > 0 && lt(C[i], L[i - 1]);
    // an `if` expression without `else` keeps the value of the bar before when no branch runs (measured)
    breakOf.push(up ? 'bull' : down ? 'bear' : i > 0 ? breakOf[i - 1] : null);
    if (up) idxBull = i;
    if (down) idxBear = i;
    lenH.push(isNaN(idxBear) ? 1 : i - idxBear + 5);
    lenL.push(isNaN(idxBull) ? 1 : i - idxBull + 5);
    lenH1.push(isNaN(idxBear) ? 1 : i - idxBear + 3);
    lenL1.push(isNaN(idxBull) ? 1 : i - idxBull + 3);
  }
  const highS = Series.fromBars(bars, 'high');
  const lowS = Series.fromBars(bars, 'low');
  const highFirst = A(ta.highest(highS, Series.fromArray(bars, lenH)));
  const lowFirst = A(ta.lowest(lowS, Series.fromArray(bars, lenL)));
  const highFirst1 = A(ta.highest(highS, Series.fromArray(bars, lenH1)));
  const lowFirst1 = A(ta.lowest(lowS, Series.fromArray(bars, lenL1)));
  const ATR = A(ta.atr(bars, 55));

  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });

  const highSec: number[] = [];
  const lowSec: number[] = [];
  const highCorrect: number[] = [];
  const lowCorrect: number[] = [];
  const highF: number[] = [];
  const lowF: number[] = [];
  const ydp12Hist: number[] = [];
  const ysp12Hist: number[] = [];
  const plot0: Array<{ time: number; value: number; color: string }> = [];
  const plot1: Array<{ time: number; value: number; color: string }> = [];

  let startHigh = 0;
  let startLow = 0;
  let hcVar = 0; // var float High_Correct = 0.0
  let lcVar = 0;
  let hf = 0; // var float High_Correct_f = 0.0
  let lf = 0;
  let bullBoS = 0;
  let bearBoS = 0;
  let BoS = 'Hi';
  const sLine = varDrawing<Line>();
  const rLine = varDrawing<Line>();
  let supplyOB = NaN; // ta.valuewhen(High_Correct != High_Correct[1], bar_index[1], 0)
  let demandOB = NaN;
  let demandCheck = 0;
  let supplyCheck = 0;
  // demand / supply zone data
  let ydp12 = 0, xdp1 = 0, ydd12 = 0, xdd1 = 0, xdd2 = 0;
  let ysp12 = 0, xsp1 = 0, ysd12 = 0, xsd1 = 0;
  // refiner state
  let dcra1 = 0, dcro = 0;
  let dMinOpen = 0, dMinLow = 0, dMinClose = 0;
  let dMaxOpen = 0, dMaxHigh = 0, dMaxLow = 0, dMaxClose = 0;
  let dda = 0, dpa = 0;
  let scra1 = 0, scro = 0;
  let sMinOpen = 0, sMinLow = 0, sMinClose = 0;
  let sMaxHigh = 0;
  let sda = 0, spa = 0;
  let dProximal = 0, dDistal = 0, sProximal = 0, sDistal = 0;
  // LinerFunctionDem / LinerFunctionSup
  let demCheck = true;
  let supCheck = true;
  const dem = { distal: varDrawing<Line>(), proximal: varDrawing<Line>(), mid: varDrawing<Line>(), fill: varDrawing<Linefill>() };
  const sup = { distal: varDrawing<Line>(), proximal: varDrawing<Line>(), mid: varDrawing<Line>(), fill: varDrawing<Linefill>() };
  const edgeCss = String(color.rgb(0, 0, 0, 45));
  const midCss = String(color.rgb(0, 0, 0));
  const setX2 = (l: Line | undefined, x: number) => {
    if (l) line.set_x2(l, x);
  };

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const t = bars[i].time;
    const brk = breakOf[i];
    const brkPrev = i > 0 ? breakOf[i - 1] : null;

    // High_sec / Low_sec: `if` expressions without `else`, the value of the bar before when the branch does not run
    let hs = i > 0 ? highSec[i - 1] : NaN;
    if (brk === 'bear' && brkPrev === 'bull') {
      startHigh = i;
      hs = eq(i > 0 ? highCorrect[i - 1] : NaN, highFirst[i]) ? highFirst1[i] : highFirst[i];
    }
    let ls = i > 0 ? lowSec[i - 1] : NaN;
    if (brk === 'bull' && brkPrev === 'bear') {
      startLow = i;
      ls = eq(i > 0 ? lowCorrect[i - 1] : NaN, lowFirst[i]) ? lowFirst1[i] : lowFirst[i];
    }
    highSec.push(hs);
    lowSec.push(ls);
    hcVar = !isNaN(hs) ? hs : i > 0 ? highSec[i - 1] : NaN;
    lcVar = !isNaN(ls) ? ls : i > 0 ? lowSec[i - 1] : NaN;
    highCorrect.push(hcVar);
    lowCorrect.push(lcVar);
    const HC = hcVar;
    const LC = lcVar;

    // High_Correct_f / Low_Correct_f (the value before the assignment is that of the bar before)
    const hfPrev = i > 0 ? highF[i - 1] : NaN;
    if (eq(hf, 0)) hf = HC;
    else if (gt(HC, hfPrev) && ne(hf, 0)) hf = HC;
    else if (lt(HC, hfPrev)) hf = BoS === 'Bear BoS' && bearBoS >= startHigh ? HC : hf;
    else if (eq(hf, hfPrev) && ne(hf, 0)) hf = hf;
    else hf = HC;
    highF.push(hf);

    const lfPrev = i > 0 ? lowF[i - 1] : NaN;
    if (eq(lf, 0)) lf = LC;
    else if (lt(LC, lfPrev) && ne(lf, 0)) lf = LC;
    else if (gt(LC, lfPrev)) lf = BoS === 'Bull BoS' && bullBoS >= startLow ? LC : lf;
    else if (eq(lf, lfPrev) && ne(lf, 0)) lf = lf;
    else lf = LC;
    lowF.push(lf);

    // last support / resistance
    if (ne(lf, lfPrev) && cfg.showSupport === 'Yes') {
      if (sLine.value) line.delete(sLine.value);
      sLine.value = line.new(i, lf, i + 1, lf, 'bar_index', 'right', String(color.rgb(0, 82, 3)), 'dotted');
    }
    if (ne(hf, hfPrev) && cfg.showResistance === 'Yes') {
      if (rLine.value) line.delete(rLine.value);
      rLine.value = line.new(i, hf, i + 1, hf, 'bar_index', 'right', String(color.rgb(146, 33, 33)), 'dotted');
    }

    plot0.push({ time: t, value: hf, color: cfg.showHigh === 'Yes' && eq(hf, hfPrev) ? HIGH_CSS : 'transparent' });
    plot1.push({ time: t, value: lf, color: cfg.showLow === 'Yes' && eq(lf, lfPrev) ? LOW_CSS : 'transparent' });

    // BoS detector
    const cPrev = i > 0 ? C[i - 1] : NaN;
    const bullBoSPrev = bullBoS;
    const bearBoSPrev = bearBoS;
    if (gt(C[i], hf) && le(cPrev, hf)) {
      BoS = 'Bull BoS';
      bullBoS = i;
    } else if (lt(C[i], lf) && ge(cPrev, lf)) {
      BoS = 'Bear BoS';
      bearBoS = i;
    } else {
      BoS = '0';
    }

    // order block bars
    if (i > 0 && ne(HC, highCorrect[i - 1])) supplyOB = i - 1;
    if (i > 0 && ne(LC, lowCorrect[i - 1])) demandOB = i - 1;
    const D = demandOB;
    const S = supplyOB;
    const demandCond = ((BoS === 'Bull BoS' && bullBoSPrev > bearBoS) || (BoS === 'Bull BoS' && bullBoS > bearBoS))
      && !isNaN(D) && demandCheck !== D;
    const supplyCond = ((BoS === 'Bear BoS' && bearBoSPrev > bullBoS) || (BoS === 'Bear BoS' && bearBoS > bullBoS))
      && !isNaN(S) && supplyCheck !== S;

    const ATRi = ATR[i];
    const bodyNow = body[i];

    // demand candle ranges
    const kD = i - D; // na when there is no demand bar yet
    if (i >= D + 1) {
      dcra1 = at(range, i, kD + 1);
      dcro = at(range, i, kD);
    }
    if (i > D + 1) {
      dMinOpen = minOf(at(O, i, kD - 2), at(O, i, kD + 1), at(O, i, kD), at(O, i, kD - 1));
      dMinLow = minOf(at(L, i, kD - 2), at(L, i, kD + 1), at(L, i, kD), at(L, i, kD - 1));
      dMinClose = minOf(at(C, i, kD - 2), at(C, i, kD + 1), at(C, i, kD), at(C, i, kD - 1));
      dMaxOpen = maxOf(at(O, i, kD - 2), at(O, i, kD + 1), at(O, i, kD), at(O, i, kD - 1));
      dMaxHigh = maxOf(at(H, i, kD - 2), at(H, i, kD + 1), at(H, i, kD), at(H, i, kD - 1));
      dMaxLow = maxOf(at(L, i, kD - 2), at(L, i, kD + 1), at(L, i, kD), at(L, i, kD - 1));
      dMaxClose = maxOf(at(C, i, kD - 2), at(C, i, kD + 1), at(C, i, kD), at(C, i, kD - 1));
    } else if (i >= D) {
      dMinOpen = minOf(at(O, i, kD + 1), at(O, i, kD), at(O, i, kD - 1));
      dMinLow = minOf(at(L, i, kD + 1), at(L, i, kD), at(L, i, kD - 1));
      dMinClose = minOf(at(C, i, kD + 1), at(C, i, kD), at(C, i, kD - 1));
      dMaxOpen = maxOf(at(O, i, kD + 1), at(O, i, kD), at(O, i, kD - 1));
      dMaxHigh = maxOf(at(H, i, kD + 1), at(H, i, kD), at(H, i, kD - 1));
      dMaxLow = maxOf(at(L, i, kD + 1), at(L, i, kD), at(L, i, kD - 1));
      dMaxClose = maxOf(at(C, i, kD + 1), at(C, i, kD), at(C, i, kD - 1));
    }

    // demand order block refiner
    if (le(dcro, ATRi * 0.5)) {
      dpa = at(H, i, kD);
      dda = dMinLow;
    } else if (gt(dcro, ATRi * 0.5) && le(dcro, ATRi)) {
      if (gt(bodyNow, 0) || eq(bodyNow, 0)) {
        dpa = at(C, i, kD);
        dda = dMinLow;
      } else if (lt(bodyNow, 0)) {
        dpa = at(O, i, kD);
        dda = dMinLow;
      }
    } else if (gt(dcro, ATRi)) {
      if (lt(at(L, i, kD + 1), at(H, i, kD))) {
        if (gt(at(L, i, kD + 1), at(L, i, kD))) {
          dpa = at(L, i, kD + 1);
          dda = at(L, i, kD);
        } else if (le(at(L, i, kD + 1), at(L, i, kD))) {
          const b = at(body, i, kD + 1);
          if (gt(b, 0) || eq(b, 0)) {
            if (gt(dcra1, ATRi)) {
              dpa = dMaxOpen;
              dda = dMinLow;
            } else if (lt(dcra1, ATRi)) {
              dpa = dMaxClose;
              dda = dMinLow;
            }
          } else if (lt(b, 0)) {
            if (gt(dcra1, ATRi)) {
              dpa = dMaxOpen;
              dda = dMinLow;
            } else if (lt(dcra1, ATRi)) {
              dpa = dMaxOpen;
              dda = dMinLow;
            }
          }
        }
      } else if (!lt(at(L, i, kD + 1), at(H, i, kD))) {
        if (gt(dMinLow - dMinOpen, dMinLow - dMinClose) && le(dMinLow - dMinOpen, ATRi) && ge(dMinLow - dMinOpen, ATRi * 0.5)) {
          dpa = dMinOpen;
          dda = dMinLow;
        } else if (lt(dMinLow - dMinOpen, dMinLow - dMinClose) && le(dMinLow - dMinClose, ATRi)
          && ge(dMinLow - dMinClose, ATRi * 0.5)) {
          dpa = dMinClose;
          dda = dMinLow;
        }
      }
    } else if (gt(bodyNow, 0)) {
      dpa = dMaxHigh;
      dda = dMinLow;
    } else if (lt(bodyNow, 0)) {
      dpa = dMaxHigh;
      dda = dMaxLow;
    }

    // supply candle ranges (computed on every bar)
    const kS = i - S;
    scra1 = at(H, i, kS + 1) - at(L, i, kS + 1);
    scro = at(H, i, kS) - at(L, i, kS);
    if (i > S + 1) {
      sMinOpen = minOf(at(O, i, kS - 2), at(O, i, kS + 1), at(O, i, kS), at(O, i, kS - 1));
      sMinLow = minOf(at(L, i, kS - 2), at(L, i, kS + 1), at(L, i, kS), at(L, i, kS - 1));
      sMinClose = minOf(at(C, i, kS - 2), at(C, i, kS + 1), at(C, i, kS), at(C, i, kS - 1));
      sMaxHigh = maxOf(at(H, i, kS - 2), at(H, i, kS + 1), at(H, i, kS), at(H, i, kS - 1));
    } else if (i >= S) {
      sMinOpen = minOf(at(O, i, kS + 1), at(O, i, kS), at(O, i, kS - 1));
      sMinLow = minOf(at(L, i, kS + 1), at(L, i, kS), at(L, i, kS - 1));
      sMinClose = minOf(at(C, i, kS + 1), at(C, i, kS), at(C, i, kS - 1));
      sMaxHigh = maxOf(at(H, i, kS + 1), at(H, i, kS), at(H, i, kS - 1));
    }

    // supply order block refiner
    if (le(scro, ATRi * 0.5)) {
      spa = at(L, i, kS);
      sda = sMaxHigh;
    } else if (gt(scro, ATRi * 0.5) && le(scro, ATRi)) {
      if (gt(bodyNow, 0) || eq(bodyNow, 0)) {
        spa = at(C, i, kS);
        sda = sMaxHigh;
      } else if (lt(bodyNow, 0)) {
        spa = at(O, i, kS);
        sda = sMaxHigh;
      }
    } else if (gt(scro, ATRi)) {
      if (gt(at(H, i, kS - 1), at(L, i, kS))) {
        if (gt(at(H, i, kS - 1), at(H, i, kS))) {
          spa = at(H, i, kS - 1);
          sda = at(H, i, kS);
        } else if (le(at(H, i, kS - 1), at(H, i, kS))) {
          const b = at(body, i, kS - 1);
          if (gt(b, 0) || eq(b, 0)) {
            if (gt(scra1, ATRi)) {
              spa = sMinClose;
              sda = sMaxHigh;
            } else if (lt(scra1, ATRi)) {
              spa = sMinOpen;
              sda = sMaxHigh;
            }
          } else if (lt(b, 0)) {
            if (gt(scra1, ATRi)) {
              spa = sMinOpen;
              sda = sMaxHigh;
            } else if (lt(scra1, ATRi)) {
              spa = sMaxHigh;
              sda = at(H, i, kS - 1);
            }
          }
        }
      } else if (!gt(at(H, i, kS + 1), at(L, i, kS))) {
        if (gt(sMaxHigh - sMinOpen, sMaxHigh - sMinClose) && le(sMaxHigh - sMinOpen, ATRi) && ge(sMaxHigh - sMinOpen, ATRi * 0.5)) {
          spa = sMinOpen;
          sda = sMaxHigh;
        } else if (lt(sMaxHigh - dMinOpen, sMaxHigh - dMinClose) && le(sMaxHigh - dMinClose, ATRi)
          && ge(sMaxHigh - dMinClose, ATRi * 0.5)) {
          // as in the original, this test reads the demand values
          spa = sMinClose;
          sda = sMaxHigh;
        }
      }
    } else if (gt(bodyNow, 0) || lt(bodyNow, 0)) {
      spa = sMinLow;
      sda = sMaxHigh;
    }

    // refine type
    if (defensive) {
      const w = dpa - dda;
      if (ge(w, ATRi * 3)) {
        dDistal = dda;
        dProximal = dpa - w * 0.7;
      } else if (lt(w, ATRi * 3) && ge(w, ATRi * 2)) {
        dDistal = dda;
        dProximal = dpa - w * 0.6;
      } else if (lt(w, ATRi * 2) && ge(w, ATRi * 1.6)) {
        dDistal = dda;
        dProximal = dpa - w * 0.5;
      } else if (lt(w, ATRi * 1.6) && gt(w, ATRi)) {
        dDistal = dda;
        dProximal = dpa - w * 0.25;
      } else if (le(w, ATRi)) {
        dDistal = dda;
        dProximal = dpa;
      }
      const v = sda - spa;
      if (ge(v, ATRi * 3)) {
        sDistal = sda;
        sProximal = spa + v * 0.7;
      } else if (lt(v, ATRi * 3) && ge(v, ATRi * 2)) {
        sDistal = sda;
        sProximal = spa + v * 0.6;
      } else if (lt(v, ATRi * 2) && ge(v, ATRi * 1.6)) {
        sDistal = sda;
        sProximal = spa + v * 0.5;
      } else if (lt(v, ATRi * 1.6) && gt(v, ATRi)) {
        sDistal = sda;
        sProximal = spa + v * 0.25;
      } else if (le(v, ATRi)) {
        sDistal = sda;
        sProximal = spa;
      }
    } else if (aggressive) {
      dDistal = dda;
      dProximal = dpa;
      sDistal = sda;
      sProximal = spa;
    }

    const ydp12Prev = i > 0 ? ydp12Hist[i - 1] : NaN;
    const ysp12Prev = i > 0 ? ysp12Hist[i - 1] : NaN;
    if (demandCond) {
      demandCheck = D;
      ydp12 = refineOn ? dProximal : at(H, i, kD);
      xdp1 = D;
      ydd12 = refineOn ? dDistal : at(L, i, kD);
      xdd1 = D;
      xdd2 = D + 1;
    }
    if (supplyCond) {
      supplyCheck = S;
      ysp12 = refineOn ? sProximal : at(L, i, kS);
      xsp1 = S;
      ysd12 = refineOn ? sDistal : at(H, i, kS);
      xsd1 = S;
    }
    ydp12Hist.push(ydp12);
    ysp12Hist.push(ysp12);

    // LinerFunctionDem(XDd1, YDd12, XDd2, YDd12, XDp1, YDp12, XDp2, YDp12, bar_index)
    if (demandCond) {
      dem.distal.value = line.new(xdd1, ydd12, xdd2, ydd12, 'bar_index', 'none', edgeCss, 'dashed', 1);
      dem.proximal.value = line.new(xdp1, ydp12, xdd2, ydp12, 'bar_index', 'none', edgeCss, 'dashed', 1);
      dem.mid.value = line.new(xdp1, (ydp12 + ydd12) / 2, xdd2, (ydp12 + ydd12) / 2, 'bar_index', 'none', midCss, 'dotted', 1);
      dem.fill.value = linefill.new(dem.distal.value, dem.proximal.value, cfg.demandColor);
    }
    if ((gt(bars[i].low, ydp12) || eq(xdd1, ydp12Prev)) && demCheck) {
      setX2(dem.distal.value, i + 1);
      setX2(dem.proximal.value, i + 1);
      setX2(dem.mid.value, i + 1);
    }
    if (lt(bars[i].low, ydd12) && i > 0 && gt(bars[i - 1].low, ydd12)) demCheck = false;
    if (demandCond) demCheck = true;

    // LinerFunctionSup(XSd1, YSd12, XSd2, YSd12, XSp1, YSp12, XSp2, YSp12, bar_index): the lines end on the current bar
    if (supplyCond) {
      sup.distal.value = line.new(xsd1, ysd12, i, ysd12, 'bar_index', 'none', edgeCss, 'dashed', 1);
      sup.proximal.value = line.new(xsp1, ysp12, i, ysp12, 'bar_index', 'none', edgeCss, 'dashed', 1);
      sup.mid.value = line.new(xsp1, (ysp12 + ysd12) / 2, i, (ysp12 + ysd12) / 2, 'bar_index', 'none', midCss, 'dotted', 1);
      sup.fill.value = linefill.new(sup.distal.value, sup.proximal.value, cfg.supplyColor);
    }
    if ((lt(bars[i].high, ysp12) || eq(xsd1, ysp12Prev)) && supCheck) {
      setX2(sup.distal.value, i + 1);
      setX2(sup.proximal.value, i + 1);
      setX2(sup.mid.value, i + 1);
    }
    if (gt(bars[i].high, ysd12) && i > 0 && lt(bars[i - 1].high, ysd12)) supCheck = false;
    if (supplyCond) supCheck = true;
  }
  setDrawingBar(null);

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const live = new Set(line.all());
  // a line with an na coordinate is not drawn
  const drawn = (l: Line) => live.has(l) && !isNaN(l.x1) && !isNaN(l.x2) && !isNaN(l.y1) && !isNaN(l.y2);
  const out = (l: Line): LineDrawingData => ({
    time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color), width: 1,
    style: l.style as 'dashed' | 'dotted', ...(l.extend === 'right' ? { extend: 'right' as const } : {}),
  });
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1 },
    lines: line.all().filter(drawn).map(out),
    // a fill whose line was deleted is not drawn
    linefills: linefill.all().filter((f) => drawn(f.line1) && drawn(f.line2))
      .map((f) => ({ line1: out(f.line1), line2: out(f.line2), color: String(f.color) })),
  };
}

export const OrderBlocksFinderMajorObSupplyAndDemand = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
