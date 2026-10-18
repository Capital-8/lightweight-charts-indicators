/**
 * MSL Squeeze Pulse
 *
 * Compression ratio = standard deviation of the source / SMA of the bar range (true range or high - low), ranked
 * against its own history with a percent rank: coiled at or below the state percentile, expanded at or above
 * 100 minus it, neutral between. The state is drawn as dots on the zero line, coiled bars tint the background and
 * the bar where the coiled state ends gets a diamond. The pulse is the linear regression of the source minus the
 * middle of the highest high / lowest low channel, in ATR units, drawn as candles from 0: filled while the pulse
 * extends, hollow while it fades.
 *
 * Alerts (alertcondition, `alerts` of the result): 'Coil On' / 'Coil Released' (the coiled state starts / ends) and
 * 'Pulse Flip Up' / 'Pulse Flip Down' (the pulse turns positive / negative).
 *
 * Reference: "MSL Squeeze Pulse" by MarketStructureLab
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 * Original notice: MSL Squeeze Pulse — developed by MarketStructureLab.
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { BgColorData, MarkerData, PlotCandleData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MslSqueezePulseInputs {
  priceSrc: SourceType;
  /** Standard deviation length */
  bandLen: number;
  /** Range SMA, channel, linear regression and ATR length */
  chanLen: number;
  useTR: boolean;
  /** Percent rank lookback of the compression ratio */
  rankLen: number;
  statePct: number;
  showPulse: boolean;
  showState: boolean;
  showBgTint: boolean;
  showRelease: boolean;
  bullColor: string;
  bearColor: string;
  coiledColor: string;
  expandedColor: string;
  neutralColor: string;
}

export const defaultInputs: MslSqueezePulseInputs = {
  priceSrc: 'close',
  bandLen: 20,
  chanLen: 20,
  useTR: true,
  rankLen: 252,
  statePct: 25.0,
  showPulse: true,
  showState: true,
  showBgTint: true,
  showRelease: true,
  bullColor: 'rgb(34, 197, 94)',
  bearColor: 'rgb(239, 68, 68)',
  coiledColor: 'rgb(245, 158, 11)',
  expandedColor: 'rgb(203, 213, 225)',
  neutralColor: 'rgb(71, 85, 105)',
};

export const inputConfig: InputConfig[] = [
  { id: 'priceSrc', type: 'source', title: 'Source', defval: 'close', group: 'Calculation' },
  { id: 'bandLen', type: 'int', title: 'Volatility Length', defval: 20, min: 2, max: 500, group: 'Calculation' },
  { id: 'chanLen', type: 'int', title: 'Channel Length', defval: 20, min: 2, max: 500, group: 'Calculation' },
  { id: 'useTR', type: 'bool', title: 'Use True Range', defval: true, group: 'Calculation' },
  { id: 'rankLen', type: 'int', title: 'Compression Lookback', defval: 252, min: 50, max: 500, group: 'Calculation' },
  { id: 'statePct', type: 'float', title: 'State Percentile', defval: 25.0, min: 1.0, max: 49.0, step: 1.0, group: 'Calculation' },
  { id: 'showPulse', type: 'bool', title: 'Show Pulse Histogram', defval: true, group: 'Visuals' },
  { id: 'showState', type: 'bool', title: 'Show State Markers', defval: true, group: 'Visuals' },
  { id: 'showBgTint', type: 'bool', title: 'Highlight Coil Zones', defval: true, group: 'Visuals' },
  { id: 'showRelease', type: 'bool', title: 'Mark Coil Release', defval: true, group: 'Visuals' },
  { id: 'bullColor', type: 'color', title: 'Bull', defval: 'rgb(34, 197, 94)', group: 'Visuals' },
  { id: 'bearColor', type: 'color', title: 'Bear', defval: 'rgb(239, 68, 68)', group: 'Visuals' },
  { id: 'coiledColor', type: 'color', title: 'Coiled', defval: 'rgb(245, 158, 11)', group: 'Visuals' },
  { id: 'expandedColor', type: 'color', title: 'Expanded', defval: 'rgb(203, 213, 225)', group: 'Visuals' },
  { id: 'neutralColor', type: 'color', title: 'Neutral', defval: 'rgb(71, 85, 105)', group: 'Visuals' },
];

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Coil State', color: 'rgb(71, 85, 105)', lineWidth: 3, style: 'circles' },
];

