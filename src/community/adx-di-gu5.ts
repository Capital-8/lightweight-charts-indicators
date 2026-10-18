/**
 * ADX Di+ Di- [Gu5]
 *
 * Standard ADX with Di+/Di- calculation. ADX color reflects trend state:
 * orange in range, green/dark green for bullish, red/dark red for bearish.
 * Fill between Di+ and Di- colored by trend. Markers for trend entries/exits.
 * Bar coloring matches ADX color state.
 * Alerts (alertcondition, `alerts` of the result): the original's trend state (weak / strong bullish or bearish entry,
 * end of trend) on its ADX / DI rules, on confirmed bars (`barstate.isconfirmed`: the last bar only when the chart
 * context says it is closed, `lastBarConfirmed`, true without a context): any alert, buy / sell weak, buy / sell
 * strong, buy / sell close. They use the ADX and DI values the port plots.
 *
 * Reference: "ADX Di+ Di- [Gu5]" by Gu5tavo71
 */

import { type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';
import { lastBarConfirmedOf, type ChartContext } from '../chart-context';

export interface ADXDiGu5Inputs {
  sigLen: number;
  diLen: number;
  hlRange: number;
  hlTrend: number;
  barColorOn: boolean;
}

export const defaultInputs: ADXDiGu5Inputs = {
  sigLen: 14,
  diLen: 14,
  hlRange: 20,
  hlTrend: 35,
  barColorOn: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'sigLen', type: 'int', title: 'ADX Smoothing', defval: 14, min: 1 },
  { id: 'diLen', type: 'int', title: 'DI Length', defval: 14, min: 1 },
  { id: 'hlRange', type: 'int', title: 'Range Level', defval: 20, min: 0 },
  { id: 'hlTrend', type: 'int', title: 'Trend Level', defval: 35, min: 0 },
  { id: 'barColorOn', type: 'bool', title: 'Bar Coloring', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'adx', title: 'ADX', color: '#FF9800', lineWidth: 3 },
  { id: 'diPlus', title: 'Di+', color: '#26A69A', lineWidth: 1 },
  { id: 'diMinus', title: 'Di-', color: '#EF5350', lineWidth: 1 },
];

export const metadata = {
  title: 'ADX Di+ Di- [Gu5]',
  shortTitle: 'ADX Gu5',
  overlay: false,
};

// Colors matching Pine source
const COLOR_ORANGE = '#FF9800';
const COLOR_DARK_GREEN = '#006400';
const COLOR_LIGHT_GREEN = '#388E3C';
const COLOR_DARK_RED = '#8B0000';
const COLOR_LIGHT_RED = '#B71C1C';

