/**
 * Aegis Prime Flow
 *
 * WaveTrend oscillator: esa = ema(src, len), d = ema(|src - esa|, len), ci = (src - esa) / (0.015 * d),
 * tci = ema(ci, smooth). The signal is sma(tci, 4); a money-flow cloud (sma(tci, 10) filled to zero, teal above
 * zero, red below) is drawn behind. Power bars at +90 / -90 show the tci sign and strength (beyond +-60). Labels
 * mark the crosses into the overbought (60) / oversold (-60) zones and triangles mark the crosses of tci with the
 * signal below -50 (bullish) or above 50 (bearish).
 *
 * Alerts (alertcondition, `alerts` of the result): bullish / bearish reversal (the triangles) and the oversold /
 * overbought entrances (the OS / OB labels).
 *
 * Reference: "Aegis Prime Flow [wjdtks255]" by wjdtks255
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © wjdtks255
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface AegisPrimeFlowInputs {
  /** Oscillator calculation period */
  len: number;
  /** Signal smoothness length */
  smooth: number;
  /** Source data price */
  src: SourceType;
}

export const defaultInputs: AegisPrimeFlowInputs = {
  len: 14,
  smooth: 3,
  src: 'hlc3',
};

const G_LOGIC = 'Core Technical Logic Settings (핵심 연산 알고리즘 설정)';

export const inputConfig: InputConfig[] = [
  { id: 'len', type: 'int', title: 'Oscillator Calculation Period (오실레이터 연산 주기)', defval: 14, min: 1, group: G_LOGIC },
  { id: 'smooth', type: 'int', title: 'Signal Smoothness Length (시그널 평활화 주기)', defval: 3, min: 1, group: G_LOGIC },
  { id: 'src', type: 'source', title: 'Source Data Price (기준 데이터 소스)', defval: 'hlc3', group: G_LOGIC },
];

const TEAL = '#00ffbb';
const RED = '#ff3a2d';
const BG_TEAL = String(color.new(TEAL, 80));
const BG_RED = String(color.new(RED, 80));
const TEAL_50 = String(color.new(TEAL, 50));
const RED_50 = String(color.new(RED, 50));
const GRAY_80 = String(color.new(color.gray, 80));
const GUIDE = String(color.new(color.white, 80));
const ZERO_LINE = String(color.new(color.white, 90));

export const plotConfig: PlotConfig[] = [
  // plot(mf, color = na) / plot(0, color = na): fill anchors, not drawn
  { id: 'plot0', title: 'Money Flow Line', color: 'transparent', lineWidth: 1 },
  { id: 'plot1', title: 'Zero Base Plot', color: 'transparent', lineWidth: 1 },
  { id: 'plot2', title: 'Upper Power Bar Track', color: TEAL, lineWidth: 4, style: 'linebr' },
  { id: 'plot3', title: 'Lower Power Bar Track', color: RED, lineWidth: 4, style: 'linebr' },
  { id: 'plot4', title: 'Main Flow Oscillator', color: TEAL, lineWidth: 2 },
];

/** hline(60 / -60, dashed) and hline(0) (Pine default line style: dashed) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_ob', price: 60, title: 'Overbought Boundary', color: GUIDE, linestyle: 'dashed' },
  { id: 'hline_os', price: -60, title: 'Oversold Boundary', color: GUIDE, linestyle: 'dashed' },
  { id: 'hline_zero', price: 0, title: 'Quantum Zero Line', color: ZERO_LINE, linestyle: 'dashed' },
];

/** fill(p_mf, p_z, mf > 0 ? color_bg_teal : color_bg_red): per-bar colours in the result */
export const fillConfig: FillConfig[] = [
  { id: 'fill_mf', plot1: 'plot0', plot2: 'plot1', color: BG_TEAL, title: 'Money Flow Cloud Layer' },
];

