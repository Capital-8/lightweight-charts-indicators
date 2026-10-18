/**
 * Volatility-Driven VWAP Structure
 *
 * A rolling VWAP of hlc3 over a fixed number of bars is followed by a stepped structure (an upper and a lower level
 * one step apart). The step is ATR(length) * multiplier * an adaptive factor 0.5 + 1.5 * sigmoid(4 * (fast ATR /
 * slow ATR - 1) + 0.75 * clamped z-score of the fast ATR). When the rolling VWAP moves more than one step beyond the
 * structure, the structure jumps by a whole number of steps and takes the direction of the move. The structure mean
 * is plotted in the direction colour. On each direction change a VWAP of hlc3 is anchored again, with two standard
 * deviation bands filled around it.
 * Alerts (alertcondition, `alerts` of the result): structure shifts / reversals, closes crossing the anchored VWAP and
 * the structure mean, and touches of the four deviation bands (computed whether the bands are shown or not).
 *
 * Reference: "Volatility-Driven VWAP Structure (Zeiierman)" by Zeiierman
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolatilityDrivenVWAPStructureInputs {
  /** Number of bars of the rolling VWAP */
  vwapLengthInput: number;
  /** Multiplier of the adaptive volatility step */
  structureMultInput: number;
  /** ATR length of the volatility step (the slow ATR uses 4 times this length) */
  atrLength: number;
  /** Show the first deviation band of the anchored VWAP */
  showBand1: boolean;
  /** Show the second deviation band of the anchored VWAP */
  showBand2: boolean;
  /** Multiplier of the first deviation band */
  bandMult1: number;
  /** Multiplier of the second deviation band */
  bandMult2: number;
  /** Bullish colour */
  bullColorInput: string;
  /** Bearish colour */
  bearColorInput: string;
}

export const defaultInputs: VolatilityDrivenVWAPStructureInputs = {
  vwapLengthInput: 200,
  structureMultInput: 1.5,
  atrLength: 14,
  showBand1: true,
  showBand2: true,
  bandMult1: 1.0,
  bandMult2: 2.0,
  bullColorInput: '#00e676',
  bearColorInput: '#f23645',
};

export const inputConfig: InputConfig[] = [
  { id: 'vwapLengthInput', type: 'int', title: 'Rolling VWAP Length', defval: 200, min: 1 },
  { id: 'structureMultInput', type: 'float', title: 'Structure Multiplier', defval: 1.5, min: 0.1, step: 0.1 },
  { id: 'atrLength', type: 'int', title: 'Volatility Length', defval: 14, min: 1 },
  { id: 'showBand1', type: 'bool', title: 'Show Band 1', defval: true },
  { id: 'showBand2', type: 'bool', title: 'Show Band 2', defval: true },
  { id: 'bandMult1', type: 'float', title: 'Band 1 Multiplier', defval: 1.0, step: 0.1 },
  { id: 'bandMult2', type: 'float', title: 'Band 2 Multiplier', defval: 2.0, step: 0.1 },
  { id: 'bullColorInput', type: 'color', title: 'Bullish Color', defval: '#00e676' },
  { id: 'bearColorInput', type: 'color', title: 'Bearish Color', defval: '#f23645' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VWAP Structure Mean', color: '#00e676', lineWidth: 3 },
  { id: 'plot1', title: 'Reversal Anchored VWAP', color: '#00e676', lineWidth: 2 },
  { id: 'plot2', title: 'Anchored VWAP Upper 1', color: '#00e676', lineWidth: 1 },
  { id: 'plot3', title: 'Anchored VWAP Lower 1', color: '#00e676', lineWidth: 1 },
  { id: 'plot4', title: 'Anchored VWAP Upper 2', color: '#00e676', lineWidth: 1 },
  { id: 'plot5', title: 'Anchored VWAP Lower 2', color: '#00e676', lineWidth: 1 },
];

export const metadata = {
  title: 'Volatility-Driven VWAP Structure',
  shortTitle: 'VD VWAP Structure',
  overlay: true,
};

/** Pine float comparison: a > b only when a - b > 1e-10 (false with na) */
const gt = (a: number, b: number) => a - b > 1e-10;
/** Pine a != b: |a - b| > 1e-10 (false with na) */
const ne = (a: number, b: number) => Math.abs(a - b) > 1e-10;
/** Pine a >= b: not (b - a > 1e-10) (false with na) */
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > 1e-10);
/** Pine division: x / 0 is na */
const div = (a: number, b: number) => (b === 0 ? NaN : a / b);

