/**
 * Range Average Retest Model [LuxAlgo]
 *
 * Swing areas from legs: a bar "Pivot Length" bars back whose high is above the highest high of the bars after it
 * starts a bearish leg, a low below the lowest low a bullish leg. Each leg start closes the area of the leg before
 * (its high and low are the two swing levels, its average is rounded to the symbol tick) and opens a new one. An
 * area whose average is within "Threshold" times the ATR (20 bars for the first 200 bars, then 200) of the average
 * of another untouched recent area is dropped.
 *
 * Between "Minimum distance" and "Maximum distance" bars after its end, a close crossing the average of an untouched
 * area opens a trade (short on a cross up, long on a cross down) with a take profit and a stop loss of a multiple of
 * the same ATR; only one open trade at a time unless "Overlap trades" is on. A trade closes when the high or the low
 * passes one of its levels.
 *
 * Drawings, made once on the last closed bar (the bar before the last when the last bar is still open, as the
 * original draws on the last confirmed historical bar): two lines per retested area, a take-profit box and a
 * stop-loss box per trade (to the bar of the close, or to the drawing bar for an open trade) and a dashed line from
 * the area start at the average. At most 500 lines and 500 boxes are kept.
 *
 * Chart values (third argument): the symbol tick (the area average; 0.01 without it) and whether the last bar is
 * closed (closed without it).
 *
 * Reference: "Range Average Retest Model [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, math, line, box, resetDrawings, setDrawingBar,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar,
} from 'oakscriptjs';
import type { BoxData, LineDrawingData } from '../types';
import { lastBarConfirmedOf, mintickOf, type ChartContext } from '../chart-context';

export interface RangeAverageRetestModelInputs {
  pivotLength: number;
  areaSelectionMode: 'BULLISH' | 'BEARISH' | 'BOTH';
  areaThresholdMultiplier: number;
  maximumDistanceFromArea: number;
  minimumDistanceFromArea: number;
  takeProfitMultiplier: number;
  stopLossMultiplier: number;
  showAreas: boolean;
  bullAreaColor: string;
  bearAreaColor: string;
  showAverage: boolean;
  bullAvgColor: string;
  bearAvgColor: string;
  showTPAreas: boolean;
  takeProfitColor: string;
  showSLAreas: boolean;
  stopLossColor: string;
  overlappingTrades: boolean;
}

export const defaultInputs: RangeAverageRetestModelInputs = {
  pivotLength: 20,
  areaSelectionMode: 'BOTH',
  areaThresholdMultiplier: 4.0,
  maximumDistanceFromArea: 200,
  minimumDistanceFromArea: 10,
  takeProfitMultiplier: 8.0,
  stopLossMultiplier: 4.0,
  showAreas: true,
  bullAreaColor: '#089981',
  bearAreaColor: '#F23645',
  showAverage: true,
  bullAvgColor: '#089981',
  bearAvgColor: '#F23645',
  showTPAreas: true,
  takeProfitColor: 'rgba(8, 153, 129, 0.25)',
  showSLAreas: true,
  stopLossColor: 'rgba(242, 54, 69, 0.25)',
  overlappingTrades: false,
};

const SHOW_AREAS_TIP = 'Activate/deactivate areas, select colours for bullish and bearish areas.';

export const inputConfig: InputConfig[] = [
  {
    id: 'pivotLength', type: 'int', title: 'Pivot Length', defval: 20, min: 1, group: 'SWINGS',
    tooltip: 'How many bars are used to confirm a turn. The larger this parameter is, the larger and fewer swing areas will be detected.',
  },
  {
    id: 'areaSelectionMode', type: 'string', title: 'Selection Mode', defval: 'BOTH', options: ['BULLISH', 'BEARISH', 'BOTH'], group: 'SWINGS',
    tooltip: 'Swing area detection mode, detect only bullish swings, only bearish swings or both.',
  },
  {
    id: 'areaThresholdMultiplier', type: 'float', title: 'Threshold', defval: 4.0, step: 0.25, group: 'SWINGS',
    tooltip: 'Swing area comparator. This threshold is multiplied by a measure of volatility (average true range over the last 200 bars), for a new swing area to be detected it must have an average level that is sufficiently distant from the average level of any untouched swing area, this parameter controls that distance.',
  },
  { id: 'maximumDistanceFromArea', type: 'int', title: 'Maximum distance', defval: 200, group: 'TRADES', tooltip: 'Maximum distance allowed between a swing area and a trade' },
  { id: 'minimumDistanceFromArea', type: 'int', title: 'Minimum distance', defval: 10, group: 'TRADES', tooltip: 'Minimum distance allowed between a swing area and a trade' },
  {
    id: 'takeProfitMultiplier', type: 'float', title: 'Take profit', defval: 8.0, group: 'TRADES',
    tooltip: 'The size of the take profit - this threshold is multiplied by a measure of volatility (the average true range over the last 200 bars).',
  },
  {
    id: 'stopLossMultiplier', type: 'float', title: 'Stop loss', defval: 4.0, group: 'TRADES',
    tooltip: 'The size of the stop-loss: this threshold is multiplied by a measure of volatility (the average true range over the last 200 bars).',
  },
  { id: 'showAreas', type: 'bool', title: 'Show Ranges', defval: true, group: 'STYLE', inline: '1', tooltip: SHOW_AREAS_TIP },
  { id: 'bullAreaColor', type: 'color', title: '', defval: '#089981', group: 'STYLE', inline: '1' },
  { id: 'bearAreaColor', type: 'color', title: '', defval: '#F23645', group: 'STYLE', inline: '1' },
  { id: 'showAverage', type: 'bool', title: 'Show Average', defval: true, group: 'STYLE', inline: '2', tooltip: SHOW_AREAS_TIP },
  { id: 'bullAvgColor', type: 'color', title: '', defval: '#089981', group: 'STYLE', inline: '2' },
  { id: 'bearAvgColor', type: 'color', title: '', defval: '#F23645', group: 'STYLE', inline: '2' },
  { id: 'showTPAreas', type: 'bool', title: 'Show TP Areas', defval: true, group: 'STYLE', inline: '3', tooltip: SHOW_AREAS_TIP },
  { id: 'takeProfitColor', type: 'color', title: '', defval: 'rgba(8, 153, 129, 0.25)', group: 'STYLE', inline: '3' },
  { id: 'showSLAreas', type: 'bool', title: 'Show SL Areas', defval: true, group: 'STYLE', inline: '4', tooltip: SHOW_AREAS_TIP },
  { id: 'stopLossColor', type: 'color', title: '', defval: 'rgba(242, 54, 69, 0.25)', group: 'STYLE', inline: '4' },
  { id: 'overlappingTrades', type: 'bool', title: 'Overlap trades', defval: false, group: 'STYLE', tooltip: 'Activate/deactivate overlapping trades.' },
];

export const plotConfig: PlotConfig[] = [];

export const metadata = {
  title: 'Range Average Retest Model [LuxAlgo]',
  shortTitle: 'LuxAlgo - Range Average Retest Model',
  overlay: true,
};

/** indicator(max_boxes_count = 500, max_lines_count = 500) */
const MAX_OBJECTS = 500;
const ARRAY_MAX_SIZE = 165;
const BULLISH_LEG = 1;
const BEARISH_LEG = 0;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const le = (a: number, b: number) => b - a >= -EPS;