export const metadata = {
  title: 'MSL Squeeze Pulse',
  shortTitle: 'MSL Sqz',
  overlay: false,
  precision: 2,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
const eq = (a: number, b: number) => !isNaN(a) && !isNaN(b) && Math.abs(a - b) <= EPS;
/** safeDiv(a, b) => b == 0 or na(b) ? 0.0 : a / b (na() is true for +-infinity) */
const safeDiv = (a: number, b: number) => (eq(b, 0) || !Number.isFinite(b) ? 0.0 : a / b);

export function calculate(
  bars: Bar[],
  inputs: Partial<MslSqueezePulseInputs> = {},
): Omit<IndicatorResult, 'markers'> & {
  markers: MarkerData[]; bgColors: BgColorData[]; plotCandles: Record<string, PlotCandleData[]>;
} & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);

  const src = A(getSourceSeries(bars, cfg.priceSrc));
  const dispersion = A(ta.stdev(S(src), cfg.bandLen));
  const barRng = cfg.useTR ? A(ta.tr(bars, true)) : bars.map((b) => b.high - b.low);
  const travel = A(ta.sma(S(barRng), cfg.chanLen));
  const sqRatio = dispersion.map((d, i) => safeDiv(d, travel[i]));
  const sqRank = A(ta.percentrank(S(sqRatio), cfg.rankLen));
  const coiled = sqRank.map((r) => !isNaN(r) && le(r, cfg.statePct));
  const expanded = sqRank.map((r) => !isNaN(r) && ge(r, 100.0 - cfg.statePct));

  const hh = A(ta.highest(S(bars.map((b) => b.high)), cfg.chanLen));
  const ll = A(ta.lowest(S(bars.map((b) => b.low)), cfg.chanLen));
  const atrRef = A(ta.atr(bars, cfg.chanLen));
  const diff = src.map((s, i) => s - (hh[i] + ll[i]) / 2);
  const pulseFit = A(ta.linreg(S(diff), cfg.chanLen, 0));
  const pulseVal = pulseFit.map((p, i) => safeDiv(p, atrRef[i]));

  const nz = (v: number) => (Number.isFinite(v) ? v : 0);
  const releaseColor = String(color.new(cfg.coiledColor, 0));
  const bgTint = String(color.new(cfg.coiledColor, 88));
  const candles: PlotCandleData[] = [];
  const bgColors: BgColorData[] = [];
  const markers: MarkerData[] = [];
  const statePoints: { time: number; value: number; color: string }[] = [];
  const coilOn = new Array<boolean>(n).fill(false);
  const coilOff = new Array<boolean>(n).fill(false);
  const flipUp = new Array<boolean>(n).fill(false);
  const flipDown = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const t = bars[i].time;
    const pv = pulseVal[i];
    const prev = i > 0 ? nz(pulseVal[i - 1]) : 0;
    const isUpPulse = gt(pv, 0);
    const accelPulse = isUpPulse ? gt(pv, prev) : lt(pv, prev);
    const baseColor = isUpPulse ? cfg.bullColor : cfg.bearColor;
    const border = cfg.showPulse ? baseColor : 'transparent';
    const body = cfg.showPulse ? (accelPulse ? baseColor : String(color.new(baseColor, 100))) : 'transparent';
    // plotcandle(0.0, math.max(0.0, pulseVal), math.min(0.0, pulseVal), pulseVal): while pulseVal is na the open is
    // 0 and the high / low / close are na (no candle drawn)
    candles.push({ time: t, open: 0.0, high: Math.max(0.0, pv), low: Math.min(0.0, pv), close: pv, color: body, borderColor: border, wickColor: border });

    const stateColor = coiled[i] ? cfg.coiledColor : expanded[i] ? cfg.expandedColor : cfg.neutralColor;
    statePoints.push({ time: t, value: cfg.showState ? 0.0 : NaN, color: stateColor });

    if (cfg.showBgTint && coiled[i]) bgColors.push({ time: t, color: bgTint });

    // coilReleased = (not coiled) and coiled[1]
    const coilReleased = !coiled[i] && i > 0 && coiled[i - 1];
    // coilOn = coiled and not coiled[1]; pulseFlipUp = pulseVal > 0 and nz(pulseVal[1]) <= 0 (and Down likewise)
    coilOn[i] = coiled[i] && !(i > 0 && coiled[i - 1]);
    coilOff[i] = coilReleased;
    flipUp[i] = gt(pv, 0) && le(prev, 0);
    flipDown[i] = lt(pv, 0) && ge(prev, 0);
    if (cfg.showRelease && coilReleased) {
      markers.push({ time: t, position: 'atPriceMiddle', price: 0.0, shape: 'diamond', color: releaseColor, size: 'small' });
    }
  }

  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay, precision: metadata.precision },
    plots: { plot0: statePoints },
    hlines: [
      { value: 0, options: { title: 'Zero', color: String(color.new(color.gray, 75)), linestyle: 'dashed' } },
      { value: 1, options: { title: 'Plus one ATR', color: String(color.new(color.gray, 85)), linestyle: 'dashed' } },
      { value: -1, options: { title: 'Minus one ATR', color: String(color.new(color.gray, 85)), linestyle: 'dashed' } },
    ],
    bgColors,
    markers,
    plotCandles: { pulse: candles },
    alerts: alertStates(alertConditions, bars, [coilOn, coilOff, flipUp, flipDown]),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'Coil On', message: '{{ticker}} compression ratio entered its coiled percentile on {{interval}}' },
  { id: 'alert1', title: 'Coil Released', message: '{{ticker}} compression ratio left its coiled percentile on {{interval}}' },
  { id: 'alert2', title: 'Pulse Flip Up', message: '{{ticker}} pulse flipped positive on {{interval}}' },
  { id: 'alert3', title: 'Pulse Flip Down', message: '{{ticker}} pulse flipped negative on {{interval}}' },
];

export const MslSqueezePulse = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
