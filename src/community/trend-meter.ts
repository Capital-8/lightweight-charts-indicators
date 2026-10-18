/**
 * Trend Meter
 *
 * Three "trend meters" (rows of dots, green or red) chosen among: MACD 12/26/9 histogram > 0, fast MACD 8/21/5
 * histogram > 0, Mom / Dad cross (EMA 5 - EMA 20 above its EMA 30), RSI 13 above its 21-bar linear regression line,
 * RSI 13 > 50, RSI 5 > 50 and trend candles (a Heikin-Ashi like trend that keeps the colour of an earlier candle
 * while the current one is inside it). A background band is green when the three meters are green and red when
 * they are red; a large dot marks the bar where they become all green / all red, and a cross the bars where a Wave
 * Trend cross agrees with them. Two trend bars below show a moving average cross (or the direction of one average).
 * Small dots at the top mark positive / negative pressure: RSI 14 oversold / overbought with the Wave Trend beyond
 * -60 / 60 and its delta pointing up / down.
 *
 * Alerts (alertcondition, `alerts` of the result): the original's 38 conditions (pressure, the three meters turning
 * green / red / no longer aligned / rapid change, Wave Trend cross with the meters, trend bar MA crosses and their
 * combinations with the meters), true on the bars where the original's expression is true.
 *
 * Reference: "Trend Meter" by Lij_MC
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import {
  ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar,
} from 'oakscriptjs';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type TrendMeterSource =
  | 'MACD Crossover - 12, 26, 9'
  | 'MACD Crossover - Fast - 8, 21, 5'
  | 'Mom Dad Cross (Top Dog Trading)'
  | 'RSI Signal Line Cross - RSI 13, Sig 21'
  | 'RSI 13: > or < 50'
  | 'RSI 5: > or < 50'
  | 'Trend Candles'
  | 'N/A';

export interface TrendMeterInputs {
  posNegPressure: boolean;
  tmSetups: boolean;
  tmSetupsAndWt: boolean;
  trendBar1: TrendMeterSource;
  trendBar2: TrendMeterSource;
  trendBar3: TrendMeterSource;
  showTrendBar1: boolean;
  showTrendBar2: boolean;
  trendBar4: 'MA Crossover' | 'MA Direction - Fast MA - TB1' | 'MA Direction - Slow MA - TB1';
  trendBar5: 'MA Crossover' | 'MA Direction - Fast MA - TB2' | 'MA Direction - Slow MA - TB2';
  ma1Length: number;
  ma1Type: 'EMA' | 'SMA';
  ma2Length: number;
  ma2Type: 'EMA' | 'SMA';
  ma3Length: number;
  ma3Type: 'EMA' | 'SMA';
  ma4Length: number;
  ma4Type: 'EMA' | 'SMA';
}

export const defaultInputs: TrendMeterInputs = {
  posNegPressure: true,
  tmSetups: true,
  tmSetupsAndWt: true,
  trendBar1: 'MACD Crossover - Fast - 8, 21, 5',
  trendBar2: 'RSI 13: > or < 50',
  trendBar3: 'RSI 5: > or < 50',
  showTrendBar1: true,
  showTrendBar2: true,
  trendBar4: 'MA Crossover',
  trendBar5: 'MA Crossover',
  ma1Length: 5,
  ma1Type: 'EMA',
  ma2Length: 11,
  ma2Type: 'EMA',
  ma3Length: 13,
  ma3Type: 'EMA',
  ma4Length: 36,
  ma4Type: 'SMA',
};

const METER_OPTIONS: TrendMeterSource[] = [
  'MACD Crossover - 12, 26, 9', 'MACD Crossover - Fast - 8, 21, 5', 'Mom Dad Cross (Top Dog Trading)',
  'RSI Signal Line Cross - RSI 13, Sig 21', 'RSI 13: > or < 50', 'RSI 5: > or < 50', 'Trend Candles', 'N/A',
];

export const inputConfig: InputConfig[] = [
  { id: 'posNegPressure', type: 'bool', title: 'Pos / Neg Pressure', defval: true, group: 'Signals',
    tooltip: 'Positive Pressure   = RSI14 and Wave Trend Over Sold with WT Delta Pointing Up                                                               Negative Pressure = RSI14 and Wave Trend Over Bought with WT Delta Pointing Down' },
  { id: 'tmSetups', type: 'bool', title: 'Trend Meter Signal', defval: true, group: 'Signals', tooltip: 'All 3 Trend Meters Now Align' },
  { id: 'tmSetupsAndWt', type: 'bool', title: 'Wave Trend Cross Aligns with Trend Meter Signal', defval: true, group: 'Signals' },
  { id: 'trendBar1', type: 'string', title: 'Trend Meter 1', defval: 'MACD Crossover - Fast - 8, 21, 5', options: METER_OPTIONS, group: 'Trend Meters' },
  { id: 'trendBar2', type: 'string', title: 'Trend Meter 2', defval: 'RSI 13: > or < 50', options: METER_OPTIONS, group: 'Trend Meters' },
  { id: 'trendBar3', type: 'string', title: 'Trend Meter 3', defval: 'RSI 5: > or < 50', options: METER_OPTIONS, group: 'Trend Meters' },
  { id: 'showTrendBar1', type: 'bool', title: 'Trend Bar 1', defval: true, group: 'Trend Bar 1', inline: 'Trend Bar 1' },
  { id: 'showTrendBar2', type: 'bool', title: 'Trend Bar 2', defval: true, group: 'Trend Bar 2', inline: 'Trend Bar 2' },
  { id: 'trendBar4', type: 'string', title: '', defval: 'MA Crossover',
    options: ['MA Crossover', 'MA Direction - Fast MA - TB1', 'MA Direction - Slow MA - TB1'], group: 'Trend Bar 1', inline: 'Trend Bar 1' },
  { id: 'trendBar5', type: 'string', title: '', defval: 'MA Crossover',
    options: ['MA Crossover', 'MA Direction - Fast MA - TB2', 'MA Direction - Slow MA - TB2'], group: 'Trend Bar 2', inline: 'Trend Bar 2' },
  { id: 'ma1Length', type: 'int', title: 'Fast MA', defval: 5, min: 1, group: 'Trend Bar 1', inline: 'TB1 Fast' },
  { id: 'ma1Type', type: 'string', title: '', defval: 'EMA', options: ['EMA', 'SMA'], group: 'Trend Bar 1', inline: 'TB1 Fast' },
  { id: 'ma2Length', type: 'int', title: 'Slow MA', defval: 11, min: 1, group: 'Trend Bar 1', inline: 'TB1 Slow' },
  { id: 'ma2Type', type: 'string', title: '', defval: 'EMA', options: ['EMA', 'SMA'], group: 'Trend Bar 1', inline: 'TB1 Slow' },
  { id: 'ma3Length', type: 'int', title: 'Fast MA', defval: 13, min: 1, group: 'Trend Bar 2', inline: 'TB2 Fast' },
  { id: 'ma3Type', type: 'string', title: '', defval: 'EMA', options: ['EMA', 'SMA'], group: 'Trend Bar 2', inline: 'TB2 Fast' },
  { id: 'ma4Length', type: 'int', title: 'Slow MA', defval: 36, min: 1, group: 'Trend Bar 2', inline: 'TB2 Slow' },
  { id: 'ma4Type', type: 'string', title: '', defval: 'SMA', options: ['EMA', 'SMA'], group: 'Trend Bar 2', inline: 'TB2 Slow' },
];

const TEAL = '#288a75';
const GREEN = '#4CAF50';
const RED = '#FF5252';

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Wave Trend - Positive Pressure', color: String(color.new(TEAL, 25)), lineWidth: 1, style: 'circles' },
  { id: 'plot1', title: 'Wave Trend - Negative Pressure', color: String(color.new('#DC143C', 32)), lineWidth: 1, style: 'circles' },
  { id: 'plot2', title: 'All 3 Trend Meters Now Align', color: String(color.new(TEAL, 20)), lineWidth: 3, style: 'circles' },
  { id: 'plot3', title: 'Wave Trend X & All 3 Trend Meters Now Align', color: String(color.new(TEAL, 20)), lineWidth: 4, style: 'cross' },
  { id: 'plot4', title: 'Trend Meter 1', color: String(color.new(TEAL, 18)), lineWidth: 2, style: 'circles' },
  { id: 'plot5', title: 'Trend Meter 2', color: String(color.new(TEAL, 18)), lineWidth: 2, style: 'circles' },
  { id: 'plot6', title: 'Trend Meter 3', color: String(color.new(TEAL, 18)), lineWidth: 2, style: 'circles' },
  { id: 'plot7', title: 'Trend Bar 1 - Thin Line', color: String(color.new(GREEN, 15)), lineWidth: 4 },
  { id: 'plot8', title: 'Trend Bar 1 - Thick Line', color: String(color.new(GREEN, 15)), lineWidth: 9 },
  { id: 'plot9', title: 'Trend Bar 2 - Thin Line', color: String(color.new(GREEN, 15)), lineWidth: 6 },
  { id: 'plot10', title: 'Trend Bar 2 - Thick Line', color: String(color.new(GREEN, 15)), lineWidth: 9 },
];

/** hline(113.7) and hline(131.3), colour color.new(color.white, 100), the band of the background highlight */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_tma', price: 113.7, color: String(color.new('#FFFFFF', 100)), linestyle: 'dashed' },
  { id: 'hline_tmb', price: 131.3, color: String(color.new('#FFFFFF', 100)), linestyle: 'dashed' },
];