export function calculate(
  bars: Bar[],
  inputs: Partial<VolatilityDrivenVWAPStructureInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const { vwapLengthInput, structureMultInput, atrLength, showBand1, showBand2, bandMult1, bandMult2 } = cfg;
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // src = hlc3; rollingVwap = math.sum(src * volume, len) / math.sum(volume, len)
  const src = bars.map((b) => (b.high + b.low + b.close) / 3);
  const vol = bars.map((b) => b.volume ?? NaN);
  const sumPV = A(math.sum(S(src.map((s, i) => s * vol[i])), vwapLengthInput));
  const sumV = A(math.sum(S(vol), vwapLengthInput));
  const rollingVwap = sumPV.map((pv, i) => div(pv, sumV[i]));

  // atrFast = ta.atr(len); atrSlow = ta.atr(len * 4); mean / stdev of atrFast over vwapLength * 4 bars
  const atrFast = A(ta.atr(bars, atrLength));
  const atrSlow = A(ta.atr(bars, atrLength * 4));
  const atrMean = A(ta.sma(S(atrFast), vwapLengthInput * 4));
  const atrDev = A(ta.stdev(S(atrFast), vwapLengthInput * 4));

  const mid: number[] = new Array(n);
  const direction: number[] = new Array(n);
  let structureUpper = NaN; // var float structureUpper = na
  let structureLower = NaN; // var float structureLower = na
  let dir = 0; // var int direction = 0
  for (let i = 0; i < n; i++) {
    // atrZ = atrDev != 0 ? (atrFast - atrMean) / atrDev : 0.0 (na != 0 is false: 0.0 while atrDev is na)
    const atrZ = ne(atrDev[i], 0) ? div(atrFast[i] - atrMean[i], atrDev[i]) : 0.0;
    const atrZClamped = Math.max(Math.min(atrZ, 3.0), -3.0);
    // volRatio = atrSlow != 0 ? atrFast / atrSlow : 1.0
    const volRatio = ne(atrSlow[i], 0) ? div(atrFast[i], atrSlow[i]) : 1.0;
    const sigmoidInput = 4.0 * (volRatio - 1.0) + 0.75 * atrZClamped;
    const sigmoid = 1.0 / (1.0 + Math.exp(-sigmoidInput));
    const adaptiveVolMult = 0.5 + sigmoid * 1.5;
    const structureStep = atrFast[i] * structureMultInput * adaptiveVolMult;

    const vw = rollingVwap[i];
    const structureReady = !isNaN(vw) && !isNaN(structureStep) && gt(structureStep, 0);
    if (structureReady) {
      if (isNaN(structureUpper)) {
        structureUpper = vw;
        structureLower = vw - structureStep;
        dir = 1;
      } else {
        const upsideExpansion = vw - (structureUpper + structureStep);
        const downsideExpansion = (structureLower - structureStep) - vw;
        const expandsHigher = gt(upsideExpansion, 0);
        const expandsLower = gt(downsideExpansion, 0);
        const nextDirection = expandsHigher ? 1 : expandsLower ? -1 : dir;
        if (expandsHigher || expandsLower) {
          const referenceLevel = nextDirection === 1 ? structureUpper : structureLower;
          const travelDistance = Math.abs(vw - referenceLevel);
          const transitionSteps = Math.floor(div(travelDistance, structureStep));
          if (nextDirection === 1) {
            structureLower = structureUpper + (transitionSteps - 1) * structureStep;
            structureUpper = structureUpper + transitionSteps * structureStep;
          } else {
            structureUpper = structureLower - (transitionSteps - 1) * structureStep;
            structureLower = structureLower - transitionSteps * structureStep;
          }
          dir = nextDirection;
        }
      }
    }
    // structureMid = (structureUpper + structureLower) / 2.0
    mid[i] = (structureUpper + structureLower) / 2.0;
    direction[i] = dir;
  }

  // Reversal anchored VWAP: sums reset when ta.change(direction) != 0 (na on the first bar: false) or na(anchorSumPV)
  const anchoredVwap: number[] = new Array(n);
  const anchoredDev: number[] = new Array(n);
  const reversed: boolean[] = new Array(n);
  let anchorSumPV = NaN;
  let anchorSumV = NaN;
  let anchorSumP2V = NaN;
  for (let i = 0; i < n; i++) {
    const isReversed = i > 0 && direction[i] - direction[i - 1] !== 0;
    reversed[i] = isReversed;
    const s = src[i];
    const v = vol[i];
    if (isReversed || isNaN(anchorSumPV)) {
      anchorSumPV = s * v;
      anchorSumV = v;
      anchorSumP2V = s * s * v;
    } else {
      anchorSumPV += s * v;
      anchorSumV += v;
      anchorSumP2V += s * s * v;
    }
    // anchoredVwap = anchorSumV != 0 ? anchorSumPV / anchorSumV : na
    const vwapA = ne(anchorSumV, 0) ? anchorSumPV / anchorSumV : NaN;
    const anchoredVar = ne(anchorSumV, 0) ? anchorSumP2V / anchorSumV - Math.pow(vwapA, 2) : NaN;
    anchoredVwap[i] = vwapA;
    anchoredDev[i] = !isNaN(anchoredVar) ? Math.sqrt(Math.max(anchoredVar, 0)) : NaN;
  }

  // plotColor = anchorColor = direction == 1 ? bullColorInput : bearColorInput
  const col = (i: number) => (direction[i] === 1 ? cfg.bullColorInput : cfg.bearColorInput);
  const c = (i: number, transp: number) => String(color.new(col(i), transp));
  // anchorUpperK = anchoredVwap + anchoredDev * bandMultK; anchorLowerK = anchoredVwap - anchoredDev * bandMultK
  const band = (sign: 1 | -1, mult: number, show: boolean, transp: number) =>
    bars.map((b, i) => ({
      time: b.time,
      value: !show ? NaN : sign === 1 ? anchoredVwap[i] + anchoredDev[i] * mult : anchoredVwap[i] - anchoredDev[i] * mult,
      color: c(i, transp),
    }));

  // Alerts: bullishShift / bearishShift = isReversed and direction == 1 / -1; ta.crossover / ta.crossunder of close
  // with anchoredVwap and structureMid; high >= anchorUpperK, low <= anchorLowerK
  const closes = bars.map((b) => b.close);
  const bandAt = (sign: 1 | -1, mult: number, i: number) => anchoredVwap[i] + sign * anchoredDev[i] * mult;
  const le = (a: number, b: number) => ge(b, a);
  const flags: boolean[][] = [
    reversed.map((r, i) => r && direction[i] === 1),
    reversed.map((r, i) => r && direction[i] === -1),
    reversed,
    crossedOver(closes, anchoredVwap),
    crossedUnder(closes, anchoredVwap),
    crossedOver(closes, mid),
    crossedUnder(closes, mid),
    bars.map((b, i) => ge(b.high, bandAt(1, bandMult1, i))),
    bars.map((b, i) => le(b.low, bandAt(-1, bandMult1, i))),
    bars.map((b, i) => ge(b.high, bandAt(1, bandMult2, i))),
    bars.map((b, i) => le(b.low, bandAt(-1, bandMult2, i))),
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      // plot(structureMid, color = plotColor, linestyle = plot.linestyle_dotted, linewidth = 3)
      plot0: bars.map((b, i) => ({ time: b.time, value: mid[i], color: col(i) })),
      // plot(anchoredVwap, color = color.new(anchorColor, 0), linewidth = 2)
      plot1: bars.map((b, i) => ({ time: b.time, value: anchoredVwap[i], color: c(i, 0) })),
      // plot(showBand1 ? anchorUpper1 / anchorLower1 : na, color = color.new(anchorColor, 30))
      plot2: band(1, bandMult1, showBand1, 30),
      plot3: band(-1, bandMult1, showBand1, 30),
      // plot(showBand2 ? anchorUpper2 / anchorLower2 : na, color = color.new(anchorColor, 55))
      plot4: band(1, bandMult2, showBand2, 55),
      plot5: band(-1, bandMult2, showBand2, 55),
    },
    // fill(aU1, aL1, color.new(anchorColor, 92)); fill(aU2, aL2, color.new(anchorColor, 95))
    fills: [
      { plot1: 'plot2', plot2: 'plot3', colors: bars.map((_, i) => c(i, 92)) },
      { plot1: 'plot4', plot2: 'plot5', colors: bars.map((_, i) => c(i, 95)) },
    ],
    markers: [],
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish VWAP Structure Shift', message: 'Volatility-Driven VWAP Structure shifted bullish.' },
  { id: 'alert1', title: 'Bearish VWAP Structure Shift', message: 'Volatility-Driven VWAP Structure shifted bearish.' },
  { id: 'alert2', title: 'Any VWAP Structure Reversal', message: 'VWAP structure reversal detected.' },
  { id: 'alert3', title: 'Close Crossed Above Anchored VWAP', message: 'Price crossed above the reversal-anchored VWAP.' },
  { id: 'alert4', title: 'Close Crossed Below Anchored VWAP', message: 'Price crossed below the reversal-anchored VWAP.' },
  { id: 'alert5', title: 'Close Crossed Above VWAP Structure Mean', message: 'Price crossed above the VWAP structure mean.' },
  { id: 'alert6', title: 'Close Crossed Below VWAP Structure Mean', message: 'Price crossed below the VWAP structure mean.' },
  { id: 'alert7', title: 'Price Touched Upper Band 1', message: 'Price touched the first upper anchored VWAP deviation band.' },
  { id: 'alert8', title: 'Price Touched Lower Band 1', message: 'Price touched the first lower anchored VWAP deviation band.' },
  { id: 'alert9', title: 'Price Touched Upper Band 2', message: 'Price touched the second upper anchored VWAP deviation band.' },
  { id: 'alert10', title: 'Price Touched Lower Band 2', message: 'Price touched the second lower anchored VWAP deviation band.' },
];

export const VolatilityDrivenVWAPStructure = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
