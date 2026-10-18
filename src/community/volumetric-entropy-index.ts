/**
 * Volumetric Entropy Index (VEI)
 *
 * The volume of up bars (close > open) and of down bars (close < open) is averaged by two EMAs ("EMA DNA" lines;
 * the dominant one is drawn solid, the other faded). The drift of each EMA over `lookback` bars, smoothed by an
 * RMA, gives two directions: the background is green when both drifts are positive and red when neither is.
 * Optional plots: the EMA(10) of the difference of the two EMAs (net drift), the EMA(10) of its absolute value
 * (drift strength), and the EMA(10) of their mean (baseline) with a percentage envelope and stdev bands.
 *
 * Alerts (alertcondition, `alerts` of the result): the green and the red background, the up EMA crossing over / under
 * the down EMA, the net drift crossing over / under 0, and the drift strength crossing over its 50-bar high (as in
 * the original, the high includes the current bar, so this one never fires).
 *
 * Reference: "Volumetric Entropy Index" by Sherlock_MacGyver
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface VolumetricEntropyIndexInputs {
  /** EMA length of the up / down volumes */
  emaLen: number;
  /** Drift lookback (bars) */
  lookback: number;
  /** RMA length of the drifts */
  driftSmoothLen: number;
  showBg: boolean;
  bgGreen: string;
  bgRed: string;
  /** Background transparency (the colour uses 100 - bgAlpha) */
  bgAlpha: number;
  showEMAs: boolean;
  emaUpColor: string;
  emaDownColor: string;
  /** DNA line width (the plot width stays the default 2) */
  dnaLineWidth: number;
  /** Transparency of the inactive EMA line */
  dnaFadeAmount: number;
  showNetDrift: boolean;
  netDriftColor: string;
  /** Net drift line width (the plot width stays the default 2) */
  netDriftWidth: number;
  netDriftAlpha: number;
  showDriftStrength: boolean;
  driftStrengthColor: string;
  /** Drift strength line width (the plot width stays the default 2) */
  driftStrengthWidth: number;
  driftStrengthAlpha: number;
  showBaseline: boolean;
  baselineColor: string;
  /** Baseline line width (the plot width stays the default 2) */
  baselineWidth: number;
  bandUpColor: string;
  bandDownColor: string;
  /** Band line width (the plot width stays the default 2) */
  bandWidth: number;
  bandAlpha: number;
  bandMult: number;
  /** Envelope offset: baseline * envelopePercent (used as a ratio, as in the Pine script) */
  envelopePercent: number;
}

