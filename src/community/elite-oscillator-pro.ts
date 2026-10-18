/**
 * Elite Oscillator Pro
 *
 * A stochastic (or RSI) of the source, clamped between the lower and upper bounds, smoothed by two EMAs and clamped
 * again; an EMA of the oscillator is the signal line (not drawn). The level lines (bounds, overbought, oversold,
 * midline) are plots; a dotted neutral band (two hlines) has a fill. Gradient fills between the oscillator and the
 * midline draw bull humps above and bear humps below it. Dots mark: overbought entries (green, at the upper bound),
 * oversold entries (red, at the lower bound), crosses of the oscillator above its signal line above the midline
 * (orange, at the band top) and entries into the neutral band (magenta, at the midline); the "Zones" dot logic marks
 * every bar in the zone instead of the entries.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Overbought' / 'Oversold' (the oscillator enters the zone),
 * 'Exit Overbought' / 'Exit Oversold' (it leaves it), 'Bullish Momentum' (the orange dot rule) and 'Bearish Momentum'
 * (a cross below the signal line below the midline).
 *
 * Reference: "Elite Oscillator Pro" by Alpha_Wizard
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: © 2026 Not Alpha
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type HLineConfig, type FillConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface EliteOscillatorProInputs {
  calcMode: 'Stochastic' | 'RSI';
  src: SourceType;
  oscLen: number;
  smooth1: number;
  smooth2: number;
  /** Signal line EMA length */
  sigLen: number;
  obLevel: number;
  osLevel: number;
  midLevel: number;
  bandHi: number;
  bandLo: number;
  upBound: number;
  loBound: number;
  useBlackBg: boolean;
  colLine: string;
  /** Oscillator line width (the plot config keeps the default width 2) */
  lineWidth: number;
  colFill: string;
  colFillBear: string;
  colMid: string;
  colBlue: string;
  colTeal: string;
  showBand: boolean;
  dotMode: 'Events' | 'Zones';
  showGreen: boolean;
  showRed: boolean;
  showOrange: boolean;
  showMagenta: boolean;
  colGreen: string;
  colRed: string;
  colOrange: string;
  colMagenta: string;
  /** Dot size (the plot config keeps the default width 3) */
  dotSize: number;
}

export const defaultInputs: EliteOscillatorProInputs = {
  calcMode: 'Stochastic',
  src: 'close',
  oscLen: 14,
  smooth1: 3,
  smooth2: 3,
  sigLen: 9,
  obLevel: 70,
  osLevel: 30,
  midLevel: 50,
  bandHi: 55,
  bandLo: 45,
  upBound: 101,
  loBound: 0,
  useBlackBg: true,
  colLine: '#2979FF',
  lineWidth: 2,
  colFill: '#00E676',
  colFillBear: '#FF1744',
  colMid: '#26A69A',
  colBlue: '#2962FF',
  colTeal: '#00BCD4',
  showBand: true,
  dotMode: 'Events',
  showGreen: true,
  showRed: true,
  showOrange: true,
  showMagenta: true,
  colGreen: '#00E676',
  colRed: '#FF1744',
  colOrange: '#FF9800',
  colMagenta: '#EC407A',
  dotSize: 3,
};

const grpCalc = 'OSCILLATOR ENGINE';
const grpLvl = 'LEVELS';
const grpStyle = 'STYLE';
const grpDots = 'SIGNAL DOTS';

