/**
 * The Jewel
 *
 * A momentum panel with a stochastic, a simple DMI / ADX and an EMA trend filter. The stochastic of the close
 * (K length) is smoothed twice by SMAs (K and D), and each line is scaled to 0-100 over its last 50 bars. DI+ / DI-
 * use SMAs of the directional moves and of the true range; the ADX is the SMA of the DX. The EMA is scaled to 0-100
 * over its normalization lookback. The background is green on a buy signal (K crosses above D, RSI above the buy
 * level, ADX above the threshold, close above the EMA), red on a sell signal (the mirror) and yellow on a caution
 * signal (RSI and scaled K both overbought or both oversold).
 * Alerts (alertcondition, `alerts` of the result): 'Buy Signal', 'Sell Signal' and 'Caution Signal', true on the bars
 * of each signal (a caution signal also on the bars that show a buy / sell background).
 *
 * Reference: "The Jewel" by afonso_77
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © Trigooo
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface TheJewelInputs {
  useEMAFilter: boolean;
  emaLength: number;
  /** Number of bars used to find the min / max of the EMA for the 0-100 scaling */
  emaNormLookback: number;
  rsiPeriod: number;
  rsiBuyLevel: number;
  rsiSellLevel: number;
  stochKLength: number;
  stochDLength: number;
  /** SMA smoothing of StochK */
  stochSmoothK: number;
  /** SMA smoothing of StochD */
  stochSmoothD: number;
  useADXFilter: boolean;
  adxPeriod: number;
  adxThreshold: number;
  useCaution: boolean;
  rsiCautionHigh: number;
  rsiCautionLow: number;
  stochCautionHigh: number;
  stochCautionLow: number;
  buyColor: string;
  sellColor: string;
  cautionColor: string;
  plotStochKColor: string;
  plotStochDColor: string;
  plotDIPlusColor: string;
  plotDIMinusColor: string;
  plotADXColor: string;
}

export const defaultInputs: TheJewelInputs = {
  useEMAFilter: true,
  emaLength: 200,
  emaNormLookback: 100,
  rsiPeriod: 14,
  rsiBuyLevel: 55,
  rsiSellLevel: 45,
  stochKLength: 14,
  stochDLength: 3,
  stochSmoothK: 3,
  stochSmoothD: 3,
  useADXFilter: true,
  adxPeriod: 14,
  adxThreshold: 20,
  useCaution: true,
  rsiCautionHigh: 70,
  rsiCautionLow: 30,
  stochCautionHigh: 80,
  stochCautionLow: 20,
  buyColor: String(color.new(color.green, 65)),
  sellColor: String(color.new(color.red, 65)),
  cautionColor: String(color.new(color.yellow, 65)),
  plotStochKColor: color.aqua,
  plotStochDColor: color.blue,
  plotDIPlusColor: color.green,
  plotDIMinusColor: color.red,
  plotADXColor: color.white,
};

