/**
 * Pivot Points HH/HL/LH/LL
 *
 * Detects pivot highs and lows, then classifies them as:
 * Higher High (HH), Higher Low (HL), Lower High (LH), Lower Low (LL).
 * Plots: pivot avg stepline (off by default), top/bottom level circles, fractal chaos channel (off by default),
 * breakout/breakdown markers, and labels with the pivot price.
 *
 * The pivot price of a label is printed with the symbol tick (format.mintick). The port reads the tick from the
 * optional third argument (see src/chart-context.ts); without it the tick is 0.01 (2 decimals).
 * Alerts (alertcondition, `alerts` of the result): 'Fractal Break Arrow' (either break), 'Fractal Break Long' (close
 * above the last pivot high with the open at or below it) and 'Fractal Break Short' (the mirror at the pivot low).
 *
 * Reference: "Pivot Points High Low (HH/HL/LH/LL) [Anan]" (Pine v6)
 */

import { ta, str, math, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, LabelData } from '../types';
import { mintickOf, type ChartContext } from '../chart-context';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface PivotHhHlLhLlInputs {
  /** Pivot high source */
  srcH: SourceType;
  /** Pivot high left length (Pine leftLenH) */
  leftBars: number;
  /** Pivot high right length (Pine rightLenH) */
  rightBars: number;
  colorH: string;
  /** Pivot low source */
  srcL: SourceType;
  leftLenL: number;
  rightLenL: number;
  colorL: string;
  showLevelHH: boolean;
  showLevelLH: boolean;
  showLevelHL: boolean;
  showLevelLL: boolean;
  showHH: boolean;
  showLH: boolean;
  showHL: boolean;
  showLL: boolean;
  showPriceHH: boolean;
  showPriceLH: boolean;
  showPriceHL: boolean;
  showPriceLL: boolean;
  /** Maximum Bars to Display (0 = All) */
  maxBarsBack: number;
  /** Maximum S/R Level Extension Length (0 = Max) */
  maxLvlLen: number;
  /** Show Levels as a Fractal Chaos Channel */
  showChannel: boolean;
  /** Show Avg Pivot High Low */
  showCL: boolean;
  /** Show fractal Break out/down symbols */
  showFB: boolean;
}

// Pine v6 colours: color.teal #089981, color.red #F23645; color.new(c, 50)
const TEAL_50 = 'rgba(8,153,129,0.5)';
const RED_50 = 'rgba(242,54,69,0.5)';
const TRANSPARENT = 'rgba(0,0,0,0)';
/** Pine max_labels_count */
const MAX_LABELS = 500;

export const defaultInputs: PivotHhHlLhLlInputs = {
  srcH: 'high',
  leftBars: 4,
  rightBars: 2,
  colorH: TEAL_50,
  srcL: 'low',
  leftLenL: 4,
  rightLenL: 2,
  colorL: RED_50,
  showLevelHH: true,
  showLevelLH: true,
  showLevelHL: true,
  showLevelLL: true,
  showHH: true,
  showLH: true,
  showHL: true,
  showLL: true,
  showPriceHH: true,
  showPriceLH: true,
  showPriceHL: true,
  showPriceLL: true,
  maxBarsBack: 0,
  maxLvlLen: 0,
  showChannel: false,
  showCL: false,
  showFB: true,
};