export const inputConfig: InputConfig[] = [
  { id: 'calcMode', type: 'string', title: 'Calculation Mode', defval: 'Stochastic', options: ['Stochastic', 'RSI'], group: grpCalc },
  { id: 'src', type: 'source', title: 'Source', defval: 'close', group: grpCalc },
  { id: 'oscLen', type: 'int', title: 'Length', defval: 14, min: 1, group: grpCalc },
  { id: 'smooth1', type: 'int', title: 'Smoothing 1', defval: 3, min: 1, group: grpCalc },
  { id: 'smooth2', type: 'int', title: 'Smoothing 2', defval: 3, min: 1, group: grpCalc },
  { id: 'sigLen', type: 'int', title: 'Signal Line Length', defval: 9, min: 1, group: grpCalc },
  { id: 'obLevel', type: 'float', title: 'Overbought', defval: 70, group: grpLvl },
  { id: 'osLevel', type: 'float', title: 'Oversold', defval: 30, group: grpLvl },
  { id: 'midLevel', type: 'float', title: 'Midline', defval: 50, group: grpLvl },
  { id: 'bandHi', type: 'float', title: 'Neutral Band Top', defval: 55, group: grpLvl },
  { id: 'bandLo', type: 'float', title: 'Neutral Band Bot', defval: 45, group: grpLvl },
  { id: 'upBound', type: 'float', title: 'Upper Bound', defval: 101, group: grpLvl },
  { id: 'loBound', type: 'float', title: 'Lower Bound', defval: 0, group: grpLvl },
  { id: 'useBlackBg', type: 'bool', title: 'Black Background', defval: true, group: grpStyle },
  { id: 'colLine', type: 'color', title: 'Oscillator Line', defval: '#2979FF', group: grpStyle },
  { id: 'lineWidth', type: 'int', title: 'Line Width', defval: 2, min: 1, max: 5, group: grpStyle },
  { id: 'colFill', type: 'color', title: 'Hump Fill Bull', defval: '#00E676', group: grpStyle },
  { id: 'colFillBear', type: 'color', title: 'Hump Fill Bear', defval: '#FF1744', group: grpStyle },
  { id: 'colMid', type: 'color', title: 'Midline', defval: '#26A69A', group: grpStyle },
  { id: 'colBlue', type: 'color', title: 'OB / OS Lines', defval: '#2962FF', group: grpStyle },
  { id: 'colTeal', type: 'color', title: 'Bound Lines', defval: '#00BCD4', group: grpStyle },
  { id: 'showBand', type: 'bool', title: 'Show Neutral Band Fill', defval: true, group: grpStyle },
  { id: 'dotMode', type: 'string', title: 'Dot Logic', defval: 'Events', options: ['Events', 'Zones'], group: grpDots },
  { id: 'showGreen', type: 'bool', title: 'Green — Overbought', defval: true, group: grpDots },
  { id: 'showRed', type: 'bool', title: 'Red — Oversold', defval: true, group: grpDots },
  { id: 'showOrange', type: 'bool', title: 'Orange — Bullish Momentum', defval: true, group: grpDots },
  { id: 'showMagenta', type: 'bool', title: 'Magenta — Neutral Band', defval: true, group: grpDots },
  { id: 'colGreen', type: 'color', title: 'Green Dot', defval: '#00E676', group: grpDots },
  { id: 'colRed', type: 'color', title: 'Red Dot', defval: '#FF1744', group: grpDots },
  { id: 'colOrange', type: 'color', title: 'Orange Dot', defval: '#FF9800', group: grpDots },
  { id: 'colMagenta', type: 'color', title: 'Magenta Dot', defval: '#EC407A', group: grpDots },
  { id: 'dotSize', type: 'int', title: 'Dot Size', defval: 3, min: 1, max: 6, group: grpDots },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Upper Bound 101', color: '#00BCD4', lineWidth: 1 },
  { id: 'plot1', title: 'Lower Bound 0', color: '#00BCD4', lineWidth: 1 },
  { id: 'plot2', title: 'Overbought 70', color: '#2962FF', lineWidth: 1 },
  { id: 'plot3', title: 'Oversold 30', color: '#2962FF', lineWidth: 1 },
  { id: 'plot4', title: 'Midline 50', color: '#26A69A', lineWidth: 1 },
  { id: 'plot5', title: 'fillTop', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot6', title: 'fillBase', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot7', title: 'fillBearTop', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot8', title: 'fillBearBase', color: 'transparent', lineWidth: 1, display: 'none' },
  { id: 'plot9', title: 'Elite Oscillator', color: '#2979FF', lineWidth: 2 },
  { id: 'plot10', title: 'Green Dots — Overbought', color: '#00E676', lineWidth: 3, style: 'circles' },
  { id: 'plot11', title: 'Red Dots — Oversold', color: '#FF1744', lineWidth: 3, style: 'circles' },
  { id: 'plot12', title: 'Orange Dots — Bull Momentum', color: '#FF9800', lineWidth: 3, style: 'circles' },
  { id: 'plot13', title: 'Magenta Dots — Neutral Band', color: '#EC407A', lineWidth: 3, style: 'circles' },
];

/** hline(bandHi / bandLo, color = color.new(colMid, 65), dotted) with the default inputs */
export const hlineConfig: HLineConfig[] = [
  { id: 'hline_band_top', price: 55, title: 'Band Top 55', color: String(color.new('#26A69A', 65)), linestyle: 'dotted' },
  { id: 'hline_band_bot', price: 45, title: 'Band Bot 45', color: String(color.new('#26A69A', 65)), linestyle: 'dotted' },
];

/** fill(hlHi, hlLo, color.new(colMid, 93)) with the default inputs */
export const fillConfig: FillConfig[] = [
  { id: 'fill_band', plot1: 'hline_band_top', plot2: 'hline_band_bot', color: String(color.new('#26A69A', 93)), title: 'Neutral Band Fill' },
];

export const metadata = {
  title: 'Elite Oscillator Pro',
  shortTitle: 'Elite Oscillator Pro',
  overlay: false,
};

/** Pine float comparisons: a > b only when a - b > 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);

/** math.max(lo, math.min(hi, x)): na when x is na */
const clamp = (x: number, lo: number, hi: number) => (isNaN(x) || isNaN(lo) || isNaN(hi) ? NaN : Math.max(lo, Math.min(hi, x)));

type Point = { time: number; value: number; color?: string };

export function calculate(
  bars: Bar[],
  inputs: Partial<EliteOscillatorProInputs> = {},
): IndicatorResult & { bgColors: BgColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const { upBound, loBound, obLevel, osLevel, midLevel, bandHi, bandLo } = cfg;

  // Core engine (the mode is a constant input: only one of the two calls runs, on every bar)
  const src = getSourceSeries(bars, cfg.src);
  const rawBase = cfg.calcMode === 'Stochastic'
    ? A(ta.stoch(src, S(bars.map((b) => b.high)), S(bars.map((b) => b.low)), cfg.oscLen))
    : A(ta.rsi(src, cfg.oscLen));
  const raw = rawBase.map((x) => clamp(x, loBound, upBound));
  const oscRaw = A(ta.ema(ta.ema(S(raw), cfg.smooth1), cfg.smooth2));
  const osc = oscRaw.map((x) => clamp(x, loBound, upBound));
  const signalRaw = A(ta.ema(S(osc), cfg.sigLen));
  const signal = signalRaw.map((x) => clamp(x, loBound, upBound));

  // Crossings (oakscriptjs: exact comparisons, with the last bar where both values were not na)
  const oscS = S(osc);
  const B = (s: Series) => s.toArray().map((v) => Boolean(v));
  const crossUpSignal = B(ta.crossover(oscS, S(signal)));
  const enterOB = B(ta.crossover(oscS, obLevel));
  const enterOS = B(ta.crossunder(oscS, osLevel));
  const crossBandLo = B(ta.crossover(oscS, bandLo));
  const crossBandHi = B(ta.crossunder(oscS, bandHi));
  const crossDownSignal = B(ta.crossunder(oscS, S(signal)));
  const exitOB = B(ta.crossunder(oscS, obLevel));
  const exitOS = B(ta.crossover(oscS, osLevel));
  const bullFlags: boolean[] = [];
  const bearFlags: boolean[] = [];

  const bgColor = String(color.new('#2a2b2e', 100));
  const bgColors: BgColorData[] = [];
  const names = Array.from({ length: 14 }, (_v, k) => `plot${k}`);
  const plots: Record<string, Point[]> = Object.fromEntries(names.map((k) => [k, [] as Point[]]));
  const obColor = String(color.new(cfg.colBlue, 0));
  const zones = cfg.dotMode === 'Zones';

  for (let i = 0; i < n; i++) {
    const t = bars[i].time as number;
    const o = osc[i];
    const oscAboveMid = gt(o, midLevel);
    const oscInOB = ge(o, obLevel);
    const oscInOS = le(o, osLevel);
    const oscInNeutral = ge(o, bandLo) && le(o, bandHi);
    const enterNeutral = (crossBandLo[i] && le(o, bandHi)) || (crossBandHi[i] && ge(o, bandLo));
    const bullMomentum = crossUpSignal[i] && oscAboveMid;
    // bearMomentum = crossDownSignal and oscBelowMid
    bullFlags.push(bullMomentum);
    bearFlags.push(crossDownSignal[i] && lt(o, midLevel));

    // bgcolor(useBlackBg ? color.new(#2a2b2e, 100) : na)
    if (cfg.useBlackBg) bgColors.push({ time: t, color: bgColor });

    plots.plot0.push({ time: t, value: upBound, color: cfg.colTeal });
    plots.plot1.push({ time: t, value: loBound, color: cfg.colTeal });
    plots.plot2.push({ time: t, value: obLevel, color: obColor });
    plots.plot3.push({ time: t, value: osLevel, color: obColor });
    plots.plot4.push({ time: t, value: midLevel, color: cfg.colMid });
    // math.max(osc, midLevel) / math.min(osc, midLevel): na when osc is na
    plots.plot5.push({ time: t, value: isNaN(o) ? NaN : Math.max(o, midLevel) });
    plots.plot6.push({ time: t, value: midLevel });
    plots.plot7.push({ time: t, value: midLevel });
    plots.plot8.push({ time: t, value: isNaN(o) ? NaN : Math.min(o, midLevel) });
    plots.plot9.push({ time: t, value: o, color: cfg.colLine });

    const greenSig = zones ? oscInOB : enterOB[i];
    const redSig = zones ? oscInOS : enterOS[i];
    const magentaSig = zones ? oscInNeutral : enterNeutral;
    plots.plot10.push({ time: t, value: cfg.showGreen && greenSig ? upBound : NaN, color: cfg.colGreen });
    plots.plot11.push({ time: t, value: cfg.showRed && redSig ? loBound : NaN, color: cfg.colRed });
    plots.plot12.push({ time: t, value: cfg.showOrange && bullMomentum ? bandHi : NaN, color: cfg.colOrange });
    plots.plot13.push({ time: t, value: cfg.showMagenta && magentaSig ? midLevel : NaN, color: cfg.colMagenta });
  }

  const fill = (c: string) => new Array<string>(n).fill(c);
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: 3 },
    plots,
    hlines: [
      { value: bandHi, options: { title: 'Band Top 55', color: String(color.new(cfg.colMid, 65)), linestyle: 'dotted' } },
      { value: bandLo, options: { title: 'Band Bot 45', color: String(color.new(cfg.colMid, 65)), linestyle: 'dotted' } },
    ],
    fills: [
      // fill(hlHi, hlLo, color = showBand ? color.new(colMid, 93) : na)
      { plot1: 'hline_band_top', plot2: 'hline_band_bot', options: { title: 'Neutral Band Fill' },
        colors: fill(cfg.showBand ? String(color.new(cfg.colMid, 93)) : 'transparent') },
      // fill(fillTop, fillBase, top_value = upBound, bottom_value = midLevel, color.new(colFill, 14), color.new(colFill, 92))
      { plot1: 'plot5', plot2: 'plot6', options: { title: 'Hump Gradient Bull' },
        gradient: { topValue: new Array(n).fill(upBound), bottomValue: new Array(n).fill(midLevel),
          topColor: fill(String(color.new(cfg.colFill, 14))), bottomColor: fill(String(color.new(cfg.colFill, 92))) } },
      // fill(fillBearTop, fillBearBase, top_value = midLevel, bottom_value = loBound, color.new(colFillBear, 92), color.new(colFillBear, 14))
      { plot1: 'plot7', plot2: 'plot8', options: { title: 'Hump Gradient Bear' },
        gradient: { topValue: new Array(n).fill(midLevel), bottomValue: new Array(n).fill(loBound),
          topColor: fill(String(color.new(cfg.colFillBear, 92))), bottomColor: fill(String(color.new(cfg.colFillBear, 14))) } },
    ],
    bgColors,
    // alertcondition(enterOB / enterOS / exitOB / exitOS / orangeSig / bearMomentum)
    alerts: alertStates(alertConditions, bars, [enterOB, enterOS, exitOB, exitOS, bullFlags, bearFlags]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Overbought', message: 'Elite Oscillator: entered overbought zone' },
  { id: 'alert1', title: 'Oversold', message: 'Elite Oscillator: entered oversold zone' },
  { id: 'alert2', title: 'Exit Overbought', message: 'Elite Oscillator: exited overbought zone' },
  { id: 'alert3', title: 'Exit Oversold', message: 'Elite Oscillator: exited oversold zone' },
  { id: 'alert4', title: 'Bullish Momentum', message: 'Elite Oscillator: bullish momentum cross above midline' },
  { id: 'alert5', title: 'Bearish Momentum', message: 'Elite Oscillator: bearish momentum cross below midline' },
];

export const EliteOscillatorPro = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  hlineConfig,
  fillConfig,
  alertConditions,
};