export function calculate(
  bars: Bar[],
  inputs: Partial<ADXDiGu5Inputs> = {},
  chart?: ChartContext,
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const diLen = cfg.diLen;
  const sigLen = cfg.sigLen;

  // RMA state arrays
  const trRma: number[] = new Array(n).fill(0);
  const plusDMRma: number[] = new Array(n).fill(0);
  const minusDMRma: number[] = new Array(n).fill(0);
  const diPlusArr: number[] = new Array(n).fill(0);
  const diMinusArr: number[] = new Array(n).fill(0);
  const adxArr: number[] = new Array(n).fill(0);

  // RMA accumulators
  let trSum = 0;
  let plusDMSum = 0;
  let minusDMSum = 0;
  let dxRmaSum = 0;

  for (let i = 0; i < n; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevHigh = i > 0 ? bars[i - 1].high : high;
    const prevLow = i > 0 ? bars[i - 1].low : low;
    const prevClose = i > 0 ? bars[i - 1].close : bars[i].close;

    // True range
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));

    // Directional movement
    const up = high - prevHigh;
    const down = prevLow - low;
    const plusDM = up > down && up > 0 ? up : 0;
    const minusDM = down > up && down > 0 ? down : 0;

    // RMA (Wilder's smoothing)
    if (i < diLen) {
      trSum += tr;
      plusDMSum += plusDM;
      minusDMSum += minusDM;
      if (i === diLen - 1) {
        trRma[i] = trSum / diLen;
        plusDMRma[i] = plusDMSum / diLen;
        minusDMRma[i] = minusDMSum / diLen;
      } else {
        trRma[i] = 0;
        plusDMRma[i] = 0;
        minusDMRma[i] = 0;
      }
    } else {
      trRma[i] = (trRma[i - 1] * (diLen - 1) + tr) / diLen;
      plusDMRma[i] = (plusDMRma[i - 1] * (diLen - 1) + plusDM) / diLen;
      minusDMRma[i] = (minusDMRma[i - 1] * (diLen - 1) + minusDM) / diLen;
    }

    // Di+ and Di-
    const trVal = trRma[i];
    diPlusArr[i] = trVal !== 0 ? 100 * plusDMRma[i] / trVal : 0;
    diMinusArr[i] = trVal !== 0 ? 100 * minusDMRma[i] / trVal : 0;

    // DX
    const diSum = diPlusArr[i] + diMinusArr[i];
    const dx = diSum !== 0 ? Math.abs(diPlusArr[i] - diMinusArr[i]) / diSum * 100 : 0;

    // ADX = RMA of DX
    if (i < diLen + sigLen - 1) {
      dxRmaSum += dx;
      if (i === diLen + sigLen - 2) {
        adxArr[i] = dxRmaSum / sigLen;
      } else {
        adxArr[i] = 0;
      }
    } else {
      adxArr[i] = (adxArr[i - 1] * (sigLen - 1) + dx) / sigLen;
    }
  }

  const warmup = diLen;
  const adxWarmup = diLen + sigLen - 1;

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];

  // Determine ADX color per bar and generate markers
  const adxColors: string[] = new Array(n).fill(COLOR_ORANGE);

  for (let i = adxWarmup + 1; i < n; i++) {
    const sig = adxArr[i];
    const sigPrev = adxArr[i - 1];
    const sigUp = sig > sigPrev;
    const diUp = diPlusArr[i] > diMinusArr[i];
    const diDn = diMinusArr[i] > diPlusArr[i];
    const diUpPrev = diPlusArr[i - 1] > diMinusArr[i - 1];
    const diDnPrev = diMinusArr[i - 1] > diPlusArr[i - 1];
    const inRange = sig <= cfg.hlRange;
    const inRangePrev = sigPrev <= cfg.hlRange;

    // ADX color logic from Pine
    let color: string;
    if (inRange) {
      color = COLOR_ORANGE;
    } else if (sigUp && diUp) {
      color = COLOR_DARK_GREEN;
    } else if (!sigUp && diUp) {
      color = COLOR_LIGHT_GREEN;
    } else if (sigUp && diDn) {
      color = COLOR_DARK_RED;
    } else {
      color = COLOR_LIGHT_RED;
    }
    adxColors[i] = color;

    // Bar coloring
    if (cfg.barColorOn) {
      barColors.push({ time: bars[i].time, color });
    }

    // Trend entry markers (triangles)
    const entryLong = (!inRange && diUp && sigUp && !diUpPrev) ||
                      (!inRange && diUp && sigUp && sig > cfg.hlRange && inRangePrev);
    const entryShort = (!inRange && diDn && sigUp && !diDnPrev) ||
                       (!inRange && diDn && sigUp && sig > cfg.hlRange && inRangePrev);

    if (entryLong) {
      markers.push({ time: bars[i].time, position: 'belowBar', shape: 'triangleUp', color: COLOR_DARK_GREEN, text: 'Bull' });
    }
    if (entryShort) {
      markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'triangleDown', color: COLOR_DARK_RED, text: 'Bear' });
    }

    // Exit markers (xcross) on DI crossover or entering range
    const crossDi = diUp !== diUpPrev;
    const exitSignal = (crossDi) || (inRange && !inRangePrev);
    if (exitSignal) {
      markers.push({ time: bars[i].time, position: 'inBar', shape: 'xcross', color: COLOR_ORANGE, text: 'Exit' });
    }
  }

  // Plot arrays
  const adxPlot = adxArr.map((v, i) => ({
    time: bars[i].time,
    value: i < adxWarmup ? NaN : v,
    color: adxColors[i],
  }));

  const diPlusPlot = diPlusArr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : v,
  }));

  const diMinusPlot = diMinusArr.map((v, i) => ({
    time: bars[i].time,
    value: i < warmup ? NaN : v,
  }));

  // Fill between diPlus and diMinus with trend color
  const fillColors = bars.map((_b, i) => {
    if (i < adxWarmup) return 'transparent';
    const sig = adxArr[i];
    const diUp = diPlusArr[i] > diMinusArr[i];
    const inRange = sig <= cfg.hlRange;
    if (inRange) return 'rgba(255,152,0,0.10)';
    if (diUp) return 'rgba(0,100,0,0.10)';
    return 'rgba(139,0,0,0.10)';
  });

  // Alerts: the original's rules on the plotted series (na before their warm-up; na compares false)
  const sigA = adxPlot.map((p) => p.value);
  const dpA = diPlusPlot.map((p) => p.value);
  const dmA = diMinusPlot.map((p) => p.value);
  const lastConfirmed = lastBarConfirmedOf(chart);
  const prevB = (a: boolean[], i: number) => i > 0 && a[i - 1];
  const hlRange = sigA.map((v) => v <= cfg.hlRange);
  const diUpA = dpA.map((v, i) => v >= dmA[i]);
  const diDnA = dmA.map((v, i) => v > dpA[i]);
  const alertFlags: boolean[][] = [[], [], [], [], [], [], []];
  let condPrev = NaN; // condition[1] (na before the first bar)
  for (let i = 0; i < n; i++) {
    const sigUp = i > 0 && sigA[i] > sigA[i - 1];
    const diUp = diUpA[i];
    const diDn = diDnA[i];
    const diUpUp = dpA[i] >= cfg.hlTrend;
    const diDnDn = dmA[i] > cfg.hlTrend;
    // crossDi = ta.cross(diPlus, diMinus)
    const crossDi = i > 0 && ((dpA[i] > dmA[i] && dpA[i - 1] <= dmA[i - 1]) || (dpA[i] < dmA[i] && dpA[i - 1] >= dmA[i - 1]));
    const r = hlRange[i];
    const entryLong = (!r && diUp && sigUp && !prevB(diUpA, i)) || (!r && diUp && sigUp && sigA[i] > cfg.hlRange && prevB(hlRange, i));
    const entryShort = (!r && diDn && sigUp && !prevB(diDnA, i)) || (!r && diDn && sigUp && sigA[i] > cfg.hlRange && prevB(hlRange, i));
    const entryLongStr = !r && diUp && sigUp && diUpUp;
    const entryShortSt = !r && diDn && sigUp && diDnDn;
    const exitLong = (crossDi && prevB(diUpA, i)) || (r && !prevB(hlRange, i));
    const exitShort = (crossDi && prevB(diDnA, i)) || (r && !prevB(hlRange, i));
    // condition := condition[1] != 1 and entryLongStr ? 1 : ... : nz(condition[1])
    const ne = (v: number) => !isNaN(condPrev) && condPrev !== v;
    const cond = ne(1) && entryLongStr ? 1
      : ne(-1) && entryShortSt ? -1
        : ne(0.5) && entryLong ? 0.5
          : ne(-0.5) && entryShort ? -0.5
            : ne(0) && exitLong ? 0
              : ne(0) && exitShort ? 0
                : (isNaN(condPrev) ? 0 : condPrev);
    const confirmed = i < n - 1 || lastConfirmed;
    const longE = confirmed && ne(0.5) && cond === 0.5;
    const shortE = confirmed && ne(-0.5) && cond === -0.5;
    const longEStr = confirmed && ne(1) && cond === 1;
    const shortEStr = confirmed && ne(-1) && cond === -1;
    const longX = confirmed && ((condPrev === 0.5 && cond === 0) || (condPrev === 1 && cond === 0));
    const shortX = confirmed && ((condPrev === -0.5 && cond === 0) || (condPrev === -1 && cond === 0));
    condPrev = cond;
    alertFlags[0].push(longE || shortE || longEStr || shortEStr || longX || shortX);
    alertFlags[1].push(longE);
    alertFlags[2].push(shortE);
    alertFlags[3].push(longEStr);
    alertFlags[4].push(shortEStr);
    alertFlags[5].push(longX);
    alertFlags[6].push(shortX);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      adx: adxPlot,
      diPlus: diPlusPlot,
      diMinus: diMinusPlot,
    },
    hlines: [
      { value: cfg.hlRange, options: { color: '#FF9800', linestyle: 'dashed' as const, title: 'Range' } },
      { value: cfg.hlTrend, options: { color: '#787B86', linestyle: 'dashed' as const, title: 'Trend' } },
    ],
    fills: [{ plot1: 'diPlus', plot2: 'diMinus', colors: fillColors }],
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Any Alert', message: 'Any Alert' },
  { id: 'alert1', title: 'Buy Weak Alert', message: 'Buy Weak Alert' },
  { id: 'alert2', title: 'Sell Weak Alert', message: 'Sell Weak Alert' },
  { id: 'alert3', title: 'Buy Strong Alert', message: 'Buy Strong Alert' },
  { id: 'alert4', title: 'Sell Strong Alert', message: 'Sell Strong Alert' },
  { id: 'alert5', title: 'Buy Close Alert', message: 'Buy Close Alert' },
  { id: 'alert6', title: 'Sell Close Alert', message: 'Sell Close Alert' },
];

export const ADXDiGu5 = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
