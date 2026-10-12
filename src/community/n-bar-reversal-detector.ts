/**
 * N Bar Reversal Detector [LuxAlgo]
 *
 * Detects reversal patterns of N candles. Bullish: none of the first N-1 candles after the oldest one has a high
 * above the high of the oldest candle (the scan stops at the first one that has), enough of the scanned candles are
 * bearish ("Min Percentage of Required Candles" of N-1), and the current candle closes the pattern with a high above
 * the high of the oldest one. Bearish is the mirror. "Pattern Type": Normal (the close stays below the pattern high),
 * Enhanced (the close is above it) or All. An optional trend filter (moving average cloud, Supertrend or Donchian
 * channels, aligned with or opposite to the pattern) is also drawn.
 *
 * Drawings: a ▲ / ▼ label on the detection bar, two lines with a fill over the pattern (its high and low), two more
 * lines that follow the pattern until the close of the bar before breaks its high (confirmation: a ⦁ label on that
 * bar and a level box from the pattern low, extended while the close holds above it) or its low (failure). Label
 * tooltips tell the state of the pattern. At most 500 lines, 500 labels and 500 boxes are kept.
 *
 * Chart context (optional third argument of calculate): the fills of the trend filter use `chart.bg_color` (fully
 * transparent, so the value does not change the drawing).
 *
 * Reference: "N Bar Reversal Detector [LuxAlgo]" by LuxAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © LuxAlgo
 */

import {
  ta, Series, color, str, line, label, box, linefill, resetDrawings, setDrawingBar, varDrawing,
  type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type Line, type Label, type Box,
} from 'oakscriptjs';
import type { BoxData, LabelData, LineDrawingData, LinefillData } from '../types';
import { barInterval, barTime } from '../bar-time';
import { backgroundColorOf, type ChartContext } from '../chart-context';

type MaType = 'SMA' | 'EMA' | 'HMA' | 'RMA' | 'WMA' | 'VWMA';

export interface NBarReversalDetectorInputs {
  brpType: 'Normal' | 'Enhanced' | 'All';
  numBars: number;
  /** Min percentage (0 to 100) of bearish (bullish) candles among the first N-1 */
  minBars: number;
  brpSR: 'Level' | 'None';
  bullColor: string;
  bearColor: string;
  trendType: 'Moving Average Cloud' | 'Supertrend' | 'Donchian Channels' | 'None';
  trendFilt: 'Aligned' | 'Opposite';
  trendBullColor: string;
  trendBearColor: string;
  maType: MaType;
  maFLength: number;
  maSLength: number;
  atrPeriod: number;
  factor: number;
  length: number;
}

export const defaultInputs: NBarReversalDetectorInputs = {
  brpType: 'All',
  numBars: 7,
  minBars: 50,
  brpSR: 'Level',
  bullColor: '#089981',
  bearColor: '#f23645',
  trendType: 'None',
  trendFilt: 'Aligned',
  trendBullColor: '#089981',
  trendBearColor: '#f23645',
  maType: 'HMA',
  maFLength: 50,
  maSLength: 200,
  atrPeriod: 10,
  factor: 3,
  length: 13,
};

const G_BRP = 'Pattern Detection';
const G_TREND = 'Trend Filtering';
const G_MA = 'Moving Average Settings';
const G_ST = 'Supertrend Settings';
const G_DC = 'Donchian Channel Settings';

