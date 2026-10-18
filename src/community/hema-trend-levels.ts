/**
 * HEMA Trend Levels [AlgoAlpha]
 *
 * Hull EMA (HEMA) trend indicator with crossover signals.
 * HEMA = EMA of (2*EMA(halfLen) - EMA(fullLen)), smoothed by EMA(sqrt(len)).
 * Two HEMA lines (fast/slow) with fill and bar coloring for trend direction.
 * Alerts (alertcondition, `alerts` of the result): 'Bullish Crossover' / 'Bearish Crossunder' (fast HEMA crosses the
 * slow one), 'Bullish Test' / 'Bearish Test' (a wick into the latest bullish / bearish box with the open and close
 * beyond its top; the top of a bearish box is high - ATR / 2, as the original creates it).
 *
 * Reference: "HEMA Trend Levels [AlgoAlpha]" by AlgoAlpha
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData, BoxData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface HemaTrendLevelsInputs {
  hemaLengthFast: number;
  hemaLengthSlow: number;
  bullColor: string;
  bearColor: string;
}

export const defaultInputs: HemaTrendLevelsInputs = {
  hemaLengthFast: 20,
  hemaLengthSlow: 40,
  bullColor: '#00ffbb',
  bearColor: '#ff1100',
};

export const inputConfig: InputConfig[] = [
  { id: 'hemaLengthFast', type: 'int', title: 'HEMA Length Fast', defval: 20, min: 1 },
  { id: 'hemaLengthSlow', type: 'int', title: 'HEMA Length Slow', defval: 40, min: 1 },
  { id: 'bullColor', type: 'string', title: 'Bullish Color', defval: '#00ffbb' },
  { id: 'bearColor', type: 'string', title: 'Bearish Color', defval: '#ff1100' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'HEMA Fast', color: '#00ffbb', lineWidth: 2 },
  { id: 'plot1', title: 'HEMA Slow', color: '#ff1100', lineWidth: 2 },
  { id: 'hemaTop', title: 'Top HEMA', color: 'transparent', lineWidth: 0, display: 'none' },
  { id: 'hemaBottom', title: 'Bottom HEMA', color: 'transparent', lineWidth: 0, display: 'none' },
];

export const metadata = {
  title: 'HEMA Trend Levels',
  shortTitle: 'HEMA',
  overlay: true,
};

function computeHEMA(src: Series, length: number): Series {
  const halfLength = Math.max(1, Math.round(length / 2));
  const sqrtLength = Math.max(1, Math.round(Math.sqrt(length)));
  const emaHalf = ta.ema(src, halfLength);
  const emaFull = ta.ema(src, length);
  // diff = 2 * ema_half - ema_full
  const diff = emaHalf.mul(2).sub(emaFull);
  return ta.ema(diff, sqrtLength);
}

export function calculate(
  bars: Bar[],
  inputs: Partial<HemaTrendLevelsInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[]; boxes: BoxData[] } & { alerts: AlertConditionState[] } {
  const { hemaLengthFast, hemaLengthSlow, bullColor, bearColor } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeSeries = new Series(bars, (b) => b.close);

  const hema1 = computeHEMA(closeSeries, hemaLengthFast);
  const hema2 = computeHEMA(closeSeries, hemaLengthSlow);

  const h1Arr = hema1.toArray();
  const h2Arr = hema2.toArray();

  const atrArr = ta.atr(bars, 14).toArray();

  const warmup = hemaLengthSlow;
  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const boxes: BoxData[] = [];

  // Track most recent bull/bear box indices (Pine: var bull_box / bear_box arrays, using .first())
  let lastBullBoxIdx = -1;
  let lastBearBoxIdx = -1;
  // Store box top/bottom prices for price-test logic
  let bullBoxTop = NaN;
  let bullBoxBot = NaN;
  let bearBoxTop = NaN;
  let bearBoxBot = NaN;
  // box.new(bar_index, high - vola, bar_index + 5, high): get_top() of the latest bearish box (get_bottom(): its high)
  let bearBoxGetTop = NaN;
  const flags: boolean[][] = [[], [], [], []];
  for (let i = 0; i < Math.min(warmup, n); i++) flags.forEach((f) => f.push(false));

  // Detect crossovers
  for (let i = warmup; i < n; i++) {
    const h1 = h1Arr[i] ?? NaN;
    const h2 = h2Arr[i] ?? NaN;
    const prevH1 = h1Arr[i - 1] ?? NaN;
    const prevH2 = h2Arr[i - 1] ?? NaN;
    const vola = (atrArr[i] ?? 0) / 2;

    const isCrossover = prevH1 <= prevH2 && h1 > h2;
    const isCrossunder = prevH1 >= prevH2 && h1 < h2;

    // Crossover: hema1 crosses above hema2 (bullish)
    if (isCrossover) {
      markers.push({
        time: bars[i].time,
        position: 'belowBar',
        shape: 'triangleUp',
        color: bullColor,
        text: '',
      });
      // Bullish support box: low to low + vola
      bullBoxBot = bars[i].low;
      bullBoxTop = bars[i].low + vola;
      boxes.push({
        time1: bars[i].time, price1: bullBoxTop,
        time2: bars[i].time, price2: bullBoxBot,
        bgColor: bullColor + '4D', borderColor: 'transparent',
      });
      lastBullBoxIdx = boxes.length - 1;
    }
    // Crossunder: hema1 crosses below hema2 (bearish)
    if (isCrossunder) {
      markers.push({
        time: bars[i].time,
        position: 'aboveBar',
        shape: 'triangleDown',
        color: bearColor,
        text: '',
      });
      // Bearish resistance box: high - vola to high
      bearBoxTop = bars[i].high;
      bearBoxBot = bars[i].high - vola;
      bearBoxGetTop = bars[i].high - vola;
      boxes.push({
        time1: bars[i].time, price1: bearBoxTop,
        time2: bars[i].time, price2: bearBoxBot,
        bgColor: bearColor + '4D', borderColor: 'transparent',
      });
      lastBearBoxIdx = boxes.length - 1;
    }

    // Extend most recent boxes to current bar (Pine: Q.set_right(bar_index))
    if (lastBullBoxIdx >= 0) {
      boxes[lastBullBoxIdx].time2 = bars[i].time;
    }
    if (lastBearBoxIdx >= 0) {
      boxes[lastBearBoxIdx].time2 = bars[i].time;
    }

    // Price-test markers: wick into box but body stays outside
    // Bullish box support test: low dips into box but open & close above box top
    if (lastBullBoxIdx >= 0 && !isNaN(bullBoxTop)) {
      if (bars[i].low < bullBoxTop && bars[i].high > bullBoxTop &&
          bars[i].open > bullBoxTop && bars[i].close > bullBoxTop) {
        markers.push({
          time: bars[i].time,
          position: 'belowBar',
          shape: 'triangleUp',
          color: bullColor,
          text: '',
        });
      }
    }
    // Bearish box resistance test: high wicks into box but open & close below box top
    if (lastBearBoxIdx >= 0 && !isNaN(bearBoxTop)) {
      if (bars[i].high > bearBoxTop && bars[i].low < bearBoxTop &&
          bars[i].open < bearBoxTop && bars[i].close < bearBoxTop) {
        markers.push({
          time: bars[i].time,
          position: 'aboveBar',
          shape: 'triangleDown',
          color: bearColor,
          text: '',
        });
      }
    }

    // alertcondition(ta.crossover(hema1, hema2)) / (ta.crossunder(hema1, hema2)) / (low_test != 0.0) / (high_test != 0.0);
    // low_test / high_test := get_bottom() of the box on a test
    const b = bars[i];
    const lowTest = lastBullBoxIdx >= 0 && b.low < bullBoxTop && b.high > bullBoxTop && b.open > bullBoxTop
      && b.close > bullBoxTop && bullBoxBot !== 0;
    const highTest = lastBearBoxIdx >= 0 && b.high > bearBoxGetTop && b.low < bearBoxGetTop && b.open < bearBoxGetTop
      && b.close < bearBoxGetTop && bearBoxTop !== 0;
    flags[0].push(isCrossover);
    flags[1].push(isCrossunder);
    flags[2].push(lowTest);
    flags[3].push(highTest);

    // Bar colors
    const close = bars[i].close;
    const bullishCond = close > h1 && h1 > h2;
    const bearishCond = close < h1 && h1 < h2;
    const grayCond = (close < h1 && h1 > h2) || (close > h1 && h1 < h2);

    if (bullishCond) {
      barColors.push({ time: bars[i].time, color: bullColor + '80' });
    } else if (bearishCond) {
      barColors.push({ time: bars[i].time, color: bearColor + '80' });
    } else if (grayCond) {
      barColors.push({ time: bars[i].time, color: '#80808080' });
    }
  }

  // Plots with dynamic color based on trend
  const plot0 = h1Arr.map((v, i) => {
    if (i < warmup || v == null || isNaN(v)) return { time: bars[i].time, value: NaN };
    const h2v = h2Arr[i] ?? NaN;
    const color = v > h2v ? bullColor + 'B3' : bearColor + 'B3';
    return { time: bars[i].time, value: v, color };
  });

  const plot1 = h2Arr.map((v, i) => {
    if (i < warmup || v == null || isNaN(v)) return { time: bars[i].time, value: NaN };
    const h1v = h1Arr[i] ?? NaN;
    const color = h1v > v ? bullColor + 'B3' : bearColor + 'B3';
    return { time: bars[i].time, value: v, color };
  });

  // Pine: hemaTop = plot(hema1 > hema2 ? hema1 : hema2, "Top HEMA", display=display.none)
  const hemaTop = h1Arr.map((h1v, i) => ({ time: bars[i].time, value: h1v > h2Arr[i] ? h1v : h2Arr[i] }));
  // Pine: hemaBottom = plot(hema1 > hema2 ? hema2 : hema1, "Bottom HEMA", display=display.none)
  const hemaBottom = h1Arr.map((h1v, i) => ({ time: bars[i].time, value: h1v > h2Arr[i] ? h2Arr[i] : h1v }));

  // Pine: fill(hemaTop, hemaBottom, hema1, hema2, color.new(chart.bg_color, 100), color.new(fillColor, 70), "HEMA Gradient")
  // fillColor = hema1 > hema2 ? bullColor : bearColor
  const gradient = {
    topValue: h1Arr.slice(),
    bottomValue: h2Arr.slice(),
    topColor: h1Arr.map((): string | null => '#00000000'),
    bottomColor: h1Arr.map((h1v, i): string | null => color.new_color(h1v > h2Arr[i] ? bullColor : bearColor, 70) as string),
  };

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'hemaTop': hemaTop, 'hemaBottom': hemaBottom },
    fills: [{ plot1: 'hemaTop', plot2: 'hemaBottom', options: { title: 'HEMA Gradient' }, gradient }],
    markers,
    barColors,
    boxes,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Crossover', message: 'HEMA 20 crossed above HEMA 40 - Bullish Trend' },
  { id: 'alert1', title: 'Bearish Crossunder', message: 'HEMA 20 crossed below HEMA 40 - Bearish Trend' },
  { id: 'alert2', title: 'Bullish Test', message: 'Price tested bullish box support' },
  { id: 'alert3', title: 'Bearish Test', message: 'Price tested bearish box resistance' },
];

export const HemaTrendLevels = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
