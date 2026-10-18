/**
 * MACD Overlay v1
 *
 * MACD drawn on the price: a ribbon between the fast and slow averages (Classic: EMA / SMA of the source; VW: rolling
 * VWAPs of `vwapSrc`), filled with the MACD sign colour (stronger while the histogram rises), and the candles tinted
 * the same way. Compare mode adds the VW pair as a ghost ribbon. Optional channel: slow +- k * |MACD|.
 * MACD / signal crosses give triangles, filtered by two adaptive gates built from 100-bar means and stdevs:
 * - Weakness-Lite: at least 2 of RVOL deficit, effort vs result failure (high volume z, low body efficiency),
 *   extension from the slow VWAP in ATR with low RVOL, and (Strict) wick pressure; a 2-bar cooldown debounces it.
 *   Weak bars get circles above (up bar) or below (down bar).
 * - Expansion-Only: the ribbon is tight and the histogram flat (squeeze) while the true range bursts at a histogram
 *   slope flip or near a cross (release).
 * Crosses blocked by a gate are gray dots; with the weakness gate off, weak crosses are faded triangles.
 * Alerts (alertcondition, `alerts` of the result): 'MACD Signal Cross Up' / 'MACD Signal Cross Down' (any cross while
 * the signals are shown, whatever the gates) and 'Weakness-Lite Flag' (a Weakness-Lite bar).
 *
 * Reference: "MACD Overlay v1 [JopAlgo]" by JopAlgo
 * Licence: Mozilla Public License 2.0, as the original Pine script (https://mozilla.org/MPL/2.0/).
 */

import { ta, Series, getSourceSeries, color, type IndicatorResult, type InputConfig, type PlotConfig, type Bar, type SourceType } from 'oakscriptjs';
import type { MarkerData, BarColorData } from '../types';
import { alertStates, type AlertConditionDecl, type AlertConditionState } from '../alert-states';

export interface MacdOverlayV1Inputs {
  /** Calculation mode: Classic (MA MACD), VW (rolling VWAP MACD) or Compare (Classic + VW ghost ribbon) */
  calcMode: 'Classic' | 'VW' | 'Compare';
  showSignals: boolean;
  /** Hide weak crosses (Weakness-Lite gate) */
  gateByWeak: boolean;
  /** Triangles only when the cross comes with an expansion out of a squeeze */
  expansionOnlyOn: boolean;
  weakSensitivity: 'Off' | 'Auto' | 'Strict';
  showRibbon: boolean;
  showBarTint: boolean;
  showWeakMk: boolean;
  /** Only evaluate weakness near signals and histogram slope flips */
  weakOnlyOnSignals: boolean;
  showChannel: boolean;
  channelK: number;
  stylePreset: 'Subtle' | 'Normal' | 'Bold';
  fastLen: number;
  slowLen: number;
  sigLen: number;
  src: SourceType;
  maType: 'SMA' | 'EMA';
  sigType: 'SMA' | 'EMA';
  vwapSrc: SourceType;
  vwapFastL: number;
  vwapSlowL: number;
}

export const defaultInputs: MacdOverlayV1Inputs = {
  calcMode: 'Classic',
  showSignals: true,
  gateByWeak: true,
  expansionOnlyOn: true,
  weakSensitivity: 'Auto',
  showRibbon: true,
  showBarTint: true,
  showWeakMk: true,
  weakOnlyOnSignals: false,
  showChannel: false,
  channelK: 0.75,
  stylePreset: 'Normal',
  fastLen: 12,
  slowLen: 26,
  sigLen: 9,
  src: 'close',
  maType: 'EMA',
  sigType: 'EMA',
  vwapSrc: 'hlc3',
  vwapFastL: 12,
  vwapSlowL: 26,
};