const inputList: InputConfig[] = [
  {
    id: 'brpType', type: 'string', title: 'Pattern Type', defval: 'All', options: ['Normal', 'Enhanced', 'All'], group: G_BRP,
    tooltip: 'Selects the type of reversal pattern to detect:\n\n'
      + ' *Normal: Detects standard reversal patterns based on the high and low prices of the sequence.\n\n'
      + ' *Enhanced: Detects advanced reversal patterns where the most recent closing price must exceed or fall below the high or low of the first candle.\n\n'
      + ' *All: Includes both normal and enhanced patterns.',
  },
  {
    id: 'numBars', type: 'int', title: 'Reversal Pattern Sequence Length', defval: 7, min: 2, group: G_BRP,
    tooltip: 'Specifies the number of candles in the sequence used to identify a reversal pattern. The length N includes the initial N-1 candles plus the most recent candle (Nth) for pattern detection.',
  },
  {
    id: 'minBars', type: 'int', title: 'Min Percentage of Required Candles', defval: 50, min: 0, max: 100, group: G_BRP,
    tooltip: 'Sets the minimum percentage of the first N-1 candles that must be bullish (for a bearish reversal) or bearish (for a bullish reversal) to qualify as a valid reversal pattern. This setting helps adjust the sensitivity of the pattern detection.',
  },
  {
    id: 'brpSR', type: 'string', title: 'Derived Support and Resistance', defval: 'Level', options: ['Level', 'None'], group: G_BRP,
    tooltip: 'Shows horizontal support and resistance lines based on the highest high or lowest low of the pattern',
  },
  { id: 'bullColor', type: 'color', title: 'Bullish Reversal Patterns', defval: '#089981', group: G_BRP },
  { id: 'bearColor', type: 'color', title: 'Bearish Reversal Patterns', defval: '#f23645', group: G_BRP },
  {
    id: 'trendType', type: 'string', title: 'Filtering', defval: 'None', options: ['Moving Average Cloud', 'Supertrend', 'Donchian Channels', 'None'],
    group: G_TREND, inline: 'flt', tooltip: 'Selects the trend filtering method for detecting reversal patterns and specifies the alignment with the trend.',
  },
  { id: 'trendFilt', type: 'string', title: '', defval: 'Aligned', options: ['Aligned', 'Opposite'], group: G_TREND, inline: 'flt' },
  { id: 'trendBullColor', type: 'color', title: 'Bullish Trend', defval: '#089981', inline: 'trnd' },
  { id: 'trendBearColor', type: 'color', title: ' Bearish Trend', defval: '#f23645', inline: 'trnd' },
  { id: 'maType', type: 'string', title: 'Type', defval: 'HMA', options: ['SMA', 'EMA', 'HMA', 'RMA', 'WMA', 'VWMA'], group: G_MA },
  { id: 'maFLength', type: 'int', title: 'Fast Length', defval: 50, min: 1, max: 100, group: G_MA },
  { id: 'maSLength', type: 'int', title: 'Slow Length', defval: 200, min: 100, group: G_MA },
  { id: 'atrPeriod', type: 'int', title: 'ATR Length', defval: 10, min: 1, group: G_ST },
  { id: 'factor', type: 'float', title: 'Factor', defval: 3, min: 2, step: 0.1, group: G_ST },
  { id: 'length', type: 'int', title: 'Length', defval: 13, min: 1, group: G_DC },
];
// display = display.all - display.status_line on the inputs other than the colours: not in the status line
export const inputConfig: InputConfig[] = inputList.map((c) => (c.type === 'color' ? c : { ...c, display: 'data_window' as const }));

// display = display.all - display.status_line on the plots (drawn in the pane, not in the status line)
export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'ma fast', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot1', title: 'ma slow', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot2', title: 'Up Trend', color: '#089981', lineWidth: 1, style: 'linebr' },
  { id: 'plot3', title: 'Down Trend', color: '#f23645', lineWidth: 1, style: 'linebr' },
  { id: 'plot4', title: 'Body Middle', color: '#2962FF', lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'Donchian Upper', color: '#f23645', lineWidth: 1 },
  { id: 'plot6', title: 'Donchian Lower', color: '#089981', lineWidth: 1 },
];

export const metadata = {
  title: 'N Bar Reversal Detector [LuxAlgo]',
  shortTitle: 'LuxAlgo - N Bar Reversal Detector',
  overlay: true,
};

/** indicator(max_labels_count = 500, max_lines_count = 500, max_boxes_count = 500) */
const MAX_OBJECTS = 500;

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** math.min / math.max: na when an argument is na */
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));

