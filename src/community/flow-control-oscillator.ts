/**
 * Flow Control Oscillator (FCO)
 *
 * The MFI of the source scaled to -1..+1 ((mfi - 50) / 50) and the Chaikin Money Flow (sum of the close location
 * value times the volume over the sum of the volume) are combined: their sum in Equal mode, else 2 * (cmf * cmfWeight
 * + mfi * mfiWeight). The composite is smoothed (SMA, EMA, WMA, RMA, TEMA, DEMA or VWMA) into the FCO line, with a
 * signal line (EMA, WMA, HMA, TEMA, DEMA or VWMA). The momentum histogram is the change of the FCO over a few bars,
 * optionally divided by the ATR(14) and weighted by the ADX (0.3 + 0.7 * adx / 100), coloured with a gradient. The
 * background is gray where |FCO| > 1 and orange where the ADX is below 20.
 * Alerts (alertcondition, `alerts` of the result): the 14 conditions of the original (reversal setups, strong
 * trends, signal crosses, confirmed zero crosses, zero crosses, extreme zones, strong momentum).
 *
 * Reference: "Flow Control Oscillator (FCO)" by WalrusQuant
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © WalrusQuant
 */

import { taCore, math, color, getSourceSeries, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export type FCOWeightMode = 'Equal' | 'MFI Heavy' | 'CMF Heavy' | 'Custom';
export type FCOSmoothType = 'SMA' | 'EMA' | 'WMA' | 'RMA' | 'TEMA' | 'DEMA' | 'VWMA';
export type FCOSignalType = 'EMA' | 'WMA' | 'HMA' | 'TEMA' | 'DEMA' | 'VWMA';

export interface FlowControlOscillatorInputs {
  mfiLen: number;
  cmfLen: number;
  /** Price source of the MFI */
  src: SourceType;
  weightMode: FCOWeightMode;
  /** MFI weight in Custom mode (0 = 100 % CMF, 1 = 100 % MFI) */
  customMFIWeight: number;
  smoothType: FCOSmoothType;
  /** FCO smoothing length (1 = no smoothing) */
  smoothLen: number;
  signalType: FCOSignalType;
  signalLen: number;
  /** Bars of the momentum change */
  momentumLen: number;
  /** Weight the momentum by the ADX */
  useADX: boolean;
  adxLen: number;
  adxSmooth: number;
  showADX: boolean;
  FCOColor: string;
  signalColor: string;
  bullMomentumColor: string;
  bearMomentumColor: string;
  useMomentumGradient: boolean;
  adxColor: string;
  showFCO: boolean;
  showSignal: boolean;
  showMomentum: boolean;
  showExtremeZones: boolean;
  /** Divide the momentum by the ATR(14) */
  useATRNorm: boolean;
}

export const defaultInputs: FlowControlOscillatorInputs = {
  mfiLen: 14,
  cmfLen: 20,
  src: 'hlc3',
  weightMode: 'Equal',
  customMFIWeight: 0.5,
  smoothType: 'SMA',
  smoothLen: 3,
  signalType: 'WMA',
  signalLen: 6,
  momentumLen: 3,
  useADX: true,
  adxLen: 14,
  adxSmooth: 14,
  showADX: false,
  FCOColor: color.white,
  signalColor: '#5b9cf6',
  bullMomentumColor: color.green,
  bearMomentumColor: color.red,
  useMomentumGradient: true,
  adxColor: color.yellow,
  showFCO: true,
  showSignal: true,
  showMomentum: true,
  showExtremeZones: true,
  useATRNorm: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'mfiLen', type: 'int', title: 'MFI Length', defval: 14, min: 1 },
  { id: 'cmfLen', type: 'int', title: 'CMF Length', defval: 20, min: 1 },
  { id: 'src', type: 'source', title: 'Price Source', defval: 'hlc3' },
  { id: 'weightMode', type: 'string', title: 'Weighting Mode', defval: 'Equal', options: ['Equal', 'MFI Heavy', 'CMF Heavy', 'Custom'] },
  { id: 'customMFIWeight', type: 'float', title: 'Custom MFI Weight', defval: 0.5, min: 0.0, max: 1.0, step: 0.1 },
  { id: 'smoothType', type: 'string', title: 'FCO Smoothing Type', defval: 'SMA', options: ['SMA', 'EMA', 'WMA', 'RMA', 'TEMA', 'DEMA', 'VWMA'] },
  { id: 'smoothLen', type: 'int', title: 'FCO Smoothing Length', defval: 3, min: 1, max: 20 },
  { id: 'signalType', type: 'string', title: 'Signal Type', defval: 'WMA', options: ['EMA', 'WMA', 'HMA', 'TEMA', 'DEMA', 'VWMA'] },
  { id: 'signalLen', type: 'int', title: 'Signal Line Length', defval: 6, min: 1 },
  { id: 'momentumLen', type: 'int', title: 'Momentum Length', defval: 3, min: 1, max: 10 },
  { id: 'useADX', type: 'bool', title: 'Use ADX for Momentum Strength', defval: true },
  { id: 'adxLen', type: 'int', title: 'ADX Length', defval: 14, min: 1 },
  { id: 'adxSmooth', type: 'int', title: 'ADX Smoothing', defval: 14, min: 1 },
  { id: 'showADX', type: 'bool', title: 'Show ADX Line', defval: false },
  { id: 'FCOColor', type: 'color', title: 'FCO Line Color', defval: color.white },
  { id: 'signalColor', type: 'color', title: 'Signal Line Color', defval: '#5b9cf6' },
  { id: 'bullMomentumColor', type: 'color', title: 'Bullish Momentum Color', defval: color.green },
  { id: 'bearMomentumColor', type: 'color', title: 'Bearish Momentum Color', defval: color.red },
  { id: 'useMomentumGradient', type: 'bool', title: 'Use Gradient for Momentum', defval: true },
  { id: 'adxColor', type: 'color', title: 'ADX Line Color', defval: color.yellow },
  { id: 'showFCO', type: 'bool', title: 'Show FCO Line', defval: true },
  { id: 'showSignal', type: 'bool', title: 'Show Signal Line', defval: true },
  { id: 'showMomentum', type: 'bool', title: 'Show Momentum Histogram', defval: true },
  { id: 'showExtremeZones', type: 'bool', title: 'Show Extreme Zone Background', defval: true },
  { id: 'useATRNorm', type: 'bool', title: 'Normalize Momentum by ATR', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Momentum (ADX-Weighted)', color: color.green, lineWidth: 2, style: 'columns' },
  { id: 'plot1', title: 'FCO (Control)', color: color.white, lineWidth: 2 },
  { id: 'plot2', title: 'Signal Line', color: '#5b9cf6', lineWidth: 2 },
  { id: 'plot3', title: 'ADX (Scaled)', color: String(color.new(color.yellow, 50)), lineWidth: 2 },
  { id: 'plot4', title: 'CMF', color: String(color.new(color.blue, 70)), lineWidth: 1, display: 'none' },
  { id: 'plot5', title: 'MFI Scaled', color: String(color.new(color.orange, 70)), lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'ADX Raw', color: String(color.new(color.yellow, 70)), lineWidth: 1, display: 'none' },
];

// Pine hline default style: dashed
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero', color: color.gray, linestyle: 'solid', linewidth: 1 },
  { id: 'hline_upper', price: 0.7, title: 'Upper', color: String(color.new(color.gray, 70)), linestyle: 'dashed' },
  { id: 'hline_lower', price: -0.7, title: 'Lower', color: String(color.new(color.gray, 70)), linestyle: 'dashed' },
  { id: 'hline_xhigh', price: 1.0, title: 'Extreme High', color: String(color.new(color.red, 80)), linestyle: 'dashed' },
  { id: 'hline_xlow', price: -1.0, title: 'Extreme Low', color: String(color.new(color.green, 80)), linestyle: 'dashed' },
];

