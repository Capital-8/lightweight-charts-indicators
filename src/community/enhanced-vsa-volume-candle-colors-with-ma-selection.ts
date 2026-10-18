/**
 * Enhanced VSA Volume & Candle Colors with MA Selection
 *
 * Volume columns coloured by volume class: extreme (volume above its `percentile` nearest-rank percentile over
 * `length` bars), high (above the selected volume MA * high multiplier, not extreme), low (below the selected MA *
 * low multiplier) or neutral. High and low colours get a transparency of 60 - min(max(volume / MA * 30, 0), 40)
 * (the low colour plus an extra transparency). The selected MA (SMA, EMA or VWMA of the volume over `length`) and a
 * reference EMA of the volume are drawn as lines; the price bars take the extreme / high / low colours.
 * Alerts (alertcondition, `alerts` of the result): 'Extreme Volume', 'High Volume' and 'Low Volume', true on the bars
 * of each volume class.
 *
 * Reference: "Enhanced VSA Volume & Candle Colors with MA Selection" by ViZiV
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar } from 'oakscriptjs';
import type { BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EnhancedVsaVolumeCandleColorsInputs {
  /** Volume lookback period (MA and percentile window) */
  length: number;
  /** High volume multiplier of the selected MA */
  highMult: number;
  /** Low volume multiplier of the selected MA */
  lowMult: number;
  /** Extreme volume percentile (nearest rank) */
  percentileThreshold: number;
  /** Colour the price bars from the volume class */
  colorBars: boolean;
  /** Moving average of the volume */
  maType: 'SMA' | 'EMA' | 'VWMA';
  /** Length of the reference EMA of the volume */
  refEmaLength: number;
  /** Transparency of the neutral volume columns */
  neutralTransp: number;
  /** Extra transparency of the low volume colour */
  lowTranspOffset: number;
  highColor: string;
  lowColor: string;
  neutralColor: string;
  veryHighColor: string;
}

export const defaultInputs: EnhancedVsaVolumeCandleColorsInputs = {
  length: 200,
  highMult: 1.5,
  lowMult: 0.5,
  percentileThreshold: 90,
  colorBars: true,
  maType: 'SMA',
  refEmaLength: 400,
  neutralTransp: 80,
  lowTranspOffset: 20,
  highColor: color.purple,
  lowColor: color.gray,
  neutralColor: color.blue,
  veryHighColor: color.orange,
};

export const inputConfig: InputConfig[] = [
  { id: 'length', type: 'int', title: 'Volume Lookback Period', defval: 200 },
  { id: 'highMult', type: 'float', title: 'High Volume Multiplier', defval: 1.5 },
  { id: 'lowMult', type: 'float', title: 'Low Volume Multiplier', defval: 0.5 },
  { id: 'percentileThreshold', type: 'int', title: 'Extreme Volume Percentile', defval: 90, min: 1, max: 99 },
  { id: 'colorBars', type: 'bool', title: 'Color Price Bars Based on Volume', defval: true },
  { id: 'maType', type: 'string', title: 'Select Moving Average', defval: 'SMA', options: ['SMA', 'EMA', 'VWMA'] },
  { id: 'refEmaLength', type: 'int', title: 'Reference EMA Length', defval: 400, min: 1 },
  { id: 'neutralTransp', type: 'int', title: 'Neutral Volume Transparency', defval: 80, min: 0, max: 100 },
  { id: 'lowTranspOffset', type: 'int', title: 'Low Volume Extra Transparency', defval: 20, min: 0, max: 100 },
  { id: 'highColor', type: 'color', title: 'High Volume Color', defval: color.purple },
  { id: 'lowColor', type: 'color', title: 'Low Volume Color', defval: color.gray },
  { id: 'neutralColor', type: 'color', title: 'Neutral Volume Color', defval: color.blue },
  { id: 'veryHighColor', type: 'color', title: 'Extreme Volume Color', defval: color.orange },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Volume', color: color.blue, lineWidth: 1, style: 'columns' },
  { id: 'plot1', title: 'Selected MA (SMA, EMA, or VWMA)', color: color.green, lineWidth: 2 },
  { id: 'plot2', title: 'Reference Smoothed Volume (EMA)', color: color.purple, lineWidth: 2 },
];

export const metadata = {
  title: 'Enhanced VSA Volume & Candle Colors with MA Selection',
  shortTitle: 'Enhanced VSA Volume & Candle Colors with MA Selection',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;

export function calculate(
  bars: Bar[],
  inputs: Partial<EnhancedVsaVolumeCandleColorsInputs> = {},
): IndicatorResult & { barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const vol = bars.map((b) => b.volume ?? NaN);
  const volS = Series.fromArray(bars, vol);

  const userMa = A(cfg.maType === 'SMA' ? ta.sma(volS, cfg.length)
    : cfg.maType === 'EMA' ? ta.ema(volS, cfg.length)
      : ta.vwma(volS, cfg.length, volS));
  const pct = A(ta.percentile_nearest_rank(volS, cfg.length, cfg.percentileThreshold));
  const refEma = A(ta.ema(volS, cfg.refEmaLength));

  const neutral = String(color.new(cfg.neutralColor, cfg.neutralTransp));
  const veryHigh = String(color.new(cfg.veryHighColor, 40));

  const plot0 = [];
  const plot1 = [];
  const plot2 = [];
  const barColors: BarColorData[] = [];
  const extremeFlags: boolean[] = [], highFlags: boolean[] = [], lowFlags: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const v = vol[i];
    const ma = userMa[i];
    const veryHighVol = gt(v, pct[i]);
    const isHighVol = gt(v, ma * cfg.highMult) && !veryHighVol;
    const isLowVol = lt(v, ma * cfg.lowMult);
    extremeFlags.push(veryHighVol);
    highFlags.push(isHighVol);
    lowFlags.push(isLowVol);
    // transp_level = 60 - math.min(math.max(volume / user_ma * 30, 0), 40) (na when user_ma is na)
    const r = (v / ma) * 30;
    const transp = 60 - Math.min(Math.max(r, 0), 40);
    const highC = String(color.new(cfg.highColor, transp));
    const lowC = String(color.new(cfg.lowColor, Math.min(transp + cfg.lowTranspOffset, 100)));
    const c = veryHighVol ? veryHigh : isHighVol ? highC : isLowVol ? lowC : neutral;
    plot0.push({ time: t, value: Number.isFinite(v) ? v : NaN, color: c });
    plot1.push({ time: t, value: Number.isFinite(ma) ? ma : NaN });
    plot2.push({ time: t, value: Number.isFinite(refEma[i]) ? refEma[i] : NaN });
    if (cfg.colorBars && (veryHighVol || isHighVol || isLowVol)) barColors.push({ time: t, color: c });
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: { plot0, plot1, plot2 },
    barColors,
    // alertcondition(very_high_vol) / alertcondition(is_high_vol) / alertcondition(is_low_vol)
    alerts: alertStates(alertConditions, bars, [extremeFlags, highFlags, lowFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Extreme Volume', message: 'Extreme volume spike detected!' },
  { id: 'alert1', title: 'High Volume', message: 'High volume detected.' },
  { id: 'alert2', title: 'Low Volume', message: 'Low volume detected.' },
];

export const EnhancedVsaVolumeCandleColorsWithMaSelection = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
