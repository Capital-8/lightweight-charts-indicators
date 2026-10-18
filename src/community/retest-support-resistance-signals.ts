/**
 * Support/Resistance Re-test Finder
 *
 * Pivot highs and lows (wick or body) become candidate levels. A pivot high that price leaves upwards (low above
 * it) waits for a re-test: a bullish bar whose low touches the level and closes above it draws a support line from
 * the pivot (an "R" label below the bar); a pivot low left downwards and re-tested from below by a bearish bar
 * draws a resistance line ("R" above the bar). Candidates older than 1,000 bars, or broken before the re-test, are
 * dropped. Each line is extended to the next bar while it is updated, coloured by the close above / below it (or
 * faded by its age), and counts its breakouts; after "Breakouts Until Level Deletes" breakouts or "Bars Until Level
 * Deletes" bars it stops updating (or is deleted, or takes the unique colour). The labels show on the last 20,000
 * bars (show_last).
 * Alerts (alertcondition, `alerts` of the result): the eight conditions of the original (new support / resistance
 * re-test, support / resistance re-test broken downside / upside, any downside / upside break).
 *
 * Chart values read: whether the last bar is closed (`barstate.isconfirmed`: the script only works on closed bars).
 *
 * Reference: "Support/Resistance Re-test Finder [ChartPrime]" by ChartPrime
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © ChartPrime
 */

import {
  taCore, color, compare, line, resetDrawings, setDrawingBar, drawingOutputs,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { MarkerData } from '../types';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

type Line = ReturnType<typeof line.new>;

export interface RetestSupportResistanceSignalsInputs {
  levelMethod: 'Wick' | 'Body';
  leftBars: number;
  rightBars: number;
  /** Retest makes level weaker vs retest makes level stronger (label shape and place) */
  retestLogic: boolean;
  definitionOfDelete: 'Stop Updating Level' | 'Completely Delete Level' | 'Stop Updating Level & Turn Level Unique Color';
  flipsUntilDeletion: number;
  ageUntilDeletion: number;
  supportColor: string;
  resistanceColor: string;
  uniqueDeleteColor: string;
  changeColorMethod: 'Price Above/Below' | 'Fade Out Based On Age';
  lineWidth: number;
}

export const defaultInputs: RetestSupportResistanceSignalsInputs = {
  levelMethod: 'Wick',
  leftBars: 20,
  rightBars: 20,
  retestLogic: false,
  definitionOfDelete: 'Stop Updating Level',
  flipsUntilDeletion: 1,
  ageUntilDeletion: 300,
  supportColor: 'rgba(76, 175, 79, 0.5)',
  resistanceColor: 'rgba(255, 82, 82, 0.5)',
  uniqueDeleteColor: 'rgba(120, 123, 134, 0.5)',
  changeColorMethod: 'Price Above/Below',
  lineWidth: 10,
};

const MAIN_GROUP = 'Main Settings';
const DELETE_GROUP = 'Deletion Settings';
const COSMETIC_GROUP = 'Cosmetic Settings';

export const inputConfig: InputConfig[] = [
  { id: 'levelMethod', type: 'string', title: 'Detection Method', defval: 'Wick', options: ['Wick', 'Body'], group: MAIN_GROUP },
  { id: 'leftBars', type: 'int', title: 'Left Bars', defval: 20, group: MAIN_GROUP, inline: 'pivot' },
  { id: 'rightBars', type: 'int', title: 'Right Bars', defval: 20, group: MAIN_GROUP, inline: 'pivot' },
  { id: 'retestLogic', type: 'bool', title: 'Retest Weaker', defval: false, group: MAIN_GROUP,
    tooltip: 'Retest makes level weaker vs retest makes level stronger' },
  { id: 'definitionOfDelete', type: 'string', title: 'Delete Definition', defval: 'Stop Updating Level',
    options: ['Stop Updating Level', 'Completely Delete Level', 'Stop Updating Level & Turn Level Unique Color'], group: DELETE_GROUP },
  { id: 'flipsUntilDeletion', type: 'int', title: 'Breakouts Until Level Deletes', defval: 1, group: DELETE_GROUP },
  { id: 'ageUntilDeletion', type: 'int', title: 'Bars Until Level Deletes', defval: 300, group: DELETE_GROUP },
  { id: 'supportColor', type: 'color', title: 'Initial Support Re-Test Color', defval: 'rgba(76, 175, 79, 0.5)', group: COSMETIC_GROUP },
  { id: 'resistanceColor', type: 'color', title: 'Initial Resistance Re-Test Color', defval: 'rgba(255, 82, 82, 0.5)', group: COSMETIC_GROUP },
  { id: 'uniqueDeleteColor', type: 'color', title: 'Unique Deletion Color', defval: 'rgba(120, 123, 134, 0.5)', group: COSMETIC_GROUP },
  { id: 'changeColorMethod', type: 'string', title: 'Change Color Method', defval: 'Price Above/Below',
    options: ['Price Above/Below', 'Fade Out Based On Age'], group: COSMETIC_GROUP },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 10, group: COSMETIC_GROUP },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Support/Resistance Re-test Finder [ChartPrime]',
  shortTitle: 'Support/Resistance Re-test Finder [ChartPrime]',
  overlay: true,
};