interface Area {
  startTime: number;
  endTime: number;
  endIndex: number;
  areaHigh: number;
  areaLow: number;
  averagePrice: number;
  areaColor: string;
  touched: boolean;
}

interface Trade {
  entry: number;
  top: number;
  bottom: number;
  topColor: string;
  bottomColor: string;
  startTime: number;
  endTime: number;
  startLineTime: number;
  tradeColor: string;
  openTrade: boolean;
  dir: number;
}

export function calculate(
  bars: Bar[],
  inputs: Partial<RangeAverageRetestModelInputs> = {},
  chart?: ChartContext,
): IndicatorResult & { lines: LineDrawingData[]; boxes: BoxData[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const len = cfg.pivotLength;
  const mintick = mintickOf(chart);
  // barstate.isconfirmed is false on an open last bar: its logic does not run, and the drawings are made on the bar
  // before it (barstate.islastconfirmedhistory)
  const lastConfirmed = lastBarConfirmedOf(chart);
  const ms = n > 0 && bars[0].time >= 1e12;
  const timeMs = (i: number) => (ms ? bars[i].time : bars[i].time * 1000);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);

  const fastAtr = A(ta.atr(bars, 20));
  const slowAtr = A(ta.atr(bars, 200));
  const highest = A(ta.highest(new Series(bars, (b) => b.high), len));
  const lowest = A(ta.lowest(new Series(bars, (b) => b.low), len));

  resetDrawings({ line: MAX_OBJECTS, box: MAX_OBJECTS });

  const areas: Area[] = [];
  const trades: Trade[] = [];
  let leg = 0;
  let prevLeg = NaN; // ta.change(leg) in startOfNewLeg: one call per confirmed bar
  let bearSiteLast = NaN; // ta.change(leg) in startOfBearishLeg: called only on new-leg bars
  let bullSiteLast = NaN; // ta.change(leg) in startOfBullishLeg: called only on new-leg bars
  const drawBar = lastConfirmed ? n - 1 : n - 2;

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const b = bars[i];
    const t = timeMs(i);
    const vol = i < 200 ? fastAtr[i] : slowAtr[i];
    const areaThreshold = cfg.areaThresholdMultiplier * vol;
    const takeProfit = cfg.takeProfitMultiplier * vol;
    const stopLoss = cfg.stopLossMultiplier * vol;
    const legIndex = i >= len ? i - len : NaN;
    const legHigh = i >= len ? bars[i - len].high : NaN;
    const legLow = i >= len ? bars[i - len].low : NaN;
    const legTime = i >= len ? timeMs(i - len) : NaN;

    // leg()
    if (gt(legHigh, highest[i])) leg = BEARISH_LEG;
    else if (lt(legLow, lowest[i])) leg = BULLISH_LEG;

    const confirmed = i < n - 1 || lastConfirmed;
    if (confirmed) {
      const crossOver = (level: number) => i > 0 && lt(bars[i - 1].close, level) && gt(b.close, level);
      const crossUnder = (level: number) => i > 0 && gt(bars[i - 1].close, level) && lt(b.close, level);

      const updateAreaValues = (a: Area, high: number, low: number) => {
        if (!Number.isNaN(high)) a.areaHigh = high;
        if (!Number.isNaN(low)) a.areaLow = low;
      };
      const createNewArea = (high: number, low: number, areaColor: string) => {
        const a: Area = {
          startTime: legTime, endTime: NaN, endIndex: NaN, areaHigh: NaN, areaLow: NaN, averagePrice: NaN,
          areaColor, touched: false,
        };
        updateAreaValues(a, high, low);
        if (areas.length >= ARRAY_MAX_SIZE) areas.shift();
        areas.push(a);
      };
      const validAveragePrice = (avg: number) => {
        const size = areas.length;
        for (let k = 0; k < size; k++) {
          const a = areas[k];
          if (k < size - 1 && !a.touched && i - a.endIndex <= cfg.maximumDistanceFromArea) {
            if (le(Math.abs(a.averagePrice - avg), areaThreshold)) return false;
          }
        }
        return true;
      };
      const updateLastArea = (high: number, low: number) => {
        if (areas.length > 0) {
          const a = areas[areas.length - 1];
          updateAreaValues(a, high, low);
          a.endIndex = legIndex;
          a.endTime = legTime;
          a.averagePrice = math.round_to_mintick(0.5 * (a.areaHigh + a.areaLow), mintick);
          if (!validAveragePrice(a.averagePrice)) areas.pop();
        }
      };

      // startOfNewLeg(currentLeg): ta.change(leg) != 0
      const newLeg = !Number.isNaN(prevLeg) && leg - prevLeg !== 0;
      prevLeg = leg;
      if (newLeg) {
        // startOfBearishLeg / startOfBullishLeg: each ta.change keeps the values of its own calls
        const bearish = !Number.isNaN(bearSiteLast) && leg - bearSiteLast === -1;
        bearSiteLast = leg;
        if (bearish) {
          if (cfg.areaSelectionMode === 'BULLISH') updateLastArea(legHigh, NaN);
          else if (cfg.areaSelectionMode === 'BEARISH') createNewArea(legHigh, NaN, cfg.bearAreaColor);
          else {
            updateLastArea(legHigh, NaN);
            createNewArea(legHigh, NaN, cfg.bearAreaColor);
          }
        }
        const bullish = !Number.isNaN(bullSiteLast) && leg - bullSiteLast === 1;
        bullSiteLast = leg;
        if (bullish) {
          if (cfg.areaSelectionMode === 'BULLISH') createNewArea(NaN, legLow, cfg.bullAreaColor);
          else if (cfg.areaSelectionMode === 'BEARISH') updateLastArea(NaN, legLow);
          else {
            updateLastArea(NaN, legLow);
            createNewArea(NaN, legLow, cfg.bullAreaColor);
          }
        }
      }

      // reach(area)
      const reach = (a: Area) => {
        const openTrade = trades.length > 0 ? trades[trades.length - 1].openTrade : false;
        const disabled = !cfg.overlappingTrades && openTrade;
        const distance = i - a.endIndex;
        if (distance <= cfg.maximumDistanceFromArea && distance >= cfg.minimumDistanceFromArea && i > 20 && !disabled) {
          return crossOver(a.averagePrice) || crossUnder(a.averagePrice);
        }
        return false;
      };
      const pushTrade = (tr: Trade) => {
        if (trades.length >= ARRAY_MAX_SIZE) trades.shift();
        trades.push(tr);
      };
      for (const a of areas) {
        if (!a.touched && reach(a)) {
          a.touched = true;
          if (crossOver(a.averagePrice)) {
            pushTrade({
              entry: a.averagePrice, top: a.averagePrice + stopLoss, bottom: Math.max(a.averagePrice - takeProfit, 0),
              topColor: cfg.stopLossColor, bottomColor: cfg.takeProfitColor, startTime: t, endTime: t,
              startLineTime: a.startTime, tradeColor: cfg.bearAvgColor, openTrade: true, dir: -1,
            });
          }
          if (crossUnder(a.averagePrice)) {
            pushTrade({
              entry: a.averagePrice, top: a.averagePrice + takeProfit, bottom: Math.max(a.averagePrice - stopLoss, 0),
              topColor: cfg.takeProfitColor, bottomColor: cfg.stopLossColor, startTime: t, endTime: t,
              startLineTime: a.startTime, tradeColor: cfg.bullAvgColor, openTrade: true, dir: 1,
            });
          }
        }
      }
      for (const tr of trades) {
        if (tr.openTrade && (gt(b.high, tr.top) || lt(b.low, tr.bottom))) {
          tr.endTime = t;
          tr.openTrade = false;
        }
      }
    }

    if (i === drawBar) {
      if (cfg.showAreas) {
        for (const a of areas) {
          if (a.touched) {
            line.new(a.startTime, a.areaHigh, a.endTime, a.areaHigh, 'bar_time', undefined, a.areaColor);
            line.new(a.startTime, a.areaLow, a.endTime, a.areaLow, 'bar_time', undefined, a.areaColor);
          }
        }
      }
      if (cfg.showTPAreas || cfg.showSLAreas) {
        for (const tr of trades) {
          const right = tr.openTrade ? t : tr.endTime;
          if ((tr.dir === 1 && cfg.showTPAreas) || (tr.dir === -1 && cfg.showSLAreas)) {
            box.new(tr.startTime, tr.top, right, tr.entry, 'transparent', undefined, undefined, undefined, 'bar_time', tr.topColor);
          }
          if ((tr.dir === 1 && cfg.showSLAreas) || (tr.dir === -1 && cfg.showTPAreas)) {
            box.new(tr.startTime, tr.entry, right, tr.bottom, 'transparent', undefined, undefined, undefined, 'bar_time', tr.bottomColor);
          }
          if (cfg.showAverage) {
            line.new(tr.startLineTime, tr.entry, right, tr.entry, 'bar_time', undefined, tr.tradeColor, 'dashed');
          }
        }
      }
    }
  }
  setDrawingBar(null);

  // xloc.bar_time: every x is the time of a bar
  const byTime = new Map<number, number>();
  for (let i = 0; i < n; i++) byTime.set(timeMs(i), bars[i].time);
  const T = (x: number) => byTime.get(x) ?? (ms ? x : x / 1000);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {},
    lines: line.all().filter((l) => !Number.isNaN(l.y1) && !Number.isNaN(l.x1) && !Number.isNaN(l.x2)).map((l) => ({
      time1: T(l.x1), price1: l.y1, time2: T(l.x2), price2: l.y2, color: String(l.color),
      ...(l.style === 'dashed' ? { style: 'dashed' as const } : {}),
    })),
    boxes: box.all().map((bx) => ({
      time1: T(bx.left), price1: bx.top, time2: T(bx.right), price2: bx.bottom,
      bgColor: String(bx.bgcolor), borderColor: 'transparent',
    })),
  };
}

export const RangeAverageRetestModel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