// Pine gives the four length/colour inputs an empty title (inline rows 'Pivot High' / 'Pivot Low')
export const inputConfig: InputConfig[] = [
  { id: 'srcH', type: 'source', title: 'High', defval: 'high' },
  { id: 'leftBars', type: 'int', title: 'Pivot High Left Length', defval: 4, min: 0 },
  { id: 'rightBars', type: 'int', title: 'Pivot High Right Length', defval: 2, min: 0 },
  { id: 'colorH', type: 'color', title: 'Pivot High Color', defval: TEAL_50 },
  { id: 'srcL', type: 'source', title: 'Low', defval: 'low' },
  { id: 'leftLenL', type: 'int', title: 'Pivot Low Left Length', defval: 4, min: 0 },
  { id: 'rightLenL', type: 'int', title: 'Pivot Low Right Length', defval: 2, min: 0 },
  { id: 'colorL', type: 'color', title: 'Pivot Low Color', defval: RED_50 },
  { id: 'showLevelHH', type: 'bool', title: 'Levels: Higher High', defval: true },
  { id: 'showLevelLH', type: 'bool', title: 'Levels: Lower High', defval: true },
  { id: 'showLevelHL', type: 'bool', title: 'Levels: Higher Low', defval: true },
  { id: 'showLevelLL', type: 'bool', title: 'Levels: Lower Low', defval: true },
  { id: 'showHH', type: 'bool', title: 'Markers: Higher High', defval: true },
  { id: 'showLH', type: 'bool', title: 'Markers: Lower High', defval: true },
  { id: 'showHL', type: 'bool', title: 'Markers: Higher Low', defval: true },
  { id: 'showLL', type: 'bool', title: 'Markers: Lower Low', defval: true },
  { id: 'showPriceHH', type: 'bool', title: 'Values: Higher High', defval: true },
  { id: 'showPriceLH', type: 'bool', title: 'Values: Lower High', defval: true },
  { id: 'showPriceHL', type: 'bool', title: 'Values: Higher Low', defval: true },
  { id: 'showPriceLL', type: 'bool', title: 'Values: Lower Low', defval: true },
  { id: 'maxBarsBack', type: 'int', title: 'Maximum Bars to Display (0 = All)', defval: 0, min: 0 },
  { id: 'maxLvlLen', type: 'int', title: 'Maximum S/R Level Extension Length (0 = Max)', defval: 0, min: 0 },
  { id: 'showChannel', type: 'bool', title: 'Show Levels as a Fractal Chaos Channel', defval: false },
  { id: 'showCL', type: 'bool', title: 'Show Avg Pivot High Low ', defval: false },
  { id: 'showFB', type: 'bool', title: 'Show fractal Break out/down symbols', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'H+L /2', color: TEAL_50, lineWidth: 1, style: 'stepline' },
  { id: 'plot1', title: 'Top Levels HH,LH', color: TEAL_50, lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'Bottom Levels LL,HL', color: RED_50, lineWidth: 1, style: 'circles' },
  { id: 'plot3', title: 'Top Chaos Channel', color: TEAL_50, lineWidth: 1, style: 'stepline' },
  { id: 'plot4', title: 'Bottom Chaos Channel', color: RED_50, lineWidth: 1, style: 'stepline' },
];

export const metadata = {
  title: 'Pivot Points HH/HL/LH/LL',
  shortTitle: 'PivotHHLL',
  overlay: true,
};

type Point = { time: number; value: number; color?: string };

/** Pine float comparison: a == b when |a - b| <= 1e-10; na operands give false */
const EPS = 1e-10;
const lt = (a: number, b: number) => b - a > EPS;
const differs = (a: number, b: number) => Math.abs(a - b) > EPS;

