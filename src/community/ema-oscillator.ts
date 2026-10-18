/**
 * EMA Oscillator [Alpha Extract]
 *
 * Z-score of the distance of the close to its EMA: z = (close - ema(close, period)) / stdev(close - ema, period).
 * Threshold lines at +-mild / +-moderate / +-extreme: fixed sigma levels, or (default) percentages of the highest
 * |z| over the lookback. The z-score is a histogram coloured by its zone, with a background in the zone colour, and
 * circles on the price chart when z crosses above the extreme level (sell) or below minus the extreme level (buy).
 * Alerts (alertcondition, `alerts` of the result): z crossing above the extreme / moderate level ('Extremely
 * Overbought Alert' / 'Overbought Alert') and below minus the extreme / moderate level ('Extremely Oversold Alert' /
 * 'Oversold Alert').
 *
 * Reference: "EMA Oscillator [Alpha Extract]" by AlphaExtract
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type Bar } from 'oakscriptjs';
import type { MarkerData, BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EMAOscillatorInputs {
  /** EMA period (also the stdev length) */
  emaPeriod: number;
  /** Limit factor (not used by the script) */
  limitFactor: number;
  mildThreshold: number;
  moderateThreshold: number;
  extremeThreshold: number;
  /** Use the percentage thresholds (of the highest |z| over the lookback) */
  usePercentage: boolean;
  mildPct: number;
  moderatePct: number;
  extremePct: number;
  lookbackPeriod: number;
  showBackground: boolean;
  showThresholdLines: boolean;
  bgcolorTransparency: number;
  showSignals: boolean;
}

export const defaultInputs: EMAOscillatorInputs = {
  emaPeriod: 50,
  limitFactor: 2.0,
  mildThreshold: 1.0,
  moderateThreshold: 2.0,
  extremeThreshold: 3.0,
  usePercentage: true,
  mildPct: 25.0,
  moderatePct: 50.0,
  extremePct: 95.0,
  lookbackPeriod: 43,
  showBackground: true,
  showThresholdLines: true,
  bgcolorTransparency: 92,
  showSignals: true,
};

export const inputConfig: InputConfig[] = [
  { id: 'emaPeriod', type: 'int', title: 'EMA Period', defval: 50, min: 2, max: 50 },
  { id: 'limitFactor', type: 'float', title: 'Limit Factor', defval: 2.0, min: 0.5, max: 5.0, step: 0.1 },
  { id: 'mildThreshold', type: 'float', title: 'Mild Threshold (±1σ)', defval: 1.0, min: 0.1, max: 5.0, step: 0.1 },
  { id: 'moderateThreshold', type: 'float', title: 'Moderate Threshold (±2σ)', defval: 2.0, min: 0.1, max: 5.0, step: 0.1 },
  { id: 'extremeThreshold', type: 'float', title: 'Extreme Threshold (±3σ)', defval: 3.0, min: 0.1, max: 5.0, step: 0.1 },
  { id: 'usePercentage', type: 'bool', title: 'Use Percentage Thresholds', defval: true },
  { id: 'mildPct', type: 'float', title: 'Mild Threshold (%)', defval: 25.0, min: 5.0, max: 100.0, step: 5.0 },
  { id: 'moderatePct', type: 'float', title: 'Moderate Threshold (%)', defval: 50.0, min: 5.0, max: 100.0, step: 5.0 },
  { id: 'extremePct', type: 'float', title: 'Extreme Threshold (%)', defval: 95.0, min: 5.0, max: 100.0, step: 5.0 },
  { id: 'lookbackPeriod', type: 'int', title: 'Range Lookback Period', defval: 43, min: 10, max: 200 },
  { id: 'showBackground', type: 'bool', title: 'Show Background Colors', defval: true },
  { id: 'showThresholdLines', type: 'bool', title: 'Show Threshold Lines', defval: true },
  { id: 'bgcolorTransparency', type: 'int', title: 'Background Transparency', defval: 92, min: 0, max: 95, step: 5 },
  { id: 'showSignals', type: 'bool', title: 'Show Buy/Sell Signals', defval: true },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Extremely Overbought', color: '#ff0303', lineWidth: 2 },
  { id: 'plot1', title: 'Overbought', color: 'rgb(255, 106, 106)', lineWidth: 1 },
  { id: 'plot2', title: 'Mildly Overbought', color: 'rgb(184, 100, 86)', lineWidth: 1 },
  { id: 'plot3', title: 'Mildly Oversold', color: '#01b844', lineWidth: 1 },
  { id: 'plot4', title: 'Oversold', color: '#00ff66', lineWidth: 1 },
  { id: 'plot5', title: 'Extremely Oversold', color: '#00ff66', lineWidth: 2 },
  { id: 'plot6', title: 'EMA Oscillator Z-Score', color: '#a1a1a1', lineWidth: 2, style: 'histogram' },
];

/** hline(0, "Zero Line", color = #005720, linestyle = hline.style_solid, linewidth = 2) */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_zero', price: 0, title: 'Zero Line', color: '#005720', linestyle: 'solid', linewidth: 2 },
];

export const metadata = {
  title: 'EMA Oscillator [Alpha Extract]',
  shortTitle: 'EMA Oscillator [Alpha Extract]',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a >= b unless b - a > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);