export const inputConfig: InputConfig[] = [
  { id: 'calcMode', type: 'string', title: 'Calculation Mode', defval: 'Classic', options: ['Classic', 'VW', 'Compare'], group: 'Mode' },
  { id: 'showSignals', type: 'bool', title: 'Show Signal Cross Markers', defval: true, group: 'Signals' },
  { id: 'gateByWeak', type: 'bool', title: 'Gate triangles by Weakness', defval: true, group: 'Signals' },
  { id: 'expansionOnlyOn', type: 'bool', title: 'Expansion-Only (Impulse/Squeeze)', defval: true, group: 'Signals' },
  { id: 'weakSensitivity', type: 'string', title: 'Sensitivity', defval: 'Auto', options: ['Off', 'Auto', 'Strict'], group: 'Weakness' },
  { id: 'showRibbon', type: 'bool', title: 'Show Ribbon (Fast vs Slow)', defval: true, group: 'Display' },
  { id: 'showBarTint', type: 'bool', title: 'Show Candle Tint', defval: true, group: 'Display' },
  { id: 'showWeakMk', type: 'bool', title: 'Show Weakness Markers', defval: true, group: 'Display' },
  { id: 'weakOnlyOnSignals', type: 'bool', title: 'Only evaluate Weakness on signal bars', defval: false, group: 'Advanced' },
  { id: 'showChannel', type: 'bool', title: 'Show Channel (k × |MACD| of primary)', defval: false, group: 'Advanced' },
  { id: 'channelK', type: 'float', title: 'Channel Multiplier k', defval: 0.75, step: 0.05, min: 0.0, group: 'Advanced' },
  { id: 'stylePreset', type: 'string', title: 'Style Preset', defval: 'Normal', options: ['Subtle', 'Normal', 'Bold'], group: 'Advanced' },
  { id: 'fastLen', type: 'int', title: 'Fast Length', defval: 12, min: 1, group: 'Classic MACD' },
  { id: 'slowLen', type: 'int', title: 'Slow Length', defval: 26, min: 1, group: 'Classic MACD' },
  { id: 'sigLen', type: 'int', title: 'Signal Smoothing', defval: 9, min: 1, group: 'Classic MACD' },
  { id: 'src', type: 'source', title: 'Source (Classic)', defval: 'close', group: 'Classic MACD' },
  { id: 'maType', type: 'string', title: 'Oscillator MA Type', defval: 'EMA', options: ['SMA', 'EMA'], group: 'Classic MACD' },
  { id: 'sigType', type: 'string', title: 'Signal Line MA Type', defval: 'EMA', options: ['SMA', 'EMA'], group: 'Classic MACD' },
  { id: 'vwapSrc', type: 'source', title: 'VWAP Source', defval: 'hlc3', group: 'Rolling VWAP (value baseline)' },
  { id: 'vwapFastL', type: 'int', title: 'RVWAP Fast Length', defval: 12, min: 2, group: 'Rolling VWAP (value baseline)' },
  { id: 'vwapSlowL', type: 'int', title: 'RVWAP Slow Length', defval: 26, min: 2, group: 'Rolling VWAP (value baseline)' },
];

const BULL_BASE = String(color.rgb(38, 166, 154));
const BEAR_BASE = String(color.rgb(255, 82, 82));
const GHOST_TEAL = String(color.new(color.teal, 0));
const GHOST_PINK = String(color.new(color.fuchsia, 0));
const NOTE_DOT = String(color.new(color.gray, 0));
const FAST_COL = String(color.new(color.aqua, 0));
const SLOW_COL = String(color.new(color.orange, 0));

export const plotConfig: PlotConfig[] = [
  { id: 'plot0', title: 'Primary Fast', color: FAST_COL, lineWidth: 1 },
  { id: 'plot1', title: 'Primary Slow', color: SLOW_COL, lineWidth: 1 },
  { id: 'plot2', title: 'Ghost Fast (VW-MACD)', color: GHOST_TEAL, lineWidth: 1 },
  { id: 'plot3', title: 'Ghost Slow (VW-MACD)', color: GHOST_PINK, lineWidth: 1 },
  { id: 'plot4', title: 'Channel Upper', color: NOTE_DOT, lineWidth: 1 },
  { id: 'plot5', title: 'Channel Lower', color: NOTE_DOT, lineWidth: 1 },
];

export const metadata = {
  title: 'MACD Overlay v1 [JopAlgo]',
  shortTitle: 'MACDOV1',
  overlay: true,
};