export function calculate(bars: Bar[], inputs: Partial<PivotHhHlLhLlInputs> = {}, chart?: ChartContext): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; labels: LabelData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { leftBars: leftLenH, rightBars: rightLenH, leftLenL, rightLenL, colorH, colorL } = cfg;
  const n = bars.length;
  const lastBarIndex = n - 1;

  const srcHSeries = getSourceSeries(bars, cfg.srcH);
  const srcLSeries = getSourceSeries(bars, cfg.srcL);
  const srcH = srcHSeries.toArray().map((v) => (v == null ? NaN : v));
  const srcL = srcLSeries.toArray().map((v) => (v == null ? NaN : v));

  const phArr = ta.pivothigh(srcHSeries, leftLenH, rightLenH).toArray();
  const plArr = ta.pivotlow(srcLSeries, leftLenL, rightLenL).toArray();

  const inRange = (i: number) => cfg.maxBarsBack === 0 || i > lastBarIndex - cfg.maxBarsBack;
  // Pine: str.tostring(_pivot, format.mintick) = value rounded with round(v / mintick) * mintick, printed with the
  // decimals of mintick. With the symbol tick of the chart context the library format is used. Without it the port
  // keeps its first rule: tick 0.01 with the exact decimal rounding (a price on a half tick, e.g. 38.995, can then
  // print one tick higher than the original).
  const hasTick = chart?.mintick !== undefined || (chart?.minmove !== undefined && chart.pricescale !== undefined);
  const mintick = mintickOf(chart);
  const fmt = (v: number) => '['
    + (hasTick ? str.tostring(v, 'mintick', mintick) : str.tostring(math.round_to_mintick(v, mintick), '0.00')) + ']';

  const markers: MarkerData[] = [];
  const labels: LabelData[] = [];
  const plot0: Point[] = [];
  const top: Point[] = [];
  const bot: Point[] = [];
  const topCh: Point[] = [];
  const botCh: Point[] = [];

  // ta.valuewhen(not na(ph), ph_value, 0 / 1)
  let lastPhValue = NaN;
  let prevPhValue = NaN;
  let lastPlValue = NaN;
  let prevPlValue = NaN;
  let fixPh = NaN;
  let fixPl = NaN;
  let countH = 0;
  let countL = 0;
  let pvtH = NaN;
  let pvtL = NaN;
  let pvtHighToShow = NaN;
  let pvtLowToShow = NaN;
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [];

  const shape = (bar: number, text: string, high: boolean, color: string) => {
    if (bar < 0) return;
    markers.push({
      time: bars[bar].time,
      position: high ? 'aboveBar' : 'belowBar',
      shape: high ? 'triangleDown' : 'triangleUp',
      color,
      text,
    });
  };
  const drawLabel = (i: number, pivot: number, above: boolean, color: string) => {
    if (Number.isNaN(pivot) || !inRange(i)) return;
    const bar = i - rightLenH;
    if (bar < 0) return;
    // Pine: label.new(bar_index[_offset], _pivot, text, style = label.style_none, yloc = yloc.abovebar / belowbar,
    //   color = _color, textcolor = _color): text only, above the bar high / below the bar low
    labels.push({
      time: bars[bar].time, price: pivot, text: fmt(pivot), color, textColor: color, style: 'none',
      yloc: above ? 'abovebar' : 'belowbar', size: 'normal',
    });
  };

  for (let i = 0; i < n; i++) {
    const ph = phArr[i] ?? NaN;
    const pl = plArr[i] ?? NaN;
    const hasPh = !Number.isNaN(ph);
    const hasPl = !Number.isNaN(pl);
    const phValue = i >= rightLenH ? srcH[i - rightLenH] : NaN;
    const plValue = i >= rightLenL ? srcL[i - rightLenL] : NaN;

    if (hasPh) {
      prevPhValue = lastPhValue;
      lastPhValue = phValue;
    }
    if (hasPl) {
      prevPlValue = lastPlValue;
      lastPlValue = plValue;
    }
    // Comparisons with na are false: no class for the first pivot or for two equal pivots
    const higherhigh = hasPh && lt(prevPhValue, lastPhValue) ? ph : NaN;
    const lowerhigh = hasPh && lt(lastPhValue, prevPhValue) ? ph : NaN;
    const higherlow = hasPl && lt(prevPlValue, lastPlValue) ? pl : NaN;
    const lowerlow = hasPl && lt(lastPlValue, prevPlValue) ? pl : NaN;

    drawLabel(i, cfg.showPriceHH ? higherhigh : NaN, true, colorH);
    drawLabel(i, cfg.showPriceHL ? higherlow : NaN, false, colorL);
    drawLabel(i, cfg.showPriceLH ? lowerhigh : NaN, true, colorH);
    drawLabel(i, cfg.showPriceLL ? lowerlow : NaN, false, colorL);

    // plotshape offsets as in the Pine source: HH/HL use -rightLenH, LH/LL use -rightLenL
    if (cfg.showHH && inRange(i) && !Number.isNaN(higherhigh)) shape(i - rightLenH, 'HH', true, colorH);
    if (cfg.showHL && inRange(i) && !Number.isNaN(higherlow)) shape(i - rightLenH, 'HL', false, colorL);
    if (cfg.showLH && inRange(i) && !Number.isNaN(lowerhigh)) shape(i - rightLenL, 'LH', true, colorH);
    if (cfg.showLL && inRange(i) && !Number.isNaN(lowerlow)) shape(i - rightLenL, 'LL', false, colorL);

    // pivot_avg = (fixnan(ph) + fixnan(pl)) / 2
    if (hasPh) fixPh = ph;
    if (hasPl) fixPl = pl;
    const pivotAvg = (fixPh + fixPl) / 2;
    plot0.push({
      time: bars[i].time,
      value: cfg.showCL && inRange(i) ? pivotAvg : NaN,
      color: bars[i].close > pivotAvg ? colorH : colorL,
    });

    countH = hasPh ? 0 : countH + 1;
    countL = hasPl ? 0 : countL + 1;
    pvtH = hasPh ? phValue : pvtH;
    pvtL = hasPl ? plValue : pvtL;

    const prevHighToShow = pvtHighToShow;
    const prevLowToShow = pvtLowToShow;
    if (cfg.showLevelHH && cfg.showLevelLH) pvtHighToShow = pvtH;
    else if (cfg.showLevelHH) pvtHighToShow = Number.isNaN(higherhigh) ? pvtHighToShow : phValue;
    else if (cfg.showLevelLH) pvtHighToShow = Number.isNaN(lowerhigh) ? pvtHighToShow : phValue;
    else pvtHighToShow = NaN;
    if (cfg.showLevelHL && cfg.showLevelLL) pvtLowToShow = pvtL;
    else if (cfg.showLevelHL) pvtLowToShow = Number.isNaN(higherlow) ? pvtLowToShow : plValue;
    else if (cfg.showLevelLL) pvtLowToShow = Number.isNaN(lowerlow) ? pvtLowToShow : plValue;
    else pvtLowToShow = NaN;

    // HpC_filtered = pvtHighToShow != pvtHighToShow[1] ? na : colorH (na colour: value kept, drawn transparent)
    const hpc = differs(pvtHighToShow, prevHighToShow) ? TRANSPARENT : colorH;
    const lpc = differs(pvtLowToShow, prevLowToShow) ? TRANSPARENT : colorL;
    const showTop = !cfg.showChannel && (cfg.maxLvlLen === 0 || countH < cfg.maxLvlLen) && (cfg.showLevelHH || cfg.showLevelLH) && inRange(i);
    const showBot = !cfg.showChannel && (cfg.maxLvlLen === 0 || countL < cfg.maxLvlLen) && (cfg.showLevelHL || cfg.showLevelLL) && inRange(i);
    top.push({ time: bars[i].time, value: showTop ? pvtHighToShow : NaN, color: hpc });
    bot.push({ time: bars[i].time, value: showBot ? pvtLowToShow : NaN, color: lpc });
    topCh.push({ time: bars[i].time, value: cfg.showChannel && (cfg.showLevelHH || cfg.showLevelLH) && inRange(i) ? pvtHighToShow : NaN });
    botCh.push({ time: bars[i].time, value: cfg.showChannel && (cfg.showLevelHL || cfg.showLevelLL) && inRange(i) ? pvtLowToShow : NaN });

    // Fractal break: buy = close > pvtH and open <= pvtH, sell = close < pvtL and open >= pvtL
    const buy = lt(pvtH, bars[i].close) && !Number.isNaN(pvtH) && !lt(pvtH, bars[i].open);
    const sell = lt(bars[i].close, pvtL) && !Number.isNaN(pvtL) && !lt(bars[i].open, pvtL);
    buyFlags.push(buy);
    sellFlags.push(sell);
    if (cfg.showFB && buy && inRange(i)) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: colorH, text: '↑↑' });
    }
    if (cfg.showFB && sell && inRange(i)) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: colorL, text: '↓↓' });
    }
  }

  // Pine plot offset = -k: the value computed on bar i is drawn on bar i - k
  const shiftBack = (arr: Point[], k: number): Point[] =>
    arr.map((p, i) => {
      const src = arr[i + k];
      return src === undefined ? { time: p.time, value: NaN } : { time: p.time, value: src.value, ...(src.color ? { color: src.color } : {}) };
    });

  markers.sort((a, b) => a.time - b.time);

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      'plot0': plot0,
      'plot1': shiftBack(top, rightLenH),
      'plot2': shiftBack(bot, rightLenL),
      'plot3': shiftBack(topCh, rightLenH),
      'plot4': shiftBack(botCh, rightLenL),
    },
    markers,
    labels: labels.slice(-MAX_LABELS),
    // alertcondition(buy or sell) / alertcondition(buy) / alertcondition(sell)
    alerts: alertStates(alertConditions, bars, [buyFlags.map((b, i) => b || sellFlags[i]), buyFlags, sellFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Fractal Break Arrow', message: 'Alert' },
  { id: 'alert1', title: 'Fractal Break Long', message: 'Long' },
  { id: 'alert2', title: 'Fractal Break Short', message: 'Short' },
];

export const PivotHhHlLhLl = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