export function calculate(
  bars: Bar[],
  inputs: Partial<NBarReversalDetectorInputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'lines' | 'labels' | 'boxes' | 'linefills'> & {
    lines: LineDrawingData[]; labels: LabelData[]; boxes: BoxData[]; linefills: LinefillData[];
  } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const N = cfg.numBars;
  const minBars = cfg.minBars / 100;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const o = bars.map((b) => b.open);
  const h = bars.map((b) => b.high);
  const l = bars.map((b) => b.low);
  const c = bars.map((b) => b.close);
  const at = (a: number[], i: number) => (i >= 0 ? a[i] : NaN);
  const close = S(c);
  const bg = backgroundColorOf(chart);

  // Moving average cloud
  const movingAverage = (len: number): number[] => {
    switch (cfg.maType) {
      case 'SMA': return A(ta.sma(close, len));
      case 'EMA': return A(ta.ema(close, len));
      case 'HMA': return A(ta.hma(close, len));
      case 'RMA': return A(ta.rma(close, len));
      case 'WMA': return A(ta.wma(close, len));
      default: return A(ta.vwma(close, len, S(bars.map((b) => b.volume ?? NaN))));
    }
  };
  const maFast = movingAverage(cfg.maFLength);
  const maSlow = movingAverage(cfg.maSLength);
  const showMa = cfg.trendType === 'Moving Average Cloud';
  const maUp = maFast.map((f, i) => gt(f, maSlow[i]));
  const maColor = maUp.map((u) => (u ? cfg.trendBullColor : cfg.trendBearColor));

  // Supertrend (na on the first bar)
  const [stS, dirS] = ta.supertrend(bars, cfg.factor, cfg.atrPeriod);
  const supertrend = A(stS).map((v, i) => (i === 0 ? NaN : v));
  const direction = A(dirS);
  const showSt = cfg.trendType === 'Supertrend';

  // Donchian channels
  const upper = A(ta.highest(close, cfg.length));
  const lower = A(ta.lowest(close, cfg.length));
  const os: number[] = new Array(n);
  let osVar = 0;
  for (let i = 0; i < n; i++) {
    osVar = gt(upper[i], at(upper, i - 1)) ? 1 : lt(lower[i], at(lower, i - 1)) ? 0 : osVar;
    os[i] = osVar;
  }
  const showDc = cfg.trendType === 'Donchian Channels';

  // Trend conditions
  const upTrendOk: boolean[] = new Array(n).fill(true);
  const downTrendOk: boolean[] = new Array(n).fill(true);
  const aligned = cfg.trendFilt === 'Aligned';
  for (let i = 0; i < n; i++) {
    if (showMa) {
      const up = gt(c[i], maFast[i]) && gt(maFast[i], maSlow[i]);
      const down = lt(c[i], maFast[i]) && lt(maFast[i], maSlow[i]);
      downTrendOk[i] = aligned ? down : up;
      upTrendOk[i] = aligned ? up : down;
    }
    if (showSt) {
      downTrendOk[i] = aligned ? direction[i] > 0 : direction[i] < 0;
      upTrendOk[i] = aligned ? direction[i] < 0 : direction[i] > 0;
    }
    if (showDc) {
      downTrendOk[i] = aligned ? os[i] === 0 : os[i] === 1;
      upTrendOk[i] = aligned ? os[i] === 1 : os[i] === 0;
    }
  }

  // isBullishReversal() / isBearishReversal()
  const bullLowArr: number[] = new Array(n);
  const bullishReversal: boolean[] = new Array(n);
  const bearHighArr: number[] = new Array(n);
  const bearishReversal: boolean[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const hN = at(h, i - N);
    const lN = at(l, i - N);
    let bullLow = lN;
    let bearCount = 0;
    for (let k = 1; k <= N - 1; k++) {
      if (gt(at(h, i - k), hN)) break;
      bullLow = min(bullLow, at(l, i - k));
      if (gt(at(o, i - k), at(c, i - k))) bearCount += 1;
    }
    const bullReversal = ge(bearCount / (N - 1), minBars);
    bullLowArr[i] = min(bullLow, l[i]);
    bullishReversal[i] = bullReversal && gt(h[i], hN) && upTrendOk[i];

    let bearHigh = hN;
    let bullCount = 0;
    for (let k = 1; k <= N - 1; k++) {
      if (lt(at(l, i - k), lN)) break;
      bearHigh = max(bearHigh, at(h, i - k));
      if (lt(at(o, i - k), at(c, i - k))) bullCount += 1;
    }
    const bearReversal = ge(bullCount / (N - 1), minBars);
    bearHighArr[i] = max(bearHigh, h[i]);
    bearishReversal[i] = bearReversal && lt(l[i], lN) && downTrendOk[i];
  }

  // Drawings
  resetDrawings({ line: MAX_OBJECTS, label: MAX_OBJECTS, box: MAX_OBJECTS });
  const lnAT = varDrawing<Line>();
  const lnAB = varDrawing<Line>();
  const lnAT2 = varDrawing<Line>();
  const lnAB2 = varDrawing<Line>();
  const lbAT = varDrawing<Label>();
  const bxA = varDrawing<Box>();
  let bullProcess = false;
  let bullProcess2 = false;
  let bullHigh = NaN;
  const lnST = varDrawing<Line>();
  const lnSB = varDrawing<Line>();
  const lnST2 = varDrawing<Line>();
  const lnSB2 = varDrawing<Line>();
  const lbST = varDrawing<Label>();
  const bxS = varDrawing<Box>();
  let bearProcess = false;
  let bearProcess2 = false;
  let bearLow = NaN;
  // bullProcess[1], bullProcess[2] (na before the first bar)
  let bull1: boolean | null = null;
  let bull2: boolean | null = null;
  let bear1: boolean | null = null;
  let bear2: boolean | null = null;

  const bullAC = String(color.new(cfg.bullColor, 53));
  const bullText = String(color.new(cfg.bullColor, 7));
  const bullFill = String(color.new(cfg.bullColor, 73));
  const bearSC = String(color.new(cfg.bearColor, 53));
  const bearText = String(color.new(cfg.bearColor, 7));
  const bearFill = String(color.new(cfg.bearColor, 89));
  const zone = (cfg.brpSR as string) === 'Zone';

  for (let i = 0; i < n; i++) {
    setDrawingBar(i, i === n - 1);
    const hN = at(h, i - N);
    const lN = at(l, i - N);
    const typeOkBull = cfg.brpType === 'All' ? true : cfg.brpType === 'Enhanced' ? gt(c[i], hN) : lt(c[i], hN);
    if (bullishReversal[i] && !(i > 0 && bullishReversal[i - 1]) && typeOkBull) {
      bullProcess = true;
      lbAT.value = label.new(i, l[i], '▲', 'bar_index', 'price', 'transparent', 'label_up', bullText, 'small', undefined,
        'new bullish pattern detected' + (gt(c[i], at(h, i - 2)) ? ' (enchanced)' : ' (normal)'));
      lnAT2.value = line.new(i - N, hN, i, hN, 'bar_index', 'none', bullAC);
      lnAB2.value = line.new(i - N, bullLowArr[i], i, bullLowArr[i], 'bar_index', 'none', bullAC);
      linefill.new(lnAT2.value, lnAB2.value, bullFill);
      lnAT.value = line.new(i - N, hN, i, hN, 'bar_index', 'none', bullAC);
      lnAB.value = line.new(i - N, bullLowArr[i], i, bullLowArr[i], 'bar_index', 'none', bullAC);
      bullHigh = zone ? max(at(l, i - 1), l[i]) : bullLowArr[i];
    }
    if (bullProcess) {
      if (gt(at(c, i - 1), line.get_price(lnAT.value!, i))) {
        if (bull1 === true && bull1 !== bull2) {
          if (lbAT.value) label.set_tooltip(lbAT.value, 'enchanced pattern (confirmed at detection)\nprice activity above the pattern high');
        } else {
          if (lbAT.value) {
            label.set_tooltip(lbAT.value, 'pattern confirmed ' + str.tostring(i - 1 - label.get_x(lbAT.value)) + ' bar(s) later');
          }
          label.new(i - 1, at(l, i - 1), '⦁', 'bar_index', 'price', 'transparent', 'label_up', bullText, 'small', undefined,
            'confirmation bar\nprice activity above the pattern high');
        }
        bullProcess = false;
        bxA.value = box.new(i, bullHigh, i, line.get_price(lnAB.value!, i), String(color.new(cfg.bullColor, zone ? 73 : 53)),
          undefined, undefined, undefined, undefined, bullFill);
        bullProcess2 = true;
      }
      if (lt(at(c, i - 1), line.get_price(lnAB.value!, i)) || bearishReversal[i]) {
        if (lbAT.value) label.set_tooltip(lbAT.value, 'pattern failed\nthe low of the pattern breached');
        bullProcess = false;
      }
      if (!bullProcess) {
        if (lnAT.value) line.set_x2(lnAT.value, i - 1);
        if (lnAB.value) line.set_x2(lnAB.value, i - 1);
      } else {
        if (lnAT.value) line.set_x2(lnAT.value, i);
        if (lnAB.value) line.set_x2(lnAB.value, i);
      }
    }
    if (bullProcess2 && cfg.brpSR !== 'None') {
      const bottom = bxA.value ? box.get_bottom(bxA.value) : NaN;
      if (bxA.value) box.set_right(bxA.value, i);
      if (!gt(c[i], bottom)) bullProcess2 = false;
    }

    const typeOkBear = cfg.brpType === 'All' ? true : cfg.brpType === 'Enhanced' ? lt(c[i], lN) : gt(c[i], lN);
    if (bearishReversal[i] && !(i > 0 && bearishReversal[i - 1]) && typeOkBear) {
      bearProcess = true;
      lbST.value = label.new(i, h[i], '▼', 'bar_index', 'price', 'transparent', 'label_down', bearText, 'small', undefined,
        'new bearish pattern detected' + (lt(c[i], at(l, i - 2)) ? ' (enchanced)' : ' (normal)'));
      lnSB2.value = line.new(i - N, lN, i, lN, 'bar_index', 'none', bearSC);
      lnST2.value = line.new(i - N, bearHighArr[i], i, bearHighArr[i], 'bar_index', 'none', bearSC);
      linefill.new(lnST2.value, lnSB2.value, bearFill);
      lnSB.value = line.new(i - N, lN, i, lN, 'bar_index', 'none', bearSC);
      lnST.value = line.new(i - N, bearHighArr[i], i, bearHighArr[i], 'bar_index', 'none', bearSC);
      bearLow = zone ? min(at(h, i - 1), h[i]) : bearHighArr[i];
    }
    if (bearProcess) {
      if (gt(at(c, i - 1), line.get_price(lnST.value!, i)) || bullishReversal[i]) {
        if (lbST.value) label.set_tooltip(lbST.value, 'pattern failed\nthe high of the pattern breached');
        bearProcess = false;
      }
      if (lt(at(c, i - 1), line.get_price(lnSB.value!, i))) {
        if (bear1 === true && bear1 !== bear2) {
          if (lbST.value) label.set_tooltip(lbST.value, 'enchanced pattern (confirmed at detection)\nprice activity below the pattern low');
        } else {
          if (lbST.value) {
            label.set_tooltip(lbST.value, 'pattern confirmed ' + str.tostring(i - 1 - label.get_x(lbST.value)) + ' bar(s) later');
          }
          label.new(i - 1, at(h, i - 1), '⦁', 'bar_index', 'price', 'transparent', 'label_down', bearText, 'small', undefined,
            'confirmation bar\nprice activity blow the pattern low');
        }
        bearProcess = false;
        bxS.value = box.new(i, line.get_price(lnST.value!, i), i, bearLow, String(color.new(cfg.bearColor, zone ? 89 : 53)),
          undefined, undefined, undefined, undefined, bearFill);
        bearProcess2 = true;
      }
      if (!bearProcess) {
        if (lnST.value) line.set_x2(lnST.value, i - 1);
        if (lnSB.value) line.set_x2(lnSB.value, i - 1);
      } else {
        if (lnST.value) line.set_x2(lnST.value, i);
        if (lnSB.value) line.set_x2(lnSB.value, i);
      }
    }
    if (bearProcess2 && cfg.brpSR !== 'None') {
      const top = bxS.value ? box.get_top(bxS.value) : NaN;
      if (bxS.value) box.set_right(bxS.value, i);
      if (!lt(c[i], top)) bearProcess2 = false;
    }

    bull2 = bull1;
    bull1 = bullProcess;
    bear2 = bear1;
    bear1 = bearProcess;
  }
  setDrawingBar(null);

  // Plots
  const time = (i: number) => bars[i].time;
  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const bodyMid = bars.map((b) => (b.open + b.close) / 2);
  const stUpCol = String(color.new(cfg.trendBullColor, 73));
  const stDnCol = String(color.new(cfg.trendBearColor, 73));
  const plots = {
    plot0: maFast.map((v, i) => ({ time: time(i), value: showMa ? fin(v) : NaN, color: String(color.new(maColor[i], 81)) })),
    plot1: maSlow.map((v, i) => ({ time: time(i), value: showMa ? fin(v) : NaN, color: String(color.new(maColor[i], 73)) })),
    plot2: supertrend.map((v, i) => ({ time: time(i), value: direction[i] < 0 && showSt ? fin(v) : NaN, color: stUpCol })),
    plot3: supertrend.map((v, i) => ({ time: time(i), value: !(direction[i] < 0) && showSt ? fin(v) : NaN, color: stDnCol })),
    plot4: bodyMid.map((v, i) => ({ time: time(i), value: i > 0 && showSt ? v : NaN })),
    plot5: upper.map((v, i) => ({
      time: time(i), value: showDc ? fin(v) : NaN,
      color: os[i] === 1 ? String(color.new(cfg.trendBullColor, 99)) : String(color.new(cfg.trendBearColor, 73)),
    })),
    plot6: lower.map((v, i) => ({
      time: time(i), value: showDc ? fin(v) : NaN,
      color: os[i] === 1 ? String(color.new(cfg.trendBullColor, 73)) : String(color.new(cfg.trendBearColor, 99)),
    })),
  };

  const bgClear = String(color.new(bg, 100));
  const fills = [
    {
      plot1: 'plot0', plot2: 'plot1',
      gradient: {
        topValue: maFast.map((f, i) => max(f, maSlow[i])),
        bottomValue: maFast.map((f, i) => min(f, maSlow[i])),
        topColor: maColor.map((col, i) => String(color.new(col, maUp[i] ? 99 : 81))),
        bottomColor: maColor.map((col, i) => String(color.new(col, maUp[i] ? 81 : 99))),
      },
    },
    {
      plot1: 'plot4', plot2: 'plot2', options: { fillgaps: false },
      gradient: {
        topValue: supertrend, bottomValue: bodyMid,
        topColor: bars.map(() => String(color.new(cfg.trendBullColor, 81))), bottomColor: bars.map(() => bgClear),
      },
    },
    {
      plot1: 'plot4', plot2: 'plot3', options: { fillgaps: false },
      gradient: {
        topValue: bodyMid, bottomValue: supertrend,
        topColor: bars.map(() => bgClear), bottomColor: bars.map(() => String(color.new(cfg.trendBearColor, 81))),
      },
    },
    {
      plot1: 'plot5', plot2: 'plot6',
      gradient: {
        topValue: upper, bottomValue: lower,
        topColor: os.map((v) => (v === 1 ? bgClear : String(color.new(cfg.trendBearColor, 81)))),
        bottomColor: os.map((v) => (v === 0 ? bgClear : String(color.new(cfg.trendBullColor, 81)))),
      },
    },
  ];

  const interval = barInterval(bars);
  const T = (index: number) => barTime(bars, index, interval);
  const lineData = (ln: Line): LineDrawingData => ({
    time1: T(ln.x1), price1: ln.y1, time2: T(ln.x2), price2: ln.y2, color: String(ln.color),
  });
  const alive = new Set(line.all());
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    fills,
    lines: line.all().map(lineData),
    // a linefill whose line was deleted by the line limit is not drawn
    linefills: linefill.all().filter((f) => alive.has(f.line1) && alive.has(f.line2))
      .map((f) => ({ line1: lineData(f.line1), line2: lineData(f.line2), color: String(f.color) })),
    labels: label.all().map((lb) => ({
      time: T(lb.x), price: lb.y, text: lb.text ?? '', color: 'transparent', textColor: String(lb.textcolor),
      style: lb.style as 'label_up' | 'label_down', size: 'small' as const, tooltip: lb.tooltip ?? '',
    })),
    boxes: box.all().map((b) => ({
      time1: T(b.left), price1: b.top, time2: T(b.right), price2: b.bottom,
      borderColor: String(b.border_color), bgColor: String(b.bgcolor),
    })),
  };
}

export const NBarReversalDetector = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
};
