/**
 * Boom Hunter Pro
 *
 * Three Ehlers Even Better Sinewave / Roofing Filter oscillators (EOT1, EOT2, EOT3)
 * with different periods. Uses Ehlers Highpass filter (100-bar) into SuperSmoother,
 * then Fast Attack / Slow Decay normalization. Quotient transform with K parameters.
 * LSMA WaveTrend using linreg for additional confluence.
 * Entry signals from crossover conditions on quotient + trigger.
 *
 * Markers as the original's plotshape outputs (ids shape0..shape9): exit warnings (orange circle, red "Overbought"),
 * the four "Long" labels (gray, yellow, blue, lime), the "Short" label, the "Continuation" triangle (break of the
 * resistance pivot of the main oscillator after a support break) and the two "Bounce" triangles of the LSMA wave
 * trend (wt2 = SMA 6 of avg(TCI, MF, RSI 3) of hlc3, at wt2 + 9 / wt2 - 9). The lengths of the LSMA wave trend and of
 * the support / resistance pivots are the original's default inputs.
 *
 * Alerts (alertcondition, `alerts` of the result): the original's 16 conditions.
 *
 * Reference: "Boom Hunter Pro" by veryfid
 */

import { ta, Series, color, math, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

/** The original's alertconditions (all with the default message) */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Crossover', message: 'Alert Fired!' },
  { id: 'alert1', title: 'Crossunder', message: 'Alert Fired!' },
  { id: 'alert2', title: 'Long', message: 'Alert Fired!' },
  { id: 'alert3', title: 'Entry Zone', message: 'Alert Fired!' },
  { id: 'alert4', title: 'Break Resistance', message: 'Alert Fired!' },
  { id: 'alert5', title: 'Break Support', message: 'Alert Fired!' },
  { id: 'alert6', title: 'Crossover - Market Low', message: 'Alert Fired!' },
  { id: 'alert7', title: 'Crossunder - Market High', message: 'Alert Fired!' },
  { id: 'alert8', title: 'Crossover With Pressure', message: 'Alert Fired!' },
  { id: 'alert9', title: 'Crossunder With Pressure', message: 'Alert Fired!' },
  { id: 'alert10', title: 'Continuation', message: 'Alert Fired!' },
  { id: 'alert11', title: 'Orange - Overbought', message: 'Alert Fired!' },
  { id: 'alert12', title: 'Red - Overbought', message: 'Alert Fired!' },
  { id: 'alert13', title: 'Bounce down', message: 'Alert Fired!' },
  { id: 'alert14', title: 'Bounce up', message: 'Alert Fired!' },
  { id: 'alert15', title: 'Short', message: 'Alert Fired!' },
];

export interface BoomHunterProInputs {
  lpPeriod: number;
  k1: number;
  trigLen: number;
  lpPeriod2: number;
  k12: number;
  k22: number;
  lpPeriod3: number;
  k13: number;
  square: boolean;
  showLongs: boolean;
  showShorts: boolean;
  /** Show Entry and Exit Points? (the exit warning circles) */
  showEntry: boolean;
}

export const defaultInputs: BoomHunterProInputs = {
  lpPeriod: 6,
  k1: 0,
  trigLen: 2,
  lpPeriod2: 27,
  k12: 0.8,
  k22: 0.3,
  lpPeriod3: 11,
  k13: 0.99,
  square: true,
  showLongs: true,
  showShorts: true,
  showEntry: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'lpPeriod', type: 'int', title: 'EOT1 LPPeriod', defval: 6, min: 1 },
  { id: 'k1', type: 'float', title: 'EOT1 K1', defval: 0, step: 0.1 },
  { id: 'trigLen', type: 'int', title: 'Trigger Length', defval: 2, min: 1 },
  { id: 'lpPeriod2', type: 'int', title: 'EOT2 LPPeriod', defval: 27, min: 1 },
  { id: 'k12', type: 'float', title: 'EOT2 K1', defval: 0.8, step: 0.1 },
  { id: 'k22', type: 'float', title: 'EOT2 K2', defval: 0.3, step: 0.1 },
  { id: 'lpPeriod3', type: 'int', title: 'EOT3 LPPeriod', defval: 11, min: 1 },
  { id: 'k13', type: 'float', title: 'EOT3 K1', defval: 0.99, step: 0.01 },
  { id: 'square', type: 'bool', title: 'Square Line', defval: true },
  { id: 'showLongs', type: 'bool', title: 'Show Long Entries', defval: true },
  { id: 'showShorts', type: 'bool', title: 'Show Short Entries', defval: true },
  { id: 'showEntry', type: 'bool', title: 'Show Entry and Exit Points?', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Quotient1', color: '#0000FF', lineWidth: 2 },
  { id: 'plot1', title: 'Trigger', color: '#FFFFFF', lineWidth: 2 },
  { id: 'plot2', title: 'Q3 (Red Wave)', color: '#FF000080', lineWidth: 1 },
  { id: 'plot3', title: 'Q5 (Yellow)', color: '#FFFF00', lineWidth: 1 },
  { id: 'plot4', title: 'Q6 (Blue Boom)', color: '#0000FF', lineWidth: 1 },
  { id: 'plot5', title: 'Q4 (Red Wave)', color: '#FF000080', lineWidth: 1 },
];