export const defaultInputs: VolumetricEntropyIndexInputs = {
  emaLen: 20,
  lookback: 2,
  driftSmoothLen: 5,
  showBg: true,
  bgGreen: color.green,
  bgRed: color.red,
  bgAlpha: 30,
  showEMAs: true,
  emaUpColor: color.lime,
  emaDownColor: color.red,
  dnaLineWidth: 2,
  dnaFadeAmount: 70,
  showNetDrift: false,
  netDriftColor: color.orange,
  netDriftWidth: 2,
  netDriftAlpha: 0,
  showDriftStrength: false,
  driftStrengthColor: color.aqua,
  driftStrengthWidth: 2,
  driftStrengthAlpha: 0,
  showBaseline: false,
  baselineColor: color.white,
  baselineWidth: 2,
  bandUpColor: color.green,
  bandDownColor: color.red,
  bandWidth: 2,
  bandAlpha: 20,
  bandMult: 2.0,
  envelopePercent: 0.2,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaLen', type: 'int', title: 'EMA Length', defval: 20, min: 1 },
  { id: 'lookback', type: 'int', title: 'Drift Lookback (bars)', defval: 2, min: 1 },
  { id: 'driftSmoothLen', type: 'int', title: 'Drift Smooth Length', defval: 5, min: 1 },
  { id: 'showBg', type: 'bool', title: 'Show Agreement Background', defval: true },
  { id: 'bgGreen', type: 'color', title: 'Up-Up Background Color', defval: color.green },
  { id: 'bgRed', type: 'color', title: 'Down-Down Background Color', defval: color.red },
  { id: 'bgAlpha', type: 'int', title: 'Background Transparency', defval: 30, min: 0, max: 100 },
  { id: 'showEMAs', type: 'bool', title: 'Show EMA DNA Lines', defval: true },
  { id: 'emaUpColor', type: 'color', title: 'Up EMA Color', defval: color.lime },
  { id: 'emaDownColor', type: 'color', title: 'Down EMA Color', defval: color.red },
  { id: 'dnaLineWidth', type: 'int', title: 'DNA Line Width', defval: 2, min: 1, max: 5 },
  { id: 'dnaFadeAmount', type: 'int', title: 'Fade Inactive EMA (%)', defval: 70, min: 0, max: 100 },
  { id: 'showNetDrift', type: 'bool', title: 'Show Smoothed Net Drift', defval: false },
  { id: 'netDriftColor', type: 'color', title: 'Net Drift Color', defval: color.orange },
  { id: 'netDriftWidth', type: 'int', title: 'Net Drift Line Width', defval: 2, min: 1, max: 5 },
  { id: 'netDriftAlpha', type: 'int', title: 'Net Drift Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showDriftStrength', type: 'bool', title: 'Show Drift Strength', defval: false },
  { id: 'driftStrengthColor', type: 'color', title: 'Drift Strength Color', defval: color.aqua },
  { id: 'driftStrengthWidth', type: 'int', title: 'Drift Strength Width', defval: 2, min: 1, max: 5 },
  { id: 'driftStrengthAlpha', type: 'int', title: 'Drift Strength Transparency', defval: 0, min: 0, max: 100 },
  { id: 'showBaseline', type: 'bool', title: 'Show Drift Baseline + Bands', defval: false },
  { id: 'baselineColor', type: 'color', title: 'Baseline Color', defval: color.white },
  { id: 'baselineWidth', type: 'int', title: 'Baseline Width', defval: 2, min: 1, max: 5 },
  { id: 'bandUpColor', type: 'color', title: 'Up Drift Band Color', defval: color.green },
  { id: 'bandDownColor', type: 'color', title: 'Down Drift Band Color', defval: color.red },
  { id: 'bandWidth', type: 'int', title: 'Band Line Width', defval: 2, min: 1, max: 5 },
  { id: 'bandAlpha', type: 'int', title: 'Band Transparency (%)', defval: 20, min: 0, max: 100 },
  { id: 'bandMult', type: 'float', title: 'Band Width Multiplier', defval: 2.0, min: 0.1, step: 0.1 },
  { id: 'envelopePercent', type: 'float', title: 'Baseline Envelope Offset (%)', defval: 0.2, min: 0.001, step: 0.1 },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'EMA Up', color: color.lime, lineWidth: 2 },
  { id: 'plot1', title: 'EMA Down', color: color.red, lineWidth: 2 },
  { id: 'plot2', title: 'Smoothed Net Drift', color: color.orange, lineWidth: 2 },
  { id: 'plot3', title: 'Drift Strength', color: color.aqua, lineWidth: 2 },
  { id: 'plot4', title: 'Drift Baseline', color: color.white, lineWidth: 2 },
  { id: 'plot5', title: 'Envelope Top', color: color.white, lineWidth: 1 },
  { id: 'plot6', title: 'Envelope Bottom', color: color.white, lineWidth: 1 },
  { id: 'plot7', title: 'Upper Band', color: String(color.new(color.green, 20)), lineWidth: 2 },
  { id: 'plot8', title: 'Lower Band', color: String(color.new(color.red, 20)), lineWidth: 2 },
];