export const metadata = {
  title: 'Aegis Prime Flow [wjdtks255]',
  shortTitle: 'Aegis_Flow+',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<AegisPrimeFlowInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const B = (s: Series) => s.toArray().map((v) => v === 1);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const ap = A(getSourceSeries(bars, cfg.src));
  const esa = A(ta.ema(S(ap), cfg.len));
  const d = A(ta.ema(S(ap.map((v, i) => Math.abs(v - esa[i]))), cfg.len));
  // A plain division: x / 0 is +-infinity (0 / 0 NaN); ta.ema skips the infinite value as na
  const ci = ap.map((v, i) => (v - esa[i]) / (0.015 * d[i]));
  const tci = A(ta.ema(S(ci), cfg.smooth));
  const tciS = S(tci);
  const wt2 = A(ta.sma(tciS, 4));
  const mf = A(ta.sma(tciS, 10));

  // ta.crossover / ta.crossunder: exact comparisons with the last bar where both values were not na
  const isOs = B(ta.crossunder(tciS, S(new Array(n).fill(-60))));
  const isOb = B(ta.crossover(tciS, S(new Array(n).fill(60))));
  const crossUp = B(ta.crossover(tciS, S(wt2)));
  const crossDown = B(ta.crossunder(tciS, S(wt2)));

  const markers: MarkerData[] = [];
  const buyFlags: boolean[] = new Array(n).fill(false);
  const sellFlags: boolean[] = new Array(n).fill(false);
  const fillColors: string[] = new Array(n);
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const plot4 = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const v = tci[i];
    plot0.push({ time: t, value: Number.isFinite(mf[i]) ? mf[i] : NaN, color: 'transparent' });
    plot1.push({ time: t, value: 0, color: 'transparent' });
    // fill(p_mf, p_z, color = mf > 0 ? color_bg_teal : color_bg_red)
    fillColors[i] = gt(mf[i], 0) ? BG_TEAL : BG_RED;
    // bar_color_top = tci > 0 ? (tci > 60 ? color_teal : color.new(color_teal, 50)) : color.new(color.gray, 80)
    const top = gt(v, 0) ? (gt(v, 60) ? TEAL : TEAL_50) : GRAY_80;
    const bot = lt(v, 0) ? (lt(v, -60) ? RED : RED_50) : GRAY_80;
    plot2.push({ time: t, value: 90, color: top });
    plot3.push({ time: t, value: -90, color: bot });
    // osc_color = tci > wt2 ? color_teal : color_red
    plot4.push({ time: t, value: Number.isFinite(v) ? v : NaN, color: gt(v, wt2[i]) ? TEAL : RED });

    // plotshape(is_os, "OS", shape.labelup, location.bottom, color.orange, textcolor = color.black, size.tiny)
    if (isOs[i]) {
      markers.push({ time: t, position: 'bottom', shape: 'labelUp', color: color.orange, text: 'OS',
        textColor: color.black, size: 'tiny' });
    }
    if (isOb[i]) {
      markers.push({ time: t, position: 'top', shape: 'labelDown', color: color.orange, text: 'OB',
        textColor: color.black, size: 'tiny' });
    }
    // buy_sig = ta.crossover(tci, wt2) and tci < -50; sell_sig = ta.crossunder(tci, wt2) and tci > 50
    buyFlags[i] = crossUp[i] && lt(v, -50);
    sellFlags[i] = crossDown[i] && gt(v, 50);
    if (buyFlags[i]) {
      markers.push({ time: t, position: 'bottom', shape: 'triangleUp', color: TEAL, size: 'small' });
    }
    if (sellFlags[i]) {
      markers.push({ time: t, position: 'top', shape: 'triangleDown', color: RED, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [
      { value: 60, options: { title: 'Overbought Boundary', color: GUIDE, linestyle: 'dashed' } },
      { value: -60, options: { title: 'Oversold Boundary', color: GUIDE, linestyle: 'dashed' } },
      { value: 0, options: { title: 'Quantum Zero Line', color: ZERO_LINE, linestyle: 'dashed' } },
    ],
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Money Flow Cloud Layer' }, colors: fillColors },
    ],
    markers,
    // alertcondition(buy_sig) / (sell_sig) / (is_os) / (is_ob)
    alerts: alertStates(alertConditions, bars, [buyFlags, sellFlags, isOs, isOb]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Bullish Reversal (강력 매수 반전)', message: '[Prime Flow] Bullish Reversal Signal Triggered! Capital Inflow Starting. Price: {{close}}' },
  { id: 'alert1', title: 'Bearish Reversal (강력 매도 반전)', message: '[Prime Flow] Bearish Reversal Signal Triggered! Capital Outflow Starting. Price: {{close}}' },
  { id: 'alert2', title: 'Oversold Entrance (과매도 진입)', message: '[Prime Flow] Market Entered Oversold Zone. Watch for Reversal. Price: {{close}}' },
  { id: 'alert3', title: 'Overbought Entrance (과매수 진입)', message: '[Prime Flow] Market Entered Overbought Zone. Watch for Correction. Price: {{close}}' },
];

export const AegisPrimeFlow = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