export const metadata = {
  title: 'Flow Control Oscillator (FCO)',
  shortTitle: 'FCO',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const eq = (a: number, b: number) => Math.abs(a - b) <= EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<FlowControlOscillatorInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const high = bars.map((b) => b.high);
  const low = bars.map((b) => b.low);
  const close = bars.map((b) => b.close);
  const volume = bars.map((b) => b.volume ?? NaN);
  const src = getSourceSeries(bars, cfg.src).toArray().map((v) => v ?? NaN);

  // tema / dema / applySmoothing(src, type, len): one call per bar of the branch of the (constant) type
  const tema = (x: number[], len: number) => {
    const e1 = taCore.ema(x, len);
    const e2 = taCore.ema(e1, len);
    const e3 = taCore.ema(e2, len);
    return e1.map((v, i) => 3 * v - 3 * e2[i] + e3[i]);
  };
  const dema = (x: number[], len: number) => {
    const e1 = taCore.ema(x, len);
    const e2 = taCore.ema(e1, len);
    return e1.map((v, i) => 2 * v - e2[i]);
  };
  const applySmoothing = (x: number[], type: string, len: number): number[] =>
    type === 'EMA' ? taCore.ema(x, len)
      : type === 'WMA' ? taCore.wma(x, len)
        : type === 'RMA' ? taCore.rma(x, len)
          : type === 'TEMA' ? tema(x, len)
            : type === 'DEMA' ? dema(x, len)
              : type === 'VWMA' ? taCore.vwma(x, len, volume)
                : taCore.sma(x, len);

  // MFI scaled to -1..+1
  const mfiRaw = taCore.mfi(src, cfg.mfiLen, volume);
  const mfi = mfiRaw.map((v) => (v - 50) / 50);

  // CMF: ad = high == low ? 0 : ((2 * close - high - low) / (high - low)) * volume
  const ad = bars.map((_b, i) => (eq(high[i], low[i]) ? 0 : ((2 * close[i] - high[i] - low[i]) / (high[i] - low[i])) * volume[i]));
  const adSum = math.sum(ad, cfg.cmfLen) as number[];
  const volSum = math.sum(volume, cfg.cmfLen) as number[];
  // a plain division (x / 0 is +-infinity, 0 / 0 na)
  const cmf = adSum.map((v, i) => v / volSum[i]);

  const mfiWeight = cfg.weightMode === 'MFI Heavy' ? 0.7 : cfg.weightMode === 'CMF Heavy' ? 0.3
    : cfg.weightMode === 'Custom' ? cfg.customMFIWeight : 0.5;
  const cmfWeight = 1 - mfiWeight;
  const fcoRaw = cmf.map((c, i) => (cfg.weightMode === 'Equal' ? c + mfi[i] : (c * cmfWeight + mfi[i] * mfiWeight) * 2));
  const fco = cfg.smoothLen > 1 ? applySmoothing(fcoRaw, cfg.smoothType, cfg.smoothLen) : fcoRaw;

  let signal: number[];
  if (cfg.signalType === 'HMA') {
    // ta.hma(x, 1) is a Pine runtime error
    if (Math.floor(cfg.signalLen / 2) < 1) {
      throw new Error("Invalid value of the 'length' argument (0.0) in the 'wma' function. It must be > 0.");
    }
    signal = taCore.hma(fco, cfg.signalLen);
  } else {
    signal = applySmoothing(fco, cfg.signalType, cfg.signalLen);
  }

  // ADX scaled to 0..1
  const [, , adxRaw] = taCore.dmi(cfg.adxLen, cfg.adxSmooth, high, low, close);
  const adx = adxRaw.map((v) => v / 100);

  const momentumBase = taCore.change(fco, cfg.momentumLen);
  const atrNorm = taCore.atr(14, high, low, close);
  const momentum = momentumBase.map((m, i) => {
    const adjusted = cfg.useATRNorm ? m / atrNorm[i] : m;
    return cfg.useADX ? adjusted * (0.3 + adx[i] * 0.7) : adjusted;
  });

  const bullFaint = String(color.new(cfg.bullMomentumColor, 60));
  const bullFull = String(color.new(cfg.bullMomentumColor, 0));
  const bearFull = String(color.new(cfg.bearMomentumColor, 0));
  const bearFaint = String(color.new(cfg.bearMomentumColor, 60));
  const bull20 = String(color.new(cfg.bullMomentumColor, 20));
  const bear20 = String(color.new(cfg.bearMomentumColor, 20));
  const momentumColor = (m: number) => {
    if (cfg.useMomentumGradient) {
      return gt(m, 0) ? color.from_gradient(m, 0, 0.3, bullFaint, bullFull) : color.from_gradient(m, -0.3, 0, bearFull, bearFaint);
    }
    return gt(m, 0) ? bull20 : bear20;
  };

  const fin = (v: number) => (Number.isFinite(v) ? v : NaN);
  const adxLineColor = String(color.new(cfg.adxColor, 50));
  const cmfColor = String(color.new(color.blue, 70));
  const mfiColor = String(color.new(color.orange, 70));
  const adxRawColor = String(color.new(color.yellow, 70));
  const plots: Record<string, { time: number; value: number; color: string }[]> = {
    plot0: [], plot1: [], plot2: [], plot3: [], plot4: [], plot5: [], plot6: [],
  };
  const bgColors: BgColorData[] = [];
  const extremeColor = String(color.new(color.gray, 95));
  const weakColor = String(color.new(color.orange, 97));
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    plots.plot0.push({ time: t, value: cfg.showMomentum ? fin(momentum[i]) : NaN, color: momentumColor(momentum[i]) });
    plots.plot1.push({ time: t, value: cfg.showFCO ? fin(fco[i]) : NaN, color: cfg.FCOColor });
    plots.plot2.push({ time: t, value: cfg.showSignal ? fin(signal[i]) : NaN, color: cfg.signalColor });
    plots.plot3.push({ time: t, value: cfg.showADX ? fin(adx[i] * 2 - 1) : NaN, color: adxLineColor });
    plots.plot4.push({ time: t, value: fin(cmf[i]), color: cmfColor });
    plots.plot5.push({ time: t, value: fin(mfi[i]), color: mfiColor });
    plots.plot6.push({ time: t, value: fin(adx[i]), color: adxRawColor });
    // bgcolor(showExtremeZones and math.abs(FCO) > 1.0 ? color.new(color.gray, 95) : na, title = "Extreme Zones")
    if (cfg.showExtremeZones && gt(Math.abs(fco[i]), 1.0)) bgColors.push({ time: t, color: extremeColor, id: 'bgcolor0' });
    // bgcolor(useADX and adx < 0.20 ? color.new(color.orange, 97) : na, title = "Weak Trend Zone"), drawn on top
    if (cfg.useADX && lt(adx[i], 0.2)) bgColors.push({ time: t, color: weakColor, id: 'bgcolor1' });
  }

  // Alert conditions
  const bullMomentum = crossedOver(momentum, 0);
  const bearMomentum = crossedUnder(momentum, 0);
  const extremeHigh = fco.map((v) => gt(v, 1.0));
  const extremeLow = fco.map((v) => lt(v, -1.0));
  const fcoBullCross = crossedOver(fco, 0);
  const fcoBearCross = crossedUnder(fco, 0);
  const strongTrend = adx.map((v) => gt(v, 0.25));
  const fcoCrossOverSignal = crossedOver(fco, signal);
  const fcoCrossUnderSignal = crossedUnder(fco, signal);
  const absPrev = (a: number[], i: number) => (i > 0 ? Math.abs(a[i - 1]) : NaN);
  const momentumWeakening = momentum.map((m, i) => lt(Math.abs(m), absPrev(momentum, i)));
  const momentumGrowing = momentum.map((m, i) => gt(Math.abs(m), absPrev(momentum, i)));
  const sigPrev = (i: number) => (i > 0 ? signal[i - 1] : NaN);
  const flags: boolean[][] = Array.from({ length: 14 }, () => []);
  for (let i = 0; i < n; i++) {
    flags[0].push(extremeLow[i] && fcoCrossOverSignal[i] && momentumWeakening[i]);
    flags[1].push(extremeHigh[i] && fcoCrossUnderSignal[i] && momentumWeakening[i]);
    flags[2].push(fcoBullCross[i] && gt(momentum[i], 0) && momentumGrowing[i] && strongTrend[i]);
    flags[3].push(fcoBearCross[i] && lt(momentum[i], 0) && momentumGrowing[i] && strongTrend[i]);
    flags[4].push(fcoCrossOverSignal[i]);
    flags[5].push(fcoCrossUnderSignal[i]);
    flags[6].push(fcoBullCross[i] && gt(signal[i], sigPrev(i)));
    flags[7].push(fcoBearCross[i] && lt(signal[i], sigPrev(i)));
    flags[8].push(fcoBullCross[i]);
    flags[9].push(fcoBearCross[i]);
    flags[10].push(extremeHigh[i]);
    flags[11].push(extremeLow[i]);
    flags[12].push(bullMomentum[i] && strongTrend[i]);
    flags[13].push(bearMomentum[i] && strongTrend[i]);
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    hlines: hlineConfig.map((h) => ({
      value: h.price, options: { title: h.title, color: h.color, linestyle: h.linestyle, linewidth: h.linewidth },
    })),
    bgColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Reversal Setup', message: 'REVERSAL: FCO crossing up from extreme oversold with weakening momentum!' },
  { id: 'alert1', title: 'Bearish Reversal Setup', message: 'REVERSAL: FCO crossing down from extreme overbought with weakening momentum!' },
  { id: 'alert2', title: 'Strong Bullish Trend', message: 'TREND: Buyers taking control with growing momentum and strong ADX!' },
  { id: 'alert3', title: 'Strong Bearish Trend', message: 'TREND: Sellers taking control with growing momentum and strong ADX!' },
  { id: 'alert4', title: 'FCO Crossed Above Signal', message: 'FCO crossed above Signal line - bullish momentum shift' },
  { id: 'alert5', title: 'FCO Crossed Below Signal', message: 'FCO crossed below Signal line - bearish momentum shift' },
  { id: 'alert6', title: 'Confirmed Bullish Signal', message: 'FCO crossed zero UP and Signal confirms - strong buy signal!' },
  { id: 'alert7', title: 'Confirmed Bearish Signal', message: 'FCO crossed zero DOWN and Signal confirms - strong sell signal!' },
  { id: 'alert8', title: 'Buyers Take Control', message: 'Buyers Now in Control!' },
  { id: 'alert9', title: 'Sellers Take Control', message: 'Sellers Now in Control!' },
  { id: 'alert10', title: 'Extreme Overbought', message: 'Buyers Exhausted - Watch for reversal!' },
  { id: 'alert11', title: 'Extreme Oversold', message: 'Sellers Exhausted - Watch for reversal!' },
  { id: 'alert12', title: 'Strong Bullish Momentum', message: 'Strong Buyers Gaining Strength!' },
  { id: 'alert13', title: 'Strong Bearish Momentum', message: 'Strong Sellers Gaining Strength!' },
];

export const FlowControlOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