export function calculate(
  bars: Bar[],
  inputs: Partial<EMAOscillatorInputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  // oscillator_values = close - ta.ema(close, ema_period); z_score = oscillator_values / ta.stdev(oscillator_values, ema_period)
  const ema = A(ta.ema(S(bars.map((b) => b.close)), cfg.emaPeriod));
  const osc = bars.map((b, i) => b.close - ema[i]);
  const sd = A(ta.stdev(S(osc), cfg.emaPeriod));
  // A plain division: x / 0 is +-infinity (0 / 0 NaN); the comparisons use the infinite value, the plot shows na
  const z = osc.map((o, i) => o / sd[i]);

  // osc_high = ta.highest(math.abs(z_score), lookback_period)
  const oscHigh = A(ta.highest(S(z.map((v) => Math.abs(v))), cfg.lookbackPeriod));
  const mild = oscHigh.map((h) => (cfg.usePercentage ? h * (cfg.mildPct / 100.0) : cfg.mildThreshold));
  const moderate = oscHigh.map((h) => (cfg.usePercentage ? h * (cfg.moderatePct / 100.0) : cfg.moderateThreshold));
  const extreme = oscHigh.map((h) => (cfg.usePercentage ? h * (cfg.extremePct / 100.0) : cfg.extremeThreshold));

  // signal_color: zone colour of the histogram
  const signalColor = (i: number) => {
    const v = z[i];
    if (ge(v, extreme[i])) return '#ff0303';
    if (ge(v, moderate[i])) return '#ff6a6a';
    if (ge(v, mild[i])) return '#b86456';
    if (gt(v, -mild[i])) return '#a1a1a1';
    if (gt(v, -moderate[i])) return '#01b844';
    if (gt(v, -extreme[i])) return '#00ff66';
    return '#00ff66';
  };

  // bgcolor: same zones (neutral #005720), color.new(c, bgcolor_transparency); an na z-score takes the last branch
  const bgColors: BgColorData[] = [];
  if (cfg.showBackground) {
    const t = cfg.bgcolorTransparency;
    for (let i = 0; i < n; i++) {
      const v = z[i];
      let c: string;
      if (ge(v, extreme[i])) c = '#ff0303';
      else if (ge(v, moderate[i])) c = '#ff6a6a';
      else if (ge(v, mild[i])) c = '#b86456';
      else if (gt(v, -mild[i])) c = '#005720';
      else if (gt(v, -moderate[i])) c = '#01b844';
      else c = '#00ff66';
      bgColors.push({ time: bars[i].time, color: String(color.new(c, t)) });
    }
  }

  const finite = (v: number) => (Number.isFinite(v) ? v : NaN);
  // plot(..., display = show_threshold_lines ? display.all : display.none): a hidden plot draws nothing
  const line = (vals: number[], sign: number, c: string) =>
    bars.map((b, i) => ({ time: b.time, value: cfg.showThresholdLines ? finite(sign * vals[i]) : NaN, color: c }));

  // sell_signal = show_signals and ta.crossover(z_score, selected_extreme)
  // buy_signal = show_signals and ta.crossunder(z_score, -selected_extreme) (exact comparisons)
  const markers: MarkerData[] = [];
  const zS = S(z);
  const sell = A(ta.crossover(zS, S(extreme)));
  const buy = A(ta.crossunder(zS, S(extreme.map((v) => -v))));
  if (cfg.showSignals) {
    const sellColor = String(color.rgb(255, 3, 3, 37));
    const buyColor = String(color.rgb(0, 255, 102, 43));
    for (let i = 0; i < n; i++) {
      // plotshape(sell_signal, "Sell", shape.circle, location.abovebar, size.tiny, force_overlay = true)
      if (sell[i] === 1) {
        markers.push({ time: bars[i].time, position: 'aboveBar', shape: 'circle', color: sellColor, size: 'tiny', forceOverlay: true });
      }
      // plotshape(buy_signal, "Buy", shape.circle, location.belowbar, size.tiny, force_overlay = true)
      if (buy[i] === 1) {
        markers.push({ time: bars[i].time, position: 'belowBar', shape: 'circle', color: buyColor, size: 'tiny', forceOverlay: true });
      }
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: line(extreme, 1, '#ff0303'),
      plot1: line(moderate, 1, 'rgb(255, 106, 106)'),
      plot2: line(mild, 1, 'rgb(184, 100, 86)'),
      plot3: line(mild, -1, '#01b844'),
      plot4: line(moderate, -1, '#00ff66'),
      plot5: line(extreme, -1, '#00ff66'),
      // plot(z_score, "EMA Oscillator Z-Score", style = plot.style_histogram, color = signal_color, linewidth = 2)
      plot6: bars.map((b, i) => ({ time: b.time, value: finite(z[i]), color: signalColor(i) })),
    },
    hlines: [{ value: 0, options: { title: 'Zero Line', color: '#005720', linestyle: 'solid', linewidth: 2 } }],
    bgColors,
    markers,
    // alertcondition(ta.crossover(z_score, selected_extreme) / ta.crossunder(z_score, -selected_extreme) /
    // ta.crossover(z_score, selected_moderate) / ta.crossunder(z_score, -selected_moderate)) (show_signals not used)
    alerts: alertStates(alertConditions, bars, [
      sell.map((v) => v === 1),
      buy.map((v) => v === 1),
      A(ta.crossover(zS, S(moderate))).map((v) => v === 1),
      A(ta.crossunder(zS, S(moderate.map((v) => -v)))).map((v) => v === 1),
    ]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Extremely Overbought Alert', message: 'EMA Oscillator reached extremely overbought levels' },
  { id: 'alert1', title: 'Extremely Oversold Alert', message: 'EMA Oscillator reached extremely oversold levels' },
  { id: 'alert2', title: 'Overbought Alert', message: 'EMA Oscillator reached overbought levels' },
  { id: 'alert3', title: 'Oversold Alert', message: 'EMA Oscillator reached oversold levels' },
];

export const EMAOscillator = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  alertConditions,
};