export const inputConfig: InputConfig[] = [
  { id: 'useEMAFilter', type: 'bool', title: 'Use EMA Trend Filter?', defval: true },
  { id: 'emaLength', type: 'int', title: 'EMA Trend Length', defval: 200 },
  { id: 'emaNormLookback', type: 'int', title: 'EMA Normalization Lookback', defval: 100 },
  { id: 'rsiPeriod', type: 'int', title: 'RSI Period', defval: 14 },
  { id: 'rsiBuyLevel', type: 'float', title: 'RSI Buy Level', defval: 55 },
  { id: 'rsiSellLevel', type: 'float', title: 'RSI Sell Level', defval: 45 },
  { id: 'stochKLength', type: 'int', title: 'Stoch K Length', defval: 14 },
  { id: 'stochDLength', type: 'int', title: 'Stoch D Length', defval: 3 },
  { id: 'stochSmoothK', type: 'int', title: 'Stoch K Smoothing', defval: 3 },
  { id: 'stochSmoothD', type: 'int', title: 'Stoch D Smoothing', defval: 3 },
  { id: 'useADXFilter', type: 'bool', title: 'Use ADX Filter?', defval: true },
  { id: 'adxPeriod', type: 'int', title: 'ADX Period', defval: 14 },
  { id: 'adxThreshold', type: 'int', title: 'ADX Threshold', defval: 20 },
  { id: 'useCaution', type: 'bool', title: 'Enable Caution Signals?', defval: true },
  { id: 'rsiCautionHigh', type: 'float', title: 'RSI Overbought Level', defval: 70 },
  { id: 'rsiCautionLow', type: 'float', title: 'RSI Oversold Level', defval: 30 },
  { id: 'stochCautionHigh', type: 'float', title: 'Stoch Overbought Level', defval: 80 },
  { id: 'stochCautionLow', type: 'float', title: 'Stoch Oversold Level', defval: 20 },
  { id: 'buyColor', type: 'color', title: 'Buy BG Color', defval: String(color.new(color.green, 65)) },
  { id: 'sellColor', type: 'color', title: 'Sell BG Color', defval: String(color.new(color.red, 65)) },
  { id: 'cautionColor', type: 'color', title: 'Caution BG Color', defval: String(color.new(color.yellow, 65)) },
  { id: 'plotStochKColor', type: 'color', title: 'StochK Plot Color', defval: color.aqua },
  { id: 'plotStochDColor', type: 'color', title: 'StochD Plot Color', defval: color.blue },
  { id: 'plotDIPlusColor', type: 'color', title: 'DI+ Plot Color', defval: color.green },
  { id: 'plotDIMinusColor', type: 'color', title: 'DI- Plot Color', defval: color.red },
  { id: 'plotADXColor', type: 'color', title: 'ADX Plot Color', defval: color.white },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Filter (Normalized 0–100)', color: color.yellow, lineWidth: 2 },
  { id: 'plot1', title: 'StochK', color: color.aqua, lineWidth: 2 },
  { id: 'plot2', title: 'StochD', color: color.blue, lineWidth: 1 },
  { id: 'plot3', title: 'DI+', color: color.green, lineWidth: 1 },
  { id: 'plot4', title: 'DI-', color: color.red, lineWidth: 1 },
  { id: 'plot5', title: 'ADX', color: color.white, lineWidth: 1 },
];