/** Pine float comparisons: a > b only when a - b > 1e-10, a == b within 1e-10 (na compares false) */
const EPS = 1e-10;
const gt = (a: number, b: number) => a - b > EPS;
const lt = (a: number, b: number) => b - a > EPS;
const ge = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(b - a > EPS);
const le = (a: number, b: number) => !isNaN(a) && !isNaN(b) && !(a - b > EPS);
/** Pine math.min / math.max: na with an na argument */
const min = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.min(a, b));
const max = (a: number, b: number) => (isNaN(a) || isNaN(b) ? NaN : Math.max(a, b));

/** Style preset transparencies */
const PRESETS = {
  Subtle: { fillStrongTr: 80, fillWeakTr: 92, barExpTr: 90, barConTr: 94, ghostAlpha: 85, weakFadeTr: 70 },
  Bold: { fillStrongTr: 60, fillWeakTr: 78, barExpTr: 75, barConTr: 88, ghostAlpha: 80, weakFadeTr: 40 },
  Normal: { fillStrongTr: 70, fillWeakTr: 88, barExpTr: 85, barConTr: 92, ghostAlpha: 85, weakFadeTr: 60 },
};

export function calculate(
  bars: Bar[],
  inputs: Partial<MacdOverlayV1Inputs> = {},
): Omit<IndicatorResult, 'markers'> & { markers: MarkerData[]; barColors: BarColorData[] } & { alerts: AlertConditionState[] } {
  const cfg = { ...defaultInputs, ...inputs };
  const n = bars.length;
  const A = (s: Series) => s.toArray().map((v) => v ?? NaN);
  const S = (a: number[]) => Series.fromArray(bars, a);
  const style = cfg.stylePreset === 'Subtle' ? PRESETS.Subtle : cfg.stylePreset === 'Bold' ? PRESETS.Bold : PRESETS.Normal;

  // f_ma(x, l, _type) => _type == "SMA" ? ta.sma(x, l) : ta.ema(x, l) (the type is a constant input)
  const fMa = (x: number[], l: number, type: string) => A(type === 'SMA' ? ta.sma(S(x), l) : ta.ema(S(x), l));
  const volume = bars.map((b) => b.volume ?? NaN);
  // f_rvwap: sma(src * volume, len) * len / (sma(volume, len) * len); na when the volume sum is 0 or na
  const fRvwap = (src: number[], len: number) => {
    const volMean = A(ta.sma(S(volume), len));
    const pvMean = A(ta.sma(S(src.map((x, i) => x * volume[i])), len));
    return volMean.map((vm, i) => {
      const volSum = isNaN(vm) ? NaN : vm * len;
      const pvSum = isNaN(pvMean[i]) ? NaN : pvMean[i] * len;
      return !isNaN(volSum) && Math.abs(volSum) > EPS && !isNaN(pvSum) ? pvSum / volSum : NaN;
    });
  };

  // Core MACD
  const src = A(getSourceSeries(bars, cfg.src));
  const fastMaC = fMa(src, cfg.fastLen, cfg.maType);
  const slowMaC = fMa(src, cfg.slowLen, cfg.maType);
  const macdC = fastMaC.map((f, i) => f - slowMaC[i]);
  const signalC = fMa(macdC, cfg.sigLen, cfg.sigType);
  // VW-MACD
  const vwapSrc = A(getSourceSeries(bars, cfg.vwapSrc));
  const fastVW = fRvwap(vwapSrc, cfg.vwapFastL);
  const slowVW = fRvwap(vwapSrc, cfg.vwapSlowL);
  const macdV = fastVW.map((f, i) => f - slowVW[i]);
  const signalV = fMa(macdV, cfg.sigLen, cfg.sigType);

  const isCompare = cfg.calcMode === 'Compare';
  const classicPrimary = cfg.calcMode === 'Classic' || isCompare;
  const macdP = classicPrimary ? macdC : macdV;
  const signalP = classicPrimary ? signalC : signalV;
  const histP = macdP.map((m, i) => m - signalP[i]);
  const fastP = classicPrimary ? fastMaC : fastVW;
  const slowP = classicPrimary ? slowMaC : slowVW;

  // Ribbon state
  const isBull = macdP.map((m) => ge(m, 0.0));
  const isExpanding = histP.map((h, i) => i > 0 && gt(h, histP[i - 1]));
  const expFlip = isExpanding.map((e, i) => (i > 0 ? e !== isExpanding[i - 1] : false));

  // Crosses: a > b and a[1] <= b[1] (crossover); a < b and a[1] >= b[1] (crossunder), compared exactly (no 1e-10 tolerance)
  const crossUp = macdP.map((m, i) => i > 0 && m > signalP[i] && macdP[i - 1] <= signalP[i - 1]);
  const crossDown = macdP.map((m, i) => i > 0 && m < signalP[i] && macdP[i - 1] >= signalP[i - 1]);
  const signalProx = crossUp.map((c, i) => c || crossDown[i] || (i > 0 && (crossUp[i - 1] || crossDown[i - 1])));

  // Weakness-Lite measures
  const useWeak = cfg.weakSensitivity !== 'Off';
  const isStrict = cfg.weakSensitivity === 'Strict';
  const volLen = 100;
  // f_tr(): prev = nz(close[1], close)
  const tr = bars.map((b, i) => {
    const prev = i > 0 && !isNaN(bars[i - 1].close) ? bars[i - 1].close : b.close;
    return max(b.high - b.low, max(Math.abs(b.high - prev), Math.abs(b.low - prev)));
  });
  const atr = A(ta.atr(bars, 14));
  const rvMean = A(ta.sma(S(volume), 20));
  const rvol = volume.map((v, i) => (gt(rvMean[i], 0) ? v / rvMean[i] : 1.0));
  const volMean = A(ta.sma(S(volume), volLen));
  const volSd = A(ta.stdev(S(volume), volLen));
  // f_z(x, mean, sd) => sd > 0 ? (x - mean) / sd : 0.0
  const zVol = volume.map((v, i) => (gt(volSd[i], 0) ? (v - volMean[i]) / volSd[i] : 0.0));
  const bodyEff = bars.map((b, i) => (gt(tr[i], 0) ? Math.abs(b.close - b.open) / tr[i] : 0.0));
  const beMean = A(ta.sma(S(bodyEff), volLen));
  const beSd = A(ta.stdev(S(bodyEff), volLen));
  const valueBase = slowVW.map((v, i) => (isNaN(v) ? slowMaC[i] : v));
  const distATR = bars.map((b, i) => (gt(atr[i], 0) && !isNaN(valueBase[i]) ? Math.abs(b.close - valueBase[i]) / atr[i] : 0.0));
  const dMean = A(ta.sma(S(distATR), volLen));
  const dSd = A(ta.stdev(S(distATR), volLen));
  const rvolMean = A(ta.sma(S(rvol), volLen));
  const rvolSd = A(ta.stdev(S(rvol), volLen));

  // Expansion-Only measures
  const atrSafe = atr.map((a) => (gt(a, 0) ? a : 1.0));
  const spreadNorm = fastP.map((f, i) => (gt(atrSafe[i], 0) ? Math.abs(f - slowP[i]) / atrSafe[i] : 0.0));
  const spreadMean = A(ta.sma(S(spreadNorm), volLen));
  const spreadSd = A(ta.stdev(S(spreadNorm), volLen));
  const histDelta = histP.map((h, i) => (i > 0 ? Math.abs(h - histP[i - 1]) : NaN));
  const hDeltaMean = A(ta.sma(S(histDelta), volLen));
  const hDeltaSd = A(ta.stdev(S(histDelta), volLen));
  const burstNorm = tr.map((t, i) => (gt(atrSafe[i], 0) ? t / atrSafe[i] : 0.0));
  const burstMean = A(ta.sma(S(burstNorm), volLen));
  const burstSd = A(ta.stdev(S(burstNorm), volLen));

  const markers: MarkerData[] = [];
  const barColors: BarColorData[] = [];
  const fillColors: string[] = new Array(n);
  const ghostColors: string[] = new Array(n);
  const fadeUpCol = String(color.new(BULL_BASE, style.weakFadeTr));
  const fadeDownCol = String(color.new(BEAR_BASE, style.weakFadeTr));
  const flags: boolean[][] = [[], [], []];
  let weakCD = 0; // var int weakCD = 0
  for (let i = 0; i < n; i++) {
    const b = bars[i];
    const t = b.time;
    const base = isBull[i] ? BULL_BASE : BEAR_BASE;
    // fill(pFast, pSlow, color = showRibbon ? color.new(base, isExpanding ? fillStrongTr : fillWeakTr) : na)
    fillColors[i] = cfg.showRibbon ? String(color.new(base, isExpanding[i] ? style.fillStrongTr : style.fillWeakTr)) : 'transparent';
    // ghostFill = color.new(nz(macd_v) >= 0 ? bullBase : bearBase, ghostAlpha), drawn in Compare mode
    const mv = isNaN(macdV[i]) ? 0 : macdV[i];
    ghostColors[i] = isCompare ? String(color.new(ge(mv, 0) ? BULL_BASE : BEAR_BASE, style.ghostAlpha)) : 'transparent';
    // barcolor(showBarTint ? color.new(base, isExpanding ? barExpTr : barConTr) : na)
    if (cfg.showBarTint) barColors.push({ time: t, color: String(color.new(base, isExpanding[i] ? style.barExpTr : style.barConTr)) });

    // Weakness rules
    const rvFloorAuto = min(1.0, rvolMean[i] + -0.385 * rvolSd[i]);
    const beLowAuto = beMean[i] + -0.674 * beSd[i];
    const dHighAuto = dMean[i] + (isStrict ? 0.842 : 0.674) * dSd[i];
    const ruleRVOL = lt(rvol[i], isStrict ? min(1.0, rvFloorAuto + 0.05) : rvFloorAuto);
    const ruleEVR = ge(zVol[i], isStrict ? 0.8 : 0.524) && le(bodyEff[i], beLowAuto);
    const ruleEXT = gt(distATR[i], dHighAuto) && lt(rvol[i], 1.0);
    const upperW = b.high - Math.max(b.open, b.close);
    const lowerW = Math.min(b.open, b.close) - b.low;
    const upBar = ge(b.close, b.open);
    const dirWickFrac = gt(tr[i], 0) ? (upBar ? upperW / tr[i] : lowerW / tr[i]) : 0.0;
    const ruleWICK = isStrict && ge(dirWickFrac, 0.40);
    const weakCount = (ruleRVOL ? 1 : 0) + (ruleEVR ? 1 : 0) + (ruleEXT ? 1 : 0) + (ruleWICK ? 1 : 0);
    const isWeakRaw = useWeak && weakCount >= 2;
    const considerBar = !cfg.weakOnlyOnSignals || signalProx[i] || expFlip[i];
    const isWeakPre = considerBar && isWeakRaw;
    // Debounce: 2-bar cooldown unless near a cross
    weakCD = Math.max(weakCD - 1, 0);
    const isWeakLite = (weakCD === 0 && isWeakPre) || (signalProx[i] && isWeakPre);
    weakCD = isWeakLite ? 2 : weakCD;

    // Expansion-Only gate
    const tightThresh = spreadMean[i] + -0.385 * spreadSd[i];
    const flatThresh = hDeltaMean[i] + -0.385 * hDeltaSd[i];
    const burstThresh = burstMean[i] + (isStrict ? 0.842 : 0.524) * burstSd[i];
    const squeezeCond = le(spreadNorm[i], tightThresh) && le(histDelta[i], flatThresh);
    const releaseCond = ge(burstNorm[i], burstThresh) && (expFlip[i] || signalProx[i]);
    const expansionOk = cfg.expansionOnlyOn ? squeezeCond && releaseCond : true;

    const eligibleLong = cfg.showSignals && crossUp[i] && expansionOk;
    const eligibleShort = cfg.showSignals && crossDown[i] && expansionOk;
    const solidUp = eligibleLong && (cfg.gateByWeak ? !isWeakLite : true);
    const solidDown = eligibleShort && (cfg.gateByWeak ? !isWeakLite : true);
    const fadeUp = eligibleLong && !cfg.gateByWeak && isWeakLite;
    const fadeDown = eligibleShort && !cfg.gateByWeak && isWeakLite;
    const dotUp = (cfg.showSignals && crossUp[i] && !expansionOk) || (cfg.showSignals && crossUp[i] && expansionOk && cfg.gateByWeak && isWeakLite);
    const dotDown = (cfg.showSignals && crossDown[i] && !expansionOk) || (cfg.showSignals && crossDown[i] && expansionOk && cfg.gateByWeak && isWeakLite);

    // alertcondition(showSignals and crossUp / crossDown, ...), alertcondition(weakSensitivity != "Off" and isWeakLite, ...)
    flags[0].push(cfg.showSignals && crossUp[i]);
    flags[1].push(cfg.showSignals && crossDown[i]);
    flags[2].push(useWeak && isWeakLite);

    // plotshape calls in Pine order, all size.tiny (ids shape0..shape7 in declaration order)
    if (useWeak && cfg.showWeakMk && isWeakLite && upBar) markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: BEAR_BASE, size: 'tiny', id: 'shape0' });
    if (useWeak && cfg.showWeakMk && isWeakLite && !upBar) markers.push({ time: t, position: 'belowBar', shape: 'circle', color: BULL_BASE, size: 'tiny', id: 'shape1' });
    if (solidUp) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: BULL_BASE, size: 'tiny', id: 'shape2' });
    if (solidDown) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: BEAR_BASE, size: 'tiny', id: 'shape3' });
    if (fadeUp) markers.push({ time: t, position: 'belowBar', shape: 'triangleUp', color: fadeUpCol, size: 'tiny', id: 'shape4' });
    if (fadeDown) markers.push({ time: t, position: 'aboveBar', shape: 'triangleDown', color: fadeDownCol, size: 'tiny', id: 'shape5' });
    if (dotUp) markers.push({ time: t, position: 'belowBar', shape: 'circle', color: NOTE_DOT, size: 'tiny', id: 'shape6' });
    if (dotDown) markers.push({ time: t, position: 'aboveBar', shape: 'circle', color: NOTE_DOT, size: 'tiny', id: 'shape7' });
  }

  const P = (vals: (i: number) => number, col: string) => bars.map((b, i) => ({ time: b.time, value: vals(i), color: col }));
  return {
    metadata: { title: metadata.title, shorttitle: metadata.shortTitle, overlay: metadata.overlay },
    plots: {
      plot0: P((i) => (cfg.showRibbon ? fastP[i] : NaN), FAST_COL),
      plot1: P((i) => (cfg.showRibbon ? slowP[i] : NaN), SLOW_COL),
      plot2: P((i) => (isCompare ? fastVW[i] : NaN), GHOST_TEAL),
      plot3: P((i) => (isCompare ? slowVW[i] : NaN), GHOST_PINK),
      // Channel: slow_p +- channelK * |macd_p|
      plot4: P((i) => (cfg.showChannel ? slowP[i] + cfg.channelK * Math.abs(macdP[i]) : NaN), NOTE_DOT),
      plot5: P((i) => (cfg.showChannel ? slowP[i] - cfg.channelK * Math.abs(macdP[i]) : NaN), NOTE_DOT),
    },
    fills: [
      { plot1: 'plot0', plot2: 'plot1', options: { title: 'Primary Ribbon Fill' }, colors: fillColors },
      { plot1: 'plot2', plot2: 'plot3', options: { title: 'Ghost Ribbon Fill' }, colors: ghostColors },
    ],
    markers,
    barColors,
    alerts: alertStates(alertConditions, bars, flags),
  };
}

/** The original's alertconditions */
export const alertConditions: AlertConditionDecl[] = [
  { id: 'alert0', title: 'MACD Signal Cross Up', message: 'MACD crossed above Signal (primary).' },
  { id: 'alert1', title: 'MACD Signal Cross Down', message: 'MACD crossed below Signal (primary).' },
  { id: 'alert2', title: 'Weakness-Lite Flag', message: 'Weakness-Lite triggered on this bar.' },
];

export const MacdOverlayV1 = {
  calculate,
  metadata,
  defaultInputs,
  inputConfig,
  plotConfig,
  alertConditions,
};
