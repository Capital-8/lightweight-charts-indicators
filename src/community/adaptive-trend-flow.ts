/**
 * Adaptive Trend Flow [QuantAlgo]
 *
 * Dual EMA basis (fast + slow on hlc3) plus stdev volatility bands.
 * Trend state tracks: bullish when close > upper, bearish when close < lower.
 * Plots basis line and trailing level (lower in uptrend, upper in downtrend).
 * Alerts (alertcondition, `alerts` of the result): 'Adaptive Trend Flow Long' / 'Short' on the trend changes.
 *
 * Reference: "Adaptive Trend Flow [QuantAlgo]" by QuantAlgo
 */

import { ta, Series, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData, BgColorData, LabelData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AdaptiveTrendFlowInputs {
  length: number;
  smoothLen: number;
  sensitivity: number;
}

export const defaultInputs: AdaptiveTrendFlowInputs = {
  length: 10,
  smoothLen: 14,
  sensitivity: 2.0,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Main Length', defval: 10, min: 2 },
  { id: 'smoothLen', type: 'int', title: 'Smoothing Length', defval: 14, min: 2 },
  { id: 'sensitivity', type: 'float', title: 'Sensitivity', defval: 2.0, min: 0.1, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Basis', color: '#787B86', lineWidth: 2 },
  { id: 'plot1', title: 'Level', color: '#787B86', lineWidth: 2 },
];

export const metadata = {
  title: 'Adaptive Trend Flow [QuantAlgo]',
  shortTitle: 'ATF',
  overlay: true,
};

export function calculate(
  bars: Bar[],
  inputs: Partial<AdaptiveTrendFlowInputs> = {},
): Omit<IndicatorResult, 'markers'> & { barColors: BarColorData[]; bgColors: BgColorData[]; labels: LabelData[] }
  & { alerts: AlertConditionState[] } {
  const { length, smoothLen, sensitivity } = { ...defaultInputs, ...inputs };
  const len = bars.length;

  const typical = new Series(bars, (b) => (b.high + b.low + b.close) / 3);

  // Dual EMA basis
  const fastEmaArr = ta.ema(typical, length).toArray();
  const slowEmaArr = ta.ema(typical, length * 2).toArray();

  // Volatility: stdev of typical, smoothed with EMA
  const volArr = ta.stdev(typical, length).toArray();
  const volSeries = Series.fromArray(bars, volArr);
  const smoothVolArr = ta.ema(volSeries, smoothLen).toArray();

  // Build basis, upper, lower arrays
  const basisArr: number[] = new Array(len);
  const upperArr: number[] = new Array(len);
  const lowerArr: number[] = new Array(len);

  for (let i = 0; i < len; i++) {
    const fast = fastEmaArr[i];
    const slow = slowEmaArr[i];
    const sVol = smoothVolArr[i];

    if (isNaN(fast) || isNaN(slow) || isNaN(sVol)) {
      basisArr[i] = NaN;
      upperArr[i] = NaN;
      lowerArr[i] = NaN;
    } else {
      basisArr[i] = (fast + slow) / 2;
      upperArr[i] = basisArr[i] + sVol * sensitivity;
      lowerArr[i] = basisArr[i] - sVol * sensitivity;
    }
  }

  // Trend state tracking (bar-by-bar, matches PineScript var logic)
  const trendArr: number[] = new Array(len); // 1 = bull, -1 = bear
  const levelArr: number[] = new Array(len);

  for (let i = 0; i < len; i++) {
    if (isNaN(basisArr[i])) {
      trendArr[i] = 0;
      levelArr[i] = NaN;
      continue;
    }

    const close = bars[i].close;

    if (i === 0 || trendArr[i - 1] === 0) {
      // Initialize: first valid bar
      trendArr[i] = close > basisArr[i] ? 1 : -1;
      levelArr[i] = trendArr[i] === 1 ? lowerArr[i] : upperArr[i];
      continue;
    }

    const prevTrend = trendArr[i - 1];

    if (prevTrend === 1) {
      if (close < lowerArr[i]) {
        trendArr[i] = -1;
        levelArr[i] = upperArr[i];
      } else {
        trendArr[i] = 1;
        levelArr[i] = lowerArr[i];
      }
    } else {
      if (close > upperArr[i]) {
        trendArr[i] = 1;
        levelArr[i] = lowerArr[i];
      } else {
        trendArr[i] = -1;
        levelArr[i] = upperArr[i];
      }
    }
  }

  const warmup = length * 2 + smoothLen;

  // Alerts: the original's get_trend_state on every bar (var trend = 0, var prev_level = na): while prev_level is na
  // it starts again from close > basis (basis na: -1), so the trend can change before the bands exist
  const origTrend: number[] = new Array(len);
  {
    let prevLevel = NaN;
    let trend = 0;
    for (let i = 0; i < len; i++) {
      const close = bars[i].close;
      const basis = (fastEmaArr[i] + slowEmaArr[i]) / 2;
      const upper = basis + smoothVolArr[i] * sensitivity;
      const lower = basis - smoothVolArr[i] * sensitivity;
      if (isNaN(prevLevel)) {
        trend = close > basis ? 1 : -1;
        prevLevel = trend === 1 ? lower : upper;
      }
      if (trend === 1) {
        if (close < lower) {
          trend = -1;
          prevLevel = upper;
        } else prevLevel = lower;
      } else if (close > upper) {
        trend = 1;
        prevLevel = lower;
      } else prevLevel = upper;
      origTrend[i] = trend;
    }
  }
  // long_signal = trend == 1 and trend[1] == -1; short_signal = trend == -1 and trend[1] == 1
  const longSignal = origTrend.map((t, i) => t === 1 && i > 0 && origTrend[i - 1] === -1);
  const shortSignal = origTrend.map((t, i) => t === -1 && i > 0 && origTrend[i - 1] === 1);

  // plot0: basis colored by trend
  const plot0 = basisArr.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const color = trendArr[i] === 1 ? '#00ffaa' : '#ff0000';
    return { time: bars[i].time, value: v, color };
  });

  // plot1: level with linebr style (NaN on trend change)
  const plot1 = levelArr.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    const color = bars[i].close > v ? '#00ffaa' : '#ff0000';
    return { time: bars[i].time, value: v, color };
  });

  // barcolor: bars colored by trend direction (Pine: barcolor(trend == 1 ? bullcolor : bearcolor))
  const barColors: BarColorData[] = [];
  for (let i = warmup; i < len; i++) {
    if (trendArr[i] !== 0) {
      barColors.push({
        time: bars[i].time,
        color: trendArr[i] === 1 ? 'rgba(0, 255, 170, 0.85)' : 'rgba(255, 0, 0, 0.85)',
      });
    }
  }

  // bgcolor: gradient background that intensifies over trend duration
  // Pine: intensity increments each bar (max 20), color from 95% to 80% transparency
  const bgColors: BgColorData[] = [];
  let intensity = 0;
  let prevTrend = 0;
  for (let i = warmup; i < len; i++) {
    if (trendArr[i] !== prevTrend) {
      intensity = 0;
      prevTrend = trendArr[i];
    }
    intensity = Math.min(intensity + 1, 20);
    // Map intensity 0->20 to alpha 0.05->0.20
    const alpha = 0.05 + (intensity / 20) * 0.15;
    if (trendArr[i] === 1) {
      bgColors.push({ time: bars[i].time, color: `rgba(0, 255, 170, ${alpha.toFixed(2)})` });
    } else if (trendArr[i] === -1) {
      bgColors.push({ time: bars[i].time, color: `rgba(255, 0, 0, ${alpha.toFixed(2)})` });
    }
  }

  // Pine: fill(p1, p2, level, basis, trend == 1 ? bullcolor : bearcolor, na) (twice)
  // Pine trend is -1 before the bands exist (close > na is false), so bearcolor there.
  const gradient = () => ({
    topValue: levelArr.slice(),
    bottomValue: basisArr.slice(),
    topColor: trendArr.map((t): string | null => (t === 1 ? '#00ffaa' : '#ff0000')),
    bottomColor: trendArr.map((): string | null => null),
  });

  // Labels: "S" at crossunder(close, level), "L" at crossover(close, level)
  // Pine: label.new with style_label_lower_right for short, style_label_upper_right for long
  const labels: LabelData[] = [];
  for (let i = warmup + 1; i < len; i++) {
    if (isNaN(levelArr[i]) || isNaN(levelArr[i - 1])) continue;
    const prevClose = bars[i - 1].close;
    const curClose = bars[i].close;
    const prevLevel = levelArr[i - 1];
    const curLevel = levelArr[i];
    // crossunder: prev close >= prev level AND cur close < cur level
    if (prevClose >= prevLevel && curClose < curLevel) {
      labels.push({
        time: bars[i].time,
        price: curLevel,
        text: '\ud835\udc7a', // "𝑺"
        color: '#ff0000',
        textColor: '#FFFFFF',
        style: 'label_down',
      });
    }
    // crossover: prev close <= prev level AND cur close > cur level
    if (prevClose <= prevLevel && curClose > curLevel) {
      labels.push({
        time: bars[i].time,
        price: curLevel,
        text: '\ud835\udc71', // "𝑳"
        color: '#00ffaa',
        textColor: '#000000',
        style: 'label_up',
      });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1 },
    // Pine p1 = level (plot1), p2 = basis (plot0)
    fills: [
      { plot1: 'plot1', plot2: 'plot0', gradient: gradient() },
      { plot1: 'plot1', plot2: 'plot0', gradient: gradient() },
    ],
    barColors,
    bgColors,
    labels,
    alerts: alertStates(alertConditions, bars, [longSignal, shortSignal]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Adaptive Trend Flow Long', message: 'Adaptive Trend Flow Long {{exchange}}:{{ticker}}' },
  { id: 'alert1', title: 'Adaptive Trend Flow Short', message: 'Adaptive Trend Flow Short {{exchange}}:{{ticker}}' },
];

export const AdaptiveTrendFlow = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