/** hline(0, "Zero Line") / hline(100, "Max Line"), gray, Pine default style (dashed) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: color.gray, linestyle: 'dashed' },
  { id: 'hline_max', price: 100, title: 'Max Line', color: color.gray, linestyle: 'dashed' },
];

export const metadata = {
  title: 'The Jewel',
  shortTitle: 'The Jewel',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<TheJewelInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const close = S(bars.map((b) => b.close));
  const high = S(bars.map((b) => b.high));
  const low = S(bars.map((b) => b.low));

  // EMA trend filter, normalized to 0-100 for the plot
  const emaValS = ta.ema(close, cfg.emaLength);
  const emaVal = A(emaValS);
  const emaMin = A(ta.lowest(emaValS, cfg.emaNormLookback));
  const emaMax = A(ta.highest(emaValS, cfg.emaNormLookback));
  const emaNorm = bars.map((_b, i) => {
    let emaRange = emaMax[i] - emaMin[i];
    if (eq(emaRange, 0.0)) emaRange = NaN; // emaRange := emaRange == 0.0 ? na : emaRange
    return (100 * (emaVal[i] - emaMin[i])) / emaRange;
  });

  const rsiVal = A(ta.rsi(close, cfg.rsiPeriod));

  // Stochastic with smoothing, each line scaled to 0-100 over 50 bars
  const stochKRaw = ta.stoch(close, high, low, cfg.stochKLength);
  const stochDRaw = ta.sma(stochKRaw, cfg.stochDLength);
  const stochKSmoothS = ta.sma(stochKRaw, cfg.stochSmoothK);
  const stochDSmoothS = ta.sma(stochDRaw, cfg.stochSmoothD);
  const stochKSmooth = A(stochKSmoothS);
  const stochDSmooth = A(stochDSmoothS);
  const stochKMin = A(ta.lowest(stochKSmoothS, 50));
  const stochKMax = A(ta.highest(stochKSmoothS, 50));
  const stochDMin = A(ta.lowest(stochDSmoothS, 50));
  const stochDMax = A(ta.highest(stochDSmoothS, 50));
  const stochK = bars.map((_b, i) => (100 * (stochKSmooth[i] - stochKMin[i])) / Math.max(stochKMax[i] - stochKMin[i], 1));
  const stochD = bars.map((_b, i) => (100 * (stochDSmooth[i] - stochDMin[i])) / Math.max(stochDMax[i] - stochDMin[i], 1));

  // ADX / DMI with SMAs
  const plusDM: number[] = new Array(n);
  const minusDM: number[] = new Array(n);
  const trueRange: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const p = i > 0 ? bars[i - 1] : undefined;
    const upMove = p ? b.high - p.high : NaN;
    const downMove = p ? p.low - b.low : NaN;
    plusDM[i] = gt(upMove, downMove) && gt(upMove, 0) ? upMove : 0;
    minusDM[i] = gt(downMove, upMove) && gt(downMove, 0) ? downMove : 0;
    // math.max(math.max(high - low, math.abs(high - close[1])), math.abs(low - close[1])): na on bar 0
    trueRange[i] = p ? Math.max(Math.max(b.high - b.low, Math.abs(b.high - p.close)), Math.abs(b.low - p.close)) : NaN;
  }
  const smthTR = A(ta.sma(S(trueRange), cfg.adxPeriod));
  const smthPlusDM = A(ta.sma(S(plusDM), cfg.adxPeriod));
  const smthMinusDM = A(ta.sma(S(minusDM), cfg.adxPeriod));
  // Plain divisions: x / 0 is +-infinity (0 / 0 NaN), as in Pine; ta.sma skips the infinite values
  const diPlus = bars.map((_b, i) => 100 * (smthPlusDM[i] / smthTR[i]));
  const diMinus = bars.map((_b, i) => 100 * (smthMinusDM[i] / smthTR[i]));
  const dx = bars.map((_b, i) => (100 * Math.abs(diPlus[i] - diMinus[i])) / Math.max(diPlus[i] + diMinus[i], 1));
  const adxVal = A(ta.sma(S(dx), cfg.adxPeriod));

  // Signals
  const stochCrossUp = A(ta.crossover(S(stochK), S(stochD)));
  const stochCrossDown = A(ta.crossunder(S(stochK), S(stochD)));

  const bgColors: BgColorData[] = [];
  const buyFlags: boolean[] = [], sellFlags: boolean[] = [], cautionFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    const buySignalBasic = stochCrossUp[i] === 1 && gt(rsiVal[i], cfg.rsiBuyLevel);
    const sellSignalBasic = stochCrossDown[i] === 1 && lt(rsiVal[i], cfg.rsiSellLevel);
    const adxCondition = !cfg.useADXFilter || gt(adxVal[i], cfg.adxThreshold);
    const trendConditionBuy = !cfg.useEMAFilter || gt(c, emaVal[i]);
    const trendConditionSell = !cfg.useEMAFilter || lt(c, emaVal[i]);
    const finalBuySignal = buySignalBasic && adxCondition && trendConditionBuy;
    const finalSellSignal = sellSignalBasic && adxCondition && trendConditionSell;
    const cautionSignal = cfg.useCaution
      && ((gt(rsiVal[i], cfg.rsiCautionHigh) && gt(stochK[i], cfg.stochCautionHigh))
        || (lt(rsiVal[i], cfg.rsiCautionLow) && lt(stochK[i], cfg.stochCautionLow)));
    const bg = finalBuySignal ? cfg.buyColor : finalSellSignal ? cfg.sellColor : cautionSignal ? cfg.cautionColor : null;
    if (bg !== null) bgColors.push({ time: bars[i].time, color: bg });
    buyFlags.push(finalBuySignal);
    sellFlags.push(finalSellSignal);
    cautionFlags.push(cautionSignal);
  }

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const line = (vals: number[], col: string) => bars.map((b, i) => ({ time: b.time, value: fin(vals[i]), color: col }));

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(cfg.useEMAFilter ? emaNorm : emaNorm.map(() => NaN), color.yellow),
      plot1: line(stochK, cfg.plotStochKColor),
      plot2: line(stochD, cfg.plotStochDColor),
      plot3: line(diPlus, cfg.plotDIPlusColor),
      plot4: line(diMinus, cfg.plotDIMinusColor),
      plot5: line(adxVal, cfg.plotADXColor),
    },
    hlines: [
      { value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed' } },
      { value: 100, options: { title: 'Max Line', color: color.gray, linestyle: 'dashed' } },
    ],
    bgColors,
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, cautionFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Buy Signal', message: 'Buy: Stoch cross up + RSI > level + (Optional ADX/EMA confirm)' },
  { id: 'alert1', title: 'Sell Signal', message: 'Sell: Stoch cross down + RSI < level + (Optional ADX/EMA confirm)' },
  { id: 'alert2', title: 'Caution Signal', message: 'Caution: RSI & Stoch both at extreme levels' },
];

export const TheJewel = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