export const metadata = {
  title: 'Volumetric Entropy Index',
  shortTitle: 'VEI',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<VolumetricEntropyIndexInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => (v === null || v === undefined ? NaN : v));
  const S = (a: number[]) => Series.fromArray(bars, a);

  // upVol = close > open ? volume : 0; dnVol = close < open ? -volume : 0
  const upVol = bars.map((b) => (gt(b.close, b.open) ? b.volume ?? NaN : 0));
  const dnVol = bars.map((b) => (lt(b.close, b.open) ? -(b.volume ?? NaN) : 0));
  const emaUp = A(ta.ema(S(upVol), cfg.emaLen));
  const emaDown = A(ta.ema(S(dnVol), cfg.emaLen));
  const emaDownF = emaDown.map((v) => -v);

  // DNA drift: x - x[lookback], smoothed by ta.rma
  const lb = cfg.lookback;
  const rawUpDrift = emaUp.map((v, i) => (i >= lb ? v - emaUp[i - lb] : NaN));
  const rawDnDrift = emaDownF.map((v, i) => (i >= lb ? v - emaDownF[i - lb] : NaN));
  const smoothUpDrift = A(ta.rma(S(rawUpDrift), cfg.driftSmoothLen));
  const smoothDnDrift = A(ta.rma(S(rawDnDrift), cfg.driftSmoothLen));

  // Net drift, strength, baseline and bands
  const driftDelta = emaUp.map((v, i) => v - emaDownF[i]);
  const smoothedDelta = A(ta.ema(S(driftDelta), 10));
  const smoothedStrength = A(ta.ema(S(driftDelta.map((d) => Math.abs(d))), 10));
  const smoothedMid = A(ta.ema(S(emaUp.map((v, i) => (v + emaDownF[i]) / 2)), 10));
  const stdevDelta = A(ta.stdev(S(driftDelta), 10));

  const bgUp = String(color.new(cfg.bgGreen, 100 - cfg.bgAlpha));
  const bgDn = String(color.new(cfg.bgRed, 100 - cfg.bgAlpha));
  const upActive = String(color.new(cfg.emaUpColor, 0));
  const upFaded = String(color.new(cfg.emaUpColor, cfg.dnaFadeAmount));
  const dnActive = String(color.new(cfg.emaDownColor, 0));
  const dnFaded = String(color.new(cfg.emaDownColor, cfg.dnaFadeAmount));
  const netCol = String(color.new(cfg.netDriftColor, cfg.netDriftAlpha));
  const strengthCol = String(color.new(cfg.driftStrengthColor, cfg.driftStrengthAlpha));
  const bandUp = String(color.new(cfg.bandUpColor, cfg.bandAlpha));
  const bandDn = String(color.new(cfg.bandDownColor, cfg.bandAlpha));

  type Point = { time: number; value: number; color?: string };
  const plots: Record<string, Point[]> = {};
  for (let k = 0; k < 9; k++) plots[`plot${k}`] = [];
  const bgColors: BgColorData[] = [];
  const agreeUp: boolean[] = [];
  const agreeDown: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    // upR = smoothUpDrift > 0; dnR = smoothDnDrift > 0 (na is false: both false gives the red background)
    const upR = gt(smoothUpDrift[i], 0);
    const dnR = gt(smoothDnDrift[i], 0);
    agreeUp.push(upR && dnR);
    agreeDown.push(!upR && !dnR);
    if (cfg.showBg) {
      if (upR && dnR) bgColors.push({ time: t, color: bgUp });
      else if (!upR && !dnR) bgColors.push({ time: t, color: bgDn });
    }

    const greenDominant = gt(emaUp[i], emaDownF[i]);
    plots.plot0.push({ time: t, value: cfg.showEMAs ? emaUp[i] : NaN, color: greenDominant ? upActive : upFaded });
    plots.plot1.push({ time: t, value: cfg.showEMAs ? emaDownF[i] : NaN, color: greenDominant ? dnFaded : dnActive });
    plots.plot2.push({ time: t, value: cfg.showNetDrift ? smoothedDelta[i] : NaN, color: netCol });
    plots.plot3.push({ time: t, value: cfg.showDriftStrength ? smoothedStrength[i] : NaN, color: strengthCol });

    const mid = smoothedMid[i];
    const rangeBand = stdevDelta[i] * cfg.bandMult;
    const envelopeOffset = mid * cfg.envelopePercent;
    const positive = gt(driftDelta[i], 0);
    plots.plot4.push({ time: t, value: cfg.showBaseline ? mid : NaN, color: cfg.baselineColor });
    plots.plot5.push({ time: t, value: cfg.showBaseline ? mid + envelopeOffset : NaN, color: cfg.baselineColor });
    plots.plot6.push({ time: t, value: cfg.showBaseline ? mid - envelopeOffset : NaN, color: cfg.baselineColor });
    plots.plot7.push({ time: t, value: cfg.showBaseline ? mid + rangeBand : NaN, color: positive ? bandUp : bandDn });
    plots.plot8.push({ time: t, value: cfg.showBaseline ? mid - rangeBand : NaN, color: positive ? bandDn : bandUp });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots,
    bgColors,
    alerts: alertStates(alertConditions, bars, [
      agreeUp, agreeDown,
      crossedOver(emaUp, emaDownF), crossedUnder(emaUp, emaDownF),
      crossedOver(smoothedDelta, 0), crossedUnder(smoothedDelta, 0),
      crossedOver(smoothedStrength, A(ta.highest(S(smoothedStrength), 50))),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Drift Agreement Up', message: 'Both drift directions rising (Green Background)' },
  { id: 'alert1', title: 'Drift Agreement Down', message: 'Both drift directions falling (Red Background)' },
  { id: 'alert2', title: 'EMA DNA Bull Cross', message: 'EMA Up crossed above EMA Down' },
  { id: 'alert3', title: 'EMA DNA Bear Cross', message: 'EMA Up crossed below EMA Down' },
  { id: 'alert4', title: 'Net Drift Bullish', message: 'Smoothed Net Drift crossed above 0' },
  { id: 'alert5', title: 'Net Drift Bearish', message: 'Smoothed Net Drift crossed below 0' },
  { id: 'alert6', title: 'Drift Strength Spike', message: 'Drift Strength is spiking above 50-bar high' },
];

export const VolumetricEntropyIndex = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