/** indicator(max_lines_count = 500) */
const MAX_LINES = 500;
/** plotshape(show_last = 20000) */
const SHOW_LAST = 20000;
const GREEN = '#4CAF50';
const RED = '#FF5252';

interface FlipLevel {
  line: Line;
  variation: 'Support' | 'Resistance';
  age: number;
  flips: number;
  phase: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RetestSupportResistanceSignalsInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const { gt, lt, le, ge } = compare;
  const wick = cfg.levelMethod === 'Wick';
  const highSrc = bars.map((b) => (wick ? b.high : gt(b.close, b.open) ? b.close : b.open));
  const lowSrc = bars.map((b) => (wick ? b.low : lt(b.close, b.open) ? b.close : b.open));
  const pivotHigh = taCore.pivothigh(highSrc, cfg.leftBars, cfg.rightBars);
  const pivotLow = taCore.pivotlow(lowSrc, cfg.leftBars, cfg.rightBars);
  const lastConfirmed = lastBarConfirmedOf(chart);

  const firstPhaseHigh: Array<{ price: number; index: number }> = [];
  const firstPhaseLow: Array<{ price: number; index: number }> = [];
  const secondPhaseHigh: Array<{ price: number; index: number }> = [];
  const secondPhaseLow: Array<{ price: number; index: number }> = [];
  const flips: FlipLevel[] = [];
  const markers: MarkerData[] = [];
  // alertcondition flags in the original's order
  const flags: boolean[][] = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new Array<boolean>(n).fill(false));

  resetDrawings({ line: MAX_LINES });
  for (let bi = 0; bi < n; bi++) {
    setDrawingBar(bi, bi === n - 1);
    // if barstate.isconfirmed: every bar but a live last bar
    if (bi === n - 1 && !lastConfirmed) continue;
    const { high, low, close, open } = bars[bi];
    let newTestedSupport = false;
    let newTestedResistance = false;
    let supportBrokeDownside = false;
    let supportBrokeUpside = false;
    let resistanceBrokeDownside = false;
    let resistanceBrokeUpside = false;

    if (!Number.isNaN(pivotHigh[bi])) firstPhaseHigh.push({ price: pivotHigh[bi], index: bi - cfg.rightBars });
    if (!Number.isNaN(pivotLow[bi])) firstPhaseLow.push({ price: pivotLow[bi], index: bi - cfg.rightBars });

    // for i = array.size(a) > 0 ? array.size(a) - 1 : na to 0 (na start: no iteration)
    for (let i = secondPhaseHigh.length - 1; i >= 0; i--) {
      const { price, index } = secondPhaseHigh[i];
      if (le(low, price) && gt(close, price) && gt(close, open)) {
        const newLine = line.new(index, price, bi, price, 'bar_index', 'none', cfg.supportColor, undefined, cfg.lineWidth);
        flips.push({ line: newLine, variation: 'Support', age: 0, flips: 0, phase: 1 });
        secondPhaseHigh.splice(i, 1);
        newTestedSupport = true;
      } else if (bi - index > 1000 || lt(close, price)) {
        secondPhaseHigh.splice(i, 1);
      }
    }
    for (let i = secondPhaseLow.length - 1; i >= 0; i--) {
      const { price, index } = secondPhaseLow[i];
      if (ge(high, price) && lt(close, price) && lt(close, open)) {
        const newLine = line.new(index, price, bi, price, 'bar_index', 'none', cfg.resistanceColor, undefined, cfg.lineWidth);
        flips.push({ line: newLine, variation: 'Resistance', age: 0, flips: 0, phase: -1 });
        secondPhaseLow.splice(i, 1);
        newTestedResistance = true;
      } else if (bi - index > 1000 || gt(close, price)) {
        secondPhaseLow.splice(i, 1);
      }
    }
    for (let i = firstPhaseHigh.length - 1; i >= 0; i--) {
      const level = firstPhaseHigh[i];
      if (gt(low, level.price)) {
        secondPhaseHigh.push(level);
        firstPhaseHigh.splice(i, 1);
      } else if (bi - level.index > 1000) {
        firstPhaseHigh.splice(i, 1);
      }
    }
    for (let i = firstPhaseLow.length - 1; i >= 0; i--) {
      const level = firstPhaseLow[i];
      if (lt(high, level.price)) {
        secondPhaseLow.push(level);
        firstPhaseLow.splice(i, 1);
      } else if (bi - level.index > 1000) {
        firstPhaseLow.splice(i, 1);
      }
    }

    for (let i = flips.length - 1; i >= 0; i--) {
      const lv = flips[i];
      const lineAge = lv.age;
      const linePrice = line.get_y1(lv.line);
      line.set_x2(lv.line, bi + 1);
      const lineColor = lv.variation === 'Support' ? cfg.supportColor : cfg.resistanceColor;
      const newLineColor = cfg.changeColorMethod === 'Fade Out Based On Age'
        ? color.from_gradient(lineAge, 0, cfg.ageUntilDeletion, lineColor, String(color.new(lineColor, 100)))
        : gt(close, linePrice) ? cfg.supportColor : cfg.resistanceColor;
      line.set_color(lv.line, newLineColor);
      lv.age = lineAge + 1;
      if (lv.variation === 'Support') {
        if (lv.phase === 1 && lt(close, linePrice)) {
          lv.flips += 1;
          lv.phase = -1;
          supportBrokeDownside = true;
        } else if (lv.phase === -1 && gt(close, linePrice)) {
          lv.flips += 1;
          lv.phase = 1;
          supportBrokeUpside = true;
        }
      }
      if (lv.variation === 'Resistance') {
        if (lv.phase === -1 && gt(close, linePrice)) {
          lv.flips += 1;
          lv.phase = 1;
          resistanceBrokeUpside = true;
        } else if (lv.phase === 1 && lt(close, linePrice)) {
          lv.flips += 1;
          lv.phase = -1;
          resistanceBrokeDownside = true;
        }
      }
      if (lv.flips >= cfg.flipsUntilDeletion || lineAge >= cfg.ageUntilDeletion) {
        if (cfg.definitionOfDelete === 'Completely Delete Level') line.delete(lv.line);
        else if (cfg.definitionOfDelete === 'Stop Updating Level & Turn Level Unique Color') {
          line.set_color(lv.line, cfg.uniqueDeleteColor);
        }
        flips.splice(i, 1);
      }
    }

    flags[0][bi] = newTestedSupport;
    flags[1][bi] = newTestedResistance;
    flags[2][bi] = supportBrokeDownside;
    flags[3][bi] = supportBrokeUpside;
    flags[4][bi] = resistanceBrokeDownside;
    flags[5][bi] = resistanceBrokeUpside;
    flags[6][bi] = supportBrokeDownside || resistanceBrokeDownside;
    flags[7][bi] = supportBrokeUpside || resistanceBrokeUpside;

    // plotshape(newTestedSupport, "R", size.tiny, show_last = 20000) and the resistance one
    if (bi >= n - SHOW_LAST) {
      const t = bars[bi].time;
      if (newTestedSupport) {
        markers.push(cfg.retestLogic
          ? { time: t, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'R', textColor: '#FFFFFF', size: 'tiny' }
          : { time: t, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'R', textColor: '#FFFFFF', size: 'tiny' });
      }
      if (newTestedResistance) {
        markers.push(cfg.retestLogic
          ? { time: t, position: 'belowBar', shape: 'labelUp', color: GREEN, text: 'R', textColor: '#FFFFFF', size: 'tiny' }
          : { time: t, position: 'aboveBar', shape: 'labelDown', color: RED, text: 'R', textColor: '#FFFFFF', size: 'tiny' });
      }
    }
  }
  setDrawingBar(null);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    markers,
    ...drawingOutputs(bars),
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions (no message given: the default message) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'New Support Re-Test', message: 'Alert Fired!' },
  { id: 'alert1', title: 'New Resistance Re-Test', message: 'Alert Fired!' },
  { id: 'alert2', title: 'Support Re-Test Downside Break', message: 'Alert Fired!' },
  { id: 'alert3', title: 'Support Re-Test Upside Break', message: 'Alert Fired!' },
  { id: 'alert4', title: 'Resistance Re-Test Downside Break', message: 'Alert Fired!' },
  { id: 'alert5', title: 'Resistance Re-Test Upside Break', message: 'Alert Fired!' },
  { id: 'alert6', title: 'Any Downside Break', message: 'Alert Fired!' },
  { id: 'alert7', title: 'Any Upside Break', message: 'Alert Fired!' },
];

export const RetestSupportResistanceSignals = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
