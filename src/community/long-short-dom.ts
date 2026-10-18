/**
 * Long Short dom
 *
 * Vortex indicator: VI+ = sum(|high - low[1]|, length) / sum(ATR(1), length) and
 * VI- = sum(|low - high[1]|, length) / sum(ATR(1), length). VI+ and VI- are drawn where they are above zero (or
 * always with "show values below zero"), with their difference as green / maroon columns, the highest and the
 * lowest of the two lines, a dashed zero line and a green / red background when VI+ is above / not above VI-.
 * Alerts (alertcondition, `alerts` of the result): VI+ crossing over VI- and VI+ crossing under VI-.
 *
 * Reference: "Long Short dom" by Robin-Hood-trading
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, math, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, crossedOver, crossedUnder, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface LongShortDomInputs {
  /** Vortex length */
  period: number;
  /** Show the VI+ - VI- histogram */
  showHistogram: boolean;
  /** Show the trend background */
  showBackground: boolean;
  /** Show values below zero */
  showBelowZero: boolean;
}

export const defaultInputs: LongShortDomInputs = {
  period: 14,
  showHistogram: true,
  showBackground: true,
  showBelowZero: false,
};

export const inputConfig: InputConfig[] = [
  { id: 'period', type: 'int', title: 'Length', defval: 14, min: 2 },
  { id: 'showHistogram', type: 'bool', title: 'Показывать гистограмму разницы VI+ - VI-', defval: true },
  { id: 'showBackground', type: 'bool', title: 'Показывать фоновую зону тренда', defval: true },
  { id: 'showBelowZero', type: 'bool', title: 'Показывать значения ниже нуля?', defval: false },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'VI +', color: color.green, lineWidth: 2 },
  { id: 'plot1', title: 'VI -', color: color.red, lineWidth: 2 },
  { id: 'plot2', title: 'VI+ - VI-', color: color.lime, lineWidth: 1, style: 'columns' },
  { id: 'plot3', title: 'Highest Line', color: color.teal, lineWidth: 1 },
  { id: 'plot4', title: 'Lowest Line', color: color.orange, lineWidth: 1 },
];

export const metadata = {
  title: 'Long Short dom',
  shortTitle: 'VI+',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
/** Pine math.max / math.min: na when an argument is na */
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
const fin = (v: number) => (Number.isFinite(v) ? v : NaN);

export function calculate(
  bars: Bar[],
  inputs: Partial<LongShortDomInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const len = cfg.period;

  // VMP = math.sum(math.abs(high - low[1]), period_), VMM = math.sum(math.abs(low - high[1]), period_)
  const vmp = A(math.sum(S(bars.map((b, i) => (i > 0 ? Math.abs(b.high - bars[i - 1].low) : NaN))), len) as Series);
  const vmm = A(math.sum(S(bars.map((b, i) => (i > 0 ? Math.abs(b.low - bars[i - 1].high) : NaN))), len) as Series);
  // STR = math.sum(ta.atr(1), period_)
  const str = A(math.sum(ta.atr(bars, 1), len) as Series);

  const t = (i: number) => bars[i].time;
  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const plot3 = [];
  const plot4 = [];
  const bgColors: BgColorData[] = [];
  const bull = String(color.new(color.green, 85));
  const bear = String(color.new(color.red, 85));
  const vipArr: number[] = [];
  const vimArr: number[] = [];
  for (let i = 0; i < n; i++) {
    // A plain division: x / 0 is +-infinity (0 / 0 NaN); comparisons use the infinite value, plots show na
    const vip = vmp[i] / str[i];
    const vim = vmm[i] / str[i];
    vipArr.push(vip);
    vimArr.push(vim);
    const finalVip = cfg.showBelowZero ? vip : gt(vip, 0) ? vip : NaN;
    const finalVim = cfg.showBelowZero ? vim : gt(vim, 0) ? vim : NaN;
    plot0.push({ time: t(i), value: fin(finalVip), color: color.green });
    plot1.push({ time: t(i), value: fin(finalVim), color: color.red });
    // bgcolor(showBackground ? (VIP > VIM ? color.new(color.green, 85) : color.new(color.red, 85)) : na)
    if (cfg.showBackground) bgColors.push({ time: t(i), color: gt(vip, vim) ? bull : bear });
    // plot(showHistogram ? delta : na, 'VI+ - VI-', style_columns, color = delta >= 0 ? color.lime : color.maroon)
    const delta = vip - vim;
    plot2.push({ time: t(i), value: cfg.showHistogram ? fin(delta) : NaN, color: ge(delta, 0) ? color.lime : color.maroon });
    plot3.push({ time: t(i), value: fin(max(finalVip, finalVim)), color: color.teal });
    plot4.push({ time: t(i), value: fin(min(finalVip, finalVim)), color: color.orange });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2, plot3, plot4 },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: color.gray, linestyle: 'dashed', linewidth: 1 } }],
    bgColors,
    // crossUp = ta.crossover(VIP, VIM), crossDown = ta.crossunder(VIP, VIM)
    alerts: alertStates(alertConditions, bars, [crossedOver(vipArr, vimArr), crossedUnder(vipArr, vimArr)]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'VI+ пересекает VI- вверх', message: 'VI+ пересек VI- вверх (возможный лонг)' },
  { id: 'alert1', title: 'VI+ пересекает VI- вниз', message: 'VI+ пересек VI- вниз (возможный шорт)' },
];

export const LongShortDom = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