export const metadata = {
  title: 'Boom Hunter Pro',
  shortTitle: 'Boom Pro',
  overlay: false,
};

/**
 * Ehlers Highpass + SuperSmoother + Fast Attack/Slow Decay + Quotient transform.
 * Returns two quotient arrays for K1 and K2 parameters.
 */
function ehlers_eot(
  closeArr: number[],
  n: number,
  lpPeriod: number,
  paramK1: number,
  paramK2: number,
  hpDivisor: number = 2,
): { q1: number[]; q2: number[] } {
  const pi = Math.PI;

  // Highpass filter: period=100
  const alpha1 = (Math.cos(0.707 * 2 * pi / 100) + Math.sin(0.707 * 2 * pi / 100) - 1) / Math.cos(0.707 * 2 * pi / 100);

  const HP: number[] = new Array(n).fill(0);
  for (let i = 2; i < n; i++) {
    HP[i] = (1 - alpha1 / hpDivisor) * (1 - alpha1 / 2) * (closeArr[i] - 2 * closeArr[i - 1] + closeArr[i - 2])
      + 2 * (1 - alpha1) * HP[i - 1]
      - (1 - alpha1) * (1 - alpha1) * HP[i - 2];
  }

  // SuperSmoother
  const a1 = Math.exp(-1.414 * pi / lpPeriod);
  const b1 = 2 * a1 * Math.cos(1.414 * pi / lpPeriod);
  const c2 = b1;
  const c3 = -a1 * a1;
  const c1 = 1 - c2 - c3;

  const Filt: number[] = new Array(n).fill(0);
  for (let i = 2; i < n; i++) {
    Filt[i] = c1 * (HP[i] + HP[i - 1]) / 2 + c2 * Filt[i - 1] + c3 * Filt[i - 2];
  }

  // Fast Attack / Slow Decay
  const Peak: number[] = new Array(n).fill(0);
  const X: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    Peak[i] = 0.991 * Peak[i - 1];
    if (Math.abs(Filt[i]) > Peak[i]) Peak[i] = Math.abs(Filt[i]);
    if (Peak[i] !== 0) X[i] = Filt[i] / Peak[i];
  }

  // Quotient transform
  const q1: number[] = new Array(n).fill(0);
  const q2: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const denom1 = paramK1 * X[i] + 1;
    q1[i] = denom1 !== 0 ? (X[i] + paramK1) / denom1 : 0;
    const denom2 = paramK2 * X[i] + 1;
    q2[i] = denom2 !== 0 ? (X[i] + paramK2) / denom2 : 0;
  }

  return { q1, q2 };
}