/** fill(TMa, TMb, color = green / red when the three meters agree, transp = 91) */
export const fillConfig: FillConfig[] = [
  { id: 'fill_tm', plot1: 'hline_tma', plot2: 'hline_tmb', color: String(color.new(GREEN, 91)),
    title: 'Trend Meter Background Highlight - 3 Trend Meter Conditions Met' },
];

export const metadata = {
  title: 'Trend Meter',
  shortTitle: 'Trend Meter',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** An int used as a condition (v4): na and 0 are false */
const on = (x: number) => !isNaN(x) && x !== 0;

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[], inputs: Partial<TrendMeterInputs> = {},
): IndicatorResult & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = bars.map((b) => b.close);
  const closeS = S(close);
  const prev = (a: number[], i: number, k = 1) => (i - k >= 0 ? a[i - k] : NaN);

  // Wave Trend
  const ap = bars.map((b) => (b.high + b.low + b.close) / 3);
  const esa = A(ta.ema(S(ap), 9));
  const de = A(ta.ema(S(ap.map((x, i) => Math.abs(x - esa[i]))), 9));
  const ci = ap.map((x, i) => (x - esa[i]) / (0.015 * de[i]));
  const wt1 = A(ta.ema(S(ci), 12));
  const wt2 = A(ta.sma(S(wt1), 3));
  const yellowWave = wt1.map((x, i) => x - wt2[i]);
  const wtCross = A(ta.cross(S(wt1), S(wt2)));

  // Moving averages of the trend bars
  const ma = (type: 'EMA' | 'SMA', len: number) => A(type === 'SMA' ? ta.sma(closeS, len) : ta.ema(closeS, len));
  const ma1 = ma(cfg.ma1Type, cfg.ma1Length);
  const ma2 = ma(cfg.ma2Type, cfg.ma2Length);
  const ma3 = ma(cfg.ma3Type, cfg.ma3Length);
  const ma4 = ma(cfg.ma4Type, cfg.ma4Length);

  // MACD 12 / 26 / 9 and fast MACD 8 / 21 / 5
  const macdHist = (fast: number, slow: number, sig: number) => {
    const ef = A(ta.ema(closeS, fast));
    const es = A(ta.ema(closeS, slow));
    const line = ef.map((x, i) => x - es[i]);
    const signal = A(ta.ema(S(line), sig));
    return line.map((x, i) => x - signal[i]);
  };
  const macdHistogram = macdHist(12, 26, 9);
  const fastMacdHistogram = macdHist(8, 21, 5);

  // Top Dog Trading Mom / Dad
  const ema5 = A(ta.ema(closeS, 5));
  const ema20 = A(ta.ema(closeS, 20));
  const topDogMom = ema5.map((x, i) => x - ema20[i]);
  const topDogDad = A(ta.ema(S(topDogMom), 30));

  // Trend candles: haopen := na(haopen[1]) ? (open + close) / 2 : (haopen[1] + haclose[1]) / 2, haclose = ohlc4
  const haclose = bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
  const haopen = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const p = prev(haopen, i);
    haopen[i] = isNaN(p) ? (bars[i].open + bars[i].close) / 2 : (p + haclose[i - 1]) / 2;
  }
  const ccolor = haclose.map((x, i) => (gt(x - haopen[i], 0) ? 1 : 0));
  const inside = (i: number, k: number) => {
    const o = prev(haopen, i, k);
    const c = prev(haclose, i, k);
    const hi = Math.max(o, c);
    const lo = Math.min(o, c);
    return le(haopen[i], hi) && ge(haopen[i], lo) && le(haclose[i], hi) && ge(haclose[i], lo);
  };
  const trendCandle = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let v = ccolor[i];
    for (const k of [6, 5, 4, 3, 2, 1]) {
      if (inside(i, k)) {
        v = prev(ccolor, i, k);
        break;
      }
    }
    trendCandle[i] = on(v) ? 1 : 0;
  }

  // RSI 5, RSI 13 and the linear regression signal line of RSI 13 (x = bar_index)
  const rsi5 = A(ta.rsi(closeS, 5));
  const rsi13 = A(ta.rsi(closeS, 13));
  const xs = bars.map((_b, i) => i);
  const xS = S(xs);
  const rsi13S = S(rsi13);
  const x_ = A(ta.sma(xS, 21));
  const y_ = A(ta.sma(rsi13S, 21));
  const mx = A(ta.stdev(xS, 21));
  const my = A(ta.stdev(rsi13S, 21));
  const corr = A(ta.correlation(xS, rsi13S, 21));
  const linReg1 = xs.map((x, i) => {
    const slope = corr[i] * (my[i] / mx[i]);
    const inter = y_[i] - slope * x_[i];
    return x * slope + inter;
  });

  const rsi14 = A(ta.rsi(closeS, 14));

  const meterResult = (src: TrendMeterSource, i: number): number => {
    switch (src) {
      case 'MACD Crossover - 12, 26, 9': return gt(macdHistogram[i], 0) ? 1 : 0;
      case 'MACD Crossover - Fast - 8, 21, 5': return gt(fastMacdHistogram[i], 0) ? 1 : 0;
      case 'Mom Dad Cross (Top Dog Trading)': return gt(topDogMom[i], topDogDad[i]) ? 1 : 0;
      case 'RSI Signal Line Cross - RSI 13, Sig 21': return gt(rsi13[i], linReg1[i]) ? 1 : 0;
      case 'RSI 5: > or < 50': return gt(rsi5[i], 50) ? 1 : 0;
      case 'RSI 13: > or < 50': return gt(rsi13[i], 50) ? 1 : 0;
      case 'Trend Candles': return trendCandle[i];
      default: return NaN;
    }
  };
  const meterColor = (src: TrendMeterSource, i: number): string | null => {
    if (src === 'N/A') return null;
    return on(meterResult(src, i)) ? TEAL : RED;
  };

  const pos3 = new Array<boolean>(n);
  const neg3 = new Array<boolean>(n);
  for (let i = 0; i < n; i++) {
    const r1 = on(meterResult(cfg.trendBar1, i));
    const r2 = on(meterResult(cfg.trendBar2, i));
    const r3 = on(meterResult(cfg.trendBar3, i));
    pos3[i] = r1 && r2 && r3;
    neg3[i] = !r1 && !r2 && !r3;
  }

  const t = (i: number) => bars[i].time;
  const P = (f: (i: number) => Point): Point[] => bars.map((_b, i) => f(i));
  const tb4On = (i: number) => {
    switch (cfg.trendBar4) {
      case 'MA Direction - Fast MA - TB1': return gt(ma1[i], prev(ma1, i));
      case 'MA Direction - Slow MA - TB1': return gt(ma2[i], prev(ma2, i));
      default: return gt(ma1[i], ma2[i]);
    }
  };
  const tb5On = (i: number) => {
    switch (cfg.trendBar5) {
      case 'MA Direction - Fast MA - TB2': return gt(ma3[i], prev(ma3, i));
      case 'MA Direction - Slow MA - TB2': return gt(ma4[i], prev(ma4, i));
      default: return gt(ma3[i], ma4[i]);
    }
  };
  const tbGreen = String(color.new(GREEN, 15));
  const tbRed = String(color.new(RED, 20));
  const posPressure = String(color.new(TEAL, 25));
  const negPressure = String(color.new('#DC143C', 32));
  // BackgroundColorChangePositive = TrendBars3Positive and not TrendBars3Positive[1] (na [1] on bar 0 is false)
  const chPos = bars.map((_b, i) => pos3[i] && !(i > 0 && pos3[i - 1]));
  const chNeg = bars.map((_b, i) => neg3[i] && !(i > 0 && neg3[i - 1]));
  // plot transp = 20 / 18 on an opaque colour
  const signalColor = (i: number): string =>
    (chPos[i] ? String(color.new(TEAL, 20)) : chNeg[i] ? String(color.new(RED, 20)) : 'transparent');
  // OSIndicatorsYellowPointingUp = (RSI14OS or RSI14OS[1]) and WTVOS and YellowWavePointingUp
  const osUp = bars.map((_b, i) =>
    (lt(rsi14[i], 30) || lt(prev(rsi14, i), 30)) && lt(wt1[i], -60) && gt(yellowWave[i], prev(yellowWave, i)));
  // OBIndicatorsYellowPointingDown = (RSI14OB or RSI14OB[1]) and WTVOB and not YellowWavePointingUp
  const obDown = bars.map((_b, i) =>
    (gt(rsi14[i], 70) || gt(prev(rsi14, i), 70)) && gt(wt1[i], 60) && !gt(yellowWave[i], prev(yellowWave, i)));
  // PositiveWaveTrendCross = WTCross and WTCrossUp (wt2 - wt1 <= 0), NegativeWaveTrendCross = WTCross and WTCrossDown
  const wtPos = bars.map((_b, i) => on(wtCross[i]) && le(wt2[i] - wt1[i], 0));
  const wtNeg = bars.map((_b, i) => on(wtCross[i]) && ge(wt2[i] - wt1[i], 0));
  const meter = (src: TrendMeterSource, value: number) => P((i) => {
    const c = meterColor(src, i);
    return { time: t(i), value, color: c === null ? 'transparent' : String(color.new(c, 18)) };
  });

  const plots: Record<string, Point[]> = {
    plot0: P((i) => ({ time: t(i), value: cfg.posNegPressure && osUp[i] ? 138.5 : NaN, color: posPressure })),
    plot1: P((i) => ({ time: t(i), value: cfg.posNegPressure && obDown[i] ? 138.5 : NaN, color: negPressure })),
    plot2: P((i) => ({ time: t(i), value: cfg.tmSetups ? 134.5 : NaN, color: signalColor(i) })),
    plot3: P((i) => {
      const up = wtPos[i] && pos3[i];
      const down = wtNeg[i] && neg3[i];
      return { time: t(i), value: cfg.tmSetupsAndWt && (up || down) ? 134.5 : NaN, color: signalColor(i) };
    }),
    plot4: meter(cfg.trendBar1, 128.5),
    plot5: meter(cfg.trendBar2, 122.5),
    plot6: meter(cfg.trendBar3, 116.5),
    plot7: P((i) => ({ time: t(i), value: cfg.showTrendBar1 && cfg.showTrendBar2 ? 110 : NaN, color: tb4On(i) ? tbGreen : tbRed })),
    plot8: P((i) => ({ time: t(i), value: cfg.showTrendBar1 && !cfg.showTrendBar2 ? 110 : NaN, color: tb4On(i) ? tbGreen : tbRed })),
    plot9: P((i) => ({ time: t(i), value: cfg.showTrendBar2 && cfg.showTrendBar1 ? 104.5 : NaN, color: tb5On(i) ? tbGreen : tbRed })),
    plot10: P((i) => ({ time: t(i), value: cfg.showTrendBar2 && !cfg.showTrendBar1 ? 110 : NaN, color: tb5On(i) ? tbGreen : tbRed })),
  };

  // fill(TMa, TMb, color = TrendBars3Positive ? color.green : TrendBars3Negative ? color.red : na, transp = 91)
  const fillGreen = String(color.new(GREEN, 91));
  const fillRed = String(color.new(RED, 91));
  const fillColors = bars.map((_b, i) => (pos3[i] ? fillGreen : neg3[i] ? fillRed : 'transparent'));
  const hlineColor = String(color.new('#FFFFFF', 100));

  // Alert conditions, as the original computes them (na history is false)
  const at = (a: boolean[], i: number, k: number) => i - k >= 0 && a[i - k];
  const crossUp = (a: number[], b: number[], i: number) => gt(a[i], b[i]) && le(prev(a, i), prev(b, i));
  const crossDown = (a: number[], b: number[], i: number) => lt(a[i], b[i]) && ge(prev(a, i), prev(b, i));
  const flags: boolean[][] = alertConditions.map(() => new Array<boolean>(n).fill(false));
  for (let i = 0; i < n; i++) {
    const p = pos3[i], q = neg3[i];
    const bgPos = chPos[i], bgNeg = chNeg[i];
    const wtP = wtPos[i] && p, wtN = wtNeg[i] && q;
    // TrendMetersNoLongerAlign = ((not P or not N) and P[1]) or ((not P or not N) and N[1])
    const notBoth = !p || !q;
    const noLonger = (notBoth && at(pos3, i, 1)) || (notBoth && at(neg3, i, 1));
    // RapidColorChangePositive / Negative = P and (N[1] or N[2]) / N and (P[1] or P[2])
    const rapidPos = p && (at(neg3, i, 1) || at(neg3, i, 2));
    const rapidNeg = q && (at(pos3, i, 1) || at(pos3, i, 2));
    // TB1MACrossUp = crossover(MA1, MA2), TB2MACrossUp = crossover(MA3, MA4), ...
    const tb1Up = crossUp(ma1, ma2, i), tb1Down = crossDown(ma1, ma2, i);
    const tb2Up = crossUp(ma3, ma4, i), tb2Down = crossDown(ma3, ma4, i);
    const tb1Green = gt(ma1[i], ma2[i]), tb1Red = lt(ma1[i], ma2[i]);
    const tb2Green = gt(ma3[i], ma4[i]), tb2Red = lt(ma3[i], ma4[i]);
    const tb12Green = tb1Green && tb2Green && (tb1Up || tb2Up);
    const tb12Red = tb1Red && tb2Red && (tb1Down || tb2Down);
    const v = [
      obDown[i] || osUp[i],
      bgPos, bgNeg, bgPos || bgNeg,
      wtP, wtN, wtP || wtN,
      noLonger,
      rapidPos, rapidNeg, rapidPos || rapidNeg,
      tb1Up, tb1Down, tb1Up || tb1Down,
      tb2Up, tb2Down, tb2Up || tb2Down,
      tb12Green, tb12Red, tb12Green || tb12Red,
      tb12Green && p, tb12Red && q, (tb12Green && p) || (tb12Red && q),
      tb1Green && p, tb1Red && q, (tb1Green && p) || (tb1Red && q),
      tb2Green && p, tb2Red && q, (tb2Green && p) || (tb2Red && q),
      bgPos && tb1Green, bgNeg && tb1Red, (bgPos && tb1Green) || (bgNeg && tb1Red),
      bgPos && tb2Green, bgNeg && tb2Red, (bgPos && tb2Green) || (bgNeg && tb2Red),
      bgPos && tb1Green && tb2Green, bgNeg && tb1Red && tb2Red,
      (bgPos && tb1Green && tb2Green) || (bgNeg && tb1Red && tb2Red),
    ];
    for (let k = 0; k < v.length; k++) flags[k][i] = v[k];
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: [
      { value: 113.7, options: { color: hlineColor, linestyle: 'dashed' } },
      { value: 131.3, options: { color: hlineColor, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'hline_tma', plot2: 'hline_tmb', colors: fillColors,
        options: { title: 'Trend Meter Background Highlight - 3 Trend Meter Conditions Met' } },
    ],
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions, in its declaration order */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: ' -   Pos / Neg Pressure', message: 'Pos / Neg Pressure - Trend Meter' },
  { id: 'alert1', title: ' --  3 TMs Turn Green', message: 'All 3 Trend Meters Turn  Green - Trend Meter' },
  { id: 'alert2', title: ' --  3 TMs Turn Red', message: 'All 3 Trend Meters Turn  Red - Trend Meter' },
  { id: 'alert3', title: ' -- 3 TMs Change to Same Color', message: 'All 3 Trend Meters Change to Same Color - Trend Meter' },
  { id: 'alert4', title: '--- 3 TMs Turn Green & WaveTrend X', message: 'Green - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter' },
  { id: 'alert5', title: '--- 3 TMs Turn Red & WaveTrend X', message: 'Red - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter' },
  { id: 'alert6', title: '--- 3 TMs Change to Same Color & WT X', message: 'Red / Green - Wave Trend Signal - Aligns with 3 Trend Meters - Trend Meter' },
  { id: 'alert7', title: '---- 3 Trend Meters No Longer Align', message: '3 Trend Meters No Longer Align - Trend Meter' },
  { id: 'alert8', title: 'All 3 TMs Rapid Change Red to Green', message: 'All 3 Trend Meters Rapid Change Red to Green - Trend Meter' },
  { id: 'alert9', title: 'All 3 TMs Rapid Change Green to Red', message: 'All 3 Trend Meters Rapid Change Green to Red - Trend Meter' },
  { id: 'alert10', title: 'All 3 TMs Rapid Change to Same Color', message: 'All 3 Trend Meters Rapid Change to Same Color - Trend Meter' },
  { id: 'alert11', title: 'TB 1 Turns Green', message: 'Trend Bar 1 - Turns Green - Trend Meter' },
  { id: 'alert12', title: 'TB 1 Turns Red', message: 'Trend Bar 1 - Turns Red - Trend Meter' },
  { id: 'alert13', title: 'TB 1 Color Change', message: 'Trend Bar 1 - Color Change - Trend Meter' },
  { id: 'alert14', title: 'TB 2 Turns Green', message: 'Trend Bar 2 - Turns Green - Trend Meter' },
  { id: 'alert15', title: 'TB 2 Turns Red', message: 'Trend Bar 2 - Turns Red - Trend Meter' },
  { id: 'alert16', title: 'TB 2 Color Change', message: 'Trend Bar 2 - Color Change - Trend Meter' },
  { id: 'alert17', title: 'TBs 1+2 Turn Green', message: 'Trend Bars 1+2 - Turn Green - Trend Meter' },
  { id: 'alert18', title: 'TBs 1+2 Turn Red', message: 'Trend Bars 1+2 - Turn Red - Trend Meter' },
  { id: 'alert19', title: 'TBs 1+2 Change to Same Color', message: 'Trend Bars 1+2 - Change to Same Color - MAs Crossing - Trend Meter' },
  { id: 'alert20', title: 'TBs 1+2 Turn Green with 3 TMs', message: 'Trend Bars 1+2 - Turn Green with 3 TMs - Trend Meter' },
  { id: 'alert21', title: 'TBs 1+2 Turn Red with 3 TMs', message: 'Trend Bars 1+2 - Turn Red with 3 TMs- Trend Meter' },
  { id: 'alert22', title: 'TBs 1+2 Change to Same Color with 3 TMs', message: 'Trend Bars 1+2 - Change to Same Color with 3 TMs - Trend Meter' },
  { id: 'alert23', title: 'TB 1 Turns Green with 3 TMs', message: 'Trend Bar 1 - Turn Green with 3 TMs - Trend Meter' },
  { id: 'alert24', title: 'TB 1 Turns Red with 3 TMs', message: 'Trend Bar 1 - Turn Red with 3 TMs- Trend Meter' },
  { id: 'alert25', title: 'TB 1 Change to Same Color with 3 TMs', message: 'Trend Bar 1 - Change to Same Color with 3 TMs - Trend Meter' },
  { id: 'alert26', title: 'TB 2 Turns Green with 3 TMs', message: 'Trend Bar 2 - Turn Green with 3 TMs - Trend Meter' },
  { id: 'alert27', title: 'TB 2 Turns Red with 3 TMs', message: 'Trend Bar 2 - Turn Red with 3 TMs- Trend Meter' },
  { id: 'alert28', title: 'TB 2 Change to Same Color with 3 TMs', message: 'Trend Bar 2 - Change to Same Color with 3 TMs - Trend Meter' },
  { id: 'alert29', title: '3 TMs Turn Green with TB 1', message: 'All 3 Trend Meters Turn  Green with TB 1 - Trend Meter' },
  { id: 'alert30', title: '3 TMs Turn Red with TB 1', message: 'All 3 Trend Meters Turn  Red with TB 1 - Trend Meter' },
  { id: 'alert31', title: '3 TMs Change Color with TB 1', message: 'All 3 Trend Meters Change Color with TB 1 - Trend Meter' },
  { id: 'alert32', title: '3 TMs Turn Green with TB 2', message: 'All 3 Trend Meters Turn  Green with TB 2 - Trend Meter' },
  { id: 'alert33', title: '3 TMs Turn Red with TB 2', message: 'All 3 Trend Meters Turn  Red with TB 2 - Trend Meter' },
  { id: 'alert34', title: '3 TMs Change Color with TB 2', message: 'All 3 Trend Meters Change Color with TB 2 - Trend Meter' },
  { id: 'alert35', title: '3 TMs Turn Green with TBs 1+2', message: 'All 3 Trend Meters Turn  Green with Trend Bar 1+2 - Trend Meter' },
  { id: 'alert36', title: '3 TMs Turn Red with TBs 1+2', message: 'All 3 Trend Meters Turn  Red with Trend Bar 1+2 - Trend Meter' },
  { id: 'alert37', title: '3 TMs Change Color with TBs 1+2', message: 'All 3 Trend Meters Change Color with Trend Bar 1+2 - Trend Meter' },
];

export const TrendMeter = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