export function calculate(
  bars: Bar[],
  inputs: Partial<BoomHunterProInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const { lpPeriod, k1, trigLen, lpPeriod2, k12, k22, lpPeriod3, k13, square, showLongs, showShorts, showEntry } = { ...defaultInputs, ...inputs };
  const n = bars.length;

  const closeArr = bars.map(b => b.close);
  const K2 = 0.3;
  const esize = 60;
  const ey = 50;

  // EOT3: K13/K33 with square option
  let finalK13 = k13;
  let k33 = -k13;
  if (square) {
    finalK13 = 0.9999;
    k33 = -0.9999;
  }

  // EOT 1: main oscillator (hp divisor = 2)
  const eot1 = ehlers_eot(closeArr, n, lpPeriod, k1, K2, 2);

  // EOT 2: red wave (hp divisor = 2)
  const eot2 = ehlers_eot(closeArr, n, lpPeriod2, k12, k22, 2);

  // EOT 3: yellow line (hp divisor = 3 per Pine source line 170: (1-alpha/3)*(1-alpha/2))
  const eot3 = ehlers_eot(closeArr, n, lpPeriod3, finalK13, k33, 3);

  // Scale to chart: q * esize + ey
  const q1Arr = eot1.q1.map(v => v * esize + ey);
  const q3Arr = eot2.q1.map(v => v * esize + ey);
  const q4Arr = eot2.q2.map(v => v * esize + ey);
  const q5Arr = eot3.q1.map(v => v * esize + ey);
  const q6Arr = eot3.q2.map(v => v * esize + ey);

  // Trigger = SMA(q1, trigLen)
  const q1Series = Series.fromArray(bars, q1Arr);
  const triggerArr = ta.sma(q1Series, trigLen).toArray();

  // Track crossover state for coloring
  const crossState: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const t = triggerArr[i] ?? 0;
    const prevQ1 = q1Arr[i - 1];
    const curQ1 = q1Arr[i];
    const prevT = triggerArr[i - 1] ?? 0;
    if (prevQ1 <= prevT && curQ1 > t) crossState[i] = 1;
    else if (prevQ1 >= prevT && curQ1 < t) crossState[i] = 0;
    else crossState[i] = crossState[i - 1];
  }

  // Drag counter: consecutive bars with Quotient1 <= -1
  const drag: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (eot1.q1[i] <= -1) {
      drag[i] = drag[i - 1] + 1;
    } else if (eot1.q1[i - 1] <= -0.9 && eot1.q1[i] > -0.9) {
      drag[i] = 0;
    } else {
      drag[i] = drag[i - 1];
    }
  }

  const dragNo = 3;
  const warmup = 5;

  // Plot 0: q1 colored by state
  const plot0 = q1Arr.map((v, i) => {
    if (i < warmup || isNaN(v)) return { time: bars[i].time, value: NaN };
    let color: string;
    if (crossState[i] === 1) color = '#00FFAA';
    else if (drag[i] >= dragNo) color = '#800080';
    else if (eot1.q1[i] <= -0.8) color = '#FFFF00';
    else if (eot2.q1[i] <= -0.9) color = '#FFFFFF';
    else if (crossState[i] === 0) color = '#FF0000';
    else color = '#808080';
    return { time: bars[i].time, value: v, color };
  });

  // Plot 1: trigger line
  const plot1 = triggerArr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || v == null || isNaN(v)) ? NaN : v,
  }));

  // Plot 2: q3 (red wave EOT2)
  const plot2 = q3Arr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || isNaN(v)) ? NaN : v,
  }));

  // Plot 3: q5 (yellow EOT3)
  const plot3 = q5Arr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || isNaN(v)) ? NaN : v,
  }));

  // Plot 4: q6 (blue boom line EOT3)
  const plot4 = q6Arr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || isNaN(v)) ? NaN : v,
  }));

  // Plot 5: q4 (EOT2, Quotient 2 of the red wave), filled with q3
  const plot5 = q4Arr.map((v, i) => ({
    time: bars[i].time,
    value: (i < warmup || isNaN(v)) ? NaN : v,
  }));

  // Conditions of the original (ta.crossover / ta.crossunder / ta.cross, ta.barssince: na before the first true bar)
  const Q1 = eot1.q1;
  const Q2 = eot1.q2;
  const Q3 = eot2.q1;
  const Q4 = eot2.q2;
  const Q5 = eot3.q1;
  const Q6 = eot3.q2;
  const q1 = q1Arr;
  const trigger = triggerArr.map((v) => v ?? NaN);
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const or = (a: boolean[], b: boolean[]) => a.map((v, i) => v || b[i]);
  const cross = (a: number[], b: number[] | number) => or(crossedOver(a, b), crossedUnder(a, b));
  const barssince = (f: boolean[]) => {
    let last = -1;
    return f.map((v, i) => {
      if (v) last = i;
      return last < 0 ? NaN : i - last;
    });
  };
  const fixnan = (a: number[]) => {
    let last = NaN;
    return a.map((v) => (isNaN(v) ? last : (last = v)));
  };
  const prev1 = (a: number[]) => a.map((_v, i) => (i > 0 ? a[i - 1] : NaN));

  // LSMA wave trend: wt1 = tradition(hlc3) = avg(tci, mf, rsi(src, n3)), wt2 = sma(wt1, 6) (n1 = 9, n2 = 6, n3 = 3)
  const n1 = 9;
  const n2 = 6;
  const n3 = 3;
  const src = bars.map((b) => (b.high + b.low + b.close) / 3);
  const volume = bars.map((b) => b.volume ?? NaN);
  const emaSrc = A(ta.ema(S(src), n1));
  const absDev = A(ta.ema(S(src.map((v, i) => Math.abs(v - emaSrc[i]))), n1));
  const tci = A(ta.ema(S(src.map((v, i) => (v - emaSrc[i]) / (0.025 * absDev[i]))), n2)).map((v) => v + 50);
  const change = src.map((v, i) => (i > 0 ? v - src[i - 1] : NaN));
  const upSum = math.sum(src.map((v, i) => volume[i] * (change[i] <= 0 ? 0 : v)), n3) as number[];
  const dnSum = math.sum(src.map((v, i) => volume[i] * (change[i] >= 0 ? 0 : v)), n3) as number[];
  const mf = upSum.map((u, i) => 100.0 - 100.0 / (1.0 + u / dnSum[i]));
  const rsi3 = A(ta.rsi(S(src), n3));
  const wt1 = tci.map((v, i) => (v + mf[i] + rsi3[i]) / 3);
  const wt2 = A(ta.sma(S(wt1), 6));

  // Support / resistance pivots of q1: fixnan(ta.pivothigh(q1, 1, 1)[1]), fixnan(ta.pivotlow(q1, 5, 5)[1])
  const highUsePivot = fixnan(prev1(A(ta.pivothigh(S(q1), 1, 1))));
  const lowUsePivot = fixnan(prev1(A(ta.pivotlow(S(q1), 5, 5))));

  const crossover = crossedOver(q1, trigger);
  const crossunder = crossedUnder(q1, trigger);
  const entry = crossedUnder(Q2, -0.9);
  const breakRes = crossedOver(q1, highUsePivot);
  const breakSup = crossedUnder(q1, lowUsePivot);
  // var dbreak / ubreak: support breaks since the last entry, resistance breaks after them
  const continuation: boolean[] = new Array(n).fill(false);
  let dbreak = 0;
  let ubreak = 0;
  for (let i = 0; i < n; i++) {
    if (breakSup[i]) dbreak += 1;
    if (entry[i]) {
      dbreak = 0;
      ubreak = 0;
    }
    if (breakRes[i] && dbreak >= 1) ubreak += 1;
    continuation[i] = breakRes[i] && dbreak >= 1 && ubreak <= 1;
  }

  const over = cross(Q5, Q6).map((v, i) => v && Q5[i] > 0.5);
  const over3 = cross(Q3, Q4).map((v, i) => v && Q3[i] > 0);
  const sinceWarn2 = barssince(crossedOver(Q1, -0.9));
  const sinceWarn3 = barssince(crossedUnder(Q1, 0.9));
  const sinceUp20 = barssince(crossedOver(q1, 20));
  const sinceUp80 = barssince(crossedOver(q1, 80));
  const sinceDn0 = barssince(crossunder.map((v, i) => q1[i] <= 0 && v));
  const sinceDn20 = barssince(crossunder.map((v, i) => q1[i] <= 20 && v));
  const enter3 = crossover.map((v, i) => Q3[i] <= -0.9 && v && sinceWarn2[i] <= 7 && q1[i] <= 20 && sinceUp20[i] <= 21);
  const enter5 = crossover.map((v, i) => sinceDn0[i] <= 5 && v);
  const enter6 = crossover.map((v, i) => sinceDn20[i] <= 11 && v);
  const enter7 = crossover.map((v, i) => Q3[i] <= -0.9 && v);
  const senter3 = crossunder.map((v, i) => Q3[i] >= -0.9 && v && sinceWarn3[i] <= 7 && q1[i] >= 99 && sinceUp80[i] <= 21);
  const sinceWtUp80 = barssince(crossedOver(wt2, 80));
  const sinceWtDn20 = barssince(crossedUnder(wt2, 20));
  const wtDn80 = crossedUnder(wt2, 80);
  const wtUp20 = crossedOver(wt2, 20);
  const bounceDown = wtDn80.map((v, i) => sinceWtUp80[i] <= 1 && v);
  const bounceUp = wtUp20.map((v, i) => sinceWtDn20[i] <= 1 && v);

  // plotshape outputs of the original, in declaration order (id shape<k>)
  const markers: MarkerData[] = [];
  // version 5 colour constants: color.red #FF5252, color.yellow #FFEB3B
  const RED = '#FF5252';
  const YELLOW = '#FFEB3B';
  const longText = String(color.new(color.white, 20));
  const label = (time: number, c: string, text: string, id: string): MarkerData => (
    { time, position: 'top', shape: 'labelDown', color: String(color.new(c, 20)), text, textColor: longText, size: 'tiny', id });
  for (let i = 0; i < n; i++) {
    const time = bars[i].time;
    // plotshape(showentry ? over : na, 'Exit Warning', location.bottom, shape.circle, size.tiny, orange)
    if (showEntry && over[i]) markers.push({ time, position: 'bottom', shape: 'circle', color: color.orange, size: 'tiny', id: 'shape0' });
    // plotshape(showentry ? over3 : na, 'Exit Warning', location.bottom, shape.circle, size.tiny, red, 'Overbought')
    if (showEntry && over3[i]) {
      markers.push({ time, position: 'bottom', shape: 'circle', color: RED, text: 'Overbought', size: 'tiny', id: 'shape1' });
    }
    // 'Long gray' (enter6 and q1 <= 60), 'Long yellow' (enter7), 'Long blue' (enter5), 'Long Lime' (enter3)
    if (showLongs && enter6[i] && q1[i] <= 60) markers.push(label(time, color.silver, 'Long', 'shape2'));
    if (showLongs && enter7[i]) markers.push(label(time, YELLOW, 'Long', 'shape3'));
    if (showLongs && enter5[i]) markers.push(label(time, color.blue, 'Long', 'shape4'));
    if (showLongs && enter3[i]) markers.push(label(time, color.lime, 'Long', 'shape5'));
    // plotshape(showshorts ? senter3 : na, 'Break', text = 'Short', labeldown, location.top, red)
    if (showShorts && senter3[i]) markers.push(label(time, RED, 'Short', 'shape6'));
    // plotshape(crossover(q1, highUsePivot) and dbreak >= 1 and ubreak <= 1, 'Break', triangleup, location.bottom)
    if (continuation[i]) {
      markers.push({ time, position: 'bottom', shape: 'triangleUp', color: '#00ffaa', text: 'Continuation', size: 'tiny', id: 'shape7' });
    }
    // plotshape(bounce down ? wt2 + 9 : na, location.absolute, triangledown, yellow), bounce up at wt2 - 9
    if (bounceDown[i]) {
      markers.push({ time, position: 'atPriceMiddle', price: wt2[i] + 9, shape: 'triangleDown', color: YELLOW, size: 'tiny', id: 'shape8' });
    }
    if (bounceUp[i]) {
      markers.push({ time, position: 'atPriceMiddle', price: wt2[i] - 9, shape: 'triangleUp', color: YELLOW, size: 'tiny', id: 'shape9' });
    }
  }

  const alertFlags = [
    crossover,
    crossunder,
    enter6.map((v, i) => v || enter7[i] || enter5[i] || enter3[i]),
    crossedUnder(Q5, -0.9),
    breakRes,
    breakSup,
    crossover.map((v, i) => Q1[i] <= -0.9 && v),
    crossunder.map((v, i) => Q1[i] >= 0.9 && v),
    crossover.map((v, i) => wt2[i] <= 20 && v),
    crossunder.map((v, i) => wt2[i] >= 80 && v),
    continuation,
    over,
    over3,
    bounceDown,
    bounceUp,
    senter3,
  ];

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { 'plot0': plot0, 'plot1': plot1, 'plot2': plot2, 'plot3': plot3, 'plot4': plot4, 'plot5': plot5 },
    hlines: [],
    // fill(Plot33, Plot44, color = color.new(color.red, 90))
    fills: [{ plot1: 'plot2', plot2: 'plot5', options: { color: String(color.new('#FF5252', 90)), title: 'Plots Background' } }],
    markers,
    alerts: alertStates(alertConditions, bars, alertFlags),
  };
}

export const BoomHunterPro = { calculate, metadata, defaultInputs, inputConfig, plotConfig, alertConditions };
